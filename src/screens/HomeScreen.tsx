import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { ScoreRing } from '../components/ScoreRing';
import { SparkIcon } from '../components/icons';
import { Avatar, Card, GradientButton, StatTile } from '../components/ui';
import {
  averageDailyViews,
  dnaScore,
  engagementRate,
  formatCount,
  formatPercent,
  growthDelta,
  greeting,
  quickInsight,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, type } from '../theme';

export function HomeScreen({
  profile,
  dashboard,
  loading,
  error,
  records,
  ideaCount,
  onRetry,
  onReconnect,
  onConnect,
  onViewDna,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  loading: boolean;
  error: 'reconnect_required' | 'try_again' | null;
  records: AnalysisRecord[];
  ideaCount: number;
  onRetry: () => void;
  onReconnect: () => void;
  onConnect: () => void;
  onViewDna: () => void;
}) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);

  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const stats = dashboard?.stats ?? null;
  const viewsDelta = stats ? growthDelta(stats.views, stats.previous?.views ?? null) : null;
  const dnaValue = dnaScore(records);
  const insight = quickInsight(dashboard, records, ideaCount);
  const totalPosts = dashboard?.profile.mediaCount ?? null;
  const avgViews = averageDailyViews(dashboard);
  const rate = engagementRate(stats);

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
        // Same lockup as the onboarding page: DNA mark beside the wordmark.
        brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
        brand: { color: c.onDark, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
        brandAccent: { color: isDark ? '#BC8CFF' : c.primary },
        greet: { ...type.h3, color: c.onDark, fontSize: 22, letterSpacing: -0.4 },
        greetSub: { ...type.small, color: c.onDarkSub, marginTop: 5, fontSize: 13.5 },

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

        insightCard: { backgroundColor: c.insightCard },
        insightHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
        insightIcon: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: isDark ? 'rgba(255, 214, 107, 0.14)' : c.amberSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        insightTitle: { ...type.bodyBold, color: c.onDark, fontSize: 15.5 },
        insightBody: { ...type.small, color: c.onDarkSub, marginTop: 10, lineHeight: 19, fontSize: 14 },

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
                  : 'Connect Instagram to see how you’re performing.'}
            </Text>
          </View>
          <Avatar
            uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
            name={username}
            size={48}
            dark={isDark}
          />
        </View>

        {error && !dashboard ? (
          <Card tone={tone} style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {error === 'reconnect_required'
                ? 'Your Instagram session expired'
                : 'We couldn’t load your data'}
            </Text>
            <Text style={styles.errorBody}>
              {error === 'reconnect_required'
                ? 'Reconnect your account to refresh your dashboard.'
                : 'Please check your connection and try again.'}
            </Text>
            <GradientButton
              label={error === 'reconnect_required' ? 'Reconnect Instagram' : 'Retry'}
              onPress={error === 'reconnect_required' ? onReconnect : onRetry}
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

        <Card tone={tone} style={styles.growthCard}>
          <View style={styles.growthLeft}>
            <Text style={styles.growthLabel}>Overall Growth</Text>
            <Text style={[styles.growthValue, { color: viewsDelta ? (viewsDelta.up ? c.green : c.red) : c.onDarkSub }]}>
              {loading && !stats
                ? '···'
                : viewsDelta
                  ? `${viewsDelta.up ? '↑' : '↓'} ${Math.abs(viewsDelta.pct)}%`
                  : stats
                    ? '—'
                    : '—'}
            </Text>
            <Text style={styles.growthCaption}>
              {viewsDelta ? 'vs. last 30 days' : stats ? '30-day views unavailable' : 'Connect to measure growth'}
            </Text>
          </View>
          <View style={styles.growthRight}>
            <ScoreRing value={dnaValue} size={92} tone={tone} />
            <Text style={styles.ringLabel}>Creator DNA</Text>
          </View>
        </Card>

        <View style={styles.statsRow}>
          <StatTile label="Total Posts" value={totalPosts === null ? '—' : String(totalPosts)} tone={tone} />
          <StatTile label="Avg. Daily Views" value={formatCount(avgViews)} tone={tone} />
          <StatTile label="Engagement Rate" value={formatPercent(rate)} tone={tone} />
        </View>

        <Card tone={tone} style={styles.insightCard}>
          <View style={styles.insightHead}>
            <View style={styles.insightIcon}>
              <SparkIcon size={16} color={isDark ? '#FFD66B' : c.amber} />
            </View>
            <Text style={styles.insightTitle}>Quick Insights</Text>
          </View>
          <Text style={styles.insightBody}>
            {insight ??
              'Analyze your content and connect Instagram — your personalized insights will appear here.'}
          </Text>
        </Card>

        <GradientButton label="View Full Analysis" onPress={onViewDna} />

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
