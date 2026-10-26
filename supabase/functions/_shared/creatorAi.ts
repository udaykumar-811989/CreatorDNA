export const CONTENT_ANALYSIS_SYSTEM_PROMPT = `You are CreatorDNA, an AI growth analyst for creators. Analyze only the specific creator content supplied in this request. Do not use generic social-media claims as if they were personal findings.

Rules:
- Judge the content itself: the words, the hook, the structure, the pacing, and the visual and audio choices. Supplied metrics (views, likes, comments) are context only — never the conclusion, never the evidence, and never a reason for a score. Never rank or excuse the content by its numbers, and never say a score is low because views are low.
- Every score, strength, opportunity, and summary statement must be traceable to something observable in the transcript, caption, or attached media — not to a metric.
- Use only the provided transcript, caption, topic, format, duration, metrics, and attached media. Never fabricate details, quotes, metrics, or access to data.
- This is content analysis, not performance analysis. Do not claim why content succeeded or failed, predict views, or guarantee growth.
- Separate observable details from interpretation. If information is missing, say it is not assessable and add a limitation.
- Only assess visual/audio details if attached media is actually present. Pacing remains not assessable from transcripts or images alone.
- Supplied metrics are context only. Do not assess performance or infer why the content succeeded or failed.
- For transcript/caption evidence, quote an exact substring. For media evidence, describe only directly observable details and identify its source as media.
- Quote at least two exact evidence substrings from the transcript or caption whenever that text supports what you found; the schema caps how many entries you may return, so pick the quotes that carry the most weight instead of padding the list.
- Keep creator-facing wording concise, specific, and actionable.
- Score content craft on a 0-10 scale (one decimal place) for hook, retention, engagement, content_quality, and cta when the supplied transcript, caption, or attached media supports a judgment; use null when it does not. These score the craft of the content itself — never predicted reach, watch time, or performance.
- Apply the same rubric to all five scores: 0-2 = missing or broken, 3-4 = weak, 5-6 = workable but unremarkable, 7-8 = strong, 9-10 = exceptional. Use the whole range instead of clustering at 5-7, and keep every score you give supportable from the supplied material — a score the material cannot justify is null, not a comfortable middle value.
- Retention scores how the content holds attention through its structure (opening pace, information flow, payoff placement) based on what is written or shown — not a forecast of audience retention.
- summary: 2-4 creator-facing sentences stating what the content is, how it is structured, and its single strongest and weakest element.
- strengths: 3-6 items where the supplied material supports them, and each one must be specific to this content, pointing at something concrete in it (an actual line, beat, or visual). Generic advice is forbidden — "add value" and "be consistent" are never acceptable.
- improvement_opportunities: 3-6 items where the supplied material supports them, each phrased as one concrete change — what to change and what to change it into — and each tied to something concrete in this content, never generic advice.
- strengths and improvement_opportunities must not duplicate each other: no item may appear, or be restated in different words, on both lists.
- main_issue: the single clearest craft problem in this content stated specifically, or null when no problem is supported by the material.
- suggested_edit: current_opening must be an exact substring of the transcript or caption (the opening line as written); improved_opening is a stronger rewrite of that same opening. Use null for either field when the material does not support it.
- Return one JSON object matching the requested schema exactly. Do not include markdown or extra keys.`;

export type CreatorAiMedia = {
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  /** Inline payload for small files (≤ 3 MB). */
  base64?: string;
  /** Gemini Files API reference for larger files (up to 1 GB). */
  fileUri?: string;
};

