import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isScreen } from '../types';
import { toDateKey } from '../derived';
import type { AnalysisRecord } from '../storage';
import type { CreatorAiIdea } from '../../services/creatorAi';
import type { InstagramDashboard } from '../../services/instagramDashboard';
import {
  EMPTY_NOTIFICATION_SIGNALS,
  generateNotifications,
  type GenerateInput,
  type NotificationSignals,
} from './generate';
import {
  DEFAULT_NOTIFICATION_PREFS,
  groupNotifications,
  isNotificationType,
  NOTIFICATION_TYPE_META,
  notificationAllowed,
  reminderLabel,
  unreadCount,
  type CreatorNotification,
  type NotificationPrefs,
} from './model';
import {
  EMPTY_NOTIFICATION_STATE,
  addNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  mergeRemoteNotifications,
  removeNotification,
} from './store';

// Local noon on a fixed Tuesday, so every date-bucket (today / yesterday /
// ISO week / day dedupe key) is deterministic regardless of when it runs.
const NOW = new Date(2026, 9, 27, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

function makeRecord(id: string, mediaId?: string): AnalysisRecord {
  return {
    id,
    createdAt: new Date(2026, 9, 1).toISOString(),
    title: `Post ${id}`,
    transcript: null,
    caption: null,
    metrics: {},
    ...(mediaId ? { mediaId } : {}),
    analysis: {
      summary: 'A real analysis of a real post.',
      topics: { primary: 'Gym tips', secondary: [] },
      hook: { text: null, type: 'question' },
      format: 'Reel',
      structure: { setup: null, value: null, payoff: null, cta: null },
      transcript_analysis: {
        clarity: '',
        specificity: '',
        information_density: '',
        repetition: '',
        confusing_sections: [],
      },
      cta: { present: false, type: null, text: null },
      pacing: { assessment: 'not_assessable', observations: [] },
      strengths: ['Clear opening'],
      improvement_opportunities: ['Tighten the middle'],
      scores: { hook: 8, retention: 7, engagement: 6, content_quality: 7, cta: 5 },
      evidence: [],
      confidence: 'moderate',
      limitations: [],
      duration_seconds: 30,
    },
  };
}

function makeIdea(title: string, format = 'Reel'): CreatorAiIdea {
  return { title, hook: 'Hook', concept: 'Concept', format, cta: 'Save this', priority: 'high' };
}

function makeDashboard(patch: Partial<InstagramDashboard> = {}): InstagramDashboard {
  return {
    profile: {
      username: 'creator',
      accountType: 'Business',
      profilePictureUrl: null,
      followersCount: 1000,
      mediaCount: 6,
    },
    stats: {
      views: 5_000,
      likes: 300,
      comments: 30,
      followers: 1_000,
      reach: null,
      shares: null,
      saves: null,
      profileViews: null,
      week: { views: null, likes: null, comments: null },
      ninety: { views: null, likes: null, comments: null },
      previous: null,
    },
    media: [],
    daily: null,
    ...patch,
  };
}

/** 14 local days ending today; the first 7 are the current window. */
function dailySeries(currentLikes: number, previousLikes: number): InstagramDashboard['daily'] {
  const now = new Date(NOW);
  const points = [];
  for (let index = 0; index < 14; index += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - index);
    points.push({
      date: toDateKey(day),
      views: 100,
      likes: index < 7 ? currentLikes : previousLikes,
      comments: 0,
    });
  }
  return points;
}

function media(likes: number[]): InstagramDashboard['media'] {
  return likes.map((value, index) => ({
    id: `m${index + 1}`,
    mediaType: 'VIDEO' as const,
    thumbnailUrl: null,
    permalink: `https://instagram.com/p/${index + 1}`,
    timestamp: null,
    likes: value,
    comments: 1,
    caption: null,
  }));
}

type Overrides = Partial<Omit<GenerateInput, 'state' | 'signals'>> & {
  knownKeys?: string[];
  signals?: NotificationSignals;
};

function run(overrides: Overrides = {}) {
  const { knownKeys = [], signals = EMPTY_NOTIFICATION_SIGNALS, ...rest } = overrides;
  return generateNotifications({
    now: NOW,
    dashboard: null,
    records: [],
    ideas: [],
    planToday: null,
    dashboardError: null,
    lastSyncedAt: null,
    prefs: DEFAULT_NOTIFICATION_PREFS,
    reminderTime: DEFAULT_NOTIFICATION_PREFS.reminderTime,
    state: { knownKeys },
    signals,
    ...rest,
  });
}

const typesOf = (items: readonly CreatorNotification[]): string[] =>
  items.map((item) => item.type).sort();

function prefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...patch, topics: { ...DEFAULT_NOTIFICATION_PREFS.topics, ...(patch.topics ?? {}) } };
}

describe('generateNotifications', () => {
  it('learns a baseline on the first run instead of firing a burst', () => {
    const result = run({ ideas: [makeIdea('One')] });
    assert.deepEqual(result.notifications, []);
    assert.equal(result.signals.ideaCount, 1);
    assert.equal(result.signals.dnaScore, null);
  });

  it('bases the Creator DNA comparison on a score it has already seen', () => {
    const first = run({ records: [makeRecord('a')] });
    assert.deepEqual(
      first.notifications.filter((item) => item.type === 'dna'),
      [],
      'the first score is a baseline, not an announcement',
    );
    assert.equal(first.signals.dnaScore, 6.6);
  });

  it('never repeats an event it has already produced', () => {
    const input = {
      dashboard: makeDashboard(),
      planToday: { idea: makeIdea('Evening reel'), status: 'draft' as const },
    };
    const first = run(input);
    assert.ok(first.notifications.length > 0, 'expected at least one notification');

    const second = run({
      ...input,
      knownKeys: first.notifications.map((item) => item.dedupeKey),
      signals: first.signals,
    });
    assert.deepEqual(second.notifications, []);
  });

  it('does not resurrect an event the creator deleted', () => {
    const input = {
      dashboard: makeDashboard(),
      planToday: { idea: makeIdea('Evening reel'), status: 'draft' as const },
    };
    const first = run(input);
    const deleted = first.notifications.map((item) => item.dedupeKey);
    const second = run({ ...input, knownKeys: deleted, signals: first.signals });
    assert.deepEqual(second.notifications, []);
  });

  it('keeps critical account alerts while every optional switch is off', () => {
    const result = run({
      dashboardError: 'reconnect_required',
      dashboard: makeDashboard(),
      planToday: { idea: makeIdea('Reel'), status: 'draft' as const },
      prefs: prefs({ master: false, topics: { ...DEFAULT_NOTIFICATION_PREFS.topics, account: false } }),
    });
    assert.deepEqual(typesOf(result.notifications), ['account_reconnect']);
  });

  it('respects a single category switch without touching the others', () => {
    const base = {
      dashboard: makeDashboard(),
      planToday: { idea: makeIdea('Reel'), status: 'draft' as const },
    };
    const muted = run({ ...base, prefs: prefs({ topics: { ...DEFAULT_NOTIFICATION_PREFS.topics, weekly: false } }) });
    assert.ok(!muted.notifications.some((item) => item.type === 'weekly_report'));
    assert.ok(muted.notifications.some((item) => item.type === 'plan_today'));
  });

  it('reports one reconnect alert per episode, not one per day', () => {
    const first = run({ dashboardError: 'reconnect_required' });
    assert.equal(
      first.notifications.filter((item) => item.type === 'account_reconnect').length,
      1,
    );
    // Still broken: no repeat.
    const again = run({ dashboardError: 'reconnect_required', signals: first.signals });
    assert.deepEqual(again.notifications, []);
    assert.equal(again.signals.reconnectAlerted, true);
    // Recovered: the flag clears, so a later failure can announce itself once.
    const recovered = run({ dashboardError: null, signals: again.signals });
    assert.equal(recovered.signals.reconnectAlerted, false);
  });

  it('claims an engagement improvement only when the numbers move far enough', () => {
    const strong = run({ dashboard: makeDashboard({ daily: dailySeries(100, 10) }) });
    assert.deepEqual(typesOf(strong.notifications), ['growth_engagement', 'weekly_report']);

    const weak = run({ dashboard: makeDashboard({ daily: dailySeries(11, 10) }) });
    assert.deepEqual(
      weak.notifications.filter((item) => item.type === 'growth_engagement'),
      [],
    );
  });

  it('samples followers and alerts only on a meaningful step', () => {
    const start = run({ dashboard: makeDashboard({ stats: { ...makeDashboard().stats, followers: 1_000 } }) });
    assert.equal(start.signals.snapshots.length, 1);
    assert.deepEqual(
      start.notifications.filter((item) => item.type.startsWith('growth_')),
      [],
      'the first reading is a baseline',
    );

    // Same account, seven hours later: the baseline reading is now old enough
    // to be compared against.
    const sampled: NotificationSignals = {
      ...start.signals,
      snapshots: [{ at: NOW - 7 * HOUR, followers: 1_000 }],
    };
    const up = run({
      dashboard: makeDashboard({ stats: { ...makeDashboard().stats, followers: 1_100 } }),
      signals: sampled,
    });
    assert.deepEqual(
      typesOf(up.notifications.filter((item) => item.type.startsWith('growth_'))),
      ['growth_followers'],
    );
    assert.equal(up.signals.snapshots.length, 2, 'the new reading is kept for next time');

    const noise = run({
      dashboard: makeDashboard({ stats: { ...makeDashboard().stats, followers: 1_010 } }),
      signals: sampled,
    });
    assert.deepEqual(
      noise.notifications.filter((item) => item.type.startsWith('growth_')),
      [],
    );
    assert.equal(noise.signals.snapshots.length, 2, 'a small move is still sampled');
  });

  it('reminds about today’s plan with the configured time, and never for a skipped day', () => {
    const result = run({
      planToday: { idea: makeIdea('Morning reel', 'Reel'), status: 'scheduled' },
      reminderTime: '07:30',
    });
    const reminder = result.notifications.find((item) => item.type === 'plan_today');
    assert.ok(reminder, 'expected a plan reminder');
    assert.equal(reminder.title, 'You planned a Reel for today');
    assert.match(reminder.message, /7:30 AM/);

    const skipped = run({
      planToday: { idea: makeIdea('Morning reel', 'Reel'), status: 'skipped' },
      reminderTime: '07:30',
    });
    assert.deepEqual(
      skipped.notifications.filter((item) => item.type === 'plan_today'),
      [],
    );
  });

  it('deep-links every notification to a screen the app actually has', () => {
    const dashboard = makeDashboard({
      stats: { ...makeDashboard().stats, followers: 1_100 },
      daily: dailySeries(100, 10),
      media: media([200, 30, 25, 20, 15, 10]),
    });
    const result = run({
      dashboard,
      records: [makeRecord('a', 'm1'), makeRecord('b'), makeRecord('c')],
      ideas: [makeIdea('One'), makeIdea('Two')],
      planToday: { idea: makeIdea('Evening reel'), status: 'draft' },
      dashboardError: 'reconnect_required',
      lastSyncedAt: new Date(NOW - 48 * HOUR).toISOString(),
      knownKeys: [],
      signals: {
        dnaScore: 6,
        ideaCount: 1,
        lastSyncAt: new Date(NOW - 96 * HOUR).toISOString(),
        reconnectAlerted: false,
        syncFailedAlerted: false,
        snapshots: [{ at: NOW - 7 * HOUR, followers: 1_000 }],
      },
    });

    const expected = [
      'account_reconnect',
      'account_sync_ok',
      'ai_opportunity',
      'content_outperform',
      'dna',
      'growth_engagement',
      'growth_followers',
      'ideas_ready',
      'plan_today',
      'weekly_report',
    ];
    assert.deepEqual(typesOf(result.notifications), expected);

    for (const item of result.notifications) {
      assert.ok(isNotificationType(item.type), `unknown type ${item.type}`);
      assert.equal(item.category, NOTIFICATION_TYPE_META[item.type].category);
      assert.ok(item.dedupeKey.length > 0 && item.dedupeKey.length <= 200);
      assert.ok(item.title.length > 0 && item.title.length <= 160);
      assert.ok(item.message.length <= 600);
      if (item.actionTarget !== null) {
        assert.ok(isScreen(item.actionTarget), `bad target ${item.actionTarget}`);
        assert.ok((item.actionLabel ?? '').length > 0, 'a target needs a label');
      }
    }

    // The post that beat its own baseline deep-links to that post's analysis.
    const outperform = result.notifications.find((item) => item.type === 'content_outperform');
    assert.equal(outperform?.actionTarget, 'analysis');
    assert.equal(outperform?.metadata.recordId, 'a');
  });

  it('is pure: the same inputs produce the same output', () => {
    const input = {
      dashboard: makeDashboard({ daily: dailySeries(100, 10) }),
      records: [makeRecord('a'), makeRecord('b'), makeRecord('c')],
      ideas: [makeIdea('One')],
    };
    const first = run(input);
    const second = run(input);
    assert.deepEqual(typesOf(first.notifications), typesOf(second.notifications));
    assert.deepEqual(first.signals, second.signals);
  });
});

