// CreatorDNA design tokens — matches the 10-screen mock.
// Dark screens: onboarding, auth, connected, home, profile, chat.
// Light screens: connect, dna, ideas, plan, performance, analysis flows.

export const colors = {
  // Dark palette
  darkBg: '#080B1B',
  darkBg2: '#11112A',
  darkBg3: '#100E24',
  onboardingBg: ['#070A1A', '#11132D', '#17102F'] as const,
  darkCard: '#161836',
  darkCard2: '#1C1E42',
  darkBorder: 'rgba(255,255,255,0.08)',
  onDark: '#FFFFFF',
  onDarkSub: '#A9A6C9',
  onDarkDim: '#7B78A0',

  // Light palette
  white: '#FFFFFF',
  lightCard: '#F6F5FC',
  lightCard2: '#F1EFFB',
  lightBorder: '#E9E7F5',
  text: '#16142B',
  textSub: '#6C6885',
  textDim: '#9693AE',

  // Brand
  primary: '#6C5CE7',
  primarySoft: '#EFEAFF',
  primaryDeep: '#5847D6',
  gradient: ['#7765F4', '#7660E9', '#6859E6'] as const,
  ringGradient: ['#8B7CFF', '#5B8CFF'] as const,

  // Status
  green: '#12B76A',
  greenSoft: '#E7F8F0',
  amber: '#F59E0B',
  amberSoft: '#FEF5E6',
  red: '#EF4444',
  redSoft: '#FEF1F1',
  blue: '#3B82F6',
  blueSoft: '#EBF2FE',
  graySoft: '#EFEEF6',
  gray: '#8A87A3',

  // Mock accents
  igGradient: ['#7438E8', '#C135BD', '#F56040', '#FFBD45'] as const,
};

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
