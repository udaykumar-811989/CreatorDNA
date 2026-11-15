// Trend source adapters for Discover 2.0's news cards.
//
// Nine real sources, no scraping of paywalled pages and no fabricated numbers:
//
//   hackernews   — the public Algolia HN search API (no key)
//   bluesky      — Bluesky's public app.bsky.feed.searchPosts appview (no key)
//   mastodon     — mastodon.social public trends (no key)
//   googletrends — Google Trends trending-search RSS (no key)
//   googlenews   — Google News RSS: the root "Top stories" feed plus search
//                  feeds scoped with `when:1d` for topic sections (no key)
//   github       — GitHub's repository search API (no key; search is rate
//                  limited to 10 requests/minute unauthenticated, so the
//                  caller caches)
//   devto        — DEV Community's public articles API (no key)
//   gdelt        — GDELT Doc API (no key; hard limit of one request every
//                  five seconds, enforced by the caller)
//   lobsters     — Lobsters' public hottest.json (no key)
//
// Reddit and X were removed completely in Discover 2.0 — no adapters, no
// credentials, no references anywhere in this file.
//
// Everything here is pure: it maps upstream JSON or RSS onto one normalised
// shape and never performs IO, so it can be tested against real fixtures.

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
  /** A sentence the screen can show verbatim. */
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

export type TrendItem = {
  /** Stable per-source id, used as the React key and for de-duplication. */
  id: string;
  source: TrendSourceKey;
  /** The section this item was fetched for; also the card's category badge. */
  section: TrendSectionKey;
  title: string;
  excerpt: string;
  /** Canonical link — the original article when the source exposes one. */
  url: string;
  /** Secondary link (e.g. the article a discussion post points at). */
  externalUrl?: string;
  author: string | null;
  /** Publisher or channel name shown next to its logo. */
  publisher: string | null;
  /** Real publisher logo/avatar URL — a favicon or the platform's own avatar. */
  publisherLogo: string | null;
  /** Real photo or video thumbnail from the source; null means "no image". */
  imageUrl: string | null;
  imageAlt: string | null;
  /** Playback URL when the item is a video (HLS, YouTube or a direct file). */
  videoUrl: string | null;
  videoKind: 'hls' | 'youtube' | 'file' | null;
  /** Seconds, only when the upstream source actually published a duration. */
  durationSeconds: number | null;
  /** Free-form community tag (e.g. a Mastodon hashtag), when the source has one. */
  community: string | null;
  createdAt: string;
  metrics: TrendMetrics;
  /** Short provenance line, e.g. "Bluesky · @handle". */
  sourceLabel: string;
};

export const TREND_SOURCE_LABELS: Record<TrendSourceKey, string> = {
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

// --------------------------------------------------------------- sections ---

export type DiscoverSection = { key: TrendSectionKey; label: string };

export const DISCOVER_SECTIONS: DiscoverSection[] = [
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

const SECTION_BY_KEY = new Map(DISCOVER_SECTIONS.map((entry) => [entry.key, entry]));

export function discoverSection(key: string | null | undefined): DiscoverSection {
  return (key && SECTION_BY_KEY.get(key as TrendSectionKey)) || DISCOVER_SECTIONS[0];
}

export function discoverSectionLabel(key: string): string {
  return discoverSection(key).label;
}

/** A section label used as the card's category badge; null when it would only repeat the nav. */
export function categoryLabelFor(section: TrendSectionKey): string | null {
  if (section === 'for-you') return null;
  if (section === 'videos') return 'Video';
  return discoverSectionLabel(section);
}

/**
 * Which sources answer each section, most specific first. A search term
 * overrides the section entirely and routes to the sources that can actually
 * search — the others (Trends, Mastodon, Lobsters, DEV) expose no search API,
 * so querying them would silently return unrelated material.
 */
export type SourceCall = { key: TrendSourceKey; query?: string };

const SEARCH_CALLS: SourceCall[] = [
  { key: 'googlenews' },
  { key: 'gdelt' },
  { key: 'hackernews' },
  { key: 'bluesky' },
  { key: 'github' },
];

export function sourceCalls(section: string, query: string): SourceCall[] {
  const trimmed = query.trim();
  if (trimmed) {
    return SEARCH_CALLS.map((call) => ({ ...call, query: trimmed }));
  }
  switch (discoverSection(section).key) {
    case 'top-stories':
      return [{ key: 'googlenews' }, { key: 'gdelt' }, { key: 'hackernews' }];
    case 'trending':
      return [
        { key: 'googletrends' },
        { key: 'hackernews' },
        { key: 'lobsters' },
        { key: 'github' },
        { key: 'mastodon' },
      ];
    case 'videos':
      // Two Bluesky queries: "video" surfaces native uploads, "youtube"
      // surfaces link posts with real YouTube thumbnails. Mastodon
      // contributes gifv/video attachments from its trending statuses.
      return [
        { key: 'bluesky', query: 'video' },
        { key: 'bluesky', query: 'youtube' },
        { key: 'mastodon' },
      ];
    case 'technology':
      return [
        { key: 'hackernews' },
        { key: 'github' },
        { key: 'devto' },
        { key: 'googlenews', query: 'technology' },
        { key: 'gdelt', query: 'technology' },
      ];
    case 'business':
      return [
        { key: 'googlenews', query: 'business' },
        { key: 'gdelt', query: 'business OR economy OR markets' },
        { key: 'hackernews', query: 'startup' },
      ];
    case 'entertainment':
      return [
        { key: 'googlenews', query: 'entertainment' },
        { key: 'gdelt', query: 'entertainment OR film OR music' },
        { key: 'bluesky', query: 'movies' },
        { key: 'mastodon' },
      ];
    case 'creator-trends':
      return [
        { key: 'googletrends' },
        { key: 'bluesky', query: 'creator economy' },
        { key: 'hackernews', query: 'creator economy' },
        { key: 'googlenews', query: 'content creator' },
      ];
    case 'community':
      return [
        { key: 'lobsters' },
        { key: 'devto' },
        { key: 'mastodon' },
        { key: 'bluesky', query: 'creator' },
      ];
    case 'for-you':
    default:
      return [
        { key: 'googlenews' },
        { key: 'gdelt', query: 'news OR world OR technology' },
        { key: 'hackernews' },
        { key: 'bluesky', query: 'news' },
        { key: 'googletrends' },
        { key: 'github' },
        { key: 'devto' },
        { key: 'lobsters' },
        { key: 'mastodon' },
      ];
  }
}

// -------------------------------------------------------------- helpers ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function isoFromUnixSeconds(seconds: unknown): string | null {
  const n = asFiniteInt(seconds);
  if (n === null || n <= 0) return null;
  const date = new Date(n * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoOrNow(value: unknown): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
}

/** Decodes the entities RSS feeds actually emit, including numeric ones. */
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&#x2f;|&#47;/gi, '/')
    .replace(/&nbsp;/gi, ' ')
    // Remaining numeric entities: &#8217; → ’, &#8220; → “, and so on.
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCodePoint(value) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const value = parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : '';
    });
}

