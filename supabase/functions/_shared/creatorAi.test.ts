import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeContent,
  buildContentAnalysisPrompt,
  ContentAnalysis,
  CreatorAiError,
  CreatorContentInput,
  createAiProvider,
  GeminiProvider,
  OpenAiCompatibleProvider,
  validateContentAnalysis,
} from './creatorAi';

const baseContent: CreatorContentInput = {
  title: 'Three ways to plan a week of content',
  transcript: 'Stop guessing what to post. Start with one audience question.',
  caption: 'A simple weekly planning routine.',
  topic: 'content planning',
  format: null,
  durationSeconds: 25,
  publishedAt: null,
  metrics: {},
};

function validAnalysis(
  _content: CreatorContentInput = baseContent,
): Omit<ContentAnalysis, 'duration_seconds'> {
  return {
    summary: 'A concise tip about planning content from audience questions.',
    topics: { primary: 'content planning', secondary: ['audience research'] },
    hook: { text: 'Stop guessing what to post.', type: 'bold_statement' },
    format: 'tutorial',
    structure: {
      setup: 'The creator names the planning challenge.',
      value: 'A method is introduced.',
      payoff: null,
      cta: null,
    },
    transcript_analysis: {
      clarity: 'The opening is direct.',
      specificity: 'The opening names a clear action.',
      information_density: 'not_assessable from the available excerpt',
      repetition: 'No repetition is evident in the supplied excerpt.',
      confusing_sections: [],
    },
    cta: { present: false, type: null, text: null },
    pacing: { assessment: 'not_assessable', observations: [] },
    strengths: ['The opening addresses a recognizable task.'],
    improvement_opportunities: ['Show the planning steps in the transcript.'],
    evidence: [{
      source: 'transcript',
      quote: 'Stop guessing what to post.',
    }],
    confidence: 'strong',
    limitations: ['Only the submitted text was analyzed; no video was provided.'],
  };
}

test('validates one Reel analysis, quotes, and conservatively caps confidence', () => {
  const analysis = validateContentAnalysis(validAnalysis(), baseContent);
  assert.equal(analysis.confidence, 'early');
  assert.equal(analysis.duration_seconds, 25);
  assert.equal(analysis.evidence[0]?.quote, 'Stop guessing what to post.');
});

test('accepts caption-only analysis when transcript is missing', () => {
  const captionOnly: CreatorContentInput = {
    ...baseContent,
    transcript: null,
    caption: 'A simple weekly planning routine.',
  };
  const output = validAnalysis(captionOnly);
  output.hook = { text: 'A simple weekly planning routine.', type: 'curiosity' };
  output.evidence = [{
    source: 'caption',
    quote: 'A simple weekly planning routine.',
  }];
  const analysis = validateContentAnalysis(output, captionOnly);
  assert.equal(analysis.evidence[0]?.source, 'caption');
  assert.equal(analysis.confidence, 'early');
});

test('omits fabricated evidence and marks an unsupported hook unassessable', () => {
  const fabricated = validAnalysis();
  fabricated.evidence = [{ source: 'transcript', quote: 'This quote is invented.' }];
  fabricated.hook = { text: 'A fabricated hook', type: 'curiosity' };
  const safeAnalysis = validateContentAnalysis(fabricated, baseContent);
  assert.deepEqual(safeAnalysis.evidence, []);
  assert.deepEqual(safeAnalysis.hook, { text: null, type: 'not_assessable' });
  assert.ok(safeAnalysis.limitations.some((item) => item.includes('Evidence quotes')));
  assert.ok(safeAnalysis.limitations.some((item) => item.includes('hook was not assessed')));
});

test('rejects malformed or extra response fields', () => {
  const malformed = { ...validAnalysis(), unexpected: 'not allowed' };
  assert.throws(
    () => validateContentAnalysis(malformed, baseContent),
    (error: unknown) =>
      error instanceof CreatorAiError && error.code === 'invalid_analysis',
  );
});

test('normalizes pacing observations and inconsistent CTA without inventing details', () => {
  const output = validAnalysis();
  output.pacing.observations = ['The video has quick cuts.'];
  output.cta = { present: false, type: 'follow', text: 'Follow for more.' };

  const safeAnalysis = validateContentAnalysis(output, baseContent);

  assert.deepEqual(safeAnalysis.pacing, {
    assessment: 'not_assessable',
    observations: [],
  });
  assert.deepEqual(safeAnalysis.cta, { present: false, type: null, text: null });
  assert.ok(safeAnalysis.limitations.some((item) => item.includes('Pacing observations')));
  assert.ok(safeAnalysis.limitations.some((item) => item.includes('call to action')));
});

test('long transcript and partial metrics are scoped to this one content request', () => {
  const longContent = {
    ...baseContent,
    transcript: 'A useful sentence about a creator workflow. '.repeat(300),
    metrics: { views: 0, likes: 12 },
  };
  const prompt = buildContentAnalysisPrompt(longContent);
  assert.ok(prompt.length > 10_000);
  assert.match(prompt, /"views":0/);
  assert.match(prompt, /"likes":12/);
  assert.doesNotMatch(prompt, /shares/);
});

