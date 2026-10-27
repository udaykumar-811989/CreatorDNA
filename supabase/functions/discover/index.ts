import {
  DISCOVER_CATEGORIES,
  dedupeTrendItems,
  discoverCategory,
  hackerNewsToItems,
  hackerNewsUrl,
  rankTrendItems,
  redditListingToItems,
  redditSearchUrl,
  redditTopUrl,
  sourceNeedsKeyMessage,
  xSearchToItems,
  xSearchUrl,
  type SourceReport,
  type TrendItem,
  type TrendSourceKey,
} from '../_shared/discover.ts';

// Serves the Discover screen's Trends tab.
//
// Every number this function returns comes from a real upstream API response.
// When a source has no credential configured it is reported as `needs_key`
// with a sentence naming the exact secret that is missing, rather than being
// silently dropped — the screen shows that state verbatim so the app never
// implies a source is live when it is not.
//
// No service-role key is read here: this endpoint only reads from public
// upstream APIs and never touches the database.

type FunctionConfig = {
  supabaseUrl: string;
  anonKey: string;
  appWebOrigin: string;
  redditClientId: string | null;
  redditClientSecret: string | null;
  xBearerToken: string | null;
};

type SourceOutcome = {
  items: TrendItem[];
  report: SourceReport;
};

const UPSTREAM_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;
const REDDIT_TOKEN_TTL_MS = 55 * 60_000;
const MAX_LIMIT = 40;
const DEFAULT_LIMIT = 24;
const USER_AGENT =
  'CreatorDNA/1.0 (trend discovery; contact: support@creatordna.app)';

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function optional(name: string): string | null {
  return Deno.env.get(name)?.trim() || null;
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

  const redditClientId = optional('REDDIT_CLIENT_ID');
  const redditClientSecret = optional('REDDIT_CLIENT_SECRET');
  if (Boolean(redditClientId) !== Boolean(redditClientSecret)) {
    // Half a credential is worse than none: it would make the function believe
    // Reddit is configured and fail every request with a 401.
    throw new Error(
      'REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set together.',
    );
  }

  return {
    supabaseUrl,
    anonKey: required('SUPABASE_ANON_KEY'),
    appWebOrigin: appUrl.origin,
    redditClientId,
    redditClientSecret,
    xBearerToken: optional('X_BEARER_TOKEN'),
  };
}

