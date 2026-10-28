import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateCreatorIdeas,
  readCreatorMedia,
  sendCreatorAiChat,
  signInAnonymouslyForCreatorAi,
  signInForCreatorAi,
  transcribeCreatorAudio,
} from '../../../src/services/creatorAi';

function mockSignInResponse(
  status: number,
  body: Record<string, unknown>,
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('sign-in reports incorrect credentials without exposing the response', async (context) => {
  const restore = mockSignInResponse(400, {
    code: 'invalid_credentials',
    msg: 'Invalid login credentials',
  });
  context.after(restore);

  await assert.rejects(
    signInForCreatorAi('https://example.supabase.co', 'anon', 'creator@example.com', 'wrong'),
    { message: 'Email or password is incorrect. Check both and try again.' },
  );
});

test('sign-in explains when email confirmation is required', async (context) => {
  const restore = mockSignInResponse(400, { error_code: 'email_not_confirmed' });
  context.after(restore);

  await assert.rejects(
    signInForCreatorAi('https://example.supabase.co', 'anon', 'creator@example.com', 'password'),
    { message: 'Confirm your email address before signing in.' },
  );
});

test('sign-in identifies rate limiting', async (context) => {
  const restore = mockSignInResponse(429, { code: 'over_request_rate_limit' });
  context.after(restore);

  await assert.rejects(
    signInForCreatorAi('https://example.supabase.co', 'anon', 'creator@example.com', 'password'),
    { message: 'Too many sign-in attempts. Wait a little and try again.' },
  );
});

test('sign-in returns the session tokens on success', async (context) => {
  const restore = mockSignInResponse(200, { access_token: 'a'.repeat(32) });
  context.after(restore);

  const session = await signInForCreatorAi(
    'https://example.supabase.co',
    'anon',
    'creator@example.com',
    'password',
  );
  assert.equal(session.accessToken, 'a'.repeat(32));
  assert.equal(session.refreshToken, null);
});

test('anonymous sign-in starts a guest session', async (context) => {
  let requestedUrl = '';
  let requestedBody = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ access_token: 'g'.repeat(32) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const session = await signInAnonymouslyForCreatorAi('https://example.supabase.co', 'anon');

  // A guest session is a session: it carries both tokens so the community can
  // keep one identity across reloads instead of minting a new person each time.
  assert.equal(session.accessToken, 'g'.repeat(32));
  assert.equal(session.refreshToken, null);
  assert.equal(requestedUrl, 'https://example.supabase.co/auth/v1/signup');
  assert.deepEqual(JSON.parse(requestedBody), { data: {} });
});

test('anonymous sign-in clearly reports when guest sessions are disabled', async (context) => {
  const restore = mockSignInResponse(400, { code: 'anonymous_provider_disabled' });
  context.after(restore);

  await assert.rejects(
    signInAnonymouslyForCreatorAi('https://example.supabase.co', 'anon'),
    {
      message: 'Guest analysis is not enabled. Enable anonymous sign-ins in Supabase Auth settings.',
    },
  );
});

test('reads a supported media file as base64 and rejects mismatched media types', async () => {
  const media = await readCreatorMedia(
    'data:image/png;base64,aGVsbG8=',
    'image/png',
    'image.png',
    'image',
  );
  assert.deepEqual(media, {
    kind: 'image',
    mimeType: 'image/png',
    base64: 'aGVsbG8=',
    name: 'image.png',
  });
  await assert.rejects(
    readCreatorMedia('data:image/png;base64,aGVsbG8=', 'image/png', 'voice.png', 'audio'),
    { message: 'This file type is not supported for that media option.' },
  );
});

test('transcribes voice audio through the authenticated Gemini endpoint', async (context) => {
  let requestedUrl = '';
  let requestedAuthorization = '';
  let requestedBody: Record<string, unknown> = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ transcript: 'Hello, everyone.' });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcript = await transcribeCreatorAudio(
    'https://example.supabase.co/functions/v1/creator-ai',
    'anon',
    'guest-session-token',
    {
      kind: 'audio',
      mimeType: 'audio/webm',
      base64: 'YXVkaW8=',
      name: 'voice.webm',
    },
  );

  assert.equal(transcript, 'Hello, everyone.');
  assert.equal(
    requestedUrl,
    'https://example.supabase.co/functions/v1/creator-ai/transcribe',
  );
  assert.equal(requestedAuthorization, 'Bearer guest-session-token');
  assert.deepEqual(requestedBody.media, {
    kind: 'audio',
    mimeType: 'audio/webm',
    base64: 'YXVkaW8=',
  });
});

test('generates valid ideas and chats with the analysis endpoint', async (context) => {
  const originalFetch = globalThis.fetch;
  let requestedRoute = '';
  globalThis.fetch = async (input) => {
    requestedRoute = String(input);
    if (requestedRoute.endsWith('/ideas')) {
      return Response.json({
        ideas: [{
          title: 'Three quick lunches',
          hook: 'Lunch in five minutes?',
          concept: 'Show three simple recipes.',
          format: 'listicle',
          cta: 'Save this for later.',
        }],
      });
    }
    return Response.json({ reply: 'Try opening with your biggest surprise.' });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const ideas = await generateCreatorIdeas(
    'https://example.supabase.co/functions/v1/creator-ai',
    'anon',
    'guest-session-token',
    { topic: 'quick lunches', audience: 'students', goal: 'saves' },
  );
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].title, 'Three quick lunches');
  assert.equal(requestedRoute.endsWith('/ideas'), true);

  const analysis = {
    summary: 'A short Reel about lunch ideas.',
    topics: { primary: 'lunch', secondary: [] },
    hook: { text: 'Lunch in five minutes?', type: 'question' },
    format: 'listicle',
    structure: { setup: null, value: null, payoff: null, cta: null },
    transcript_analysis: {
      clarity: 'clear',
      specificity: 'specific',
      information_density: 'moderate',
      repetition: 'none',
      confusing_sections: [],
    },
    cta: { present: true, type: 'save', text: 'Save this for later.' },
    pacing: { assessment: 'not_assessable' as const, observations: [] },
    strengths: [],
    improvement_opportunities: [],
    evidence: [],
    confidence: 'early' as const,
    limitations: [],
    duration_seconds: null,
  };
  const reply = await sendCreatorAiChat(
    'https://example.supabase.co/functions/v1/creator-ai',
    'anon',
    'guest-session-token',
    analysis,
    [],
    'How can I improve it?',
  );
  assert.equal(reply, 'Try opening with your biggest surprise.');
  assert.equal(requestedRoute.endsWith('/chat'), true);
});
