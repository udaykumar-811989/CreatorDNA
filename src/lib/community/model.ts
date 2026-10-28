// Community domain model: types, row parsing, input validation and the reward
// maths. Everything here is pure so it can be unit tested without a network.

// ----------------------------------------------------------------- types ----

export const POST_KINDS = ['update', 'collab', 'question', 'showcase'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const POST_KIND_LABELS: Record<PostKind, string> = {
  update: 'Update',
  collab: 'Collab',
  question: 'Question',
  showcase: 'Showcase',
};

/**
 * How the Community feed can be ordered. Both sorts are real queries against
 * the posts table — "Trending" is an engagement order, not a curated list.
 */
export const FEED_SORTS = ['latest', 'trending'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const FEED_SORT_LABELS: Record<FeedSort, string> = {
  latest: 'Latest',
  trending: 'Trending',
};

/** Printed next to the chips so nobody has to guess what "trending" means. */
export const FEED_SORT_RULES: Record<FeedSort, string> = {
  latest: 'Newest first — every post in the order it was shared.',
  trending: 'Most liked and commented on first; ties go to the newer post.',
};

// ------------------------------------------------------------ post photos ---

/** The storage bucket community photos live in. Publicly readable by URL. */
export const MEDIA_BUCKET = 'community-posts';

/** One photo per post — the composer offers a single attach action. */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

/**
 * The marker every URL this app renders must carry. Reading it from the model
 * keeps the parser and the uploader in agreement, and means a row pointing at
 * some other site is rejected in one place.
 */
const MEDIA_PUBLIC_PREFIX = '/storage/v1/object/public/';

/** True only for a photo stored in this project's community bucket. */
export function isPostMediaUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.includes(`${MEDIA_PUBLIC_PREFIX}${MEDIA_BUCKET}/`) &&
    value.startsWith('/') === false &&
    value.length <= 600
  );
}

/**
 * The object path inside the bucket (`<userId>/<file>`), or null when the URL
 * is not one of ours. Used to delete the file when its post is deleted.
 */