test('returns an error when the provider response is malformed', async () => {
  const provider = new OpenAiCompatibleProvider(
    { endpoint: 'https://ai.example.test/v1/chat/completions', apiKey: 'test', model: 'fast' },
    async () => Response.json({ choices: [{ message: { content: 'not json' } }] }),
  );
  await assert.rejects(
    () => analyzeContent(provider, baseContent),
    (error: unknown) =>
      error instanceof CreatorAiError &&
      error.code === 'malformed_model_response',
  );
});

test('Gemini native API receives native request format and parses candidate text', async () => {
  let requestedUrl = '';
  let requestedApiKey = '';
  let requestedBody: Record<string, unknown> = {};
  const provider = new GeminiProvider(
    {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-test-key',
      model: 'gemini-test-model',
    },
    async (input, init) => {
      requestedUrl = String(input);
      requestedApiKey = new Headers(init?.headers).get('x-goog-api-key') ?? '';
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        candidates: [{
          content: { parts: [{ text: '{"valid":true}' }] },
        }],
      });
    },
  );

  const result = await provider.generateJson('system', 'user', {
    type: 'object',
    required: ['valid'],
    properties: { valid: { type: 'boolean' } },
  });

  assert.equal(
    requestedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
  );
  assert.equal(requestedApiKey, 'gemini-test-key');
  assert.deepEqual(result, { valid: true });
  assert.deepEqual(requestedBody.contents, [{ role: 'user', parts: [{ text: 'user' }] }]);
  assert.deepEqual(requestedBody.systemInstruction, { parts: [{ text: 'system' }] });
  const generationConfig = requestedBody.generationConfig;
  assert.ok(typeof generationConfig === 'object' && generationConfig !== null);
  const geminiConfig = generationConfig as Record<string, unknown>;
  assert.equal(geminiConfig.temperature, 0.2);
  assert.equal(geminiConfig.responseMimeType, 'application/json');
  const responseSchema = geminiConfig.responseSchema;
  assert.ok(typeof responseSchema === 'object' && responseSchema !== null);
  const rootSchema = responseSchema as Record<string, unknown>;
  assert.equal(rootSchema.type, 'OBJECT');
  assert.deepEqual(rootSchema.required, ['valid']);
  const rootProperties = rootSchema.properties;
  assert.ok(typeof rootProperties === 'object' && rootProperties !== null);
  assert.deepEqual((rootProperties as Record<string, unknown>).valid, { type: 'BOOLEAN' });
});

test('Gemini provider preserves an explicitly configured generateContent endpoint', async () => {
  let requestedUrl = '';
  const provider = new GeminiProvider(
    {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
      apiKey: 'gemini-test-key',
      model: 'gemini-test-model',
    },
    async (input) => {
      requestedUrl = String(input);
      return Response.json({
        candidates: [{ content: { parts: [{ text: '{"valid":true}' }] } }],
      });
    },
  );

  await provider.generateJson('system', 'user');

  assert.equal(
    requestedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
  );
});

test('provider factory uses OpenAI-compatible Gemini endpoint when configured', () => {
  const provider = createAiProvider({
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    apiKey: 'gemini-test-key',
    model: 'gemini-test-model',
  });

  assert.ok(provider instanceof OpenAiCompatibleProvider);
});

test('OpenAI-compatible parser accepts text parts in a multipart response', async () => {
  const provider = new OpenAiCompatibleProvider(
    { endpoint: 'https://ai.example.test/v1/chat/completions', apiKey: 'test', model: 'fast' },
    async () => Response.json({
      choices: [{
        message: {
          content: [{ type: 'text', text: '{"valid":' }, { type: 'text', text: 'true}' }],
        },
      }],
    }),
  );

  assert.deepEqual(await provider.generateJson('system', 'user'), { valid: true });
});

test('returns a provider error without exposing its response body', async () => {
  const provider = new OpenAiCompatibleProvider(
    { endpoint: 'https://ai.example.test/v1/chat/completions', apiKey: 'test', model: 'fast' },
    async () => Response.json({ error: { message: 'secret provider detail' } }, { status: 429 }),
  );
  await assert.rejects(
    () => analyzeContent(provider, baseContent),
    (error: unknown) =>
      error instanceof CreatorAiError && error.code === 'provider_unavailable',
  );
});

test('zero and missing metrics remain exactly as supplied', () => {
  const noMetrics = { ...baseContent, metrics: {} };
  const zeroMetrics = { ...baseContent, metrics: { views: 0 } };
  assert.match(buildContentAnalysisPrompt(noMetrics), /"availableMetrics":\{\}/);
  assert.match(buildContentAnalysisPrompt(zeroMetrics), /"availableMetrics":\{"views":0\}/);
});
