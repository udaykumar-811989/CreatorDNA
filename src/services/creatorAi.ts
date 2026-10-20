export type CreatorAiJob = {
  jobId: string;
  contentId: string;
  status: 'uploaded' | 'processing' | 'analyzing' | 'completed' | 'failed';
  analysis?: ContentAnalysis | null;
  error?: string;
};

export type CreatorAiMedia = {
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  base64: string;
  name: string;
};

export type CreatorAiChatAttachmentMeta = {
  kind: 'image' | 'video';
  name: string;
  mimeType: string;
  /** Local preview uri for this session; may expire after a reload. */
  uri?: string;
};

export type CreatorAiChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachment?: CreatorAiChatAttachmentMeta;
};

/** A chat attachment ready to send: validated base64 + a local preview uri. */
export type CreatorAiChatAttachmentInput = Omit<CreatorAiMedia, 'kind'> & {
  kind: 'image' | 'video';
  name: string;
  uri: string;
};

export type CreatorAiIdea = {
  title: string;
  hook: string;
  concept: string;
  format: string;
  cta: string;
  priority?: 'high' | 'medium' | 'low';
};

const MAX_MEDIA_BYTES = 3_000_000;

export async function readCreatorMedia(
  uri: string,
  mimeType: string,
  name: string,
  kind: CreatorAiMedia['kind'],
): Promise<CreatorAiMedia> {
  if (mimeType.length > 100 || !mimeType.startsWith(`${kind}/`)) {
    throw new Error('This file type is not supported for that media option.');
  }
  let response: Response;
  try {
    response = await fetch(uri);
  } catch {
    throw new Error('Could not read the selected file. Please choose it again.');
  }
  if (!response.ok) {
    throw new Error('Could not read the selected file. Please choose it again.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('The selected file is empty.');
  }
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error('Choose a media file smaller than 3 MB for this preview.');
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    base64 += alphabet[first >> 2];
    base64 += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    base64 += second === undefined
      ? '=='
      : `${alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)]}${
        third === undefined ? '=' : alphabet[third & 63]
      }`;
  }
  return { kind, mimeType, base64, name };
}

async function postCreatorAi(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  route: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${functionUrl}/${route}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error(`Could not reach CreatorDNA AI to ${route}. Check your connection and retry.`);
  }
  return parseResponse(response);
}

export async function transcribeCreatorAudio(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  media: CreatorAiMedia,
): Promise<string> {
  const result = await postCreatorAi(functionUrl, anonKey, accessToken, 'transcribe', {
    media: { kind: media.kind, mimeType: media.mimeType, base64: media.base64 },
  });
  if (typeof result.transcript !== 'string' || !result.transcript.trim()) {
    throw new Error('Gemini could not find clear speech in that recording. Try again or type the transcript.');
  }
  return result.transcript.trim();
}

export type CreatorAiChatContext = {
  instagram?: {
    username: string | null;
    accountType: string | null;
    followers: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    recentMedia: Array<{
      mediaType: string;
      likes: number | null;
      comments: number | null;
      timestamp: string | null;
    }>;
  } | null;
  generatedIdeas?: Array<{
    title: string;
    hook: string;
    concept: string;
    format: string;
    cta: string;
  }> | null;
  creatorDna?: {
    score: number | null;
    strengths: string[];
    weaknesses: string[];
    topTopics: string[];
  } | null;
  contentPlan?: Array<{
    day: string;
    title: string;
    format: string;
    priority: string | null;
  }> | null;
  performance?: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    reach: number | null;
    followers: number | null;
    previousViews: number | null;
    topTopics: Array<{ topic: string; share: number }>;
  } | null;
  analyses?: Array<{
    title: string;
    overallScore: number | null;
    mainIssue: string | null;
    strengths: string[];
    improvements: string[];
  }> | null;
};

