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

export type Screen =
  | 'onboarding'
  | 'auth'
  | 'connect'
  | 'connected'
  | 'home'
  | 'dna'
  | 'ideas'
  | 'plan'
  | 'profile'
  | 'settings'
  | 'performance'
  | 'analysis'
  | 'recommendations'
  | 'analysisForm'
  | 'analysesList'
  | 'chat';

export const LIGHT_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  'connect',
  'dna',
  'ideas',
  'plan',
  'performance',
  'analysis',
  'recommendations',
  'analysisForm',
  'analysesList',
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
