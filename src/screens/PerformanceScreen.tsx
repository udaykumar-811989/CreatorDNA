import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from '../components/LineChart';
import { EmptyState, PillTabs, ScreenHeader, StatTile } from '../components/ui';
import {
  chartPoints,
  formatCount,
  growthDelta,
  periodTotals,
  topicsBreakdown,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

const METRICS = ['Overview', 'Reach', 'Engagement'];
const PERIODS = [7, 30, 90] as const;

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

  const totals = periodTotals(dashboard, days);
  const previous = days === 30 ? dashboard?.stats.previous ?? null : null;
  const viewsDelta = previous ? growthDelta(totals.views, previous.views) : null;
  const likesDelta = previous ? growthDelta(totals.likes, previous.likes) : null;
  const commentsDelta = previous ? growthDelta(totals.comments, previous.comments) : null;

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

  if (!dashboard) {
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
                {period} days
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
        {days === 30 ? (
          <Text style={styles.deltaNote}>↑ deltas compare with your previous 30 days</Text>
        ) : null}

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
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
    borderColor: colors.lightBorder,
    color: colors.textSub,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
  periodPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
  },

  statsRow: { flexDirection: 'row', gap: 10 },
  deltaNote: { ...type.small, color: colors.textDim, fontSize: 11.5, marginTop: -6 },

  chartCard: {
    backgroundColor: colors.lightCard,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: radius.md + 2,
    padding: 16,
    gap: 8,
  },
  chartTitle: { ...type.h4, color: colors.text, fontSize: 16 },
  reachValue: { ...type.stat, color: colors.text, fontSize: 26 },
  reachSub: { ...type.small, color: colors.textSub, fontSize: 12.5, fontWeight: '600' },
  chartNote: { ...type.small, color: colors.textDim, fontSize: 11.5, textAlign: 'center' },

  topicRows: { gap: 12, marginTop: 4 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topicLabel: { ...type.small, color: colors.text, fontWeight: '700', width: 108 },
  topicTrack: {
    flex: 1,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.lightCard2,
    overflow: 'hidden',
  },
  topicFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  topicShare: { ...type.small, color: colors.textSub, fontWeight: '800', width: 36, textAlign: 'right' },
});
