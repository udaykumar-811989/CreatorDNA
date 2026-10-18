export const CONTENT_ANALYSIS_SYSTEM_PROMPT = `You are Veyyra, an AI growth analyst for creators. Analyze only the specific creator content supplied in this request. Do not use generic social-media claims as if they were personal findings.

Rules:
- Use only the provided transcript, caption, topic, format, duration, metrics, and attached media. Never fabricate details, quotes, metrics, or access to data.
- This is content analysis, not performance analysis. Do not claim why content succeeded or failed, predict views, or guarantee growth.
- Separate observable details from interpretation. If information is missing, say it is not assessable and add a limitation.
- Only assess visual/audio details if attached media is actually present. Pacing remains not assessable from transcripts or images alone.
- Supplied metrics are context only. Do not assess performance or infer why the content succeeded or failed.
- For transcript/caption evidence, quote an exact substring. For media evidence, describe only directly observable details and identify its source as media.
- Keep creator-facing wording concise, specific, and actionable.
- Return one JSON object matching the requested schema exactly. Do not include markdown or extra keys.`;

export type CreatorAiMedia = {
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  base64: string;
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
    if (media && media.kind !== 'image') {
      throw new CreatorAiError('provider_rejected');
    }
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
        signal: AbortSignal.timeout(60_000),
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
              ...(media
                ? [{
                  inline_data: {
                    mime_type: media.mimeType,
                    data: media.base64,
                  },
                }]
                : []),
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
        signal: AbortSignal.timeout(60_000),
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
      'evidence',
      'confidence',
      'limitations',
    ])
  ) {
    return false;
  }
  const { topics, hook, structure, transcript_analysis, cta, pacing } = value;
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