export const contentAnalysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'topics',
    'hook',
    'format',
    'structure',
    'transcript_analysis',
    'cta',
    'pacing',
    'strengths',
    'improvement_opportunities',
    'scores',
    'main_issue',
    'suggested_edit',
    'evidence',
    'confidence',
    'limitations',
  ],
  properties: {
    summary: { type: 'string' },
    topics: {
      type: 'object',
      additionalProperties: false,
      required: ['primary', 'secondary'],
      properties: {
        primary: { type: ['string', 'null'] },
        secondary: { type: 'array', items: { type: 'string' } },
      },
    },
    hook: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'type'],
      properties: {
        text: { type: ['string', 'null'] },
        type: {
          type: 'string',
          enum: [
            'question',
            'bold_statement',
            'curiosity',
            'problem',
            'story',
            'result_first',
            'contrarian',
            'other',
            'not_assessable',
          ],
        },
      },
    },
    format: {
      type: 'string',
      enum: [
        'talking_head',
        'tutorial',
        'story',
        'list',
        'pov',
        'demonstration',
        'montage',
        'commentary',
        'other',
        'not_assessable',
      ],
    },
    structure: {
      type: 'object',
      additionalProperties: false,
      required: ['setup', 'value', 'payoff', 'cta'],
      properties: {
        setup: { type: ['string', 'null'] },
        value: { type: ['string', 'null'] },
        payoff: { type: ['string', 'null'] },
        cta: { type: ['string', 'null'] },
      },
    },
    transcript_analysis: {
      type: 'object',
      additionalProperties: false,
      required: [
        'clarity',
        'specificity',
        'information_density',
        'repetition',
        'confusing_sections',
      ],
      properties: {
        clarity: { type: 'string' },
        specificity: { type: 'string' },
        information_density: { type: 'string' },
        repetition: { type: 'string' },
        confusing_sections: { type: 'array', items: { type: 'string' } },
      },
    },
    cta: {
      type: 'object',
      additionalProperties: false,
      required: ['present', 'type', 'text'],
      properties: {
        present: { type: 'boolean' },
        type: {
          type: ['string', 'null'],
          enum: ['follow', 'comment', 'share', 'save', 'click', 'purchase', 'subscribe', 'other', null],
        },
        text: { type: ['string', 'null'] },
      },
    },
    pacing: {
      type: 'object',
      additionalProperties: false,
      required: ['assessment', 'observations'],
      properties: {
        assessment: { type: 'string', enum: ['not_assessable'] },
        observations: { type: 'array', items: { type: 'string' }, maxItems: 0 },
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    improvement_opportunities: { type: 'array', items: { type: 'string' } },
    scores: {
      type: 'object',
      additionalProperties: false,
      required: ['hook', 'retention', 'engagement', 'content_quality', 'cta'],
      properties: {
        hook: { type: ['number', 'null'] },
        retention: { type: ['number', 'null'] },
        engagement: { type: ['number', 'null'] },
        content_quality: { type: ['number', 'null'] },
        cta: { type: ['number', 'null'] },
      },
    },
    main_issue: { type: ['string', 'null'] },
    suggested_edit: {
      type: 'object',
      additionalProperties: false,
      required: ['current_opening', 'improved_opening'],
      properties: {
        current_opening: { type: ['string', 'null'] },
        improved_opening: { type: ['string', 'null'] },
      },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'quote'],
        properties: {
          source: { type: 'string', enum: ['transcript', 'caption', 'media'] },
          quote: { type: 'string' },
        },
      },
    },
    confidence: { type: 'string', enum: ['insufficient', 'early', 'moderate', 'strong'] },
    limitations: { type: 'array', items: { type: 'string' } },
  },
} as const;

export type CreatorContentInput = {
  title: string;
  transcript: string | null;
  caption: string | null;
  topic: string | null;
  format: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  metrics: Record<string, number>;
};

export type ContentAnalysis = {
  summary: string;
  topics: { primary: string | null; secondary: string[] };
  hook: {
    text: string | null;
    type:
      | 'question'
      | 'bold_statement'
      | 'curiosity'
      | 'problem'
      | 'story'
      | 'result_first'
      | 'contrarian'
      | 'other'
      | 'not_assessable';
  };
  format:
    | 'talking_head'
    | 'tutorial'
    | 'story'
    | 'list'
    | 'pov'
    | 'demonstration'
    | 'montage'
    | 'commentary'
    | 'other'
    | 'not_assessable';
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
  scores: {
    hook: number | null;
    retention: number | null;
    engagement: number | null;
    content_quality: number | null;
    cta: number | null;
  };
  main_issue: string | null;
  suggested_edit: {
    current_opening: string | null;
    improved_opening: string | null;
  };
  evidence: { source: 'transcript' | 'caption'; quote: string }[];
  confidence: 'insufficient' | 'early' | 'moderate' | 'strong';
  limitations: string[];
  duration_seconds: number | null;
};

export type AiProviderConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export class CreatorAiError extends Error {
  constructor(
    readonly code:
      | 'provider_unavailable'
      | 'provider_rejected'
      | 'malformed_model_response'
      | 'invalid_analysis',
  ) {
    super(code);
    this.name = 'CreatorAiError';
  }
}

// Transient provider failures (HTTP 429/5xx, network errors) are retried with
// backoff, bounded by a total budget. The budget also covers large media:
// Gemini can take a minute or more to process an uploaded video or audio
// file (up to 1 GB via the Files API), so each attempt may run up to 150s
// while the whole call stays inside the client's media-chat fetch timeout.
const PROVIDER_RETRY_DELAYS_MS = [400, 1_200, 2_500, 5_000, 8_000];
const PROVIDER_TOTAL_BUDGET_MS = 168_000;
const PROVIDER_MAX_ATTEMPT_MS = 150_000;
const PROVIDER_MIN_ATTEMPT_MS = 5_000;