/**
 * Removes markup before any text is shown.
 *
 * Feeds carry HTML in descriptions and social platforms store posts as HTML;
 * rendering those verbatim would show a creator literal angle brackets.
 */
export function stripMarkup(text: string): string {
  return decodeXmlEntities(
    text
      // Only real tags (`<p>`, `</a>`, `<!doctype …>`), so bare comparison
      // characters in plain prose are left intact.
      .replace(/<\/?[A-Za-z!][^>]*>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

/** Collapses whitespace and truncates without cutting mid-word when possible. */
export function excerptOf(text: string | null | undefined, max = 240): string {
  const collapsed = stripMarkup(text ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** All inner blocks of `<tag>…</tag>` pairs inside a larger XML fragment. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    if (match[1] !== undefined) out.push(match[1]);
  }
  return out;
}

/** Inner text of the first `<tag>…</tag>`; '' when missing or self-closing. */
export function xmlValue(block: string, tag: string): string {
  const paired = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (paired && paired[1] !== undefined) {
    return decodeXmlEntities(unwrapCdata(paired[1])).trim();
  }
  if (new RegExp(`<${tag}(?:\\s[^>]*)?/>`).test(block)) return '';
  return '';
}

function unwrapCdata(text: string): string {
  const cdata = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata && cdata[1] !== undefined ? cdata[1] : text;
}

/** Host of an absolute URL, lower-cased; '' when it cannot be determined. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Google's public favicon service — the publisher's real icon, never stock art. */
export function faviconUrl(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

/**
 * Stable non-crypto hash (djb2) so an item keeps the same id across refreshes
 * even when the source publishes no id of its own (RSS feeds, GDELT).
 */
export function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

/** YouTube video id from any of YouTube's URL shapes; null for other links. */
export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    if (/^(www\.|m\.)?youtube\.com$/.test(parsed.hostname)) {
      const embed = parsed.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,})/);
      if (embed && embed[1]) return embed[1];
      const shorts = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
      if (shorts && shorts[1]) return shorts[1];
      const watch = parsed.searchParams.get('v');
      if (watch && /^[A-Za-z0-9_-]{6,}$/.test(watch)) return watch;
    }
  } catch {
    return null;
  }
  return null;
}

/** Canonical Bluesky post URL for an `at://` URI. */
export function blueskyPostUrl(uri: string, handle: string | null): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!match || !match[1] || !match[2]) return null;
  const handleOrDid = handle && handle.includes('.') ? handle : match[1];
  return `https://bsky.app/profile/${handleOrDid}/post/${match[2]}`;
}

/**
 * Tracking parameters that never change what a link points at. Everything else
 * (including Google News' `oc=5`) is preserved — stripping unknown parameters
 * could break the link.
 */
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'ref', 'ref_src', 'si']);

