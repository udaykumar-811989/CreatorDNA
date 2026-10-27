import {
  AiProviderConfig,
  analyzeContent,
  CreatorAiError,
  CreatorAiMedia,
  CreatorContentInput,
  createAiProvider,
  createGeminiUploadSession,
  forwardGeminiUploadChunk,
  isBase64Shape,
  isGeminiFileUri,
  parseChatAttachment,
  parseUploadInitRequest,
  validateContentAnalysis,
} from '../_shared/creatorAi.ts';

type FunctionConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  appWebOrigin: string;
  aiWebOrigin: string | null;
  aiEndpoint: string | null;
  aiApiKey: string | null;
  aiModel: string | null;
};

type DbJob = {
  jobId: string;
  contentId: string;
  status: string;
  errorCode: string | null;
  content: Record<string, unknown>;
  analysis: unknown;
  media?: CreatorAiMedia | null;
};

const mediaMaxBase64Length = 4_000_000;
const allowedMediaTypes: Record<CreatorAiMedia['kind'], readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac'],
};

const metricKeys = [
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'watchTimeSeconds',
  'retentionPercent',
] as const;

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function optional(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}

function getConfig(): FunctionConfig {
  const supabaseUrl = required('SUPABASE_URL').replace(/\/+$/, '');
  const supabaseEndpoint = new URL(supabaseUrl);
  if (
    supabaseEndpoint.protocol !== 'https:' &&
    supabaseEndpoint.hostname !== 'localhost'
  ) {
    throw new Error('SUPABASE_URL must use HTTPS.');
  }

  const appWebOrigin = required('APP_WEB_ORIGIN');
  const appUrl = new URL(appWebOrigin);
  if (
    appUrl.origin !== appWebOrigin.replace(/\/$/, '') ||
    (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost')
  ) {
    throw new Error('APP_WEB_ORIGIN must be an HTTPS origin or localhost.');
  }

  const aiWebOriginValue = optional('AI_WEB_ORIGIN');
  let aiWebOrigin: string | null = null;
  if (aiWebOriginValue) {
    const aiWebUrl = new URL(aiWebOriginValue);
    if (
      aiWebUrl.origin !== aiWebOriginValue.replace(/\/$/, '') ||
      (aiWebUrl.protocol !== 'https:' && aiWebUrl.hostname !== 'localhost')
    ) {
      throw new Error('AI_WEB_ORIGIN must be an HTTPS origin or localhost.');
    }
    aiWebOrigin = aiWebUrl.origin;
  }

  const aiEndpoint = optional('AI_API_URL');
  if (aiEndpoint) {
    const aiUrl = new URL(aiEndpoint);
    if (
      aiUrl.protocol !== 'https:' &&
      aiUrl.hostname !== 'localhost' &&
      aiUrl.hostname !== '127.0.0.1'
    ) {
      throw new Error('AI_API_URL must use HTTPS.');
    }
  }

  return {
    supabaseUrl,
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    appWebOrigin: appUrl.origin,
    aiWebOrigin,
    aiEndpoint,
    aiApiKey: optional('AI_API_KEY'),
    aiModel: optional('AI_MODEL_FAST'),
  };
}

function responseHeaders(
  origin: string | null,
  allowedOrigins: readonly string[],
): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
  });
  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  try {
    const url = new URL(origin);
    return url.origin === origin &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Headers,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

async function getAuthenticatedUser(
  request: Request,
  config: FunctionConfig,
): Promise<string | null> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [^\s]+$/i.test(authorization)) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('auth_unavailable');
  }
  if (!response.ok) {
    return null;
  }

  let user: unknown;
  try {
    user = await response.json();
  } catch {
    throw new Error('auth_unavailable');
  }
  return isRecord(user) && isUuid(user.id) ? user.id : null;
}

