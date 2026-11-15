// Discover wire format, display helpers and the client-side news cache.
//
// The server (supabase/functions/_shared/discover.ts) normalises nine keyless
// sources — Hacker News, Bluesky, Mastodon, Google Trends, Google News,
// GitHub, DEV Community, GDELT and Lobsters — into one shape; this module
// parses that shape defensively so a malformed or partial response degrades
// into an empty list rather than a crash, and provides the small pieces of
// display logic the screen needs.
//
// Reddit and X were removed completely in Discover 2.0: no keys, no adapters,
// no references in this file.

export type TrendSourceKey =
  | 'hackernews'
  | 'bluesky'
  | 'mastodon'
  | 'googletrends'
  | 'googlenews'
  | 'github'
  | 'devto'
  | 'gdelt'
  | 'lobsters';

export type TrendSectionKey =
  | 'for-you'
  | 'top-stories'
  | 'trending'
  | 'videos'
  | 'technology'
  | 'business'
  | 'entertainment'
  | 'creator-trends'
  | 'community';

export type SourceStatus = 'ok' | 'rate_limited' | 'unavailable' | 'error';

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
  stars?: number;
  forks?: number;
};

export type VideoKind = 'hls' | 'youtube' | 'file';

export type TrendItem = {
  id: string;
  source: TrendSourceKey;
  /** The section this card was fetched for; also its category badge. */
  section: TrendSectionKey;
  title: string;
  excerpt: string;
  /** Canonical link — the original article when the source exposes one. */
  url: string;
  /** Secondary link (the article a discussion post points at). */
  externalUrl?: string;
  author: string | null;
  /** Publisher or channel name shown next to its logo. */
  publisher: string | null;
  /** Real publisher logo/avatar — a favicon or the platform's own avatar. */
  publisherLogo: string | null;
  /** Real photo or video thumbnail from the source; null means "no image". */
  imageUrl: string | null;
  imageAlt: string | null;
  /** Playback URL when the item is a video (HLS, YouTube or a direct file). */
  videoUrl: string | null;
  videoKind: VideoKind | null;
  /** Seconds, only when the upstream source actually published a duration. */
  durationSeconds: number | null;
  /** Free-form community tag (e.g. a Mastodon hashtag), when present. */
  community: string | null;
  createdAt: string;
  metrics: TrendMetrics;
  /** Short provenance line, e.g. "Bluesky · @handle". */
  sourceLabel: string;
};

/** One entry in the horizontal section nav. */
export type SectionOption = { key: string; label: string };

/** @deprecated Pre-2.0 name; the chips now select sections, not categories. */
export type CategoryOption = SectionOption;

export type TrendsPayload = {
  items: TrendItem[];
  sources: SourceReport[];
  sections: SectionOption[];
  section: string;
  query: string;
  fetchedAt: string;
};

export const TREND_SOURCE_KEYS: TrendSourceKey[] = [
  'hackernews',
  'bluesky',
  'mastodon',
  'googletrends',
  'googlenews',
  'github',
  'devto',
  'gdelt',
  'lobsters',
];

export const SOURCE_LABELS: Record<TrendSourceKey, string> = {
  hackernews: 'Hacker News',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  googletrends: 'Google Trends',
  googlenews: 'Google News',
  github: 'GitHub',
  devto: 'DEV Community',
  gdelt: 'GDELT',
  lobsters: 'Lobsters',
};

export const DISCOVER_SECTIONS: SectionOption[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'top-stories', label: 'Top Stories' },
  { key: 'trending', label: 'Trending' },
  { key: 'videos', label: 'Videos' },
  { key: 'technology', label: 'Technology' },
  { key: 'business', label: 'Business' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'creator-trends', label: 'Creator Trends' },
  { key: 'community', label: 'Community' },
];

/**
 * Used before the first response arrives. Once the server answers, its own
 * section list replaces this — the server is authoritative, so the two can
 * never drift into showing a chip that resolves to nothing.
 */
export const DEFAULT_SECTIONS: SectionOption[] = DISCOVER_SECTIONS;

/** @deprecated Pre-2.0 name for `DEFAULT_SECTIONS`. */
export const DEFAULT_CATEGORIES = DEFAULT_SECTIONS;

const SECTION_KEYS = new Set<string>(DISCOVER_SECTIONS.map((entry) => entry.key));

export function isSectionKey(value: unknown): value is TrendSectionKey {
  return typeof value === 'string' && SECTION_KEYS.has(value);
}

export function sectionLabel(key: string): string {
  return DISCOVER_SECTIONS.find((entry) => entry.key === key)?.label ?? '';
}

/**
 * The category badge on a card: the section's own name, except For You (which
 * would only repeat the nav) and Videos (which is a media type, so it reads
 * better as "Video").
 */
export function categoryLabelFor(section: string): string | null {
  if (section === 'for-you') return null;
  if (section === 'videos') return 'Video';
  return sectionLabel(section) || null;
}

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

/** An http(s) URL, or null — keeps `javascript:` and junk out of the card. */
function httpUrl(value: unknown): string | null {
  const raw = str(value);
  return /^https?:\/\//i.test(raw) ? raw : null;
}

const STATUSES: SourceStatus[] = ['ok', 'rate_limited', 'unavailable', 'error'];