async function generateJsonWithRetry(
  attempt: (timeoutMs: number) => Promise<unknown>,
): Promise<unknown> {
  const deadline = Date.now() + PROVIDER_TOTAL_BUDGET_MS;
  let lastError: CreatorAiError = new CreatorAiError('provider_unavailable');
  for (let i = 0; i <= PROVIDER_RETRY_DELAYS_MS.length; i += 1) {
    const remaining = deadline - Date.now();
    if (i > 0 && remaining < PROVIDER_MIN_ATTEMPT_MS) break;
    try {
      return await attempt(Math.min(PROVIDER_MAX_ATTEMPT_MS, remaining));
    } catch (error) {
      if (
        !(error instanceof CreatorAiError) ||
        error.code !== 'provider_unavailable'
      ) {
        throw error;
      }
      lastError = error;
      const delay = PROVIDER_RETRY_DELAYS_MS[i];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export interface AiProvider {
  readonly model: string;
  generateJson(
    systemPrompt: string,
    userPrompt: string,
    schema?: unknown,
    media?: CreatorAiMedia | null,
  ): Promise<unknown>;
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly model: string;

  constructor(
    private readonly config: AiProviderConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.model = config.model;
  }

  async generateJson(
    systemPrompt: string,
    userPrompt: string,
    _schema?: unknown,
    media?: CreatorAiMedia | null,
  ): Promise<unknown> {
    if (media && (media.kind !== 'image' || media.fileUri || !media.base64)) {
      throw new CreatorAiError('provider_rejected');
    }
    return await generateJsonWithRetry((timeoutMs) =>
      this.generateJsonOnce(systemPrompt, userPrompt, media, timeoutMs)
    );
  }

  private async generateJsonOnce(
    systemPrompt: string,
    userPrompt: string,
    media: CreatorAiMedia | null | undefined,
    timeoutMs: number,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(this.config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: media
                ? [
                  { type: 'text', text: userPrompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${media.mimeType};base64,${media.base64}`,
                    },
                  },
                ]
                : userPrompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CreatorAiError('provider_unavailable');
    }

    if (!response.ok) {
      throw new CreatorAiError(
        response.status === 429 || response.status >= 500
          ? 'provider_unavailable'
          : 'provider_rejected',
      );
    }

    let payloadText: string;
    try {
      payloadText = await response.text();
    } catch {
      throw new CreatorAiError('malformed_model_response');
    }
    if (payloadText.length > 100_000) {
      throw new CreatorAiError('malformed_model_response');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(payloadText) as unknown;
    } catch {
      throw new CreatorAiError('malformed_model_response');
    }
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      throw new CreatorAiError('malformed_model_response');
    }
    const choice = payload.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) {
      throw new CreatorAiError('malformed_model_response');
    }
    const content = choice.message.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.flatMap((part) =>
          isRecord(part) && typeof part.text === 'string' ? [part.text] : []
        ).join('')
        : null;
    return parseModelJson(text);
  }

}

export class GeminiProvider implements AiProvider {
  readonly model: string;

  constructor(
    private readonly config: AiProviderConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.model = config.model;
  }

  async generateJson(
    systemPrompt: string,
    userPrompt: string,
    schema?: unknown,
    media?: CreatorAiMedia | null,
  ): Promise<unknown> {
    return await generateJsonWithRetry((timeoutMs) =>
      this.generateJsonOnce(systemPrompt, userPrompt, schema, media, timeoutMs)
    );
  }

  private async generateJsonOnce(
    systemPrompt: string,
    userPrompt: string,
    schema: unknown,
    media: CreatorAiMedia | null | undefined,
    timeoutMs: number,
  ): Promise<unknown> {
    let endpoint: URL;
    try {
      endpoint = new URL(this.config.endpoint);
    } catch {
      throw new CreatorAiError('provider_rejected');
    }

    if (
      endpoint.hostname !== 'generativelanguage.googleapis.com' ||
      endpoint.pathname.includes('/openai/')
    ) {
      throw new CreatorAiError('provider_rejected');
    }

    if (!endpoint.pathname.includes('/models/')) {
      endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/models/${
        encodeURIComponent(this.config.model)
      }:generateContent`;
    } else if (!endpoint.pathname.endsWith(':generateContent')) {
      endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}:generateContent`;
    }

    let mediaParts: unknown[] = [];
    if (media) {
      if (media.fileUri) {
        // Large uploads live on Gemini's Files API — reference them by URI.
        mediaParts = [{
          file_data: await resolveGeminiFileData(
            this.config,
            media.fileUri,
            media.kind,
            this.fetcher,
          ),
        }];
      } else if (media.base64) {
        mediaParts = [{
          inline_data: {
            mime_type: media.mimeType,
            data: media.base64,
          },
        }];
      } else {
        throw new CreatorAiError('provider_rejected');
      }
    }

    let response: Response;
    try {
      response = await this.fetcher(endpoint.toString(), {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { text: userPrompt },
              ...mediaParts,
            ],
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            ...(schema
              ? { responseSchema: toGeminiSchema(schema) }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CreatorAiError('provider_unavailable');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `gemini generateContent rejected: status=${response.status} body=${detail.slice(0, 300)}`,
      );
      throw new CreatorAiError(
        response.status === 429 || response.status >= 500
          ? 'provider_unavailable'
          : 'provider_rejected',
      );
    }

    let payload: unknown;
    try {
      const payloadText = await response.text();
      if (payloadText.length > 100_000) {
        throw new CreatorAiError('malformed_model_response');
      }
      payload = JSON.parse(payloadText) as unknown;
    } catch (error) {
      if (error instanceof CreatorAiError) {
        throw error;
      }
      throw new CreatorAiError('malformed_model_response');
    }

    if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
      throw new CreatorAiError('malformed_model_response');
    }
    const candidate = payload.candidates[0];
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      throw new CreatorAiError('malformed_model_response');
    }
    const text = candidate.content.parts.flatMap((part) =>
      isRecord(part) &&
        part.thought !== true &&
        typeof part.text === 'string'
        ? [part.text]
        : []
    ).join('');
    return parseModelJson(text);
  }

}

function toGeminiSchema(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CreatorAiError('provider_rejected');
  }
  const sourceTypes = Array.isArray(value.type) ? value.type : [value.type];
  const type = sourceTypes.find((item) => item !== 'null');
  const typeNames: Record<string, string> = {
    array: 'ARRAY',
    boolean: 'BOOLEAN',
    integer: 'INTEGER',
    number: 'NUMBER',
    object: 'OBJECT',
    string: 'STRING',
  };
  if (typeof type !== 'string' || !typeNames[type]) {
    throw new CreatorAiError('provider_rejected');
  }

  const schema: Record<string, unknown> = { type: typeNames[type] };
  if (sourceTypes.includes('null')) {
    schema.nullable = true;
  }
  if (Array.isArray(value.required)) {
    schema.required = value.required;
  }
  if (Array.isArray(value.enum)) {
    const enumValues = value.enum.filter((item) => item !== null);
    if (enumValues.length > 0) {
      schema.enum = enumValues;
    }
  }
  if (typeof value.maxItems === 'number') {
    schema.maxItems = value.maxItems;
  }
  if (typeof value.minItems === 'number') {
    schema.minItems = value.minItems;
  }
  if (isRecord(value.properties)) {
    schema.maxProperties = Object.keys(value.properties).length;
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, child]) => [
        key,
        toGeminiSchema(child),
      ]),
    );
  }
  if (value.items !== undefined) {
    schema.items = toGeminiSchema(value.items);
  }
  return schema;
}

function parseModelJson(text: string | null): unknown {
  if (!text || text.length > 100_000) {
    throw new CreatorAiError('malformed_model_response');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CreatorAiError('malformed_model_response');
  }
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  const endpoint = new URL(config.endpoint);
  if (
    endpoint.hostname === 'generativelanguage.googleapis.com' &&
    !endpoint.pathname.includes('/openai/')
  ) {
    return new GeminiProvider(config);
  }
  return new OpenAiCompatibleProvider(config);
}

const chatAttachmentMaxBase64Length = 4_000_000;
const chatAttachmentTypes: Record<'image' | 'video', readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
};

// ---------- Large media via the Gemini Files API ----------
//
// Files up to 3 MB travel inline (base64 in the JSON body). Larger files are
// streamed straight to Gemini's resumable upload service: the client asks
// this backend to mint an upload session, forwards chunk acknowledgements,
// and afterwards references the file by its `files/…` URI. That keeps the
// API key server-side and lets creators attach up to 1 GB (videos/audio) —
// Gemini's own image limit (~20 MB) caps images.

export const geminiUploadSizeCaps: Record<CreatorAiMedia['kind'], number> = {
  image: 20_000_000,
  video: 1_073_741_824,
  audio: 1_073_741_824,
};

const uploadMimeTypes: Record<CreatorAiMedia['kind'], readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: [
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm',
    'audio/flac',
  ],
};

export type GeminiUploadInit = {
  kind: CreatorAiMedia['kind'];
  mimeType: string;
  name: string;
  sizeBytes: number;
};

export function parseUploadInitRequest(value: unknown): GeminiUploadInit {
  if (
    !isRecord(value) ||
    (value.kind !== 'image' && value.kind !== 'video' && value.kind !== 'audio') ||
    typeof value.mimeType !== 'string' ||
    !uploadMimeTypes[value.kind].includes(value.mimeType) ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    value.name.length > 200 ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isInteger(value.sizeBytes) ||
    value.sizeBytes <= 0 ||
    value.sizeBytes > geminiUploadSizeCaps[value.kind]
  ) {
    throw new Error('invalid_upload_request');
  }
  return {
    kind: value.kind,
    mimeType: value.mimeType,
    name: value.name.slice(0, 200),
    sizeBytes: value.sizeBytes,
  };
}

// Strict allow-list so a hostile client can never point the backend's chunk
// proxy at an arbitrary URL (SSRF).
export function isGeminiFileUri(value: unknown): value is string {
  return typeof value === 'string' && /^files\/[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function isGeminiUploadUrl(value: unknown, config: AiProviderConfig): value is string {
  return typeof value === 'string' &&
    value.startsWith(`${geminiOrigin(config)}/upload/`);
}

function geminiOrigin(config: AiProviderConfig): string {
  let origin: string;
  try {
    origin = new URL(config.endpoint).origin;
  } catch {
    throw new CreatorAiError('provider_rejected');
  }
  if (origin !== 'https://generativelanguage.googleapis.com') {
    throw new CreatorAiError('provider_rejected');
  }
  return origin;
}

/** Starts a resumable upload session and returns its Google-hosted URL. */
export async function createGeminiUploadSession(
  config: AiProviderConfig,
  init: GeminiUploadInit,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const origin = geminiOrigin(config);
  let response: Response;
  try {
    response = await fetcher(
      `${origin}/upload/v1beta/files?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(init.sizeBytes),
          'X-Goog-Upload-Header-Content-Type': init.mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: init.name } }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new CreatorAiError('provider_unavailable');
  }
  const uploadUrl = response.headers.get('x-goog-upload-url');
  if (!response.ok || !uploadUrl) {
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `gemini upload init rejected: status=${response.status} body=${detail.slice(0, 300)}`,
      );
    }
    throw new CreatorAiError(
      response.status === 429 || response.status >= 500
        ? 'provider_unavailable'
        : 'provider_rejected',
    );
  }
  if (!uploadUrl.startsWith(`${origin}/upload/`)) {
    throw new CreatorAiError('provider_rejected');
  }
  return uploadUrl;
}

export type GeminiUploadChunkResult =
  | { done: false }
  | { done: true; fileUri: string };

/** Forwards one already-sequenced chunk to Gemini's upload session. */
export async function forwardGeminiUploadChunk(
  config: AiProviderConfig,
  uploadUrl: string,
  chunk: { offset: number; bytes: Uint8Array; finalize: boolean },
  fetcher: typeof fetch = fetch,
): Promise<GeminiUploadChunkResult> {
  if (!isGeminiUploadUrl(uploadUrl, config)) {
    throw new CreatorAiError('provider_rejected');
  }
  let response: Response;
  try {
    response = await fetcher(uploadUrl, {
      method: 'POST',
      headers: {
        // Commands are comma-separated; "upload+finalize" is rejected as an
        // invalid command. Verified live against the Files API.
        'X-Goog-Upload-Command': chunk.finalize ? 'upload, finalize' : 'upload',
        'X-Goog-Upload-Offset': String(chunk.offset),
        'Content-Type': 'application/octet-stream',
      },
      body: chunk.bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new CreatorAiError('provider_unavailable');
  }
  if (response.status === 308) {
    // Classic "Resume Incomplete": the session accepted everything up to the
    // next offset; nothing else to read from this response.
    try {
      await response.body?.cancel();
    } catch {
      // The body may already be consumed — the status is what matters.
    }
    return { done: false };
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(
      `gemini upload chunk rejected: status=${response.status} body=${detail.slice(0, 300)}`,
    );
    throw new CreatorAiError(
      response.status === 429 || response.status >= 500
        ? 'provider_unavailable'
        : 'provider_rejected',
    );
  }
  if (!chunk.finalize) {
    // Intermediate chunks answer 200 with an empty body and
    // `x-goog-upload-status: active`.
    try {
      await response.body?.cancel();
    } catch {
      // Empty body — nothing to read.
    }
    return { done: false };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CreatorAiError('malformed_model_response');
  }
  // Finalize answers `{"file": {"name": "files/…", …}}`.
  const file = isRecord(payload) && isRecord(payload.file) ? payload.file : null;
  if (!file || !isGeminiFileUri(file.name)) {
    throw new CreatorAiError('malformed_model_response');
  }
  return { done: true, fileUri: file.name };
}

/**
 * Validates an uploaded file reference (shape, state, kind, size) and returns
 * the Gemini `file_data` part for it. Called server-side before any model
 * request, so clients can only reference files the Files API actually has.
 *
 * Fresh uploads report `PROCESSING` while Gemini prepares them (and files.get
 * can briefly 5xx mid-processing), so this polls briefly instead of rejecting
 * a creator's just-uploaded file — the failure that surfaced as
 * "provider_rejected" on video analysis.
 */
export async function resolveGeminiFileData(
  config: AiProviderConfig,
  fileUri: string,
  kind: CreatorAiMedia['kind'],
  fetcher: typeof fetch = fetch,
  options?: { sleep?: (ms: number) => Promise<void>; maxWaitMs?: number },
): Promise<{ file_uri: string; mime_type: string }> {
  const origin = geminiOrigin(config);
  if (!isGeminiFileUri(fileUri)) {
    throw new CreatorAiError('provider_rejected');
  }
  const sleep = options?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const maxWaitMs = options?.maxWaitMs ?? 45_000;
  const url = `${origin}/v1beta/${fileUri}?key=${encodeURIComponent(config.apiKey)}`;

  const deadline = Date.now() + maxWaitMs;
  let payload: Record<string, unknown> | null = null;
  let lastError: CreatorAiError | null = null;
  while (payload === null) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error(
          `gemini files.get: status=${response.status} body=${detail.slice(0, 200)}`,
        );
        // A missing or forbidden file won't become valid by waiting; 429/5xx
        // and mid-processing blips might.
        if (response.status !== 429 && response.status < 500) {
          throw new CreatorAiError('provider_rejected');
        }
        lastError = new CreatorAiError('provider_unavailable');
      } else {
        const body: unknown = await response.json();
        if (!isRecord(body) || body.name !== fileUri) {
          throw new CreatorAiError('provider_rejected');
        }
        if (body.state === 'FAILED') {
          throw new CreatorAiError('provider_rejected');
        }
        if (body.state === 'ACTIVE') {
          payload = body;
        } else {
          // PROCESSING (or an unknown transient state) — keep waiting.
          lastError = new CreatorAiError('provider_unavailable');
        }
      }
    } catch (error) {
      if (error instanceof CreatorAiError && error.code === 'provider_rejected') {
        throw error;
      }
      lastError = error instanceof CreatorAiError
        ? error
        : new CreatorAiError('provider_unavailable');
    }
    if (payload === null) {
      if (Date.now() >= deadline) {
        throw lastError ?? new CreatorAiError('provider_unavailable');
      }
      await sleep(1_500);
    }
  }
  if (
    typeof payload.mimeType !== 'string' ||
    !payload.mimeType.startsWith(`${kind}/`)
  ) {
    throw new CreatorAiError('provider_rejected');
  }
  // sizeBytes arrives as a string in the Files API.
  if (typeof payload.sizeBytes === 'string') {
    const size = Number(payload.sizeBytes);
    if (Number.isFinite(size) && size > geminiUploadSizeCaps[kind]) {
      throw new CreatorAiError('provider_rejected');
    }
  }
  return {
    file_uri: `${origin}/v1beta/${fileUri}`,
    mime_type: payload.mimeType,
  };
}