async function supabaseRpc<T>(
  config: FunctionConfig,
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `${config.supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error('database_unavailable');
  }
  if (!response.ok) {
    console.error(`Creator AI database RPC failed: ${functionName} (${response.status}).`);
    throw new Error('database_unavailable');
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error('database_invalid_response');
  }
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new Error(`invalid_${field}`);
  }
  return value.trim() || null;
}

function parseMetrics(value: unknown): Record<string, number> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error('invalid_metrics');
  }

  const metrics: Record<string, number> = {};
  for (const [key, metric] of Object.entries(value)) {
    if (!metricKeys.some((allowedKey) => allowedKey === key)) {
      throw new Error('invalid_metrics');
    }
    if (typeof metric !== 'number' || !Number.isFinite(metric) || metric < 0) {
      throw new Error('invalid_metrics');
    }
    if (
      ['views', 'reach', 'likes', 'comments', 'shares', 'saves'].includes(key) &&
      !Number.isSafeInteger(metric)
    ) {
      throw new Error('invalid_metrics');
    }
    if (key === 'retentionPercent' && metric > 100) {
      throw new Error('invalid_metrics');
    }
    metrics[toSnakeCase(key)] = metric;
  }
  return metrics;
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function parseContentRequest(value: unknown): {
  idempotencyKey: string;
  content: CreatorContentInput;
  media: CreatorAiMedia | null;
} {
  if (!isRecord(value)) {
    throw new Error('invalid_request');
  }
  const idempotencyKey = value.idempotencyKey;
  if (
    typeof idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)
  ) {
    throw new Error('invalid_idempotency_key');
  }
  const title = optionalText(value.title, 'title', 200);
  const transcript = optionalText(value.transcript, 'transcript', 20_000);
  const caption = optionalText(value.caption, 'caption', 10_000);
  const topic = optionalText(value.topic, 'topic', 300);
  const format = optionalText(value.format, 'format', 100);
  if (!title) {
    throw new Error('invalid_title');
  }
  const media = parseMedia(value.media);
  if (!transcript && !caption && !topic && !media) {
    throw new Error('content_text_required');
  }

  const durationSeconds = value.durationSeconds ?? null;
  if (
    durationSeconds !== null &&
    (typeof durationSeconds !== 'number' ||
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 3600)
  ) {
    throw new Error('invalid_duration');
  }

  const publishedAt = optionalText(value.publishedAt, 'published_at', 40);
  if (publishedAt && (!Number.isFinite(Date.parse(publishedAt)))) {
    throw new Error('invalid_published_at');
  }

  return {
    idempotencyKey,
    content: {
      title,
      transcript,
      caption,
      topic,
      format,
      durationSeconds,
      publishedAt,
      metrics: parseMetrics(value.metrics),
    },
    media,
  };
}

function parseMedia(value: unknown): CreatorAiMedia | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    (value.kind !== 'image' && value.kind !== 'video' && value.kind !== 'audio') ||
    typeof value.mimeType !== 'string' ||
    !allowedMediaTypes[value.kind].includes(value.mimeType)
  ) {
    throw new Error('invalid_media');
  }
  // Large files reference an upload on Gemini's Files API instead of
  // carrying base64 bytes in the request body.
  if (typeof value.fileUri === 'string') {
    if (!isGeminiFileUri(value.fileUri)) {
      throw new Error('invalid_media');
    }
    return {
      kind: value.kind,
      mimeType: value.mimeType,
      fileUri: value.fileUri,
    };
  }
  if (
    typeof value.base64 !== 'string' ||
    value.base64.length > mediaMaxBase64Length ||
    !isBase64Shape(value.base64)
  ) {
    throw new Error('invalid_media');
  }
  return {
    kind: value.kind,
    mimeType: value.mimeType,
    base64: value.base64,
  };
}

function contentFromDatabase(value: unknown): CreatorContentInput {
  if (!isRecord(value) || typeof value.title !== 'string') {
    throw new Error('database_invalid_response');
  }
  const metrics = isRecord(value.metrics) ? value.metrics : {};
  const knownMetrics: Record<string, number> = {};
  for (const [key, metric] of Object.entries(metrics)) {
    if (typeof metric === 'number' && Number.isFinite(metric)) {
      knownMetrics[key] = metric;
    }
  }

  return {
    title: value.title,
    transcript: typeof value.transcript === 'string' ? value.transcript : null,
    caption: typeof value.caption === 'string' ? value.caption : null,
    topic: typeof value.topic === 'string' ? value.topic : null,
    format: typeof value.format === 'string' ? value.format : null,
    durationSeconds: typeof value.duration_seconds === 'number'
      ? value.duration_seconds
      : null,
    publishedAt: typeof value.published_at === 'string' ? value.published_at : null,
    metrics: knownMetrics,
  };
}

async function readRequestJson(
  request: Request,
  maxBytes = 50_000,
): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > maxBytes) {
    throw new Error('request_too_large');
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error('request_too_large');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('invalid_request');
  }
}

async function processAnalysisJob(
  job: DbJob,
  userId: string,
  config: FunctionConfig,
): Promise<void> {
  try {
    const statusUpdated = await supabaseRpc<boolean>(
      config,
      'set_content_analysis_job_status',
      {
        p_user_id: userId,
        p_job_id: job.jobId,
        p_status: 'analyzing',
        p_error_code: null,
      },
    );
    if (!statusUpdated) {
      throw new Error('job_state_update_failed');
    }

    const content = contentFromDatabase(job.content);
    if (!config.aiEndpoint || !config.aiApiKey || !config.aiModel) {
      throw new Error('ai_not_configured');
    }
    const provider = createAiProvider({
      endpoint: config.aiEndpoint,
      apiKey: config.aiApiKey,
      model: config.aiModel,
    });
    const analysis = await analyzeContent(provider, content, job.media);
    const saved = await supabaseRpc<boolean>(config, 'save_content_analysis', {
      p_user_id: userId,
      p_job_id: job.jobId,
      p_analysis: analysis,
      p_model: provider.model,
    });
    if (!saved) {
      throw new Error('database_save_failed');
    }
  } catch (error) {
    const errorCode = error instanceof CreatorAiError
      ? error.code
      : error instanceof Error && error.message === 'database_unavailable'
        ? 'database_unavailable'
        : 'analysis_failed';
    try {
      await supabaseRpc<boolean>(config, 'set_content_analysis_job_status', {
        p_user_id: userId,
        p_job_id: job.jobId,
        p_status: 'failed',
        p_error_code: errorCode,
      });
    } catch {
      console.error(`Unable to mark Creator AI job ${job.jobId} as failed.`);
    }
    console.error(`Creator AI analysis failed: ${errorCode}.`);
  }
}

async function handleAnalyze(
  request: Request,
  userId: string,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let requestBody: unknown;
  try {
    requestBody = await readRequestJson(request, 4_500_000);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_request';
    return jsonResponse({ error: code }, code === 'request_too_large' ? 413 : 400, headers);
  }

  let parsed: ReturnType<typeof parseContentRequest>;
  try {
    parsed = parseContentRequest(requestBody);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_request';
    return jsonResponse({ error: code }, 400, headers);
  }

  const job = await supabaseRpc<DbJob | null>(
    config,
    'create_content_analysis_job',
    {
      p_user_id: userId,
      p_idempotency_key: parsed.idempotencyKey,
      p_content: {
        source: 'manual',
        title: parsed.content.title,
        transcript: parsed.content.transcript,
        caption: parsed.content.caption,
        topic: parsed.content.topic,
        format: parsed.content.format,
        durationSeconds: parsed.content.durationSeconds,
        publishedAt: parsed.content.publishedAt,
        metrics: parsed.content.metrics,
      },
    },
  );
  if (
    !isRecord(job) ||
    !isUuid(job.jobId) ||
    !isUuid(job.contentId) ||
    typeof job.status !== 'string'
  ) {
    throw new Error('database_invalid_response');
  }

  if (job.status === 'completed' && job.analysis) {
    return jsonResponse({
      jobId: job.jobId,
      status: 'completed',
      cached: true,
      analysis: job.analysis,
    }, 200, headers);
  }

  const claim = await supabaseRpc<{ status: string; claimed: boolean } | null>(
    config,
    'claim_content_analysis_job',
    { p_user_id: userId, p_job_id: job.jobId },
  );
  if (!claim || typeof claim.status !== 'string') {
    throw new Error('database_invalid_response');
  }
  if (!claim.claimed) {
    if (claim.status === 'completed') {
      const latest = await supabaseRpc<unknown>(
        config,
        'get_content_analysis_job',
        { p_user_id: userId, p_job_id: job.jobId },
      );
      return jsonResponse(latest, 200, headers);
    }
    if (claim.status === 'processing' || claim.status === 'analyzing') {
      return jsonResponse({ jobId: job.jobId, status: claim.status }, 202, headers);
    }
    throw new Error('job_claim_failed');
  }

  EdgeRuntime.waitUntil(processAnalysisJob({
    ...job,
    media: parsed.media,
  }, userId, config));
  return jsonResponse({
    jobId: job.jobId,
    contentId: job.contentId,
    status: 'processing',
    cached: false,
  }, 202, headers);
}

async function handleGetJob(
  userId: string,
  jobId: string,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  const result = await supabaseRpc<unknown>(config, 'get_content_analysis_job', {
    p_user_id: userId,
    p_job_id: jobId,
  });
  if (!result) {
    return jsonResponse({ error: 'not_found' }, 404, headers);
  }
  return jsonResponse(result, 200, headers);
}

const transcriptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['transcript'],
  properties: { transcript: { type: 'string' } },
} as const;

const chatReplySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string' },
    escalate: { type: 'boolean' },
    // Optional: set only when the creator explicitly asked for a visual, so the
    // app can hand the prompt to the free media route (`media`) afterwards.
    media: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'prompt'],
      properties: {
        kind: { type: 'string', enum: ['image', 'video'] },
        prompt: { type: 'string' },
        duration: { type: 'number' },
        // Set only when the coach is changing an image the creator attached;
        // the media route then edits that image instead of generating a new one.
        edit: { type: 'boolean' },
      },
    },
  },
} as const;

// The creator coach prompt used by the floating AI button (chat mode).
const COACH_SYSTEM_PROMPT =
  'You are CreatorDNA, a warm, friendly, practical creator coach with visibility into the creator’s whole app. Speak naturally like a helpful friend, not a report or corporate bot. You are given any of the following: a content analysis, app context (their Instagram profile, follower and engagement stats, recent media, generated Reel ideas, saved content plan, Creator DNA profile and scores, and performance stats), the recent conversation, and optionally one image or video the creator attached to their latest message. If an attachment is present, look at it carefully and reference its real contents. Answer questions and give actionable advice using all of it. Do not invent facts, metrics, or claims; say so plainly when something is unknown or was not provided. Keep replies focused and actionable. You can also make visuals for the creator. Only when the user explicitly asks you to create, generate, or make an image, picture, poster, cover, thumbnail, or a video or Reel clip, still reply with a short friendly sentence of 1 to 2 lines in plain English AND set "media" to a production-ready visual prompt you wrote from the conversation: subject, setting, style, lighting, composition, and portrait 9:16 framing; for a video, add the camera and motion direction plus a "duration" in seconds (default 15, maximum 15) chosen to suit the shot. When the creator attached an image AND asks you to change, fix, restyle, retouch, extend, or edit that image, set "edit" to true inside "media" and make "media" the precise edit instruction in plain English: what to change, and what must stay exactly the same. When they merely ask you to create something new, leave "edit" out, and never claim you will edit an image you were not given. Keep every "media" prompt under 600 characters and leave "media" out for every other request. Never invent performance claims. Return JSON with a string field named "reply", plus the "media" object only when you were asked to make a visual.';

// Support mode (`mode: "support"`): the Help screen sends the published help
// centre as `context.helpCenter`, so answers come only from articles the user
// can read themselves. When the article set cannot settle the question — or a
// human is asked for — set escalate:true so the app offers a support email.
const SUPPORT_SYSTEM_PROMPT =
  'You are the CreatorDNA support assistant, a calm and practical help-desk agent inside the app’s Help screen. You are given the full help centre under appContext.helpCenter (FAQ, setup guides, troubleshooting) plus the recent conversation. Answer the user’s question from that help centre only: give the exact steps, in order, in plain language, and quote the article name when it helps. Never invent features, settings, prices, policies, or fixes that are not in the help centre, and never guess about someone’s account or data. If you do not know, if the answer needs access to their account or the backend, if they report a bug, a billing question, a data-deletion or privacy request, an account issue, or they simply ask for a person, keep your reply short, tell them a support specialist will follow up by email, and set "escalate" to true. Otherwise set "escalate" to false. Return JSON with a "reply" string and a boolean "escalate".';


const ideasSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      minItems: 7,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'hook',
          'concept',
          'format',
          'cta',
          'priority',
          'why_it_works',
          'target_viewer',
          'target_length',
          'beats',
        ],
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          concept: { type: 'string' },
          format: { type: 'string' },
          cta: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          // Why this idea fits this creator's topic, audience, and goal.
          why_it_works: { type: 'string' },
          target_viewer: { type: 'string' },
          target_length: { type: 'string' },
          // Ordered production beats: what to show, say, and put on screen.
          beats: {
            type: 'array',
            minItems: 3,
            maxItems: 6,
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

function configuredProvider(config: FunctionConfig) {
  if (!config.aiEndpoint || !config.aiApiKey || !config.aiModel) {
    throw new Error('ai_not_configured');
  }
  return createAiProvider({
    endpoint: config.aiEndpoint,
    apiKey: config.aiApiKey,
    model: config.aiModel,
  });
}

function aiProviderConfig(config: FunctionConfig): AiProviderConfig {
  if (!config.aiEndpoint || !config.aiApiKey || !config.aiModel) {
    throw new Error('ai_not_configured');
  }
  return {
    endpoint: config.aiEndpoint,
    apiKey: config.aiApiKey,
    model: config.aiModel,
  };
}

// Large media uploads (up to 1 GB): the client streams chunks straight to
// Gemini's resumable upload URL — this backend only mints the session and
// acknowledges chunks, so the file bytes never pass through Supabase.
// Google requires non-final chunks in multiples of 8 MiB, so an encoded chunk
// is at most 11,184,812 base64 characters (plus a small JSON envelope).
const uploadChunkMaxBase64Length = 11_200_000;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function handleUploadInit(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readRequestJson(request, 4_000);
  } catch {
    return jsonResponse({ error: 'invalid_upload_request' }, 400, headers);
  }
  let init: ReturnType<typeof parseUploadInitRequest>;
  try {
    init = parseUploadInitRequest(body);
  } catch {
    return jsonResponse({ error: 'invalid_upload_request' }, 400, headers);
  }
  try {
    const uploadUrl = await createGeminiUploadSession(aiProviderConfig(config), init);
    return jsonResponse({ uploadUrl }, 200, headers);
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'upload_failed';
    return jsonResponse({ error: code }, 502, headers);
  }
}

async function handleUploadChunk(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readRequestJson(request, 13_000_000);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'request_too_large';
    return jsonResponse(
      { error: tooLarge ? 'chunk_too_large' : 'invalid_upload_chunk' },
      tooLarge ? 413 : 400,
      headers,
    );
  }
  if (
    !isRecord(body) ||
    typeof body.uploadUrl !== 'string' ||
    typeof body.offset !== 'number' ||
    !Number.isInteger(body.offset) ||
    body.offset < 0 ||
    typeof body.base64 !== 'string' ||
    body.base64.length > uploadChunkMaxBase64Length ||
    !isBase64Shape(body.base64)
  ) {
    return jsonResponse({ error: 'invalid_upload_chunk' }, 400, headers);
  }
  try {
    const result = await forwardGeminiUploadChunk(
      aiProviderConfig(config),
      body.uploadUrl,
      {
        offset: body.offset,
        bytes: decodeBase64(body.base64),
        finalize: body.finalize === true,
      },
    );
    return result.done
      ? jsonResponse({ fileUri: result.fileUri }, 200, headers)
      : jsonResponse({ chunkReceived: true }, 200, headers);
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'upload_failed';
    return jsonResponse({ error: code }, 502, headers);
  }
}

async function handleTranscribe(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readRequestJson(request, 4_500_000);
  } catch {
    return jsonResponse({ error: 'invalid_media_request' }, 400, headers);
  }
  if (!isRecord(body)) {
    return jsonResponse({ error: 'invalid_media_request' }, 400, headers);
  }
  let media: CreatorAiMedia | null;
  try {
    media = parseMedia(body.media);
  } catch {
    return jsonResponse({ error: 'invalid_media' }, 400, headers);
  }
  if (!media || media.kind !== 'audio') {
    return jsonResponse({ error: 'audio_required' }, 400, headers);
  }

  try {
    const result = await configuredProvider(config).generateJson(
      'You are a careful transcription assistant. Transcribe only speech that is audible in the attached audio. Return a JSON object with a single "transcript" string. Do not summarize, add speaker labels unless spoken, or invent inaudible words.',
      'Transcribe the spoken words in this audio as faithfully as possible. Return an empty transcript if there is no intelligible speech.',
      transcriptSchema,
      media,
    );
    if (
      !isRecord(result) ||
      typeof result.transcript !== 'string' ||
      result.transcript.length > 20_000
    ) {
      throw new CreatorAiError('malformed_model_response');
    }
    return jsonResponse({ transcript: result.transcript }, 200, headers);
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'analysis_failed';
    return jsonResponse({ error: code }, 502, headers);
  }
}

// The coach may return a visual request. It is validated here rather than
// trusted: a malformed field is dropped so a bad model value never fails an
// otherwise perfectly good reply.
function parseCoachMediaIntent(value: unknown): {
  kind: 'image' | 'video';
  prompt: string;
  duration?: number;
  edit?: boolean;
} | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind: 'image' | 'video' | null =
    value.kind === 'image' ? 'image' : value.kind === 'video' ? 'video' : null;
  if (!kind || typeof value.prompt !== 'string') {
    return null;
  }
  const prompt = value.prompt.trim();
  if (!prompt || prompt.length > 600) {
    return null;
  }
  // `edit` is trusted only as a real boolean — a "true" string or a number is
  // dropped field-by-field so a bad value never costs the creator a good reply.
  const edit = typeof value.edit === 'boolean' ? value.edit : undefined;
  const duration = value.duration;
  if (duration === undefined || duration === null) {
    return edit === undefined ? { kind, prompt } : { kind, prompt, edit };
  }
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration < 4 ||
    duration > 15
  ) {
    return null;
  }
  return edit === undefined
    ? { kind, prompt, duration }
    : { kind, prompt, duration, edit };
}

async function handleChat(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown;
  try {
    // Chat requests may carry one image/video attachment (base64, ≤ ~3 MB),
    // so the body limit is far above the text-only chat ceiling.
    body = await readRequestJson(request, 4_400_000);
  } catch {
    return jsonResponse({ error: 'invalid_chat_request' }, 400, headers);
  }
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return jsonResponse({ error: 'invalid_chat_request' }, 400, headers);
  }
  let attachment: CreatorAiMedia | null = null;
  try {
    attachment = parseChatAttachment(body.attachment);
  } catch {
    return jsonResponse({ error: 'invalid_chat_request' }, 400, headers);
  }
  const analysis = isRecord(body.analysis) ? body.analysis : null;
  const context = isRecord(body.context) ? body.context : null;
  const supportMode = body.mode === 'support';
  if (!analysis && !context) {
    return jsonResponse({ error: 'invalid_chat_request' }, 400, headers);
  }
  // Support mode always ships the help centre as its context; without it the
  // assistant would have nothing to answer from.
  if (supportMode && !context) {
    return jsonResponse({ error: 'invalid_chat_request' }, 400, headers);
  }
  const analysisJson = analysis ? JSON.stringify(analysis) : '';
  const contextJson = context ? JSON.stringify(context) : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const messages = body.messages;
  if (
    analysisJson.length > 30_000 ||
    contextJson.length > 30_000 ||
    (!attachment && message.length === 0) ||
    message.length > 2000 ||
    messages.length > 8 ||
    !messages.every((entry) =>
      isRecord(entry) &&
      (entry.role === 'user' || entry.role === 'assistant') &&
      typeof entry.content === 'string' &&
      entry.content.length > 0 &&
      entry.content.length <= 2000
    )
  ) {
    return jsonResponse({ error: 'invalid_chat_request' }, 400, headers);
  }

  try {
    const result = await configuredProvider(config).generateJson(
      supportMode ? SUPPORT_SYSTEM_PROMPT : COACH_SYSTEM_PROMPT,
      JSON.stringify({
        analysis: analysis ?? undefined,
        appContext: context ?? undefined,
        recentConversation: messages,
        creatorMessage: message,
        attachment: attachment
          ? { kind: attachment.kind, mimeType: attachment.mimeType }
          : undefined,
      }),
      chatReplySchema,
      attachment,
    );
    if (!isRecord(result) || typeof result.reply !== 'string' || result.reply.length > 4000) {
      throw new CreatorAiError('malformed_model_response');
    }
    // Support mode never asks for visuals, so media is coach-mode only.
    const media = supportMode ? null : parseCoachMediaIntent(result.media);
    return jsonResponse(
      {
        reply: result.reply,
        escalate: result.escalate === true,
        ...(media ? { media } : {}),
      },
      200,
      headers,
    );
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'analysis_failed';
    return jsonResponse({ error: code }, 502, headers);
  }
}

async function handleIdeas(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readRequestJson(request, 10_000);
  } catch {
    return jsonResponse({ error: 'invalid_ideas_request' }, 400, headers);
  }
  if (!isRecord(body)) {
    return jsonResponse({ error: 'invalid_ideas_request' }, 400, headers);
  }
  const topic = optionalText(body.topic, 'topic', 300);
  const audience = optionalText(body.audience, 'audience', 300);
  const goal = optionalText(body.goal, 'goal', 300);
  if (!topic || !audience || !goal) {
    return jsonResponse({ error: 'topic_audience_goal_required' }, 400, headers);
  }
  try {
    const result = await configuredProvider(config).generateJson(
      'You are CreatorDNA, a friendly, imaginative short-form video idea partner. Return exactly seven ideas as JSON with title, hook, concept, format, cta, priority, why_it_works, target_viewer, target_length, and beats for every idea, ordered best fit first: exactly five of the seven carry priority "high" and the remaining two carry priority "medium", where the two medium ideas are the more experimental picks — still worth making, just a step below the top five. Tailor every single field to the supplied topic, audience, and goal — the hook, concept, beats, and reasoning must be recognizably about this creator’s subject and this audience’s situation, never a generic idea with the topic name swapped in. hook is the exact opening line the creator says or shows on screen, written in their voice, not a description of a hook. beats are 3 to 6 ordered, shot-by-shot production steps a creator can execute in order from first frame to last, each one plain sentence covering what to show, what to say, and any on-screen text. why_it_works is 2-3 plain sentences explaining why this idea suits this specific audience and goal. target_viewer names concretely who the Reel is for, and target_length gives a realistic short-form running time such as "15-20 seconds". cta is a direct request the creator can say on camera. Write in plain, everyday English a busy creator can read at a glance: short sentences of about 15 words or fewer, common words, no jargon, no fancy synonyms, and no marketing buzzwords. If a term must be used (hook, CTA, retention), say what it means in the same breath, for example: CTA (call to action — what you ask the viewer to do). Give more, not less: concept is 3 to 4 concrete sentences covering what happens, what the viewer sees, and what the creator says; every beat names one specific shot plus the exact on-screen text to show; cta gives the literal line to say plus what the viewer should do. Each idea must read like a friendly step-by-step brief, not a list of slogans. Never invent trends, statistics, metrics, platform features, or guaranteed results, and never promise performance. Keep every string free of markdown, hashtags, and emojis, each under 1200 characters (each beat under 400 characters), and write as if speaking plainly to a busy creator.',
      JSON.stringify({ topic, audience, goal }),
      ideasSchema,
    );
    if (
      !isRecord(result) ||
      !Array.isArray(result.ideas) ||
      result.ideas.length !== 7 ||
      !result.ideas.every((idea) =>
        isRecord(idea) &&
        ['title', 'hook', 'concept', 'format', 'cta', 'why_it_works', 'target_viewer', 'target_length'].every((key) =>
          typeof idea[key] === 'string' &&
          idea[key].trim().length > 0 &&
          idea[key].length <= 1200
        ) &&
        Array.isArray(idea.beats) &&
        idea.beats.length >= 3 &&
        idea.beats.length <= 6 &&
        idea.beats.every((beat) =>
          typeof beat === 'string' &&
          beat.trim().length > 0 &&
          beat.length <= 400
        ) &&
        ['high', 'medium', 'low'].includes(String(idea.priority))
      )
    ) {
      throw new CreatorAiError('malformed_model_response');
    }
    // The plan shows seven days, and the promise on screen is five strong
    // picks plus two lighter ones. The model is told exactly that, but a
    // drifted ranking must not fail a perfectly usable answer — re-rank from
    // its own ordering and pin the split instead of rejecting the batch.
    const ideas = result.ideas.map((idea) => ({ ...idea }));
    const rank = (priority: unknown): number =>
      priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
    ideas.sort((a, b) => rank(a.priority) - rank(b.priority));
    for (let index = 0; index < ideas.length; index += 1) {
      ideas[index].priority = index < 5 ? 'high' : 'medium';
    }
    return jsonResponse({ ideas }, 200, headers);
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'analysis_failed';
    return jsonResponse({ error: code }, 502, headers);
  }
}

// ---------------------------------------------------------------------------
// Idea scoring: the "Analyze my idea" flow. Six dimensions plus one blended
// score, all of them an estimate of fit for this creator's own audience —
// never a forecast of views, and always labelled as such in the client.
// ---------------------------------------------------------------------------
const ideaScoresSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'hook_score',
    'topic_fit',
    'audience_fit',
    'shareability',
    'save_potential',
    'cta_strength',
    'overall',
    'improvements',
    'why',
  ],
  properties: {
    hook_score: { type: 'integer', minimum: 0, maximum: 100 },
    topic_fit: { type: 'integer', minimum: 0, maximum: 100 },
    audience_fit: { type: 'integer', minimum: 0, maximum: 100 },
    shareability: { type: 'integer', minimum: 0, maximum: 100 },
    save_potential: { type: 'integer', minimum: 0, maximum: 100 },
    cta_strength: { type: 'integer', minimum: 0, maximum: 100 },
    overall: { type: 'integer', minimum: 0, maximum: 100 },
    improvements: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 400 },
    },
    why: { type: 'string', minLength: 1, maxLength: 1200 },
  },
};

const IDEA_SCORE_KEYS = [
  'hook_score',
  'topic_fit',
  'audience_fit',
  'shareability',
  'save_potential',
  'cta_strength',
  'overall',
] as const;

async function handleIdeaScores(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readRequestJson(request, 12_000);
  } catch {
    return jsonResponse({ error: 'invalid_idea_scores_request' }, 400, headers);
  }
  if (!isRecord(body)) {
    return jsonResponse({ error: 'invalid_idea_scores_request' }, 400, headers);
  }
  // optionalText throws on an over-long field, so it runs inside its own
  // guard: a too-long idea is a 400, never an unhandled 500.
  let idea: string | null = null;
  let audience: string | null = null;
  let goal: string | null = null;
  let context: string | null = null;
  try {
    idea = optionalText(body.idea, 'idea', 4000);
    audience = optionalText(body.audience, 'audience', 300);
    goal = optionalText(body.goal, 'goal', 300);
    context = optionalText(body.context, 'context', 4000);
  } catch {
    return jsonResponse({ error: 'invalid_idea_scores_request' }, 400, headers);
  }
  if (!idea) {
    return jsonResponse({ error: 'idea_required' }, 400, headers);
  }

  try {
    const result = await configuredProvider(config).generateJson(
      'You are CreatorDNA, a direct but kind content coach. The creator hands you one idea — a topic, a hook, a caption, or a rough script — and you judge how well it fits this specific creator: their audience, their goal, and the material they have already made. Score six dimensions as integers from 0 to 100: hook_score is how strong the opening line is at stopping a scroll; topic_fit is how well the subject suits what this creator already makes; audience_fit is how relevant it is to the people who follow them; shareability is how likely someone is to send it to a friend; save_potential is how useful it is to keep; cta_strength is how clear and specific the ask is, scoring 0 when the idea contains no call to action at all. overall is your honest blended judgement rather than a plain average: a weak hook or a missing call to action must pull it down. improvements holds 2 to 5 specific changes the creator can make today — real rewrites and additions, never advice like "make it more engaging". why is 2 to 3 plain sentences that point at the actual idea in front of you and explain the score. Every score is an estimate for planning, not a prediction of views or likes: never promise a result, and never invent analytics about the creator. Write in short everyday sentences of about 15 words, no jargon, no marketing buzzwords.',
      JSON.stringify({
        idea,
        context: context || undefined,
        audience: audience || undefined,
        goal: goal || undefined,
      }),
      ideaScoresSchema,
    );
    const valid = isRecord(result) &&
      IDEA_SCORE_KEYS.every(
        (key) => typeof result[key] === 'number' && Number.isFinite(result[key]),
      ) &&
      Array.isArray(result.improvements) &&
      result.improvements.length >= 2 &&
      result.improvements.length <= 5 &&
      result.improvements.every(
        (item) =>
          typeof item === 'string' && item.trim().length > 0 && item.length <= 400,
      ) &&
      typeof result.why === 'string' &&
      result.why.trim().length > 0 &&
      result.why.length <= 1200;
    if (!valid) {
      throw new CreatorAiError('malformed_model_response');
    }
    const score = (key: (typeof IDEA_SCORE_KEYS)[number]): number =>
      Math.max(0, Math.min(100, Math.round(result[key] as number)));
    return jsonResponse(
      {
        scores: {
          hook: score('hook_score'),
          topic_fit: score('topic_fit'),
          audience_fit: score('audience_fit'),
          shareability: score('shareability'),
          save_potential: score('save_potential'),
          cta_strength: score('cta_strength'),
        },
        overall: score('overall'),
        improvements: result.improvements.map((item) => String(item).trim()),
        why: String(result.why).trim(),
      },
      200,
      headers,
    );
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'analysis_failed';
    return jsonResponse({ error: code }, 502, headers);
  }
}

// ---------------------------------------------------------------------------
// Media route: free image/video generation through Pollinations.
// The provider key lives only on this server — it is sent solely in an
// Authorization header, and every URL handed back to the app is stripped of
// auth-shaped query parameters so the secret can never travel in a link the
// client shares or caches. Each upstream call is kept short because the client
// polls: nothing here waits around for a render to finish.
// ---------------------------------------------------------------------------
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
// `paid_only: false` in the model catalogue, so a free/quest key can still
// generate with it — this stays the default for fresh images.
const DEFAULT_IMAGE_MODEL = 'black-forest-labs/flux.1-schnell';
// Purpose-built image editor (`POST /v1/images/edits`), also free-key eligible.
const DEFAULT_EDIT_MODEL = 'black-forest-labs/flux.1-kontext-pro';
// Second editor, tried once when the configured one answers 400/404 to the
// model itself; the two parse the same request shape differently.
const FALLBACK_EDIT_MODEL = 'microsoft/mai-image-2.6-flash';
const DEFAULT_IMAGE_SIZE = '1080x1920';
const DEFAULT_VIDEO_MODEL = 'x-ai/grok-imagine-video-1.5-lite';
const DEFAULT_VIDEO_DURATION = 15;
const MIN_VIDEO_DURATION = 4;
const MAX_VIDEO_DURATION = 15;
const MEDIA_PROMPT_MAX_LENGTH = 600;
const MEDIA_JOB_MAX_LENGTH = 300;
// Edits carry the creator's attached image inline, so the body ceiling matches
// the chat attachment limit instead of the prompt-only 8 KB.
const MEDIA_BODY_MAX_BYTES = 4_500_000;
// Everything a `detail` sentence is built from is a fixed string; this is the
// belt-and-braces cap the contract promises the client.
const MEDIA_DETAIL_MAX_LENGTH = 200;
// Query parameters that would carry credentials, never echoed back to clients.
const MEDIA_AUTH_QUERY_KEYS = [
  'key',
  'apikey',
  'api_key',
  'token',
  'access_token',
  'auth',
  'authorization',
  'secret',
];

type MediaGenerationRequest =
  | { kind: 'image'; prompt: string; sourceDataUri?: string }
  | { kind: 'video'; prompt: string; duration: number }
  | { job: string };

type MediaState =
  | { status: 'ready'; url: string }
  | { status: 'pending'; job?: string }
  | { status: 'failed' };

/**
 * Why one provider call produced no usable media. `status` is the HTTP status
 * the provider answered with, or 0 when the call never got an answer
 * (timeout / network), which the detail mapping treats separately.
 */
type MediaFailure = { status: number; code: string | null };

/** One provider run: either a state to hand the client, or why it failed. */
type MediaRun =
  | { ok: true; state: MediaState }
  | { ok: false; failure: MediaFailure };

/** Result of a single provider HTTP call. */
type MediaAttempt = { url: string | null; status: number; code: string | null };

function clampVideoDuration(value: number): number {
  return Math.min(MAX_VIDEO_DURATION, Math.max(MIN_VIDEO_DURATION, Math.round(value)));
}

// `data:<image mime>;base64,<payload>` — the shape `attachCreatorMedia` hands
// the chat screen, so a creator's own image can be edited instead of replaced.
const IMAGE_DATA_URI_PATTERN =
  /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,([\s\S]*)$/i;

/**
 * Validates the image the coach wants edited: it must be a `data:` URI, its
 * mime type must be an image, and its base64 must fit in ~4 MB. Anything else
 * is a bad request rather than a silent downgrade to a fresh generation.
 */
function isEditableImageUri(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = IMAGE_DATA_URI_PATTERN.exec(value);
  if (!match || !match[1].toLowerCase().startsWith('image/')) {
    return false;
  }
  const payload = match[2];
  return payload.length <= mediaMaxBase64Length && isBase64Shape(payload);
}

/** Splits a validated image data URI into the bytes to upload. Never throws. */
function decodeSourceImage(sourceDataUri: string): { mime: string; bytes: Uint8Array } | null {
  const match = IMAGE_DATA_URI_PATTERN.exec(sourceDataUri);
  if (!match) {
    return null;
  }
  try {
    return { mime: match[1].toLowerCase(), bytes: decodeBase64(match[2]) };
  } catch {
    return null;
  }
}

/** `image/jpeg` → `source.jpeg`; the field name below needs a real filename. */
function sourceImageFileName(mime: string): string {
  const subtype = mime.slice(mime.indexOf('/') + 1).replace(/[^a-z0-9]/gi, '');
  return `source.${subtype || 'image'}`;
}

function parseMediaRequest(value: unknown): MediaGenerationRequest {
  if (!isRecord(value)) {
    throw new Error('invalid_media_request');
  }
  // `{ job }` bodies poll an already-started render; everything else starts one.
  if (typeof value.job === 'string') {
    const job = value.job.trim();
    if (!job || job.length > MEDIA_JOB_MAX_LENGTH) {
      throw new Error('invalid_media_request');
    }
    return { job };
  }
  const kind: 'image' | 'video' | null =
    value.kind === 'image' ? 'image' : value.kind === 'video' ? 'video' : null;
  if (!kind || typeof value.prompt !== 'string') {
    throw new Error('invalid_media_request');
  }
  const prompt = value.prompt.trim();
  if (!prompt || prompt.length > MEDIA_PROMPT_MAX_LENGTH) {
    throw new Error('invalid_media_request');
  }
  // An attached image makes this an EDIT of that image rather than a fresh
  // generation. It is validated here so a malformed one 400s instead of being
  // quietly ignored and replaced by a brand-new picture.
  const rawSourceDataUri = value.sourceDataUri;
  let sourceDataUri: string | null = null;
  if (rawSourceDataUri !== undefined && rawSourceDataUri !== null) {
    if (!isEditableImageUri(rawSourceDataUri)) {
      throw new Error('invalid_media_request');
    }
    sourceDataUri = rawSourceDataUri;
  }
  if (kind === 'image') {
    return sourceDataUri === null
      ? { kind, prompt }
      : { kind, prompt, sourceDataUri };
  }
  const duration = value.duration === undefined || value.duration === null
    ? DEFAULT_VIDEO_DURATION
    : value.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    throw new Error('invalid_media_request');
  }
  return { kind, prompt, duration: clampVideoDuration(duration) };
}

/** Returns a shareable https URL with any credential-shaped query removed. */
function publicMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    for (const key of MEDIA_AUTH_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Digs the file URL out of the provider's loosely-shaped JSON answers. */
function extractMediaUrl(value: unknown, depth = 0): string | null {
  const direct = publicMediaUrl(value);
  if (direct) {
    return direct;
  }
  if (!isRecord(value) || depth > 2) {
    return null;
  }
  for (const key of ['url', 'result_url', 'video_url', 'file_url', 'file', 'location']) {
    const url = publicMediaUrl(value[key]);
    if (url) {
      return url;
    }
  }
  return extractMediaUrl(value.data, depth + 1);
}

function extractMediaJob(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  for (const key of ['id', 'job', 'job_id', 'jobId']) {
    const job = typeof value[key] === 'string' ? value[key].trim() : '';
    if (job && job.length <= MEDIA_JOB_MAX_LENGTH) {
      return job;
    }
  }
  return null;
}

/** Reads a provider body without ever letting a bad payload escape as a 500. */
async function readMediaBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  // A few routes answer with a bare file URL instead of JSON.
  return trimmed;
}

/**
 * Pulls just the provider's `error.code` (`INSUFFICIENT_BALANCE`,
 * `QUEST_POLLEN_ONLY`, …) out of a failure body. The free-text message is
 * deliberately never read: it can echo the key, so only this short token is
 * allowed to influence what we say.
 */
function mediaProviderCode(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const error = value.error;
  if (isRecord(error)) {
    return typeof error.code === 'string' && error.code.length <= 100
      ? error.code
      : null;
  }
  // Some routes answer `{ error: "CODE" }` instead of a nested object; only an
  // all-caps token counts as a code, a sentence is not echoed back.
  return typeof error === 'string' && /^[A-Z0-9_]{4,60}$/.test(error) ? error : null;
}

function parseImageSize(size: string): { width: number; height: number } | null {
  const match = /^(\d{2,5})[xX](\d{2,5})$/.exec(size.trim());
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

/**
 * Picks the failure worth reporting: the last status the provider actually
 * answered with, so a later "never got an answer" (0) never buries a real
 * status, and a final silence still reports as unreachable.
 */
function latestProviderFailure(failures: MediaFailure[]): MediaFailure {
  for (let index = failures.length - 1; index >= 0; index -= 1) {
    if (failures[index].status > 0) {
      return failures[index];
    }
  }
  return failures[failures.length - 1] ?? { status: 0, code: null };
}

/** Reads one `/v1/images/edits` answer: the file URL from `data[0]`, or why not. */
async function readImageEditAnswer(response: Response): Promise<MediaAttempt> {
  const body = await readMediaBody(response);
  if (!response.ok) {
    return { url: null, status: response.status, code: mediaProviderCode(body) };
  }
  const first = isRecord(body) && Array.isArray(body.data) ? body.data[0] : null;
  const url = (isRecord(first) ? publicMediaUrl(first.url) : null) ??
    publicMediaUrl(body);
  // 200 without a file URL is a provider contract break, not a bad prompt: it
  // gets the "service is having trouble" wording instead of blaming the creator.
  return url
    ? { url, status: response.status, code: null }
    : { url: null, status: 502, code: 'malformed_response' };
}

/**
 * One edit attempt for one model.
 *
 * Multipart is the documented encoding, and the first attempt uses it:
 * `model`, `prompt`, `response_format=url`, plus the image as the `image`
 * field with a filename and its real mime type. Some deployments only parse a
 * JSON body, so a 400/422 — a complaint about the *encoding*, not the content
 * — is retried once as JSON with the image inlined as a data URI. When both
 * fail, the second attempt's status is the one reported, because it is the
 * answer to the encoding the provider actually understood.
 */
async function callImageEdits(
  apiKey: string,
  model: string,
  prompt: string,
  sourceDataUri: string,
): Promise<MediaAttempt> {
  const endpoint = `${POLLINATIONS_BASE_URL}/v1/images/edits`;
  const decoded = decodeSourceImage(sourceDataUri);
  if (!decoded) {
    return { url: null, status: 400, code: 'invalid_media_request' };
  }

  let attempt: MediaAttempt;
  try {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('response_format', 'url');
    form.append(
      'image',
      // A fresh copy keeps the part ArrayBuffer-backed: newer TS typings reject
      // an `ArrayBufferLike`-typed view as a Blob part.
      new Blob([new Uint8Array(decoded.bytes)], { type: decoded.mime }),
      sourceImageFileName(decoded.mime),
    );
    attempt = await readImageEditAnswer(await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      // No Content-Type header: fetch has to add its own multipart boundary.
      body: form,
      signal: AbortSignal.timeout(30_000),
    }));
  } catch {
    attempt = { url: null, status: 0, code: null };
  }

  if (attempt.url || (attempt.status !== 400 && attempt.status !== 422)) {
    return attempt;
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        image: sourceDataUri,
        response_format: 'url',
      }),
      signal: AbortSignal.timeout(30_000),
    });
    return await readImageEditAnswer(response);
  } catch {
    return { url: null, status: 0, code: null };
  }
}

/**
 * Edits the image the creator attached: same prompt plumbing as generation,
 * but the picture they handed us is changed rather than replaced. A 400/404
 * from the configured editor means that model refused it, so one differently
 * built editor gets a single shot before the failure is reported.
 */
async function requestPollinationsEdit(
  apiKey: string,
  prompt: string,
  sourceDataUri: string,
): Promise<MediaRun> {
  const model = optional('POLLINATIONS_EDIT_MODEL') || DEFAULT_EDIT_MODEL;
  let attempt = await callImageEdits(apiKey, model, prompt, sourceDataUri);
  if (!attempt.url && (attempt.status === 400 || attempt.status === 404)) {
    attempt = await callImageEdits(apiKey, FALLBACK_EDIT_MODEL, prompt, sourceDataUri);
  }
  return attempt.url
    ? { ok: true, state: { status: 'ready', url: attempt.url } }
    : { ok: false, failure: { status: attempt.status, code: attempt.code } };
}

/**
 * Generates one portrait image and returns its public file URL, or the reason
 * the provider produced none. Preferred path is the OpenAI-style
 * generations endpoint; the plain image route (whose URL arrives in a
 * `Link: <…>; rel="enclosure"` header) is the fallback. Every attempt records
 * how it failed so the caller can explain the failure instead of shrugging.
 */
async function requestPollinationsImage(
  apiKey: string,
  prompt: string,
): Promise<MediaRun> {
  const model = optional('POLLINATIONS_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL;
  const size = optional('POLLINATIONS_IMAGE_SIZE') || DEFAULT_IMAGE_SIZE;
  const failures: MediaFailure[] = [];

  try {
    const response = await fetch(`${POLLINATIONS_BASE_URL}/v1/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        response_format: 'url',
        size,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const body: unknown = await readMediaBody(response);
      const first = isRecord(body) && Array.isArray(body.data) ? body.data[0] : null;
      const url = isRecord(first) ? publicMediaUrl(first.url) : null;
      if (url) {
        return { ok: true, state: { status: 'ready', url } };
      }
      failures.push({ status: 502, code: 'malformed_response' });
    } else {
      failures.push({
        status: response.status,
        code: mediaProviderCode(await readMediaBody(response)),
      });
    }
  } catch {
    failures.push({ status: 0, code: null });
  }

  try {
    const dimensions = parseImageSize(size) || { width: 1080, height: 1920 };
    const endpoint =
      `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(prompt)}` +
      `?model=${encodeURIComponent(model)}` +
      `&width=${dimensions.width}&height=${dimensions.height}&nologo=true`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const link = response.headers.get('Link');
    const match = link ? /<(https:[^>]+)>\s*;\s*[^,]*\brel="?enclosure"?/i.exec(link) : null;
    const fromHeader = match ? publicMediaUrl(match[1]) : null;
    if (fromHeader) {
      return { ok: true, state: { status: 'ready', url: fromHeader } };
    }
    // When the route redirects straight to the file, the URL we ended up at is
    // the public file itself (and only if it left our own host).
    const url = response.url.startsWith(POLLINATIONS_BASE_URL)
      ? null
      : publicMediaUrl(response.url);
    if (url) {
      return { ok: true, state: { status: 'ready', url } };
    }
    failures.push(
      response.ok
        ? { status: 502, code: 'malformed_response' }
        : { status: response.status, code: mediaProviderCode(await readMediaBody(response)) },
    );
  } catch {
    failures.push({ status: 0, code: null });
  }

  return { ok: false, failure: latestProviderFailure(failures) };
}

