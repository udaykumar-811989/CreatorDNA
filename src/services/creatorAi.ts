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
  /** Inline payload for small files (≤ 3 MB). */
  base64?: string;
  /** Gemini Files API reference for larger files (up to 1 GB). */
  fileUri?: string;
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
  // Context newer servers add so the script panel can explain itself. Optional
  // because ideas already stored on the device predate these fields and must
  // keep validating on the way back in.
  why_it_works?: string;
  target_viewer?: string;
  target_length?: string;
  beats?: string[];
};

// Small files travel inline (base64 in the JSON body). Larger files stream
// straight to Gemini's resumable upload service through the backend, which
// keeps the API key server-side — videos and audio up to 1 GB, images up to
// 20 MB (Gemini's own image limit).
const INLINE_MEDIA_MAX_BYTES = 3_000_000;
export const MEDIA_SIZE_CAPS: Record<CreatorAiMedia['kind'], number> = {
  image: 20_000_000,
  video: 1_073_741_824,
  audio: 1_073_741_824,
};
// Gemini's resumable upload protocol requires every non-final chunk to be a
// multiple of 8 MiB (8,388,608 bytes); the final chunk carries the remainder.
const UPLOAD_CHUNK_BYTES = 8_388_608;

function mediaSizeError(kind: CreatorAiMedia['kind']): string {
  if (kind === 'image') {
    return 'Images can be up to 20 MB — that is the AI model’s image limit.';
  }
  return 'Videos and audio can be up to 1 GB.';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
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
  return base64;
}

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
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('The selected file is empty.');
  }
  if (buffer.byteLength > INLINE_MEDIA_MAX_BYTES) {
    throw new Error(
      'This file is too large to attach directly. Use the CreatorDNA upload (files up to 1 GB).',
    );
  }
  return { kind, mimeType, base64: arrayBufferToBase64(buffer), name };
}

async function fetchMediaBlob(uri: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(uri);
  } catch {
    throw new Error('Could not read the selected file. Please choose it again.');
  }
  if (!response.ok) {
    throw new Error('Could not read the selected file. Please choose it again.');
  }
  return await response.blob();
}

export type CreatorMediaCredentials = {
  functionUrl: string;
  anonKey: string;
  accessToken: string;
};

/** Asks the backend to mint a resumable Gemini upload session. */
export async function initCreatorMediaUpload(
  credentials: CreatorMediaCredentials,
  input: { kind: CreatorAiMedia['kind']; mimeType: string; name: string; sizeBytes: number },
): Promise<string> {
  const result = await postCreatorAi(
    credentials.functionUrl,
    credentials.anonKey,
    credentials.accessToken,
    'upload',
    {
      kind: input.kind,
      mimeType: input.mimeType,
      name: input.name.slice(0, 200),
      sizeBytes: input.sizeBytes,
    },
  );
  if (
    typeof result.uploadUrl !== 'string' ||
    !result.uploadUrl.startsWith('https://generativelanguage.googleapis.com/upload/')
  ) {
    throw new Error('CreatorDNA returned an invalid upload session. Please retry.');
  }
  return result.uploadUrl;
}

/** Streams the file to Gemini in 6 MB chunks and returns its `files/…` URI. */
export async function uploadCreatorMediaInChunks(
  credentials: CreatorMediaCredentials,
  uploadUrl: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const total = blob.size;
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, total);
    const finalize = end >= total;
    const base64 = arrayBufferToBase64(await blob.slice(offset, end).arrayBuffer());
    let sent = false;
    for (let attempt = 0; attempt < 3 && !sent; attempt += 1) {
      try {
        const result = await postCreatorAi(
          credentials.functionUrl,
          credentials.anonKey,
          credentials.accessToken,
          'upload/chunk',
          { uploadUrl, offset, base64, finalize },
          150_000,
        );
        if (finalize) {
          if (typeof result.fileUri !== 'string') {
            throw new Error('CreatorDNA returned an invalid uploaded file. Please retry.');
          }
          onProgress?.(1);
          return result.fileUri;
        }
        sent = true;
      } catch (error) {
        // Retry only chunks that never reached the server (network failure);
        // ambiguous server errors surface so the upload restarts cleanly.
        const networkFailure = error instanceof Error &&
          error.message.startsWith('Could not reach');
        if (!networkFailure || attempt === 2) {
          throw error;
        }
      }
    }
    onProgress?.(end / total);
    offset = end;
  }
  throw new Error('The upload ended early. Please try again.');
}

