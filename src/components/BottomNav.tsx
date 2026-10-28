import { useEffect, useRef, type ComponentType } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, NAV_HEIGHT } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';
import { CompassIcon, DnaIcon, HomeIcon, IdeasIcon, PersonIcon } from './icons';

export type NavTab = 'home' | 'content' | 'discover' | 'dna' | 'profile';

// Five tabs, not six: "Content" carries both the schedule and the ideas behind
// it (see ContentScreen), so a separate Plan tab only ever split one workflow
// across two buttons.
const tabs: Array<{
  key: NavTab;
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}> = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'content', label: 'Content', Icon: IdeasIcon },
  { key: 'discover', label: 'Discover', Icon: CompassIcon },
  { key: 'dna', label: 'DNA', Icon: DnaIcon },
  { key: 'profile', label: 'Profile', Icon: PersonIcon },
];

export function BottomNav({
  active,
  onNavigate,
  onProfileLongPress,
}: {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  /** Long-press on the Profile tab opens the saved-accounts switcher. */
  onProfileLongPress?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
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
    // RN defines a global `window`, but it has no DOM event methods — the
    // old `typeof window === 'undefined'` check passed on Android and the
    // first `window.addEventListener` threw, killing the app on launch.
    // Touch capture is a web-only concern (react-native-web press slop);
    // native Pressable already reports press-in/out correctly.
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
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
      // The bar is one set of tabs, so it is a tablist — that is what makes
      // "selected" mean anything to a screen reader on the web build, where
      // react-native-web does not render accessibilityState.selected itself.
      accessibilityRole="tablist"
      accessibilityLabel="Primary"
      style={[
        styles.nav,
        {
          backgroundColor: colors.white,
          borderTopColor: colors.lightBorder,
        },
      ]}
    >
      {tabs.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const color = isActive ? colors.primary : colors.textDim;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            aria-selected={isActive}
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

// Built per palette through useStyles: a module-scope StyleSheet bakes in the
// palette that existed at import time, so the Appearance toggle never reaches
// it. The nav surface colours are read from useThemeColors() inside the
// component; the sheet stays a factory so any colour token added to it later
// follows the theme as well.
const makeStyles = (c: typeof colors) =>
  StyleSheet.create({
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
    label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2, textAlign: 'center' },
  });
