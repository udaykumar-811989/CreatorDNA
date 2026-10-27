import type { CreatorNotification } from './model';

// The in-app store. It is the source of truth for everything the creator sees:
// the app stays fully functional with no network, no Supabase session and no
// push permission. `remote.ts` mirrors this state into `creator_notifications`
// and back; a failed or skipped sync never affects what is rendered here.

export type NotificationState = {
  items: CreatorNotification[];
  /** Ids deleted on this device that still have to be deleted remotely. */
  tombstones: string[];
  /**
   * Dedupe keys of notifications the creator deleted. Without this a delete
   * only lasts until the next time the same real-world event is recomputed
   * (a dashboard refresh), and the notification would silently come back.
   */
  handledKeys: string[];
};

export const EMPTY_NOTIFICATION_STATE: NotificationState = {
  items: [],
  tombstones: [],
  handledKeys: [],
};

export const MAX_NOTIFICATIONS = 150;
export const MAX_TOMBSTONES = 300;
export const MAX_HANDLED_KEYS = 400;

/** Read notifications older than this are dropped so history stays bounded. */
const READ_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const byNewestFirst = (a: CreatorNotification, b: CreatorNotification): number =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

function pushCapped(list: string[], value: string, cap: number): string[] {
  if (list.includes(value)) {
    return list;
  }
  const next = [...list, value];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Bounded history: newest first, read items expire, nothing grows forever. */
export function pruneNotifications(
  state: NotificationState,
  now = Date.now(),
): NotificationState {
  const kept = [...state.items]
    .sort(byNewestFirst)
    .filter((item, index) => {
      if (index < MAX_NOTIFICATIONS) {
        // Newly read items keep their place at the top of the history.
        if (item.isRead) {
          const at = Date.parse(item.readAt ?? item.createdAt);
          return Number.isFinite(at) ? now - at < READ_TTL_MS : true;
        }
        return true;
      }
      return false;
    });
  const tombstones =
    state.tombstones.length > MAX_TOMBSTONES
      ? state.tombstones.slice(state.tombstones.length - MAX_TOMBSTONES)
      : state.tombstones;
  const handledKeys =
    state.handledKeys.length > MAX_HANDLED_KEYS
      ? state.handledKeys.slice(state.handledKeys.length - MAX_HANDLED_KEYS)
      : state.handledKeys;
  const unchanged =
    kept.length === state.items.length &&
    kept.every((item, index) => item === state.items[index]) &&
    tombstones === state.tombstones &&
    handledKeys === state.handledKeys;
  if (unchanged) {
    return state;
  }
  return { items: kept, tombstones, handledKeys };
}

function isKnown(state: NotificationState, item: CreatorNotification): boolean {
  return (
    state.handledKeys.includes(item.dedupeKey) ||
    state.items.some((existing) => existing.dedupeKey === item.dedupeKey)
  );
}

/** Adds only genuinely new events. Duplicates are dropped, never appended. */
export function addNotifications(
  state: NotificationState,
  incoming: readonly CreatorNotification[],
  now = Date.now(),
): NotificationState {
  const fresh = incoming.filter(
    (item) => !state.items.some((existing) => existing.id === item.id) && !isKnown(state, item),
  );
  if (fresh.length === 0) {
    return state;
  }
  return pruneNotifications(
    { ...state, items: [...state.items, ...fresh] },
    now,
  );
}

export function markNotificationRead(
  state: NotificationState,
  id: string,
  nowIso = new Date().toISOString(),
): NotificationState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== id || item.isRead) {
      return item;
    }
    changed = true;
    return { ...item, isRead: true, readAt: nowIso };
  });
  return changed ? { ...state, items } : state;
}

export function markAllNotificationsRead(
  state: NotificationState,
  nowIso = new Date().toISOString(),
): NotificationState {
  if (!state.items.some((item) => !item.isRead)) {
    return state;
  }
  return {
    ...state,
    items: state.items.map((item) =>
      item.isRead ? item : { ...item, isRead: true, readAt: nowIso },
    ),
  };
}

export function removeNotification(state: NotificationState, id: string): NotificationState {
  const target = state.items.find((item) => item.id === id);
  if (!target) {
    return state;
  }
  return {
    items: state.items.filter((item) => item.id !== id),
    tombstones: pushCapped(state.tombstones, id, MAX_TOMBSTONES),
    handledKeys: pushCapped(state.handledKeys, target.dedupeKey, MAX_HANDLED_KEYS),
  };
}

/** "Erase everything": every row leaves the device *and* the database. */
export function clearNotifications(state: NotificationState): NotificationState {
  if (state.items.length === 0) {
    return state;
  }
  const tombstones = [...state.tombstones];
  const handledKeys = [...state.handledKeys];
  for (const item of state.items) {
    if (!tombstones.includes(item.id)) tombstones.push(item.id);
    if (!handledKeys.includes(item.dedupeKey)) handledKeys.push(item.dedupeKey);
  }
  return pruneNotifications({
    items: [],
    tombstones: tombstones.slice(-MAX_TOMBSTONES),
    handledKeys: handledKeys.slice(-MAX_HANDLED_KEYS),
  });
}

/**
 * Folds the server's copy into the local one. Local rows win on identity;
 * read state is monotonic (a row is read if either side read it — there is no
 * "mark unread", so nothing can regress), and rows this device deleted are not
 * resurrected by a sync that raced the delete.
 */
export function mergeRemoteNotifications(
  state: NotificationState,
  remote: readonly CreatorNotification[],
  now = Date.now(),
): NotificationState {
  const localById = new Map(state.items.map((item) => [item.id, item]));
  let changed = false;
  const items = [...state.items];
  for (const row of remote) {
    if (state.tombstones.includes(row.id)) {
      continue;
    }
    const local = localById.get(row.id);
    if (!local) {
      if (isKnown(state, row)) {
        continue;
      }
      items.push(row);
      localById.set(row.id, row);
      changed = true;
      continue;
    }
    if (!local.isRead && row.isRead) {
      const index = items.findIndex((item) => item.id === row.id);
      items[index] = { ...local, isRead: true, readAt: row.readAt ?? local.readAt };
      changed = true;
    }
  }
  if (!changed) {
    return state;
  }
  return pruneNotifications({ ...state, items }, now);
}
