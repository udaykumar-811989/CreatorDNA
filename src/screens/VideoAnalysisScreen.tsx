import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinkOutIcon, PlayIcon } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import { Badge, Card, EmptyState, GradientButton, ScreenHeader } from '../components/ui';
import {
  SCORE_LABELS,
  formatDateShort,
  formatCount,
  humanizeFormat,
  metricsLabel,
  praiseForScore,
  scoreOf,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

export function VideoAnalysisScreen({
  record,
  reanalyzing = false,
  reanalyzeError = null,
  onBack,
  onRecommendations,
  onReanalyze,
}: {
  record: AnalysisRecord | null;
  reanalyzing?: boolean;
  reanalyzeError?: string | null;
  onBack: () => void;
  onRecommendations: () => void;
  onReanalyze: () => void;
}) {
  if (!record) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title="Video Analysis" onBack={onBack} />
          <EmptyState
            glyph="◎"
            title="No analysis selected"
            hint="Pick one of your analyzed posts to view its scores."
            actionLabel="Back"
            onAction={onBack}
          />
        </ScrollView>
      </View>
    );
  }

  const scores = record.analysis.scores;
  const overall = scoreOf(record);
  const praise = praiseForScore(record);
  const metrics = metricsLabel(record.metrics);
  const hasInput = Boolean(record.transcript || record.caption);
  const date = formatDateShort(record.createdAt);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Video Analysis" onBack={onBack} />

        {reanalyzing ? (
          <View style={styles.progressCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.progressText}>
              Re-analyzing this content for fresh scores…
            </Text>
          </View>
        ) : null}
        {reanalyzeError && !reanalyzing ? (
          <Text accessibilityRole="alert" style={styles.progressError}>
            {reanalyzeError}
          </Text>
        ) : null}

        {/* Media card */}
        <View style={styles.mediaCard}>
          {record.thumbnailUrl ? (
            <Pressable
              accessibilityRole={record.permalink ? 'link' : 'imagebutton'}
              disabled={!record.permalink}
              onPress={() => {
                if (record.permalink) void Linking.openURL(record.permalink);
              }}
              style={styles.mediaThumb}
            >
              <Image source={{ uri: record.thumbnailUrl }} style={styles.mediaImage} />
              <View style={styles.playBadge}>
                <PlayIcon size={22} color="rgba(255,255,255,0.95)" />
              </View>
              {record.analysis.duration_seconds ? (
                <View style={styles.durationChip}>
                  <Text style={styles.durationText}>
                    {record.analysis.duration_seconds}s
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <View style={[styles.mediaThumb, styles.mediaFallback]}>
              <PlayIcon size={30} color="rgba(255,255,255,0.9)" />
              {record.analysis.duration_seconds ? (
                <View style={styles.durationChip}>
                  <Text style={styles.durationText}>
                    {record.analysis.duration_seconds}s
                  </Text>
                </View>
              ) : null}
            </View>
          )}
          <View style={styles.mediaBody}>
            <Text style={styles.mediaTitle} numberOfLines={3}>
              {record.title}
            </Text>
            <Text style={styles.mediaMeta} numberOfLines={2}>
              {humanizeFormat(record.analysis.format)}
              {date ? ` • ${date}` : ''}
            </Text>
            {metrics ? (
              <Text style={styles.mediaMeta} numberOfLines={1}>
                {metrics}
              </Text>
            ) : null}
            {record.permalink ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(record.permalink as string)}
                style={({ pressed }) => [styles.openLink, pressed && { opacity: 0.6 }]}
              >
                <LinkOutIcon size={13} color={colors.primary} />
                <Text style={styles.openLinkText}>Open on Instagram</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Performance score */}
        <Card style={styles.scoreCard}>
          {overall !== null ? (
            <>
              <View style={styles.scoreRingWrap}>
                <ScoreRing value={overall} size={104} stroke={10} />
                <Text style={styles.scoreLabel}>Performance Score</Text>
              </View>
              <View style={styles.scoreTextWrap}>
                <Text style={styles.scoreHeadline}>
                  {overall >= 8
                    ? 'Great performance!'
                    : overall >= 6.5
                      ? 'Solid content!'
                      : 'Room to grow!'}
                </Text>
                <Text style={styles.scorePraise}>{praise}</Text>
              </View>
            </>
          ) : (
            <EmptyState
              glyph="◎"
              title="Scores not available"
              hint="This analysis ran before craft scoring was added. Re-analyze it to get hook, retention, engagement, quality, and CTA scores."
              actionLabel={hasInput ? 'Re-analyze' : undefined}
              onAction={hasInput ? onReanalyze : undefined}
            />
          )}
        </Card>

        {/* Detailed scores */}
        {scores ? (
          <Card>
            <Text style={styles.sectionTitle}>Detailed Scores</Text>
            <View style={styles.scoreRows}>
              {SCORE_LABELS.map(({ key, label }) => {
                const value = scores[key];
                const assessed = typeof value === 'number' && Number.isFinite(value);
                return (
                  <View key={key} style={styles.scoreRow}>
                    <Text style={styles.scoreRowLabel}>{label}</Text>
                    <View style={styles.scoreBarTrack}>
                      <View
                        style={[
                          styles.scoreBarFill,
                          {
                            width: assessed ? `${Math.max(2, Math.min(100, (value / 10) * 100))}%` : '0%',
                            backgroundColor:
                              assessed && value >= 8
                                ? colors.green
                                : assessed && value >= 6
                                  ? colors.primary
                                  : colors.amber,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.scoreRowValue, !assessed && { color: colors.textDim }]}>
                      {assessed ? (Math.round(value * 10) / 10).toFixed(1) : 'N/A'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* Summary highlights */}
        <Card>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Badge label="Strength" tone="green" />
            <Text style={styles.summaryText} numberOfLines={3}>
              {record.analysis.strengths[0] ?? 'No specific strength noted in this analysis.'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Badge label="Improve" tone="amber" />
            <Text style={styles.summaryText} numberOfLines={3}>
              {record.analysis.improvement_opportunities[0] ??
                'No specific improvement flagged in this analysis.'}
            </Text>
          </View>
        </Card>

        <GradientButton label="See Improvement Suggestions" onPress={onRecommendations} />
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

  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 14,
  },
  progressText: { ...type.small, color: colors.primaryDeep, flex: 1, lineHeight: 18 },
  progressError: {
    ...type.small,
    color: colors.red,
    backgroundColor: colors.redSoft,
    borderRadius: radius.sm,
    padding: 12,
    lineHeight: 18,
  },

  mediaCard: {
    flexDirection: 'row',
    gap: 13,
    backgroundColor: colors.lightCard,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: radius.md + 2,
    padding: 13,
  },
  mediaThumb: {
    width: 110,
    height: 110,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.lightCard2,
  },
  mediaImage: { width: '100%', height: '100%' },
  mediaFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  playBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -21,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(20,18,40,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChip: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(20,18,40,0.78)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { fontSize: 10.5, fontWeight: '800', color: '#FFF' },
  mediaBody: { flex: 1, minWidth: 0, gap: 4, justifyContent: 'center' },
  mediaTitle: { ...type.bodyBold, color: colors.text, fontSize: 15.5, lineHeight: 20 },
  mediaMeta: { ...type.small, color: colors.textSub, fontSize: 12.5 },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  openLinkText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },

  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreRingWrap: { alignItems: 'center', gap: 9 },
  scoreLabel: { ...type.tiny, color: colors.textSub, textTransform: 'uppercase' },
  scoreTextWrap: { flex: 1 },
  scoreHeadline: { ...type.h4, color: colors.text, fontSize: 18 },
  scorePraise: { ...type.small, color: colors.textSub, marginTop: 6, lineHeight: 19 },

  sectionTitle: { ...type.h4, color: colors.text, marginBottom: 10 },
  scoreRows: { gap: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreRowLabel: { ...type.small, color: colors.text, fontWeight: '700', width: 116 },
  scoreBarTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.lightCard2,
    overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 4 },
  scoreRowValue: { ...type.small, color: colors.text, fontWeight: '800', width: 30, textAlign: 'right' },

  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  summaryText: { ...type.small, color: colors.textSub, flex: 1, lineHeight: 18.5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lightBorder, marginVertical: 12 },
});
