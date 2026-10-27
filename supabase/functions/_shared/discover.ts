// Trend source adapters for the Discover screen.
//
// Three real sources, no scraping and no fabricated numbers:
//
//   reddit      — the official Reddit Data API over OAuth (client credentials).
//                 Unauthenticated `.json` endpoints answer 403, so the app is
//                 honest about needing a key rather than pretending to work.
//   x           — X API v2 recent search behind a bearer token (paid tier).
//   hackernews  — the public Algolia HN search API, which needs no key at all,
//                 so Discover carries live data on day one.
//
// Everything in this file is pure: it maps upstream JSON onto one normalised
// shape and never performs IO, so it can be tested against real fixtures.

export type TrendSourceKey = 'reddit' | 'x' | 'hackernews';

export type SourceStatus =
  | 'ok'
  | 'needs_key'
  | 'unavailable'
  | 'rate_limited'
  | 'error';

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
};

export type TrendItem = {
  /** Stable per-source id, used as the React key and for de-duplication. */
  id: string;
  source: TrendSourceKey;
  category: string;
  title: string;
  excerpt: string;
  /** Canonical link to the post on its own platform. */
  url: string;
  /** Optional link to whatever the post points at. */
  externalUrl?: string;
  author: string | null;
  community: string | null;
  createdAt: string;
  metrics: TrendMetrics;
  /** Short provenance line, e.g. "Reddit · r/socialmedia". */
  sourceLabel: string;
};

export const TREND_SOURCE_LABELS: Record<TrendSourceKey, string> = {
  reddit: 'Reddit',
  x: 'X',
  hackernews: 'Hacker News',
};

// ------------------------------------------------------------ categories ---

export type DiscoverCategory = {
  key: string;
  label: string;
  /** Subreddits consulted for this category, most specific first. */
  subreddits: string[];
  /** Query seed used when the creator has not typed a search term. */
  seedQuery: string;
  /** Whether Hacker News (a technology feed) plausibly belongs here. */
  includeHackerNews: boolean;
};

export const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  { key: 'all', label: 'All', subreddits: ['all'], seedQuery: 'creator economy', includeHackerNews: true },
  { key: 'marketing', label: 'Marketing', subreddits: ['SocialMedia', 'marketing', 'SEO', 'advertising'], seedQuery: 'social media marketing', includeHackerNews: false },
  { key: 'business', label: 'Business', subreddits: ['Entrepreneur', 'smallbusiness', 'startup', 'sideproject'], seedQuery: 'building a business', includeHackerNews: true },
  { key: 'tech', label: 'Tech', subreddits: ['technology', 'programming', 'startups'], seedQuery: 'technology', includeHackerNews: true },
  { key: 'fitness', label: 'Fitness', subreddits: ['fitness', 'bodyweightfitness', 'workout'], seedQuery: 'fitness routine', includeHackerNews: false },
  { key: 'food', label: 'Food', subreddits: ['Cooking', 'recipes', 'MealPrepSunday'], seedQuery: 'recipe', includeHackerNews: false },
  { key: 'beauty', label: 'Beauty', subreddits: ['MakeupAddiction', 'SkincareAddiction', 'haircare'], seedQuery: 'skincare routine', includeHackerNews: false },
  { key: 'travel', label: 'Travel', subreddits: ['travel', 'solotravel', 'TravelHacks'], seedQuery: 'travel tips', includeHackerNews: false },
  { key: 'gaming', label: 'Gaming', subreddits: ['gaming', 'Twitch', 'Games'], seedQuery: 'gaming', includeHackerNews: false },
  { key: 'education', label: 'Education', subreddits: ['TodayILearned', 'learnprogramming', 'GetStudying'], seedQuery: 'learning', includeHackerNews: true },
  { key: 'entertainment', label: 'Entertainment', subreddits: ['movies', 'television', 'Music'], seedQuery: 'entertainment', includeHackerNews: false },
  { key: 'design', label: 'Design', subreddits: ['design', 'graphic_design', 'web_design'], seedQuery: 'design', includeHackerNews: false },
];

const CATEGORY_BY_KEY = new Map(DISCOVER_CATEGORIES.map((entry) => [entry.key, entry]));

export function discoverCategory(key: string | null | undefined): DiscoverCategory {
  return (key && CATEGORY_BY_KEY.get(key)) || DISCOVER_CATEGORIES[0];
}

export function discoverCategoryLabel(key: string): string {
  return discoverCategory(key).label;
}

// -------------------------------------------------------------- helpers ----

/**
 * Subreddit names are interpolated into a URL path, so they are checked
 * against Reddit's own name rules before being used. Anything else falls back
 * to the catch-all listing — a request can never reach an arbitrary host or
 * path.
 */
export function safeSubreddit(name: string): string {
  return /^[A-Za-z0-9_]{2,21}$/.test(name) ? name : 'all';
}

/**
 * Removes markup before any text is shown.
 *
 * Hacker News stores `story_text` as raw HTML and Reddit can carry embedded
 * HTML in `selftext`. Rendering those verbatim would show a creator literal
 * angle brackets, so tags are dropped and the handful of entities Hacker News
 * actually uses are decoded back to characters.
 */