/** Lower-cased host + path with tracking params and fragment removed. */
export function canonicalUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    const keep: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (!/^utm_/i.test(key) && !TRACKING_PARAMS.has(key.toLowerCase())) {
        keep.push(key);
      }
    });
    keep.sort();
    const query = keep.length
      ? `?${keep.map((key) => `${key}=${parsed.searchParams.get(key) ?? ''}`).join('&')}`
      : '';
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${query}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Normalised headline key for cross-outlet de-duplication. Only long headlines
 * qualify: short ones ("Breaking news") collide across genuinely different
 * stories, while a syndicated 60-character headline is usually byte-identical
 * across outlets that carried the same wire story.
 */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------------------------------------------------------------- parsing ---

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// -------------------------------------------------------- Hacker News ------

export function hackerNewsToItems(
  payload: unknown,
  section: TrendSectionKey,
): TrendItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.hits)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload.hits) {
    if (!isRecord(raw)) continue;
    const id = text(raw.objectID);
    const title = text(raw.title);
    if (!id || !title) continue;

    const discussionUrl = `https://news.ycombinator.com/item?id=${id}`;
    const outbound = text(raw.url);
    const linked = /^https?:\/\//i.test(outbound);
    const publisher = text(raw.site) || (linked ? hostOf(outbound) : '') || 'Hacker News';

    const metrics: TrendMetrics = {};
    const points = asFiniteInt(raw.points);
    const comments = asFiniteInt(raw.num_comments);
    if (points !== null) metrics.points = points;
    if (comments !== null) metrics.comments = comments;

    items.push({
      id: `hn:${id}`,
      source: 'hackernews',
      section,
      title,
      excerpt: excerptOf(
        typeof raw.story_text === 'string' && raw.story_text
          ? raw.story_text
          : text(raw.story_title),
      ),
      url: discussionUrl,
      ...(linked ? { externalUrl: outbound } : {}),
      author: text(raw.author) || null,
      community: null,
      publisher,
      publisherLogo: linked ? faviconUrl(outbound) : null,
      imageUrl: null,
      imageAlt: null,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt: isoFromUnixSeconds(raw.created_at_i) ?? new Date().toISOString(),
      metrics,
      sourceLabel: 'Hacker News',
    });
  }
  return items;
}

// ---------------------------------------------------------------- Bluesky ---

type BlueskyMedia = {
  imageUrl: string | null;
  videoUrl: string | null;
  videoKind: 'hls' | 'youtube' | null;
  title: string | null;
  externalUrl: string | null;
};

/** Reads whichever embed view a Bluesky post carries (or its recordWithMedia wrapper). */
function blueskyMedia(embed: unknown): BlueskyMedia {
  const empty: BlueskyMedia = {
    imageUrl: null,
    videoUrl: null,
    videoKind: null,
    title: null,
    externalUrl: null,
  };
  if (!isRecord(embed)) return empty;
  const type = text(embed.$type);

  // recordWithMedia#view nests the post's own embed under `record`/`media`.
  if (type === 'app.bsky.embed.recordWithMedia#view') {
    const media = isRecord(embed.media) ? blueskyMedia(embed.media) : empty;
    const record = isRecord(embed.record) ? embed.record : null;
    const value = record && isRecord(record.value) ? record.value : null;
    const outer = value ? blueskyMedia(value.embed) : empty;
    return {
      imageUrl: media.imageUrl ?? outer.imageUrl,
      videoUrl: media.videoUrl ?? outer.videoUrl,
      videoKind: media.videoKind ?? outer.videoKind,
      title: media.title ?? outer.title,
      externalUrl: media.externalUrl ?? outer.externalUrl,
    };
  }

  if (type === 'app.bsky.embed.external#view' && isRecord(embed.external)) {
    const uri = text(embed.external.uri);
    const thumb = text(embed.external.thumb);
    const title = text(embed.external.title);
    const youtubeId = uri ? youtubeVideoId(uri) : null;
    return {
      imageUrl: thumb || null,
      videoUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null,
      videoKind: youtubeId ? 'youtube' : null,
      title: title || null,
      // The linked article/site is the story; the Bluesky post stays `url`.
      externalUrl: uri && /^https?:\/\//i.test(uri) ? uri : null,
    };
  }

  if (type === 'app.bsky.embed.video#view') {
    return {
      imageUrl: text(embed.thumbnail) || null,
      videoUrl: text(embed.playlist) || null,
      videoKind: text(embed.playlist) ? 'hls' : null,
      title: null,
      externalUrl: null,
    };
  }

  if (type === 'app.bsky.embed.images#view' && Array.isArray(embed.images)) {
    const first = embed.images.find(isRecord);
    if (first) {
      return {
        imageUrl: text(first.fullsize) || text(first.thumb) || null,
        videoUrl: null,
        videoKind: null,
        title: null,
        externalUrl: null,
      };
    }
  }

  return empty;
}

