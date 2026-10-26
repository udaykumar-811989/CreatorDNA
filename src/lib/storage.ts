import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// React Native has no localStorage, so before AsyncStorage was wired in every
// value lived in a plain module Map and was destroyed the moment the OS
// killed the app (swiping it away from Recents). The Map still is the single
// source of truth for reads — readJson must stay synchronous for the existing
// `useState(() => readJson(key, initial))` call sites — hydrateStorage() fills
// it from disk once at startup, and writeJson() writes it through to
// AsyncStorage so data survives the process.
const cache = new Map<string, string>();

// Writes issued before hydration finishes are parked here instead of going
// straight to disk. Hydration merges the (older) persisted values into the
// cache, and a value the app wrote this session must survive that merge, so
// these are replayed to disk right after it and win over the older value.
const pendingWrites = new Map<string, string>();

// Disk writes are chained so an older value can never land after a newer one.
let diskWriteChain: Promise<void> = Promise.resolve();

let hydrated = false;
let hydrationInFlight: Promise<void> | null = null;
const hydrationListeners = new Set<() => void>();

// Hard budget for the disk read. A hung or very slow read must not hold the
// app hostage, so hydration resolves anyway — the app then runs from the
// cache for this session and nothing on disk is overwritten in the meantime.
const HYDRATION_TIMEOUT_MS = 1500;

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

export function isStorageHydrated(): boolean {
  return hydrated;
}

function persistToDisk(key: string, raw: string): void {
  // Fire and forget: callers are renders and effects, so a rejected promise
  // must never surface there. The cache already holds the value, so a failed
  // write only costs persistence for this session, not the session itself.
  diskWriteChain = diskWriteChain
    .then(() => AsyncStorage.setItem(key, raw))
    .catch(() => {
      // Disk full / storage unavailable — keep the in-memory session working.
    });
}

function flushPendingWrites(): void {
  for (const [key, raw] of pendingWrites) {
    persistToDisk(key, raw);
  }
  pendingWrites.clear();
}

async function loadPersistedKeys(): Promise<void> {
  const pairs = await AsyncStorage.multiGet(Object.values(storageKeys));
  if (hydrated) {
    // Hydration already gave up on this read (timeout) and flushed pending
    // writes; merging late would race those writes with stale values.
    return;
  }
  for (const [key, raw] of pairs) {
    if (raw === null || raw === undefined) continue;
    if (pendingWrites.has(key)) continue; // an early write wins over the older persisted value
    cache.set(key, raw);
  }
}

async function runWithTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([work, expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function runHydration(): Promise<void> {
  try {
    // On web localStorage is synchronous and already the source of truth, so
    // there is nothing to load; on native this pulls every known key in one
    // batched multiGet instead of seven round trips.
    if (!resolveStorage()) {
      await runWithTimeout(loadPersistedKeys(), HYDRATION_TIMEOUT_MS);
    }
  } catch {
    // Storage is unavailable or errored: still resolve, never hang app start.
  } finally {
    // Runs even when the read timed out or threw, so hydration always finishes
    // within the timeout and isStorageHydrated() always becomes true.
    flushPendingWrites();
    hydrated = true;
    const listeners = Array.from(hydrationListeners);
    hydrationListeners.clear();
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A component listener must not break hydration for the rest of the app.
      }
    }
  }
}

/**
 * Loads persisted values into the read cache. Safe to call more than once and
 * safe to call early: later calls join the in-flight run, and it always
 * resolves (within HYDRATION_TIMEOUT_MS at worst) so awaiting it cannot hang
 * the app.
 */
export function hydrateStorage(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrationInFlight) return hydrationInFlight;
  hydrationInFlight = runHydration().finally(() => {
    hydrationInFlight = null;
  });
  return hydrationInFlight;
}

// Used by usePersistentState to adopt the persisted value once it arrives;
// not exported because the public surface stays storageKeys/readJson/
// writeJson/usePersistentState (plus hydrateStorage/isStorageHydrated).
function subscribeToHydration(listener: () => void): () => void {
  if (hydrated) return () => undefined;
  hydrationListeners.add(listener);
  return () => {
    hydrationListeners.delete(listener);
  };
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const store = resolveStorage();
    const raw = store ? store.getItem(key) : (cache.get(key) ?? null);
    if (!raw) {
      return fallback;
    }
    // Corrupt JSON returns the fallback and is deliberately NOT written back:
    // persisting the fallback would replace whatever bytes are still on disk
    // with the default, turning a parse error into permanent data loss.
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    // Cache first: every reader, and any hydration merge already in flight,
    // must observe this value immediately — before the async disk write lands.
    cache.set(key, raw);
    const store = resolveStorage();
    if (store) {
      store.setItem(key, raw);
      return;
    }
    if (!hydrated) {
      // Parked, not lost: hydration replays it after merging disk values, so
      // an early write beats the older persisted one instead of being
      // overwritten by it.
      pendingWrites.set(key, raw);
      return;
    }
    persistToDisk(key, raw);
  } catch {
    // Quota exceeded or unavailable — keep the session working in memory.
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readJson(key, initial));
  // What this hook mounted with. While storage is still loading that is the
  // caller's default, not saved data, so pushing it back to disk would erase
  // the user's real values (theme, analyses, chat) on every cold start.
  const mountValue = useRef(state);

  useEffect(() => {
    if (!isStorageHydrated() && state === mountValue.current) {
      // Still the untouched mount value and storage has not answered yet:
      // skip the write. Any real edit (state now differs) still goes through,
      // and writeJson queues it as a pending write until hydration finishes.
      return;
    }
    writeJson(key, state);
  }, [key, state]);

  useEffect(() => {
    // App gates first paint on hydration, so normally this never fires; it is
    // here so a component that mounted early still adopts the persisted value
    // instead of silently showing defaults over real data.
    const unsubscribe = subscribeToHydration(() => {
      if (!cache.has(key)) return; // nothing was loaded for this key (e.g. read timed out)
      const persisted = readJson(key, initial);
      setState((current) => (current === mountValue.current ? persisted : current));
    });
    return unsubscribe;
  }, [key, initial]);

  return [state, setState];
}

export type SavedContexts = {
  analyses: AnalysisRecord[];
  ideas: CreatorAiIdea[];
  trendingIdeas: CreatorAiIdea[];
  savedIdeas: CreatorAiIdea[];
  chatMessages: CreatorAiChatMessage[];
};
