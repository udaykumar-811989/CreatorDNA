import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { storageKeys, usePersistentState } from './lib/storage';
import { colors, lightColors, type ThemeMode } from './theme';

// App-wide light/dark mode. Screens designed dark (onboarding, auth, home,
// profile, settings, chat) read `useThemeColors()` for a palette with the
// exact same keys as `colors` — in dark mode it *is* `colors`, so the
// default appearance is byte-for-byte the original mock. The choice is
// persisted on the device.

type ThemeValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  c: typeof colors;
};

const ThemeContext = createContext<ThemeValue>({
  mode: 'dark',
  setMode: () => {},
  c: colors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = usePersistentState<ThemeMode>(storageKeys.theme, 'dark');
  const value = useMemo<ThemeValue>(
    () => ({ mode, setMode, c: mode === 'dark' ? colors : lightColors }),
    [mode, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeContext).mode;
}

export function useThemeColors(): typeof colors {
  return useContext(ThemeContext).c;
}
