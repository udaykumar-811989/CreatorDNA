import { supabaseAnonKey, supabaseUrl } from '../lib/config';
import {
  TREND_TTL_MS,
  isTrendFresh,
  pruneTrendCache,
  trendCacheKey,
  trendsPayloadFromJson,
  type TrendCacheFile,
  type TrendSourceKey,
  type TrendsPayload,
} from '../lib/discover/model';
import { readJson, storageKeys, writeJson } from '../lib/storage';

// Fetches the Discover Trends tab from the `discover` edge function.
//
// Caching lives here, on the device, because that is the only place a hit can
// be guaranteed: the server-side cache was measured at 0 hits over 10
// back-to-back requests (Supabase does not promise isolate reuse), so relying
// on it would mean re-hitting Reddit/X on every tab switch. Here a repeat load
// costs nothing and still shows a truthful "saved 4m ago" stamp.
//
// Only the publishable anon key and the creator's own session token are sent.

const FUNCTION_URL = `${supabaseUrl}/functions/v1/discover/trends`;
const TIMEOUT_MS = 25_000;

export type TrendsRequest = {
  category: string;
  query?: string;
  limit?: number;
  sources?: TrendSourceKey[];
};

export type TrendsFailureKind = 'offline' | 'unauthorized' | 'rejected' | 'invalid';

export type TrendsResult =
  | {
      ok: true;
      payload: TrendsPayload;
      /** True when the network was not used — fresh cache or offline fallback. */
      fromCache: boolean;
      /** When the shown data was actually fetched, for the "saved ago" stamp. */
      savedAt: number | null;
    }
  | { ok: false; message: string; kind: TrendsFailureKind };

function fail(kind: TrendsFailureKind, message: string): TrendsResult {
  return { ok: false, kind, message };
}

// ------------------------------------------------------------------ cache ---

function readCache(): TrendCacheFile {
  const file = readJson<TrendCacheFile>(storageKeys.discoverTrends, {});
  return file && typeof file === 'object' && !Array.isArray(file) ? file : {};
}

function cachedEntry(request: TrendsRequest): { savedAt: number; payload: TrendsPayload } | null {
  const entry = readCache()[trendCacheKey(request)];
  if (!entry || typeof entry.savedAt !== 'number') return null;
  const payload = trendsPayloadFromJson(entry.payload);
  if (!payload) return null;
  return { savedAt: entry.savedAt, payload };
}

function persist(payload: TrendsPayload, request: TrendsRequest): void {
  const now = Date.now();
  const file = readCache();
  file[trendCacheKey(request)] = { savedAt: now, payload };
  writeJson(storageKeys.discoverTrends, pruneTrendCache(file, now));
}

/** Drops everything older than the TTL; used by the pull-to-refresh control. */
export function clearTrendCache(): void {
  writeJson(storageKeys.discoverTrends, {});
}

export function peekCachedTrends(request: TrendsRequest): {
  payload: TrendsPayload;
  savedAt: number;
  fresh: boolean;
} | null {
  const entry = cachedEntry(request);
  if (!entry) return null;
  return { ...entry, fresh: isTrendFresh(entry.savedAt) };
}

// ----------------------------------------------------------------- fetch ----

/**
 * Loads trends for a category/search.
 *
 * With `force` (pull-to-refresh, the refresh button) the network is always
 * used. Otherwise a cache entry younger than the TTL is returned untouched.
 * If the network then fails, a stale saved entry is still shown — clearly
 * stamped with its age — instead of an empty screen.
 */
export async function fetchTrends(
  token: string,
  request: TrendsRequest,
  options: { force?: boolean } = {},
): Promise<TrendsResult> {
  const normalized: TrendsRequest = {
    category: request.category || 'all',
    query: (request.query ?? '').trim(),
    limit: Math.max(6, Math.min(40, Math.round(request.limit ?? 24))),
    ...(request.sources && request.sources.length > 0 ? { sources: request.sources } : {}),
  };

  if (!options.force) {
    const entry = cachedEntry(normalized);
    if (entry && isTrendFresh(entry.savedAt)) {
      return { ok: true, payload: entry.payload, fromCache: true, savedAt: entry.savedAt };
    }
  }

  let response: Response;
  try {
    response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalized),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return staleOrOffline(normalized, 'offline');
  }

  if (response.status === 401 || response.status === 403) {
    return fail('unauthorized', 'Your session has expired. Sign in again to refresh trends.');
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
        ? ((body as { message: string }).message)
        : 'Trends are temporarily unavailable. Please retry.';
    return staleOrOffline(normalized, response.status >= 500 ? 'offline' : 'rejected', message);
  }

  const payload = trendsPayloadFromJson(body);
  if (!payload) {
    return fail(
      'invalid',
      'CreatorDNA received an unexpected response. Please retry.',
    );
  }

  const savedAt = Date.now();
  persist(payload, normalized);
  return { ok: true, payload, fromCache: false, savedAt };
}

/**
 * Network failed: fall back to whatever was saved, even if it is past the TTL,
 * because a stamped old result is more useful than a blank screen — but only if
 * the failure is a server/network problem. An explicit rejection from the
 * server is surfaced as-is.
 */
function staleOrOffline(
  request: TrendsRequest,
  kind: TrendsFailureKind,
  message?: string,
): TrendsResult {
  if (kind === 'offline') {
    const entry = cachedEntry(request);
    if (entry) return { ok: true, payload: entry.payload, fromCache: true, savedAt: entry.savedAt };
    return fail(
      'offline',
      'Could not reach CreatorDNA. Check your connection and retry.',
    );
  }
  return fail(
    kind,
    message ?? 'Trends are temporarily unavailable. Please retry.',
  );
}

/** Convenience for the "updated Xm ago" caption next to the refresh control. */
export function trendsAgeLabel(savedAt: number | null, now = Date.now()): string | null {
  if (savedAt === null || !Number.isFinite(savedAt)) return null;
  const minutes = Math.floor((now - savedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export { TREND_TTL_MS };