/**
 * Prepares a picked file for analysis/chat: small files attach inline;
 * larger ones upload to Gemini's Files API (up to 1 GB) and are referenced
 * by URI. `onProgress` receives 0–1 during large uploads.
 */
export async function attachCreatorMedia(
  uri: string,
  mimeType: string,
  name: string,
  kind: CreatorAiMedia['kind'],
  options?: {
    credentials?: CreatorMediaCredentials | null;
    onProgress?: (fraction: number) => void;
  },
): Promise<CreatorAiMedia> {
  if (mimeType.length > 100 || !mimeType.startsWith(`${kind}/`)) {
    throw new Error('This file type is not supported for that media option.');
  }
  const blob = await fetchMediaBlob(uri);
  if (blob.size === 0) {
    throw new Error('The selected file is empty.');
  }
  if (blob.size > MEDIA_SIZE_CAPS[kind]) {
    throw new Error(mediaSizeError(kind));
  }
  if (blob.size <= INLINE_MEDIA_MAX_BYTES) {
    return await readCreatorMedia(uri, mimeType, name, kind);
  }
  if (!options?.credentials) {
    throw new Error('Large files need a CreatorDNA connection to upload.');
  }
  options.onProgress?.(0);
  const uploadUrl = await initCreatorMediaUpload(options.credentials, {
    kind,
    mimeType,
    name,
    sizeBytes: blob.size,
  });
  const fileUri = await uploadCreatorMediaInChunks(
    options.credentials,
    uploadUrl,
    blob,
    options.onProgress,
  );
  return { kind, mimeType, name, fileUri };
}

// How a non-2xx body should be translated into a message. Media calls share
// the same auth plumbing but have their own contract (see `parseResponse`).
type CreatorAiResponsePurpose = 'password_auth' | 'anonymous_auth' | 'analysis' | 'media';

async function postCreatorAi(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  route: string,
  payload: Record<string, unknown>,
  timeoutMs = 90_000,
  purpose: CreatorAiResponsePurpose = 'analysis',
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`Could not reach CreatorDNA AI to ${route}. Check your connection and retry.`);
  }
  return parseResponse(response, purpose);
}

export async function transcribeCreatorAudio(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  media: CreatorAiMedia,
): Promise<string> {
  const result = await postCreatorAi(functionUrl, anonKey, accessToken, 'transcribe', {
    media: {
      kind: media.kind,
      mimeType: media.mimeType,
      ...(media.base64 ? { base64: media.base64 } : {}),
      ...(media.fileUri ? { fileUri: media.fileUri } : {}),
    },
  }, 175_000);
  if (typeof result.transcript !== 'string' || !result.transcript.trim()) {
    throw new Error('Gemini could not find clear speech in that recording. Try again or type the transcript.');
  }
  return result.transcript.trim();
}

// Free media generation (Pollinations) behind the `media` route: the provider
// key stays on the server, so the app only ever sees public file URLs or a job
// id to poll. Both helpers share the sign-in plumbing of every other route.
export type CreatorAiMediaKind = 'image' | 'video';

/** What the coach asked us to make: a visual prompt plus an optional clip length. */
export type CreatorAiMediaIntent = {
  kind: CreatorAiMediaKind;
  prompt: string;
  duration?: number;
  /** True when the coach is changing an image the creator attached. */
  edit?: boolean;
};

export type CreatorAiMediaState =
  | { status: 'ready'; url: string }
  | { status: 'pending'; job: string }
  | { status: 'failed'; detail?: string };

/**
 * A media route failure: a provider error, a request the server rejected, or
 * the feature not being switched on. Unlike every other route these resolve to
 * `{ status: 'failed', detail }` instead of throwing, so the chat can show the
 * server's reason rather than a bare "Couldn't create that".
 */
class CreatorAiMediaError extends Error {}

