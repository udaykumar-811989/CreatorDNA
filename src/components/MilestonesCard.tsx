import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MILESTONES,
  MILESTONE_BADGES,
  currentUserIdFromToken,
  milestoneProgress,
  type Achievement,
  type AchievementMilestone,
} from '../lib/community/model';
import * as community from '../services/community';
import { radius, type } from '../theme';
import { useThemeColors, useTheme } from '../themeContext';

// The permanent badge shelf on Profile.
//
// Every rung is shown whether or not it is earned, so progress is legible at
// a glance: earned badges carry their colour and glyph, locked ones sit greyed
// with the number still to reach. Nothing here is optimistic — rows come from
// `creator_achievements`, which only the server can write.

export function MilestonesCard({
  getCreatorToken,
  handle,
  connected,
}: {
  getCreatorToken: () => Promise<string>;
  /** Instagram handle, used only for the "verified" caption. */
  handle: string | null;
  connected: boolean;
}) {
  const c = useThemeColors();
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [followers, setFollowers] = useState<number | null>(null);
  const [measuredAt, setMeasuredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getCreatorToken();
      const me = currentUserIdFromToken(token);
      if (!me) {
        if (alive.current) {
          setLoading(false);
          setError('Sign in again to see your milestones.');
        }
        return;
      }
      const [badges, stats] = await Promise.all([
        community.fetchAchievements(token, me),
        community.fetchFollowerStats(token),
      ]);
      if (!alive.current) return;
      if (!badges.ok) {
        setError(badges.message);
        return;
      }
      setAchievements(badges.data);
      if (stats.ok) {
        setFollowers(stats.data?.followers ?? null);
        setMeasuredAt(stats.data?.measuredAt ?? null);
      }
    } catch {
      if (alive.current) setError('Milestones could not be loaded. Please retry.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [getCreatorToken]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const earned = useMemo(() => {
    const set = new Set<number>(achievements.map((entry) => entry.milestone));
    return set;
  }, [achievements]);

  // The verified reading wins; the highest badge is the floor when the stats
  // row has not been written yet (a badge is still proof of a past reading).
  const shownFollowers = followers ?? (earned.size > 0 ? Math.max(...earned) : null);
  const next = shownFollowers === null ? MILESTONES[0] : MILESTONES.find((m) => m > shownFollowers) ?? null;
  const progress = next && shownFollowers !== null ? milestoneProgress(shownFollowers, next) : 0;

  const s = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: isDark ? c.darkBorder : c.lightBorder,
          backgroundColor: isDark ? c.darkCard : c.white,
          padding: 16,
          gap: 14,
        },
        head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        title: { ...type.h4, color: isDark ? c.onDark : c.text },
        count: { ...type.tiny, color: c.textDim, letterSpacing: 0.5 },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
        badgeCell: {
          width: '31%',
          minWidth: 96,
          alignItems: 'center',
          gap: 5,
          paddingVertical: 10,
          borderRadius: radius.md,
          borderWidth: 1,
        },
        badgeEarned: { borderColor: 'transparent' },
        badgeLocked: {
          borderColor: c.track,
          backgroundColor: isDark ? c.darkCard2 : c.lightCard,
        },
        glyphWrap: {
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
        },
        glyph: { fontSize: 20, color: '#FFFFFF', lineHeight: 24 },
        glyphLocked: { color: c.textDim },
        badgeValue: { ...type.tiny, letterSpacing: 0.4 },
        badgeTitle: { fontSize: 10.5, fontWeight: '600', color: c.textDim, textAlign: 'center' },
        track: {
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: c.track,
          overflow: 'hidden',
        },
        fill: { height: 8, borderRadius: radius.pill, backgroundColor: c.primary },
        progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
        progressLabel: { ...type.tiny, color: c.textDim, letterSpacing: 0.5 },
        progressValue: { ...type.tiny, color: c.text, letterSpacing: 0.5 },
        note: { ...type.small, color: c.textSub, textAlign: 'center', lineHeight: 19 },
        hint: { ...type.small, color: c.textSub, textAlign: 'center', lineHeight: 19 },
        error: { ...type.small, color: c.red, textAlign: 'center', lineHeight: 19 },
        retry: {
          alignSelf: 'center',
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: radius.pill,
          backgroundColor: c.primarySoft,
        },
        retryLabel: { ...type.small, fontWeight: '800', color: c.primary },
        skeleton: { height: 74, borderRadius: radius.md, backgroundColor: c.track },
      }),
    [c, isDark],
  );

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Follower milestones</Text>
        <Text style={s.count}>
          {loading ? 'LOADING' : `${earned.size} / ${MILESTONES.length} EARNED`}
        </Text>
      </View>

      {loading ? (
        <View style={s.skeleton} accessibilityLabel="Loading milestones" />
      ) : error ? (
        <>
          <Text style={s.error}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            style={s.retry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading milestones"
          >
            <Text style={s.retryLabel}>Retry</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={s.grid}>
            {MILESTONES.map((milestone) => {
              const badge = MILESTONE_BADGES[milestone as AchievementMilestone];
              const has = earned.has(milestone);
              return (
                <View
                  key={milestone}
                  style={[s.badgeCell, has ? s.badgeEarned : s.badgeLocked]}
                  accessibilityLabel={
                    has
                      ? `${milestone.toLocaleString('en-US')} follower milestone earned — ${badge.title}`
                      : `${milestone.toLocaleString('en-US')} follower milestone not earned yet`
                  }
                >
                  <View
                    style={[
                      s.glyphWrap,
                      { backgroundColor: has ? badge.tint : isDark ? c.darkCard2 : c.lightCard },
                    ]}
                  >
                    <Text style={[s.glyph, !has && s.glyphLocked]}>{badge.glyph}</Text>
                  </View>
                  <Text style={[s.badgeValue, { color: has ? c.text : c.textDim }]}>
                    {milestone.toLocaleString('en-US')}
                  </Text>
                  <Text style={s.badgeTitle} numberOfLines={1}>
                    {has ? badge.title : 'Locked'}
                  </Text>
                </View>
              );
            })}
          </View>

          {connected ? (
            shownFollowers === null ? (
              <Text style={s.hint}>
                Instagram has not shared a follower count yet. It appears as soon as your account
                reports one — CreatorDNA will not guess it for you.
              </Text>
            ) : next ? (
              <View style={{ gap: 7 }}>
                <View style={s.progressHead}>
                  <Text style={s.progressLabel}>
                    NEXT · {next.toLocaleString('en-US')}
                  </Text>
                  <Text style={s.progressValue}>
                    {(next - shownFollowers).toLocaleString('en-US')} TO GO
                  </Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={s.note}>
                  {shownFollowers.toLocaleString('en-US')} followers
                  {measuredAt
                    ? ` · verified by Instagram on ${new Date(measuredAt).toLocaleDateString(
                        'en-US',
                        { day: 'numeric', month: 'short', year: 'numeric' },
                      )}`
                    : ''}
                  {handle ? ` · @${handle.replace(/^@/, '')}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={s.note}>
                Every milestone is earned. Instagram confirms your count — CreatorDNA never awards a
                badge from an unverified number.
              </Text>
            )
          ) : (
            <Text style={s.hint}>
              Connect Instagram to have your follower count verified and start earning badges.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