export function mediaObjectPath(url: string | null): string | null {
  if (!url) return null;
  const marker = `${MEDIA_PUBLIC_PREFIX}${MEDIA_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length);
  return path.length > 0 && path.length <= 300 ? path : null;
}

/** A guessed image mime type from the file name, for the upload header. */
export function mediaMimeType(nameOrUri: string): string {
  const lower = nameOrUri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export type CreatorProfile = {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  niche: string;
  goals: string[];
  avatarUrl: string | null;
  website: string | null;
  location: string | null;
  isListed: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /** Only present on rows read back after a write. */
  createdAt?: string;
};

export type CommunityPost = {
  id: string;
  userId: string;
  kind: PostKind;
  title: string | null;
  body: string;
  tags: string[];
  link: string | null;
  /**
   * Photo the author attached, as a Supabase Storage public URL. Null for a
   * text-only post. Anything that is not one of this project's own storage
   * objects is dropped at parse time, so a crafted row cannot make the app
   * load an arbitrary third-party image.
   */
  mediaUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  /** Filled in by the client once the author profiles have been fetched. */
  author?: CreatorProfile | null;
  /** Whether *this* creator has liked it — filled in client-side. */
  likedByMe?: boolean;
};

export type PostComment = {
  id: string;
  postId: string;
  userId: string;
  body: string;
  createdAt: string;
  author?: CreatorProfile | null;
};

export type FollowEdge = {
  followerId: string;
  followedId: string;
  createdAt: string;
};

export type LeaderboardMetric = 'instagram' | 'followers' | 'views' | 'trending' | 'overall';

export const LEADERBOARD_METRICS: LeaderboardMetric[] = [
  'instagram',
  'followers',
  'views',
  'trending',
  'overall',
];

/**
 * Engagement windows. These apply only to the Trending and Overall metrics,
 * because followers and views are lifetime totals with no history to window —
 * the screen says so instead of implying a period changed those columns.
 */
export type LeaderboardPeriod = '7d' | '30d' | 'all';

export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['7d', '30d', 'all'];

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

/** Engagement is windowed for these metrics only; lifetime totals ignore it. */
export const PERIOD_SENSITIVE_METRICS: LeaderboardMetric[] = [
  'trending',
  'overall',
];

export const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetric, string> = {
  instagram: 'Instagram Followers',
  followers: 'Most Followers',
  views: 'Most Views',
  trending: 'Trending Creators',
  overall: 'Overall',
};

export type LeaderboardRow = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  niche: string;
  location: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /** Likes + comments on the creator's posts inside the selected window. */
  engagement7d: number;
  /** -1 when the creator has never had their Instagram follower count verified. */
  instagramFollowers: number;
  /** True when a `creator_follower_stats` row exists — i.e. Instagram read it. */
  verified: boolean;
  topMilestone: number;
  score: number;
  value: number;
  rank: number;
};

// ------------------------------------------------------------- reporting ---

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'misinformation',
  'impersonation',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or misleading',
  harassment: 'Harassment or hate',
  misinformation: 'False information',
  impersonation: 'Impersonation',
  other: 'Something else',
};

export type ReportTargetType = 'post' | 'comment' | 'profile';

/**
 * The ranking rules, in the exact wording the server uses. The screen prints
 * these verbatim so a creator can always see *why* someone outranks them.
 */
export const LEADERBOARD_RULES: Record<LeaderboardMetric, string> = {
  instagram:
    'The follower count CreatorDNA read straight from Instagram — connected accounts only, highest first.',
  followers:
    'Followers inside CreatorDNA — the number of creators who follow you in the app.',
  views: 'Distinct creators who opened one of your community posts.',
  trending: 'Likes and comments your posts received in the last 7 days.',
  overall: 'Followers ×3 + views ÷10 + posts ×5 + 7-day engagement ×2.',
};

/** How a window is named in a printed rule — matches the server's wording. */
export function periodLabel(period: LeaderboardPeriod): string {
  return period === '7d' ? '7 days' : period === '30d' ? '30 days' : 'all time';
}

/**
 * The rule for one metric *in one window*. The engagement window is part of
 * the formula, so printing a fixed "7 days" next to a 30-day view would be a
 * small lie the creator has no way to check.
 */
export function leaderboardRule(
  metric: LeaderboardMetric,
  period: LeaderboardPeriod = '7d',
): string {
  const rule = LEADERBOARD_RULES[metric];
  if (!PERIOD_SENSITIVE_METRICS.includes(metric)) return rule;
  const window = periodLabel(period);
  return rule.replace('last 7 days', `last ${window}`).replace('7-day', `${window === 'all time' ? 'all-time' : window.replace(' ', '-')}`);
}

// ------------------------------------------------------------- top ranking ---

/**
 * Who appears in the ranking. "Top" is the default and the reason the screen
 * exists: a short, trustworthy list rather than a directory dump.
 */
export type LeaderboardScope = 'top' | 'all';

export const LEADERBOARD_SCOPES: LeaderboardScope[] = ['top', 'all'];

export const LEADERBOARD_SCOPE_LABELS: Record<LeaderboardScope, string> = {
  top: 'Top 20',
  all: 'Everyone',
};

/** How many creators the Top list holds — printed in the UI and in the rules. */
export const TOP_CREATOR_LIMIT = 20;

/**
 * The pool, stated the same way on screen as it is here. The Top pool is
 * restricted by the server, not by the client, so no device can rank itself
 * into it.
 */
export const LEADERBOARD_SCOPE_RULES: Record<LeaderboardScope, string> = {
  top: 'Pool: the top 20 creators whose Instagram CreatorDNA has actually connected and read — a real account, using the app, ranked 1 to 20.',
  all: 'Pool: every creator with a public profile in the directory, whether or not Instagram is connected.',
};

export type AchievementMilestone = 1000 | 10000 | 50000 | 100000 | 500000 | 1000000;

export const MILESTONES: AchievementMilestone[] = [
  1000, 10000, 50000, 100000, 500000, 1000000,
];

export type Achievement = {
  userId: string;
  milestone: AchievementMilestone;
  earnedAt: string;
  source: string;
};

/**
 * The permanent badge each milestone awards.
 *
 * Every rung looks different — glyph, name and colour — because a row of six
 * identical medals tells a creator nothing about what they have actually
 * unlocked. The glyph set is restricted to characters every platform font
 * carries, so a badge never renders as a tofu box.
 */
/**
 * Artwork, names, and tints for the six milestone badges. The glyph stays on
 * each entry as the accessible label and as a fallback wherever the SVG art
 * is not rendered, so a badge is never an empty box.
 */
export type MilestoneArt = 'leaf' | 'bolt' | 'flame' | 'star' | 'crown' | 'gem';

export const MILESTONE_BADGES: Record<
  AchievementMilestone,
  { glyph: string; title: string; tint: string; art: MilestoneArt }
> = {
  1000: { glyph: '★', title: 'Rising Creator', tint: '#12B76A', art: 'leaf' },
  10000: { glyph: '◆', title: 'Trend Maker', tint: '#F5B301', art: 'bolt' },
  50000: { glyph: '●', title: 'Influence Spark', tint: '#F97316', art: 'flame' },
  100000: { glyph: '▲', title: 'Creator Star', tint: '#2E7BD6', art: 'star' },
  500000: { glyph: '■', title: 'Creator Icon', tint: '#D4A017', art: 'crown' },
  1000000: { glyph: '◉', title: 'Creator Legend', tint: '#8B5CF6', art: 'gem' },
};

export type FollowerStats = {
  userId: string;
  instagramUserId: string | null;
  followers: number;
  source: string;
  measuredAt: string;
};

/**
 * What a profile page shows about someone else. `instagramFollowers` is -1
 * when their count has never been read from Instagram, in which case no
 * Instagram number is shown at all — the page says "not verified" instead of
 * printing a figure nobody checked.
 */
export type CreatorSummary = {
  userId: string;
  /** -1 when Instagram has never been read for this creator. */
  instagramFollowers: number;
  verified: boolean;
  measuredAt: string | null;
  topMilestone: number;
  followerCount: number;
  postCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

export function creatorSummaryFromJson(value: unknown): CreatorSummary | null {
  if (!isRecord(value)) return null;
  const userId = str(value.userId);
  if (!userId) return null;
  const ig =
    typeof value.instagramFollowers === 'number' && Number.isFinite(value.instagramFollowers)
      ? Math.round(value.instagramFollowers)
      : -1;
  return {
    userId,
    instagramFollowers: ig,
    verified: value.verified === true || ig >= 0,
    measuredAt: nullableStr(value.measuredAt),
    topMilestone: nonNeg(value.topMilestone),
    followerCount: nonNeg(value.followerCount),
    postCount: nonNeg(value.postCount),
    viewCount: nonNeg(value.viewCount),
    likeCount: nonNeg(value.likeCount),
    commentCount: nonNeg(value.commentCount),
  };
}

// ------------------------------------------------------------- raw rows ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function intList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function nonNeg(value: unknown): number {
  const n = num(value, 0);
  return n >= 0 ? Math.floor(n) : 0;
}

/** Reads a PostgREST row into a profile, or null when it is unusable. */
export function profileFromRow(row: unknown): CreatorProfile | null {
  if (!isRecord(row)) return null;
  const userId = str(row.user_id);
  const handle = str(row.handle);
  if (!userId || !handle) return null;
  return {
    userId,
    handle,
    displayName: str(row.display_name, handle),
    bio: str(row.bio),
    niche: str(row.niche),
    goals: intList(row.goals),
    avatarUrl: nullableStr(row.avatar_url),
    website: nullableStr(row.website),
    location: nullableStr(row.location),
    isListed: row.is_listed !== false,
    postCount: nonNeg(row.post_count),
    followerCount: nonNeg(row.follower_count),
    followingCount: nonNeg(row.following_count),
    viewCount: nonNeg(row.view_count),
    likeCount: nonNeg(row.like_count),
    commentCount: nonNeg(row.comment_count),
    ...(typeof row.created_at === 'string' ? { createdAt: row.created_at } : {}),
  };
}

export function postFromRow(row: unknown): CommunityPost | null {
  if (!isRecord(row)) return null;
  const id = str(row.id);
  const userId = str(row.user_id);
  const body = str(row.body).trim();
  if (!id || !userId || !body) return null;
  const kind = POST_KINDS.includes(row.kind as PostKind)
    ? (row.kind as PostKind)
    : 'update';
  return {
    id,
    userId,
    kind,
    title: nullableStr(row.title),
    body,
    tags: intList(row.tags).map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
    link: nullableStr(row.link),
    mediaUrl: isPostMediaUrl(row.media_url) ? row.media_url : null,
    likeCount: nonNeg(row.like_count),
    commentCount: nonNeg(row.comment_count),
    viewCount: nonNeg(row.view_count),
    createdAt: str(row.created_at),
  };
}

export function commentFromRow(row: unknown): PostComment | null {
  if (!isRecord(row)) return null;
  const id = str(row.id);
  const postId = str(row.post_id);
  const userId = str(row.user_id);
  const body = str(row.body).trim();
  if (!id || !postId || !userId || !body) return null;
  return { id, postId, userId, body, createdAt: str(row.created_at) };
}

export function leaderboardRowFromJson(value: unknown): LeaderboardRow | null {
  if (!isRecord(value)) return null;
  const userId = str(value.userId);
  const handle = str(value.handle);
  if (!userId || !handle) return null;
  return {
    userId,
    handle,
    displayName: str(value.displayName, handle),
    avatarUrl: nullableStr(value.avatarUrl),
    niche: str(value.niche),
    location: nullableStr(value.location),
    followerCount: nonNeg(value.followerCount),
    followingCount: nonNeg(value.followingCount),
    postCount: nonNeg(value.postCount),
    viewCount: nonNeg(value.viewCount),
    likeCount: nonNeg(value.likeCount),
    commentCount: nonNeg(value.commentCount),
    engagement7d: nonNeg(value.engagement7d ?? value.engagement),
    // -1 is the server's explicit "not verified" marker, so it must survive.
    instagramFollowers:
      typeof value.instagramFollowers === 'number' &&
      Number.isFinite(value.instagramFollowers)
        ? Math.round(value.instagramFollowers)
        : -1,
    verified:
      value.verified === true ||
      (value.verified !== false &&
        typeof value.instagramFollowers === 'number' &&
        value.instagramFollowers >= 0),
    topMilestone: nonNeg(value.topMilestone),
    score: num(value.score),
    value: num(value.value),
    rank: nonNeg(value.rank),
  };
}

export function achievementFromRow(row: unknown): Achievement | null {
  if (!isRecord(row)) return null;
  const userId = str(row.user_id);
  const milestone = num(row.milestone);
  if (!userId || !MILESTONES.includes(milestone as AchievementMilestone)) return null;
  return {
    userId,
    milestone: milestone as AchievementMilestone,
    earnedAt: str(row.earned_at),
    source: str(row.source, 'instagram'),
  };
}

export function followerStatsFromRow(row: unknown): FollowerStats | null {
  if (!isRecord(row)) return null;
  const userId = str(row.user_id);
  const followers = row.followers;
  // `followers` is NOT NULL in the schema, so a row without a number is
  // corrupt. Reporting it as 0 would claim a verified reading of zero — which
  // is exactly the kind of invented metric this app refuses to show.
  if (!userId || typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0) {
    return null;
  }
  return {
    userId,
    instagramUserId: nullableStr(row.instagram_user_id),
    followers: Math.round(followers),
    source: str(row.source, 'instagram'),
    measuredAt: str(row.measured_at),
  };
}

// ----------------------------------------------------------- validation ----

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export function validateHandle(raw: string): ValidationResult {
  const value = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (!HANDLE_RE.test(value)) {
    return {
      ok: false,
      error: 'Handles use 3–30 letters, numbers or underscores.',
    };
  }
  return { ok: true, value };
}

export function validateDisplayName(raw: string): ValidationResult {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { ok: false, error: 'Display name must be 1–60 characters.' };
  }
  return { ok: true, value };
}

export function validateBio(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length > 400) {
    return { ok: false, error: 'Bio must be 400 characters or fewer.' };
  }
  return { ok: true, value };
}

export function validateNiche(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length > 60) {
    return { ok: false, error: 'Niche must be 60 characters or fewer.' };
  }
  return { ok: true, value };
}

export function validatePostBody(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length < 1) {
    return { ok: false, error: 'Write something before posting.' };
  }
  if (value.length > 2000) {
    return { ok: false, error: 'Posts are limited to 2,000 characters.' };
  }
  return { ok: true, value };
}

/** Mirrors the server's check exactly, so a bad reason never costs a round trip. */
export function validateReportReason(raw: string): ValidationResult {
  const value = raw.trim();
  if (!REPORT_REASONS.includes(value as ReportReason)) {
    return { ok: false, error: 'Choose a reason for the report.' };
  }
  return { ok: true, value };
}

export function validateReportDetails(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length > 500) {
    return { ok: false, error: 'Details are limited to 500 characters.' };
  }
  return { ok: true, value };
}

export function validatePostTitle(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length > 120) {
    return { ok: false, error: 'Titles are limited to 120 characters.' };
  }
  return { ok: true, value };
}

export function validateComment(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length < 1) {
    return { ok: false, error: 'Write a comment first.' };
  }
  if (value.length > 1000) {
    return { ok: false, error: 'Comments are limited to 1,000 characters.' };
  }
  return { ok: true, value };
}

/**
 * Normalises a comma/space separated hashtag string into at most six clean tags.
 * Strips the leading `#` so tags group correctly regardless of how they were
 * typed.
 */
export function parseTags(raw: string, limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,\s]+/)) {
    const tag = piece.trim().replace(/^#+/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

// -------------------------------------------------------------- rewards ----

/** The next milestone this follower count has not reached yet, or null. */
export function nextMilestone(followers: number): AchievementMilestone | null {
  const safe = Number.isFinite(followers) ? Math.max(0, followers) : 0;
  return MILESTONES.find((m) => m > safe) ?? null;
}

/** The highest milestone already earned at this follower count. */
export function highestEarned(followers: number): AchievementMilestone | null {
  const safe = Number.isFinite(followers) ? Math.max(0, followers) : 0;
  let best: AchievementMilestone | null = null;
  for (const m of MILESTONES) {
    if (m <= safe) best = m;
  }
  return best;
}

/** Short display label for a milestone: 1000 → "1K", 500000 → "500K". */
export function milestoneLabel(milestone: number): string {
  if (milestone >= 1_000_000) return `${milestone / 1_000_000}M`;
  if (milestone >= 1000) return `${milestone / 1000}K`;
  return String(milestone);
}

/**
 * Progress from the previous milestone to the next one, clamped to 0–1.
 * Before the first milestone the run starts at zero rather than at a negative.
 */
export function milestoneProgress(followers: number, target: AchievementMilestone): number {
  const safe = Number.isFinite(followers) ? Math.max(0, followers) : 0;
  const index = MILESTONES.indexOf(target);
  const floor = index <= 0 ? 0 : MILESTONES[index - 1];
  if (safe >= target) return 1;
  if (safe <= floor) return 0;
  const span = target - floor;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (safe - floor) / span));
}

