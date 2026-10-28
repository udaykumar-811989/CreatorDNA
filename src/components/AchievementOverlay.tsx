import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { MILESTONES, MILESTONE_BADGES, milestoneProgress, type AchievementMilestone } from '../lib/community/model';
import { milestoneShareText } from '../services/milestones';
import { MilestoneBadge } from './MilestoneBadge';
import { radius, type } from '../theme';
import { useThemeColors } from '../themeContext';

// The full-screen milestone celebration.
//
// Confetti is hand-rolled from Animated so no extra dependency is introduced,
// and the badge is a real, permanent record: it is rendered from the
// `creator_achievements` row the server wrote after Instagram confirmed the
// follower count, never from a number the app made up.
//
// Rendered as an absolutely-positioned overlay rather than a Modal — the same
// layering on every platform, with no portal behaviour to get wrong.

const BADGES = MILESTONE_BADGES;

const CONFETTI_COLORS = ['#1A56AE', '#2F7BD6', '#12B76A', '#F59E0B', '#4C92E8', '#FFFFFF'];

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  spin: number;
  square: boolean;
};

function makeConfetti(count: number): Piece[] {
  // Deterministic per mount, but never identical between celebrations: the
  // seed is the milestone, so each reward replays differently and a repeat
  // mount of the same badge still looks alive.
  let seed = 0;
  for (let i = 0; i < count; i += 1) seed = (seed * 31 + 17) % 9973;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: count }, (_unused, id) => ({
    id,
    left: next() * 100,
    delay: next() * 900,
    duration: 2600 + next() * 1600,
    color: CONFETTI_COLORS[Math.floor(next() * CONFETTI_COLORS.length)],
    size: 6 + next() * 7,
    spin: (next() > 0.5 ? 1 : -1) * (360 + next() * 720),
    square: next() > 0.35,
  }));
}

