// Discover wire format, display helpers and the client-side trend cache.
//
// The server (supabase/functions/_shared/discover.ts) normalises Reddit, X and
// Hacker News into one shape; this module parses that shape defensively so a
// malformed or partial response degrades into an empty list rather than a
// crash, and provides the small pieces of display logic the screen needs.

export type TrendSourceKey = 'reddit' | 'x' | 'hackernews';

export type SourceStatus = 'ok' | 'needs_key' | 'unavailable' | 'rate_limited' | 'error';

export type SourceReport = {
  key: TrendSourceKey;
  status: SourceStatus;
  message: string;
  count: number;
};

export type TrendMetrics = {
  upvotes?: number;
  comments?: number;
  likes?: number;
  shares?: number;
  points?: number;
};

export type TrendItem = {
  id: string;
  source: TrendSourceKey;
  category: string;
  title: string;
  excerpt: string;
  url: string;
  externalUrl?: string;
  author: string | null;
  community: string | null;
  createdAt: string;
  metrics: TrendMetrics;
  sourceLabel: string;
};

export type CategoryOption = { key: string; label: string };

export type TrendsPayload = {
  items: TrendItem[];
  sources: SourceReport[];
  categories: CategoryOption[];
  category: string;
  query: string;
  fetchedAt: string;
};

export const TREND_SOURCE_KEYS: TrendSourceKey[] = ['reddit', 'x', 'hackernews'];

export const SOURCE_LABELS: Record<TrendSourceKey, string> = {
  reddit: 'Reddit',
  x: 'X',
  hackernews: 'Hacker News',
};

/**
 * Used before the first response arrives. Once the server answers, its own
 * category list replaces this — the server is authoritative, so the two can
 * never drift into showing a chip that resolves to nothing.
 */
export const DEFAULT_CATEGORIES: CategoryOption[] = [
  { key: 'all', label: 'All' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'business', label: 'Business' },
  { key: 'tech', label: 'Tech' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'food', label: 'Food' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'travel', label: 'Travel' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'education', label: 'Education' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'design', label: 'Design' },
];

// ------------------------------------------------------------------ parse ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function count(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

const STATUSES: SourceStatus[] = ['ok', 'needs_key', 'unavailable', 'rate_limited', 'error'];

export function trendSourceFromKey(value: unknown): TrendSourceKey | null {
  return typeof value === 'string' && TREND_SOURCE_KEYS.includes(value as TrendSourceKey)
    ? (value as TrendSourceKey)
    : null;
}

export function trendItemFromJson(value: unknown): TrendItem | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const source = trendSourceFromKey(value.source);
  const title = str(value.title).trim();
  const url = str(value.url);
  // Without a source link there is nothing to click through to, and the whole
  // point of Discover is showing where each trend came from.
  if (!id || !source || !title || !/^https?:\/\//i.test(url)) return null;

  const rawMetrics = isRecord(value.metrics) ? value.metrics : {};
  const metrics: TrendMetrics = {};
  const upvotes = count(rawMetrics.upvotes);
  const comments = count(rawMetrics.comments);
  const likes = count(rawMetrics.likes);
  const shares = count(rawMetrics.shares);
  const points = count(rawMetrics.points);
  if (upvotes !== undefined) metrics.upvotes = upvotes;
  if (comments !== undefined) metrics.comments = comments;
  if (likes !== undefined) metrics.likes = likes;
  if (shares !== undefined) metrics.shares = shares;
  if (points !== undefined) metrics.points = points;

  const external = str(value.externalUrl);
  const createdAt = str(value.createdAt);
  return {
    id,
    source,
    category: str(value.category, 'all'),
    title,
    excerpt: str(value.excerpt).trim(),
    url,
    ...(external && /^https?:\/\//i.test(external) ? { externalUrl: external } : {}),
    author: nullableStr(value.author),
    community: nullableStr(value.community),
    // An item without a usable date cannot be aged or sorted honestly.
    createdAt: Number.isNaN(Date.parse(createdAt)) ? '' : new Date(createdAt).toISOString(),
    metrics,
    sourceLabel: str(value.sourceLabel, SOURCE_LABELS[source]),
  };
}

export function sourceReportFromJson(value: unknown): SourceReport | null {
  if (!isRecord(value)) return null;
  const key = trendSourceFromKey(value.key);
  if (!key) return null;
  const status = STATUSES.includes(value.status as SourceStatus)
    ? (value.status as SourceStatus)
    : 'error';
  const countValue = count(value.count);
  return {
    key,
    status,
    message: str(value.message, 'This source is unavailable right now.'),
    count: countValue ?? 0,
  };
}

function categoriesFromJson(value: unknown): CategoryOption[] {
  if (!Array.isArray(value)) return [];
  const out: CategoryOption[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const key = str(entry.key).trim();
    const label = str(entry.label).trim();
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label });
  }
  return out;
}