/**
 * All milestones this follower count has reached that are not yet recorded —
 * in ascending order. This is what lets a creator who already had 120K
 * followers when they joined collect 1K, 10K, 50K and 100K at once, and only
 * once.
 */
export function unearnedMilestones(
  followers: number,
  alreadyEarned: readonly number[],
): AchievementMilestone[] {
  const have = new Set(alreadyEarned);
  const safe = Number.isFinite(followers) ? Math.max(0, followers) : 0;
  return MILESTONES.filter((m) => m <= safe && !have.has(m));
}

// ----------------------------------------------------------- identity ------

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const char of padded) {
    if (char === '=') break;
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

/**
 * Reads the creator's own user id out of their session token.
 *
 * The token belongs to the caller and this only decodes its payload — nothing
 * is signed or trusted beyond what Supabase already issued. It saves a network
 * round trip whenever the UI needs to know "is this row mine?".
 */
export function currentUserIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (isRecord(payload) && typeof payload.sub === 'string' && payload.sub.length > 0) {
      return payload.sub;
    }
  } catch {
    return null;
  }
  return null;
}

// ----------------------------------------------------------- error text ----

/**
 * Turns a PostgREST error body into something a creator can act on. Anything
 * unrecognised falls back to a generic retry sentence rather than leaking SQL.
 */
