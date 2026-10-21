import { useEffect, useState } from 'react';
import type { ContentAnalysis, CreatorAiChatMessage, CreatorAiIdea } from '../services/creatorAi';

// Local, real user data only: analyses the user actually ran, ideas the AI
// actually generated, their saved picks, and their chat history. Nothing here
// is fabricated — empty/missing data renders as honest empty states.

export type AnalysisRecord = {
  id: string;
  createdAt: string;
  title: string;
  transcript: string | null;
  caption: string | null;
  metrics: Record<string, number>;
  mediaId?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  analysis: ContentAnalysis;
};

export const storageKeys = {
  analyses: 'creatordna.analyses.v1',
  ideas: 'creatordna.ideas.v1',
  trendingIdeas: 'creatordna.trendingIdeas.v1',
  savedIdeas: 'creatordna.savedIdeas.v1',
  chat: 'creatordna.chat.v1',
  fabPosition: 'creatordna.fabPosition.v1',
  theme: 'creatordna.theme.v1',
};

const memoryFallback = new Map<string, string>();

function resolveStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__creatordna_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // Private mode / disabled storage — fall back to in-memory.
  }
  return null;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const store = resolveStorage();
    const raw = store ? store.getItem(key) : (memoryFallback.get(key) ?? null);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    const store = resolveStorage();
    if (store) {
      store.setItem(key, raw);
    } else {
      memoryFallback.set(key, raw);
    }
  } catch {
    // Quota exceeded or unavailable — keep the session working in memory.
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readJson(key, initial));
  useEffect(() => {
    writeJson(key, state);
  }, [key, state]);
  return [state, setState];
}

export type SavedContexts = {
  analyses: AnalysisRecord[];
  ideas: CreatorAiIdea[];
  trendingIdeas: CreatorAiIdea[];
  savedIdeas: CreatorAiIdea[];
  chatMessages: CreatorAiChatMessage[];
};