export function blueskyToItems(payload: unknown, section: TrendSectionKey): TrendItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.posts)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload.posts) {
    if (!isRecord(raw)) continue;
    const uri = text(raw.uri);
    const author = isRecord(raw.author) ? raw.author : null;
    const handle = author ? text(author.handle) : '';
    const postUrl = uri ? blueskyPostUrl(uri, handle || null) : null;
    const record = isRecord(raw.record) ? raw.record : null;
    const body = record ? text(record.text) : '';
    if (!postUrl || !body) continue;

    const media = blueskyMedia(raw.embed ?? (record ? record.embed : null));
    const firstLine = body.split('\n')[0] ?? '';
    const title = media.title || excerptOf(firstLine, 120) || excerptOf(body, 120);
    const displayName = author ? text(author.displayName) : '';

    const metrics: TrendMetrics = {};
    const likes = asFiniteInt(raw.likeCount);
    const replies = asFiniteInt(raw.replyCount);
    const reposts = asFiniteInt(raw.repostCount);
    if (likes !== null) metrics.likes = likes;
    if (replies !== null) metrics.comments = replies;
    if (reposts !== null) metrics.shares = reposts;

    items.push({
      id: `bsky:${uri}`,
      source: 'bluesky',
      section,
      title,
      // The post text is the summary unless the card's headline came from the
      // embedded article (then the post text is the commentary under it).
      excerpt: excerptOf(media.title ? body : body.slice(title.length), 300) ||
        excerptOf(body, 300),
      url: postUrl,
      ...(media.externalUrl && media.externalUrl !== postUrl
        ? { externalUrl: media.externalUrl }
        : {}),
      author: handle ? `@${handle}` : null,
      community: null,
      publisher: displayName || (handle ? `@${handle}` : 'Bluesky'),
      publisherLogo: author ? text(author.avatar) || null : null,
      imageUrl: media.imageUrl,
      imageAlt: media.title || excerptOf(firstLine, 90) || null,
      videoUrl: media.videoUrl,
      videoKind: media.videoKind,
      durationSeconds: null,
      createdAt: isoOrNow(record ? record.createdAt : raw.indexedAt),
      metrics,
      sourceLabel: handle ? `Bluesky · @${handle}` : 'Bluesky',
    });
  }
  return items;
}

// --------------------------------------------------------------- Mastodon ---

export function mastodonToItems(payload: unknown, section: TrendSectionKey): TrendItem[] {
  const statuses = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.statuses)
      ? payload.statuses
      : [];
  const items: TrendItem[] = [];
  for (const raw of statuses) {
    if (!isRecord(raw)) continue;
    const id = text(raw.id);
    const url = text(raw.url);
    const body = excerptOf(text(raw.content), 400);
    if (!id || !url || !body) continue;

    const account = isRecord(raw.account) ? raw.account : null;
    const displayName = account ? text(account.display_name) : '';
    const acct = account ? text(account.acct) : '';
    const avatar = account ? text(account.avatar) : '';

    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let videoKind: 'hls' | 'file' | null = null;
    let durationSeconds: number | null = null;
    const attachments = Array.isArray(raw.media_attachments) ? raw.media_attachments : [];
    const attachment = attachments.find(isRecord);
    if (attachment) {
      const kind = text(attachment.type);
      const preview = text(attachment.preview_url);
      const full = text(attachment.url);
      imageUrl = preview || (kind === 'image' ? full : '') || null;
      if (kind === 'video' || kind === 'gifv') {
        videoUrl = full || null;
        videoKind = full ? 'file' : null;
        const meta = isRecord(attachment.meta) ? attachment.meta : null;
        const original = meta && isRecord(meta.original) ? meta.original : meta;
        const duration = original ? asFiniteInt(original.duration) : null;
        durationSeconds = duration !== null && duration > 0 ? duration : null;
      }
    }

    const tags = Array.isArray(raw.tags) ? raw.tags : [];
    const firstTag = tags.find(isRecord);
    const tagName = firstTag ? text(firstTag.name) : '';

    const metrics: TrendMetrics = {};
    const likes = asFiniteInt(raw.favourites_count);
    const reposts = asFiniteInt(raw.reblogs_count);
    const replies = asFiniteInt(raw.replies_count);
    if (likes !== null) metrics.likes = likes;
    if (reposts !== null) metrics.shares = reposts;
    if (replies !== null) metrics.comments = replies;

    items.push({
      id: `mast:${id}`,
      source: 'mastodon',
      section,
      // Mastodon posts have no headline; the first line stands in for one and
      // the rest becomes the summary, so nothing is invented.
      title: excerptOf(body, 120),
      excerpt: excerptOf(body.slice(120), 300) || body,
      url,
      author: acct ? `@${acct}` : null,
      community: tagName ? `#${tagName}` : null,
      publisher: displayName || (acct ? `@${acct}` : 'Mastodon'),
      publisherLogo: avatar || null,
      imageUrl,
      imageAlt: imageUrl ? excerptOf(body, 90) : null,
      videoUrl,
      videoKind,
      durationSeconds,
      createdAt: isoOrNow(raw.created_at),
      metrics,
      sourceLabel: 'Mastodon',
    });
  }
  return items;
}

