import { supabaseAnonKey, supabaseUrl } from '../config';
import {
  notificationFromRow,
  notificationToRow,
  type CreatorNotification,
  type NotificationRow,
} from './model';

// Mirrors the local store into `public.creator_notifications` over PostgREST.
//
// Only the publishable anon key and the creator's *own* session token are sent
// — never a service-role key. Row level security on the table is what actually
// enforces "one creator can never read another creator's notifications": the
// policies compare `user_id` to `auth.uid()`, so a stolen or hand-written
// request still only ever reaches its own rows.

const TABLE = 'creator_notifications';
const ENDPOINT = `${supabaseUrl}/rest/v1/${TABLE}`;
const TIMEOUT_MS = 10_000;
const PULL_LIMIT = 200;

export type SyncOutcome =
  /** The rows landed. */
  | 'ok'
  /** Bad or expired session — stop trying until there is a new one. */
  | 'unauthorized'
  /** No network, timeout or server error — try again later, silently. */
  | 'offline';

export function isRemoteNotificationsConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function baseHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function call(
  url: string,
  token: string,
  init: { method: string; body?: unknown; prefer?: string },
): Promise<{ outcome: SyncOutcome; data: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: baseHeaders(token, init.prefer ? { Prefer: init.prefer } : {}),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Offline / DNS / timeout: the in-app list is unaffected.
    return { outcome: 'offline', data: null };
  }
  if (response.status === 401 || response.status === 403) {
    return { outcome: 'unauthorized', data: null };
  }
  if (!response.ok) {
    return { outcome: 'offline', data: null };
  }
  if (response.status === 204) {
    return { outcome: 'ok', data: null };
  }
  try {
    return { outcome: 'ok', data: await response.json() };
  } catch {
    return { outcome: 'ok', data: null };
  }
}

/**
 * Upserts the whole local list. `on_conflict=id` + `merge-duplicates` means a
 * repeat is an idempotent no-op *and* a read-state change propagates, so the
 * same code path handles "new notification" and "mark as read".
 */
export async function pushNotifications(
  token: string,
  items: readonly CreatorNotification[],
): Promise<SyncOutcome> {
  if (items.length === 0) {
    return 'ok';
  }
  const body = items.map((item) => notificationToRow(item) as unknown as Record<string, unknown>);
  const { outcome } = await call(
    `${ENDPOINT}?on_conflict=id`,
    token,
    {
      method: 'POST',
      body,
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
  );
  return outcome;
}

export async function deleteNotifications(
  token: string,
  ids: readonly string[],
): Promise<SyncOutcome> {
  if (ids.length === 0) {
    return 'ok';
  }
  let worst: SyncOutcome = 'ok';
  // One request per id keeps the URL boring and the query unambiguous; the
  // tombstone list is small and bounded, so this never turns into a storm.
  await Promise.all(
    ids.slice(0, 100).map(async (id) => {
      const { outcome } = await call(
        `${ENDPOINT}?id=eq.${encodeURIComponent(id)}`,
        token,
        { method: 'DELETE', prefer: 'return=minimal' },
      );
      if (outcome === 'unauthorized') worst = 'unauthorized';
      else if (outcome === 'offline' && worst === 'ok') worst = 'offline';
    }),
  );
  return worst;
}

export async function pullNotifications(
  token: string,
): Promise<{ outcome: SyncOutcome; items: CreatorNotification[] }> {
  const { outcome, data } = await call(
    `${ENDPOINT}?select=*&order=created_at.desc&limit=${PULL_LIMIT}`,
    token,
    { method: 'GET' },
  );
  if (outcome !== 'ok' || !Array.isArray(data)) {
    return { outcome, items: [] };
  }
  const items: CreatorNotification[] = [];
  for (const entry of data as NotificationRow[]) {
    const item = notificationFromRow(entry);
    if (item) items.push(item);
  }
  return { outcome: 'ok', items };
}