/**
 * Starts a video render. Returns `pending` with the provider job id (202) or
 * `ready` straight away when the clip was already cached (200); otherwise the
 * status the provider answered with, so the client can say why it failed.
 */
async function requestPollinationsVideo(
  apiKey: string,
  prompt: string,
  duration: number,
): Promise<MediaRun> {
  const model = optional('POLLINATIONS_VIDEO_MODEL') || DEFAULT_VIDEO_MODEL;
  let response: Response;
  try {
    response = await fetch(
      `${POLLINATIONS_BASE_URL}/video/${encodeURIComponent(prompt)}` +
        `?model=${encodeURIComponent(model)}&duration=${duration}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // Start the job and answer now instead of holding the request open
          // for the whole render — the client polls for the result.
          Prefer: 'respond-async',
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    return { ok: false, failure: { status: 0, code: null } };
  }

  if (response.status === 202) {
    const job = extractMediaJob(await readMediaBody(response));
    return job
      ? { ok: true, state: { status: 'pending', job } }
      : { ok: false, failure: { status: 502, code: 'malformed_response' } };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        status: response.status,
        code: mediaProviderCode(await readMediaBody(response)),
      },
    };
  }
  const body = await readMediaBody(response);
  const url = extractMediaUrl(body);
  if (url) {
    return { ok: true, state: { status: 'ready', url } };
  }
  const job = extractMediaJob(body);
  return job
    ? { ok: true, state: { status: 'pending', job } }
    : { ok: false, failure: { status: 502, code: 'malformed_response' } };
}

/**
 * Polls one provider job. A 404 is a job that no longer exists, which is a
 * finished failure for the client rather than a server error.
 */
async function pollMediaJob(apiKey: string, job: string): Promise<MediaRun> {
  let response: Response;
  try {
    response = await fetch(`${POLLINATIONS_BASE_URL}/v1/jobs/${encodeURIComponent(job)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, failure: { status: 0, code: null } };
  }
  if (response.status === 404) {
    return { ok: true, state: { status: 'failed' } };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        status: response.status,
        code: mediaProviderCode(await readMediaBody(response)),
      },
    };
  }
  const body = await readMediaBody(response);
  if (!isRecord(body)) {
    return { ok: false, failure: { status: 502, code: 'malformed_response' } };
  }
  const status = typeof body.status === 'string' ? body.status.toLowerCase() : '';
  if (['pending', 'queued', 'processing', 'running', 'in_progress'].includes(status)) {
    return { ok: true, state: { status: 'pending' } };
  }
  if (['failed', 'error', 'cancelled', 'canceled', 'timed_out'].includes(status)) {
    return { ok: true, state: { status: 'failed' } };
  }
  const url = extractMediaUrl(body);
  if (url) {
    return { ok: true, state: { status: 'ready', url } };
  }
  // A "succeeded" job with no file URL is a provider contract break, not a
  // pending render, so it surfaces as a 502 instead of polling forever.
  return { ok: false, failure: { status: 502, code: 'malformed_response' } };
}

