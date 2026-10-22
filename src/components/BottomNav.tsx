import { useEffect, useRef, type ComponentType } from 'react';
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
  // react-native-web doesn't reliably fire onLongPress on Pressable, so the
  // Profile long-press is tracked manually: hold → open the switcher after
  // 550ms, and swallow the release so the tab doesn't also navigate.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressConsumed = useRef(false);
  // Chrome/Android cancels presses (text-selection slop) while the finger is
  // still down — that must NOT kill a hold in progress. Raw window-level
  // touch tracking separates a real finger-lift (cancel the hold) from a
  // mid-hold jitter (keep the timer), and a move of >40px is a scroll or
  // drag, never a hold.
  const touchActive = useRef(false);
  const touchOrigin = useRef({ x: 0, y: 0 });
  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const beginLongPress = (key: NavTab) => {
    longPressConsumed.current = false;
    if (key !== 'profile' || !onProfileLongPress) {
      return;
    }
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressConsumed.current = true;
      onProfileLongPress();
    }, 550);
  };
  const endLongPress = () => {
    // Mouse release always cancels (touchActive false). On touch, pressOut
    // may fire mid-hold when the finger jitters past the press slop — keep
    // the timer while the finger is still on screen; the capture listeners
    // below clear it on a real touchend or a >40px drag.
    if (touchActive.current) {
      return;
    }
    clearLongPressTimer();
  };
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      touchActive.current = true;
      touchOrigin.current = { x: touch.clientX, y: touch.clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!touchActive.current || !longPressTimer.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const dx = touch.clientX - touchOrigin.current.x;
      const dy = touch.clientY - touchOrigin.current.y;
      if (Math.abs(dx) > 40 || Math.abs(dy) > 40) {
        clearLongPressTimer();
      }
    };
    const onEnd = () => {
      touchActive.current = false;
      clearLongPressTimer();
    };
    // Capture phase, so touchend updates `touchActive` before
    // react-native-web fires press-out (a plain tap cancels cleanly).
    window.addEventListener('touchstart', onStart, { passive: true, capture: true });
    window.addEventListener('touchmove', onMove, { passive: true, capture: true });
    window.addEventListener('touchend', onEnd, { capture: true });
    window.addEventListener('touchcancel', onEnd, { capture: true });
    return () => {
      window.removeEventListener('touchstart', onStart, { capture: true });
      window.removeEventListener('touchmove', onMove, { capture: true });
      window.removeEventListener('touchend', onEnd, { capture: true });
      window.removeEventListener('touchcancel', onEnd, { capture: true });
      clearLongPressTimer();
    };
  }, []);
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
            accessibilityHint={
              key === 'profile' ? 'Long press to switch saved accounts' : undefined
            }
            onPress={() => {
              if (longPressConsumed.current) {
                longPressConsumed.current = false;
                return;
              }
              onNavigate(key);
            }}
            onPressIn={() => beginLongPress(key)}
            onPressOut={endLongPress}
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
