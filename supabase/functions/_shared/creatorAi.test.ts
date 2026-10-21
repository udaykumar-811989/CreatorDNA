import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeContent,
  buildContentAnalysisPrompt,
  ContentAnalysis,
  createGeminiUploadSession,
  CreatorAiError,
  CreatorContentInput,
  createAiProvider,
  forwardGeminiUploadChunk,
  GeminiProvider,
  geminiUploadSizeCaps,
  isBase64Shape,
  isGeminiFileUri,
  OpenAiCompatibleProvider,
  parseChatAttachment,
  parseUploadInitRequest,
  resolveGeminiFileData,
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
    scores: {
      hook: 8.2,
      retention: 7.4,
      engagement: 6.9,
      content_quality: 8,
      cta: null,
    },
    main_issue: 'The excerpt does not show a payoff or a closing call to action.',
    suggested_edit: {
      current_opening: 'Stop guessing what to post.',
      improved_opening: 'Stop guessing what to post — start with the one question your audience asks every week.',
    },
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

test('drops a suggested opening that is not an exact quote and validates score ranges', () => {
  const output = validAnalysis();
  output.suggested_edit = {
    current_opening: 'This opening was never said.',
    improved_opening: 'A stronger rewrite of the opening.',
  };
  const safeAnalysis = validateContentAnalysis(output, baseContent);
  assert.equal(safeAnalysis.suggested_edit.current_opening, null);
  assert.equal(
    safeAnalysis.suggested_edit.improved_opening,
    'A stronger rewrite of the opening.',
  );
  assert.ok(safeAnalysis.limitations.some((item) => item.includes('suggested-edit opening')));
  assert.deepEqual(safeAnalysis.scores, output.scores);

  const outOfRange = validAnalysis();
  outOfRange.scores = { ...outOfRange.scores, hook: 42 };
  assert.throws(
    () => validateContentAnalysis(outOfRange, baseContent),
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

test('parseChatAttachment accepts valid images and videos', () => {
  const image = parseChatAttachment({
    kind: 'image',
    mimeType: 'image/jpeg',
    base64: 'aGVsbG8=',
  });
  assert.deepEqual(image, {
    kind: 'image',
    mimeType: 'image/jpeg',
    base64: 'aGVsbG8=',
  });
  const video = parseChatAttachment({
    kind: 'video',
    mimeType: 'video/mp4',
    base64: 'aGVsbG8=',
  });
  assert.equal(video?.kind, 'video');
});

test('parseChatAttachment treats a missing value as no attachment', () => {
  assert.equal(parseChatAttachment(null), null);
  assert.equal(parseChatAttachment(undefined), null);
});

test('parseChatAttachment rejects audio, unknown types, and bad payloads', () => {
  assert.throws(
    () => parseChatAttachment({ kind: 'audio', mimeType: 'audio/mp4', base64: 'aGVsbG8=' }),
    /invalid_attachment/,
  );
  assert.throws(
    () => parseChatAttachment({ kind: 'image', mimeType: 'image/tiff', base64: 'aGVsbG8=' }),
    /invalid_attachment/,
  );
  assert.throws(
    () => parseChatAttachment({ kind: 'image', mimeType: 'image/png', base64: 'not base64!!' }),
    /invalid_attachment/,
  );
  assert.throws(
    () => parseChatAttachment({ kind: 'image', mimeType: 'image/png', base64: '' }),
    /invalid_attachment/,
  );
  assert.throws(
    () => parseChatAttachment({
      kind: 'video',
      mimeType: 'video/mp4',
      base64: 'a'.repeat(4_000_001),
    }),
    /invalid_attachment/,
  );
});

// ---------- Large media uploads (Gemini Files API) ----------

test('isBase64Shape validates base64 linearly, even at 8 MB chunk sizes', () => {
  // Regression: the grouped form of this check recursed per group in V8's
  // regexp engine and threw "Maximum call stack size exceeded" at ~6 MB.
  assert.equal(isBase64Shape('A'.repeat(8_000_000)), true);
  assert.equal(isBase64Shape('aGVsbG8='), true);
  assert.equal(isBase64Shape('aGVsbA=='), true); // 'hell' with 2-char padding
  assert.equal(isBase64Shape('aGVsbG8'), false); // unpadded (length not % 4)
  assert.equal(isBase64Shape(''), false);
  assert.equal(isBase64Shape('aGVsbG8=' + 'A'), false); // length not % 4
  assert.equal(isBase64Shape('aGVsbG7==='), false); // too much padding
  assert.equal(isBase64Shape('aG=sbG8A'), false); // padding mid-string
  assert.equal(isBase64Shape('aGVsbG8!*'), false); // invalid characters
});

const geminiTestConfig = {
  endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'gemini-test-key',
  model: 'gemini-test-model',
};

test('parseChatAttachment accepts a Files API reference without base64', () => {
  const attachment = parseChatAttachment({
    kind: 'video',
    mimeType: 'video/mp4',
    fileUri: 'files/abc-123_XYZ',
  });
  assert.deepEqual(attachment, {
    kind: 'video',
    mimeType: 'video/mp4',
    fileUri: 'files/abc-123_XYZ',
  });
});

test('parseChatAttachment rejects hostile or malformed file URIs', () => {
  for (const fileUri of [
    'https://evil.example.com/v1beta/files/abc',
    'files/../secret',
    'files/',
    'abc123',
  ]) {
    assert.throws(
      () => parseChatAttachment({ kind: 'image', mimeType: 'image/png', fileUri }),
      /invalid_attachment/,
    );
  }
  assert.throws(
    () => parseChatAttachment({ kind: 'audio', mimeType: 'audio/mp4', fileUri: 'files/abc' }),
    /invalid_attachment/,
  );
});

test('parseUploadInitRequest validates kind, mime type, name, and size', () => {
  assert.deepEqual(
    parseUploadInitRequest({
      kind: 'video',
      mimeType: 'video/mp4',
      name: 'reel.mp4',
      sizeBytes: 123_456,
    }),
    { kind: 'video', mimeType: 'video/mp4', name: 'reel.mp4', sizeBytes: 123_456 },
  );
  assert.equal(
    parseUploadInitRequest({
      kind: 'audio',
      mimeType: 'audio/webm',
      name: 'note.webm',
      sizeBytes: 999,
    }).kind,
    'audio',
  );
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'video',
      mimeType: 'video/avi',
      name: 'x.avi',
      sizeBytes: 1000,
    }),
    /invalid_upload_request/,
  );
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'image',
      mimeType: 'image/png',
      name: '',
      sizeBytes: 1000,
    }),
    /invalid_upload_request/,
  );
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'image',
      mimeType: 'image/png',
      name: 'a'.repeat(201),
      sizeBytes: 1000,
    }),
    /invalid_upload_request/,
  );
  assert.throws(
    () => parseUploadInitRequest({ kind: 'exe', mimeType: 'video/mp4', name: 'x', sizeBytes: 1 }),
    /invalid_upload_request/,
  );
  // Size guards: non-positive, fractional, and over the per-kind cap.
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'video',
      mimeType: 'video/mp4',
      name: 'x.mp4',
      sizeBytes: 0,
    }),
    /invalid_upload_request/,
  );
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'video',
      mimeType: 'video/mp4',
      name: 'x.mp4',
      sizeBytes: 1.5,
    }),
    /invalid_upload_request/,
  );
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'image',
      mimeType: 'image/png',
      name: 'x.png',
      sizeBytes: geminiUploadSizeCaps.image + 1,
    }),
    /invalid_upload_request/,
  );
  assert.throws(
    () => parseUploadInitRequest({
      kind: 'video',
      mimeType: 'video/mp4',
      name: 'x.mp4',
      sizeBytes: geminiUploadSizeCaps.video + 1,
    }),
    /invalid_upload_request/,
  );
});