export async function sendCreatorAiChat(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  analysis: ContentAnalysis | null,
  messages: CreatorAiChatMessage[],
  message: string,
  context?: CreatorAiChatContext | null,
  attachment?: CreatorAiChatAttachmentInput | null,
): Promise<string> {
  const payload: Record<string, unknown> = {
    messages: messages.slice(-8),
    message,
  };
  if (analysis) {
    payload.analysis = analysis;
  }
  if (context) {
    payload.context = context;
  }
  if (attachment) {
    payload.attachment = {
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      base64: attachment.base64,
    };
  }
  const result = await postCreatorAi(functionUrl, anonKey, accessToken, 'chat', payload);
  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new Error('CreatorDNA returned an empty chat reply. Please try again.');
  }
  return result.reply.trim();
}

export async function generateCreatorIdeas(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  input: { topic: string; audience: string; goal: string },
): Promise<CreatorAiIdea[]> {
  const result = await postCreatorAi(functionUrl, anonKey, accessToken, 'ideas', input);
  if (
    !Array.isArray(result.ideas) ||
    result.ideas.length < 1 ||
    result.ideas.length > 5 ||
    !result.ideas.every((idea) =>
      isRecord(idea) &&
      ['title', 'hook', 'concept', 'format', 'cta'].every((key) =>
        typeof idea[key] === 'string' && idea[key].trim().length > 0
      ) &&
      (idea.priority === undefined ||
        idea.priority === 'high' ||
        idea.priority === 'medium' ||
        idea.priority === 'low')
    )
  ) {
    throw new Error('CreatorDNA returned an invalid idea list. Please try again.');
  }
  return result.ideas as CreatorAiIdea[];
}