// ----------------------------------------------------------- Google Trends --

export function googleTrendsRssToItems(xml: string, section: TrendSectionKey): TrendItem[] {
  const items: TrendItem[] = [];
  for (const block of xmlBlocks(xml, 'item')) {
    const term = xmlValue(block, 'title');
    if (!term) continue;
    const traffic = xmlValue(block, 'ht:approx_traffic');
    const picture = xmlValue(block, 'ht:picture');
    const pictureSource = xmlValue(block, 'ht:picture_source');
    const newsBlocks = xmlBlocks(block, 'ht:news_item');
    const news = newsBlocks[0] ?? '';

    const newsTitle = news ? xmlValue(news, 'ht:news_item_title') : '';
    const newsSnippet = news ? xmlValue(news, 'ht:news_item_snippet') : '';
    const newsUrl = news ? xmlValue(news, 'ht:news_item_url') : '';
    const newsPicture = news ? xmlValue(news, 'ht:news_item_picture') : '';
    const newsSource = news ? xmlValue(news, 'ht:news_item_source') : '';

    const linked = /^https?:\/\//i.test(newsUrl);
    const trafficLine = traffic
      ? `Trending search: “${term}” — ${traffic} searches today.`
      : `Trending search: “${term}”.`;

    const pubDate = xmlValue(block, 'pubDate');
    const createdAt = Number.isNaN(Date.parse(pubDate))
      ? new Date().toISOString()
      : new Date(pubDate).toISOString();

    // The trend itself has no article link; only the picture is real, so the
    // card links to Google Trends rather than pretending to have a story.
    const url = linked
      ? newsUrl
      : `https://trends.google.com/trending/rss?geo=US`;

    items.push({
      id: `gtrends:${hashString(`${term}|${newsUrl || picture}`)}`,
      source: 'googletrends',
      section,
      title: newsTitle || term,
      excerpt: excerptOf(
        newsSnippet ? `${trafficLine} ${newsSnippet}` : trafficLine,
        240,
      ),
      url,
      author: null,
      community: null,
      publisher: newsSource || pictureSource || 'Google Trends',
      publisherLogo: linked ? faviconUrl(newsUrl) : null,
      imageUrl: newsPicture || picture || null,
      imageAlt: newsTitle || term,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt,
      metrics: {},
      sourceLabel: 'Google Trends',
    });
  }
  return items;
}

// ------------------------------------------------------------ Google News ---

export function googleNewsRssToItems(xml: string, section: TrendSectionKey): TrendItem[] {
  const items: TrendItem[] = [];
  for (const block of xmlBlocks(xml, 'item')) {
    const rawTitle = xmlValue(block, 'title');
    const link = xmlValue(block, 'link');
    if (!rawTitle || !/^https?:\/\//i.test(link)) continue;

    const sourceName = xmlValue(block, 'source');
    const sourceDomain = extractXmlAttr(block, 'source', 'url');
    // Google News appends the publisher as "Headline - Publisher"; the real
    // publisher already has its own field, so the duplicate suffix is dropped.
    const title = sourceName && rawTitle.endsWith(` - ${sourceName}`)
      ? rawTitle.slice(0, -(sourceName.length + 3)).trim()
      : rawTitle;

    const pubDate = xmlValue(block, 'pubDate');
    const createdAt = Number.isNaN(Date.parse(pubDate))
      ? new Date().toISOString()
      : new Date(pubDate).toISOString();

    // The RSS description is only an anchor back to the same opaque Google
    // link — there is no summary to show, and the link resolves to the
    // original article in the reader's browser.
    items.push({
      id: `gnews:${hashString(link.split('?')[0] || rawTitle)}`,
      source: 'googlenews',
      section,
      title,
      excerpt: '',
      url: link,
      author: null,
      community: null,
      publisher: sourceName || (sourceDomain ? hostOf(sourceDomain) : 'Google News'),
      publisherLogo: sourceDomain ? faviconUrl(sourceDomain) : null,
      imageUrl: null,
      imageAlt: null,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt,
      metrics: {},
      sourceLabel: 'Google News',
    });
  }
  return items;
}

/** Attribute value of the first `<tag attr="value">` in a block. */
export function extractXmlAttr(block: string, tag: string, attr: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`));
  return match && match[1] !== undefined ? decodeXmlEntities(match[1]).trim() : '';
}

// ----------------------------------------------------------------- GitHub ---

export function githubToItems(payload: unknown, section: TrendSectionKey): TrendItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload.items) {
    if (!isRecord(raw)) continue;
    const fullName = text(raw.full_name);
    const htmlUrl = text(raw.html_url);
    if (!fullName || !/^https?:\/\//i.test(htmlUrl)) continue;

    const owner = isRecord(raw.owner) ? raw.owner : null;
    const language = text(raw.language);
    const topics = Array.isArray(raw.topics)
      ? raw.topics.map((entry) => text(entry)).filter(Boolean)
      : [];

    const metrics: TrendMetrics = {};
    const stars = asFiniteInt(raw.stargazers_count);
    const forks = asFiniteInt(raw.forks_count);
    if (stars !== null) metrics.stars = stars;
    if (forks !== null) metrics.forks = forks;

    items.push({
      id: `gh:${fullName}`,
      source: 'github',
      section,
      title: fullName,
      excerpt: excerptOf(text(raw.description), 240),
      url: htmlUrl,
      author: owner ? text(owner.login) || null : null,
      community: language ? language : topics[0] ? `#${topics[0]}` : null,
      publisher: owner ? text(owner.login) || fullName.split('/')[0] : fullName.split('/')[0],
      publisherLogo: owner ? text(owner.avatar_url) || null : null,
      // GitHub publishes no repository photo; the card falls back to its clean
      // image-less layout rather than borrowing stock art.
      imageUrl: null,
      imageAlt: null,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt: isoOrNow(raw.created_at),
      metrics,
      sourceLabel: 'GitHub',
    });
  }
  return items;
}

