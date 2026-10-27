import type { CreatorAiMedia } from '../services/creatorAi';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'failed';

export type AnalysisSubmission = {
  idempotencyKey: string;
  title: string;
  transcript: string | null;
  caption: string | null;
  metrics: Record<string, number>;
  media?: CreatorAiMedia | null;
  mediaLink?: {
    mediaId?: string | null;
    thumbnailUrl?: string | null;
    permalink?: string | null;
    mediaType?: string | null;
  } | null;
};

const SCREEN_NAMES = [
  'landing',
  'onboarding',
  'auth',
  'connect',
  'connected',
  'home',
  'dna',
  'ideas',
  'plan',
  'profile',
  'settings',
  'performance',
  'analysis',
  'recommendations',
  'analysisForm',
  'analysesList',
  'weeklyReport',
  'mediaKit',
  'privacy',
  'help',
  'chat',
] as const;

export type Screen = (typeof SCREEN_NAMES)[number];

/** True when a history entry / deep link names a screen this app actually has. */
export function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && (SCREEN_NAMES as readonly string[]).includes(value);
}

export const LIGHT_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  'landing',
  'connect',
  'connected',
  'dna',
  'ideas',
  'plan',
  'performance',
  'analysis',
  'recommendations',
  'analysisForm',
  'analysesList',
  'weeklyReport',
  'mediaKit',
]);

export const NAV_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  'home',
  'ideas',
  'dna',
  'plan',
  'profile',
  'performance',
  'settings',
]);

/**
 * Screens with their own web route, so a store listing or a support reply can
 * link straight to `https://…/privacy` or `https://…/help`. The app shell keeps
 * the address bar in sync with these (see App.tsx).
 */
export const SCREEN_PATHS: Readonly<Partial<Record<Screen, string>>> = {
  // The public front door: "/" is the marketing home, never a signed-in
  // screen, so a store listing can point at the site root.
  landing: '/',
  privacy: '/privacy',
  help: '/help',
};

export function screenForPath(pathname: string | null | undefined): Screen | null {
  if (!pathname) {
    return null;
  }
  const path = pathname.replace(/\/+$/, '') || '/';
  const match = (Object.keys(SCREEN_PATHS) as Screen[]).find(
    (screen) => SCREEN_PATHS[screen] === path,
  );
  return match ?? null;
}

export function pathForScreen(screen: Screen): string | null {
  return SCREEN_PATHS[screen] ?? null;
}
