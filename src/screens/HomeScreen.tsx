import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { ScoreRing } from '../components/ScoreRing';
import { BellIcon, SparkIcon } from '../components/icons';
import {
  Avatar,
  Badge,
  Card,
  GradientButton,
  Skeleton,
  StatTile,
} from '../components/ui';
import {
  averageDailyViews,
  deltaText,
  dnaScore,
  engagementRate,
  formatCount,
  formatPercent,
  greeting,
  growthDelta,
  humanizeMediaType,
  quickInsight,
  relativeTime,
  topPostingWindow,
  weekSummary,
  type Delta,
} from '../lib/derived';
import { unreadBadgeLabel } from '../lib/notifications/model';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import type { CreatorAiIdea } from '../services/creatorAi';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, type } from '../theme';

// The command centre answers three questions in order: how am I doing (the
// headline), what changed this week, and what should I create next. Every
// number here comes from the connected account's own analytics — a value the
// API did not share renders as "Not enough data yet" instead of a zero or a
// misleading -100%, and a still-loading dashboard renders as skeletons rather
// than an empty grid of dashes.

export function HomeScreen({
  profile,
  dashboard,
  loading,
  error,
  records,
  ideaCount,
  ideas,
  lastSyncedAt,
  onRetry,
  onReconnect,
  onConnect,
  onCreatePost,
  onSwitchAccount,
  onViewDna,
  onOpenReport,
  unreadNotifications,
  onOpenNotifications,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  loading: boolean;
  error: 'reconnect_required' | 'try_again' | null;
  records: AnalysisRecord[];
  ideaCount: number;
  ideas: CreatorAiIdea[];
  lastSyncedAt: string | null;
  onRetry: () => void;
  onReconnect: () => void;
  onConnect: () => void;
  onCreatePost: () => void;
  onSwitchAccount: () => void;
  onViewDna: () => void;
  onOpenReport: () => void;
  unreadNotifications: number;
  onOpenNotifications: () => void;
}) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);

  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const stats = dashboard?.stats ?? null;
  const viewsDelta = stats ? growthDelta(stats.views, stats.previous?.views ?? null) : null;
  // A full -100% is almost always an unpopulated current window, not a real
  // collapse to zero, and reporting it as a drop would be misleading. Show
  // the neutral state instead and keep every other delta truthful.
  const growth = viewsDelta && viewsDelta.pct > -100 ? viewsDelta : null;
  const dnaValue = dnaScore(records);
  const insight = quickInsight(dashboard, records, ideaCount);
  const totalPosts = dashboard?.profile.mediaCount ?? null;
  const avgViews = averageDailyViews(dashboard);
  const rate = engagementRate(stats);
  const week = weekSummary(dashboard);
  const bestTime = topPostingWindow(dashboard);
  const nextIdea = ideas.length > 0 ? ideas[0] : null;
  const connected = Boolean(dashboard || profile);
  const syncText = loading
    ? 'Syncing…'
    : lastSyncedAt
      ? `Synced ${relativeTime(lastSyncedAt)}`
      : 'Not synced yet';
  // A connected account is never nagged to "Reconnect" from home — genuine
  // session expiry is handled in Settings; home just offers a retry.
  const sessionExpired = error === 'reconnect_required' && !profile;

  // Only metrics the API actually returned earn a tile; the rest are left
  // out entirely rather than shown as a dash.
  const tiles: Array<{ label: string; value: string }> = [];
  if (stats && stats.followers !== null) {
    tiles.push({ label: 'Followers', value: formatCount(stats.followers) });
  }
  if (stats && stats.reach !== null) {
    tiles.push({ label: 'Reach', value: formatCount(stats.reach) });
  }
  if (stats && stats.views !== null) {
    tiles.push({ label: 'Views (30d)', value: formatCount(stats.views) });
  }
  if (rate !== null) {
    tiles.push({ label: 'Engagement Rate', value: formatPercent(rate) });
  }
  if (totalPosts !== null) {
    tiles.push({ label: 'Posts', value: String(totalPosts) });
  }
  if (avgViews !== null) {
    tiles.push({ label: 'Avg. Daily Views', value: formatCount(avgViews) });
  }
  const tileRows: Array<typeof tiles> = [];
  for (let index = 0; index < tiles.length; index += 3) {
    tileRows.push(tiles.slice(index, index + 3));
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: FAB_CLEARANCE,
          gap: 14,
        },

        greetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
        headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        bell: {
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        bellBadge: {
          position: 'absolute',
          top: 2,
          right: 1,
          minWidth: 17,
          height: 17,
          borderRadius: 9,
          paddingHorizontal: 4,
          backgroundColor: c.red,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: c.darkBg,
        },
        bellBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
        // Same lockup as the onboarding page: DNA mark beside the wordmark.
        brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
        brand: { color: c.onDark, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
        brandAccent: { color: c.primary },
        greet: { ...type.h3, color: c.onDark, fontSize: 22, letterSpacing: -0.4 },
        greetSub: { ...type.small, color: c.onDarkSub, marginTop: 5, fontSize: 13.5 },

        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          flexWrap: 'wrap',
          marginTop: 7,
        },
        statusDot: { width: 7, height: 7, borderRadius: 4 },
        statusText: { ...type.small, color: c.onDarkSub, fontSize: 12.5 },
        syncText: { ...type.small, color: c.onDarkDim, fontSize: 12.5 },

        errorCard: { borderColor: c.darkBorder },
        errorTitle: { ...type.h4, color: c.onDark },
        errorBody: { ...type.small, color: c.onDarkSub, marginTop: 6, lineHeight: 18 },

        growthCard: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.darkCard2,
          paddingVertical: 18,
          gap: 12,
        },
        growthLeft: { flex: 1 },
        growthLabel: {
          ...type.tiny,
          color: c.onDarkSub,
          textTransform: 'uppercase',
        },
        growthValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1.4, marginTop: 8 },
        growthCaption: { ...type.small, color: c.onDarkDim, marginTop: 4 },
        growthRight: { alignItems: 'center', gap: 8, paddingRight: 4 },
        ringLabel: { ...type.tiny, color: c.onDarkSub, textTransform: 'uppercase' },

        statsRow: { flexDirection: 'row', gap: 10 },
        notEnough: { ...type.small, color: c.onDarkSub, lineHeight: 19, paddingHorizontal: 4 },

        weekCard: { gap: 12 },
        weekHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
        weekTitle: { ...type.h4, color: c.text },
        weekRange: { ...type.tiny, color: c.textDim },
        weekRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingTop: 11,
          borderTopWidth: 1,
          borderTopColor: isDark ? c.darkBorder : c.lightBorder,
        },
        weekLabelWrap: { flex: 1 },
        weekLabel: { ...type.bodyBold, color: c.text, fontSize: 14 },
        weekSub: { ...type.tiny, color: c.textDim, marginTop: 2 },
        weekRight: { alignItems: 'flex-end', gap: 3, maxWidth: '58%' },
        weekValue: { ...type.bodyBold, color: c.text, fontSize: 14, textAlign: 'right' },
        weekValueMuted: { ...type.small, color: c.textDim, fontSize: 13, textAlign: 'right' },
        weekDelta: { ...type.tiny, fontWeight: '700' },

        recCard: { backgroundColor: c.insightCard, gap: 12 },
        recHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
        recIcon: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: c.amberSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        recTitle: { ...type.bodyBold, color: c.onDark, fontSize: 15.5, flex: 1 },
        recInsight: { ...type.small, color: c.onDarkSub, lineHeight: 19, fontSize: 14 },
        recIdea: {
          backgroundColor: c.darkCard2,
          borderRadius: 14,
          padding: 13,
          gap: 5,
        },
        recIdeaLabel: { ...type.tiny, color: c.amber, textTransform: 'uppercase' },
        recIdeaTitle: { ...type.bodyBold, color: c.onDark, fontSize: 15 },
        recIdeaMeta: { ...type.small, color: c.onDarkSub, fontSize: 12.5 },
        recFoot: { ...type.tiny, color: c.onDarkDim, lineHeight: 16 },

        insightCard: { backgroundColor: c.insightCard },
        insightHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
        insightIcon: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: c.amberSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        insightTitle: { ...type.bodyBold, color: c.onDark, fontSize: 15.5 },
        insightBody: { ...type.small, color: c.onDarkSub, marginTop: 10, lineHeight: 19, fontSize: 14 },

        skelStack: { gap: 12 },
        skelCaption: { ...type.small, color: c.onDarkDim, textAlign: 'center' },

        refreshing: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingTop: 2,
        },
        refreshingText: { ...type.small, color: c.onDarkDim },
      }),
    [c, isDark],
  );

  const weekRow = (
    label: string,
    value: string | null,
    options: { sub?: string; delta?: Delta; muted?: boolean } = {},
  ) => (
    <View key={label} style={styles.weekRow}>
      <View style={styles.weekLabelWrap}>
        <Text style={styles.weekLabel}>{label}</Text>
        {options.sub ? <Text style={styles.weekSub}>{options.sub}</Text> : null}
      </View>
      <View style={styles.weekRight}>
        <Text style={[styles.weekValue, options.muted && styles.weekValueMuted]}>
          {value ?? 'Not enough data yet'}
        </Text>
        {options.delta ? (
          <Text
            style={[
              styles.weekDelta,
              { color: options.delta.up ? c.green : c.red },
            ]}
          >
            {deltaText(options.delta)}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <DnaMark size={30} />
          <Text style={styles.brand}>
            Creator<Text style={styles.brandAccent}>DNA</Text>
          </Text>
        </View>

        <View style={styles.greetRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>
              {greeting()}, {username ?? 'Creator'} ✨
            </Text>
            <Text style={styles.greetSub}>
              {dashboard
                ? 'Here’s how your account is performing.'
                : loading
                  ? 'Loading your account…'
                  : profile
                    ? 'Your Instagram is connected — your stats will appear here.'
                    : 'Connect Instagram to see how you’re performing.'}
            </Text>
            {/* Which account this screen belongs to, and how fresh it is —
                with several accounts on one device, the header has to say
                whose numbers are being shown right now. */}
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: connected ? c.green : c.red },
                ]}
              />
              <Text style={styles.statusText}>
                {connected
                  ? `Instagram connected${username ? ` · @${username}` : ''}`
                  : 'Instagram not connected'}
              </Text>
              <Text style={styles.syncText}>· {syncText}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                unreadNotifications > 0
                  ? `Notifications, ${unreadNotifications} unread`
                  : 'Notifications'
              }
              hitSlop={8}
              onPress={onOpenNotifications}
              style={({ pressed }) => [styles.bell, pressed && { opacity: 0.7 }]}
            >
              <BellIcon size={20} color={c.onDark} />
              {unreadBadgeLabel(unreadNotifications) ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadBadgeLabel(unreadNotifications)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch account"
              hitSlop={8}
              onPress={onSwitchAccount}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Avatar
                uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
                name={username}
                size={48}
                dark={isDark}
              />
            </Pressable>
          </View>
        </View>

        {error && !dashboard ? (
          <Card tone={tone} style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {sessionExpired
                ? 'Your Instagram session expired'
                : 'We couldn’t load your data'}
            </Text>
            <Text style={styles.errorBody}>
              {sessionExpired
                ? 'Reconnect your account to refresh your dashboard.'
                : 'Please check your connection and try again.'}
            </Text>
            <GradientButton
              label={sessionExpired ? 'Reconnect Instagram' : 'Retry'}
              onPress={sessionExpired ? onReconnect : onRetry}
              style={{ marginTop: 14 }}
            />
          </Card>
        ) : null}

        {!dashboard && !loading && !error ? (
          <Card tone={tone} style={styles.errorCard}>
            <Text style={styles.errorTitle}>No Instagram connected yet</Text>
            <Text style={styles.errorBody}>
              Link your account to see real views, engagement, and your Creator DNA score.
            </Text>
            <GradientButton label="Connect Instagram" onPress={onConnect} style={{ marginTop: 14 }} />
          </Card>
        ) : null}

        {/* Loading: skeletons in the shape of the real cards. Never a grid of
            zeroes, and never a blank gap where analytics belong. */}
        {loading && !dashboard ? (
          <View style={styles.skelStack} accessibilityLabel="Loading your analytics">
            <Skeleton height={112} radius={18} />
            <View style={styles.statsRow}>
              <Skeleton height={74} radius={14} style={{ flex: 1 }} />
              <Skeleton height={74} radius={14} style={{ flex: 1 }} />
              <Skeleton height={74} radius={14} style={{ flex: 1 }} />
            </View>
            <View style={styles.statsRow}>
              <Skeleton height={74} radius={14} style={{ flex: 1 }} />
              <Skeleton height={74} radius={14} style={{ flex: 1 }} />
              <Skeleton height={74} radius={14} style={{ flex: 1 }} />
            </View>
            <Skeleton height={206} radius={18} />
            <Skeleton height={168} radius={18} />
            <Text style={styles.skelCaption}>Loading your analytics…</Text>
          </View>
        ) : null}

        {dashboard ? (
          <>
            <Card tone={tone} style={styles.growthCard}>
              <View style={styles.growthLeft}>
                <Text style={styles.growthLabel}>Overall Growth</Text>
                <Text
                  style={[
                    styles.growthValue,
                    { color: growth ? (growth.up ? c.green : c.red) : c.onDarkSub },
                  ]}
                >
                  {growth ? `${growth.up ? '↑' : '↓'} ${Math.abs(growth.pct)}%` : '—'}
                </Text>
                <Text style={styles.growthCaption}>
                  {growth
                    ? 'views vs. the previous 30 days'
                    : stats
                      ? 'Not enough data yet'
                      : 'Connect to measure growth'}
                </Text>
              </View>
              <View style={styles.growthRight}>
                <ScoreRing value={dnaValue} size={92} tone={tone} />
                <Text style={styles.ringLabel}>Creator DNA</Text>
              </View>
            </Card>

            {tileRows.length > 0 ? (
              tileRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.statsRow}>
                  {row.map((tile) => (
                    <StatTile key={tile.label} label={tile.label} value={tile.value} tone={tone} />
                  ))}
                </View>
              ))
            ) : (
              <Text style={styles.notEnough}>
                Not enough data yet — share posts as a professional account and these metrics
                will appear here.
              </Text>
            )}

            <Card tone={tone} style={styles.weekCard}>
              {/* The headline week is on Home; the full breakdown lives one tap away. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the full weekly report"
                onPress={onOpenReport}
                style={({ pressed }) => [styles.weekHead, pressed && { opacity: 0.65 }]}
              >
                <Text style={styles.weekTitle}>This Week</Text>
                <Text style={styles.weekRange}>Full report ›</Text>
              </Pressable>
              {weekRow('Views', week && week.views !== null ? formatCount(week.views) : null, {
                delta: week?.viewsDelta ?? null,
              })}
              {weekRow(
                'Interactions',
                week && week.interactions !== null ? formatCount(week.interactions) : null,
                { sub: 'likes + comments', delta: week?.interactionsDelta ?? null },
              )}
              {weekRow(
                'Best-performing post',
                week?.bestPost ? week.bestPost.title : null,
                { sub: week?.bestPost && week.bestPost.likes !== null ? `${formatCount(week.bestPost.likes)} likes` : undefined },
              )}
              {weekRow(
                'Strongest format',
                week?.strongestFormat ? humanizeMediaType(week.strongestFormat) : null,
                { sub: 'by likes on your recent posts' },
              )}
              {weekRow(
                'Posting consistency',
                week && week.postsThisWeek !== null
                  ? `${week.postsThisWeek} post${week.postsThisWeek === 1 ? '' : 's'} this week`
                  : null,
                { sub: 'published in the last 7 days' },
              )}
            </Card>

            {insight || nextIdea || bestTime ? (
              <Card tone={tone} style={styles.recCard}>
                <View style={styles.recHead}>
                  <View style={styles.recIcon}>
                    <SparkIcon size={16} color={c.onDark} />
                  </View>
                  <Text style={styles.recTitle}>Today’s Recommendation</Text>
                  <Badge label="AI" tone="purple" />
                </View>
                <Text style={styles.recInsight}>
                  {insight ??
                    'Connect your account and analyze a post — CreatorDNA will build your recommendation from real results.'}
                </Text>
                {nextIdea ? (
                  <View style={styles.recIdea}>
                    <Text style={styles.recIdeaLabel}>Recommended next post</Text>
                    <Text style={styles.recIdeaTitle}>{nextIdea.title}</Text>
                    <Text style={styles.recIdeaMeta}>
                      {nextIdea.format}
                      {bestTime ? ` · Best time ${bestTime}` : ''}
                    </Text>
                  </View>
                ) : bestTime ? (
                  <View style={styles.recIdea}>
                    <Text style={styles.recIdeaLabel}>Best posting window</Text>
                    <Text style={styles.recIdeaMeta}>{bestTime}</Text>
                  </View>
                ) : null}
                <GradientButton
                  label={nextIdea ? 'Create This Post' : 'Generate ideas'}
                  onPress={onCreatePost}
                />
                <Text style={styles.recFoot}>
                  AI recommendation built from your own analytics and saved ideas — an estimate,
                  not a guaranteed result.
                </Text>
              </Card>
            ) : null}

            <Card tone={tone} style={styles.insightCard}>
              <View style={styles.insightHead}>
                <View style={styles.insightIcon}>
                  <SparkIcon size={16} color={c.amber} />
                </View>
                <Text style={styles.insightTitle}>Quick Insights</Text>
              </View>
              <Text style={styles.insightBody}>
                {insight ??
                  'Analyze your content and connect Instagram — your personalized insights will appear here.'}
              </Text>
            </Card>

            <GradientButton label="View Full Analysis" onPress={onViewDna} />
          </>
        ) : null}

        {/* Nothing loaded, nothing wrong: analytics stay hidden instead of
            rendering an empty shell of placeholders. */}
        {!dashboard && !loading ? (
          <>
            {insight ? (
              <Card tone={tone} style={styles.insightCard}>
                <View style={styles.insightHead}>
                  <View style={styles.insightIcon}>
                    <SparkIcon size={16} color={c.amber} />
                  </View>
                  <Text style={styles.insightTitle}>Quick Insights</Text>
                </View>
                <Text style={styles.insightBody}>{insight}</Text>
              </Card>
            ) : null}
            {records.length > 0 ? (
              <GradientButton label="View Full Analysis" onPress={onViewDna} />
            ) : null}
          </>
        ) : null}

        {loading && dashboard ? (
          <View style={styles.refreshing}>
            <ActivityIndicator size="small" color={c.onDarkSub} />
            <Text style={styles.refreshingText}>Refreshing your data…</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