test('isGeminiFileUri only accepts files/… names', () => {
  assert.equal(isGeminiFileUri('files/Abc-123_x'), true);
  assert.equal(isGeminiFileUri('files/x/../y'), false);
  assert.equal(isGeminiFileUri('https://example.com/files/x'), false);
  assert.equal(isGeminiFileUri(undefined), false);
});

test('createGeminiUploadSession starts a resumable session on Google only', async () => {
  const urls: string[] = [];
  const fetcher = async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(null, {
      status: 200,
      headers: {
        'x-goog-upload-url':
          'https://generativelanguage.googleapis.com/upload/v1beta/files?key=session',
      },
    });
  };
  const uploadUrl = await createGeminiUploadSession(
    geminiTestConfig,
    { kind: 'video', mimeType: 'video/mp4', name: 'reel.mp4', sizeBytes: 5_000_000 },
    fetcher as typeof fetch,
  );
  assert.equal(
    uploadUrl,
    'https://generativelanguage.googleapis.com/upload/v1beta/files?key=session',
  );
  assert.equal(urls.length, 1);
  assert.ok(
    urls[0].startsWith('https://generativelanguage.googleapis.com/upload/v1beta/files?key='),
  );

  // A non-Google endpoint can never mint upload sessions.
  await assert.rejects(
    () => createGeminiUploadSession(
      { ...geminiTestConfig, endpoint: 'https://evil.example.com/v1beta' },
      { kind: 'video', mimeType: 'video/mp4', name: 'x.mp4', sizeBytes: 1_000 },
      fetcher as typeof fetch,
    ),
    /provider_rejected/,
  );
});