function responseHeaders(origin: string | null, allowedOrigins: readonly string[]): Headers {
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
  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.origin === origin &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

// ------------------------------------------------------------- caching ------

type CacheEntry<T> = { expires: number; value: T };

function cacheRead<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

function cacheWrite<T>(store: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number): void {
  store.set(key, { expires: Date.now() + ttl, value });
  // Keep the map from growing without bound across many categories and terms.
  if (store.size > 64) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

// Best-effort warm caches, keyed per instance.
//
// Supabase Edge Functions do not guarantee that consecutive requests reach the
// same isolate — measured on the live deployment, ten back-to-back requests
// produced ten distinct `fetchedAt` values and no cache hit at all. These maps
// therefore make no promise to the caller and the response carries no "was this
// cached" flag: the reliable cache lives in the app (see src/services/discover),
// where a hit is guaranteed and costs no network call. What is kept here is only
// the chance of saving an upstream round trip when an isolate happens to be warm.
const responseCache = new Map<string, CacheEntry<TrendsResponse>>();
const itemCache = new Map<string, CacheEntry<TrendItem[]>>();
const redditTokenCache = new Map<string, CacheEntry<string>>();

type TrendsResponse = {
  items: TrendItem[];
  sources: SourceReport[];
  /** Authoritative category list, so the client never has to keep its own copy. */
  categories: { key: string; label: string }[];
  category: string;
  query: string;
  fetchedAt: string;
};

// -------------------------------------------------------------- request -----

async function readJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const error = new Error(`upstream_${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return await response.json();
}

// ---------------------------------------------------------------- Reddit ----

async function redditAccessToken(config: FunctionConfig): Promise<string> {
  const key = `${config.redditClientId}`;
  const cached = cacheRead(redditTokenCache, key);
  if (cached) return cached;

  const basic = btoa(`${config.redditClientId}:${config.redditClientSecret}`);
  const payload = await readJson('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!isRecord(payload) || typeof payload.access_token !== 'string') {
    throw new Error('reddit_token_invalid');
  }
  const token = payload.access_token;
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  cacheWrite(
    redditTokenCache,
    key,
    token,
    Math.min(REDDIT_TOKEN_TTL_MS, Math.max(60, expiresIn * 1000 - 60_000)),
  );
  return token;
}

async function fetchReddit(
  config: FunctionConfig,
  category: string,
  query: string,
  limit: number,
): Promise<SourceOutcome> {
  const key = 'reddit';
  if (!config.redditClientId || !config.redditClientSecret) {
    return {
      items: [],
      report: { key, status: 'needs_key', message: sourceNeedsKeyMessage(key), count: 0 },
    };
  }

  try {
    const token = await redditAccessToken(config);
    const url = query
      ? redditSearchUrl(query, limit, 'oauth.reddit.com')
      : redditTopUrl(discoverCategory(category).subreddits, limit, undefined, 'oauth.reddit.com');
    const payload = await readJson(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const items = redditListingToItems(payload, category);
    if (items.length === 0) {
      return {
        items,
        report: {
          key,
          status: 'ok',
          message: 'Reddit returned no matching posts for this category this week.',
          count: 0,
        },
      };
    }
    return {
      items,
      report: { key, status: 'ok', message: 'Live from the Reddit Data API.', count: items.length },
    };
  } catch (error) {
    return { items: [], report: { key, ...reportFor(key, error), count: 0 } };
  }
}

// -------------------------------------------------------------------- X ----

async function fetchX(
  config: FunctionConfig,
  category: string,
  query: string,
  limit: number,
): Promise<SourceOutcome> {
  const key = 'x';
  if (!config.xBearerToken) {
    return {
      items: [],
      report: { key, status: 'needs_key', message: sourceNeedsKeyMessage(key), count: 0 },
    };
  }

  const seed = query || discoverCategory(category).seedQuery;
  const cacheKey = `x:${seed}:${limit}`;
  const cached = cacheRead(itemCache, cacheKey);
  if (cached) {
    return {
      items: cached,
      report: { key, status: 'ok', message: 'Live from the X API.', count: cached.length },
    };
  }

  try {
    const payload = await readJson(xSearchUrl(seed, limit), {
      headers: { Authorization: `Bearer ${config.xBearerToken}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const items = xSearchToItems(payload, category);
    if (items.length > 0) cacheWrite(itemCache, cacheKey, items, CACHE_TTL_MS);
    return {
      items,
      report: { key, status: 'ok', message: 'Live from the X API.', count: items.length },
    };
  } catch (error) {
    return { items: [], report: { key, ...reportFor(key, error), count: 0 } };
  }
}

// -------------------------------------------------------- Hacker News -------

async function fetchHackerNews(
  category: string,
  query: string,
  limit: number,
): Promise<SourceOutcome> {
  const key: TrendSourceKey = 'hackernews';
  const cacheKey = `hn:${query || category}:${limit}`;
  const cached = cacheRead(itemCache, cacheKey);
  if (cached) {
    return {
      items: cached,
      report: { key, status: 'ok', message: 'Live from the Hacker News API.', count: cached.length },
    };
  }

  try {
    const payload = await readJson(hackerNewsUrl(query || null, limit), {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const items = hackerNewsToItems(payload, category);
    if (items.length > 0) cacheWrite(itemCache, cacheKey, items, CACHE_TTL_MS);
    return {
      items,
      report: {
        key,
        status: 'ok',
        message: 'Live from the Hacker News API.',
        count: items.length,
      },
    };
  } catch (error) {
    return { items: [], report: { key, ...reportFor(key, error), count: 0 } };
  }
}

/** Maps an upstream failure onto a status the screen can explain honestly. */
function reportFor(
  key: TrendSourceKey,
  error: unknown,
): { status: SourceReport['status']; message: string } {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) {
    return {
      status: 'rate_limited',
      message: `${labelOf(key)} is rate limiting CreatorDNA right now. Try again in a minute.`,
    };
  }
  if (status === 401 || status === 403) {
    return {
      status: 'needs_key',
      message: sourceNeedsKeyMessage(key),
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      status: 'unavailable',
      message: `${labelOf(key)} is having trouble right now. This source will retry automatically.`,
    };
  }
  return {
    status: 'unavailable',
    message: `${labelOf(key)} could not be reached. Check the connection and retry.`,
  };
}

function labelOf(key: TrendSourceKey): string {
  return key === 'reddit' ? 'Reddit' : key === 'x' ? 'X' : 'Hacker News';
}

// ------------------------------------------------------------- validation ---

type TrendsRequest = {
  category: string;
  query: string;
  limit: number;
  wanted: TrendSourceKey[];
};

const ALL_SOURCES: TrendSourceKey[] = ['reddit', 'x', 'hackernews'];

function parseRequest(body: unknown): { ok: true; value: TrendsRequest } | { ok: false; error: string } {
  const record: Record<string, unknown> = isRecord(body) ? body : {};

  const rawCategory = typeof record.category === 'string' ? record.category : '';
  // discoverCategory falls back to "all" for anything unknown, so an
  // unrecognised key is a harmless no-op rather than an error.
  const category = discoverCategory(rawCategory).key;

  const rawQuery = typeof record.query === 'string' ? record.query : '';
  // Reddit and X both parse the query server-side; strip anything that could
  // alter the request shape and keep it short.
  const query = rawQuery.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  const rawLimit = typeof record.limit === 'number' ? record.limit : DEFAULT_LIMIT;
  if (!Number.isFinite(rawLimit)) {
    return { ok: false, error: 'limit must be a number.' };
  }
  const limit = Math.max(6, Math.min(MAX_LIMIT, Math.round(rawLimit)));

  let wanted = ALL_SOURCES;
  if (Array.isArray(record.sources)) {
    const requested = record.sources.filter(
      (entry): entry is TrendSourceKey =>
        typeof entry === 'string' && ALL_SOURCES.includes(entry as TrendSourceKey),
    );
    if (requested.length > 0) wanted = requested;
  }

  return { ok: true, value: { category, query, limit, wanted } };
}

// ----------------------------------------------------------------- route ----

async function handleTrends(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  let body: unknown = null;
  const raw = await request.text().catch(() => '');
  if (raw.trim()) {
    // A body that is present but unparseable is a client bug, not a default
    // request — accepting it silently would hide the mistake.
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse(
        { error: 'invalid_request', message: 'Request body must be valid JSON.' },
        400,
        headers,
      );
    }
  }

  const parsed = parseRequest(body);
  if (!parsed.ok) {
    return jsonResponse({ error: 'invalid_request', message: parsed.error }, 400, headers);
  }
  const { category, query, limit, wanted } = parsed.value;

  const cacheKey = [category, query || '-', String(limit), wanted.join(',')].join('|');
  const warm = cacheRead(responseCache, cacheKey);
  if (warm) {
    return jsonResponse(warm, 200, headers);
  }

  const perSource = Math.max(10, Math.min(50, limit));

  // A source is only consulted when it can plausibly answer: Hacker News is a
  // technology front page, so it is normally skipped for categories where it
  // would return irrelevant material.
  const categoryConfig = discoverCategory(category);
  const relevant = wanted.filter((key) =>
    key !== 'hackernews' || Boolean(query) || categoryConfig.includeHackerNews
  );

  // …but if every remaining source is waiting on a credential, that rule would
  // leave the screen blank while claiming nothing is wrong. In that case the
  // credential-free source stands in, and the `needs_key` reports for Reddit
  // and X still explain on screen exactly which secret is missing.
  const canAnswer = relevant.some((key) =>
    key === 'hackernews' || (key === 'reddit' ? Boolean(config.redditClientId) : Boolean(config.xBearerToken))
  );
  if (!canAnswer && wanted.includes('hackernews') && !relevant.includes('hackernews')) {
    relevant.push('hackernews');
  }

  const outcomes = await Promise.all(
    relevant.map((key) => {
      switch (key) {
        case 'reddit':
          return fetchReddit(config, category, query, perSource);
        case 'x':
          return fetchX(config, category, query, perSource);
        case 'hackernews':
          return fetchHackerNews(category, query, perSource);
      }
    }),
  );

  const items = rankTrendItems(dedupeTrendItems(outcomes.flatMap((outcome) => outcome.items)))
    .slice(0, limit);

  const response: TrendsResponse = {
    items,
    sources: outcomes.map((outcome) => outcome.report),
    categories: DISCOVER_CATEGORIES.map(({ key, label }) => ({ key, label })),
    category,
    query,
    fetchedAt: new Date().toISOString(),
  };

  // Only cache responses that actually returned something: a failed pull
  // should be retried immediately rather than being frozen for ten minutes.
  if (items.length > 0) {
    cacheWrite(responseCache, cacheKey, response, CACHE_TTL_MS);
  }

  return jsonResponse(response, 200, headers);
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: FunctionConfig;
  try {
    config = getConfig();
  } catch {
    console.error('Discover function configuration is invalid.');
    return jsonResponse(
      { error: 'function_not_configured' },
      503,
      new Headers({ 'Cache-Control': 'no-store' }),
    );
  }

  const origin = request.headers.get('origin');
  const allowedOrigins = [config.appWebOrigin];
  const headers = responseHeaders(origin, allowedOrigins);
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
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

  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathSegments.lastIndexOf('discover');
  const route = pathSegments.slice(functionIndex + 1);

  if (request.method === 'POST' && route.length === 1 && route[0] === 'trends') {
    try {
      return await handleTrends(request, config, headers);
    } catch (error) {
      // Never echo upstream bodies or URLs — they can contain tokens.
      console.error('discover trends failed', error instanceof Error ? error.name : 'unknown');
      return jsonResponse(
        { error: 'discover_unavailable', message: 'Trends are temporarily unavailable. Please retry.' },
        503,
        headers,
      );
    }
  }

  return jsonResponse({ error: 'not_found' }, 404, headers);
});
