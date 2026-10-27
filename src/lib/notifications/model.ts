import { isScreen, type Screen } from '../types';

// The notification model: what a notification *is*, independent of where it is
// stored or shown. The same shape is used for the local store, for the
// `creator_notifications` row over PostgREST, and for any future push/email
// channel — that is what lets a delivery channel be added later without
// touching the notification logic itself.

export type NotificationType =
  | 'dna'
  | 'growth_followers'
  | 'growth_engagement'
  | 'content_outperform'
  | 'ai_opportunity'
  | 'ideas_ready'
  | 'plan_today'
  | 'weekly_report'
  | 'account_reconnect'
  | 'account_sync_failed'
  | 'account_sync_ok';

/** The tabs on the Notifications screen. `all` is handled by the screen. */
export type NotificationCategory = 'insights' | 'content' | 'plan' | 'growth' | 'account';

/** What a Settings switch controls — coarser than a category, finer than one master switch. */
export type NotificationTopic =
  | 'content_performance'
  | 'dna'
  | 'growth'
  | 'ai'
  | 'plan'
  | 'weekly'
  | 'account';

export type NotificationIconName =
  | 'dna'
  | 'growth'
  | 'content'
  | 'ai'
  | 'plan'
  | 'report'
  | 'account'
  | 'sync';

export type NotificationActionType = 'none' | 'screen' | 'external';

export type CreatorNotification = {
  /** Client-generated UUID, so the local row and the database row share one id. */
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  isRead: boolean;
  actionType: NotificationActionType;
  /** Deep link target, already validated against the app's screen names. */
  actionTarget: Screen | null;
  actionLabel: string | null;
  metadata: Record<string, unknown>;
  dedupeKey: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationTypeMeta = {
  topic: NotificationTopic;
  category: NotificationCategory;
  icon: NotificationIconName;
  defaultAction: { label: string; target: Screen } | null;
  /**
   * Connection and security messages. Critical notifications ignore the master
   * switch and every optional category switch: they stay in-app because they
   * are the only way the creator finds out that Instagram stopped feeding them
   * real numbers.
   */
  critical: boolean;
};

export const NOTIFICATION_TYPE_META: Readonly<Record<NotificationType, NotificationTypeMeta>> = {
  dna: {
    topic: 'dna',
    category: 'insights',
    icon: 'dna',
    defaultAction: { label: 'View DNA', target: 'dna' },
    critical: false,
  },
  growth_followers: {
    topic: 'growth',
    category: 'growth',
    icon: 'growth',
    defaultAction: { label: 'View Insights', target: 'performance' },
    critical: false,
  },
  growth_engagement: {
    topic: 'growth',
    category: 'growth',
    icon: 'growth',
    defaultAction: { label: 'View Insights', target: 'performance' },
    critical: false,
  },
  content_outperform: {
    topic: 'content_performance',
    category: 'content',
    icon: 'content',
    defaultAction: { label: 'Analyze Why', target: 'performance' },
    critical: false,
  },
  ai_opportunity: {
    topic: 'ai',
    category: 'content',
    icon: 'ai',
    defaultAction: { label: 'Create Content', target: 'ideas' },
    critical: false,
  },
  ideas_ready: {
    topic: 'ai',
    category: 'content',
    icon: 'ai',
    defaultAction: { label: 'See Ideas', target: 'ideas' },
    critical: false,
  },
  plan_today: {
    topic: 'plan',
    category: 'plan',
    icon: 'plan',
    defaultAction: { label: 'Open Plan', target: 'plan' },
    critical: false,
  },
  weekly_report: {
    topic: 'weekly',
    category: 'insights',
    icon: 'report',
    defaultAction: { label: 'View Report', target: 'weeklyReport' },
    critical: false,
  },
  account_reconnect: {
    topic: 'account',
    category: 'account',
    icon: 'account',
    defaultAction: { label: 'Reconnect', target: 'connect' },
    critical: true,
  },
  account_sync_failed: {
    topic: 'account',
    category: 'account',
    icon: 'sync',
    defaultAction: null,
    critical: true,
  },
  account_sync_ok: {
    topic: 'account',
    category: 'account',
    icon: 'sync',
    defaultAction: { label: 'View Insights', target: 'performance' },
    critical: false,
  },
};

export function isNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPE_META, value)
  );
}

