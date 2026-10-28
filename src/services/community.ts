import { Platform } from 'react-native';
import { File, UploadType } from 'expo-file-system';

import { supabaseAnonKey, supabaseUrl } from '../lib/config';
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  MEDIA_BUCKET,
  MEDIA_MIME_TYPES,
  REPORT_REASONS,
  SCHEMA_NOT_DEPLOYED,
  VERIFIED_STATS_UNAVAILABLE,
  achievementFromRow,
  communityErrorMessage,
  commentFromRow,
  creatorSummaryFromJson,
  currentUserIdFromToken,
  followerStatsFromRow,
  isPostMediaUrl,
  leaderboardRowFromJson,
  mediaMimeType,
  mediaObjectPath,
  parseTags,
  postFromRow,
  profileFromRow,
  validateComment,
  validateDisplayName,
  validateHandle,
  validateNiche,
  validatePostBody,
  validatePostTitle,
  validateBio,
  validateReportDetails,
  validateReportReason,
  type Achievement,
  type AchievementMilestone,
  type CommunityPost,
  type CreatorProfile,
  type CreatorSummary,
  type FeedSort,
  type FollowerStats,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type PostComment,
  type PostKind,
  type ReportReason,
  type ReportTargetType,
} from '../lib/community/model';

// Talks to `public.creator_*` over PostgREST with nothing but the publishable
// anon key and the creator's own session token — no service-role key ever
// reaches the app. Every mutation that involves counters goes through a
// `community_*` RPC, because the count columns are deliberately not granted to
// the client at all (see the migration), so they cannot be written from here.

const REST = `${supabaseUrl}/rest/v1`;
const TIMEOUT_MS = 15_000;

export type CommunityFailureKind = 'offline' | 'unauthorized' | 'rejected';

export type CommunityResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; kind: CommunityFailureKind };

function fail<T>(kind: CommunityFailureKind, message: string): CommunityResult<T> {
  return { ok: false, kind, message };
}

function offline<T>(): CommunityResult<T> {
  return fail('offline', 'Could not reach the CreatorDNA community. Check your connection and retry.');
}

