import type { AchievementMilestone } from '../_shared/milestones.ts';
import { nextMilestone } from '../_shared/milestones.ts';

// Verified follower sync — the only path that can award a milestone.
//
// The client never supplies a follower count. It sends the Instagram access
// token it already holds from the OAuth connect, this function asks Instagram
// itself for the number, and only that answer reaches
// `community_sync_followers`, which is service-role only. So a milestone can
// only ever be granted on a count Instagram actually returned.
//
// No service-role key is exposed to the browser and the token is never logged.

type FunctionConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  appWebOrigin: string;
};

const UPSTREAM_TIMEOUT_MS = 12_000;
// Instagram's own ceiling is far below this; the clamp exists only because the
// column is an integer and a malformed upstream value must never overflow it.
const MAX_FOLLOWERS = 2_000_000_000;
const GRAPH_VERSION = 'v21.0';

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function getConfig(): FunctionConfig {
  const supabaseUrl = required('SUPABASE_URL').replace(/\/+$/, '');
  const endpoint = new URL(supabaseUrl);
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') {
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

  return {
    supabaseUrl,
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    appWebOrigin: appUrl.origin,
  };
}

function isAllowedOrigin(origin: string, allowed: readonly string[]): boolean {
  if (allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function responseHeaders(origin: string | null, allowed: readonly string[]): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
  });
  if (origin && isAllowedOrigin(origin, allowed)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function getAuthenticatedUser(
  request: Request,
  config: FunctionConfig,
): Promise<string | null> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [^\s]+$/i.test(authorization)) return null;

  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: authorization },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('auth_unavailable');
  }
  if (!response.ok) return null;

  let user: unknown;
  try {
    user = await response.json();
  } catch {
    throw new Error('auth_unavailable');
  }
  return isRecord(user) && isUuid(user.id) ? user.id : null;
}

// -------------------------------------------------------------- Instagram ---

class InstagramError extends Error {
  constructor(readonly kind: 'rejected' | 'unreachable', message: string) {
    super(message);
  }
}

async function graphGet(path: string, token: string): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}${
    path.includes('?') ? '&' : '?'
  }access_token=${encodeURIComponent(token)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new InstagramError('unreachable', 'Instagram could not be reached just now. Please retry.');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !isRecord(payload)) {
    // Graph errors are only used to pick a message; the body is never echoed
    // back to the client because it can echo the token back with it.
    throw new InstagramError(
      'rejected',
      "Instagram did not accept this connection. Reconnect Instagram, then try again.",
    );
  }
  if (typeof payload.error !== 'undefined') {
    throw new InstagramError(
      'rejected',
      "Instagram did not accept this connection. Reconnect Instagram, then try again.",
    );
  }
  return payload;
}

/**
 * Asks Instagram — not the app — how many followers this account has.
 *
 * Two hops on purpose: `/me` identifies the account, then the user node is
 * read for `followers_count`, which is the field Instagram documents for
 * business and creator accounts.
 */
async function readInstagramFollowers(
  token: string,
): Promise<{ instagramUserId: string; username: string; followers: number }> {
  const identity = await graphGet('me?fields=id,username', token);
  const instagramUserId = typeof identity.id === 'string' ? identity.id : '';
  if (!instagramUserId) {
    throw new InstagramError(
      'rejected',
      'Instagram did not identify this connection. Reconnect Instagram, then try again.',
    );
  }

  const node = await graphGet(`${instagramUserId}?fields=followers_count`, token);
  const raw = Number(node.followers_count);
  if (!Number.isFinite(raw) || raw < 0) {
    // The account exists but Instagram refused the number (permissions or an
    // account type that does not expose it). Never fall back to anything the
    // client said — no number at all is the only honest answer.
    throw new InstagramError(
      'rejected',
      'Instagram is not sharing a follower count for this account. A Business or Creator account is required.',
    );
  }

  return {
    instagramUserId,
    username: typeof identity.username === 'string' ? identity.username : '',
    followers: Math.min(MAX_FOLLOWERS, Math.round(raw)),
  };
}