function stripMarkup(text: string): string {
  return text
    // Only real tags (`<p>`, `</a>`, `<!doctype …>`), so bare comparison
    // characters in plain prose are left intact.
    .replace(/<\/?[A-Za-z!][^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&#x2f;|&#47;/gi, '/')
    .replace(/&nbsp;/gi, ' ');
}

/** Collapses whitespace and truncates without cutting mid-word when possible. */
export function excerptOf(text: string | null | undefined, max = 240): string {
  const collapsed = stripMarkup(text ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

function asFiniteInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/** Reddit reports seconds since epoch; everything else here is already ISO. */
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function children(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !isRecord(payload.data)) return [];
  const list = payload.data.children;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => (isRecord(entry) && isRecord(entry.data) ? entry.data : null))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

// ---------------------------------------------------------------- Reddit ----

export function redditListingToItems(
  payload: unknown,
  category: string,
): TrendItem[] {
  const items: TrendItem[] = [];
  for (const data of children(payload)) {
    const id = typeof data.id === 'string' ? data.id : '';
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const permalink = typeof data.permalink === 'string' ? data.permalink : '';
    if (!id || !title || !permalink) continue;

    const subreddit =
      typeof data.subreddit === 'string' && data.subreddit ? data.subreddit : 'all';
    // Reddit hosts user links on their own domain; rewrite to an absolute URL.
    const url = permalink.startsWith('http')
      ? permalink
      : `https://www.reddit.com${permalink}`;
    const outbound = typeof data.url === 'string' ? data.url : '';
    const isSelf = data.is_self === true;

    const metrics: TrendMetrics = {};
    const upvotes = asFiniteInt(data.ups ?? data.score);
    const comments = asFiniteInt(data.num_comments);
    if (upvotes !== null) metrics.upvotes = upvotes;
    if (comments !== null) metrics.comments = comments;
    // Reddit exposes `upvote_ratio` but never a view count, so no impression
    // figure is shown — inventing one would be exactly the fake metric this
    // app refuses to display.

    items.push({
      id: `reddit:${id}`,
      source: 'reddit',
      category,
      title,
      excerpt: excerptOf(typeof data.selftext === 'string' ? data.selftext : ''),
      url,
      ...(isSelf || !outbound || !/^https?:\/\//i.test(outbound)
        ? {}
        : { externalUrl: outbound }),
      author: typeof data.author === 'string' && data.author ? `u/${data.author}` : null,
      community: `r/${subreddit}`,
      createdAt: isoFromUnixSeconds(data.created_utc) ?? new Date().toISOString(),
      metrics,
      sourceLabel: `Reddit · r/${subreddit}`,
    });
  }
  return items;
}

// -------------------------------------------------------------------- X ----

export function xSearchToItems(payload: unknown, category: string): TrendItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const users = new Map<string, { name: string; username: string }>();
  if (isRecord(payload.includes) && Array.isArray(payload.includes.users)) {
    for (const raw of payload.includes.users) {
      if (!isRecord(raw)) continue;
      const id = typeof raw.id === 'string' ? raw.id : '';
      const username = typeof raw.username === 'string' ? raw.username : '';
      if (id && username) {
        users.set(id, {
          name: typeof raw.name === 'string' ? raw.name : username,
          username,
        });
      }
    }
  }

  const items: TrendItem[] = [];
  for (const raw of payload.data) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id : '';
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!id || !text) continue;

    const authorId = typeof raw.author_id === 'string' ? raw.author_id : '';
    const user = users.get(authorId);
    const metrics: TrendMetrics = {};
    if (isRecord(raw.public_metrics)) {
      const likes = asFiniteInt(raw.public_metrics.like_count);
      const shares = asFiniteInt(raw.public_metrics.retweet_count);
      const comments = asFiniteInt(raw.public_metrics.reply_count);
      if (likes !== null) metrics.likes = likes;
      if (shares !== null) metrics.shares = shares;
      if (comments !== null) metrics.comments = comments;
    }

    const username = user?.username ?? null;
    // An X post cannot be linked without its author handle, so a post whose
    // author expansion is missing is skipped rather than linked to a dead URL.
    if (!username) continue;

    const firstLine = text.split('\n')[0] ?? '';
    items.push({
      id: `x:${id}`,
      source: 'x',
      category,
      // X has no title field; the first line stands in for one and the rest
      // becomes the excerpt, so nothing is invented.
      title: excerptOf(firstLine, 120),
      excerpt: excerptOf(text, 300),
      url: `https://x.com/${username}/status/${id}`,
      author: `@${username}`,
      community: user?.name ?? null,
      createdAt: isoOrNow(raw.created_at),
      metrics,
      sourceLabel: `X · @${username}`,
    });
  }
  return items;
}

// -------------------------------------------------------- Hacker News ------

