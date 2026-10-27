import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { priorityLabel, priorityTone } from '../lib/derived';
import type { CreatorAiIdea } from '../services/creatorAi';
import { colors, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';
import { BackIcon, ChevronRightIcon } from './icons';

export function priorityBadgeProps(
  priority: CreatorAiIdea['priority'],
): { label: string; tone: BadgeTone } {
  return { label: priorityLabel(priority), tone: priorityTone(priority) };
}

// ---------- Buttons ----------

export function GradientButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [s.gradientButton, pressed && !inactive && s.pressed, style]}
    >
      <LinearGradient
        colors={inactive ? ['#8FAEE0', '#7FA3DC'] : colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.gradientFill}
      >
        <Text style={s.gradientLabel}>{loading ? 'Working…' : label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  tone = 'dark',
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.outlineButton,
        { borderColor: colors.lightBorder },
        pressed && s.pressed,
        style,
      ]}
    >
      <Text style={[s.outlineLabel, { color: isDark ? colors.onDark : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- Tabs ----------

export function PillTabs({
  options,
  value,
  onChange,
  variant = 'light',
  style,
}: {
  options: string[];
  value: string;
  onChange: (option: string) => void;
  variant?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = variant === 'dark';
  return (
    <View
      style={[
        s.pillTrack,
        { backgroundColor: colors.lightCard2 },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[s.pillItem, active && (isDark ? s.pillItemActiveDark : s.pillItemActive)]}
          >
            <Text
              style={[
                s.pillLabel,
                { color: isDark ? colors.onDarkSub : colors.textSub },
                active && { color: isDark ? '#FFFFFF' : colors.primary },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Badge ----------

export type BadgeTone = 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'blue';

// Badge fills are soft surfaces and their labels are darker text sitting on
// them, so both come from the active palette: the old fixed dark hues went
// dark-on-dark the moment the night palette swapped the fills for tints.
const badgeColors = (c: typeof colors): Record<BadgeTone, { bg: string; fg: string }> => ({
  green: { bg: c.greenSoft, fg: c.green },
  amber: { bg: c.amberSoft, fg: c.amber },
  red: { bg: c.redSoft, fg: c.red },
  purple: { bg: c.primarySoft, fg: c.primary },
  gray: { bg: c.graySoft, fg: c.gray },
  blue: { bg: c.blueSoft, fg: c.blue },
});

export function Badge({ label, tone = 'purple' }: { label: string; tone?: BadgeTone }) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const palette = badgeColors(colors)[tone];
  return (
    <View style={[s.badge, { backgroundColor: palette.bg }]}>
      <Text style={[s.badgeLabel, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

// ---------- Card ----------

export function Card({
  children,
  tone = 'light',
  style,
}: {
  children: ReactNode;
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = tone === 'dark';
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: isDark ? colors.darkCard : colors.lightCard,
          borderColor: isDark ? colors.darkBorder : colors.lightBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------- Header ----------

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  tone = 'light',
  brandHeader = false,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  tone?: 'light' | 'dark';
  brandHeader?: boolean;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = tone === 'dark';
  return (
    <View style={s.headerWrap}>
      <View style={s.headerRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={onBack}
            style={({ pressed }) => [
              s.headerBack,
              {
                backgroundColor: colors.lightCard2,
              },
              pressed && s.pressed,
            ]}
          >
            <BackIcon size={20} color={isDark ? colors.onDark : colors.text} />
          </Pressable>
        ) : null}
        <View style={s.headerTitleWrap}>
          {title ? (
            <Text
              numberOfLines={1}
              style={[
                s.headerTitle,
                { color: isDark ? colors.onDark : colors.text },
                brandHeader && s.headerTitleBrand,
              ]}
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              numberOfLines={2}
              style={[s.headerSubtitle, { color: isDark ? colors.onDarkSub : colors.textSub }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={s.headerRight}>{right}</View> : <View style={s.headerRight} />}
      </View>
    </View>
  );
}

// ---------- Avatar ----------

export function Avatar({
  uri,
  name,
  size = 44,
  dark = false,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  dark?: boolean;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel="Profile picture"
        style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }
  return (
    <View
      style={[
        s.avatar,
        s.avatarPlaceholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dark ? colors.darkCard2 : colors.primarySoft,
        },
      ]}
    >
      <Text
        style={[
          s.avatarInitial,
          { color: dark ? colors.onDark : colors.primary, fontSize: size * 0.4 },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

// ---------- Empty state ----------

export function EmptyState({
  glyph,
  title,
  hint,
  actionLabel,
  onAction,
  tone = 'light',
}: {
  glyph?: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'light' | 'dark';
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = tone === 'dark';
  return (
    <View style={s.empty}>
      {glyph ? (
        <View
          style={[
            s.emptyGlyphWrap,
            { backgroundColor: colors.primarySoft },
          ]}
        >
          <Text style={[s.emptyGlyph, { color: isDark ? colors.onDarkSub : colors.primary }]}>
            {glyph}
          </Text>
        </View>
      ) : null}
      <Text style={[s.emptyTitle, { color: isDark ? colors.onDark : colors.text }]}>{title}</Text>
      {hint ? (
        <Text style={[s.emptyHint, { color: isDark ? colors.onDarkSub : colors.textSub }]}>
          {hint}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <OutlineButton label={actionLabel} onPress={onAction} tone={isDark ? 'dark' : 'light'} style={{ marginTop: 14, paddingHorizontal: 22 }} />
      ) : null}
    </View>
  );
}

// ---------- Stat tile ----------

export function StatTile({
  label,
  value,
  delta,
  tone = 'light',
}: {
  label: string;
  value: string;
  delta?: { pct: number; up: boolean } | null;
  tone?: 'light' | 'dark';
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = tone === 'dark';
  return (
    <View
      style={[
        s.statTile,
        {
          backgroundColor: isDark ? colors.darkCard : colors.lightCard,
          borderColor: isDark ? colors.darkBorder : colors.lightBorder,
        },
      ]}
    >
      <Text style={[s.statLabel, { color: isDark ? colors.onDarkSub : colors.textSub }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.statValue, { color: isDark ? colors.onDark : colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {delta ? (
        <Text style={[s.statDelta, { color: delta.up ? colors.green : colors.red }]}>
          {delta.up ? '↑' : '↓'} {Math.abs(delta.pct)}%
        </Text>
      ) : null}
    </View>
  );
}

// ---------- List row ----------

export function ListRow({
  icon,
  label,
  value,
  onPress,
  tone = 'light',
  danger = false,
  right,
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: 'light' | 'dark';
  danger?: boolean;
  right?: ReactNode;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  const isDark = tone === 'dark';
  const content = (
    <View style={s.listRow}>
      {icon ? <View style={s.listRowIcon}>{icon}</View> : null}
      <Text
        numberOfLines={1}
        style={[
          s.listRowLabel,
          { color: danger ? colors.red : isDark ? colors.onDark : colors.text },
        ]}
      >
        {label}
      </Text>
      {value ? (
        <Text
          numberOfLines={1}
          style={[s.listRowValue, { color: isDark ? colors.onDarkSub : colors.textSub }]}
        >
          {value}
        </Text>
      ) : null}
      {right ? <View style={s.listRowRight}>{right}</View> : null}
      {onPress && !right ? (
        <ChevronRightIcon size={18} color={isDark ? colors.onDarkDim : colors.textDim} />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && s.pressed}>
      {content}
    </Pressable>
  );
}

// ---------- Toggle ----------
//
// A switch that follows the active palette. Used by the notification
// preferences, where a disabled row still has to stay readable.

export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const s = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={10}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        s.toggleTrack,
        {
          backgroundColor: value ? colors.primary : colors.lightCard2,
          borderColor: value ? colors.primary : colors.lightBorder,
          opacity: disabled ? 0.55 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <View
        style={[
          s.toggleKnob,
          { backgroundColor: value ? '#FFFFFF' : colors.textDim },
          value ? s.toggleKnobOn : null,
        ]}
      />
    </Pressable>
  );
}

// ---------- Skeleton ----------
//
// A softly pulsing placeholder for content that is still loading. Used
// wherever real analytics are on their way, so a loading screen never shows a
// fake zero or a blank gap. It carries no numbers and asserts nothing.

export function Skeleton({
  width,
  height = 14,
  radius: corner = 7,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: corner,
          backgroundColor: colors.lightBorder,
          opacity,
        },
        style,
      ]}
    />
  );
}

export const uiStyles = StyleSheet.create({});

// The sheet is built from the active palette, so the factory runs through
// useStyles (one StyleSheet per palette, cached) instead of being frozen at
// import time — `c` stands in for the palette inside the factory.
const makeStyles = (c: typeof colors) => StyleSheet.create({
  pressed: { opacity: 0.7 },

  gradientButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  gradientFill: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  gradientLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  outlineButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  outlineLabel: { fontSize: 15, fontWeight: '700' },

  pillTrack: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  pillItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pillItemActive: {
    backgroundColor: c.white,
    shadowColor: '#1A56AE',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  pillItemActiveDark: {
    backgroundColor: c.primary,
  },
  pillLabel: { fontSize: 13.5, fontWeight: '600' },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },

  toggleTrack: {
    width: 46,
    height: 27,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  toggleKnob: {
    width: 19,
    height: 19,
    borderRadius: 10,
  },
  toggleKnobOn: { alignSelf: 'flex-end' },

  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },

  headerWrap: { paddingTop: 6, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  headerTitleBrand: { fontSize: 24 },
  headerSubtitle: { fontSize: 13.5, fontWeight: '500', marginTop: 3, lineHeight: 18 },
  headerRight: { minWidth: 40, alignItems: 'flex-end' },

  avatar: { overflow: 'hidden' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18 },
  emptyGlyphWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyGlyph: { fontSize: 24, fontWeight: '700' },
  emptyTitle: { fontSize: 15.5, fontWeight: '700', textAlign: 'center' },
  emptyHint: {
    fontSize: 13.5,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },

  statTile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 12,
    minWidth: 0,
  },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 21, fontWeight: '800', marginTop: 5, letterSpacing: -0.4 },
  statDelta: { fontSize: 12, fontWeight: '700', marginTop: 3 },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    gap: 12,
  },
  listRowIcon: { width: 24, alignItems: 'center' },
  listRowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  listRowValue: { fontSize: 13.5, fontWeight: '600', maxWidth: '48%' },
  listRowRight: { marginLeft: 'auto' },
});
