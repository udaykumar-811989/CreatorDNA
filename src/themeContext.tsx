import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { storageKeys, usePersistentState } from './lib/storage';
import { colors, darkColors, lightColors, type ThemeMode } from './theme';

// App-wide light/dark mode. Screens read `useThemeColors()` for a palette with
// the exact same keys as `colors` — light mode is the landing look, dark mode
// is its navy twin. The choice is persisted on the device.

type ThemeValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  c: typeof colors;
};

const ThemeContext = createContext<ThemeValue>({
  mode: 'light',
  setMode: () => {},
  c: colors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Light by default: that is the branded landing look the app opens with,
  // and Dark is the opt-in from Settings.
  const [mode, setMode] = usePersistentState<ThemeMode>(storageKeys.theme, 'light');
  const value = useMemo<ThemeValue>(
    () => ({ mode, setMode, c: mode === 'dark' ? darkColors : lightColors }),
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

// A StyleSheet built at module scope bakes in whatever palette existed at
// import time, so dark mode never reaches it. Building styles through this
// hook instead re-runs the factory against the active palette, and the
// WeakMap keeps it to one StyleSheet per palette — not one per render.
const styleCache = new WeakMap<object, Map<(palette: typeof colors) => unknown, unknown>>();

export function useStyles<T>(factory: (palette: typeof colors) => T): T {
  const palette = useThemeColors();
  let perPalette = styleCache.get(palette);
  if (!perPalette) {
    perPalette = new Map();
    styleCache.set(palette, perPalette);
  }
  const cached = perPalette.get(factory);
  if (cached !== undefined) {
    return cached as T;
  }
  const made = factory(palette);
  perPalette.set(factory, made);
  return made;
}