export function hackerNewsToItems(payload: unknown, category: string): TrendItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.hits)) return [];
  const items: TrendItem[] = [];
  for (const raw of payload.hits) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.objectID === 'string' ? raw.objectID : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!id || !title) continue;

    const discussionUrl = `https://news.ycombinator.com/item?id=${id}`;
    const outbound = typeof raw.url === 'string' ? raw.url : '';
    const metrics: TrendMetrics = {};
    const points = asFiniteInt(raw.points);
    const comments = asFiniteInt(raw.num_comments);
    if (points !== null) metrics.points = points;
    if (comments !== null) metrics.comments = comments;

    items.push({
      id: `hn:${id}`,
      source: 'hackernews',
      category,
      title,
      excerpt: excerptOf(
        typeof raw.story_text === 'string' && raw.story_text
          ? raw.story_text
          : typeof raw.story_title === 'string'
            ? raw.story_title
            : '',
      ),
      url: discussionUrl,
      ...(outbound && /^https?:\/\//i.test(outbound) ? { externalUrl: outbound } : {}),
      author: typeof raw.author === 'string' && raw.author ? raw.author : null,
      community: 'Hacker News',
      createdAt: isoFromUnixSeconds(raw.created_at_i) ?? new Date().toISOString(),
      metrics,
      sourceLabel: 'Hacker News',
    });
  }
  return items;
}

// ---------------------------------------------------------- query builder --

/** Reddit's subreddit top listing — host and path are entirely server-chosen. */
export function redditTopUrl(
  subreddits: string | readonly string[],
  limit: number,
  after?: string,
  host = 'www.reddit.com',
): string {
  const list: readonly string[] =
    typeof subreddits === 'string' ? [subreddits] : subreddits;
  const names = list.map(safeSubreddit);
  // `safeSubreddit` returns "all" for anything invalid, so drop those rather
  // than producing a `foo+all` multi that Reddit would reject.
  const valid = names.filter((name) => name !== 'all');
  const path = valid.length > 0 ? valid.slice(0, 3).join('+') : 'all';
  const params = new URLSearchParams({
    t: 'week',
    limit: String(Math.max(1, Math.min(limit, 50))),
    raw_json: '1',
  });
  if (after) params.set('after', after);
  return `https://${host}/r/${path}/top.json?${params}`;
}

export function redditSearchUrl(query: string, limit: number, host = 'www.reddit.com'): string {
  const params = new URLSearchParams({
    q: query.slice(0, 100),
    restrict_sr: 'off',
    sort: 'top',
    t: 'week',
    limit: String(Math.max(1, Math.min(limit, 50))),
    raw_json: '1',
  });
  return `https://${host}/search.json?${params}`;
}

/**
 * X recent-search query. The free-text term is quoted so a multi-word seed
 * stays one phrase, and `-is:retweet` keeps reposts from diluting the results.
 */
export function buildXQuery(term: string): string {
  const cleaned = term.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  // Always quoted: an unquoted multi-word seed would be re-parsed as separate
  // terms and quietly change what the query means.
  const phrase = `"${cleaned || 'content creator'}"`;
  return `${phrase} -is:retweet lang:en`;
}

export function xSearchUrl(term: string, limit: number): string {
  const params = new URLSearchParams({
    query: buildXQuery(term),
    max_results: String(Math.max(10, Math.min(limit, 100))),
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username,name',
  });
  return `https://api.twitter.com/2/tweets/search/recent?${params}`;
}

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

// --------------------------------------------------------------- merging ----

/**
 * Orders a mixed batch so the most recent material leads, while keeping each
 * source's internal relevance ranking intact inside a time bucket.
 *
 * A single global sort would bury a slow-moving but highly upvoted Reddit
 * thread under fresher Hacker News items, so items are bucketed by age first
 * and then by their own platform metric.
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

/** Removes items that share a source id (overlapping pages, retried calls). */
export function dedupeTrendItems(items: readonly TrendItem[]): TrendItem[] {
  const seen = new Set<string>();
  const out: TrendItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Client-side text filter. The server already narrowed results by category or
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
      (item.community ?? '').toLowerCase().includes(query) ||
      (item.author ?? '').toLowerCase().includes(query)
    );
  });
}

/** Human-readable engagement line; returns null when a source gives no metrics. */
export function engagementLabel(item: TrendItem): string | null {
  const parts: string[] = [];
  const up = item.metrics.upvotes;
  const points = item.metrics.points;
  const likes = item.metrics.likes;
  const comments = item.metrics.comments;
  const shares = item.metrics.shares;
  if (typeof up === 'number') parts.push(`${formatCount(up)} upvotes`);
  else if (typeof points === 'number') parts.push(`${formatCount(points)} points`);
  else if (typeof likes === 'number') parts.push(`${formatCount(likes)} likes`);
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

export function sourceNeedsKeyMessage(key: TrendSourceKey): string {
  switch (key) {
    case 'reddit':
      return 'Reddit results need a Reddit OAuth app. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to Supabase to switch this source on.';
    case 'x':
      return 'X results need an X API bearer token with read access. Add X_BEARER_TOKEN to Supabase to switch this source on.';
    case 'hackernews':
      return 'Hacker News results are unavailable right now.';
  }
}
