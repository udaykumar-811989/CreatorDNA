import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FEED_SORTS,
  FEED_SORT_LABELS,
  FEED_SORT_RULES,
  LEADERBOARD_METRICS,
  LEADERBOARD_METRIC_LABELS,
  LEADERBOARD_PERIODS,
  LEADERBOARD_PERIOD_LABELS,
  LEADERBOARD_RULES,
  LEADERBOARD_SCOPES,
  LEADERBOARD_SCOPE_LABELS,
  LEADERBOARD_SCOPE_RULES,
  MEDIA_BUCKET,
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  MILESTONES,
  MILESTONE_BADGES,
  PERIOD_SENSITIVE_METRICS,
  REPORT_REASONS,
  SCHEMA_NOT_DEPLOYED,
  TOP_CREATOR_LIMIT,
  VERIFIED_STATS_UNAVAILABLE,
  type MilestoneArt,
  achievementFromRow,
  communityErrorMessage,
  commentFromRow,
  creatorSummaryFromJson,
  currentUserIdFromToken,
  followerStatsFromRow,
  highestEarned,
  isPostMediaUrl,
  leaderboardRowFromJson,
  leaderboardRule,
  mediaMimeType,
  mediaObjectPath,
  milestoneLabel,
  milestoneProgress,
  nextMilestone,
  parseTags,
  postFromRow,
  profileFromRow,
  unearnedMilestones,
  validateBio,
  validateComment,
  validateDisplayName,
  validateHandle,
  validateNiche,
  validatePostBody,
  validatePostTitle,
  validateReportDetails,
  validateReportReason,
} from './model';

// --------------------------------------------------------------- fixtures ---

