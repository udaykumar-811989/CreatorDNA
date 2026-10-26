import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinkOutIcon, PlayIcon } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import {
  Badge,
  Card,
  EmptyState,
  GradientButton,
  ScreenHeader,
  type BadgeTone,
} from '../components/ui';
import {
  SCORE_LABELS,
  formatDateShort,
  formatCount,
  humanizeFormat,
  humanizeHookType,
  metricsLabel,
  praiseForScore,
  scoreOf,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { ContentAnalysis } from '../services/creatorAi';
import { useStyles, useThemeColors } from '../themeContext';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

// Confidence is a fixed four-value vocabulary from the API. The tone ladder
// mirrors the score bars so a weak evidence base reads as a warning before the
// reader even parses the label.
const CONFIDENCE: Record<ContentAnalysis['confidence'], { label: string; tone: BadgeTone }> = {
  insufficient: { label: 'Insufficient evidence', tone: 'red' },
  early: { label: 'Early read', tone: 'amber' },
  moderate: { label: 'Moderate confidence', tone: 'blue' },
  strong: { label: 'Strong confidence', tone: 'green' },
};

// The API contract allows empty strings and empty arrays in every analysis
// field, so sections below are built from trimmed, non-empty values only.
// Nothing on this screen pads a missing field with placeholder copy unless the
// card explicitly renders an honest empty state.
const labelValueRows = (
  pairs: Array<[string, string | null]>,
): Array<{ label: string; value: string }> =>
  pairs
    .map(([label, value]) => ({ label, value: (value ?? '').trim() }))
    .filter((row) => row.value.length > 0);

const cleanList = (items: string[]): string[] =>
  items.map((item) => item.trim()).filter((item) => item.length > 0);

// Evidence sources arrive as lowercase enum values; title-case them for the
// badge rather than growing the shared humanisers for a single field.
const evidenceSourceLabel = (source: string): string => {
  const label = source.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const evidenceSourceTone = (source: string) =>
  source === 'transcript' ? 'blue' : source === 'caption' ? 'purple' : 'gray';

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
  // Palette + styles come from the active theme; hooks run before the empty
  // state below so the rules of hooks hold on both render paths.
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);

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

  // Every analysis field may be null or an empty string, so each section below
  // gets a trimmed copy plus a render guard — the screen only grows a card
  // when the analysis actually returned something to read.
  const {
    hook,
    topics,
    structure,
    transcript_analysis: transcriptAnalysis,
    cta,
    pacing,
    evidence,
    limitations,
    confidence,
  } = record.analysis;
  const summaryText = record.analysis.summary.trim();
  const hookText = hook.text?.trim() ?? '';
  const hookType = hook.type.trim();
  // An unassessed hook with no hook line would only repeat the format row in
  // the media card, so the hook card needs at least one of the two.
  const showHook =
    hookText.length > 0 || (hookType.length > 0 && hookType !== 'not_assessable');
  const primaryTopic = topics.primary?.trim() ?? '';
  const secondaryTopics = cleanList(topics.secondary);
  const structureRows = labelValueRows([
    ['Setup', structure.setup],
    ['Value', structure.value],
    ['Payoff', structure.payoff],
    ['CTA', structure.cta],
  ]);
  const transcriptRows = labelValueRows([
    ['Clarity', transcriptAnalysis.clarity],
    ['Specificity', transcriptAnalysis.specificity],
    ['Information density', transcriptAnalysis.information_density],
    ['Repetition', transcriptAnalysis.repetition],
  ]);
  const confusingSections = cleanList(transcriptAnalysis.confusing_sections);
  const pacingNotes = cleanList(pacing.observations);
  const evidenceQuotes = evidence.filter((item) => item.quote.trim().length > 0);
  const limitationNotes = cleanList(limitations);
  const ctaType = cta.type?.trim() ?? '';
  // cta.type is a short enum like "follow"; humanizeFormat already falls back
  // to de-underscasing unknown values, so capitalise its answer for display.
  const ctaTypeLabel = ctaType
    ? humanizeFormat(ctaType).replace(/^./, (char) => char.toUpperCase())
    : '';
  const ctaText = cta.text?.trim() ?? '';
  const confidenceInfo = CONFIDENCE[confidence];

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

        {/* The AI's own headline paragraph about this content — shown before the
            scores so the report opens with what was found, not just a number. */}
        {summaryText ? (
          <Card>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.overviewText}>{summaryText}</Text>
          </Card>
        ) : null}

        {/* Performance score — the ring + copy layout only applies when a
            score exists; the empty state needs a normal column card so its
            text wraps inside the card instead of running off the screen. */}
        <Card style={overall !== null ? styles.scoreCard : undefined}>
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

        {/* Hook line + hook type */}
        {showHook ? (
          <Card>
            <Text style={styles.sectionTitle}>Hook</Text>
            {hookType ? (
              <View style={styles.hookTypeRow}>
                <Badge label={humanizeHookType(hookType)} tone="purple" />
              </View>
            ) : null}
            {hookText ? (
              <Text style={styles.hookQuote}>“{hookText}”</Text>
            ) : (
              <Text style={styles.hintText}>
                No hook line was captured for this content — only the hook type
                was assessed.
              </Text>
            )}
          </Card>
        ) : null}

        {/* Topics the analysis pulled out of the content itself */}
        {primaryTopic || secondaryTopics.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Topics</Text>
            {primaryTopic ? (
              <View style={styles.summaryRow}>
                <Badge label="Primary" tone="purple" />
                <Text style={styles.summaryText}>{primaryTopic}</Text>
              </View>
            ) : null}
            {primaryTopic && secondaryTopics.length > 0 ? (
              <View style={styles.divider} />
            ) : null}
            {secondaryTopics.length > 0 ? (
              <View style={styles.summaryRow}>
                <Badge label="Secondary" tone="gray" />
                <Text style={styles.summaryText}>{secondaryTopics.join(' • ')}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Structure breakdown — only the beats the analysis actually wrote */}
        {structureRows.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Structure</Text>
            <View style={styles.detailRows}>
              {structureRows.map((row) => (
                <View key={row.label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{row.label}</Text>
                  <Text style={styles.detailValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* CTA presence is a finding either way, so this card shows the wording
            when one was captured and an honest "not detected" state when the
            analysis found none — it never invents a call to action. */}
        <Card>
          <Text style={styles.sectionTitle}>Call to Action</Text>
          <View style={styles.summaryRow}>
            <Badge
              label={cta.present ? 'Present' : 'Not detected'}
              tone={cta.present ? 'green' : 'amber'}
            />
            <Text style={styles.summaryText}>
              {ctaText
                ? `“${ctaText}”`
                : cta.present
                  ? 'A call to action was found, but its wording was not captured.'
                  : 'This analysis did not find a call to action in the content.'}
            </Text>
          </View>
          {ctaTypeLabel ? (
            <>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Badge label="Type" tone="gray" />
                <Text style={styles.summaryText}>{ctaTypeLabel}</Text>
              </View>
            </>
          ) : null}
        </Card>

        {/* Transcript read — the four text judgements plus the spots the
            analysis called confusing */}
        {transcriptRows.length > 0 || confusingSections.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Transcript Analysis</Text>
            {transcriptRows.length > 0 ? (
              <View style={styles.detailRows}>
                {transcriptRows.map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {confusingSections.length > 0 ? (
              <>
                {transcriptRows.length > 0 ? <View style={styles.divider} /> : null}
                <Text style={styles.subLabel}>Confusing Sections</Text>
                <View style={styles.detailRows}>
                  {confusingSections.map((section, index) => (
                    <View key={`${section}-${index}`} style={styles.bulletRow}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{section}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Pacing is always "not_assessable" in this schema, so only the real
            observations render — never a rating the analysis didn't make. */}
        {pacingNotes.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Pacing Notes</Text>
            <View style={styles.detailRows}>
              {pacingNotes.map((note, index) => (
                <View key={`${note}-${index}`} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{note}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Raw quotes backing the findings, each tagged with where it came from */}
        {evidenceQuotes.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Evidence</Text>
            {evidenceQuotes.map((item, index) => (
              <View key={`${item.quote}-${index}`}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.summaryRow}>
                  <Badge
                    label={evidenceSourceLabel(item.source)}
                    tone={evidenceSourceTone(item.source)}
                  />
                  <Text style={styles.evidenceQuote}>“{item.quote}”</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Confidence is always returned by the API, so this card renders even
            when the analysis listed no limitations to disclose. */}
        <Card>
          <Text style={styles.sectionTitle}>Confidence & Limitations</Text>
          <View style={styles.summaryRow}>
            <Badge label={confidenceInfo.label} tone={confidenceInfo.tone} />
            <Text style={styles.summaryText}>
              Based only on the evidence this analysis could find for your post.
            </Text>
          </View>
          {limitationNotes.length > 0 ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.subLabel}>Limitations</Text>
              <View style={styles.detailRows}>
                {limitationNotes.map((note, index) => (
                  <View key={`${note}-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{note}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </Card>

        <GradientButton label="See Improvement Suggestions" onPress={onRecommendations} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: typeof colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.white },
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
    backgroundColor: c.primarySoft,
    borderRadius: radius.md,
    padding: 14,
  },
  progressText: { ...type.small, color: c.primaryDeep, flex: 1, lineHeight: 18 },
  progressError: {
    ...type.small,
    color: c.red,
    backgroundColor: c.redSoft,
    borderRadius: radius.sm,
    padding: 12,
    lineHeight: 18,
  },

  mediaCard: {
    flexDirection: 'row',
    gap: 13,
    backgroundColor: c.lightCard,
    borderWidth: 1,
    borderColor: c.lightBorder,
    borderRadius: radius.md + 2,
    padding: 13,
  },
  mediaThumb: {
    width: 110,
    height: 110,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: c.lightCard2,
  },
  mediaImage: { width: '100%', height: '100%' },
  mediaFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
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
  mediaTitle: { ...type.bodyBold, color: c.text, fontSize: 15.5, lineHeight: 20 },
  mediaMeta: { ...type.small, color: c.textSub, fontSize: 12.5 },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  openLinkText: { fontSize: 12.5, fontWeight: '700', color: c.primary },

  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreRingWrap: { alignItems: 'center', gap: 9 },
  scoreLabel: { ...type.tiny, color: c.textSub, textTransform: 'uppercase' },
  scoreTextWrap: { flex: 1 },
  scoreHeadline: { ...type.h4, color: c.text, fontSize: 18 },
  scorePraise: { ...type.small, color: c.textSub, marginTop: 6, lineHeight: 19 },

  sectionTitle: { ...type.h4, color: c.text, marginBottom: 10 },
  overviewText: { ...type.small, color: c.textSub, lineHeight: 19.5 },

  hookTypeRow: { marginBottom: 10 },
  hookQuote: { ...type.body, color: c.text, fontStyle: 'italic' },
  hintText: { ...type.small, color: c.textDim, lineHeight: 19 },

  detailRows: { gap: 12 },
  detailRow: { gap: 3 },
  detailLabel: { ...type.tiny, color: c.textSub, textTransform: 'uppercase' },
  detailValue: { ...type.small, color: c.text, lineHeight: 19 },
  subLabel: { ...type.tiny, color: c.textSub, textTransform: 'uppercase', marginBottom: 10 },
  bulletRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  bulletDot: { ...type.small, color: c.primary, lineHeight: 19 },
  bulletText: { ...type.small, color: c.textSub, flex: 1, lineHeight: 19 },
  evidenceQuote: {
    ...type.small,
    color: c.text,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 19,
  },

  scoreRows: { gap: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreRowLabel: { ...type.small, color: c.text, fontWeight: '700', width: 116 },
  scoreBarTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.lightCard2,
    overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 4 },
  scoreRowValue: { ...type.small, color: c.text, fontWeight: '800', width: 30, textAlign: 'right' },

  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  summaryText: { ...type.small, color: c.textSub, flex: 1, lineHeight: 18.5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.lightBorder, marginVertical: 12 },
});
