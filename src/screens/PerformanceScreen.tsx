import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from '../components/LineChart';
import { EmptyState, PillTabs, ScreenHeader, StatTile } from '../components/ui';
import {
  chartPoints,
  engagementRate,
  formatCount,
  formatPercent,
  growthDelta,
  periodTotals,
  previousPeriodTotals,
  topicsBreakdown,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useStyles } from '../themeContext';

const METRICS = ['Overview', 'Reach', 'Engagement'];
// 365 is labelled "1 year"; Instagram only retains 90 days of insights, so
// the longer window sums whatever history exists and says so in the UI.
const PERIODS = [7, 30, 90, 365] as const;

export function PerformanceScreen({
  dashboard,
  records,
  onBack,
}: {
  dashboard: InstagramDashboard | null;
  records: AnalysisRecord[];
  onBack: () => void;
}) {
  const [metric, setMetric] = useState(METRICS[0]);
  const [days, setDays] = useState<number>(30);
  const styles = useStyles(makeStyles);

  const totals = periodTotals(dashboard, days);
  // 30 days compares against the server's real previous-30-day window; the
  // other periods compare against the daily series' preceding window so
  // every filter gets real deltas when the history exists.
  const previous =
    days === 30
      ? dashboard?.stats.previous ?? null
      : previousPeriodTotals(dashboard, days);
  const viewsDelta = previous ? growthDelta(totals.views, previous.views) : null;
  const likesDelta = previous ? growthDelta(totals.likes, previous.likes) : null;
  const commentsDelta = previous ? growthDelta(totals.comments, previous.comments) : null;
  const hasDeltas = viewsDelta !== null || likesDelta !== null || commentsDelta !== null;

  const chartMetric =
    metric === 'Reach' ? 'reach' : metric === 'Engagement' ? 'engagement' : 'views';
  const points = chartPoints(dashboard, days, chartMetric);
  const chartTitle =
    metric === 'Reach'
      ? 'Reach'
      : metric === 'Engagement'
        ? 'Likes + Comments'
        : 'Views';

  const topics = topicsBreakdown(records);
  const stats = dashboard?.stats ?? null;
  const reach =
    metric === 'Reach' && stats?.reach !== null && stats?.reach !== undefined
      ? stats.reach
      : null;

  if (!dashboard || !stats) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title="Performance" onBack={onBack} />
          <EmptyState
            glyph="◎"
            title="No Instagram data yet"
            hint="Connect Instagram to see your real views, likes, comments, and daily trends here."
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Performance" onBack={onBack} />

        <PillTabs options={METRICS} value={metric} onChange={setMetric} />

        <View style={styles.periodRow}>
          {PERIODS.map((period) => {
            const active = period === days;
            return (
              <Text
                key={period}
                onPress={() => setDays(period)}
                accessibilityRole="button"
                style={[styles.periodPill, active && styles.periodPillActive]}
              >
                {period === 365 ? '1 year' : `${period} days`}
              </Text>
            );
          })}
        </View>

        <View style={styles.statsRow}>
          <StatTile
            label="Total Views"
            value={formatCount(totals.views)}
            delta={viewsDelta}
          />
          <StatTile label="Likes" value={formatCount(totals.likes)} delta={likesDelta} />
          <StatTile
            label="Comments"
            value={formatCount(totals.comments)}
            delta={commentsDelta}
          />
        </View>
        {hasDeltas ? (
          <Text style={styles.deltaNote}>
            ↑ deltas compare with your previous {days === 365 ? 'year' : `${days} days`}
          </Text>
        ) : null}
        {days === 365 ? (
          <Text style={styles.deltaNote}>
            Instagram keeps up to ~90 days of insights — the 1-year view covers everything available.
          </Text>
        ) : null}

        {/* Professional dashboard — real account-level insights */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Account Insights</Text>
          <View style={styles.statsRow}>
            <StatTile label="Followers" value={formatCount(stats.followers)} />
            <StatTile label="Reach" value={formatCount(stats.reach)} />
            <StatTile label="Eng. Rate" value={formatPercent(engagementRate(stats))} />
          </View>
          <View style={styles.statsRow}>
            <StatTile label="Shares" value={formatCount(stats.shares)} />
            <StatTile label="Saves" value={formatCount(stats.saves)} />
            <StatTile label="Profile Visits" value={formatCount(stats.profileViews)} />
          </View>
          <Text style={styles.chartNote}>Real Instagram insights · last 30 days</Text>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>{chartTitle}</Text>
          {reach !== null ? (
            <Text style={styles.reachValue}>
              {formatCount(reach)} <Text style={styles.reachSub}>total reach (30 days)</Text>
            </Text>
          ) : null}
          {points.length > 1 ? (
            <LineChart data={points} formatValue={(value) => formatCount(value)} />
          ) : (
            <EmptyState
              glyph="↗"
              title={
                metric === 'Reach'
                  ? 'Daily reach isn’t shared by Instagram'
                  : 'Daily breakdown unavailable'
              }
              hint={
                metric === 'Reach'
                  ? 'Instagram reports reach only as a 30-day total for this account — your real number is shown above.'
                  : 'Instagram isn’t sharing day-by-day insights for this account yet. The totals above are still your real numbers.'
              }
            />
          )}
          <Text style={styles.chartNote}>
            Real insights from Instagram • last {days} days
          </Text>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Your Top Topics</Text>
          {topics === null ? (
            <EmptyState
              glyph="#"
              title="No topics analyzed yet"
              hint="Analyze your content and the topics in your posts will be ranked here."
            />
          ) : (
            <View style={styles.topicRows}>
              {topics.map((topic, index) => (
                <View key={topic.topic} style={styles.topicRow}>
                  <Text style={styles.topicLabel} numberOfLines={1}>
                    {topic.topic}
                  </Text>
                  <View style={styles.topicTrack}>
                    <View
                      style={[
                        styles.topicFill,
                        {
                          width: `${Math.max(4, Math.min(100, topic.share))}%`,
                          opacity: 1 - index * 0.14,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.topicShare}>{topic.share}%</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.chartNote}>Based on the topics in your analyzed content</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// Built per palette through useStyles: a module-scope StyleSheet bakes in the
// palette that existed at import time, so the Appearance toggle never reaches it.
const makeStyles = (c: typeof colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.white },
    content: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: FAB_CLEARANCE,
      gap: 14,
    },

    periodRow: { flexDirection: 'row', gap: 8 },
    periodPill: {
      flex: 1,
      textAlign: 'center',
      paddingVertical: 9,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.lightBorder,
      color: c.textSub,
      fontSize: 13,
      fontWeight: '700',
      overflow: 'hidden',
    },
    periodPillActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
      color: c.primary,
    },

    statsRow: { flexDirection: 'row', gap: 10 },
    deltaNote: { ...type.small, color: c.textDim, fontSize: 11.5, marginTop: -6 },

    chartCard: {
      backgroundColor: c.lightCard,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.md + 2,
      padding: 16,
      gap: 8,
    },
    chartTitle: { ...type.h4, color: c.text, fontSize: 16 },
    reachValue: { ...type.stat, color: c.text, fontSize: 26 },
    reachSub: { ...type.small, color: c.textSub, fontSize: 12.5, fontWeight: '600' },
    chartNote: { ...type.small, color: c.textDim, fontSize: 11.5, textAlign: 'center' },

    topicRows: { gap: 12, marginTop: 4 },
    topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    topicLabel: { ...type.small, color: c.text, fontWeight: '700', width: 108 },
    topicTrack: {
      flex: 1,
      height: 9,
      borderRadius: 5,
      backgroundColor: c.lightCard2,
      overflow: 'hidden',
    },
    topicFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },
    topicShare: { ...type.small, color: c.textSub, fontWeight: '800', width: 36, textAlign: 'right' },
  });