/**
 * Linear base64 shape check for multi-MB payloads. The grouped equivalent
 * (`^(?:[A-Za-z0-9+/]{4})*…`) recurses once per group in V8's regexp engine
 * and overflows the call stack at ~6 MB of input — this form stays iterative.
 */
export function isBase64Shape(value: string): boolean {
  return value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

// One image or video attached to a chat message, either inline (small files)
// or by Files API reference. Audio is intentionally excluded — the chat
// surface only offers image and video attachments.
export function parseChatAttachment(value: unknown): CreatorAiMedia | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    (value.kind !== 'image' && value.kind !== 'video') ||
    typeof value.mimeType !== 'string' ||
    !chatAttachmentTypes[value.kind].includes(value.mimeType)
  ) {
    throw new Error('invalid_attachment');
  }
  if (typeof value.fileUri === 'string') {
    if (!isGeminiFileUri(value.fileUri)) {
      throw new Error('invalid_attachment');
    }
    return {
      kind: value.kind,
      mimeType: value.mimeType,
      fileUri: value.fileUri,
    };
  }
  if (
    typeof value.base64 !== 'string' ||
    value.base64.length > chatAttachmentMaxBase64Length ||
    !isBase64Shape(value.base64)
  ) {
    throw new Error('invalid_attachment');
  }
  return {
    kind: value.kind,
    mimeType: value.mimeType,
    base64: value.base64,
  };
}

