// CreatorDNA design tokens.
// Two palettes, one key set: `colors` (aliased by `lightColors`) is the
// landing page's look — white surfaces, pale-blue tints and the #1A56AE brand
// blue (see src/screens/LandingScreen.tsx) — and `darkColors` is the night
// version of exactly those keys. Screens must read the active palette through
// `useThemeColors()` / `useStyles()` from themeContext so the Settings
// appearance toggle actually reaches them; a module-level `colors` import is
// frozen to light mode. Key names still say "dark*" because the original mock
// was a dark theme — today they simply mean "page/card surface".

export const colors = {
  // Surfaces (page + cards). Page is a whisper off-white so white cards and
  // borders still read against it without every card needing a border.
  darkBg: '#FAFCFF',
  darkBg2: '#FFFFFF',
  darkBg3: '#F2F7FE',
  onboardingBg: ['#FFFFFF', '#FAFCFF', '#EBF0FB'] as [string, string, string],
  darkCard: '#FFFFFF',
  darkCard2: '#F7FAFF',
  darkBorder: 'rgba(26,86,174,0.13)',
  onDark: '#0D2E6B',
  onDarkSub: '#5068A0',
  onDarkDim: '#8296C0',

  // Light palette
  white: '#FFFFFF',
  lightCard: '#F5F9FF',
  lightCard2: '#EFF4FD',
  lightBorder: 'rgba(26,86,174,0.13)',
  text: '#0D2E6B',
  textSub: '#5068A0',
  textDim: '#8296C0',

  // Brand
  primary: '#1A56AE',
  primarySoft: '#EBF0FB',
  primaryDeep: '#163F85',
  gradient: ['#1A56AE', '#2466C0', '#2F7BD6'] as [string, string, string],
  ringGradient: ['#1A56AE', '#4C92E8'] as [string, string],

  // Status
  green: '#12B76A',
  greenSoft: '#E7F8F0',
  amber: '#F59E0B',
  amberSoft: '#FEF5E6',
  red: '#EF4444',
  redSoft: '#FEF1F1',
  blue: '#2E7BD6',
  blueSoft: '#EBF0FB',
  graySoft: '#F1F5FC',
  gray: '#7A8CA6',

  // Glyphs drawn on a status-coloured chip (a white tick on a green circle):
  // deliberately NOT `white`, because `white` is the card surface and has to
  // follow the theme while a glyph on a solid colour never should.
  onStatus: '#FFFFFF',
  // Chart grid / score-ring track: it sits on a card, so it must track the
  // card colour too (hairlines vanish on a dark card otherwise).
  track: '#E4EAF6',

  // Mock accents
  igGradient: ['#7438E8', '#C135BD', '#F56040', '#FFBD45'] as [
    string,
    string,
    string,
    string,
  ],

  // Themed surfaces (onboarding, auth, home, profile, settings, chat).
  pageBg: '#FAFCFF',
  entryBg: ['#FFFFFF', '#FAFCFF', '#EBF0FB'] as [string, string, string],
  surface1: 'rgba(26,86,174,0.05)',
  surface2: 'rgba(26,86,174,0.07)',
  surface3: 'rgba(26,86,174,0.11)',
  outlineSoft: 'rgba(26,86,174,0.32)',
  footerBg: 'rgba(255,255,255,0.94)',
  insightCard: '#EBF0FB',
};

export type ThemeMode = 'light' | 'dark';

// Appearance: 'light' is the landing look (the app's default) and 'dark' is its
// night-time twin — same brand blue, but every surface, text and hairline token
// swapped for a dark equivalent so the whole app follows the Settings toggle.
// `lightColors` is an alias of `colors` so screens that read either name agree.
export const lightColors: typeof colors = { ...colors };

// The dark variant. Kept in sync key-for-key with `colors`: adding a token to
// `colors` without adding it here is a type error, which is the point.
// Asserted to `typeof colors` so literal tuples (`gradient`, `entryBg`) keep
// the exact tuple type LinearGradient and friends require.
export const darkColors = {
  // Surfaces (page + cards). The jungle-night page from the landing and
  // login (#06140D), one step lighter for cards, so elevation still reads
  // without shadows.
  darkBg: '#06140D',
  darkBg2: '#0A1D13',
  darkBg3: '#08180F',
  onboardingBg: ['#06140D', '#0A1D13', '#0E2718'] as [string, string, string],
  darkCard: '#0D1F16',
  darkCard2: '#12281B',
  darkBorder: 'rgba(148,233,190,0.16)',
  onDark: '#F2FFF9',
  onDarkSub: '#A5CDB8',
  onDarkDim: '#7FA791',

  // The "light palette" keys — in dark mode these carry the dark surfaces.
  white: '#0D1F16',
  lightCard: '#0F2419',
  lightCard2: '#0A1B12',
  lightBorder: 'rgba(148,233,190,0.16)',
  text: '#F2FFF9',
  textSub: '#A5CDB8',
  textDim: '#7FA791',

  // Brand: the login page's green, at the depth of its button gradient so
  // white labels keep their contrast.
  primary: '#16A85E',
  primarySoft: '#0F3B27',
  primaryDeep: '#3AD07E',
  gradient: ['#3AD07E', '#25BE6F', '#16A85E'] as [string, string, string],
  ringGradient: ['#16A85E', '#4ADE80'] as [string, string],

  // Status: same meanings, brighter values (the light versions sit too dark
  // on the jungle page and stop reading as green/amber/red).
  green: '#3AD07E',
  greenSoft: '#10301F',
  amber: '#FBBF24',
  amberSoft: '#2E2513',
  red: '#F87171',
  redSoft: '#331A1A',
  blue: '#5AA0F0',
  blueSoft: '#123049',
  graySoft: '#0F1F16',
  gray: '#8FA99B',

  onStatus: '#FFFFFF',
  track: '#173626',

  // Instagram's own gradient — platform branding, identical in both modes.
  igGradient: ['#7438E8', '#C135BD', '#F56040', '#FFBD45'] as [
    string,
    string,
    string,
    string,
  ],

  pageBg: '#06140D',
  entryBg: ['#06140D', '#0A1D13', '#0E2718'] as [string, string, string],
  surface1: 'rgba(148,233,190,0.07)',
  surface2: 'rgba(148,233,190,0.10)',
  surface3: 'rgba(148,233,190,0.15)',
  outlineSoft: 'rgba(148,233,190,0.36)',
  footerBg: 'rgba(6,20,13,0.94)',
  insightCard: '#0F3B27',
} as typeof colors;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const type = {
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6 },
  h2: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  h3: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  h4: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  tiny: { fontSize: 11.5, fontWeight: '700' as const, letterSpacing: 0.7 },
  stat: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
};

export const NAV_HEIGHT = 74;
export const FAB_CLEARANCE = NAV_HEIGHT + 78;