// --- Provider failure → a sentence the creator can act on --------------------
// These are fixed strings chosen from the status and the provider's short
// `error.code`. The raw body, the provider message and the API key are never
// copied into `detail` or a log line, and `sk_…`-shaped text is scrubbed
// anyway, so a leak can only ever read as one of the sentences below.
const MEDIA_DETAIL_UNREACHABLE = "Couldn't reach the image and video service.";
const MEDIA_DETAIL_KEY_REJECTED =
  'The Pollinations key was rejected — check POLLINATIONS_API_KEY.';
const MEDIA_DETAIL_NO_BALANCE =
  'Your Pollinations balance is empty — top up at enter.pollinations.ai.';
// Every video model in the catalogue is paid-only, so a free key hits 402 on
// any clip (and QUEST_POLLEN_ONLY on edits that need Pollen) — the wording has
// to send them to top up instead of implying their prompt was at fault.
const MEDIA_DETAIL_VIDEO_PAID =
  'Video needs paid Pollen on your Pollinations account — free credit covers images only. Top up at enter.pollinations.ai.';
const MEDIA_DETAIL_BAD_REQUEST =
  'Pollinations rejected that prompt or model — try rewording it.';
const MEDIA_DETAIL_RATE_LIMITED =
  'Pollinations is rate-limiting us — try again in a minute.';
