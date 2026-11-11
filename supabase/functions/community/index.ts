import { decryptAccessToken } from '../_shared/instagram.ts';
import type { AchievementMilestone } from '../_shared/milestones.ts';
import { nextMilestone } from '../_shared/milestones.ts';
import { parseAllowedOrigins } from '../_shared/origins.ts';

// Verified follower sync — the only path that can award a milestone.
//
// The client never supplies a follower count. It sends only its opaque
// Instagram connection session token; this function resolves the encrypted
// Instagram token behind it server-side (`get_instagram_dashboard_connection`,
// service-role only), decrypts it in memory, asks Instagram itself for the
// number, and only that answer reaches `community_sync_followers`, which is
// service-role only. So a milestone can only ever be granted on a count
// Instagram actually returned.
//
// No service-role key or Instagram token is exposed to the browser, and
// neither is ever logged.

type FunctionConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  tokenEncryptionKey: Uint8Array;
  appWebOrigins: string[];
};

const UPSTREAM_TIMEOUT_MS = 12_000;
// Instagram's own ceiling is far below this; the clamp exists only because the
// column is an integer and a malformed upstream value must never overflow it.
const MAX_FOLLOWERS = 2_000_000_000;
const GRAPH_VERSION = 'v27.0';

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function decodeKey(value: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0)
    );
  } catch {
    throw new Error('TOKEN_ENCRYPTION_KEY must be valid base64.');
  }
  if (decoded.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  }
  return decoded;
}

function getConfig(): FunctionConfig {
  const supabaseUrl = required('SUPABASE_URL').replace(/\/+$/, '');
  const endpoint = new URL(supabaseUrl);
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') {
    throw new Error('SUPABASE_URL must use HTTPS.');
  }

  const appWebOrigins = parseAllowedOrigins(
    'APP_WEB_ORIGIN',
    required('APP_WEB_ORIGIN'),
  );

  return {
    supabaseUrl,
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    tokenEncryptionKey: decodeKey(required('TOKEN_ENCRYPTION_KEY')),
    appWebOrigins,
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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
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
  constructor(
    readonly kind: 'not_connected' | 'rejected' | 'unreachable',
    message: string,
  ) {
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
 * The connection is resolved server-side from the session token: it looks up
 * the encrypted Instagram token (`get_instagram_dashboard_connection`,
 * service-role only), decrypts it in memory, and reads `followers_count`
 * straight off the IG User node — no `/me` hop and no Instagram token in the
 * request body.
 */
async function readInstagramFollowers(
  config: FunctionConfig,
  sessionToken: string,
): Promise<{ instagramUserId: string; username: string; followers: number }> {
  const connection = await getDashboardConnection(config, sessionToken);
  if (!connection) {
    throw new InstagramError(
      'not_connected',
      'Connect Instagram first — a milestone needs a verified follower count.',
    );
  }
  const accessToken = await decryptAccessToken(
    {
      ciphertext: connection.encryptedAccessToken,
      iv: connection.tokenIv,
      authTag: connection.tokenAuthTag,
    },
    config.tokenEncryptionKey,
  );

  const node = await graphGet(
    `${connection.instagramUserId}?fields=followers_count`,
    accessToken,
  );
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
    instagramUserId: connection.instagramUserId,
    username: connection.username,
    followers: Math.min(MAX_FOLLOWERS, Math.round(raw)),
  };
}

// ------------------------------------------------------------ Supabase ------

/**
 * Resolves the live Instagram connection behind a dashboard session token.
 *
 * The RPC is service-role only and keyed by the SHA-256 of the token, so the
 * browser never sees the table and the raw token never touches a log.
 */
async function getDashboardConnection(
  config: FunctionConfig,
  sessionToken: string,
): Promise<{
  instagramUserId: string;
  username: string;
  encryptedAccessToken: string;
  tokenIv: string;
  tokenAuthTag: string;
} | null> {
  let response: Response;
  try {
    response = await fetch(
      `${config.supabaseUrl}/rest/v1/rpc/get_instagram_dashboard_connection`,
      {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_session_hash: await sha256(sessionToken) }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
  } catch {
    throw new InstagramError(
      'unreachable',
      'Instagram could not be reached just now. Please retry.',
    );
  }
  if (!response.ok) {
    throw new InstagramError(
      'unreachable',
      'Instagram could not be reached just now. Please retry.',
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  // The RPC returns nothing for an unknown or expired session, and for a
  // connection whose token is past its clamped 30-day validity — both mean
  // "no usable connection" to this client.
  if (!isRecord(body) || typeof body.instagramUserId !== 'string') {
    return null;
  }
  return {
    instagramUserId: body.instagramUserId,
    username: typeof body.username === 'string' ? body.username : '',
    encryptedAccessToken:
      typeof body.encryptedAccessToken === 'string'
        ? body.encryptedAccessToken
        : '',
    tokenIv: typeof body.tokenIv === 'string' ? body.tokenIv : '',
    tokenAuthTag:
      typeof body.tokenAuthTag === 'string' ? body.tokenAuthTag : '',
  };
}

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
  // The body carries the connection session token (never an Instagram token);
  // anything not shaped like one cannot resolve a connection, so there is no
  // reason to hit the network with it.
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
    verified = await readInstagramFollowers(config, token);
  } catch (error) {
    if (error instanceof InstagramError) {
      const clientError =
        error.kind === 'not_connected'
          ? 'instagram_not_connected'
          : error.kind === 'rejected'
            ? 'instagram_rejected'
            : 'instagram_unreachable';
      return jsonResponse(
        {
          error: clientError,
          message: error.message,
        },
        error.kind === 'unreachable' ? 503 : 400,
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
  const allowed = config.appWebOrigins;
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