function unauthorized<T>(): CommunityResult<T> {
  return fail('unauthorized', 'Your session has expired. Sign in again to continue.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function array(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

function totalFrom(response: Response): number | null {
  const range = response.headers.get('content-range');
  if (!range) return null;
  const slash = range.lastIndexOf('/');
  if (slash < 0) return null;
  const value = range.slice(slash + 1).trim();
  if (value === '*') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  token: string;
  body?: unknown;
  prefer?: string;
  expect?: 'json' | 'empty';
};

async function request<T>(
  options: RequestOptions,
  parse: (data: unknown, response: Response) => CommunityResult<T>,
): Promise<CommunityResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${REST}${options.path}`, {
      method: options.method,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return offline<T>();
  }
  if (response.status === 401 || response.status === 403) {
    // PostgREST reports an RLS denial as 403 with SQLSTATE 42501 — the same
    // status a rejected token gets. Read the body first so the connected-
    // Instagram posting gate can say what is actually missing instead of
    // telling the creator their session expired.
    let denied: unknown = null;
    try {
      denied = await response.json();
    } catch {
      denied = null;
    }
    if (
      isRecord(denied) &&
      (denied.code === '42501' ||
        String(denied.message ?? '')
          .toLowerCase()
          .includes('row-level security'))
    ) {
      return fail<T>('rejected', communityErrorMessage(denied));
    }
    return unauthorized<T>();
  }
  if (response.status === 204 || options.expect === 'empty') {
    if (response.ok) return parse(null, response);
    return fail<T>('rejected', 'Could not complete that. Please try again.');
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return fail<T>('rejected', communityErrorMessage(payload));
  }
  return parse(payload, response);
}

function rpc<T>(
  name: string,
  token: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => CommunityResult<T>,
): Promise<CommunityResult<T>> {
  return request<T>(
    { method: 'POST', path: `/rpc/${name}`, token, body: args, expect: 'json' },
    (data) => parse(data),
  );
}

// ------------------------------------------------------------- profiles ----

export type ProfileQuery = {
  search?: string;
  niche?: string;
  limit?: number;
  offset?: number;
  /** Only creators who have published at least one post. */
  activeOnly?: boolean;
  /** Exactly one creator — used to read back the signed-in profile. */
  userId?: string;
};

/**
 * PostgREST's `or=` expression is parsed as code, so a term containing its
 * delimiters (`(`, `)`, `,`, `*`, `.`) would break — or worse, widen — the
 * filter. Restricting the term to handle/name-safe characters keeps the query
 * structurally identical no matter what is typed.
 */
function searchTerm(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 40);
}

/** The non-search half of a profile query, shared by list and count. */
function profileFilters(query: ProfileQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.niche) params.set('niche', `ilike.${searchTerm(query.niche)}`);
  if (query.activeOnly) params.set('post_count', 'gt.0');
  if (query.userId) params.set('user_id', `eq.${encodeURIComponent(query.userId)}`);
  return params;
}

export async function listProfiles(
  token: string,
  query: ProfileQuery = {},
): Promise<CommunityResult<{ items: CreatorProfile[]; total: number | null }>> {
  const limit = Math.max(1, Math.min(query.limit ?? 30, 100));
  const offset = Math.max(0, query.offset ?? 0);
  const term = query.search ? searchTerm(query.search) : '';

  const params = profileFilters(query);
  params.set('select', '*');
  params.set('order', 'follower_count.desc,created_at.asc');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (term) {
    // `*` is PostgREST's LIKE wildcard, so this is a substring match across
    // handle, display name and niche in a single pass.
    params.set(
      'or',
      `(handle.ilike.*${term}*,display_name.ilike.*${term}*,niche.ilike.*${term}*)`,
    );
  }

  const result = await request(
    { method: 'GET', path: `/creator_profiles?${params.toString()}`, token },
    (data) => ({
      ok: true,
      data: {
        items: array(data)
          .map(profileFromRow)
          .filter((row): row is CreatorProfile => row !== null),
        total: null,
      },
    }),
  );
  if (!result.ok) return result;

  // The total powers the "N creators" header. A search deliberately skips it:
  // counting a substring match costs a second full scan for a number the list
  // header does not need once it is showing results. A single-creator lookup
  // skips it for the same reason — the caller already knows it wants one row.
  if (term || query.userId) return result;

  const count = profileFilters(query);
  count.set('select', 'user_id');
  count.set('limit', '1');
  const total = await request(
    { method: 'GET', path: `/creator_profiles?${count.toString()}`, token, prefer: 'count=exact' },
    (_data, response) => ({ ok: true as const, data: totalFrom(response) }),
  );
  return { ok: true, data: { ...result.data, total: total.ok ? total.data : null } };
}

/**
 * The distinct niches in the public directory, for filter chips. One narrow
 * single-column read, deduped here — the count is capped because a thousand
 * rows of one short text column is far past the point of diminishing returns.
 */
export async function listNiches(
  token: string,
): Promise<CommunityResult<string[]>> {
  return request(
    {
      method: 'GET',
      path: '/creator_profiles?select=niche&niche=not.is.null&order=niche.asc&limit=1000',
      token,
    },
    (data) => {
      const seen = new Set<string>();
      for (const row of array(data)) {
        const raw = isRecord(row) && typeof row.niche === 'string' ? row.niche.trim() : '';
        if (raw) seen.add(raw);
      }
      return { ok: true, data: [...seen].slice(0, 40) };
    },
  );
}

export async function getProfileByHandle(
  token: string,
  handle: string,
): Promise<CommunityResult<CreatorProfile | null>> {
  const encoded = encodeURIComponent(handle.toLowerCase());
  return request(
    { method: 'GET', path: `/creator_profiles?handle=eq.${encoded}&select=*`, token },
    (data) => ({ ok: true, data: profileFromRow(array(data)[0]) }),
  );
}

/** Batch author lookup used to decorate a page of posts in one request. */
export async function getProfilesByIds(
  token: string,
  userIds: readonly string[],
): Promise<CommunityResult<Map<string, CreatorProfile>>> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 100);
  if (ids.length === 0) {
    return { ok: true, data: new Map() };
  }
  return request(
    {
      method: 'GET',
      path: `/creator_profiles?select=*&user_id=in.(${ids.join(',')})&limit=100`,
      token,
    },
    (data) => {
      const map = new Map<string, CreatorProfile>();
      for (const row of array(data)) {
        const profile = profileFromRow(row);
        if (profile) map.set(profile.userId, profile);
      }
      return { ok: true, data: map };
    },
  );
}

export type ProfileInput = {
  handle: string;
  displayName: string;
  bio?: string;
  niche?: string;
  goals?: string[];
  avatarUrl?: string | null;
  website?: string | null;
  location?: string | null;
  isListed?: boolean;
};

/**
 * Creates or updates the signed-in creator's public profile. Input is checked
 * here first so the creator gets an immediate message; the server checks it
 * again, because the client is never the authority.
 */
export async function saveProfile(
  token: string,
  input: ProfileInput,
): Promise<CommunityResult<CreatorProfile>> {
  const handle = validateHandle(input.handle);
  if (!handle.ok) return fail('rejected', handle.error);
  const displayName = validateDisplayName(input.displayName);
  if (!displayName.ok) return fail('rejected', displayName.error);
  const bio = validateBio(input.bio ?? '');
  if (!bio.ok) return fail('rejected', bio.error);
  const niche = validateNiche(input.niche ?? '');
  if (!niche.ok) return fail('rejected', niche.error);

  const website = (input.website ?? '').trim().slice(0, 200);
  if (website && !/^https?:\/\/\S+$/i.test(website)) {
    return fail('rejected', 'Website links need to start with http:// or https://');
  }
  const avatarUrl = (input.avatarUrl ?? '').trim().slice(0, 400);
  if (avatarUrl && !/^https?:\/\/\S+$/i.test(avatarUrl)) {
    return fail('rejected', 'That image link is not a valid URL.');
  }

  return rpc('community_save_profile', token, {
    p_handle: handle.value,
    p_display_name: displayName.value,
    p_bio: bio.value,
    p_niche: niche.value,
    p_goals: (input.goals ?? [])
      .map((goal) => goal.trim())
      .filter((goal) => goal.length > 0)
      .slice(0, 6),
    p_avatar_url: avatarUrl || null,
    p_website: website || null,
    p_location: input.location ? input.location.trim().slice(0, 60) || null : null,
    p_is_listed: input.isListed !== false,
  }, (data) => {
    const profile = profileFromRow(data);
    if (!profile) return fail('rejected', 'CreatorDNA returned an invalid profile. Please retry.');
    return { ok: true, data: profile };
  });
}

// ---------------------------------------------------------------- posts ----

export type PostQuery = {
  kind?: PostKind | 'all';
  userId?: string;
  tag?: string;
  /** "latest" is chronological; "trending" is ordered server-side by engagement. */
  sort?: FeedSort;
  limit?: number;
  offset?: number;
};

export async function listPosts(
  token: string,
  query: PostQuery = {},
): Promise<CommunityResult<{ items: CommunityPost[]; total: number | null }>> {
  const limit = Math.max(1, Math.min(query.limit ?? 20, 100));
  const offset = Math.max(0, query.offset ?? 0);
  const params = new URLSearchParams({
    select: '*',
    // `engagement_count` is a stored generated column, so the trending order
    // is computed once in the database rather than by sorting one page here —
    // otherwise page 2 would restart the ranking.
    order:
      query.sort === 'trending'
        ? 'engagement_count.desc,created_at.desc,id.desc'
        : 'created_at.desc,id.desc',
    limit: String(limit),
    offset: String(offset),
  });
  if (query.kind && query.kind !== 'all') params.set('kind', `eq.${query.kind}`);
  if (query.userId) params.set('user_id', `eq.${query.userId}`);
  if (query.tag) params.set('tags', `cs.{${query.tag.toLowerCase()}}`);

  const result = await request(
    {
      method: 'GET',
      path: `/creator_posts?${params.toString()}`,
      token,
      prefer: 'count=exact',
    },
    (data, response) => {
      const items = array(data)
        .map(postFromRow)
        .filter((row): row is CommunityPost => row !== null);
      return { ok: true, data: { items, total: totalFrom(response) } };
    },
  );
  return result;
}

export type PostInput = {
  kind: PostKind;
  title?: string;
  body: string;
  tags?: string[];
  link?: string;
  /** Public storage URL of an already-uploaded photo, or null for text only. */
  mediaUrl?: string | null;
};

export async function createPost(
  token: string,
  input: PostInput,
): Promise<CommunityResult<CommunityPost>> {
  const body = validatePostBody(input.body);
  if (!body.ok) return fail('rejected', body.error);
  const title = validatePostTitle(input.title ?? '');
  if (!title.ok) return fail('rejected', title.error);
  const userId = currentUserIdFromToken(token);
  if (!userId) return unauthorized<CommunityPost>();
  // The parser is the gate: a URL from any other origin never reaches the row.
  const mediaUrl = isPostMediaUrl(input.mediaUrl) ? input.mediaUrl : null;

  // The count columns are not in the column-scoped INSERT grant, so this
  // payload cannot carry a forged like/view total even if it tried. The photo
  // key is only sent when there is one: a text post stays insertable on a
  // deployment that has not received the media column yet.
  const payload: Record<string, unknown> = {
    user_id: userId,
    kind: input.kind,
    title: title.value || null,
    body: body.value,
    tags: parseTags((input.tags ?? []).join(' ')),
    link: input.link ? input.link.trim().slice(0, 400) : null,
  };
  if (mediaUrl) payload.media_url = mediaUrl;

  return request(
    {
      method: 'POST',
      path: '/creator_posts',
      token,
      body: payload,
      prefer: 'return=representation',
    },
    (data) => {
      const post = postFromRow(array(data)[0]);
      if (!post) return fail('rejected', 'CreatorDNA returned an invalid post. Please retry.');
      return { ok: true, data: post };
    },
  );
}

export async function updatePost(
  token: string,
  id: string,
  input: PostInput,
): Promise<CommunityResult<CommunityPost>> {
  const body = validatePostBody(input.body);
  if (!body.ok) return fail('rejected', body.error);
  const title = validatePostTitle(input.title ?? '');
  if (!title.ok) return fail('rejected', title.error);
  return request(
    {
      method: 'PATCH',
      path: `/creator_posts?id=eq.${encodeURIComponent(id)}`,
      token,
      body: {
        kind: input.kind,
        title: title.value || null,
        body: body.value,
        tags: parseTags((input.tags ?? []).join(' ')),
        link: input.link ? input.link.trim().slice(0, 400) : null,
        updated_at: new Date().toISOString(),
      },
      prefer: 'return=representation',
    },
    (data) => {
      const post = postFromRow(array(data)[0]);
      if (!post) return fail('rejected', 'That post could not be updated. It may have been removed.');
      return { ok: true, data: post };
    },
  );
}

export async function deletePost(token: string, id: string): Promise<CommunityResult<null>> {
  return request(
    { method: 'DELETE', path: `/creator_posts?id=eq.${encodeURIComponent(id)}`, token, expect: 'empty' },
    () => ({ ok: true, data: null }),
  );
}

// ------------------------------------------------------------ post photos ---

const STORAGE = `${supabaseUrl}/storage/v1`;

function storageHeaders(token: string, mime: string): Record<string, string> {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': mime,
    'x-upsert': 'false',
  };
}

/** Maps a storage HTTP failure onto something a person can act on. */
function storageFailure(status: number): CommunityResult<string> {
  if (status === 401 || status === 403) return unauthorized<string>();
  if (status === 404) {
    return fail(
      'rejected',
      'Photo uploads are not available on this deployment yet. Your text will still post.',
    );
  }
  if (status === 413) return fail('rejected', 'That photo is over the 8 MB limit. Pick a smaller one.');
  if (status === 415) return fail('rejected', 'Use a JPEG, PNG or WebP photo.');
  if (status === 409) return fail('rejected', 'That photo could not be saved. Please retry.');
  if (status === 400) return fail('rejected', 'That file could not be uploaded. Please try another photo.');
  return offline<string>();
}

/**
 * Uploads one photo into the community bucket and returns its public URL.
 * The object is written under the author's own id, which is exactly what the
 * storage policy allows, and nothing but the returned URL is ever trusted.
 */
export async function uploadPostPhoto(
  token: string,
  localUri: string,
): Promise<CommunityResult<string>> {
  const userId = currentUserIdFromToken(token);
  if (!userId) return unauthorized<string>();

  const fileName = localUri.split('/').pop()?.split('?')[0] || 'photo.jpg';
  const mime = mediaMimeType(fileName);
  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(mime)) {
    return fail('rejected', 'Use a JPEG, PNG or WebP photo.');
  }
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const endpoint = `${STORAGE}/object/${MEDIA_BUCKET}/${path}`;
  const publicUrl = `${STORAGE}/object/public/${MEDIA_BUCKET}/${path}`;

  let status: number;
  try {
    if (Platform.OS === 'web') {
      // The picker hands back a blob: URL on the web build, so the bytes are
      // read straight from it rather than through the file-system module.
      const blob = await (await fetch(localUri)).blob();
      const response = await fetch(endpoint, {
        method: 'POST',
        // The computed type, not the browser's guess: the bucket only accepts
        // the three image types the app validated against.
        headers: storageHeaders(token, mime),
        body: blob,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
    } else {
      const file = new File(localUri);
      const result = await file.upload(endpoint, {
        uploadType: UploadType.BINARY_CONTENT,
        headers: storageHeaders(token, mime),
      });
      status = result.status;
    }
  } catch {
    return offline<string>();
  }

  if (status < 200 || status >= 300) return storageFailure(status);
  if (!isPostMediaUrl(publicUrl)) return fail('rejected', 'That photo could not be saved. Please retry.');
  return { ok: true, data: publicUrl };
}

/**
 * Removes the stored photo when its post is deleted. Best effort by design:
 * the post is already gone, so a failed cleanup must never surface as an error.
 */
export async function deletePostPhoto(token: string, mediaUrl: string): Promise<void> {
  const path = mediaObjectPath(mediaUrl);
  if (!path) return;
  try {
    await fetch(`${STORAGE}/object/${MEDIA_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    /* nothing to report — the post itself is already deleted */
  }
}

// ------------------------------------------------------------- reactions ----

export type ReactionResult = { liked: boolean; likeCount: number };

export function likePost(token: string, postId: string): Promise<CommunityResult<ReactionResult>> {
  return rpc('community_like', token, { p_post: postId }, (data) => {
    if (!isRecord(data)) return fail('rejected', 'That post could not be liked.');
    return {
      ok: true,
      data: { liked: true, likeCount: Math.max(0, Math.round(Number(data.likeCount) || 0)) },
    };
  });
}

export function unlikePost(token: string, postId: string): Promise<CommunityResult<ReactionResult>> {
  return rpc('community_unlike', token, { p_post: postId }, (data) => {
    if (!isRecord(data)) return fail('rejected', 'That post could not be unliked.');
    return {
      ok: true,
      data: { liked: false, likeCount: Math.max(0, Math.round(Number(data.likeCount) || 0)) },
    };
  });
}

/** Which of these posts I have already liked — one request for the whole page. */
export async function fetchLikedPostIds(
  token: string,
  postIds: readonly string[],
): Promise<CommunityResult<Set<string>>> {
  const ids = [...new Set(postIds.filter(Boolean))].slice(0, 100);
  if (ids.length === 0) return { ok: true, data: new Set<string>() };
  const me = currentUserIdFromToken(token);
  if (!me) return { ok: true, data: new Set<string>() };
  return request(
    {
      method: 'GET',
      path: `/creator_post_likes?select=post_id&post_id=in.(${ids.join(',')})&user_id=eq.${me}`,
      token,
    },
    (data) => ({
      ok: true,
      data: new Set(
        array(data)
          .map((row) => (isRecord(row) && typeof row.post_id === 'string' ? row.post_id : ''))
          .filter(Boolean),
      ),
    }),
  );
}

/**
 * Counts one view. Fire-and-forget: a failure here must never disturb the
 * screen, and the server already ignores repeats and the author's own views.
 */
export function recordPostView(token: string, postId: string): void {
  void rpc('community_view', token, { p_post: postId }, () => ({ ok: true, data: null }));
}

// ------------------------------------------------------------- comments ----

export async function listComments(
  token: string,
  postId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CommunityResult<PostComment[]>> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const offset = Math.max(0, options.offset ?? 0);
  return request(
    {
      method: 'GET',
      path: `/creator_post_comments?post_id=eq.${encodeURIComponent(postId)}` +
        `&select=*&order=created_at.asc&limit=${limit}&offset=${offset}`,
      token,
    },
    (data) => ({
      ok: true,
      data: array(data)
        .map(commentFromRow)
        .filter((row): row is PostComment => row !== null),
    }),
  );
}

export async function addComment(
  token: string,
  postId: string,
  body: string,
): Promise<CommunityResult<PostComment>> {
  const text = validateComment(body);
  if (!text.ok) return fail('rejected', text.error);
  return rpc('community_comment', token, { p_post: postId, p_body: text.value }, (data) => {
    const comment = commentFromRow(data);
    if (!comment) return fail('rejected', 'CreatorDNA returned an invalid comment. Please retry.');
    return { ok: true, data: comment };
  });
}

export async function deleteComment(token: string, commentId: string): Promise<CommunityResult<boolean>> {
  return rpc(
    'community_delete_comment',
    token,
    { p_comment: commentId },
    (data) => ({ ok: true, data: data === true }),
  );
}

// --------------------------------------------------------------- follow ----

export type FollowResult = { following: boolean; followerCount: number };

function followResult(data: unknown, following: boolean): CommunityResult<FollowResult> {
  const count = isRecord(data) ? Number(data.followerCount) : NaN;
  return {
    ok: true,
    data: {
      following,
      followerCount: Number.isFinite(count) && count >= 0 ? Math.round(count) : 0,
    },
  };
}

export function followCreator(
  token: string,
  userId: string,
): Promise<CommunityResult<FollowResult>> {
  return rpc('community_follow', token, { p_followed: userId }, (data) =>
    followResult(data, true),
  );
}

export function unfollowCreator(
  token: string,
  userId: string,
): Promise<CommunityResult<FollowResult>> {
  return rpc('community_unfollow', token, { p_followed: userId }, (data) =>
    followResult(data, false),
  );
}

/** Which of these creators I already follow — one request for the whole list. */
export async function fetchFollowedIds(
  token: string,
  userIds: readonly string[],
): Promise<CommunityResult<Set<string>>> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 100);
  if (ids.length === 0) return { ok: true, data: new Set<string>() };
  const me = currentUserIdFromToken(token);
  if (!me) return { ok: true, data: new Set<string>() };
  return request(
    {
      method: 'GET',
      path: `/creator_follows?select=followed_id&follower_id=eq.${me}&followed_id=in.(${ids.join(',')})`,
      token,
    },
    (data) => ({
      ok: true,
      data: new Set(
        array(data)
          .map((row) =>
            isRecord(row) && typeof row.followed_id === 'string' ? row.followed_id : '',
          )
          .filter(Boolean),
      ),
    }),
  );
}