// ------------------------------------------------------------ DEV Community --

export function devToItems(payload: unknown, section: TrendSectionKey): TrendItem[] {
  if (!Array.isArray(payload)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload) {
    if (!isRecord(raw)) continue;
    const id = asFiniteInt(raw.id);
    const title = text(raw.title);
    const url = text(raw.url);
    if (id === null || !title || !/^https?:\/\//i.test(url)) continue;

    const user = isRecord(raw.user) ? raw.user : null;
    const tags = Array.isArray(raw.tag_list)
      ? raw.tag_list.map((entry) => text(entry)).filter(Boolean)
      : [];

    const metrics: TrendMetrics = {};
    const likes = asFiniteInt(raw.positive_reactions_count);
    const comments = asFiniteInt(raw.comments_count);
    if (likes !== null) metrics.likes = likes;
    if (comments !== null) metrics.comments = comments;

    items.push({
      id: `dev:${id}`,
      source: 'devto',
      section,
      title,
      excerpt: excerptOf(text(raw.description), 240),
      url,
      author: user ? `@${text(raw.username) || text(user.username)}` : null,
      community: tags[0] ? `#${tags[0]}` : null,
      publisher: user ? text(user.name) || text(user.username) : 'DEV Community',
      publisherLogo: user ? text(user.profile_image_92) || null : null,
      imageUrl: text(raw.social_image) || null,
      imageAlt: title,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt: isoOrNow(raw.published_at),
      metrics,
      sourceLabel: 'DEV Community',
    });
  }
  return items;
}

// ------------------------------------------------------------------ GDELT --

/** GDELT's `seendate` is `20261025T033000Z`; anything else falls back to now. */
function gdeltDate(value: unknown): string {
  const raw = text(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return new Date().toISOString();
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function gdeltToItems(payload: unknown, section: TrendSectionKey): TrendItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.articles)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload.articles) {
    if (!isRecord(raw)) continue;
    const url = text(raw.url);
    const title = text(raw.title);
    if (!/^https?:\/\//i.test(url) || !title) continue;

    const domain = text(raw.domain) || hostOf(url);
    items.push({
      id: `gdelt:${hashString(url)}`,
      source: 'gdelt',
      section,
      title,
      // GDELT's article list carries no summary; the card shows no excerpt
      // rather than inventing one.
      excerpt: '',
      url,
      author: null,
      community: text(raw.sourcecountry) || null,
      publisher: domain,
      publisherLogo: faviconUrl(url),
      imageUrl: text(raw.socialimage) || null,
      imageAlt: title,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt: gdeltDate(raw.seendate),
      metrics: {},
      sourceLabel: 'GDELT',
    });
  }
  return items;
}

// --------------------------------------------------------------- Lobsters ---

export function lobstersToItems(payload: unknown, section: TrendSectionKey): TrendItem[] {
  if (!Array.isArray(payload)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload) {
    if (!isRecord(raw)) continue;
    const shortId = text(raw.short_id);
    const title = text(raw.title);
    const discussionUrl = text(raw.short_id_url);
    if (!shortId || !title || !/^https?:\/\//i.test(discussionUrl)) continue;

    const articleUrl = text(raw.url);
    const linked = /^https?:\/\//i.test(articleUrl);
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((entry) => text(entry)).filter(Boolean)
      : [];

    const metrics: TrendMetrics = {};
    const score = asFiniteInt(raw.score);
    const comments = asFiniteInt(raw.comment_count);
    if (score !== null) metrics.upvotes = score;
    if (comments !== null) metrics.comments = comments;

    items.push({
      id: `lob:${shortId}`,
      source: 'lobsters',
      section,
      title,
      excerpt: excerptOf(text(raw.description_plain) || text(raw.description), 240),
      url: discussionUrl,
      ...(linked ? { externalUrl: articleUrl } : {}),
      author: text(raw.submitter_user) || null,
      community: tags[0] ? `#${tags[0]}` : null,
      publisher: linked ? hostOf(articleUrl) : 'Lobsters',
      publisherLogo: linked ? faviconUrl(articleUrl) : null,
      imageUrl: null,
      imageAlt: null,
      videoUrl: null,
      videoKind: null,
      durationSeconds: null,
      createdAt: isoOrNow(raw.created_at),
      metrics,
      sourceLabel: 'Lobsters',
    });
  }
  return items;
}

// ---------------------------------------------------------- query builder --

/**
 * The app's category chips predate Discover 2.0's sections, so both
 * spellings keep working: a stale client sends `category`, the server maps it
 * to a section, and every item carries the legacy `category` back so the old
 * renderer still shows its own wording instead of a raw section key.
 */
const LEGACY_CATEGORY_SECTIONS: Record<string, TrendSectionKey> = {
  all: 'for-you',
  marketing: 'for-you',
  business: 'business',
  tech: 'technology',
  entertainment: 'entertainment',
  fitness: 'for-you',
  food: 'for-you',
  beauty: 'for-you',
  travel: 'for-you',
  gaming: 'for-you',
  education: 'for-you',
  design: 'for-you',
};

export function sectionFromLegacyCategory(category: string): TrendSectionKey {
  return LEGACY_CATEGORY_SECTIONS[category] ?? 'for-you';
}

/** Hacker News Algolia search — front page without a term, full text with one. */
export function hackerNewsUrl(term: string | null, limit: number): string {
  const params = new URLSearchParams({ hitsPerPage: String(Math.max(1, Math.min(limit, 50))) });
  if (term) {
    params.set('query', term.slice(0, 100));
    params.set('tags', 'story');
  } else {
    params.set('tags', 'front_page');
  }
  return `https://hn.algolia.com/api/v1/search?${params}`;
}

/**
 * Bluesky public appview search. The appview (api.bsky.app) needs no app
 * password; the label service (public.api.bsky.app) rejects anonymous calls.
 */
export function blueskySearchUrl(
  query: string,
  limit: number,
  sort: 'top' | 'latest' = 'top',
): string {
  const params = new URLSearchParams({
    q: query.slice(0, 100),
    sort,
    limit: String(Math.max(1, Math.min(limit, 100))),
  });
  return `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`;
}

/** Mastodon's public trending statuses — keyless on mastodon.social. */
export function mastodonTrendsUrl(limit: number): string {
  const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(limit, 40))) });
  return `https://mastodon.social/api/v1/trends/statuses?${params}`;
}

