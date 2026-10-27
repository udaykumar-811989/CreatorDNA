import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { ScoreRing } from '../components/ScoreRing';
import { Avatar, Badge, Card, EmptyState, GradientButton, ScreenHeader } from '../components/ui';
import {
  averageDailyViews,
  creatorType,
  dnaScore,
  engagementRate,
  formatCount,
  formatPercent,
  humanizeMediaType,
  relativeTime,
  topFormatByLikes,
  topPostingWindow,
  topTopicOf,
} from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

// A media kit is the one screen someone outside the app reads, so it is built
// only from figures Instagram actually shared with this account. Every
// CreatorDNA-derived field (Creator Type, DNA score) says so in the copy —
// nothing here claims a number the API never sent, and a missing metric is
// left out rather than printed as a zero.

function lineOf(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null;
}

export function MediaKitScreen({
  profile,
  dashboard,
  records,
  lastSyncedAt,
  onBack,
  onConnect,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  records: AnalysisRecord[];
  lastSyncedAt: string | null;
  onBack: () => void;
  onConnect: () => void;
}) {
  const theme = useThemeColors();
  const styles = useStyles(makeStyles);
  const [copied, setCopied] = useState(false);

  const stats = dashboard?.stats ?? null;
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const rawType = dashboard?.profile.accountType ?? profile?.accountType ?? null;
  // Instagram returns 'Media_Creator'; a person reading a media kit should
  // see the words they'd actually use.
  const accountLabel =
    rawType === 'Media_Creator' ? 'Creator account' : rawType === 'Business' ? 'Business account' : 'Instagram account';
  const rate = engagementRate(stats);
  const avgViews = averageDailyViews(dashboard);
  const totalPosts = dashboard?.profile.mediaCount ?? null;
  const score = dnaScore(records);
  const creator = creatorType(records);
  const format = topFormatByLikes(dashboard);
  const window = topPostingWindow(dashboard);
  const topic = topTopicOf(records);
  const followers = stats?.followers ?? dashboard?.profile.followersCount ?? null;

  const bestPost = (dashboard?.media ?? [])
    .filter((item) => item.likes !== null)
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))[0] ?? null;

  const knownFor: Array<{ label: string; value: string | null }> = [
    { label: 'Creator type', value: creator?.label ?? null },
    { label: 'Strongest format', value: format ? humanizeMediaType(format) : null },
    { label: 'Best posting window', value: window },
    { label: 'Top topics', value: topic },
  ];

  const headlineRows: Array<{ label: string; value: string | null }> = [
    { label: 'Followers', value: followers !== null ? formatCount(followers) : null },
    { label: 'Engagement rate', value: rate !== null ? formatPercent(rate) : null },
    { label: 'Views (30 days)', value: stats?.views != null ? formatCount(stats.views) : null },
    { label: 'Avg. daily views', value: avgViews !== null ? formatCount(avgViews) : null },
    { label: 'Posts', value: totalPosts !== null ? String(totalPosts) : null },
  ];

  const asText = () => {
    const lines: string[] = [
      `CREATORDNA MEDIA KIT — ${username ? `@${username}` : 'your account'}`,
      '',
      'The numbers',
      ...headlineRows
        .map((row) => lineOf(row.label, row.value))
        .filter((line): line is string => line !== null),
      '',
      'What this account is known for',
      ...knownFor
        .map((row) => lineOf(row.label, row.value))
        .filter((line): line is string => line !== null),
    ];
    if (score !== null) {
      lines.push('', `Creator DNA score: ${score}/100`);
    }
    if (bestPost) {
      lines.push(
        '',
        'Best performing content',
        `${bestPost.caption?.split('\n')[0].trim().slice(0, 80) || `${humanizeMediaType(bestPost.mediaType)} post`} — ${formatCount(bestPost.likes ?? 0)} likes`,
      );
    }
    lines.push(
      '',
      lastSyncedAt
        ? `Instagram figures synced ${relativeTime(lastSyncedAt)}.`
        : 'Instagram figures not synced in this session yet.',
      'Creator type and DNA score are CreatorDNA estimates, not Instagram metrics.',
    );
    return lines.join('\n');
  };

  const copy = async () => {
    try {
      await setStringAsync(asText());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const row = (label: string, value: string | null, note?: string) => (
    <View key={label} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.rowValue, value === null && styles.rowMuted]}>
        {value ?? 'Not available'}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Media kit"
          subtitle="The snapshot a brand or collaborator would ask for"
          onBack={onBack}
        />

        {!dashboard && !profile ? (
          <Card>
            <EmptyState
              glyph="◎"
              title="No account connected"
              hint="Connect Instagram and your media kit fills itself from your real analytics."
              actionLabel="Connect Instagram"
              onAction={onConnect}
            />
          </Card>
        ) : (
          <>
            <Card style={styles.identity}>
              <Avatar
                uri={dashboard?.profile.profilePictureUrl ?? profile?.profilePictureUrl ?? null}
                name={username}
                size={62}
                dark={false}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.handle}>{username ? `@${username}` : 'Your account'}</Text>
                <Text style={styles.subHandle}>{accountLabel}</Text>
              </View>
              <View style={styles.scoreWrap}>
                <ScoreRing value={score} size={76} tone="light" />
                <Text style={styles.rowNote}>DNA score</Text>
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>The numbers</Text>
              <View style={styles.rows}>
                {headlineRows.map((item) => row(item.label, item.value))}
              </View>
              <Text style={styles.honesty}>
                {stats
                  ? 'Straight from your connected Instagram account — nothing here is estimated.'
                  : 'Instagram has not shared these figures for this account, so they are left blank.'}
              </Text>
            </Card>

            <Card>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>What you are known for</Text>
                <Badge label="CreatorDNA estimate" tone="purple" />
              </View>
              <View style={styles.rows}>
                {knownFor.map((item) => row(item.label, item.value))}
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Best performing content</Text>
              {bestPost ? (
                <View style={styles.bestPost}>
                  <Text style={styles.bestTitle} numberOfLines={3}>
                    {bestPost.caption?.split('\n')[0].trim().slice(0, 90) ||
                      `${humanizeMediaType(bestPost.mediaType)} post`}
                  </Text>
                  <Text style={styles.rowNote}>
                    {formatCount(bestPost.likes ?? 0)} likes ·{' '}
                    {formatCount(bestPost.comments ?? 0)} comments ·{' '}
                    {humanizeMediaType(bestPost.mediaType)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.honesty}>
                  Instagram returned no recent posts with likes for this account yet.
                </Text>
              )}
            </Card>

            <Text style={styles.honesty}>
              {lastSyncedAt
                ? `Instagram figures synced ${relativeTime(lastSyncedAt)}.`
                : 'Figures have not been synced in this session yet.'}{' '}
              Creator type and DNA score are CreatorDNA estimates, not Instagram metrics.
            </Text>

            <GradientButton
              label={copied ? 'Copied ✓' : 'Copy media kit'}
              onPress={() => void copy()}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Built from the active palette through useStyles so the sheet follows the
// theme toggle; `c` is the palette inside the factory.
const makeStyles = (c: typeof colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.white },
    content: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: FAB_CLEARANCE,
      gap: 14,
    },

    identity: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    handle: { ...type.h4, color: c.text, fontSize: 19, letterSpacing: -0.3 },
    subHandle: { ...type.small, color: c.textSub, marginTop: 3, fontSize: 13 },
    scoreWrap: { alignItems: 'center', gap: 4 },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexWrap: 'wrap',
    },
    sectionTitle: { ...type.h4, color: c.text },
    rows: { marginTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.lightBorder,
    },
    rowLabel: { ...type.bodyBold, color: c.text, fontSize: 14 },
    rowNote: { ...type.tiny, color: c.textDim, marginTop: 2 },
    rowValue: { ...type.bodyBold, color: c.text, fontSize: 14.5, textAlign: 'right' },
    rowMuted: { ...type.small, color: c.textDim, fontSize: 13, fontWeight: '600' },

    bestPost: {
      marginTop: 8,
      gap: 5,
      backgroundColor: c.lightCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.lightBorder,
      padding: 13,
    },
    bestTitle: { ...type.body, color: c.text, fontWeight: '600', lineHeight: 19 },

    honesty: { ...type.tiny, color: c.textDim, lineHeight: 16, marginTop: 8 },
  });
