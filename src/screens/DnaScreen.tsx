import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ChartIcon,
  CheckIcon,
  ClockIcon,
  GridIcon,
  HashIcon,
  QuoteIcon,
  TimerIcon,
  WarningIcon,
} from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  GradientButton,
  OutlineButton,
  PillTabs,
} from '../components/ui';
import { DnaRadar } from '../components/DnaRadar';
import {
  biggestOpportunity,
  creatorType,
  dnaNeeds,
  dnaScore,
  dnaStrengths,
  dnaWeaknesses,
  formatCount,
  nextMove,
  radarAxes,
  whatWorksRows,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

const TABS = ['Overview', 'Strengths', 'Weaknesses'];

const rowIcons = {
  hash: HashIcon,
  quote: QuoteIcon,
  timer: TimerIcon,
  grid: GridIcon,
  clock: ClockIcon,
  check: CheckIcon,
  warning: WarningIcon,
  chart: ChartIcon,
};

export function DnaScreen({
  profile,
  dashboard,
  records,
  onViewReport,
  onAnalyze,
  onConnect,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  records: AnalysisRecord[];
  onViewReport: () => void;
  onAnalyze: () => void;
  onConnect: () => void;
}) {
  const [tab, setTab] = useState('Overview');
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const followers = dashboard?.profile.followersCount ?? null;
  const accountType = dashboard?.profile.accountType ?? profile?.accountType ?? null;
  const score = dnaScore(records);
  const rows = whatWorksRows(records, dashboard);
  const strengths = dnaStrengths(records);
  const weaknesses = dnaWeaknesses(records);
  const axes = radarAxes(records);
  const creator = creatorType(records);
  const move = nextMove(records, dashboard);
  const opportunity = biggestOpportunity(records, dashboard);
  const needs = dnaNeeds(records, dashboard);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.brand}>DNA</Text>
          <Text style={styles.brandSub}>Your unique content fingerprint</Text>
        </View>

        <Card style={styles.profileCard}>
          <Avatar
            uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
            name={username}
            size={54}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {username ?? 'Creator'}
            </Text>
            <Text style={styles.profileMeta} numberOfLines={1}>
              {username ? `@${username}` : 'Not connected'}
              {followers !== null ? ` • ${formatCount(followers)} followers` : ''}
            </Text>
            {accountType ? (
              <View style={{ marginTop: 6 }}>
                <Badge
                  label={accountType === 'Media_Creator' ? 'Creator account' : 'Business account'}
                  tone="purple"
                />
              </View>
            ) : null}
          </View>
          <View style={styles.scoreWrap}>
            <ScoreRing value={score} size={78} stroke={8} />
            <Text style={styles.scoreLabel}>DNA Score</Text>
          </View>
        </Card>

        <PillTabs options={TABS} value={tab} onChange={setTab} />

        {records.length === 0 ? (
          <Card style={{ marginTop: 4 }}>
            <EmptyState
              glyph="◎"
              title="No Creator DNA yet"
              hint="Analyze your content and your DNA score, strengths, and working patterns will appear here."
              actionLabel="Analyze content"
              onAction={onAnalyze}
            />
            {!profile ? (
              <OutlineButton
                label="Connect Instagram"
                onPress={onConnect}
                tone="light"
                style={{ marginTop: 4 }}
              />
            ) : null}
          </Card>
        ) : tab === 'Overview' ? (
          <>
            {/* Who this creator is, in one label — read from their own
                analyzed material, never assigned by the model. */}
            {creator ? (
              <Card style={styles.typeCard}>
                <Text style={styles.eyebrow}>Creator type</Text>
                <Text style={styles.typeLabel}>{creator.label}</Text>
                <Text style={styles.typeBasis}>{creator.basis}</Text>
              </Card>
            ) : null}

            {axes.length >= 3 ? (
              <Card style={{ marginTop: 4 }}>
                <Text style={styles.sectionTitle}>Your DNA Profile</Text>
                <View style={styles.radarWrap}>
                  <DnaRadar axes={axes} />
                </View>
                <Text style={styles.radarCaption}>
                  Averages from {records.length} analyzed post{records.length === 1 ? '' : 's'},
                  scored 0–10 by CreatorDNA.
                </Text>
              </Card>
            ) : null}

            {/* One recommendation, not a list: the weakest dimension with the
                evidence behind it, plus the single biggest opening. */}
            {move ? (
              <Card style={styles.moveCard}>
                <View style={styles.moveHead}>
                  <Text style={styles.eyebrow}>Your Next Move</Text>
                  <Badge label="AI" tone="purple" />
                </View>
                <Text style={styles.moveTitle}>{move.title}</Text>
                <Text style={styles.moveDetail}>{move.detail}</Text>
                {opportunity ? (
                  <>
                    <Text style={[styles.eyebrow, { marginTop: 6 }]}>Biggest opportunity</Text>
                    <Text style={styles.moveDetail}>{opportunity}</Text>
                  </>
                ) : null}
              </Card>
            ) : null}

            <Card style={{ marginTop: 4 }}>
              <Text style={styles.sectionTitle}>What Works For You</Text>
              {rows.length === 0 ? (
                <EmptyState
                  glyph="◎"
                  title="Not enough data yet"
                  hint="Analyze more content to reveal your best topics, hooks, and formats."
                  actionLabel="Analyze content"
                  onAction={onAnalyze}
                />
              ) : (
                <View style={styles.rows}>
                  {rows.map((row, index) => {
                    const Icon = rowIcons[row.icon];
                    return (
                      <View key={row.key}>
                        <View style={styles.workRow}>
                          <View style={styles.workIcon}>
                            <Icon size={17} color={colors.primary} />
                          </View>
                          <Text style={styles.workLabel}>{row.label}</Text>
                          <Text style={styles.workValue} numberOfLines={2}>
                            {row.value}
                          </Text>
                        </View>
                        {index < rows.length - 1 ? <View style={styles.divider} /> : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>

            {/* Exactly what is still missing and how to unlock it — an
                incomplete profile explains itself instead of going blank. */}
            {needs.length > 0 ? (
              <Card style={styles.needsCard}>
                <Text style={styles.sectionTitle}>To complete your DNA</Text>
                <View style={styles.rows}>
                  {needs.map((need, index) => (
                    <View key={need}>
                      <View style={styles.needRow}>
                        <View style={styles.needDot} />
                        <Text style={styles.needText}>{need}</Text>
                      </View>
                      {index < needs.length - 1 ? <View style={styles.divider} /> : null}
                    </View>
                  ))}
                </View>
                {!profile ? (
                  <OutlineButton
                    label="Connect Instagram"
                    onPress={onConnect}
                    tone="light"
                    style={{ marginTop: 10 }}
                  />
                ) : null}
              </Card>
            ) : null}
          </>
        ) : tab === 'Strengths' ? (
          <Card style={{ marginTop: 4 }}>
            <Text style={styles.sectionTitle}>Your Strengths</Text>
            {strengths.length === 0 ? (
              <EmptyState
                glyph="✓"
                title="No strengths detected yet"
                hint="Strengths appear once your content has been analyzed."
                actionLabel="Analyze content"
                onAction={onAnalyze}
              />
            ) : (
              <View style={styles.rows}>
                {strengths.map((item, index) => (
                  <View key={`${item.title}-${index}`}>
                    <View style={styles.insightRow}>
                      <View style={[styles.bullet, { backgroundColor: colors.greenSoft }]}>
                        <Text style={[styles.bulletGlyph, { color: colors.green }]}>↑</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insightTitle}>{item.title}</Text>
                        {item.detail ? <Text style={styles.insightDetail}>{item.detail}</Text> : null}
                      </View>
                    </View>
                    {index < strengths.length - 1 ? <View style={styles.divider} /> : null}
                  </View>
                ))}
              </View>
            )}
          </Card>
        ) : (
          <Card style={{ marginTop: 4 }}>
            <Text style={styles.sectionTitle}>Areas To Improve</Text>
            {weaknesses.length === 0 ? (
              <EmptyState
                glyph="◎"
                title="Nothing flagged yet"
                hint="Improvement areas appear once your content has been analyzed."
                actionLabel="Analyze content"
                onAction={onAnalyze}
              />
            ) : (
              <View style={styles.rows}>
                {weaknesses.map((item, index) => (
                  <View key={`${item.title}-${index}`}>
                    <View style={styles.insightRow}>
                      <View style={[styles.bullet, { backgroundColor: colors.amberSoft }]}>
                        <Text style={[styles.bulletGlyph, { color: colors.amber }]}>!</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insightTitle}>{item.title}</Text>
                        {item.detail ? <Text style={styles.insightDetail}>{item.detail}</Text> : null}
                      </View>
                    </View>
                    {index < weaknesses.length - 1 ? <View style={styles.divider} /> : null}
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Always available: analyze more content, or open the full report. */}
        <View style={styles.bottomActions}>
          <GradientButton label="Analyze new content" onPress={onAnalyze} />
          <OutlineButton label="View Detailed Report" onPress={onViewReport} tone="light" />
        </View>
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
    paddingTop: 10,
    paddingBottom: FAB_CLEARANCE,
    gap: 14,
  },

  brand: { ...type.h2, color: c.text, fontSize: 25 },
  brandSub: { ...type.small, color: c.textSub, marginTop: 2 },
  bottomActions: { marginTop: 4, gap: 10 },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { ...type.h4, color: c.text, fontSize: 18 },
  profileMeta: { ...type.small, color: c.textSub, marginTop: 3 },
  scoreWrap: { alignItems: 'center', gap: 6 },
  scoreLabel: { ...type.tiny, color: c.textSub, textTransform: 'uppercase' },

  eyebrow: {
    ...type.tiny,
    color: c.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  typeCard: { gap: 6 },
  typeLabel: { ...type.h3, color: c.text, fontSize: 23, letterSpacing: -0.4 },
  typeBasis: { ...type.small, color: c.textSub, fontSize: 12.5, lineHeight: 17 },

  radarWrap: { alignItems: 'center', paddingVertical: 6 },
  radarCaption: { ...type.tiny, color: c.textDim, textAlign: 'center', lineHeight: 16 },

  moveCard: { backgroundColor: c.primarySoft, borderColor: c.lightBorder, gap: 8 },
  moveHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  moveTitle: { ...type.h4, color: c.text, fontSize: 18, letterSpacing: -0.3 },
  moveDetail: { ...type.small, color: c.textSub, lineHeight: 19, fontSize: 13.5 },

  needsCard: { gap: 4 },
  needRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  needDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.amber, marginTop: 6 },
  needText: { ...type.small, color: c.textSub, fontSize: 13.5, lineHeight: 18 },

  sectionTitle: { ...type.h4, color: c.text, marginBottom: 4 },
  rows: { marginTop: 8 },
  workRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 52 },
  workIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workLabel: { ...type.bodyBold, color: c.text, fontSize: 14.5, width: 118 },
  workValue: {
    ...type.small,
    color: c.textSub,
    flex: 1,
    textAlign: 'right',
    fontSize: 13.5,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.lightBorder },

  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  bullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletGlyph: { fontSize: 14, fontWeight: '800' },
  insightTitle: { ...type.body, color: c.text, fontSize: 14.5, fontWeight: '600' },
  insightDetail: { ...type.small, color: c.textSub, marginTop: 2, fontSize: 12.5 },
});
