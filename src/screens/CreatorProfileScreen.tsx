import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MilestoneBadge } from '../components/MilestoneBadge';
import { ReportSheet } from '../components/ReportSheet';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  GradientButton,
  PillTabs,
  ScreenHeader,
  Skeleton,
} from '../components/ui';
import {
  MILESTONES,
  MILESTONE_BADGES,
  POST_KIND_LABELS,
  currentUserIdFromToken,
  type Achievement,
  type CommunityPost,
  type CreatorProfile,
  type CreatorSummary,
  type ReportReason,
} from '../lib/community/model';
import { formatCount, relativeTime } from '../lib/discover/model';
import * as community from '../services/community';
import { FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useTheme } from '../themeContext';

// A creator's public profile: who they are, what they have published, and the
// milestones they have earned — every number here read from the server, with
// the Instagram figure shown only when the app actually verified it.

const TABS = ['posts', 'about'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = { posts: 'Posts', about: 'About' };

export function CreatorProfileScreen({
  userId,
  getCreatorToken,
  onBack,
}: {
  userId: string;
  getCreatorToken: () => Promise<string>;
  onBack: () => void;
}) {
  const c = useThemeColors();
  const { mode } = useTheme();
  const tone = mode === 'dark' ? ('dark' as const) : ('light' as const);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [tab, setTab] = useState<Tab>('posts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [summary, setSummary] = useState<CreatorSummary | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postsTotal, setPostsTotal] = useState<number | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);

  const load = useCallback(
    async (options: { more?: boolean } = {}) => {
      if (options.more) setPostsLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        if (!userId) {
          setError('That creator could not be found.');
          setProfile(null);
          return;
        }
        const token = await getCreatorToken();
        const me = currentUserIdFromToken(token);
        if (me) setMeId(me);

        const base = options.more ? null : await community.listProfiles(token, { userId, limit: 1 });
        if (!alive.current) return;
        if (base && !base.ok) {
          setError(base.message);
          setProfile(null);
          return;
        }
        const found = base ? (base.data.items[0] ?? null) : null;
        if (!options.more && !found) {
          setError('This creator is no longer in the community.');
          setProfile(null);
          return;
        }
        if (found) setProfile(found);

        const offset = posts.length;
        const [sumResult, badges, postPage, followState] = await Promise.all([
          options.more
            ? Promise.resolve(null)
            : community.fetchCreatorSummary(token, userId),
          options.more
            ? Promise.resolve(null)
            : community.fetchAchievements(token, userId),
          community.listPosts(token, { userId, limit: 20, offset }),
          community.fetchFollowedIds(token, [userId]),
        ]);
        if (!alive.current) return;
        if (sumResult && sumResult.ok) setSummary(sumResult.data);
        if (badges && badges.ok) setAchievements(badges.data);
        if (followState.ok) setFollowing(followState.data.has(userId));

        if (!postPage.ok) {
          if (!options.more) setPosts([]);
          setError(postPage.message);
          return;
        }
        const decorated = await community.decoratePosts(token, postPage.data.items);
        if (!alive.current) return;
        const items = decorated.ok ? decorated.data : postPage.data.items;
        setPosts((prev) => (options.more ? [...prev, ...items] : items));
        setPostsTotal(postPage.data.total);
      } catch {
        if (alive.current) {
          setError('This profile could not be loaded. Check your connection and retry.');
        }
      } finally {
        if (alive.current) {
          setLoading(false);
          setPostsLoadingMore(false);
        }
      }
    },
    [userId, getCreatorToken, posts.length],
  );

  useEffect(() => {
    void load();
    // Loads once per target creator. `posts.length` is read inside the
    // callback for pagination and must not retrigger the whole page.
  }, [userId]);

  const toggleFollow = useCallback(async () => {
    if (followBusy || !profile || profile.userId === meId) return;
    const wasFollowing = following;
    setFollowBusy(true);
    setFollowing(!wasFollowing);
    setProfile({
      ...profile,
      followerCount: Math.max(0, profile.followerCount + (wasFollowing ? -1 : 1)),
    });
    try {
      const token = await getCreatorToken();
      const result = wasFollowing
        ? await community.unfollowCreator(token, profile.userId)
        : await community.followCreator(token, profile.userId);
      if (!alive.current) return;
      if (!result.ok) {
        setNotice(result.message);
        setFollowing(wasFollowing);
        setProfile({ ...profile, followerCount: profile.followerCount });
        return;
      }
      setProfile({ ...profile, followerCount: result.data.followerCount });
    } catch {
      if (!alive.current) return;
      setFollowing(wasFollowing);
      setNotice('That follow could not be saved. Please retry.');
    } finally {
      if (alive.current) setFollowBusy(false);
    }
  }, [followBusy, following, profile, meId, getCreatorToken]);

  const submitReport = useCallback(
    async (reason: ReportReason, details: string) => {
      try {
        const token = await getCreatorToken();
        const result = await community.reportContent(token, {
          targetType: 'profile',
          targetId: userId,
          reason,
          details,
        });
        if (!alive.current) return null;
        if (!result.ok) return result.message;
        setReportOpen(false);
        setNotice('Thanks — your report was sent to the moderators.');
        return null;
      } catch {
        return 'Your report could not be sent. Please retry.';
      }
    },
    [getCreatorToken, userId],
  );

  const openWebsite = useCallback(async (url: string) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(target);
    } catch {
      setNotice('That link could not be opened right now.');
    }
  }, []);

  const earned = useMemo(
    () => new Set(achievements.map((entry) => entry.milestone)),
    [achievements],
  );

  // Progress only ever counts a number the app read from Instagram; without a
  // verification there is no truthful denominator, so none is shown.
  const verifiedFollowers = summary && summary.instagramFollowers >= 0
    ? summary.instagramFollowers
    : null;
  const nextMilestone = verifiedFollowers === null
    ? null
    : MILESTONES.find((entry) => entry > verifiedFollowers) ?? null;
  const progress =
    verifiedFollowers !== null && nextMilestone
      ? Math.min(100, Math.round((verifiedFollowers / nextMilestone) * 100))
      : null;

  const s = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: FAB_CLEARANCE + 12,
          gap: 14,
        },
        hero: { gap: 12, padding: 16 },
        heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
        who: { flex: 1, gap: 3 },
        name: { ...type.h3, color: c.onDark },
        handle: { ...type.small, color: c.onDarkDim },
        bio: { ...type.body, color: c.onDarkSub, lineHeight: 21 },
        metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        meta: { ...type.small, color: c.onDarkSub },
        chip: {
          ...type.small,
          color: c.primary,
          backgroundColor: c.primarySoft,
          borderRadius: radius.pill,
          paddingHorizontal: 10,
          paddingVertical: 5,
        },
        stats: { flexDirection: 'row', gap: 10 },
        stat: {
          flex: 1,
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md,
          paddingVertical: 12,
          paddingHorizontal: 10,
          alignItems: 'center',
          gap: 3,
        },
        statValue: { ...type.stat, color: c.onDark, fontSize: 20 },
        statLabel: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.5, textTransform: 'uppercase' },
        verifiedNote: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
        followRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
        reportBtn: {
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: c.darkBorder,
          backgroundColor: c.darkCard2,
        },
        reportLabel: { ...type.small, fontWeight: '800', color: c.onDarkSub },
        notice: {
          ...type.small,
          color: c.onDarkSub,
          backgroundColor: c.darkCard2,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: c.darkBorder,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        errorCard: {
          gap: 10,
          padding: 15,
          borderRadius: radius.md,
          backgroundColor: c.redSoft,
          borderWidth: 1,
          borderColor: c.red,
        },
        errorText: { ...type.small, color: c.red, lineHeight: 19 },
        retry: {
          alignSelf: 'flex-start',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.red,
        },
        retryText: { ...type.small, fontWeight: '800', color: '#FFFFFF' },
        postCard: { gap: 8, padding: 15 },
        postHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        postName: { ...type.bodyBold, color: c.onDark },
        postMeta: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.4 },
        postBody: { ...type.body, color: c.onDarkSub },
        tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
        tag: {
          ...type.tiny,
          color: c.primary,
          backgroundColor: c.primarySoft,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: radius.pill,
          letterSpacing: 0.3,
        },
        stats2: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
        statText: { ...type.small, fontWeight: '700', color: c.onDarkSub },
        sectionTitle: {
          ...type.tiny,
          color: c.onDarkDim,
          textTransform: 'uppercase',
          marginTop: 4,
        },
        badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        badgeCell: {
          alignItems: 'center',
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md,
          minWidth: 96,
        },
        badgeTitle: { ...type.small, fontWeight: '800', color: c.onDark, textAlign: 'center' },
        badgeSub: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.3 },
        progressWrap: { gap: 8 },
        progressTrack: {
          height: 10,
          borderRadius: radius.pill,
          backgroundColor: c.darkCard2,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        progressFill: { height: '100%', backgroundColor: c.primary, borderRadius: radius.pill },
        list: { gap: 12 },
        loadMore: {
          alignSelf: 'center',
          paddingHorizontal: 18,
          paddingVertical: 11,
          borderRadius: radius.pill,
          backgroundColor: c.primarySoft,
        },
        loadMoreLabel: { ...type.small, fontWeight: '800', color: c.primary },
        aboutRow: { gap: 4, paddingBottom: 4 },
        aboutLabel: { ...type.tiny, color: c.onDarkDim, textTransform: 'uppercase' },
        aboutValue: { ...type.body, color: c.onDarkSub },
        skeletonCard: {
          gap: 9,
          padding: 15,
          borderRadius: radius.md,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
      }),
    [c],
  );

  const renderPosts = () => (
    <>
      {postsLoadingMore ? <ActivityIndicator size="small" color={c.primary} /> : null}
      {posts.length === 0 ? (
        <EmptyState
          tone={tone}
          glyph="✎"
          title="No posts yet"
          hint={
            profile && profile.userId === meId
              ? 'Share an update from the Feed tab to fill this page.'
              : 'This creator has not published an update yet.'
          }
        />
      ) : (
        <View style={s.list}>
          {posts.map((post) => (
            <Card key={post.id} tone={tone} style={s.postCard}>
              <View style={s.postHead}>
                <Avatar uri={profile?.avatarUrl ?? null} name={profile?.displayName ?? '?'} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.postName} numberOfLines={1}>
                    {profile?.displayName ?? 'Creator'}
                  </Text>
                  <Text style={s.postMeta}>
                    {relativeTime(post.createdAt)} ago · {POST_KIND_LABELS[post.kind]}
                  </Text>
                </View>
              </View>
              <Text style={s.postBody}>{post.body}</Text>
              {post.tags.length > 0 ? (
                <View style={s.tags}>
                  {post.tags.map((tag) => (
                    <Text key={tag} style={s.tag}>
                      #{tag}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={s.stats2}>
                <Text style={s.statText}>♥ {formatCount(post.likeCount)}</Text>
                <Text style={s.statText}>◌ {formatCount(post.commentCount)} comments</Text>
                <Text style={s.statText}>{formatCount(post.viewCount)} views</Text>
              </View>
            </Card>
          ))}
        </View>
      )}
      {postsTotal !== null && posts.length < postsTotal ? (
        <Pressable
          onPress={() => void load({ more: true })}
          disabled={postsLoadingMore}
          style={s.loadMore}
          accessibilityRole="button"
          accessibilityLabel="Load more posts"
        >
          <Text style={s.loadMoreLabel}>
            {postsLoadingMore ? 'Loading…' : `Load more (${postsTotal - posts.length} left)`}
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const renderAbout = () => (
    <>
      <Card tone={tone} style={s.postCard}>
        <Text style={s.sectionTitle}>About</Text>
        <Text style={s.bio}>{profile?.bio || 'No bio yet.'}</Text>
        <View style={s.aboutRow}>
          <Text style={s.aboutLabel}>Niche</Text>
          <Text style={s.aboutValue}>{profile?.niche || 'Not set'}</Text>
        </View>
        <View style={s.aboutRow}>
          <Text style={s.aboutLabel}>Looking for</Text>
          <View style={s.metaRow}>
            {profile && profile.goals.length > 0 ? (
              profile.goals.map((goal) => (
                <Text key={goal} style={s.chip}>
                  {goal}
                </Text>
              ))
            ) : (
              <Text style={s.aboutValue}>Nothing listed</Text>
            )}
          </View>
        </View>
        <View style={s.aboutRow}>
          <Text style={s.aboutLabel}>Location</Text>
          <Text style={s.aboutValue}>{profile?.location || 'Not shown'}</Text>
        </View>
        <View style={s.aboutRow}>
          <Text style={s.aboutLabel}>Website</Text>
          {profile?.website ? (
            <Pressable
              onPress={() => void openWebsite(profile.website ?? '')}
              accessibilityRole="link"
              accessibilityLabel={`Open ${profile.website}`}
            >
              <Text style={[s.aboutValue, { color: c.primary, fontWeight: '700' }]}>
                {profile.website}
              </Text>
            </Pressable>
          ) : (
            <Text style={s.aboutValue}>Not shown</Text>
          )}
        </View>
        <View style={s.aboutRow}>
          <Text style={s.aboutLabel}>Joined</Text>
          <Text style={s.aboutValue}>
            {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Recently'}
          </Text>
        </View>
      </Card>

      <Card tone={tone} style={s.postCard}>
        <Text style={s.sectionTitle}>Milestones</Text>
        <View style={s.badges}>
          {MILESTONES.map((milestone) => {
            const has = earned.has(milestone);
            const art = MILESTONE_BADGES[milestone];
            return (
              <View key={milestone} style={s.badgeCell}>
                <MilestoneBadge milestone={milestone} size={46} earned={has} />
                <Text style={[s.badgeTitle, !has && { color: c.onDarkDim }]}>{art.title}</Text>
                <Text style={s.badgeSub}>
                  {has ? 'Earned' : `Unlocks at ${formatCount(milestone)} followers`}
                </Text>
              </View>
            );
          })}
        </View>
        {verifiedFollowers !== null && nextMilestone && progress !== null ? (
          <View style={s.progressWrap}>
            <Text style={s.verifiedNote}>
              {formatCount(verifiedFollowers)} verified Instagram followers —{' '}
              {formatCount(nextMilestone - verifiedFollowers)} to {MILESTONE_BADGES[nextMilestone].title}.
            </Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>
        ) : (
          <Text style={s.verifiedNote}>
            Instagram follower count not verified for this profile — milestones unlock once the app
            reads it directly from Instagram.
          </Text>
        )}
      </Card>
    </>
  );

  return (
    <View style={s.screen}>
      <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
        <ScreenHeader
          title={profile?.displayName ?? 'Creator'}
          subtitle={profile ? `@${profile.handle}` : 'Loading profile'}
          onBack={onBack}
          tone={tone}
        />
        <PillTabs
          options={TABS.map((entry) => TAB_LABELS[entry])}
          value={TAB_LABELS[tab]}
          onChange={(label) => {
            const next = TABS.find((entry) => TAB_LABELS[entry] === label);
            if (next) setTab(next);
          }}
          variant={mode === 'dark' ? 'dark' : 'light'}
        />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.list}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={s.skeletonCard}>
                <Skeleton width="55%" height={12} />
                <Skeleton width="90%" height={16} />
                <Skeleton width="70%" height={16} />
              </View>
            ))}
          </View>
        ) : error && !profile ? (
          <View style={s.errorCard} accessibilityRole="alert">
            <Text style={s.errorText}>{error}</Text>
            <Pressable
              onPress={() => void load()}
              style={s.retry}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : profile ? (
          <>
            <Card tone={tone} style={s.hero}>
              <View style={s.heroTop}>
                <Avatar uri={profile.avatarUrl} name={profile.displayName} size={72} />
                <View style={s.who}>
                  <Text style={s.name} numberOfLines={1}>
                    {profile.displayName}
                  </Text>
                  <Text style={s.handle} numberOfLines={1}>
                    @{profile.handle}
                    {profile.niche ? ` · ${profile.niche}` : ''}
                  </Text>
                  <View style={s.metaRow}>
                    {verifiedFollowers !== null ? (
                      <Badge label="Instagram verified" tone="green" />
                    ) : (
                      <Badge label="Instagram not verified" tone="gray" />
                    )}
                    {profile.isListed ? null : <Badge label="Hidden from directory" tone="amber" />}
                  </View>
                </View>
              </View>

              {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}

              <View style={s.stats}>
                <View style={s.stat}>
                  <Text style={s.statValue}>{formatCount(profile.followerCount)}</Text>
                  <Text style={s.statLabel}>Followers</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statValue}>{formatCount(profile.postCount)}</Text>
                  <Text style={s.statLabel}>Posts</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statValue}>{formatCount(profile.viewCount)}</Text>
                  <Text style={s.statLabel}>Views</Text>
                </View>
              </View>

              <Text style={s.verifiedNote}>
                {verifiedFollowers !== null
                  ? `Instagram: ${formatCount(verifiedFollowers)} followers, verified ${summary?.measuredAt ? relativeTime(summary.measuredAt) : 'recently'} by CreatorDNA.`
                  : 'Instagram follower count: not verified for this profile, so no Instagram figure is shown.'}
              </Text>

              <View style={s.followRow}>
                {profile.userId === meId ? (
                  <Badge label="This is your profile" tone="blue" />
                ) : (
                  <>
                    <GradientButton
                      label={followBusy ? 'Saving…' : following ? 'Following' : 'Follow'}
                      onPress={() => void toggleFollow()}
                      loading={followBusy}
                      disabled={followBusy}
                      style={{ flexGrow: 1 }}
                    />
                    <Pressable
                      onPress={() => setReportOpen(true)}
                      style={s.reportBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Report ${profile.displayName}`}
                    >
                      <Text style={s.reportLabel}>Report</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Card>

            {error ? (
              <View style={s.errorCard} accessibilityRole="alert">
                <Text style={s.errorText}>{error}</Text>
                <Pressable
                  onPress={() => void load()}
                  style={s.retry}
                  accessibilityRole="button"
                  accessibilityLabel="Retry"
                >
                  <Text style={s.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {notice ? <Text style={s.notice}>{notice}</Text> : null}

            {tab === 'posts' ? renderPosts() : renderAbout()}
          </>
        ) : null}
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        targetLabel="this profile"
        onCancel={() => setReportOpen(false)}
        onSubmit={submitReport}
      />
    </View>
  );
}