describe('preferences', () => {
  it('never silences a critical notification', () => {
    const off = prefs({ master: false });
    assert.equal(notificationAllowed('account_reconnect', off), true);
    assert.equal(notificationAllowed('account_sync_failed', off), true);
    assert.equal(notificationAllowed('weekly_report', off), false);
  });

  it('follows the master switch for everything optional', () => {
    const off = prefs({ master: false });
    for (const [type, meta] of Object.entries(NOTIFICATION_TYPE_META)) {
      if (meta.critical) continue;
      assert.equal(notificationAllowed(type as keyof typeof NOTIFICATION_TYPE_META, off), false);
    }
  });
});

describe('reminderLabel', () => {
  it('renders the 12-hour time the notifications use', () => {
    assert.equal(reminderLabel('20:15'), '8:15 PM');
    assert.equal(reminderLabel('07:30'), '7:30 AM');
    assert.equal(reminderLabel('00:00'), '12:00 AM');
    assert.equal(reminderLabel('12:05'), '12:05 PM');
  });
});

describe('notification list helpers', () => {
  const item = (id: string, at: number, read = false): CreatorNotification => ({
    id,
    type: 'weekly_report',
    category: 'insights',
    title: `Notification ${id}`,
    message: '',
    isRead: read,
    actionType: 'screen',
    actionTarget: 'weeklyReport',
    actionLabel: 'View Report',
    metadata: {},
    dedupeKey: `key-${id}`,
    createdAt: new Date(at).toISOString(),
    readAt: read ? new Date(at).toISOString() : null,
  });

  it('counts unread correctly', () => {
    const items = [item('1', NOW), item('2', NOW - HOUR, true), item('3', NOW - 2 * HOUR)];
    assert.equal(unreadCount(items), 2);
    assert.equal(unreadCount([]), 0);
  });

  it('groups into Today, Yesterday and Earlier', () => {
    const items = [
      item('today', NOW - HOUR),
      item('yesterday', NOW - 26 * HOUR),
      item('older', NOW - 5 * 24 * HOUR),
    ];
    const groups = groupNotifications(items, new Date(NOW));
    assert.deepEqual(
      groups.map((group) => [group.key, group.items.length]),
      [
        ['today', 1],
        ['yesterday', 1],
        ['earlier', 1],
      ],
    );
  });
});