export function buildContentAnalysisPrompt(
  content: CreatorContentInput,
  hasMedia = false,
): string {
  return JSON.stringify({
    task: 'Analyze one creator-submitted content item. Return the object defined by the content analysis schema.',
    content: {
      title: content.title,
      transcript: content.transcript,
      caption: content.caption,
      creatorProvidedTopic: content.topic,
      creatorProvidedFormat: content.format,
      durationSeconds: content.durationSeconds,
      publishedAt: content.publishedAt,
      availableMetrics: content.metrics,
      attachedMediaAvailable: hasMedia,
    },
    outputSchema: contentAnalysisJsonSchema,
  });
}

export function validateContentAnalysis(
  value: unknown,
  content: CreatorContentInput,
  hasMedia = false,
): ContentAnalysis {
  if (!isModelContentAnalysis(value)) {
    throw new CreatorAiError('invalid_analysis');
  }
  const limitations = [...value.limitations];
  const addLimitation = (limitation: string) => {
    if (!limitations.includes(limitation)) {
      limitations.push(limitation);
    }
  };

  const evidence = value.evidence.filter((entry) => {
    const sourceText = entry.source === 'transcript'
      ? content.transcript
      : content.caption;
    return entry.source === 'media'
      ? hasMedia
      : sourceText?.includes(entry.quote) ?? false;
  });
  if (evidence.length !== value.evidence.length) {
    addLimitation(
      'Evidence quotes that did not exactly match the submitted text were omitted.',
    );
  }

  const hookText = value.hook.text;
  const hookMatchesText = hookText === null ||
    [content.transcript, content.caption].some((text) =>
      text?.includes(hookText)
    );
  const hook = value.hook.type === 'not_assessable' || !hookMatchesText
    ? { text: null, type: 'not_assessable' as const }
    : value.hook;
  if (hook.text !== value.hook.text) {
    addLimitation('The hook was not assessed because it did not exactly match the submitted text.');
  }

  const ctaIsConsistent = value.cta.present
    ? value.cta.type !== null && value.cta.text !== null
    : value.cta.type === null && value.cta.text === null;
  const cta = ctaIsConsistent
    ? value.cta
    : { present: false, type: null, text: null };
  if (!ctaIsConsistent) {
    addLimitation('The call to action was not reported because its fields were inconsistent.');
  }

  const confusingSections = value.transcript_analysis.confusing_sections.filter((section) =>
    [content.transcript, content.caption].some((text) => text?.includes(section))
  );
  if (confusingSections.length !== value.transcript_analysis.confusing_sections.length) {
    addLimitation('Confusing-section quotes that did not exactly match the submitted text were omitted.');
  }
  const currentOpening = value.suggested_edit.current_opening;
  const openingMatches = currentOpening === null ||
    [content.transcript, content.caption].some((text) => text?.includes(currentOpening));
  if (!openingMatches) {
    addLimitation('The suggested-edit opening was not an exact match of the submitted text and was omitted.');
  }
  const suggestedEdit = {
    current_opening: openingMatches ? currentOpening : null,
    improved_opening: value.suggested_edit.improved_opening,
  };

  if (value.pacing.observations.length > 0) {
    addLimitation('Pacing observations were omitted because this analysis does not inspect video or audio.');
  }

  const providedTextLength =
    (content.transcript?.trim().length ?? 0) +
    (content.caption?.trim().length ?? 0);
  return {
    ...value,
    hook,
    cta,
    evidence,
    suggested_edit: suggestedEdit,
    pacing: { assessment: 'not_assessable', observations: [] },
    transcript_analysis: {
      ...value.transcript_analysis,
      confusing_sections: confusingSections,
    },
    limitations,
    confidence:
      value.confidence === 'insufficient' || providedTextLength < 30
        ? 'insufficient'
        : 'early',
    duration_seconds: content.durationSeconds,
  };
}