/**
 * PostgREST's "no such function" — the deployed schema is older than the app
 * expects. The feature is a deployment gap, not a broken connection, so it gets
 * its own message and callers can decide whether to drop a field or fall back.
 */
export const SCHEMA_NOT_DEPLOYED =
  'This part of CreatorDNA is not available on this deployment yet.';

/**
 * A narrower case of the above: the RPC that reads another creator's verified
 * Instagram numbers is missing. The profile page still has every other field,
 * so callers drop this one and label the profile "not connected" instead of
 * failing the whole screen.
 */
export const VERIFIED_STATS_UNAVAILABLE =
  'Verified Instagram data is not available for this profile yet.';

export function communityErrorMessage(body: unknown): string {
  if (!isRecord(body)) {
    return 'Could not reach the CreatorDNA community. Check your connection and retry.';
  }
  const message = str(body.message).toLowerCase();
  if (message.includes('not_authenticated')) return 'Sign in again to continue.';
  if (message.includes('handle_taken')) return 'That handle is already taken.';
  if (message.includes('invalid_handle')) return 'Handles use 3–30 letters, numbers or underscores.';
  if (message.includes('invalid_name')) return 'Display name must be 1–60 characters.';
  if (message.includes('invalid_target')) return 'That content is no longer available.';
  if (message.includes('profile_not_found')) return 'That creator is no longer in the community.';
  if (message.includes('post_not_found')) return 'That post is no longer available.';
  if (message.includes('invalid_comment')) return 'Comments are limited to 1,000 characters.';
  if (message.includes('not_allowed')) return 'You can only remove your own comments.';
  if (message.includes('invalid_metric')) return 'That ranking is not available.';
  if (message.includes('invalid_period')) return 'That time range is not available.';
  if (message.includes('invalid_reason')) return 'Choose a reason for the report.';
  if (message.includes('rate_limited'))
    return "You're doing that too often. Wait a moment and try again.";
  if (message.includes('permission denied')) return 'You do not have access to that.';
  // The insert policy requires a connected Instagram account (a row in
  // creator_follower_stats), so PostgREST refuses the post with SQLSTATE
  // 42501. Say what is actually missing instead of a generic failure.
  if (
    str(body.code) === '42501' ||
    message.includes('row-level security') ||
    message.includes('violates row-level')
  ) {
    return 'Only creators with a connected Instagram account can post. Connect Instagram and retry.';
  }
  // PostgREST's "no such function" — the app still works, this one read is not
  // available yet, so the screen can drop the field instead of failing.
  if (message.includes('community_summary') || message.includes('community_creator_summary')) {
    return VERIFIED_STATS_UNAVAILABLE;
  }
  if (message.includes('pgrst202') || message.includes('could not find the function')) {
    return SCHEMA_NOT_DEPLOYED;
  }
  // The trending sort orders by the stored engagement column; a deployment
  // that has not received it yet says so by name rather than looking broken.
  if (message.includes('engagement_count')) {
    return 'The trending order is not available on this deployment yet. Pull the update and retry.';
  }
  return 'Could not complete that. Please try again.';
}
