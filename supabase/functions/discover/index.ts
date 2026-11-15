import {
  DISCOVER_SECTIONS,
  TREND_SOURCE_LABELS,
  blueskySearchUrl,
  blueskyToItems,
  dedupeTrendItems,
  devArticlesUrl,
  devToItems,
  discoverSection,
  gdeltToItems,
  gdeltUrl,
  githubToItems,
  githubTrendingUrl,
  googleNewsRssToItems,
  googleNewsSearchUrl,
  googleNewsTopUrl,
  googleTrendsRssToItems,
  googleTrendsRssUrl,
  hackerNewsToItems,
  hackerNewsUrl,
  lobstersToItems,
  lobstersUrl,
  mastodonToItems,
  mastodonTrendsUrl,
  rankTrendItems,
  sectionFromLegacyCategory,
  sourceCalls,
  type SourceCall,
  type SourceReport,
  type TrendItem,
  type TrendSectionKey,
  type TrendSourceKey,
} from '../_shared/discover.ts';
import { parseAllowedOrigins } from '../_shared/origins.ts';

// Serves the Discover screen's news feed: nine keyless sources normalised into
// one response, section by section.
//
// Every number this function returns comes from a real upstream API response,
// and every source here works without a credential — there is no secret to
// configure and no `needs_key` state to explain. When a source fails, is rate
// limited, or returns nothing, its report says exactly that instead of being
// silently dropped, so the screen never implies a source is live when it is
// not.
//
// No service-role key is read here: this endpoint only reads from public
// upstream APIs and never touches the database.

type FunctionConfig = {
  supabaseUrl: string;
  anonKey: string;
  appWebOrigins: string[];
};

type SourceOutcome = {
  items: TrendItem[];
  report: SourceReport;
};

const UPSTREAM_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_LIMIT = 40;
const DEFAULT_LIMIT = 24;
const USER_AGENT =
  'CreatorDNA/1.0 (news discovery; contact: support@creatordna.app)';

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
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

  return {
    supabaseUrl,
    anonKey: required('SUPABASE_ANON_KEY'),
    appWebOrigins: parseAllowedOrigins(
      'APP_WEB_ORIGIN',
      required('APP_WEB_ORIGIN'),
    ),
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
  // Keep the map from growing without bound across many sections and terms.
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
// therefore make no promise to the caller: the reliable cache lives in the app
// (see src/services/discover), where a hit is guaranteed. What is kept here is
// only the chance of saving an upstream round trip when an isolate happens to
// be warm — and for GDELT it also carries the spacing state below.
const responseCache = new Map<string, CacheEntry<TrendsResponse>>();
const itemCache = new Map<string, CacheEntry<TrendItem[]>>();

type TrendsResponse = {
  items: TrendItem[];
  sources: SourceReport[];
  /** Authoritative section list, so the client never keeps its own copy. */
  sections: { key: string; label: string }[];
  /** Legacy alias of `sections` for clients built before Discover 2.0. */
  categories: { key: string; label: string }[];
  section: string;
  /** Legacy alias of `section` for clients built before Discover 2.0. */
  category: string;
  query: string;
  fetchedAt: string;
};

// -------------------------------------------------------------- request -----

const UPSTREAM_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/xml, application/xml, */*',
};

async function readJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { ...UPSTREAM_HEADERS, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const error = new Error(`upstream_${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return await response.json();
}

async function readText(url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: { ...UPSTREAM_HEADERS, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const error = new Error(`upstream_${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return await response.text();
}

// ---------------------------------------------------------------- GDELT -----

// GDELT hard-limits callers to one request every five seconds and answers 429
// otherwise. The gate serialises GDELT calls inside this isolate and spaces
// them out; a cold isolate still starts fresh, so a rare 429 is reported as
// `rate_limited` rather than treated as a broken source.
const GDELT_MIN_GAP_MS = 5_500;
/** GDELT's own answer time; the shared 12s budget cuts it off mid-flight. */
const GDELT_TIMEOUT_MS = 18_000;
let gdeltLastCallAt = 0;
let gdeltChain: Promise<unknown> = Promise.resolve();

function gdeltGate(): Promise<void> {
  const run = gdeltChain.then(async () => {
    const wait = gdeltLastCallAt + GDELT_MIN_GAP_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    gdeltLastCallAt = Date.now();
  });
  // A failed wait must not poison the chain for later callers.
  gdeltChain = run.catch(() => undefined);
  return run;
}

async function fetchGdeltPayload(query: string, limit: number): Promise<unknown> {
  // GDELT regularly takes 10–12 seconds to answer a cold query — the shared
  // upstream budget would cut it off right as it was about to respond, which
  // is why GDELT gets its own, longer window (still inside the client's 25s).
  const timeout = AbortSignal.timeout(GDELT_TIMEOUT_MS);
  await gdeltGate();
  try {
    return await readJson(gdeltUrl(query, limit), { signal: timeout });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status !== 400) throw error;
    // A boolean query GDELT refuses falls back to its first term rather than
    // failing the whole section.
    const simple = query.split(/\s+(?:OR|AND)\s+/i)[0]?.replace(/^\(|\)$/g, '').trim() || 'news';
    await gdeltGate();
    return await readJson(gdeltUrl(simple, limit), { signal: timeout });
  }
}

