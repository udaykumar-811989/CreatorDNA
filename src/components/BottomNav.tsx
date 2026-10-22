import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, NAV_HEIGHT } from '../theme';
import { DnaIcon, HomeIcon, IdeasIcon, PersonIcon, PlanIcon } from './icons';

export type NavTab = 'home' | 'content' | 'dna' | 'plan' | 'profile';

const tabs: Array<{
  key: NavTab;
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}> = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'content', label: 'Content', Icon: IdeasIcon },
  { key: 'dna', label: 'DNA', Icon: DnaIcon },
  { key: 'plan', label: 'Plan', Icon: PlanIcon },
  { key: 'profile', label: 'Profile', Icon: PersonIcon },
];

export function BottomNav({
  active,
  onNavigate,
  onProfileLongPress,
  tone = 'light',
}: {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  /** Long-press on the Profile tab opens the saved-accounts switcher. */
  onProfileLongPress?: () => void;
  tone?: 'light' | 'dark';
}) {
  const isDark = tone === 'dark';
  return (
    <View
      style={[
        styles.nav,
        {
          backgroundColor: isDark ? '#0D0F24' : colors.white,
          borderTopColor: isDark ? colors.darkBorder : colors.lightBorder,
        },
      ]}
    >
      {tabs.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const color = isActive
          ? '#7C6CF6'
          : isDark
            ? colors.onDarkDim
            : colors.textDim;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            onPress={() => onNavigate(key)}
            style={styles.item}
          >
            <Icon size={23} color={color} strokeWidth={isActive ? 2.1 : 1.8} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: NAV_HEIGHT,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingBottom: 12,
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2 },
});