/** Google's real-time trending searches RSS for one country. */
export function googleTrendsRssUrl(geo = 'US'): string {
  const safeGeo = /^[A-Z]{2}$/.test(geo) ? geo : 'US';
  return `https://trends.google.com/trending/rss?geo=${safeGeo}`;
}

/** Google News root feed — the curated "Top stories" list. */
export function googleNewsTopUrl(): string {
  return 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
}

/**
 * Google News search feed. Topic sections scope to the last day (`when:1d`)
 * so the chips stay fresh; a creator's own search term runs unscoped so older
 * stories about the topic can still surface.
 */
export function googleNewsSearchUrl(query: string, fresh: boolean): string {
  const term = query.trim().slice(0, 100) || 'news';
  const scoped = fresh ? `${term} when:1d` : term;
  const params = new URLSearchParams({
    q: scoped,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
  });
  return `https://news.google.com/rss/search?${params}`;
}

/**
 * GitHub's trending substitute: the repository search API sorted by stars.
 * With no term it looks at repos created in the last week — the standard
 * keyless way to read what is climbing, since GitHub publishes no trending API.
 */
export function githubTrendingUrl(
  query: string | null,
  limit: number,
  now = Date.now(),
): string {
  const perPage = String(Math.max(1, Math.min(limit, 30)));
  if (query && query.trim()) {
    const params = new URLSearchParams({
      q: query.trim().slice(0, 100),
      sort: 'stars',
      order: 'desc',
      per_page: perPage,
    });
    return `https://api.github.com/search/repositories?${params}`;
  }
  const since = new Date(now - 7 * 24 * 3_600_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    q: `created:>${since}`,
    sort: 'stars',
    order: 'desc',
    per_page: perPage,
  });
  return `https://api.github.com/search/repositories?${params}`;
}

/** DEV Community's public articles API — top of the last week by default. */
export function devArticlesUrl(limit: number): string {
  const params = new URLSearchParams({
    top: '7',
    per_page: String(Math.max(1, Math.min(limit, 30))),
  });
  return `https://dev.to/api/articles?${params}`;
}