// ------------------------------------------------------- Bluesky durations --

/**
 * Native Bluesky videos publish no duration in their API — but their HLS
 * playlist does: the media playlist's EXTINF segments add up to the real
 * runtime. Two small fetches per video, best effort; a failure simply leaves
 * the duration blank rather than guessing.
 */
async function resolveHlsDuration(playlistUrl: string): Promise<number | null> {
  try {
    const master = await readText(playlistUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    const variantPath = master
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    if (!variantPath) return null;
    const variantUrl = new URL(variantPath, playlistUrl).toString();
    const variant = await readText(variantUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    let total = 0;
    for (const match of variant.matchAll(/EXTINF:([0-9.]+)/g)) {
      total += Number(match[1]);
    }
    return total > 0 ? Math.round(total) : null;
  } catch {
    return null;
  }
}

async function withVideoDurations(items: TrendItem[]): Promise<TrendItem[]> {
  const targets = items
    .filter((item) => item.videoKind === 'hls' && item.durationSeconds === null)
    .slice(0, 3);
  if (targets.length === 0) return items;
  const durations = await Promise.all(
    targets.map((item) => (item.videoUrl ? resolveHlsDuration(item.videoUrl) : null)),
  );
  const byId = new Map(
    targets.map((item, index) => [item.id, durations[index]] as const),
  );
  return items.map((item) => {
    const duration = byId.get(item.id);
    return duration === null || duration === undefined
      ? item
      : { ...item, durationSeconds: duration };
  });
}

// ------------------------------------------------------------- fetchers -----

type CallContext = {
  section: TrendSectionKey;
  /** Global search term — switches topic feeds to unscoped search. */
  search: string;
  limit: number;
};

async function fetchItems(call: SourceCall, context: CallContext): Promise<TrendItem[]> {
  const { section, search, limit } = context;
  switch (call.key) {
    case 'hackernews': {
      const payload = await readJson(hackerNewsUrl(call.query ?? null, limit), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return hackerNewsToItems(payload, section);
    }
    case 'bluesky': {
      // "latest" suits video and search (recency), "top" suits news sections.
      const sort = section === 'videos' || search ? 'latest' : 'top';
      const payload = await readJson(
        blueskySearchUrl(call.query ?? 'news', limit, sort),
        { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
      );
      const items = blueskyToItems(payload, section);
      return section === 'videos' ? await withVideoDurations(items) : items;
    }
    case 'mastodon': {
      const payload = await readJson(mastodonTrendsUrl(limit), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return mastodonToItems(payload, section);
    }
    case 'googletrends': {
      const xml = await readText(googleTrendsRssUrl(), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return googleTrendsRssToItems(xml, section);
    }
    case 'googlenews': {
      const url = call.query
        ? googleNewsSearchUrl(call.query, !search)
        : googleNewsTopUrl();
      const xml = await readText(url, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return googleNewsRssToItems(xml, section);
    }
    case 'github': {
      const payload = await readJson(githubTrendingUrl(call.query ?? null, limit), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return githubToItems(payload, section);
    }
    case 'devto': {
      const payload = await readJson(devArticlesUrl(limit), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return devToItems(payload, section);
    }
    case 'gdelt': {
      const payload = await fetchGdeltPayload(call.query ?? 'news', limit);
      return gdeltToItems(payload, section);
    }
    case 'lobsters': {
      const payload = await readJson(lobstersUrl(), {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return lobstersToItems(payload, section);
    }
  }
}

/** Maps an upstream failure onto a status the screen can explain honestly. */
function reportFor(
  key: TrendSourceKey,
  error: unknown,
): { status: SourceReport['status']; message: string } {
  const label = TREND_SOURCE_LABELS[key];
  const status = (error as { status?: number } | null)?.status;
  if (status === 429 || (key === 'github' && status === 403)) {
    // GitHub answers 403 (not 429) when the unauthenticated search quota is
    // spent, so it reads as rate limiting for that source specifically.
    return {
      status: 'rate_limited',
      message: `${label} is rate limiting CreatorDNA right now. It will retry automatically.`,
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      status: 'unavailable',
      message: `${label} is having trouble right now. This source will retry automatically.`,
    };
  }
  return {
    status: 'unavailable',
    message: `${label} could not be reached. Check the connection and retry.`,
  };
}

async function runCall(call: SourceCall, context: CallContext): Promise<SourceOutcome> {
  const label = TREND_SOURCE_LABELS[call.key];
  const cacheKey = [
    call.key,
    call.query ?? '-',
    context.search ? 'search' : context.section,
    String(context.limit),
  ].join('|');

  const cached = cacheRead(itemCache, cacheKey);
  if (cached) {
    return {
      items: cached,
      report: { key: call.key, status: 'ok', message: `Live from ${label}.`, count: cached.length },
    };
  }

  try {
    const items = await fetchItems(call, context);
    if (items.length > 0) cacheWrite(itemCache, cacheKey, items, CACHE_TTL_MS);
    return {
      items,
      report: {
        key: call.key,
        status: 'ok',
        message:
          items.length > 0
            ? `Live from ${label}.`
            : `${label} returned no fresh stories right now.`,
        count: items.length,
      },
    };
  } catch (error) {
    return {
      items: [],
      report: { key: call.key, ...reportFor(call.key, error), count: 0 },
    };
  }
}

// ------------------------------------------------------------- validation ---

type TrendsRequest = {
  section: TrendSectionKey;
  query: string;
  limit: number;
};

function parseRequest(body: unknown): { ok: true; value: TrendsRequest } | { ok: false; error: string } {
  const record: Record<string, unknown> = isRecord(body) ? body : {};

  // Discover 2.0 sends `section`; clients built before it send `category`.
  // Both resolve through the same table, so a stale install keeps working.
  const rawSection =
    typeof record.section === 'string' && record.section
      ? record.section
      : typeof record.category === 'string'
        ? sectionFromLegacyCategory(record.category)
        : '';
  const section = discoverSection(rawSection).key;

  const rawQuery = typeof record.query === 'string' ? record.query : '';
  // Queries are parsed by each source server-side; strip anything that could
  // alter the request shape and keep it short.
  const query = rawQuery.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  const rawLimit = typeof record.limit === 'number' ? record.limit : DEFAULT_LIMIT;
  if (!Number.isFinite(rawLimit)) {
    return { ok: false, error: 'limit must be a number.' };
  }
  const limit = Math.max(6, Math.min(MAX_LIMIT, Math.round(rawLimit)));

  return { ok: true, value: { section, query, limit } };
}

// ----------------------------------------------------------------- route ----

async function handleTrends(
  request: Request,
  config: FunctionConfig,
  headers: Headers,
): Promise<Response> {
  void config;
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
  const { section, query, limit } = parsed.value;

  const cacheKey = [section, query || '-', String(limit)].join('|');
  const warm = cacheRead(responseCache, cacheKey);
  if (warm) {
    return jsonResponse(warm, 200, headers);
  }

  const perSource = Math.max(10, Math.min(50, limit));
  const calls = sourceCalls(section, query);
  const context: CallContext = { section, search: query, limit: perSource };

  const outcomes = await Promise.all(calls.map((call) => runCall(call, context)));

  const items = rankTrendItems(dedupeTrendItems(outcomes.flatMap((outcome) => outcome.items)))
    .slice(0, limit);

  const sections = DISCOVER_SECTIONS.map(({ key, label }) => ({ key, label }));
  const response: TrendsResponse = {
    items,
    sources: outcomes.map((outcome) => outcome.report),
    sections,
    // Same list under the pre-2.0 name, so an older install's chip row still
    // renders sections it can actually request.
    categories: sections,
    section,
    category: section,
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
  const allowedOrigins = config.appWebOrigins;
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
        { error: 'discover_unavailable', message: 'News is temporarily unavailable. Please retry.' },
        503,
        headers,
      );
    }
  }

  return jsonResponse({ error: 'not_found' }, 404, headers);
});