// ------------------------------------------------------------ Supabase ------

async function awardMilestones(
  config: FunctionConfig,
  userId: string,
  instagramUserId: string,
  followers: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/community_sync_followers`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_followers: followers,
      p_instagram_user_id: instagramUserId,
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error('reward_unavailable');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return isRecord(body) ? body : {};
}

// ---------------------------------------------------------------- route -----

async function handleFollowers(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
  userId: string,
): Promise<Response> {
  const raw = await request.text().catch(() => '');
  if (!raw.trim()) {
    return jsonResponse(
      { error: 'invalid_request', message: 'Request body must be JSON.' },
      400,
      headers,
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(
      { error: 'invalid_request', message: 'Request body must be valid JSON.' },
      400,
      headers,
    );
  }

  const token =
    isRecord(body) && typeof body.instagramAccessToken === 'string'
      ? body.instagramAccessToken.trim()
      : '';
  // Anything that is not shaped like a token fails inside Instagram, so there
  // is no reason to hit the network with an empty one.
  if (!token || token.length > 2048 || /[\r\n]/.test(token)) {
    return jsonResponse(
      {
        error: 'instagram_not_connected',
        message: 'Connect Instagram first — a milestone needs a verified follower count.',
      },
      400,
      headers,
    );
  }

  let verified: { instagramUserId: string; username: string; followers: number };
  try {
    verified = await readInstagramFollowers(token);
  } catch (error) {
    if (error instanceof InstagramError) {
      return jsonResponse(
        {
          error: error.kind === 'rejected' ? 'instagram_rejected' : 'instagram_unreachable',
          message: error.message,
        },
        error.kind === 'rejected' ? 400 : 503,
        headers,
      );
    }
    throw error;
  }

  let awarded: Record<string, unknown>;
  try {
    awarded = await awardMilestones(
      config,
      userId,
      verified.instagramUserId,
      verified.followers,
    );
  } catch {
    return jsonResponse(
      {
        error: 'rewards_unavailable',
        message: 'Your follower count was verified, but rewards could not be updated. Please retry.',
      },
      503,
      headers,
    );
  }

  const earned = Array.isArray(awarded.earned)
    ? (awarded.earned as unknown[]).filter((entry): entry is AchievementMilestone =>
        entry === 1000 ||
        entry === 10000 ||
        entry === 50000 ||
        entry === 100000 ||
        entry === 500000 ||
        entry === 1000000,
      )
    : [];

  return jsonResponse(
    {
      followers: verified.followers,
      username: verified.username,
      earned,
      next: nextMilestone(verified.followers),
      measuredAt: new Date().toISOString(),
    },
    200,
    headers,
  );
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: FunctionConfig;
  try {
    config = getConfig();
  } catch {
    console.error('Community function configuration is invalid.');
    return jsonResponse(
      { error: 'function_not_configured' },
      503,
      new Headers({ 'Cache-Control': 'no-store' }),
    );
  }

  const origin = request.headers.get('origin');
  const allowed = [config.appWebOrigin];
  const headers = responseHeaders(origin, allowed);
  if (origin && !isAllowedOrigin(origin, allowed)) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
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

  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const index = segments.lastIndexOf('community');
  const route = segments.slice(index + 1);

  if (request.method === 'POST' && route.length === 1 && route[0] === 'followers') {
    try {
      return await handleFollowers(request, config, headers, userId);
    } catch (error) {
      console.error('community followers failed', error instanceof Error ? error.name : 'unknown');
      return jsonResponse(
        {
          error: 'community_unavailable',
          message: 'Follower verification is temporarily unavailable. Please retry.',
        },
        503,
        headers,
      );
    }
  }

  return jsonResponse({ error: 'not_found' }, 404, headers);
});
