import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import {
  ClockIcon,
  GridIcon,
  HashIcon,
  QuoteIcon,
  TimerIcon,
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
import {
  dnaScore,
  dnaStrengths,
  dnaWeaknesses,
  formatCount,
  whatWorksRows,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

const TABS = ['Overview', 'Strengths', 'Weaknesses'];

const rowIcons = {
  hash: HashIcon,
  quote: QuoteIcon,
  timer: TimerIcon,
  grid: GridIcon,
  clock: ClockIcon,
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
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const followers = dashboard?.profile.followersCount ?? null;
  const accountType = dashboard?.profile.accountType ?? profile?.accountType ?? null;
  const score = dnaScore(records);
  const rows = whatWorksRows(records, dashboard);
  const strengths = dnaStrengths(records);
  const weaknesses = dnaWeaknesses(records);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <DnaMark size={38} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>
              Creator<Text style={styles.brandAccent}>DNA</Text>
            </Text>
            <Text style={styles.brandSub}>Your unique content fingerprint</Text>
          </View>
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

        <GradientButton label="View Detailed Report" onPress={onViewReport} style={{ marginTop: 4 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: FAB_CLEARANCE,
    gap: 14,
  },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { ...type.h3, color: colors.text, fontSize: 22 },
  brandAccent: { color: colors.primary },
  brandSub: { ...type.small, color: colors.textSub, marginTop: 2 },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { ...type.h4, color: colors.text, fontSize: 18 },
  profileMeta: { ...type.small, color: colors.textSub, marginTop: 3 },
  scoreWrap: { alignItems: 'center', gap: 6 },
  scoreLabel: { ...type.tiny, color: colors.textSub, textTransform: 'uppercase' },

  sectionTitle: { ...type.h4, color: colors.text, marginBottom: 4 },
  rows: { marginTop: 8 },
  workRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 52 },
  workIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workLabel: { ...type.bodyBold, color: colors.text, fontSize: 14.5, width: 118 },
  workValue: {
    ...type.small,
    color: colors.textSub,
    flex: 1,
    textAlign: 'right',
    fontSize: 13.5,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lightBorder },

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
  insightTitle: { ...type.body, color: colors.text, fontSize: 14.5, fontWeight: '600' },
  insightDetail: { ...type.small, color: colors.textSub, marginTop: 2, fontSize: 12.5 },
});