test('forwardGeminiUploadChunk sequences chunks and finalizes with a file URI', async () => {
  const chunkCalls: Record<string, string>[] = [];
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    chunkCalls.push(Object.fromEntries(headers.entries()));
    if (headers.get('X-Goog-Upload-Command') === 'upload, finalize') {
      return Response.json({ file: { name: 'files/final-123', mimeType: 'video/mp4' } });
    }
    return new Response(null, { status: 308 });
  };
  const uploadUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files?key=session';

  const middle = await forwardGeminiUploadChunk(
    geminiTestConfig,
    uploadUrl,
    { offset: 0, bytes: new Uint8Array([1, 2, 3]), finalize: false },
    fetcher as typeof fetch,
  );
  assert.deepEqual(middle, { done: false });

  const last = await forwardGeminiUploadChunk(
    geminiTestConfig,
    uploadUrl,
    { offset: 3, bytes: new Uint8Array([4]), finalize: true },
    fetcher as typeof fetch,
  );
  assert.deepEqual(last, { done: true, fileUri: 'files/final-123' });

  assert.equal(chunkCalls[0]['x-goog-upload-command'], 'upload');
  assert.equal(chunkCalls[0]['x-goog-upload-offset'], '0');
  assert.equal(chunkCalls[1]['x-goog-upload-command'], 'upload, finalize');
  assert.equal(chunkCalls[1]['x-goog-upload-offset'], '3');

  // Non-Google upload URLs are refused before any request is made (SSRF).
  await assert.rejects(
    () => forwardGeminiUploadChunk(
      geminiTestConfig,
      'https://evil.example.com/upload/x',
      { offset: 0, bytes: new Uint8Array([1]), finalize: false },
      fetcher as typeof fetch,
    ),
    /provider_rejected/,
  );
});

test('forwardGeminiUploadChunk handles live protocol response shapes', async () => {
  const uploadUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files?key=session';

  // Intermediate chunks answer 200 + empty body with status "active".
  const active = await forwardGeminiUploadChunk(
    geminiTestConfig,
    uploadUrl,
    { offset: 0, bytes: new Uint8Array([1]), finalize: false },
    (async () => new Response(null, { status: 200 })) as typeof fetch,
  );
  assert.deepEqual(active, { done: false });

  // A finalize whose body is not the file envelope is malformed.
  await assert.rejects(
    () => forwardGeminiUploadChunk(
      geminiTestConfig,
      uploadUrl,
      { offset: 1, bytes: new Uint8Array([2]), finalize: true },
      (async () => Response.json({ unexpected: true })) as typeof fetch,
    ),
    /malformed_model_response/,
  );

  // Google's invalid-command 400 maps to provider_rejected, never a crash.
  await assert.rejects(
    () => forwardGeminiUploadChunk(
      geminiTestConfig,
      uploadUrl,
      { offset: 0, bytes: new Uint8Array([1]), finalize: false },
      (async () => new Response('Invalid request.', { status: 400 })) as typeof fetch,
    ),
    /provider_rejected/,
  );
});

test('resolveGeminiFileData validates state, kind, and size before use', async () => {
  const fetcherFor = (payload: unknown) =>
    (async () => Response.json(payload)) as typeof fetch;

  const part = await resolveGeminiFileData(
    geminiTestConfig,
    'files/ok-1',
    'video',
    fetcherFor({
      name: 'files/ok-1',
      mimeType: 'video/mp4',
      state: 'ACTIVE',
      sizeBytes: '5000000',
    }),
  );
  assert.deepEqual(part, {
    file_uri: 'https://generativelanguage.googleapis.com/v1beta/files/ok-1',
    mime_type: 'video/mp4',
  });

  await assert.rejects(
    () => resolveGeminiFileData(geminiTestConfig, 'files/pending', 'video', fetcherFor({
      name: 'files/pending',
      mimeType: 'video/mp4',
      state: 'PROCESSING',
    })),
    /provider_rejected/,
  );
  await assert.rejects(
    () => resolveGeminiFileData(geminiTestConfig, 'files/wrong-kind', 'image', fetcherFor({
      name: 'files/wrong-kind',
      mimeType: 'video/mp4',
      state: 'ACTIVE',
    })),
    /provider_rejected/,
  );
  await assert.rejects(
    () => resolveGeminiFileData(geminiTestConfig, 'files/too-big', 'video', fetcherFor({
      name: 'files/too-big',
      mimeType: 'video/mp4',
      state: 'ACTIVE',
      sizeBytes: String(geminiUploadSizeCaps.video + 1),
    })),
    /provider_rejected/,
  );
  await assert.rejects(
    () => resolveGeminiFileData(geminiTestConfig, 'files/mismatch', 'video', fetcherFor({
      name: 'files/other',
      mimeType: 'video/mp4',
      state: 'ACTIVE',
    })),
    /provider_rejected/,
  );
});

test('Gemini provider sends file_data parts for uploaded media', async () => {
  let requestedBody: Record<string, unknown> = {};
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/v1beta/files/abc-1?')) {
      return Response.json({
        name: 'files/abc-1',
        mimeType: 'video/mp4',
        state: 'ACTIVE',
        sizeBytes: '1000',
      });
    }
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    });
  };
  const provider = new GeminiProvider(geminiTestConfig, fetcher as typeof fetch);
  const result = await provider.generateJson(
    'system',
    'user',
    { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
    { kind: 'video', mimeType: 'video/mp4', fileUri: 'files/abc-1' },
  );
  assert.deepEqual(result, { ok: true });
  const contents = requestedBody.contents as Array<{ parts: unknown[] }>;
  assert.deepEqual(contents[0].parts, [
    { text: 'user' },
    {
      file_data: {
        file_uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc-1',
        mime_type: 'video/mp4',
      },
    },
  ]);
});