/**
 * GDELT Doc API. The query always carries `sourcelang:english` so mixed-
 * language wires never reach an English-language card, and results are sorted
 * newest-first. The caller enforces GDELT's one-request-per-five-seconds rule.
 *
 * GDELT refuses a query whose boolean terms are not wrapped in parentheses —
 * and answers that refusal with HTTP 200 and a plain-text sentence, which
 * would otherwise arrive as an unparseable "JSON" response. Wrapping here
 * means every caller (including a query straight from the search box) is
 * shaped the way the API accepts.
 */
export function gdeltUrl(query: string, limit: number): string {
  const cleaned = query.trim().slice(0, 200) || 'news';
  const booleanTerms = /\s(?:OR|AND)\s/i.test(cleaned);
  const scoped = booleanTerms && !cleaned.startsWith('(') ? `(${cleaned})` : cleaned;
  const params = new URLSearchParams({
    query: `${scoped} sourcelang:english`,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(Math.max(1, Math.min(limit, 50))),
    sort: 'datedesc',
  });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
}

/** Lobsters' hottest stories; page 2 exists for the second batch. */
export function lobstersUrl(page = 1): string {
  const safePage = Number.isFinite(page) && page > 1 ? Math.min(Math.round(page), 5) : 1;
  return safePage === 1
    ? 'https://lobste.rs/hottest.json'
    : `https://lobste.rs/hottest.json?page=${safePage}`;
}

// --------------------------------------------------------------- merging ----

/**
 * Orders a mixed batch so the most recent material leads, while keeping each
 * source's internal relevance ranking intact inside a time bucket.
 *
 * A single global sort would bury a slow-moving but highly starred GitHub repo
 * under fresher headlines, so items are bucketed by age first and then by
 * their own platform metric.
 */
export function rankTrendItems(items: readonly TrendItem[]): TrendItem[] {
  const now = Date.now();
  const hour = 3_600_000;
  const bucket = (item: TrendItem): number => {
    const age = now - Date.parse(item.createdAt);
    if (!Number.isFinite(age)) return 4;
    if (age < 6 * hour) return 0;
    if (age < 24 * hour) return 1;
    if (age < 72 * hour) return 2;
    return 3;
  };
  const weight = (item: TrendItem): number =>
    Math.max(
      item.metrics.upvotes ?? 0,
      item.metrics.points ?? 0,
      item.metrics.likes ?? 0,
      item.metrics.stars ?? 0,
      0,
    );
  return [...items].sort((a, b) => {
    const bucketDiff = bucket(a) - bucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    const metricDiff = weight(b) - weight(a);
    if (metricDiff !== 0) return metricDiff;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

/** True when the item carries a real image (or a video thumbnail). */
function hasImage(item: TrendItem): boolean {
  return Boolean(item.imageUrl);
}

/**
 * Removes the same story arriving from more than one source or page: first by
 * canonical URL, then — for syndicated wire stories whose outlets each publish
 * their own link — by an identical long headline. When a duplicate carries a
 * real image and the kept one does not, the image-bearing card wins.
 */
export function dedupeTrendItems(items: readonly TrendItem[]): TrendItem[] {
  const byUrl = new Map<string, number>();
  const byTitle = new Map<string, number>();
  const out: TrendItem[] = [];
  for (const item of items) {
    const urlKey = canonicalUrlKey(item.url);
    const titleK = titleKey(item.title);
    const titleDedupe = titleK.length >= 40;
    const existingIndex =
      byUrl.get(urlKey) ?? (titleDedupe ? byTitle.get(titleK) : undefined);

    if (existingIndex !== undefined) {
      const existing = out[existingIndex];
      if (!hasImage(existing) && hasImage(item)) {
        out[existingIndex] = item;
      }
      continue;
    }
    byUrl.set(urlKey, out.length);
    if (titleDedupe) byTitle.set(titleK, out.length);
    out.push(item);
  }
  return out;
}

/**
 * Client-side text filter. The server already narrowed results by section or
 * search term; this keeps the on-screen filtering instant and consistent.
 */
export function filterTrendItems(
  items: readonly TrendItem[],
  options: { query?: string; source?: TrendSourceKey | 'all' },
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

/** Human-readable engagement line; returns null when a source gives no metrics. */
export function engagementLabel(item: TrendItem): string | null {
  const parts: string[] = [];
  const { upvotes, points, likes, comments, shares, stars, forks } = item.metrics;
  if (typeof stars === 'number') parts.push(`${formatCount(stars)} stars`);
  else if (typeof upvotes === 'number') parts.push(`${formatCount(upvotes)} upvotes`);
  else if (typeof points === 'number') parts.push(`${formatCount(points)} points`);
  else if (typeof likes === 'number') parts.push(`${formatCount(likes)} likes`);
  if (typeof forks === 'number') parts.push(`${formatCount(forks)} forks`);
  if (typeof comments === 'number') parts.push(`${formatCount(comments)} comments`);
  if (typeof shares === 'number') parts.push(`${formatCount(shares)} reposts`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

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