/** The server's `detail`, or a sensible sentence when an older server omits it. */
function mediaFailureDetail(body: Record<string, unknown>): string {
  const detail = typeof body.detail === 'string' ? body.detail.trim() : '';
  if (detail) {
    // Same ceiling the server promises, so a stray field can never balloon.
    return detail.slice(0, 200);
  }
  return body.error === 'media_failed'
    ? 'The image and video service could not finish that request.'
    : 'Image and video generation failed. Please try again.';
}

/**
 * Maps the media route's JSON onto the state the UI renders. Anything outside
 * the contract (including a "pending" answer with no job id) reads as failed,
 * so a malformed provider reply can never crash the chat screen.
 */
function toMediaState(body: Record<string, unknown>, pendingJob: string): CreatorAiMediaState {
  if (
    body.status === 'ready' &&
    typeof body.url === 'string' &&
    /^https:\/\//i.test(body.url)
  ) {
    return { status: 'ready', url: body.url };
  }
  if (body.status === 'pending') {
    const job = typeof body.job === 'string' && body.job.trim() ? body.job.trim() : pendingJob;
    if (job) {
      return { status: 'pending', job };
    }
  }
  // A failed answer may still explain itself; keep its reason when it does.
  return {
    status: 'failed',
    ...(typeof body.detail === 'string' && body.detail.trim()
      ? { detail: body.detail.trim().slice(0, 200) }
      : {}),
  };
}

async function requestCreatorMedia(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  payload: Record<string, unknown>,
  pendingJob = '',
): Promise<CreatorAiMediaState> {
  let result: Record<string, unknown>;
  try {
    // Deliberately short: the server replies as soon as it has a URL or a job
    // id — the client polls with `checkCreatorMedia` rather than waiting here.
    result = await postCreatorAi(
      functionUrl,
      anonKey,
      accessToken,
      'media',
      payload,
      45_000,
      'media',
    );
  } catch (error) {
    // Provider, request, and configuration failures become a failed state that
    // carries the server's reason, so the creator learns *why* it failed. A
    // lost connection or an expired session still surfaces as a real error.
    if (error instanceof CreatorAiMediaError) {
      return { status: 'failed', detail: error.message };
    }
    throw error;
  }
  return toMediaState(result, pendingJob);
}

/** Starts one generation: images answer `ready`, videos answer `pending`. */
export async function generateCreatorMedia(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  input: CreatorAiMediaIntent & { sourceDataUri?: string },
): Promise<CreatorAiMediaState> {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  // The creator's attached image travels only when there is one: with it the
  // server runs its edit route (change that picture), without it the plain
  // generation route (make a new one).
  const sourceDataUri = typeof input.sourceDataUri === 'string' ? input.sourceDataUri : '';
  return await requestCreatorMedia(functionUrl, anonKey, accessToken, {
    kind: input.kind,
    prompt,
    // Clips always travel with a length (15 s when the caller has no opinion);
    // the server clamps it into the 4-15 s window the provider supports.
    ...(input.kind === 'video'
      ? { duration: typeof input.duration === 'number' ? input.duration : 15 }
      : {}),
    // The coach's `edit` flag rides along for the record; the server keys the
    // edit itself off the presence of `sourceDataUri`.
    ...(typeof input.edit === 'boolean' ? { edit: input.edit } : {}),
    ...(sourceDataUri ? { sourceDataUri } : {}),
  });
}

/** Checks one video render; the job id doubles as the pending handle. */
export async function checkCreatorMedia(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  job: string,
): Promise<CreatorAiMediaState> {
  const id = typeof job === 'string' ? job.trim() : '';
  return await requestCreatorMedia(
    functionUrl,
    anonKey,
    accessToken,
    { job: id },
    id,
  );
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

// The coach can come back with a visual request alongside the reply. The
// server drops a malformed one, and so do we: a bad field never fails a good
// reply, it just goes missing.
function parseChatMediaIntent(value: unknown): CreatorAiMediaIntent | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind: CreatorAiMediaKind | null =
    value.kind === 'image' ? 'image' : value.kind === 'video' ? 'video' : null;
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!kind || !prompt || prompt.length > 600) {
    return null;
  }
  // `edit` is only carried across when it is a real boolean; a bad value is
  // dropped field-by-field so it never costs the creator a good reply.
  const edit = typeof value.edit === 'boolean' ? value.edit : undefined;
  if (value.duration === undefined || value.duration === null) {
    return edit === undefined ? { kind, prompt } : { kind, prompt, edit };
  }
  if (
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration) ||
    value.duration < 4 ||
    value.duration > 15
  ) {
    return null;
  }
  return edit === undefined
    ? { kind, prompt, duration: value.duration }
    : { kind, prompt, duration: value.duration, edit };
}

