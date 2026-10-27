import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Card,
  EmptyState,
  GradientButton,
  ScreenHeader,
} from '../components/ui';
import {
  biggestOpportunity,
  deltaText,
  formatCount,
  humanizeMediaType,
  nextMove,
  topFormatByLikes,
  topPostingWindow,
  topTopicOf,
  weekSummary,
  type Delta,
  type WeekSummary,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

// The weekly report answers the same three questions as the rest of the app,
// over a seven-day window: how did this week go, what worked, and what
// exactly to change next week. Every figure is the account's own data
// compared against the seven days before it — where Instagram shares no
// history (followers), the report says so instead of inventing a change.

function buildActions(
  week: WeekSummary | null,
  records: AnalysisRecord[],
  dashboard: InstagramDashboard | null,
): string[] {
  const actions: string[] = [];
  const move = nextMove(records, dashboard);
  if (move) {
    actions.push(`${move.title} — it is your weakest scored dimension right now.`);
  }

  const format = topFormatByLikes(dashboard);
  if (format) {
    actions.push(
      `Make your next post a ${humanizeMediaType(format)} — that is your strongest format by likes.`,
    );
  }

  const time = topPostingWindow(dashboard);
  if (time) {
    actions.push(`Schedule your next post around ${time}, when your best posts went out.`);
  }

  if (week && week.postsThisWeek !== null) {
    if (week.postsThisWeek === 0) {
      actions.push('You published nothing this week — put one post on the calendar today.');
    } else if (week.postsThisWeek < 3) {
      actions.push(
        `You published ${week.postsThisWeek} post${week.postsThisWeek === 1 ? '' : 's'} this week — try ${week.postsThisWeek + 1} next week.`,
      );
    } else {
      actions.push(
        `Keep the cadence: ${week.postsThisWeek} posts this week is a rhythm worth holding.`,
      );
    }
  }

  if (week?.viewsDelta) {
    actions.push(
      week.viewsDelta.up
        ? `Views rose ${week.viewsDelta.pct}% on the week before — repeat what you posted.`
        : `Views fell ${Math.abs(week.viewsDelta.pct)}% on the week before — change the hook first.`,
    );
  }

  return actions.slice(0, 5);
}

export function WeeklyReportScreen({
  profile,
  dashboard,
  records,
  onBack,
  onAnalyze,
  onConnect,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  records: AnalysisRecord[];
  onBack: () => void;
  onAnalyze: () => void;
  onConnect: () => void;
}) {
  const styles = useStyles(makeStyles);
  const theme = useThemeColors();
  const week = weekSummary(dashboard);
  const bestWindow = topPostingWindow(dashboard);
  const topic = topTopicOf(records);
  const opportunity = biggestOpportunity(records, dashboard);
  const actions = buildActions(week, records, dashboard);

  const stat = (
    label: string,
    value: string | null,
    options: { delta?: Delta; note?: string } = {},
  ) => (
    <View key={label} style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, value === null && styles.statValueMuted]}>
        {value ?? 'Not enough data yet'}
      </Text>
      {options.delta ? (
        <Text style={[styles.statDelta, { color: options.delta.up ? theme.green : theme.red }]}>
          {deltaText(options.delta)}
        </Text>
      ) : options.note ? (
        <Text style={styles.statDelta}>{options.note}</Text>
      ) : null}
    </View>
  );

  const workedRow = (label: string, value: string | null, note?: string) => (
    <View key={label} style={styles.workedRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.workedLabel}>{label}</Text>
        {note ? <Text style={styles.workedNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.workedValue, value === null && styles.statValueMuted]}>
        {value ?? 'Not enough data yet'}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Weekly report"
          subtitle="Your last 7 days, compared with the 7 before"
          onBack={onBack}
        />

        {!dashboard ? (
          <Card>
            <EmptyState
              glyph="◎"
              title="No analytics yet"
              hint="Connect Instagram and publish content to start building your weekly report."
              actionLabel={profile ? 'Analyze content' : 'Connect Instagram'}
              onAction={profile ? onAnalyze : onConnect}
            />
          </Card>
        ) : (
          <>
            <Card style={styles.hero}>
              <Text style={styles.eyebrow}>This week</Text>
              <View style={styles.statGrid}>
                {stat(
                  'Views',
                  week && week.views !== null ? formatCount(week.views) : null,
                  { delta: week?.viewsDelta ?? null },
                )}
                {stat(
                  'Interactions',
                  week && week.interactions !== null ? formatCount(week.interactions) : null,
                  { delta: week?.interactionsDelta ?? null },
                )}
                {stat(
                  'Posts published',
                  week && week.postsThisWeek !== null ? String(week.postsThisWeek) : null,
                )}
                {stat(
                  'Followers',
                  dashboard.profile.followersCount !== null
                    ? formatCount(dashboard.profile.followersCount)
                    : null,
                  { note: 'current total' },
                )}
              </View>
              <Text style={styles.honesty}>
                Instagram does not share follower history, so no follower change is shown here.
                Every other figure compares this week with the week before it.
              </Text>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>What worked</Text>
              <View style={styles.rows}>
                {workedRow(
                  'Best-performing post',
                  week?.bestPost ? week.bestPost.title : null,
                  week?.bestPost && week.bestPost.likes !== null
                    ? `${formatCount(week.bestPost.likes)} likes`
                    : undefined,
                )}
                {workedRow(
                  'Strongest format',
                  week?.strongestFormat ? humanizeMediaType(week.strongestFormat) : null,
                )}
                {workedRow('Top content', topic)}
                {workedRow('Best posting window', bestWindow)}
              </View>
            </Card>

            <Card style={styles.moveCard}>
              <Text style={styles.eyebrow}>Biggest opportunity</Text>
              <Text style={styles.moveText}>
                {opportunity ?? 'Analyze more content — there is not enough history to name one yet.'}
              </Text>
            </Card>

            <Card>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Your strategy for next week</Text>
                <Badge label="From your data" tone="purple" />
              </View>
              {actions.length === 0 ? (
                <EmptyState
                  glyph="◎"
                  title="Not enough history"
                  hint="We need more content performance data before we can plan your week."
                  actionLabel="Analyze content"
                  onAction={onAnalyze}
                />
              ) : (
                <View style={styles.rows}>
                  {actions.map((action, index) => (
                    <View key={action} style={styles.actionRow}>
                      <View style={styles.actionIndex}>
                        <Text style={styles.actionIndexText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.actionText}>{action}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.honesty}>
                Suggestions are recommendations built from your own analytics, not predictions of
                what a post will earn.
              </Text>
            </Card>

            <GradientButton label="Analyze new content" onPress={onAnalyze} />
          </>
        )}
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
      paddingTop: 10,
      paddingBottom: FAB_CLEARANCE,
      gap: 14,
    },

    hero: { gap: 14 },
    eyebrow: {
      ...type.tiny,
      color: c.textSub,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
    stat: { width: '48%', flexGrow: 1 },
    statLabel: { ...type.tiny, color: c.textSub, textTransform: 'uppercase' },
    statValue: { ...type.h4, color: c.text, fontSize: 21, marginTop: 4, letterSpacing: -0.4 },
    statValueMuted: { ...type.small, color: c.textDim, fontSize: 13, fontWeight: '600' },
    statDelta: { ...type.tiny, color: c.textDim, marginTop: 3, fontWeight: '700' },

    honesty: { ...type.tiny, color: c.textDim, lineHeight: 16 },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sectionTitle: { ...type.h4, color: c.text },
    rows: { marginTop: 10, gap: 2 },
    workedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.lightBorder,
    },
    workedLabel: { ...type.bodyBold, color: c.text, fontSize: 14 },
    workedNote: { ...type.tiny, color: c.textDim, marginTop: 2 },
    workedValue: {
      ...type.small,
      color: c.textSub,
      fontSize: 13.5,
      textAlign: 'right',
      maxWidth: '55%',
    },

    moveCard: { backgroundColor: c.primarySoft, borderColor: c.lightBorder, gap: 8 },
    moveText: { ...type.small, color: c.text, fontSize: 14, lineHeight: 20 },

    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 9 },
    actionIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    actionIndexText: { fontSize: 11.5, fontWeight: '800', color: c.primary },
    actionText: { ...type.small, color: c.text, flex: 1, fontSize: 13.5, lineHeight: 19 },
  });
