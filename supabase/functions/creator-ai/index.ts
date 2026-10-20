import {
  analyzeContent,
  CreatorAiError,
  CreatorAiMedia,
  CreatorContentInput,
  createAiProvider,
  parseChatAttachment,
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
    !allowedMediaTypes[value.kind].includes(value.mimeType) ||
    typeof value.base64 !== 'string' ||
    value.base64.length === 0 ||
    value.base64.length > mediaMaxBase64Length ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
      .test(value.base64)
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
  properties: { reply: { type: 'string' } },
} as const;

const ideasSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'hook', 'concept', 'format', 'cta', 'priority'],
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          concept: { type: 'string' },
          format: { type: 'string' },
          cta: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
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
  if (!analysis && !context) {
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
      'You are CreatorDNA, a warm, friendly, practical creator coach with visibility into the creator’s whole app. Speak naturally like a helpful friend, not a report or corporate bot. You are given any of the following: a content analysis, app context (their Instagram profile, follower and engagement stats, recent media, generated Reel ideas, saved content plan, Creator DNA profile and scores, and performance stats), the recent conversation, and optionally one image or video the creator attached to their latest message. If an attachment is present, look at it carefully and reference its real contents. Answer questions and give actionable advice using all of it. Do not invent facts, metrics, or claims; say so plainly when something is unknown or was not provided. Keep replies focused and actionable. Return JSON with one string field named "reply".',
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
    return jsonResponse({ reply: result.reply }, 200, headers);
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
      'You are CreatorDNA, a friendly, imaginative short-form video idea partner. Generate specific, original, practical ideas tailored to the creator inputs. Avoid generic trend claims, fake facts, and guaranteed performance promises. Return exactly five ideas as JSON with title, hook, concept, format, and cta strings for every idea, plus a priority of "high", "medium", or "low" reflecting how well that idea fits the creator inputs (best fit first).',
      JSON.stringify({ topic, audience, goal }),
      ideasSchema,
    );
    if (
      !isRecord(result) ||
      !Array.isArray(result.ideas) ||
      result.ideas.length !== 5 ||
      !result.ideas.every((idea) =>
        isRecord(idea) &&
        ['title', 'hook', 'concept', 'format', 'cta'].every((key) =>
          typeof idea[key] === 'string' &&
          idea[key].trim().length > 0 &&
          idea[key].length <= 1200
        ) &&
        ['high', 'medium', 'low'].includes(String(idea.priority))
      )
    ) {
      throw new CreatorAiError('malformed_model_response');
    }
    return jsonResponse({ ideas: result.ideas }, 200, headers);
  } catch (error) {
    const code = error instanceof CreatorAiError ? error.code : 'analysis_failed';
    return jsonResponse({ error: code }, 502, headers);
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

  if (request.method === 'POST' && route.length === 1 && route[0] === 'chat') {
    return await handleChat(request, config, headers);
  }

  if (request.method === 'POST' && route.length === 1 && route[0] === 'ideas') {
    return await handleIdeas(request, config, headers);
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