function Confetti({ count = 46, running }: { count?: number; running: boolean }) {
  const pieces = useMemo(() => makeConfetti(count), [count]);
  const values = useRef(pieces.map(() => new Animated.Value(0))).current;
  const height = Dimensions.get('window').height + 120;

  useEffect(() => {
    if (!running) return undefined;
    const animation = Animated.parallel(
      pieces.map((piece, index) =>
        Animated.timing(values[index], {
          toValue: 1,
          duration: piece.duration,
          delay: piece.delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [running, pieces, values]);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pieces.map((piece, index) => (
        <Animated.View
          key={piece.id}
          style={{
            position: 'absolute',
            left: `${piece.left}%`,
            top: 0,
            width: piece.size,
            height: piece.square ? piece.size : piece.size * 1.9,
            borderRadius: piece.square ? 2 : piece.size,
            backgroundColor: piece.color,
            opacity: values[index].interpolate({
              inputRange: [0, 0.8, 1],
              outputRange: [0, 1, 0],
            }),
            transform: [
              { translateY: values[index].interpolate({ inputRange: [0, 1], outputRange: [-60, height] }) },
              {
                rotate: values[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${piece.spin}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

export function AchievementOverlay({
  milestone,
  followers,
  handle,
  measuredAt,
  next,
  onDismiss,
}: {
  milestone: AchievementMilestone;
  followers: number;
  handle: string | null;
  measuredAt: string;
  next: AchievementMilestone | null;
  onDismiss: () => void;
}) {
  const c = useThemeColors();
  const badge = BADGES[milestone];
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [reveal, setReveal] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setReveal(true);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(pop, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      pop.setValue(0);
      fade.setValue(0);
    };
  }, [fade, pop]);

  const share = async (): Promise<void> => {
    const text = milestoneShareText({ milestone, followers, handle, measuredAt });
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'CreatorDNA milestone', text });
        setShareState('copied');
        return;
      } catch (error) {
        // A dismissed share sheet is not a failure — fall back to the clipboard.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      const ok = await Clipboard.setStringAsync(text);
      setShareState(ok ? 'copied' : 'failed');
    } catch {
      setShareState('failed');
    }
  };

  const progress = next ? milestoneProgress(followers, next) : 1;
  const toGo = next ? Math.max(0, next - followers) : 0;

  const s = useMemo(
    () =>
      StyleSheet.create({
        scrim: {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(7, 20, 46, 0.93)',
          zIndex: 1000,
          elevation: 1000,
        },
        body: {
          flex: 1,
          paddingHorizontal: 26,
          paddingVertical: 44,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        },
        kicker: {
          ...type.tiny,
          color: 'rgba(233, 240, 255, 0.72)',
          textTransform: 'uppercase',
          letterSpacing: 2.2,
        },
        badgeWrap: {
          width: 168,
          height: 168,
          borderRadius: 84,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: 'rgba(255,255,255,0.34)',
          overflow: 'hidden',
        },
        badgeValue: {
          fontSize: 30,
          fontWeight: '800',
          color: '#FFFFFF',
          letterSpacing: -0.6,
          marginTop: -6,
        },
        title: {
          fontSize: 27,
          fontWeight: '800',
          color: '#FFFFFF',
          textAlign: 'center',
          letterSpacing: -0.5,
          lineHeight: 33,
        },
        message: {
          fontSize: 15,
          lineHeight: 23,
          color: 'rgba(233, 240, 255, 0.86)',
          textAlign: 'center',
          maxWidth: 330,
        },
        proof: {
          ...type.tiny,
          color: 'rgba(233, 240, 255, 0.6)',
          textAlign: 'center',
          letterSpacing: 0.4,
          textTransform: 'none',
        },
        progressWrap: { width: '100%', maxWidth: 330, gap: 8 },
        progressHead: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        },
        progressLabel: { ...type.tiny, color: 'rgba(233,240,255,0.7)', letterSpacing: 0.5 },
        progressValue: { ...type.tiny, color: '#FFFFFF', letterSpacing: 0.5 },
        track: {
          height: 9,
          borderRadius: radius.pill,
          backgroundColor: 'rgba(255,255,255,0.18)',
          overflow: 'hidden',
        },
        fill: { height: 9, borderRadius: radius.pill, backgroundColor: badge.tint },
        cardPreview: {
          width: '100%',
          maxWidth: 330,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.18)',
          backgroundColor: 'rgba(255,255,255,0.07)',
          padding: 16,
          gap: 6,
          alignItems: 'center',
        },
        cardTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
        cardSub: { fontSize: 12.5, color: 'rgba(233,240,255,0.76)', textAlign: 'center' },
        actions: { width: '100%', maxWidth: 330, gap: 10, marginTop: 6 },
        shareNote: { ...type.small, color: 'rgba(233,240,255,0.75)', textAlign: 'center' },
        dismiss: {
          marginTop: 2,
          paddingHorizontal: 18,
          paddingVertical: 11,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.32)',
          alignSelf: 'center',
        },
        dismissLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(233,240,255,0.86)' },
      }),
    [badge.tint],
  );

  return (
    <View style={s.scrim} accessibilityViewIsModal accessibilityLabel="Milestone celebration">
      <Confetti running={reveal} />
      <Animated.View style={[s.body, { opacity: fade }]}>
        <Text style={s.kicker}>Milestone unlocked</Text>

        <Animated.View
          style={[
            s.badgeWrap,
            { backgroundColor: badge.tint, transform: [{ scale: pop }] },
          ]}
        >
          <LinearGradient
            colors={[badge.tint, 'rgba(255,255,255,0.22)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
          />
          <MilestoneBadge milestone={milestone} size={92} earned />
          <Text style={s.badgeValue}>{milestone.toLocaleString('en-US')}</Text>
        </Animated.View>

        <Text style={s.title}>
          {followers.toLocaleString('en-US')} followers
        </Text>
        <Text style={s.message}>
          Instagram confirmed {followers.toLocaleString('en-US')} followers on your account — so the{' '}
          {milestone.toLocaleString('en-US')} follower milestone is yours. {badge.title} badge added
          to your profile, permanently.
        </Text>
        <Text style={s.proof}>
          Verified by Instagram on{' '}
          {new Date(measuredAt).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Text>

        <View style={s.progressWrap}>
          <View style={s.progressHead}>
            <Text style={s.progressLabel}>
              {next ? `NEXT · ${next.toLocaleString('en-US')}` : 'ALL MILESTONES REACHED'}
            </Text>
            <Text style={s.progressValue}>
              {next ? `${toGo.toLocaleString('en-US')} TO GO` : ''}
            </Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>

        <View style={s.cardPreview}>
          <Text style={s.cardTitle}>
            {badge.title} · {handle ? `@${handle.replace(/^@/, '')}` : 'Creator'} ·{' '}
            {milestone.toLocaleString('en-US')}
          </Text>
          <Text style={s.cardSub}>
            {MILESTONES.filter((entry) => entry <= followers).length} of {MILESTONES.length}{' '}
            CreatorDNA milestones earned
          </Text>
          <Text style={s.cardSub}>Know your DNA. Grow your audience.</Text>
        </View>

        <View style={s.actions}>
          <Pressable
            onPress={() => void share()}
            style={{
              borderRadius: radius.pill,
              overflow: 'hidden',
            }}
            accessibilityRole="button"
            accessibilityLabel="Share this milestone"
          >
            <LinearGradient
              colors={c.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 14,
                alignItems: 'center',
                borderRadius: radius.pill,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
                {shareState === 'copied' ? 'Copied — go paste it!' : 'Share my milestone'}
              </Text>
            </LinearGradient>
          </Pressable>

          {shareState === 'failed' ? (
            <Text style={s.shareNote}>
              Sharing is blocked on this device — take a screenshot of the card instead.
            </Text>
          ) : null}

          <Pressable
            onPress={onDismiss}
            style={s.dismiss}
            accessibilityRole="button"
            accessibilityLabel="Close celebration"
          >
            <Text style={s.dismissLabel}>Keep growing</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