export type ContentAnalysis = {
  summary: string;
  topics: { primary: string | null; secondary: string[] };
  hook: { text: string | null; type: string };
  format: string;
  structure: {
    setup: string | null;
    value: string | null;
    payoff: string | null;
    cta: string | null;
  };
  transcript_analysis: {
    clarity: string;
    specificity: string;
    information_density: string;
    repetition: string;
    confusing_sections: string[];
  };
  cta: { present: boolean; type: string | null; text: string | null };
  pacing: { assessment: 'not_assessable'; observations: string[] };
  strengths: string[];
  improvement_opportunities: string[];
  scores?: {
    hook: number | null;
    retention: number | null;
    engagement: number | null;
    content_quality: number | null;
    cta: number | null;
  };
  main_issue?: string | null;
  suggested_edit?: {
    current_opening: string | null;
    improved_opening: string | null;
  };
  evidence: { source: 'transcript' | 'caption'; quote: string }[];
  confidence: 'insufficient' | 'early' | 'moderate' | 'strong';
  limitations: string[];
  duration_seconds: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasStringFields(value: unknown, fields: string[]): boolean {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

function hasNullableStringFields(value: unknown, fields: string[]): boolean {
  return isRecord(value) &&
    fields.every((field) =>
      typeof value[field] === 'string' || value[field] === null
    );
}

// The analysis extras (scores/main_issue/suggested_edit) are optional here:
// analyses stored before the schema upgrade must keep validating.
function isValidScores(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  const keys = ['hook', 'retention', 'engagement', 'content_quality', 'cta'];
  if (Object.keys(value).length !== keys.length) {
    return false;
  }
  return keys.every((key) =>
    value[key] === null ||
    (typeof value[key] === 'number' &&
      Number.isFinite(value[key]) &&
      (value[key] as number) >= 0 &&
      (value[key] as number) <= 10)
  );
}

function isValidMainIssue(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (typeof value === 'string' && value.length <= 1000);
}

function isValidSuggestedEdit(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  return isRecord(value) &&
    Object.keys(value).length === 2 &&
    hasNullableStringFields(value, ['current_opening', 'improved_opening']);
}

function isContentAnalysis(value: unknown): value is ContentAnalysis {
  return isRecord(value) &&
    typeof value.summary === 'string' &&
    isRecord(value.topics) &&
    (typeof value.topics.primary === 'string' || value.topics.primary === null) &&
    isStringArray(value.topics.secondary) &&
    isRecord(value.hook) &&
    (typeof value.hook.text === 'string' || value.hook.text === null) &&
    typeof value.hook.type === 'string' &&
    typeof value.format === 'string' &&
    hasNullableStringFields(value.structure, ['setup', 'value', 'payoff', 'cta']) &&
    isRecord(value.transcript_analysis) &&
    hasStringFields(value.transcript_analysis, [
      'clarity',
      'specificity',
      'information_density',
      'repetition',
    ]) &&
    isStringArray(value.transcript_analysis.confusing_sections) &&
    isRecord(value.cta) &&
    typeof value.cta.present === 'boolean' &&
    (typeof value.cta.type === 'string' || value.cta.type === null) &&
    (typeof value.cta.text === 'string' || value.cta.text === null) &&
    isRecord(value.pacing) &&
    value.pacing.assessment === 'not_assessable' &&
    isStringArray(value.pacing.observations) &&
    isStringArray(value.strengths) &&
    isStringArray(value.improvement_opportunities) &&
    isValidScores(value.scores) &&
    isValidMainIssue(value.main_issue) &&
    isValidSuggestedEdit(value.suggested_edit) &&
    Array.isArray(value.evidence) &&
    value.evidence.every((item) =>
      isRecord(item) &&
      (item.source === 'transcript' || item.source === 'caption' || item.source === 'media') &&
      typeof item.quote === 'string'
    ) &&
    (value.confidence === 'insufficient' ||
      value.confidence === 'early' ||
      value.confidence === 'moderate' ||
      value.confidence === 'strong') &&
    isStringArray(value.limitations) &&
    (typeof value.duration_seconds === 'number' || value.duration_seconds === null);
}

async function parseResponse(
  response: Response,
  purpose: 'password_auth' | 'anonymous_auth' | 'analysis' = 'analysis',
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('CreatorDNA returned an unreadable response. Please try again.');
  }
  if (!isRecord(body)) {
    throw new Error('CreatorDNA returned an invalid response. Please try again.');
  }
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : '';
    if (purpose !== 'analysis') {
      const authCode = typeof body.error_code === 'string'
        ? body.error_code
        : typeof body.code === 'string'
          ? body.code
          : '';
      if (
        purpose === 'anonymous_auth' &&
        (authCode === 'anonymous_provider_disabled' ||
          authCode === 'anonymous_sign_ins_disabled')
      ) {
        throw new Error('Guest analysis is not enabled. Enable anonymous sign-ins in Supabase Auth settings.');
      }
      if (response.status === 429 || authCode === 'over_request_rate_limit') {
        throw new Error(
          purpose === 'anonymous_auth'
            ? 'Too many guest sessions. Wait a little and try again.'
            : 'Too many sign-in attempts. Wait a little and try again.',
        );
      }
      if (purpose === 'anonymous_auth') {
        throw new Error('Could not start a guest session. Please try again shortly.');
      }
      if (authCode === 'email_not_confirmed') {
        throw new Error('Confirm your email address before signing in.');
      }
      if (
        response.status === 400 ||
        authCode === 'invalid_credentials' ||
        authCode === 'user_not_found'
      ) {
        throw new Error('Email or password is incorrect. Check both and try again.');
      }
      throw new Error('Supabase sign-in is unavailable. Please try again shortly.');
    }
    if (response.status === 401 || code === 'unauthorized') {
      throw new Error('Your session has expired. Sign in again to continue.');
    }
    if (code === 'ai_not_configured') {
      throw new Error("AI analysis isn't configured yet.");
    }
    if (code === 'provider_unavailable' || code === 'analysis_service_unavailable') {
      throw new Error('CreatorDNA AI is temporarily unavailable. Please try again.');
    }
    if (code === 'provider_rejected') {
      throw new Error('The AI provider rejected the request. Check the provider URL, model, and API key configuration.');
    }
    throw new Error('CreatorDNA could not analyze this content. Please review it and retry.');
  }
  return body;
}

