// CreatorDNA design tokens.
// The whole app wears the landing page's palette: white surfaces, pale-blue
// tints and the #1A56AE brand blue (see src/screens/LandingScreen.tsx).
// Key names still say "dark*" because the original mock was a dark theme —
// those keys are now simply the everyday surface/text tokens.
// `isDark` / mode branches still exist in screens; both modes read this same
// palette, so they are cosmetic no-ops after the literal sweep.

export const colors = {
  // Surfaces (page + cards). Page is a whisper off-white so white cards and
  // borders still read against it without every card needing a border.
  darkBg: '#FAFCFF',
  darkBg2: '#FFFFFF',
  darkBg3: '#F2F7FE',
  onboardingBg: ['#FFFFFF', '#FAFCFF', '#EBF0FB'] as const,
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
  gradient: ['#1A56AE', '#2466C0', '#2F7BD6'] as const,
  ringGradient: ['#1A56AE', '#4C92E8'] as const,

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

  // Mock accents
  igGradient: ['#7438E8', '#C135BD', '#F56040', '#FFBD45'] as const,

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

// One palette for both modes: the app is the landing look everywhere, so the
// appearance toggle in Settings no longer changes colors. Same keys, kept so
// screens that swap the object keep working.
export const lightColors: typeof colors = { ...colors };

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
