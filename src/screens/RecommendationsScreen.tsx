import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon, WarningIcon } from '../components/icons';
import { Badge, Card, EmptyState, GradientButton, PillTabs, ScreenHeader } from '../components/ui';
import { futureTips } from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

const TABS = ['For This Video', 'For Future Content'];

export function RecommendationsScreen({
  record,
  records,
  onBack,
}: {
  record: AnalysisRecord | null;
  records: AnalysisRecord[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState(TABS[0]);
  const [copied, setCopied] = useState(false);
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);

  const mainIssue = record?.analysis.main_issue ?? null;
  const edit = record?.analysis.suggested_edit ?? null;
  const opportunities = record?.analysis.improvement_opportunities ?? [];
  const tips = futureTips(records);

  const copySuggestion = async () => {
    const text = edit?.improved_opening ?? edit?.current_opening;
    if (!text) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      // Clipboard unavailable — the suggestion is still readable on screen.
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Recommendations"
          subtitle="Here’s how to improve and grow faster."
          onBack={onBack}
        />

        <PillTabs options={TABS} value={tab} onChange={setTab} />

        {tab === 'For This Video' ? (
          record ? (
            <>
              {mainIssue ? (
                <Card style={[styles.issueCard, { backgroundColor: colors.redSoft, borderColor: colors.redSoft }]}>
                  <View style={styles.issueHead}>
                    <WarningIcon size={19} color={colors.red} />
                    <Text style={styles.issueLabel}>Main Issue</Text>
                  </View>
                  <Text style={styles.issueText}>{mainIssue}</Text>
                </Card>
              ) : (
                <Card style={[styles.issueCard, { backgroundColor: colors.greenSoft, borderColor: colors.greenSoft }]}>
                  <View style={styles.issueHead}>
                    <CheckIcon size={18} color={colors.green} />
                    <Text style={[styles.issueLabel, { color: colors.green }]}>No critical issue</Text>
                  </View>
                  <Text style={[styles.issueText, { color: colors.green }]}>
                    The analysis didn’t flag a clear problem in this content — keep the structure that’s already working.
                  </Text>
                </Card>
              )}

              {edit && (edit.current_opening || edit.improved_opening) ? (
                <Card>
                  <Text style={styles.sectionTitle}>Suggested Edit</Text>
                  {edit.current_opening ? (
                    <View style={styles.editBlock}>
                      <Text style={styles.editBlockLabel}>Current opening (first 2 seconds)</Text>
                      <Text style={styles.editCurrent}>“{edit.current_opening}”</Text>
                    </View>
                  ) : null}
                  <View style={styles.editArrowRow}>
                    <Text style={styles.editArrow}>↓</Text>
                  </View>
                  <View style={[styles.editBlock, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.editBlockLabel, { color: colors.primary }]}>
                      Try this instead
                    </Text>
                    <Text style={styles.editImproved}>
                      {edit.improved_opening ? `“${edit.improved_opening}”` : ''}
                    </Text>
                  </View>
                  <GradientButton
                    label={copied ? 'Copied ✓' : 'Copy suggestion'}
                    onPress={() => void copySuggestion()}
                    style={{ marginTop: 14 }}
                  />
                </Card>
              ) : null}

              <Card>
                <Text style={styles.sectionTitle}>Specific Fixes</Text>
                {opportunities.length === 0 ? (
                  <EmptyState
                    glyph="✓"
                    title="No specific fixes needed"
                    hint="This analysis didn’t list concrete edits — the notes on the analysis screen still apply."
                  />
                ) : (
                  <View style={styles.fixRows}>
                    {opportunities.map((opportunity, index) => (
                      <View key={`${opportunity}-${index}`} style={styles.fixRow}>
                        <View style={styles.fixBullet}>
                          <Text style={styles.fixBulletIndex}>{index + 1}</Text>
                        </View>
                        <Text style={styles.fixText}>{opportunity}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </>
          ) : (
            <EmptyState
              glyph="◎"
              title="No analysis selected"
              hint="Open one of your analyses first — its improvement plan will appear here."
            />
          )
        ) : (
          <Card>
            <Text style={styles.sectionTitle}>Across your content</Text>
            {tips.length === 0 ? (
              <EmptyState
                glyph="◎"
                title="Not enough data yet"
                hint="Analyze a few posts and cross-content recommendations will appear here."
              />
            ) : (
              <>
                {/* Evidence first: every row states how much of the user's own
                    history backs it, so nothing reads as a generic tip. */}
                <Text style={styles.sectionHint}>
                  Each recommendation shows how many of your analyses back it.
                </Text>
                <View style={styles.fixRows}>
                  {tips.map((tip, index) => (
                    <View key={`${tip.title}-${index}`} style={styles.fixRow}>
                      <View style={[styles.fixBullet, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.fixBulletIndex, { color: colors.primary }]}>
                          {index + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fixText}>{tip.title}</Text>
                        {tip.detail ? <Text style={styles.fixDetail}>{tip.detail}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={styles.futureNote}>
              <Badge label={`${records.length} analysis${records.length === 1 ? '' : 'es'}`} tone="purple" />
              <Text style={styles.futureNoteText}>
                Based only on your own analyzed content.
              </Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

// Built per palette through useStyles: a module-scope StyleSheet bakes in the
// palette that existed at import time, so the Appearance toggle never reaches it.
const makeStyles = (c: typeof colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.white },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: FAB_CLEARANCE,
    gap: 14,
  },

  sectionTitle: { ...type.h4, color: c.text, marginBottom: 10 },
  sectionHint: {
    ...type.small,
    color: c.textSub,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: -4,
    marginBottom: 4,
  },

  issueCard: { borderWidth: 1 },
  issueHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  issueLabel: { ...type.tiny, color: c.red, textTransform: 'uppercase' },
  issueText: { ...type.small, color: c.red, marginTop: 8, lineHeight: 19.5, fontSize: 14 },

  editBlock: {
    backgroundColor: c.lightCard,
    borderRadius: radius.sm + 2,
    padding: 13,
  },
  editBlockLabel: {
    ...type.tiny,
    color: c.textSub,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  editCurrent: { ...type.body, color: c.textSub, fontStyle: 'italic' },
  editImproved: { ...type.body, color: c.primaryDeep, fontWeight: '600' },
  editArrowRow: { alignItems: 'center', paddingVertical: 4 },
  editArrow: { fontSize: 16, color: c.textDim, fontWeight: '800' },

  fixRows: { gap: 4 },
  fixRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 8,
  },
  fixBullet: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: c.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  fixBulletIndex: { fontSize: 12, fontWeight: '800', color: c.red },
  fixText: { ...type.small, color: c.text, flex: 1, lineHeight: 19, fontSize: 14 },
  fixDetail: { ...type.small, color: c.textSub, marginTop: 3, fontSize: 12.5, lineHeight: 17 },

  futureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.lightBorder,
  },
  futureNoteText: { ...type.small, color: c.textDim, fontSize: 12, flex: 1 },
});