const MEDIA_DETAIL_PROVIDER_TROUBLE =
  'The generation service is having trouble — try again shortly.';
const MEDIA_DETAIL_UNKNOWN =
  'The image and video service could not finish that request.';

const MEDIA_DETAIL_BY_STATUS: Record<number, string> = {
  401: MEDIA_DETAIL_KEY_REJECTED,
  403: 'That API key is not allowed to use this model.',
  // 404 rides with 400/422: an unknown edit model reads the same to a creator
  // — the prompt or the model choice has to change.
  400: MEDIA_DETAIL_BAD_REQUEST,
  404: MEDIA_DETAIL_BAD_REQUEST,
  422: MEDIA_DETAIL_BAD_REQUEST,
  429: MEDIA_DETAIL_RATE_LIMITED,
  500: MEDIA_DETAIL_PROVIDER_TROUBLE,
  502: MEDIA_DETAIL_PROVIDER_TROUBLE,
  503: MEDIA_DETAIL_PROVIDER_TROUBLE,
};

/** Turns a provider failure into the short, safe sentence `detail` carries. */
function mediaFailureDetail(failure: MediaFailure, kind: 'image' | 'video'): string {
  const raw = failure.status === 0
    ? MEDIA_DETAIL_UNREACHABLE
    : failure.status === 402
      ? kind === 'video' || failure.code === 'QUEST_POLLEN_ONLY'
        ? MEDIA_DETAIL_VIDEO_PAID
        : MEDIA_DETAIL_NO_BALANCE
      : MEDIA_DETAIL_BY_STATUS[failure.status] ?? MEDIA_DETAIL_UNKNOWN;
  return raw
    .replace(/\bsk_[A-Za-z0-9_-]+/g, 'sk_[redacted]')
    .slice(0, MEDIA_DETAIL_MAX_LENGTH);
}