export async function sendCreatorAiChat(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  analysis: ContentAnalysis | null,
  messages: CreatorAiChatMessage[],
  message: string,
  context?: CreatorAiChatContext | null,
  attachment?: CreatorAiChatAttachmentInput | null,
): Promise<string | { reply: string; media?: CreatorAiMediaIntent }> {
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
      ...(attachment.base64 ? { base64: attachment.base64 } : {}),
      ...(attachment.fileUri ? { fileUri: attachment.fileUri } : {}),
    };
  }
  // Media attachments may reference a large uploaded file, which Gemini can
  // take a while to process — allow more time than plain text chat.
  const result = await postCreatorAi(functionUrl, anonKey, accessToken, 'chat', payload, 175_000);
  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new Error('CreatorDNA returned an empty chat reply. Please try again.');
  }
  const reply = result.reply.trim();
  // A plain reply keeps coming back as the bare string callers already expect;
  // only a reply that also asks for a visual returns the object form.
  const media = parseChatMediaIntent(result.media);
  return media ? { reply, media } : reply;
}

export type CreatorSupportReply = { reply: string; escalate: boolean };

/**
 * Help Centre assistant. Shares the chat route with the creator coach but runs
 * it in `support` mode: the backend answers from the help-centre knowledge base
 * we send along and flags `escalate` when the question needs a human, which the
 * Help screen turns into an email to support.
 */
export async function sendCreatorSupportChat(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  messages: CreatorAiChatMessage[],
  message: string,
  helpCenter: Record<string, unknown>,
): Promise<CreatorSupportReply> {
  const payload: Record<string, unknown> = {
    mode: 'support',
    messages: messages.slice(-8),
    message,
    context: { helpCenter },
  };
  const result = await postCreatorAi(functionUrl, anonKey, accessToken, 'chat', payload, 175_000);
  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new Error('CreatorDNA returned an empty reply. Please try again.');
  }
  return { reply: result.reply.trim(), escalate: result.escalate === true };
}

// The script panel's enrichment fields. Older servers omit them entirely, and
// ideas saved before the upgrade do too, so each one is copied across only
// when it is well formed — a malformed value is dropped instead of leaking an
// `undefined`-typed key into the result the screens render from.
type IdeaExtras = Partial<
  Pick<CreatorAiIdea, 'why_it_works' | 'target_viewer' | 'target_length' | 'beats'>
>;

const IDEA_EXTRA_TEXT_KEYS = ['why_it_works', 'target_viewer', 'target_length'] as const;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Beats are the Reel's spine: three to six real steps, none of them blank.
function isBeatList(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 6 &&
    value.every(isNonEmptyText);
}

function sanitizeIdeaExtras(raw: Record<string, unknown>): IdeaExtras {
  const extras: IdeaExtras = {};
  for (const key of IDEA_EXTRA_TEXT_KEYS) {
    const value = raw[key];
    if (isNonEmptyText(value)) {
      extras[key] = value.trim();
    }
  }
  if (isBeatList(raw.beats)) {
    extras.beats = raw.beats.map((beat) => beat.trim());
  }
  return extras;
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
    result.ideas.length > 7 ||
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
  // Build typed objects rather than casting the payload: the required fields
  // and priority already passed the checks above, and the extras land only if
  // they passed theirs — so an old server simply yields ideas without them.
  return (result.ideas as Record<string, unknown>[]).map((raw) => ({
    title: raw.title as string,
    hook: raw.hook as string,
    concept: raw.concept as string,
    format: raw.format as string,
    cta: raw.cta as string,
    ...(raw.priority !== undefined
      ? { priority: raw.priority as CreatorAiIdea['priority'] }
      : {}),
    ...sanitizeIdeaExtras(raw),
  }));
}