function b64url(input: string): string {
  const b64 = Buffer.from(input, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(
    JSON.stringify(payload),
  )}.signature`;
}

const profileRow = {
  user_id: '11111111-1111-1111-1111-111111111111',
  handle: 'ada_creates',
  display_name: 'Ada',
  bio: 'Making things',
  niche: 'Tech',
  goals: ['grow', 'monetize', 42],
  avatar_url: 'https://cdn/x.png',
  website: 'https://ada.dev',
  location: 'London',
  is_listed: true,
  post_count: 4,
  follower_count: 12,
  following_count: 3,
  view_count: 120,
  like_count: 40,
  comment_count: 9,
  created_at: '2026-01-01T00:00:00Z',
};

// ------------------------------------------------------------- row parsing ---

test('profileFromRow maps a real row and drops non-strings from goals', () => {
  const profile = profileFromRow(profileRow);
  assert.ok(profile);
  assert.equal(profile.handle, 'ada_creates');
  assert.deepEqual(profile.goals, ['grow', 'monetize']);
  assert.equal(profile.followerCount, 12);
  assert.equal(profile.avatarUrl, 'https://cdn/x.png');
});

test('profileFromRow rejects rows without a user id or handle', () => {
  assert.equal(profileFromRow(null), null);
  assert.equal(profileFromRow('nope'), null);
  assert.equal(profileFromRow({ handle: 'x' }), null);
  assert.equal(profileFromRow({ user_id: 'u' }), null);
});

test('negative counters never leak through as negative counters', () => {
  const profile = profileFromRow({ ...profileRow, follower_count: -5, like_count: -1 });
  assert.ok(profile);
  assert.equal(profile.followerCount, 0);
  assert.equal(profile.likeCount, 0);
});

test('postFromRow keeps an unlisted creator lookup out of reach', () => {
  const post = postFromRow({
    id: 'p1',
    user_id: 'u1',
    kind: 'collab',
    title: 'Hello',
    body: '  body  ',
    tags: ['collab', '', '  video  '],
    link: null,
    like_count: 2,
    comment_count: 1,
    view_count: 7,
    created_at: '2026-01-01T00:00:00Z',
  });
  assert.ok(post);
  assert.equal(post.kind, 'collab');
  assert.equal(post.body, 'body');
  assert.deepEqual(post.tags, ['collab', 'video']);
});

test('postFromRow falls back to "update" for an unknown kind', () => {
  const post = postFromRow({ id: 'p', user_id: 'u', body: 'x', kind: 'sponsored' });
  assert.ok(post);
  assert.equal(post.kind, 'update');
});

test('postFromRow refuses a post with no body', () => {
  assert.equal(postFromRow({ id: 'p', user_id: 'u', body: '   ' }), null);
});

test('commentFromRow requires id, post, author and text', () => {
  assert.ok(commentFromRow({ id: 'c', post_id: 'p', user_id: 'u', body: 'hi' }));
  assert.equal(commentFromRow({ id: 'c', post_id: 'p', user_id: 'u', body: '' }), null);
  assert.equal(commentFromRow({ post_id: 'p', user_id: 'u', body: 'hi' }), null);
});

test('leaderboardRowFromJson keeps -1 meaning "not verified"', () => {
  const row = leaderboardRowFromJson({
    userId: 'u',
    handle: 'h',
    displayName: 'H',
    instagramFollowers: -1,
    followerCount: 5,
    rank: 3,
  });
  assert.ok(row);
  assert.equal(row.instagramFollowers, -1);
  assert.equal(row.rank, 3);
});

test('leaderboardRowFromJson treats a missing Instagram reading as unverified', () => {
  const row = leaderboardRowFromJson({ userId: 'u', handle: 'h' });
  assert.ok(row);
  assert.equal(row.instagramFollowers, -1);
  assert.equal(row.topMilestone, 0);
});

test('leaderboardRowFromJson rejects rows without identity', () => {
  assert.equal(leaderboardRowFromJson({ handle: 'h' }), null);
  assert.equal(leaderboardRowFromJson(null), null);
});

test('followerStatsFromRow and achievementFromRow validate their shapes', () => {
  assert.ok(
    followerStatsFromRow({
      user_id: 'u',
      instagram_user_id: '123',
      followers: 4000,
      source: 'instagram',
      measured_at: '2026-01-01T00:00:00Z',
    }),
  );
  assert.equal(followerStatsFromRow({ user_id: 'u' }), null);

  const achievement = { user_id: 'u', milestone: 1000, earned_at: 'now', source: 'instagram' };
  assert.ok(achievementFromRow(achievement));
  // Only the six published milestones are awardable.
  assert.equal(achievementFromRow({ ...achievement, milestone: 1234 }), null);
});

test('a corrupt follower reading is dropped rather than reported as zero', () => {
  const base = { user_id: 'u', instagram_user_id: '1', source: 'instagram' };
  assert.equal(followerStatsFromRow({ ...base }), null);
  assert.equal(followerStatsFromRow({ ...base, followers: 'lots' }), null);
  assert.equal(followerStatsFromRow({ ...base, followers: -1 }), null);
  assert.equal(followerStatsFromRow({ ...base, followers: Number.NaN }), null);
  assert.equal(followerStatsFromRow({ ...base, followers: 0 })?.followers, 0);
});

// ------------------------------------------------------------- validation ---

test('validateHandle normalises and constrains', () => {
  assert.deepEqual(validateHandle('  Ada Creates '), { ok: true, value: 'ada_creates' });
  assert.equal(validateHandle('ab').ok, false);
  assert.equal(validateHandle('has-dash').ok, false);
  assert.equal(validateHandle('a'.repeat(31)).ok, false);
  assert.equal(validateHandle('!!!').ok, false);
});

test('validateDisplayName and validateBio enforce their lengths', () => {
  const name = validateDisplayName('  Ada   Lovelace ');
  assert.ok(name.ok);
  assert.equal(name.value, 'Ada Lovelace');
  assert.equal(validateDisplayName('').ok, false);
  assert.equal(validateDisplayName('x'.repeat(61)).ok, false);
  assert.equal(validateBio('x'.repeat(401)).ok, false);
  assert.equal(validateBio('ok').ok, true);
  assert.equal(validateNiche('x'.repeat(61)).ok, false);
});

test('validatePostBody rejects empty and over-long posts', () => {
  assert.equal(validatePostBody('   ').ok, false);
  assert.equal(validatePostBody('x'.repeat(2001)).ok, false);
  const ok = validatePostBody('  hello there  ');
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.value, 'hello there');
});

test('validatePostTitle allows an empty title but caps a present one', () => {
  const empty = validatePostTitle('  ');
  assert.ok(empty.ok);
  assert.equal(empty.value, '');
  assert.equal(validatePostTitle('x'.repeat(121)).ok, false);
});

test('validateComment rejects blank and over-long comments', () => {
  assert.equal(validateComment('   ').ok, false);
  assert.equal(validateComment('x'.repeat(1001)).ok, false);
  assert.equal(validateComment('nice post').ok, true);
});

// ------------------------------------------------------------------- tags ---

test('parseTags strips hashes, lower-cases, de-duplicates and caps at six', () => {
  assert.deepEqual(
    parseTags('#Reels, reels  #TIPS #a #b #c #d #e'),
    ['reels', 'tips', 'a', 'b', 'c', 'd'],
  );
});

test('parseTags ignores empty fragments', () => {
  assert.deepEqual(parseTags(' , , '), []);
  assert.deepEqual(parseTags('one,,two'), ['one', 'two']);
});

// ---------------------------------------------------------------- rewards ---

test('milestones are the six published thresholds', () => {
  assert.deepEqual(MILESTONES, [1000, 10000, 50000, 100000, 500000, 1000000]);
});

test('nextMilestone and highestEarned bracket the current count', () => {
  assert.equal(nextMilestone(0), 1000);
  assert.equal(nextMilestone(999), 1000);
  assert.equal(nextMilestone(1000), 10000);
  assert.equal(nextMilestone(1000000), null);
  assert.equal(highestEarned(0), null);
  assert.equal(highestEarned(1000), 1000);
  assert.equal(highestEarned(75000), 50000);
  assert.equal(highestEarned(2000000), 1000000);
});

test('milestoneProgress runs between the previous threshold and the next', () => {
  assert.equal(milestoneProgress(0, 1000), 0);
  assert.equal(milestoneProgress(500, 1000), 0.5);
  assert.equal(milestoneProgress(1000, 1000), 1);
  // Progress toward 10K starts at 1K, not at zero.
  assert.equal(milestoneProgress(1000, 10000), 0);
  assert.equal(milestoneProgress(5500, 10000), 0.5);
  // Never outside 0–1, even for absurd input.
  assert.equal(milestoneProgress(-50, 1000), 0);
  assert.equal(milestoneProgress(999999, 1000), 1);
  assert.equal(milestoneProgress(Number.NaN, 1000), 0);
});

test('unearnedMilestones returns only what is reached and not yet held', () => {
  assert.deepEqual(unearnedMilestones(0, []), []);
  assert.deepEqual(unearnedMilestones(60000, []), [1000, 10000, 50000]);
  // A creator who already holds 1K must not be handed it twice.
  assert.deepEqual(unearnedMilestones(60000, [1000, 10000]), [50000]);
  assert.deepEqual(unearnedMilestones(60000, [1000, 10000, 50000]), []);
  // Passing several at once awards them all, ascending.
  assert.deepEqual(unearnedMilestones(1000000, []), [
    1000, 10000, 50000, 100000, 500000, 1000000,
  ]);
});

test('milestoneLabel shortens each threshold', () => {
  assert.equal(milestoneLabel(1000), '1K');
  assert.equal(milestoneLabel(10000), '10K');
  assert.equal(milestoneLabel(50000), '50K');
  assert.equal(milestoneLabel(100000), '100K');
  assert.equal(milestoneLabel(500000), '500K');
  assert.equal(milestoneLabel(1000000), '1M');
});

test('the ranking rules are all stated', () => {
  for (const key of ['instagram', 'followers', 'views', 'trending', 'overall'] as const) {
    assert.ok(LEADERBOARD_RULES[key].length > 20, key);
  }
});

// ---------------------------------------------------------------- identity ---

test('currentUserIdFromToken reads the sub claim', () => {
  const jwt = makeJwt({ sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' });
  assert.equal(currentUserIdFromToken(jwt), '22222222-2222-2222-2222-222222222222');
});

test('currentUserIdFromToken survives malformed input', () => {
  assert.equal(currentUserIdFromToken(null), null);
  assert.equal(currentUserIdFromToken(''), null);
  assert.equal(currentUserIdFromToken('not.a.jwt'), null);
  assert.equal(currentUserIdFromToken('a.b'), null);
  assert.equal(currentUserIdFromToken('a.%%% .c'), null);
  assert.equal(currentUserIdFromToken(makeJwt({ role: 'authenticated' })), null);
});

// ----------------------------------------------------------------- errors ---

test('communityErrorMessage maps every server rejection the RPCs can raise', () => {
  const cases: [string, RegExp][] = [
    ['not_authenticated', /sign in/i],
    ['handle_taken', /already taken/i],
    ['invalid_handle', /3–30/i],
    ['invalid_name', /1–60/i],
    ['invalid_target', /content is no longer available/i],
    ['profile_not_found', /no longer/i],
    ['post_not_found', /no longer available/i],
    ['invalid_comment', /1,000/i],
    ['not_allowed', /your own/i],
    ['invalid_metric', /not available/i],
    ['permission denied for table x', /do not have access/i],
  ];
  for (const [message, pattern] of cases) {
    assert.match(communityErrorMessage({ message }), pattern, message);
  }
});

test('communityErrorMessage never leaks an unknown message verbatim', () => {
  const message = communityErrorMessage({ message: 'relation "secret_table" does not exist' });
  assert.doesNotMatch(message, /secret_table/);
  assert.match(message, /try again/i);
  assert.match(communityErrorMessage(null), /check your connection/i);
  assert.match(communityErrorMessage('junk'), /check your connection/i);
});

test('a deployment without the trending column says so instead of failing loudly', () => {
  const message = communityErrorMessage({
    message: 'column creator_posts.engagement_count does not exist',
  });
  assert.doesNotMatch(message, /engagement_count/);
  assert.match(message, /trending order is not available/i);
});

test('every milestone has a badge, and no two badges look alike', () => {
  for (const milestone of MILESTONES) {
    const badge = MILESTONE_BADGES[milestone];
    assert.ok(badge, `missing badge for ${milestone}`);
    assert.ok(badge.glyph.trim().length > 0, `empty glyph for ${milestone}`);
    assert.ok(badge.title.trim().length > 0, `empty title for ${milestone}`);
    assert.match(badge.tint, /^#[0-9A-Fa-f]{6}$/, `tint for ${milestone}`);
  }
  // A shelf of six identical medals tells the creator nothing about what they
  // unlocked, so uniqueness is part of the contract, not a nicety.
  assert.equal(new Set(Object.values(MILESTONE_BADGES).map((b) => b.glyph)).size, MILESTONES.length);
  assert.equal(new Set(Object.values(MILESTONE_BADGES).map((b) => b.title)).size, MILESTONES.length);
  // The SVG badge art keys off `art`, so every badge must name one of the six
  // published artworks and no two badges may share one — otherwise two rungs
  // on the shelf would draw the identical picture.
  const arts: MilestoneArt[] = ['leaf', 'bolt', 'flame', 'star', 'crown', 'gem'];
  for (const badge of Object.values(MILESTONE_BADGES)) {
    assert.ok(arts.includes(badge.art), `unknown art: ${badge.art}`);
  }
  assert.equal(new Set(Object.values(MILESTONE_BADGES).map((b) => b.art)).size, MILESTONES.length);
  // The glyphs are deliberately restricted to Geometric Shapes plus one Misc
  // Symbol (U+25A0–U+2606) — the range every platform font ships — so a badge
  // never renders as a missing-glyph box.
  for (const badge of Object.values(MILESTONE_BADGES)) {
    const code = badge.glyph.codePointAt(0)!;
    assert.ok(
      code >= 0x25a0 && code <= 0x2606,
      `glyph out of safe range: ${badge.glyph} (U+${code.toString(16).toUpperCase()})`,
    );
  }
});

// ------------------------------------------------------- discovery filters ---

test('every leaderboard window has a label, and only engagement is windowed', () => {
  assert.deepEqual([...LEADERBOARD_PERIODS], ['7d', '30d', 'all']);
  for (const period of LEADERBOARD_PERIODS) {
    assert.ok(LEADERBOARD_PERIOD_LABELS[period]?.trim().length > 0, `no label for ${period}`);
  }
  // Followers and views are lifetime totals with no history behind them, so
  // claiming a period applies to those columns would be a lie on screen.
  assert.deepEqual([...PERIOD_SENSITIVE_METRICS].sort(), ['overall', 'trending']);
  for (const metric of Object.keys(LEADERBOARD_RULES)) {
    assert.ok(LEADERBOARD_RULES[metric as keyof typeof LEADERBOARD_RULES].length > 20);
  }
});

test('reports reject an unknown reason and oversized detail before the round trip', () => {
  assert.deepEqual([...REPORT_REASONS], [
    'spam',
    'harassment',
    'misinformation',
    'impersonation',
    'other',
  ]);
  assert.equal(validateReportReason(' spam ').ok, true);
  assert.equal(validateReportReason('anything else').ok, false);
  assert.equal(validateReportReason('').ok, false);
  assert.equal(validateReportDetails('   ').ok, true);
  const tooLong = validateReportDetails('x'.repeat(501));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.ok ? '' : tooLong.error, /500/);
});

test('a creator summary keeps the unverified marker instead of inventing a number', () => {
  const verified = creatorSummaryFromJson({
    userId: 'u1',
    instagramFollowers: 1234.6,
    verified: true,
    measuredAt: '2026-01-02T00:00:00Z',
    topMilestone: 1000,
    followerCount: 10,
    postCount: 3,
    viewCount: 40,
    likeCount: 5,
    commentCount: 2,
  });
  assert.ok(verified);
  assert.equal(verified.instagramFollowers, 1235);
  assert.equal(verified.verified, true);
  assert.equal(verified.topMilestone, 1000);

  // -1 is the server's "never read from Instagram" answer and must survive.
  const unverified = creatorSummaryFromJson({
    userId: 'u2',
    instagramFollowers: -1,
    verified: false,
    measuredAt: null,
    topMilestone: 0,
  });
  assert.ok(unverified);
  assert.equal(unverified.instagramFollowers, -1);
  assert.equal(unverified.verified, false);
  assert.equal(unverified.measuredAt, null);

  assert.equal(creatorSummaryFromJson(null), null);
  assert.equal(creatorSummaryFromJson({}), null);
});

test('a leaderboard row carries its verified flag and windowed engagement', () => {
  const row = leaderboardRowFromJson({
    userId: 'u1',
    handle: 'ada',
    verified: true,
    engagement: 7,
    instagramFollowers: 5000,
    rank: 1,
    value: 42,
  });
  assert.ok(row);
  assert.equal(row.verified, true);
  // `engagement` is the server's current key and `engagement7d` the alias the
  // older client read — either one has to land in the same field.
  assert.equal(row.engagement7d, 7);
  assert.equal(leaderboardRowFromJson({ userId: 'u1', handle: 'ada', engagement: 'x' })?.engagement7d, 0);
});

test('server-side throttles and a not-yet-deployed read get readable messages', () => {
  assert.match(communityErrorMessage({ message: 'rate_limited' }), /too often/i);
  assert.match(communityErrorMessage({ message: 'invalid_period' }), /time range/i);
  assert.match(communityErrorMessage({ message: 'invalid_reason' }), /reason/i);
  // Missing-function (PGRST202) is a deployment gap, not a broken app: the
  // profile screen drops the field rather than showing an error.
  assert.equal(
    communityErrorMessage({ message: 'Could not find the function public.community_summary(uuid)' }),
    VERIFIED_STATS_UNAVAILABLE,
  );
  // Any *other* missing RPC is the generic deployment gap, so a new function
  // added later still gets a usable message without a code change.
  assert.equal(
    communityErrorMessage({ message: 'Could not find the function public.something_else()' }),
    SCHEMA_NOT_DEPLOYED,
  );
});

test('the Top 20 pool is stated the way the server enforces it', () => {
  // "Top" is the default view, so it has to be first and hold exactly twenty.
  assert.equal(LEADERBOARD_SCOPES[0], 'top');
  assert.equal(TOP_CREATOR_LIMIT, 20);
  assert.equal(LEADERBOARD_SCOPE_LABELS.top, 'Top 20');
  assert.equal(LEADERBOARD_SCOPES.length, Object.keys(LEADERBOARD_SCOPE_LABELS).length);
  // The printed rule has to promise only what the SQL filter delivers: a real
  // account, connected through the app, ranked 1 to 20.
  assert.match(LEADERBOARD_SCOPE_RULES.top, /top 20/i);
  assert.match(LEADERBOARD_SCOPE_RULES.top, /instagram/i);
  assert.match(LEADERBOARD_SCOPE_RULES.top, /connected/i);
  assert.match(LEADERBOARD_SCOPE_RULES.top, /1 to 20/);
  // The wide scope must not claim verification it does not filter on.
  assert.match(LEADERBOARD_SCOPE_RULES.all, /whether or not instagram is connected/i);
  assert.equal(Object.keys(LEADERBOARD_SCOPE_RULES).length, LEADERBOARD_SCOPES.length);
});

test('a printed ranking rule follows the selected window', () => {
  // Engagement is windowed, so its rule has to name the window actually shown.
  assert.match(leaderboardRule('trending', '30d'), /30 days/);
  assert.doesNotMatch(leaderboardRule('trending', '30d'), /7 days/);
  assert.match(leaderboardRule('overall', 'all'), /all time|all-time/);
  // Lifetime totals have no history to window — their rule must not move.
  assert.equal(leaderboardRule('followers', '30d'), LEADERBOARD_RULES.followers);
  assert.equal(leaderboardRule('views', '7d'), LEADERBOARD_RULES.views);
  // Every metric still has a rule at the default window.
  for (const metric of ['instagram', 'followers', 'views', 'trending', 'overall'] as const) {
    assert.ok(leaderboardRule(metric, '7d').length > 0);
  }
});

// ------------------------------------------------------- feed order & photos ---

test('the community feed offers exactly the two orders it can really run', () => {
  assert.deepEqual([...FEED_SORTS], ['latest', 'trending']);
  assert.equal(Object.keys(FEED_SORT_LABELS).length, FEED_SORTS.length);
  assert.equal(Object.keys(FEED_SORT_RULES).length, FEED_SORTS.length);
  // The trending rule must state the tie-break, because that is what keeps
  // page 2 from disagreeing with page 1.
  assert.match(FEED_SORT_RULES.trending, /liked/i);
  assert.match(FEED_SORT_RULES.trending, /commented/i);
  assert.match(FEED_SORT_RULES.trending, /newer/i);
  assert.match(FEED_SORT_RULES.latest, /newest/i);
});

test('the Instagram metric exists everywhere the UI can name a metric', () => {
  assert.ok(LEADERBOARD_METRICS.includes('instagram'));
  assert.equal(LEADERBOARD_METRIC_LABELS.instagram, 'Instagram Followers');
  // It is a lifetime reading, so it must not pretend a window applies.
  assert.equal(leaderboardRule('instagram', '30d'), LEADERBOARD_RULES.instagram);
});

test('a post photo is only accepted from this project\u2019s own bucket', () => {
  const ours = 'https://proj.supabase.co/storage/v1/object/public/community-posts/u1/a.jpg';
  assert.equal(isPostMediaUrl(ours), true);
  assert.equal(isPostMediaUrl('/storage/v1/object/public/community-posts/u1/a.jpg'), false);
  assert.equal(isPostMediaUrl('https://evil.example/x.jpg'), false);
  assert.equal(isPostMediaUrl('https://proj.supabase.co/storage/v1/object/public/other/a.jpg'), false);
  assert.equal(isPostMediaUrl(null), false);
  // A crafted row with a foreign host must be dropped by the parser itself.
  const post = postFromRow({
    id: 'p',
    user_id: 'u',
    body: 'x',
    media_url: 'https://evil.example/pixel.gif',
  });
  assert.ok(post);
  assert.equal(post.mediaUrl, null);
  const withPhoto = postFromRow({ id: 'p', user_id: 'u', body: 'x', media_url: ours });
  assert.ok(withPhoto);
  assert.equal(withPhoto.mediaUrl, ours);
});

test('the object path is only derived from a URL we own', () => {
  assert.equal(
    mediaObjectPath('https://proj.supabase.co/storage/v1/object/public/community-posts/u1/a.jpg'),
    'u1/a.jpg',
  );
  assert.equal(mediaObjectPath('https://evil.example/u1/a.jpg'), null);
  assert.equal(mediaObjectPath(null), null);
});

test('the upload mime is guessed from the file name', () => {
  assert.equal(mediaMimeType('shot.PNG'), 'image/png');
  assert.equal(mediaMimeType('a.webp'), 'image/webp');
  assert.equal(mediaMimeType('a.heic'), 'image/jpeg');
  assert.ok(MEDIA_MIME_TYPES.includes('image/webp'));
  assert.equal(MEDIA_BUCKET, 'community-posts');
  assert.equal(MEDIA_MAX_BYTES, 8 * 1024 * 1024);
});