/**
 * The failure body the client maps onto `{ status: 'failed', detail }`.
 * `status` is the provider's HTTP status (0 = it never answered) and `detail`
 * is one of the fixed sentences above, so the creator finally learns *why*
 * instead of a bare "Couldn't create that".
 */
function mediaFailedResponse(
  failure: MediaFailure,
  kind: 'image' | 'video',
  headers: Headers,
): Response {
  // Status and code only — never a provider body or a header, so the key
  // cannot reach the logs either.
  console.error(
    `Pollinations media request failed: status=${failure.status} code=${failure.code ?? 'none'}.`,
  );
  return jsonResponse(
    {
      error: 'media_failed',
      status: failure.status,
      detail: mediaFailureDetail(failure, kind),
    },
    502,
    headers,
  );
}

async function handleMedia(request: Request, headers: Headers): Promise<Response> {
  let body: unknown;
  try {
    // An edit carries the creator's attached image inline (up to ~4 MB of
    // base64), so the limit is the attachment ceiling, not the prompt-only 8 KB.
    body = await readRequestJson(request, MEDIA_BODY_MAX_BYTES);
  } catch {
    return jsonResponse({ error: 'invalid_media_request' }, 400, headers);
  }

  let parsed: MediaGenerationRequest;
  try {
    parsed = parseMediaRequest(body);
  } catch {
    return jsonResponse({ error: 'invalid_media_request' }, 400, headers);
  }

  // Supabase secret: without it this route has no provider to talk to.
  const apiKey = optional('POLLINATIONS_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'media_not_configured' }, 503, headers);
  }

  try {
    if ('job' in parsed) {
      // Only videos run as jobs — images answer in one shot — so a poll
      // failure is always reported with video wording.
      const run = await pollMediaJob(apiKey, parsed.job);
      return run.ok
        ? jsonResponse(run.state, 200, headers)
        : mediaFailedResponse(run.failure, 'video', headers);
    }
    if (parsed.kind === 'image') {
      // A `sourceDataUri` means "change the image they gave me"; without one
      // this stays a fresh generation on the free-key default model.
      const run = parsed.sourceDataUri
        ? await requestPollinationsEdit(apiKey, parsed.prompt, parsed.sourceDataUri)
        : await requestPollinationsImage(apiKey, parsed.prompt);
      return run.ok
        ? jsonResponse(run.state, 200, headers)
        : mediaFailedResponse(run.failure, 'image', headers);
    }
    const run = await requestPollinationsVideo(apiKey, parsed.prompt, parsed.duration);
    return run.ok
      ? jsonResponse(run.state, 200, headers)
      : mediaFailedResponse(run.failure, 'video', headers);
  } catch {
    // Unexpected failures still answer with a reason — request details and the
    // API key must never appear in a response or a log line.
    return mediaFailedResponse({ status: 0, code: null }, 'image', headers);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: FunctionConfig;
  try {
    config = getConfig();
  } catch (error) {
    console.error('Creator AI function configuration is invalid.');
    return jsonResponse(
      { error: 'function_not_configured' },
      503,
      new Headers({ 'Cache-Control': 'no-store' }),
    );
  }

  const origin = request.headers.get('origin');
  const allowedOrigins = [
    config.appWebOrigin,
    ...(config.aiWebOrigin ? [config.aiWebOrigin] : []),
  ];
  const headers = responseHeaders(origin, allowedOrigins);
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!config.aiEndpoint || !config.aiApiKey || !config.aiModel) {
    return jsonResponse(
      { error: 'ai_not_configured', message: "AI analysis isn't configured yet." },
      503,
      headers,
    );
  }

  let userId: string | null;
  try {
    userId = await getAuthenticatedUser(request, config);
  } catch {
    return jsonResponse({ error: 'auth_unavailable' }, 503, headers);
  }
  if (!userId) {
    return jsonResponse({ error: 'unauthorized' }, 401, headers);
  }

  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathSegments.lastIndexOf('creator-ai');
  const route = pathSegments.slice(functionIndex + 1);

  if (request.method === 'POST' && route.length === 1 && route[0] === 'transcribe') {
    return await handleTranscribe(request, config, headers);
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'upload') {
    try {
      return await handleUploadInit(request, config, headers);
    } catch {
      return jsonResponse({ error: 'upload_service_unavailable' }, 503, headers);
    }
  }

  if (
    request.method === 'POST' &&
    route.length === 2 &&
    route[0] === 'upload' &&
    route[1] === 'chunk'
  ) {
    try {
      return await handleUploadChunk(request, config, headers);
    } catch (error) {
      console.error('upload chunk failed', error);
      return jsonResponse(
        {
          error: 'upload_service_unavailable',
          message: error instanceof Error ? error.message : String(error),
        },
        503,
        headers,
      );
    }
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'chat') {
    return await handleChat(request, config, headers);
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'ideas') {
    return await handleIdeas(request, config, headers);
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'idea-scores') {
    return await handleIdeaScores(request, config, headers);
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'media') {
    return await handleMedia(request, headers);
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'analyze') {
    try {
      return await handleAnalyze(request, userId, config, headers);
    } catch {
      console.error('Creator AI analysis endpoint failed before provider processing.');
      return jsonResponse({ error: 'analysis_service_unavailable' }, 503, headers);
    }
  }

  if (
    request.method === 'GET' &&
    route.length === 2 &&
    route[0] === 'jobs' &&
    isUuid(route[1])
  ) {
    try {
      return await handleGetJob(userId, route[1], config, headers);
    } catch {
      console.error('Creator AI job lookup failed.');
      return jsonResponse({ error: 'analysis_service_unavailable' }, 503, headers);
    }
  }

  return jsonResponse({ error: 'not_found' }, 404, headers);
});