// ---------- "Analyze my idea" ----------
//
// Scores one idea the creator wrote themselves. Everything in the result is
// an AI estimate of fit — how well the idea suits this creator's audience and
// goal — and is labelled that way everywhere it is shown. It never claims to
// predict how a post will actually perform.

export type IdeaScores = {
  hook: number;
  topic_fit: number;
  audience_fit: number;
  shareability: number;
  save_potential: number;
  cta_strength: number;
};

export type IdeaScoreResult = {
  scores: IdeaScores;
  overall: number;
  improvements: string[];
  why: string;
};

const IDEA_SCORE_FIELDS: (keyof IdeaScores)[] = [
  'hook',
  'topic_fit',
  'audience_fit',
  'shareability',
  'save_potential',
  'cta_strength',
];

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

export async function scoreCreatorIdea(
  functionUrl: string,
  anonKey: string,
  accessToken: string,
  input: { idea: string; audience?: string; goal?: string; context?: string },
): Promise<IdeaScoreResult> {
  const result = await postCreatorAi(
    functionUrl,
    anonKey,
    accessToken,
    'idea-scores',
    input,
    175_000,
  );
  const scores = isRecord(result.scores) ? result.scores : null;
  const improvementsOk =
    Array.isArray(result.improvements) &&
    result.improvements.length > 0 &&
    result.improvements.every(
      (item) => typeof item === 'string' && item.trim().length > 0,
    );
  if (
    !scores ||
    !IDEA_SCORE_FIELDS.every(
      (key) => typeof scores[key] === 'number' && Number.isFinite(scores[key]),
    ) ||
    typeof result.overall !== 'number' ||
    !Number.isFinite(result.overall) ||
    !improvementsOk ||
    typeof result.why !== 'string' ||
    !result.why.trim()
  ) {
    throw new Error('CreatorDNA returned an invalid score. Please try again.');
  }
  const built = {} as IdeaScores;
  for (const key of IDEA_SCORE_FIELDS) {
    built[key] = clampScore(scores[key] as number);
  }
  return {
    scores: built,
    overall: clampScore(result.overall),
    improvements: (result.improvements as string[])
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    why: result.why.trim(),
  };
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
  purpose: CreatorAiResponsePurpose = 'analysis',
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
    // Media failures are caught by the media helpers and shown as a failed
    // state carrying the server's reason, not as an error bubble in the chat.
    if (purpose === 'media') {
      if (code === 'media_not_configured') {
        // The one media failure the server answers without a `detail`, so it
        // keeps its own sentence right here.
        throw new CreatorAiMediaError(
          'Image and video generation is not switched on yet. Add the POLLINATIONS_API_KEY secret to Supabase to enable it.',
        );
      }
      if (response.status === 401 || code === 'unauthorized') {
        // Auth is not a provider failure: the screen has to send the creator
        // back to sign-in, so this one keeps raising as a real error.
        throw new Error('Your session has expired. Sign in again to continue.');
      }
      throw new CreatorAiMediaError(mediaFailureDetail(body));
    }
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
): Promise<{ accessToken: string; refreshToken: string | null }> {
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
  return {
    accessToken: body.access_token,
    // The refresh token powers one-tap re-login for remembered accounts.
    refreshToken:
      typeof body.refresh_token === 'string' && body.refresh_token.length > 10
        ? body.refresh_token
        : null,
  };
}

export async function refreshCreatorAiSession(
  supabaseUrl: string,
  anonKey: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not reach sign-in. Check your connection and retry.');
  }
  if (!response.ok) {
    // 400/401 = the stored credential was revoked or expired (caller forgets
    // the account and falls back to password sign-in); anything else is a
    // transient Supabase hiccup worth retrying.
    throw new Error(
      response.status === 400 || response.status === 401
        ? 'saved_login_revoked'
        : 'saved_login_unavailable',
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('saved_login_unavailable');
  }
  const session = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof session.access_token !== 'string' || session.access_token.length < 20) {
    throw new Error('saved_login_unavailable');
  }
  return {
    accessToken: session.access_token,
    refreshToken:
      typeof session.refresh_token === 'string' && session.refresh_token.length > 10
        ? session.refresh_token
        : null,
  };
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
              ...(media.base64 ? { base64: media.base64 } : {}),
              ...(media.fileUri ? { fileUri: media.fileUri } : {}),
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