// ---------- Tabs / preference switches ----------

export const NOTIFICATION_CATEGORIES: ReadonlyArray<{
  key: 'all' | NotificationCategory;
  label: string;
}> = [
  { key: 'all', label: 'All' },
  { key: 'insights', label: 'Insights' },
  { key: 'content', label: 'Content' },
  { key: 'plan', label: 'Plan' },
  { key: 'growth', label: 'Growth' },
  { key: 'account', label: 'Account' },
];

export const NOTIFICATION_TOPICS: ReadonlyArray<{
  key: NotificationTopic;
  label: string;
  hint: string;
}> = [
  {
    key: 'content_performance',
    label: 'Content Performance',
    hint: 'A post pulling ahead of your own recent results.',
  },
  { key: 'dna', label: 'Creator DNA Updates', hint: 'When your score or Creator Type moves.' },
  { key: 'growth', label: 'Growth Insights', hint: 'Meaningful follower and engagement change.' },
  { key: 'ai', label: 'AI Recommendations', hint: 'New ideas and content opportunities.' },
  { key: 'plan', label: 'Content Plan Reminders', hint: 'What you planned to post today.' },
  { key: 'weekly', label: 'Weekly Report', hint: 'Your seven-day summary is ready.' },
  {
    key: 'account',
    label: 'Instagram Connection / Account Alerts',
    hint: 'Sync results and reconnect requests.',
  },
];

// ---------- Preferences ----------

export type NotificationPrefs = {
  master: boolean;
  topics: Record<NotificationTopic, boolean>;
  /** 24-hour local time the creator wants the day's plan reminder, `HH:MM`. */
  reminderTime: string;
  /** The creator pressed "Enable Notifications" (browser permission is separate). */
  pushOptIn: boolean;
  /** They pressed "Not Now" — do not re-ask on every visit. */
  pushPromptDismissed: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  master: true,
  topics: {
    content_performance: true,
    dna: true,
    growth: true,
    ai: true,
    plan: true,
    weekly: true,
    account: true,
  },
  reminderTime: '20:15',
  pushOptIn: false,
  pushPromptDismissed: false,
};

/** True when this type should be created at all, given the creator's switches. */
export function notificationAllowed(type: NotificationType, prefs: NotificationPrefs): boolean {
  const meta = NOTIFICATION_TYPE_META[type];
  if (meta.critical) {
    return true;
  }
  if (!prefs.master) {
    return false;
  }
  return prefs.topics[meta.topic] !== false;
}

/** Re-parsed so a hand-edited or older saved value can never break rendering. */
export function normalizeNotificationPrefs(value: unknown): NotificationPrefs {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFS, topics: { ...DEFAULT_NOTIFICATION_PREFS.topics } };
  }
  const raw = value as Partial<NotificationPrefs>;
  const topics = { ...DEFAULT_NOTIFICATION_PREFS.topics };
  if (raw.topics && typeof raw.topics === 'object') {
    for (const key of Object.keys(topics) as NotificationTopic[]) {
      const entry = (raw.topics as Record<string, unknown>)[key];
      if (typeof entry === 'boolean') {
        topics[key] = entry;
      }
    }
  }
  return {
    master: typeof raw.master === 'boolean' ? raw.master : true,
    topics,
    reminderTime: isReminderTime(raw.reminderTime) ? (raw.reminderTime as string) : '20:15',
    pushOptIn: raw.pushOptIn === true,
    pushPromptDismissed: raw.pushPromptDismissed === true,
  };
}

export function isReminderTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** `20:15` → `8:15 PM`. Never invents a time it wasn't given. */
export function reminderLabel(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return time;
  }
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

// ---------- List helpers ----------

export function unreadCount(items: readonly CreatorNotification[]): number {
  let count = 0;
  for (const item of items) {
    if (!item.isRead) count += 1;
  }
  return count;
}

