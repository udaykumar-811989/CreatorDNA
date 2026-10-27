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
  planStatuses: 'creatordna.planStatuses.v1',
  sync: 'creatordna.sync.v1',
  fabPosition: 'creatordna.fabPosition.v1',
  theme: 'creatordna.theme.v1',
};

/** Namespaces any account-owned key by scope; `''` returns the bare key. */
export function scopedStorageKey(base: string, scope: string): string {
  return scope ? `${base}:${scope}` : base;
}

// ---------- Account-scoped content storage ----------
//
// Analyses, ideas and chat belong to whoever is signed in. They used to live
// under one global key each, so switching accounts (or restoring a different
// session) left the previous creator's content on screen — the exact bug that
// made the app "show the previous one". These five keys are therefore
// namespaced by an account scope: `e:<email>` for a signed-in account,
// `ig:<handle>` for an Instagram-only connection, `guest` when signed out.
// Theme and the FAB position stay global: they are device preferences, not
// anyone's data.

export type ContentKeys = {
  analyses: string;
  ideas: string;
  trendingIdeas: string;
  savedIdeas: string;
  chat: string;
  planStatuses: string;
};

export const CONTENT_KEY_NAMES: (keyof ContentKeys)[] = [
  'analyses',
  'ideas',
  'trendingIdeas',
  'savedIdeas',
  'chat',
  'planStatuses',
];

/** The content keys for a scope. `''` yields the original unscoped keys. */
export function contentKeysFor(scope: string): ContentKeys {
  const suffix = scope ? `:${scope}` : '';
  return {
    analyses: `${storageKeys.analyses}${suffix}`,
    ideas: `${storageKeys.ideas}${suffix}`,
    trendingIdeas: `${storageKeys.trendingIdeas}${suffix}`,
    savedIdeas: `${storageKeys.savedIdeas}${suffix}`,
    chat: `${storageKeys.chat}${suffix}`,
    planStatuses: `${storageKeys.planStatuses}${suffix}`,
  };
}

export function contentKeyList(keys: ContentKeys): string[] {
  return CONTENT_KEY_NAMES.map((name) => keys[name]);
}

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
    writeRaw(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or unavailable — keep the session working in memory.
  }
}

// The body of writeJson, for callers that already hold serialized bytes
// (adopting an account's content moves whole records without re-parsing).
function writeRaw(key: string, raw: string): void {
  // Cache first: every reader, and any hydration merge already in flight,
  // must observe this value immediately — before the async disk write lands.
  cache.set(key, raw);
  try {
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
    // Storage refused the write — the in-memory copy still serves this session.
  }
}

function readRaw(key: string): string | null {
  try {
    const store = resolveStorage();
    const raw = store ? store.getItem(key) : (cache.get(key) ?? null);
    return raw ? raw : null;
  } catch {
    return null;
  }
}

// Forgets a key everywhere it can live: cache, any parked write, and disk.
function forgetKey(key: string): void {
  cache.delete(key);
  pendingWrites.delete(key);
  try {
    const store = resolveStorage();
    if (store) {
      store.removeItem(key);
      return;
    }
    diskWriteChain = diskWriteChain
      .then(() => AsyncStorage.removeItem(key))
      .catch(() => {
        // Best effort: a key that survives on disk is re-adopted, never shown
        // under the wrong account, because the scope moved away from it.
      });
  } catch {
    // Nothing else to clean up.
  }
}

/**
 * Moves content into the account scope that is signed in now, without ever
 * overwriting data: a target that already holds something is left completely
 * alone. The only sources are the legacy unscoped keys (content written
 * before scoping existed) and the signed-out `guest` scope — another real
 * account's scope is never a source, so a switch can never drag one creator's
 * content into another's keys. Called at boot it adopts pre-upgrade data,
 * which is why upgrading the app never loses analyses.
 */
export function adoptContentScope(toScope: string): void {
  const target = contentKeysFor(toScope);
  const sources: ContentKeys[] = [contentKeysFor(''), contentKeysFor('guest')];
  for (const source of sources) {
    for (const name of CONTENT_KEY_NAMES) {
      const fromKey = source[name];
      const toKey = target[name];
      if (fromKey === toKey) continue;
      if (readRaw(toKey)) continue; // target already has content: never overwrite
      const raw = readRaw(fromKey);
      if (!raw) continue;
      writeRaw(toKey, raw);
      forgetKey(fromKey);
    }
  }
}

/**
 * Pulls keys that only exist on disk into the read cache. Web reads go
 * straight to localStorage and needs nothing; native reads hit the cache, so
 * a scope created in a previous session must be loaded before the app switches
 * to it or the account would look empty. Always resolves.
 */
export async function preloadStorageKeys(keys: string[]): Promise<void> {
  if (resolveStorage()) return; // web: synchronous and already authoritative
  try {
    const missing = keys.filter(
      (key) => !cache.has(key) && !pendingWrites.has(key),
    );
    if (missing.length === 0) return;
    let pairs: readonly [string, string | null][] = [];
    await runWithTimeout(
      (async () => {
        pairs = await AsyncStorage.multiGet(missing);
      })(),
      HYDRATION_TIMEOUT_MS,
    );
    for (const [key, raw] of pairs) {
      if (raw === null || raw === undefined) continue;
      if (pendingWrites.has(key)) continue;
      cache.set(key, raw);
    }
  } catch {
    // A failed preload only means the account looks empty this session; the
    // data itself is untouched on disk.
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
  // The key can change while mounted — content keys are namespaced by account,
  // so signing in or swapping accounts re-keys this hook. The value must then
  // be re-read from the new key and, critically, the old account's state must
  // not be written into it: that would be exactly the cross-account bleed the
  // scoping exists to prevent.
  const currentKey = useRef(key);
  const skipNextWrite = useRef(false);

  useEffect(() => {
    if (currentKey.current === key) return;
    currentKey.current = key;
    skipNextWrite.current = true;
    setState(readJson(key, initial));
  }, [key, initial]);

  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
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