describe('notification store', () => {
  const item = (id: string, dedupeKey: string): CreatorNotification => ({
    id,
    type: 'weekly_report',
    category: 'insights',
    title: 'Report ready',
    message: '',
    isRead: false,
    actionType: 'screen',
    actionTarget: 'weeklyReport',
    actionLabel: 'View Report',
    metadata: {},
    dedupeKey,
    createdAt: new Date(NOW).toISOString(),
    readAt: null,
  });

  it('deduplicates by id and by dedupe key', () => {
    let state = EMPTY_NOTIFICATION_STATE;
    state = addNotifications(state, [item('1', 'a'), item('2', 'b')], NOW);
    state = addNotifications(state, [item('1', 'a'), item('3', 'a')], NOW);
    assert.deepEqual(
      state.items.map((entry) => entry.id),
      ['1', '2'],
    );
  });

  it('marks one read, marks all read, and counts unread', () => {
    let state = addNotifications(EMPTY_NOTIFICATION_STATE, [item('1', 'a'), item('2', 'b')], NOW);
    assert.equal(unreadCount(state.items), 2);
    state = markNotificationRead(state, '1', new Date(NOW).toISOString());
    assert.equal(unreadCount(state.items), 1);
    assert.equal(state.items.find((entry) => entry.id === '1')?.isRead, true);
    state = markAllNotificationsRead(state, new Date(NOW).toISOString());
    assert.equal(unreadCount(state.items), 0);
    // Idempotent: a second pass is a no-op, not a new state object.
    assert.equal(markAllNotificationsRead(state), state);
  });

  it('a delete stays deleted even after the same event is recomputed', () => {
    let state = addNotifications(EMPTY_NOTIFICATION_STATE, [item('1', 'report:2026-W44')], NOW);
    state = removeNotification(state, '1');
    assert.deepEqual(state.items, []);
    assert.deepEqual(state.tombstones, ['1']);
    assert.ok(state.handledKeys.includes('report:2026-W44'));

    state = addNotifications(state, [item('9', 'report:2026-W44')], NOW);
    assert.deepEqual(state.items, [], 'the same event must not come back');
  });

  it('folds the server copy in without resurrecting a local delete', () => {
    const local = addNotifications(EMPTY_NOTIFICATION_STATE, [item('1', 'a')], NOW);
    const readRemote: CreatorNotification = {
      ...item('1', 'a'),
      isRead: true,
      readAt: new Date(NOW).toISOString(),
    };
    const merged = mergeRemoteNotifications(local, [readRemote, item('2', 'b')], NOW);
    assert.equal(unreadCount(merged.items), 1, 'read state is monotonic, and row 2 was added');
    assert.ok(merged.items.some((entry) => entry.id === '2'));

    const deleted = removeNotification(local, '1');
    const raced = mergeRemoteNotifications(deleted, [readRemote], NOW);
    assert.deepEqual(raced.items, [], 'a row this device deleted does not come back');
  });
});