/**
 * Parses a trends response. Returns null when the payload is unusable, so the
 * caller can tell "the server said something odd" apart from "there are no
 * results" — the two need different messages on screen.
 */
export function trendsPayloadFromJson(value: unknown): TrendsPayload | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.items)) return null;
  const items = value.items
    .map(trendItemFromJson)
    .filter((item): item is TrendItem => item !== null);
  const fetchedAt = str(value.fetchedAt);
  return {
    items,
    sources: Array.isArray(value.sources)
      ? value.sources
          .map(sourceReportFromJson)
          .filter((report): report is SourceReport => report !== null)
      : [],
    categories: categoriesFromJson(value.categories),
    category: str(value.category, 'all'),
    query: str(value.query),
    fetchedAt: Number.isNaN(Date.parse(fetchedAt)) ? '' : new Date(fetchedAt).toISOString(),
  };
}

// ----------------------------------------------------------------- filter ---

/**
 * Narrows an already-fetched page without another network call, so the search
 * box and the source tabs respond instantly.
 */
export function filterTrendItems(
  items: readonly TrendItem[],
  options: { query?: string; source?: TrendSourceKey | 'all' } = {},
): TrendItem[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const source = options.source ?? 'all';
  return items.filter((item) => {
    if (source !== 'all' && item.source !== source) return false;
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      item.excerpt.toLowerCase().includes(query) ||
      (item.community ?? '').toLowerCase().includes(query) ||
      (item.author ?? '').toLowerCase().includes(query)
    );
  });
}

// ---------------------------------------------------------------- display ---

/** 1234 → "1.2K", 4800000 → "4.8M"; small numbers are shown exactly. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const scaled = value / 1000;
    return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}K`;
  }
  const scaled = value / 1_000_000;
  return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}M`;
}

/** Engagement line, or null when the source published no metrics at all. */
export function engagementLabel(item: TrendItem): string | null {
  const { upvotes, points, likes, comments, shares } = item.metrics;
  const parts: string[] = [];
  if (typeof upvotes === 'number') parts.push(`${formatCount(upvotes)} upvotes`);
  else if (typeof points === 'number') parts.push(`${formatCount(points)} points`);
  else if (typeof likes === 'number') parts.push(`${formatCount(likes)} likes`);
  if (typeof comments === 'number') parts.push(`${formatCount(comments)} comments`);
  if (typeof shares === 'number') parts.push(`${formatCount(shares)} reposts`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "now" / "12m" / "3h" / "2d" / "3w"; empty string when the date is unusable. */
export function relativeTime(iso: string, now = Date.now()): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const seconds = Math.floor((now - parsed) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

// ------------------------------------------------------------------ cache ---

/**
 * Fresh enough to show without a network call.
 *
 * Ten minutes matches the intent of "this week's top posts": short enough that
 * re-opening Discover does not show yesterday's front page as new, long enough
 * that flipping between tabs costs nothing.
 */
export const TREND_TTL_MS = 10 * 60_000;

export function trendCacheKey(request: {
  category: string;
  query?: string;
  limit?: number;
}): string {
  return `${request.category}|${(request.query ?? '').trim().toLowerCase()}|${request.limit ?? 24}`;
}

export function isTrendFresh(savedAt: number | string | null | undefined, now = Date.now()): boolean {
  const at = typeof savedAt === 'number' ? savedAt : Date.parse(String(savedAt ?? ''));
  if (!Number.isFinite(at)) return false;
  return now - at < TREND_TTL_MS && now - at >= 0;
}

/** One record per cache key so several categories can be cached side by side. */
export type TrendCacheFile = Record<string, { savedAt: number; payload: TrendsPayload }>;

/** Keeps the stored file small when the creator browses many categories. */
export function pruneTrendCache(file: TrendCacheFile, now = Date.now(), keep = 8): TrendCacheFile {
  const entries = Object.entries(file)
    .filter(([key, entry]) => key && isTrendFresh(entry.savedAt, now))
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, keep);
  return Object.fromEntries(entries);
}