// ----------------------------------------------------------- discovery ----

/** Everyone I follow, newest first, hydrated into full profiles. */
export async function listFollowing(
  token: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CommunityResult<CreatorProfile[]>> {
  const me = currentUserIdFromToken(token);
  if (!me) return fail('unauthorized', 'Your session has expired. Sign in again to continue.');
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const edges = await request(
    {
      method: 'GET',
      path: `/creator_follows?select=followed_id&follower_id=eq.${me}` +
        `&order=created_at.desc&limit=${limit}&offset=${offset}`,
      token,
    },
    (data) => ({
      ok: true as const,
      data: array(data)
        .map((row) => (isRecord(row) && typeof row.followed_id === 'string' ? row.followed_id : ''))
        .filter(Boolean),
    }),
  );
  if (!edges.ok) return edges;
  if (edges.data.length === 0) return { ok: true, data: [] };
  const profiles = await getProfilesByIds(token, edges.data);
  if (!profiles.ok) return profiles;
  // Preserve the follow order — "most recently followed first" is what a
  // person expects from a Following list, not alphabetical.
  return {
    ok: true,
    data: edges.data
      .map((id) => profiles.data.get(id))
      .filter((p): p is CreatorProfile => Boolean(p)),
  };
}

/**
 * Creators to discover: active in the community, not me, not already followed.
 * "Active" (at least one post) keeps the list from filling with empty shells.
 */
export async function suggestCreators(
  token: string,
  options: { limit?: number; offset?: number; niche?: string | null; search?: string } = {},
): Promise<CommunityResult<{ items: CreatorProfile[]; total: number | null }>> {
  const me = currentUserIdFromToken(token);
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  const offset = Math.max(0, options.offset ?? 0);

  const followed = me
    ? await request(
        {
          method: 'GET',
          path: `/creator_follows?select=followed_id&follower_id=eq.${me}&limit=500`,
          token,
        },
        (data) => ({
          ok: true as const,
          data: new Set(
            array(data)
              .map((row) =>
                isRecord(row) && typeof row.followed_id === 'string' ? row.followed_id : '',
              )
              .filter(Boolean),
          ),
        }),
      )
    : ({ ok: true as const, data: new Set<string>() } as const);
  if (!followed.ok) return followed;

  const excluded = [...followed.data];
  if (me) excluded.push(me);

  const result = await listProfiles(token, {
    activeOnly: true,
    niche: options.niche ?? undefined,
    search: options.search,
    // Filtering happens after the page is fetched, so ask for enough extra rows
    // to still fill the page once mine and the ones I follow are removed.
    limit: Math.min(100, limit + excluded.length),
    offset,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      items: result.data.items.filter((p) => !excluded.includes(p.userId)),
      total: result.data.total,
    },
  };
}

/**
 * Files a report. A report only ever reaches a moderator — it never hides or
 * removes anything by itself, so filing one is safe even if mistaken.
 */
export async function reportContent(
  token: string,
  input: { targetType: ReportTargetType; targetId: string; reason: string; details?: string },
): Promise<CommunityResult<{ reported: boolean }>> {
  const reason = validateReportReason(input.reason);
  if (!reason.ok) return fail('rejected', reason.error);
  const details = validateReportDetails(input.details ?? '');
  if (!details.ok) return fail('rejected', details.error);
  if (!input.targetId) return fail('rejected', 'That content is no longer available.');
  if (!REPORT_REASONS.includes(reason.value as ReportReason)) {
    return fail('rejected', 'Choose a reason for the report.');
  }
  return rpc(
    'community_report',
    token,
    {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_reason: reason.value,
      p_details: details.value,
    },
    (data) => ({ ok: true, data: { reported: isRecord(data) && data.reported === true } }),
  );
}

// ----------------------------------------------------------- leaderboard ----

export type LeaderboardQuery = {
  limit?: number;
  offset?: number;
  niche?: string | null;
  period?: LeaderboardPeriod;
  /**
   * Restricts the pool to creators whose Instagram the server has actually
   * read. Enforced in SQL — the client cannot rank itself into the list.
   */
  verifiedOnly?: boolean;
};

export async function fetchLeaderboard(
  token: string,
  metric: LeaderboardMetric,
  query: LeaderboardQuery | number = {},
): Promise<CommunityResult<LeaderboardRow[]>> {
  // A bare number is still accepted as `limit`, so older call sites keep working.
  const opts: LeaderboardQuery = typeof query === 'number' ? { limit: query } : query;
  if (!LEADERBOARD_METRICS.includes(metric)) {
    return fail('rejected', 'That ranking is not available.');
  }
  const period = opts.period ?? '7d';
  if (!LEADERBOARD_PERIODS.includes(period)) {
    return fail('rejected', 'That time range is not available.');
  }
  const size = Math.max(1, Math.min(opts.limit ?? 25, 100));
  const offset = Math.max(0, Math.min(opts.offset ?? 0, 10_000));
  // Niche is free text on the profile, so it is trimmed and length-capped here
  // and matched exactly (case-insensitively) by the server.
  const niche = (opts.niche ?? '').trim().slice(0, 60);
  const verifiedOnly = opts.verifiedOnly === true;
  const parse = (data: unknown): CommunityResult<LeaderboardRow[]> => ({
    ok: true,
    data: array(data)
      .map(leaderboardRowFromJson)
      .filter((row): row is LeaderboardRow => row !== null),
  });

  const extended = await rpc(
    'community_leaderboard',
    token,
    {
      p_metric: metric,
      p_limit: size,
      p_offset: offset,
      p_niche: niche || null,
      p_period: period,
      p_verified_only: verifiedOnly,
    },
    parse,
  );
  if (extended.ok) return extended;

  // The deployed database is older than this build and has no five-argument
  // overload. The plain first page under the default window is exactly what
  // the old signature computed, so it is served from that; a narrowed,
  // paginated or Instagram-only request cannot be reproduced honestly, and
  // pretending otherwise would show a filter that does nothing.
  if (extended.message !== SCHEMA_NOT_DEPLOYED) return extended;
  // The Instagram ranking has no older signature to fall back to: serving the
  // in-app follower order instead would answer a different question with a
  // confident wrong number.
  if (metric === 'instagram') {
    return fail(
      'rejected',
      'Instagram rankings are not available on this deployment yet. Pull the update and retry.',
    );
  }
  // The Top pool cannot be faked either — filtering by "Instagram connected"
  // on a database without that column would rank creators who never connected.
  if (verifiedOnly) {
    return fail(
      'rejected',
      'The Instagram-connected Top 20 is not available on this deployment yet. Pull the update and retry.',
    );
  }
  if (offset > 0 || niche || period !== '7d') {
    return fail(
      'rejected',
      'Ranking filters are not available on this deployment yet. Clear the filters to see the ranking.',
    );
  }
  return rpc('community_leaderboard', token, { p_metric: metric, p_limit: size }, parse);
}

// -------------------------------------------------------------- rewards ----

/**
 * The verified numbers behind someone else's profile page: their Instagram
 * follower reading (only ever read by the server), its timestamp, and their
 * top milestone. Falls back to "not verified" when the row does not exist or
 * the profile is not public.
 */
export async function fetchCreatorSummary(
  token: string,
  userId: string,
): Promise<CommunityResult<CreatorSummary | null>> {
  if (!userId) return fail('rejected', 'That content is no longer available.');
  const result = await rpc('community_creator_summary', token, { p_user_id: userId }, (data) => ({
    ok: true,
    data: creatorSummaryFromJson(data),
  }));
  // Not yet deployed, or the profile is private: the page still has everything
  // else it needs, so it shows "not verified" rather than an error.
  if (!result.ok && (result.message === SCHEMA_NOT_DEPLOYED || result.message === VERIFIED_STATS_UNAVAILABLE)) {
    return { ok: true, data: null };
  }
  return result;
}

export async function fetchAchievements(
  token: string,
  userId: string,
): Promise<CommunityResult<Achievement[]>> {
  return request(
    {
      method: 'GET',
      path: `/creator_achievements?user_id=eq.${encodeURIComponent(userId)}` +
        '&select=*&order=milestone.asc',
      token,
    },
    (data) => ({
      ok: true,
      data: array(data)
        .map(achievementFromRow)
        .filter((row): row is Achievement => row !== null),
    }),
  );
}

/** The creator's own verified Instagram reading, if there is one. */
export async function fetchFollowerStats(
  token: string,
): Promise<CommunityResult<FollowerStats | null>> {
  return request(
    { method: 'GET', path: '/creator_follower_stats?select=*', token },
    (data) => ({ ok: true, data: followerStatsFromRow(array(data)[0]) }),
  );
}

// ----------------------------------------------------------- enrichment ----

/**
 * Attaches authors and my own like state to a page of posts.
 *
 * Posts whose creator has no visible profile are dropped: they belong to
 * abandoned guest sessions or to creators who left the directory, and showing
 * them as authorless rows would be worse than not showing them at all.
 */
export async function decoratePosts(
  token: string,
  posts: readonly CommunityPost[],
): Promise<CommunityResult<CommunityPost[]>> {
  if (posts.length === 0) return { ok: true, data: [] };
  const me = currentUserIdFromToken(token);
  const authors = await getProfilesByIds(token, posts.map((post) => post.userId));
  if (!authors.ok) return authors;

  const liked = await fetchLikedPostIds(token, posts.map((post) => post.id));
  if (!liked.ok) return liked;

  const visible = posts.filter(
    (post) => post.userId === me || authors.data.has(post.userId),
  );
  return {
    ok: true,
    data: visible.map((post) => ({
      ...post,
      author: authors.data.get(post.userId) ?? null,
      likedByMe: liked.data.has(post.id),
    })),
  };
}

/** Attaches authors to a page of comments. */
export async function decorateComments(
  token: string,
  comments: readonly PostComment[],
): Promise<CommunityResult<PostComment[]>> {
  if (comments.length === 0) return { ok: true, data: [] };
  const authors = await getProfilesByIds(token, comments.map((comment) => comment.userId));
  if (!authors.ok) return authors;
  return {
    ok: true,
    data: comments.map((comment) => ({
      ...comment,
      author: authors.data.get(comment.userId) ?? null,
    })),
  };
}

export type { AchievementMilestone };