export function unreadBadgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

const startOfLocalDay = (value: Date): number =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

export function dayKey(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** ISO week key (`2026-W44`) in the creator's local week, for weekly dedupe. */
export function isoWeekKey(value: Date): string {
  const utc = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type NotificationGroup = {
  key: 'today' | 'yesterday' | 'earlier';
  label: string;
  items: CreatorNotification[];
};

/** Today / Yesterday / Earlier, newest first inside each bucket. */
export function groupNotifications(
  items: readonly CreatorNotification[],
  now = new Date(),
): NotificationGroup[] {
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  const buckets: Record<NotificationGroup['key'], CreatorNotification[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const item of items) {
    const at = Date.parse(item.createdAt);
    const stamp = Number.isFinite(at) ? at : 0;
    if (stamp >= todayStart) buckets.today.push(item);
    else if (stamp >= yesterdayStart) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }
  const order: NotificationGroup[] = [
    { key: 'today', label: 'Today', items: buckets.today },
    { key: 'yesterday', label: 'Yesterday', items: buckets.yesterday },
    { key: 'earlier', label: 'Earlier', items: buckets.earlier },
  ];
  return order.filter((group) => group.items.length > 0);
}

/** Compact timestamp for a row: `Just now`, `12m ago`, `Today, 8:15 PM`, `12 Oct`. */
export function notificationTimeLabel(iso: string, now = new Date()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return '';
  }
  const elapsed = now.getTime() - at;
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  const time = new Date(at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (at >= todayStart) return `Today, ${time}`;
  if (at >= yesterdayStart) return `Yesterday, ${time}`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------- Row mapping (PostgREST <-> model) ----------

export type NotificationRow = {
  id: string;
  user_id?: string;
  type: string;
  category: string;
  topic?: string;
  title: string;
  message: string | null;
  is_read: boolean | null;
  action_type: string | null;
  action_target: string | null;
  action_label: string | null;
  metadata: unknown;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
};

/** Database row -> model. Unknown/future types are dropped rather than guessed at. */
export function notificationFromRow(row: NotificationRow): CreatorNotification | null {
  if (!isNotificationType(row.type)) {
    return null;
  }
  const meta = NOTIFICATION_TYPE_META[row.type];
  const actionType: NotificationActionType =
    row.action_type === 'screen' || row.action_type === 'external'
      ? row.action_type
      : 'none';
  const target = actionType === 'screen' && isScreen(row.action_target) ? row.action_target : null;
  return {
    id: row.id,
    type: row.type,
    category: meta.category,
    title: String(row.title ?? '').slice(0, 160),
    message: typeof row.message === 'string' ? row.message.slice(0, 600) : '',
    isRead: row.is_read === true,
    actionType: target || actionType === 'external' ? actionType : 'none',
    actionTarget: target,
    actionLabel: typeof row.action_label === 'string' ? row.action_label.slice(0, 40) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    dedupeKey: String(row.dedupe_key ?? '').slice(0, 200),
    createdAt: row.created_at,
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
  };
}

/** Model -> database row. `user_id` is omitted on purpose: the column default
 *  is `auth.uid()`, so the database fills in the caller's own id. */
export function notificationToRow(item: CreatorNotification): NotificationRow {
  return {
    id: item.id,
    type: item.type,
    category: item.category,
    topic: NOTIFICATION_TYPE_META[item.type].topic,
    title: item.title.slice(0, 160),
    message: item.message.slice(0, 600),
    is_read: item.isRead,
    action_type: item.actionType,
    action_target: item.actionTarget,
    action_label: item.actionLabel,
    metadata: item.metadata,
    dedupe_key: item.dedupeKey.slice(0, 200),
    created_at: item.createdAt,
    read_at: item.readAt,
  };
}

// ---------- Identity ----------

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const webCrypto = typeof crypto === 'undefined' ? null : crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** UUID v4 without depending on `crypto.randomUUID` (missing on older WebViews). */
export function newNotificationId(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Short, stable, filesystem-safe fragment of an arbitrary derived sentence. */
export function slugKey(value: string, maxLength = 60): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}