const VIDEO_KINDS: VideoKind[] = ['hls', 'youtube', 'file'];

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
  // point of Discover is showing where each story came from.
  if (!id || !source || !title || !/^https?:\/\//i.test(url)) return null;

  const rawMetrics = isRecord(value.metrics) ? value.metrics : {};
  const metrics: TrendMetrics = {};
  for (const key of ['upvotes', 'comments', 'likes', 'shares', 'points', 'stars', 'forks'] as const) {
    const parsed = count(rawMetrics[key]);
    if (parsed !== undefined) metrics[key] = parsed;
  }

  const rawSection = str(value.section);
  const section: TrendSectionKey = isSectionKey(rawSection) ? rawSection : 'for-you';

  const videoUrl = httpUrl(value.videoUrl);
  const rawKind = str(value.videoKind);
  const videoKind: VideoKind | null =
    videoUrl && VIDEO_KINDS.includes(rawKind as VideoKind) ? (rawKind as VideoKind) : null;

  const duration = count(value.durationSeconds);
  const external = httpUrl(value.externalUrl);
  const createdAt = str(value.createdAt);
  return {
    id,
    source,
    section,
    title,
    excerpt: str(value.excerpt).trim(),
    url,
    ...(external ? { externalUrl: external } : {}),
    author: nullableStr(value.author),
    publisher: nullableStr(value.publisher),
    publisherLogo: httpUrl(value.publisherLogo),
    imageUrl: httpUrl(value.imageUrl),
    imageAlt: nullableStr(value.imageAlt),
    videoUrl,
    videoKind,
    // A duration only means something when the card can actually play the
    // video, and only as a positive whole number of seconds.
    durationSeconds: videoKind && duration !== undefined && duration > 0 ? duration : null,
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

function sectionsFromJson(value: unknown): SectionOption[] {
  if (!Array.isArray(value)) return [];
  const out: SectionOption[] = [];
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
 *
 * Discover 2.0 sends `sections`/`section`; the pre-2.0 server sent the same
 * data as `categories`/`category`, so both spellings parse here and a stale
 * function still renders its chips.
 */
export function trendsPayloadFromJson(value: unknown): TrendsPayload | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.items)) return null;
  const items = value.items
    .map(trendItemFromJson)
    .filter((item): item is TrendItem => item !== null);
  const fetchedAt = str(value.fetchedAt);
  const sections = sectionsFromJson(
    Array.isArray(value.sections) ? value.sections : value.categories,
  );
  const section = str(value.section) || str(value.category) || 'for-you';
  return {
    items,
    sources: Array.isArray(value.sources)
      ? value.sources
          .map(sourceReportFromJson)
          .filter((report): report is SourceReport => report !== null)
      : [],
    sections: sections.length > 0 ? sections : DEFAULT_SECTIONS,
    section,
    query: str(value.query),
    fetchedAt: Number.isNaN(Date.parse(fetchedAt)) ? '' : new Date(fetchedAt).toISOString(),
  };
}

// ----------------------------------------------------------------- filter ---

/**
 * Narrows an already-fetched page without another network call, so the search
 * box and the section nav respond instantly.
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
      (item.publisher ?? '').toLowerCase().includes(query) ||
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
  const { upvotes, points, likes, comments, shares, stars, forks } = item.metrics;
  const parts: string[] = [];
  if (typeof stars === 'number') parts.push(`${formatCount(stars)} stars`);
  else if (typeof upvotes === 'number') parts.push(`${formatCount(upvotes)} upvotes`);
  else if (typeof points === 'number') parts.push(`${formatCount(points)} points`);
  else if (typeof likes === 'number') parts.push(`${formatCount(likes)} likes`);
  if (typeof forks === 'number') parts.push(`${formatCount(forks)} forks`);
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

/** 75 → "1:15", 600 → "10:00"; null when the duration is unusable. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ cache ---

/**
 * Fresh enough to show without a network call.
 *
 * Ten minutes matches the intent of "today's top stories": short enough that
 * re-opening Discover does not show yesterday's front page as new, long enough
 * that flipping between sections costs nothing.
 */
export const TREND_TTL_MS = 10 * 60_000;

export function trendCacheKey(request: {
  section: string;
  query?: string;
  limit?: number;
}): string {
  return `${request.section}|${(request.query ?? '').trim().toLowerCase()}|${request.limit ?? 24}`;
}

export function isTrendFresh(savedAt: number | string | null | undefined, now = Date.now()): boolean {
  const at = typeof savedAt === 'number' ? savedAt : Date.parse(String(savedAt ?? ''));
  if (!Number.isFinite(at)) return false;
  return now - at < TREND_TTL_MS && now - at >= 0;
}

/** One record per cache key so several sections can be cached side by side. */
export type TrendCacheFile = Record<string, { savedAt: number; payload: TrendsPayload }>;

/** Keeps the stored file small when the creator browses many sections. */
export function pruneTrendCache(file: TrendCacheFile, now = Date.now(), keep = 8): TrendCacheFile {
  const entries = Object.entries(file)
    .filter(([key, entry]) => key && isTrendFresh(entry.savedAt, now))
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, keep);
  return Object.fromEntries(entries);
}
