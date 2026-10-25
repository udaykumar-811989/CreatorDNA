import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import {
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

const badgeColors: Record<BadgeTone, { bg: string; fg: string }> = {
  green: { bg: colors.greenSoft, fg: '#0E9155' },
  amber: { bg: colors.amberSoft, fg: '#C67C05' },
  red: { bg: colors.redSoft, fg: '#D33B3B' },
  purple: { bg: colors.primarySoft, fg: colors.primary },
  gray: { bg: colors.graySoft, fg: colors.gray },
  blue: { bg: colors.blueSoft, fg: '#2E6FD8' },
};

export function Badge({ label, tone = 'purple' }: { label: string; tone?: BadgeTone }) {
  const palette = badgeColors[tone];
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

export const uiStyles = StyleSheet.create({});

const s = StyleSheet.create({
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
    backgroundColor: colors.white,
    shadowColor: '#1A56AE',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  pillItemActiveDark: {
    backgroundColor: colors.primary,
  },
  pillLabel: { fontSize: 13.5, fontWeight: '600' },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },

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