export async function signInForCreatorAi(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim(), password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not reach sign-in. Check your connection and retry.');
  }

  const body = await parseResponse(response, 'password_auth');
  if (typeof body.access_token !== 'string' || body.access_token.length < 20) {
    throw new Error('Sign-in returned an invalid session. Please try again.');
  }
  return body.access_token;
}

export async function signInAnonymouslyForCreatorAi(
  supabaseUrl: string,
  anonKey: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not start a guest session. Check your connection and retry.');
  }

  const body = await parseResponse(response, 'anonymous_auth');
  if (typeof body.access_token !== 'string' || body.access_token.length < 20) {
    throw new Error('Guest session setup returned an invalid session. Please try again.');
  }
  return body.access_token;
}

export async function submitCreatorContent(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  input: {
    idempotencyKey: string;
    title: string;
    transcript: string | null;
    caption: string | null;
    metrics: Record<string, number>;
  },
  media?: CreatorAiMedia | null,
): Promise<CreatorAiJob> {
  let response: Response;
  try {
    response = await fetch(`${functionUrl}/analyze`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...input,
        ...(media
          ? {
            media: {
              kind: media.kind,
              mimeType: media.mimeType,
              base64: media.base64,
              name: media.name,
            },
          }
          : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error('Could not reach CreatorDNA AI. Check your connection and retry.');
  }

  const body = await parseResponse(response);
  if (
    typeof body.jobId !== 'string' ||
    (body.status !== 'processing' &&
      body.status !== 'analyzing' &&
      body.status !== 'completed' &&
      body.status !== 'failed')
  ) {
    throw new Error('CreatorDNA returned an invalid analysis job. Please retry.');
  }

  return {
    jobId: body.jobId,
    contentId: typeof body.contentId === 'string' ? body.contentId : '',
    status: body.status,
    analysis: isContentAnalysis(body.analysis) ? body.analysis : null,
    error: friendlyJobError(body.error),
  };
}

export async function getCreatorAiJob(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  jobId: string,
): Promise<CreatorAiJob> {
  let response: Response;
  try {
    response = await fetch(`${functionUrl}/jobs/${encodeURIComponent(jobId)}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not refresh analysis status. Check your connection and retry.');
  }
  const body = await parseResponse(response);
  if (
    typeof body.jobId !== 'string' ||
    (body.status !== 'uploaded' &&
      body.status !== 'processing' &&
      body.status !== 'analyzing' &&
      body.status !== 'completed' &&
      body.status !== 'failed')
  ) {
    throw new Error('CreatorDNA returned an invalid job status.');
  }
  return {
    jobId: body.jobId,
    contentId: typeof body.contentId === 'string' ? body.contentId : '',
    status: body.status,
    analysis: isContentAnalysis(body.analysis) ? body.analysis : null,
    error: friendlyJobError(body.errorCode),
  };
}

function friendlyJobError(value: unknown): string | undefined {
  switch (value) {
    case 'provider_unavailable':
      return 'The AI provider is temporarily unavailable. Please retry.';
    case 'provider_rejected':
      return 'The AI provider rejected the request. Check its URL, model, and key configuration.';
    case 'malformed_model_response':
      return 'The AI provider returned invalid JSON. Check the model configuration and retry.';
    case 'invalid_analysis':
      return 'The AI provider response did not pass CreatorDNA’s content and evidence checks. Please retry.';
    case 'ai_not_configured':
      return "AI analysis isn't configured yet.";
    case 'database_unavailable':
      return 'CreatorDNA could not save the analysis. Please retry.';
    case 'analysis_failed':
      return 'Analysis failed. Check the Edge Function logs for details, then retry.';
    case undefined:
    case null:
      return undefined;
    default:
      return 'Analysis failed. Please retry.';
  }
}
