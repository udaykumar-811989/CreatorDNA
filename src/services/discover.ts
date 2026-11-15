import { supabaseAnonKey, supabaseUrl } from '../lib/config';
import {
  TREND_TTL_MS,
  isTrendFresh,
  pruneTrendCache,
  trendCacheKey,
  trendItemFromJson,
  trendsPayloadFromJson,
  type TrendCacheFile,
  type TrendItem,
  type TrendsPayload,
} from '../lib/discover/model';
import { readJson, storageKeys, writeJson } from '../lib/storage';

// Fetches the Discover Trends tab from the `discover` edge function.
//
// Caching lives here, on the device, because that is the only place a hit can
// be guaranteed: the server-side cache was measured at 0 hits over 10
// back-to-back requests (Supabase does not promise isolate reuse), so relying
// on it would mean re-hitting the nine sources on every tab switch. Here a
// repeat load
// costs nothing and still shows a truthful "saved 4m ago" stamp.
//
// Only the publishable anon key and the creator's own session token are sent.

const FUNCTION_URL = `${supabaseUrl}/functions/v1/discover/trends`;
const TIMEOUT_MS = 25_000;

export type TrendsRequest = {
  section: string;
  query?: string;
  limit?: number;
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
 * Loads stories for a section/search.
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
    section: request.section || 'for-you',
    query: (request.query ?? '').trim(),
    limit: Math.max(6, Math.min(40, Math.round(request.limit ?? 24))),
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

// ------------------------------------------------------------- bookmarks ---

// Bookmarked stories live on the device: the "Saved" section shows them
// across every source and while offline, and nothing about a creator's
// reading list needs to leave the phone. The full card is stored (capped at
// 50) so a saved story keeps its image, publisher and link, and each entry is
// re-parsed on read so an older stored shape degrades instead of crashing.

type BookmarkFile = Record<string, { savedAt: number; item: TrendItem }>;

function readBookmarkFile(): BookmarkFile {
  const file = readJson<BookmarkFile>(storageKeys.discoverBookmarks, {});
  return file && typeof file === 'object' && !Array.isArray(file) ? file : {};
}

/** Saved stories, newest first; an unreadable file reads as "nothing saved". */
export function loadBookmarks(): TrendItem[] {
  const entries = Object.values(readBookmarkFile())
    .filter((entry) => entry && typeof entry.savedAt === 'number')
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((entry) => trendItemFromJson(entry.item))
    .filter((item): item is TrendItem => item !== null);
  return entries;
}

export function saveBookmark(item: TrendItem): void {
  const now = Date.now();
  const file = readBookmarkFile();
  file[item.id] = { savedAt: now, item };
  const pruned = Object.entries(file)
    .filter(([id, entry]) => id && entry && typeof entry.savedAt === 'number')
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, 50);
  writeJson(storageKeys.discoverBookmarks, Object.fromEntries(pruned));
}

export function clearBookmark(id: string): void {
  const file = readBookmarkFile();
  if (!(id in file)) return;
  delete file[id];
  writeJson(storageKeys.discoverBookmarks, file);
}

export { TREND_TTL_MS };