export async function analyzeContent(
  provider: AiProvider,
  content: CreatorContentInput,
  media?: CreatorAiMedia | null,
): Promise<ContentAnalysis> {
  const output = await provider.generateJson(
    CONTENT_ANALYSIS_SYSTEM_PROMPT,
    buildContentAnalysisPrompt(content, Boolean(media)),
    contentAnalysisJsonSchema,
    media,
  );
  return validateContentAnalysis(output, content, Boolean(media));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModelContentAnalysis(
  value: unknown,
): value is Omit<ContentAnalysis, 'duration_seconds'> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'summary',
      'topics',
      'hook',
      'format',
      'structure',
      'transcript_analysis',
      'cta',
      'pacing',
      'strengths',
      'improvement_opportunities',
      'scores',
      'main_issue',
      'suggested_edit',
      'evidence',
      'confidence',
      'limitations',
    ])
  ) {
    return false;
  }
  const { topics, hook, structure, transcript_analysis, cta, pacing, scores, suggested_edit } = value;
  return isNonEmptyString(value.summary, 1200) &&
    isRecord(topics) &&
    hasExactKeys(topics, ['primary', 'secondary']) &&
    nullableString(topics.primary) &&
    isStringArray(topics.secondary) &&
    isRecord(hook) &&
    hasExactKeys(hook, ['text', 'type']) &&
    nullableString(hook.text) &&
    oneOf(hook.type, [
      'question', 'bold_statement', 'curiosity', 'problem', 'story',
      'result_first', 'contrarian', 'other', 'not_assessable',
    ]) &&
    oneOf(value.format, [
      'talking_head', 'tutorial', 'story', 'list', 'pov', 'demonstration',
      'montage', 'commentary', 'other', 'not_assessable',
    ]) &&
    isRecord(structure) &&
    hasExactKeys(structure, ['setup', 'value', 'payoff', 'cta']) &&
    nullableString(structure.setup) &&
    nullableString(structure.value) &&
    nullableString(structure.payoff) &&
    nullableString(structure.cta) &&
    isRecord(transcript_analysis) &&
    hasExactKeys(transcript_analysis, [
      'clarity', 'specificity', 'information_density', 'repetition', 'confusing_sections',
    ]) &&
    isNonEmptyString(transcript_analysis.clarity) &&
    isNonEmptyString(transcript_analysis.specificity) &&
    isNonEmptyString(transcript_analysis.information_density) &&
    isNonEmptyString(transcript_analysis.repetition) &&
    isStringArray(transcript_analysis.confusing_sections) &&
    isRecord(cta) &&
    hasExactKeys(cta, ['present', 'type', 'text']) &&
    typeof cta.present === 'boolean' &&
    (cta.type === null || oneOf(cta.type, [
      'follow', 'comment', 'share', 'save', 'click', 'purchase', 'subscribe', 'other',
    ])) &&
    nullableString(cta.text) &&
    isRecord(pacing) &&
    hasExactKeys(pacing, ['assessment', 'observations']) &&
    pacing.assessment === 'not_assessable' &&
    isStringArray(pacing.observations) &&
    isStringArray(value.strengths) &&
    isStringArray(value.improvement_opportunities) &&
    isRecord(scores) &&
    hasExactKeys(scores, ['hook', 'retention', 'engagement', 'content_quality', 'cta']) &&
    isCraftScore(scores.hook) &&
    isCraftScore(scores.retention) &&
    isCraftScore(scores.engagement) &&
    isCraftScore(scores.content_quality) &&
    isCraftScore(scores.cta) &&
    nullableString(value.main_issue) &&
    isRecord(suggested_edit) &&
    hasExactKeys(suggested_edit, ['current_opening', 'improved_opening']) &&
    nullableString(suggested_edit.current_opening) &&
    nullableString(suggested_edit.improved_opening) &&
    Array.isArray(value.evidence) &&
    value.evidence.length <= 12 &&
    value.evidence.every((entry) =>
      isRecord(entry) &&
      hasExactKeys(entry, ['source', 'quote']) &&
      oneOf(entry.source, ['transcript', 'caption', 'media']) &&
      isNonEmptyString(entry.quote, 2000)
    ) &&
    oneOf(value.confidence, ['insufficient', 'early', 'moderate', 'strong']) &&
    isStringArray(value.limitations);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function nullableString(value: unknown): value is string | null {
  return value === null ||
    (typeof value === 'string' && value.trim().length > 0 && value.length <= 1000);
}

function isCraftScore(value: unknown): value is number | null {
  return value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10);
}

function isNonEmptyString(value: unknown, maxLength = 1000): value is string {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength;
}

function isStringArray(value: unknown, maxItems = 20): value is string[] {
  return Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) =>
      typeof item === 'string' &&
      item.trim().length > 0 &&
      item.length <= 1000
    );
}

function oneOf<const Values extends readonly unknown[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return values.includes(value);
}
