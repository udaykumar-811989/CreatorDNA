import type { CreatorAiIdea } from '../../services/creatorAi';
import type { InstagramDashboard } from '../../services/instagramDashboard';
import {
  biggestOpportunity,
  creatorType,
  dnaScore,
  formatCount,
  humanizeMediaType,
  periodTotals,
  previousPeriodTotals,
  topFormatByLikes,
  topTopicOf,
  type PlanStatus,
} from '../derived';
import type { AnalysisRecord } from '../storage';
import {
  dayKey,
  isoWeekKey,
  newNotificationId,
  NOTIFICATION_TYPE_META,
  notificationAllowed,
  reminderLabel,
  slugKey,
  type CreatorNotification,
  type NotificationPrefs,
  type NotificationType,
} from './model';

// The event engine.
//
// Every notification comes from something the app actually observed: the
// creator's own analytics, their own analyses, their own plan, or a real
// connection/sync state. Nothing here invents a number, an achievement or a
// comparison the data does not support, and every trigger carries a dedupe key
// plus a threshold so the same event can never turn into a stream of nudges.

// ---------- Signals ----------

export type MetricSnapshot = { at: number; followers: number };

/**
 * The small amount of history needed to notice *change*. Instagram does not
 * share follower history, so followers are sampled locally (one reading per
 * interval) — a comparison of two real observations, never a projection.
 * `null` fields mean "not seen yet": the first run learns a baseline instead
 * of firing a burst of notifications on upgrade.
 */
export type NotificationSignals = {
  dnaScore: number | null;
  ideaCount: number | null;
  lastSyncAt: string | null;
  reconnectAlerted: boolean;
  syncFailedAlerted: boolean;
  snapshots: MetricSnapshot[];
};

export const EMPTY_NOTIFICATION_SIGNALS: NotificationSignals = {
  dnaScore: null,
  ideaCount: null,
  lastSyncAt: null,
  reconnectAlerted: false,
  syncFailedAlerted: false,
  snapshots: [],
};

// ---------- Thresholds ----------

const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FOLLOWER_STEP_ABSOLUTE = 50;
const FOLLOWER_STEP_RATIO = 0.03;
const ENGAGEMENT_MIN_PCT = 15;
const ENGAGEMENT_MIN_INTERACTIONS = 10;
const OUTPERFORM_RATIO = 1.5;
const OUTPERFORM_MIN_LIKES = 10;
const OUTPERFORM_MIN_POSTS = 5;
const DNA_SCORE_STEP = 0.5;
const AI_OPPORTUNITY_MIN_RECORDS = 3;

export type GenerateInput = {
  now: number;
  dashboard: InstagramDashboard | null;
  records: AnalysisRecord[];
  ideas: CreatorAiIdea[];
  /** Today's planned idea and its pipeline status, or null when nothing is planned. */
  planToday: { idea: CreatorAiIdea; status: PlanStatus } | null;
  dashboardError: 'reconnect_required' | 'try_again' | null;
  lastSyncedAt: string | null;
  prefs: NotificationPrefs;
  reminderTime: string;
  /** Dedupe keys already known: live notifications plus ones the creator deleted. */
  state: { knownKeys: readonly string[] };
  signals: NotificationSignals;
};

export type GenerateResult = {
  notifications: CreatorNotification[];
  signals: NotificationSignals;
};

type Draft = {
  type: NotificationType;
  title: string;
  message: string;
  dedupeKey: string;
  action?: { label: string; target: CreatorNotification['actionTarget'] } | null;
  metadata?: Record<string, unknown>;
};

function withArticle(word: string): string {
  const clean = word.trim() || 'post';
  return `${/^[aeiou]/i.test(clean) ? 'an' : 'a'} ${clean}`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function interactionsOf(totals: { likes: number | null; comments: number | null } | null): number | null {
  if (!totals || (totals.likes === null && totals.comments === null)) {
    return null;
  }
  return (totals.likes ?? 0) + (totals.comments ?? 0);
}

function interactionDelta(
  current: number | null,
  previous: number | null,
): { pct: number; up: boolean } | null {
  if (current === null || previous === null) return null;
  if (previous < ENGAGEMENT_MIN_INTERACTIONS || current < ENGAGEMENT_MIN_INTERACTIONS) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (!Number.isFinite(pct)) return null;
  return { pct, up: pct > 0 };
}

function followerStep(
  previous: number,
  current: number,
): number | null {
  const delta = current - previous;
  const threshold = Math.max(FOLLOWER_STEP_ABSOLUTE, Math.abs(previous) * FOLLOWER_STEP_RATIO);
  return Math.abs(delta) >= threshold ? delta : null;
}

/**
 * Turns the current state of the app into the notifications that are actually
 * worth showing. Pure: same inputs, same output — no side effects, no clock
 * reads outside `now`, so it is directly unit-testable.
 */
export function generateNotifications(input: GenerateInput): GenerateResult {
  const { now, prefs, signals, dashboard, records, ideas, planToday } = input;
  const today = new Date(now);
  const drafts: Draft[] = [];
  const next: NotificationSignals = {
    ...signals,
    snapshots: [...signals.snapshots],
  };

  const push = (draft: Draft): void => {
    if (input.state.knownKeys.includes(draft.dedupeKey)) return;
    drafts.push(draft);
  };

  // ---- Account / sync (critical: never silenced by a preference) ----
  //
  // One alert per problem episode rather than one per day: an unresolved
  // connection problem must not keep re-announcing itself while it sits there.
  if (input.dashboardError === 'reconnect_required') {
    if (!signals.reconnectAlerted) {
      const username = dashboard?.profile.username ?? null;
      push({
        type: 'account_reconnect',
        title: 'Instagram needs to be reconnected.',
        message: username
          ? `@${username} stopped sharing analytics. Reconnect to keep your numbers current.`
          : 'Your Instagram session expired. Reconnect to keep your numbers current.',
        dedupeKey: `account:reconnect:${dayKey(today)}`,
        metadata: username ? { username } : {},
      });
      next.reconnectAlerted = true;
    }
  } else {
    next.reconnectAlerted = false;
  }

  if (input.dashboardError === 'try_again') {
    if (!signals.syncFailedAlerted) {
      push({
        type: 'account_sync_failed',
        title: 'Instagram analytics could not refresh.',
        message: 'Your numbers stayed exactly as they were. The next refresh will try again.',
        dedupeKey: `account:sync_failed:${dayKey(today)}`,
      });
      next.syncFailedAlerted = true;
    }
  } else {
    next.syncFailedAlerted = false;
  }

  // A completed sync is only news when a meaningful amount of time has passed
  // since the last one we reported — a manual refresh five minutes later is
  // not an event.
  const syncedAtMs = input.lastSyncedAt ? Date.parse(input.lastSyncedAt) : NaN;
  if (dashboard && Number.isFinite(syncedAtMs)) {
    if (signals.lastSyncAt === null) {
      next.lastSyncAt = input.lastSyncedAt;
    } else {
      const previousMs = Date.parse(signals.lastSyncAt);
      if (Number.isFinite(previousMs) && syncedAtMs - previousMs > 24 * 60 * 60 * 1000) {
        push({
          type: 'account_sync_ok',
          title: 'Instagram analytics updated successfully.',
          message: 'Your latest followers, views and engagement are now in CreatorDNA.',
          dedupeKey: `account:sync:${dayKey(new Date(syncedAtMs))}`,
          metadata: { syncedAt: input.lastSyncedAt },
        });
        next.lastSyncAt = input.lastSyncedAt;
      }
    }
  }

  // ---- Growth: followers (sampled) ----
  const followers = dashboard?.stats.followers ?? null;
  if (followers !== null && followers >= 0) {
    const last = next.snapshots.length > 0 ? next.snapshots[next.snapshots.length - 1] : null;
    if (!last) {
      next.snapshots = [{ at: now, followers }];
    } else if (now - last.at >= SNAPSHOT_INTERVAL_MS) {
      const step = followerStep(last.followers, followers);
      if (step !== null) {
        push({
          type: 'growth_followers',
          title: step > 0 ? 'Your follower count is climbing' : 'Your follower count dipped',
          message:
            `${step > 0 ? '+' : ''}${formatCount(step)} followers since your last reading ` +
            `— now ${formatCount(followers)}.`,
          dedupeKey: `growth:followers:${dayKey(today)}`,
          metadata: {
            previous: last.followers,
            current: followers,
            change: step,
            sampledAt: last.at,
          },
        });
      }
      if (next.snapshots.length >= 40) next.snapshots.shift();
      next.snapshots.push({ at: now, followers });
    }
  }

  // ---- Growth: engagement vs the previous comparison period ----
  //
  // Both windows come from Instagram's own daily series, so the comparison is
  // real. The message reports the interaction counts that were observed, not a
  // rate reconstructed from a follower base we don't have for the old window.
  if (dashboard) {
    const current = interactionsOf(periodTotals(dashboard, 7, today));
    const previous = interactionsOf(previousPeriodTotals(dashboard, 7, today));
    const delta = interactionDelta(current, previous);
    if (delta && delta.pct >= ENGAGEMENT_MIN_PCT && delta.up) {
      push({
        type: 'growth_engagement',
        title: 'Your engagement is improving',
        message:
          `${formatCount(current)} likes and comments in the last 7 days — ` +
          `${delta.pct}% more than the previous 7 days (${formatCount(previous)}).`,
        dedupeKey: `growth:engagement:${isoWeekKey(today)}`,
        metadata: { current, previous, pct: delta.pct },
      });
    }
  }

  // ---- Content: one post pulling ahead of this creator's own baseline ----
  if (dashboard) {
    const scored = dashboard.media.filter((item) => item.likes !== null && (item.likes ?? 0) >= 0);
    if (scored.length >= OUTPERFORM_MIN_POSTS) {
      const sorted = [...scored].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
      const top = sorted[0];
      const rest = sorted.slice(1).map((item) => item.likes ?? 0);
      const baseline = median(rest);
      const likes = top.likes ?? 0;
      if (
        likes >= OUTPERFORM_MIN_LIKES &&
        baseline > 0 &&
        likes >= Math.round(baseline * OUTPERFORM_RATIO)
      ) {
        const record = records.find((item) => item.mediaId === top.id) ?? null;
        // `humanizeMediaType` already yields the plural ("Reels"), which is
        // what "One of your Reels…" needs.
        const format = humanizeMediaType(top.mediaType);
        push({
          type: 'content_outperform',
          title: `One of your ${format}s is outperforming your recent posts`,
          message:
            `${formatCount(likes)} likes against a median of ${formatCount(baseline)} ` +
            `across your other ${rest.length} recent posts.`,
          dedupeKey: `content:outperform:${top.id}`,
          action: record
            ? { label: 'Analyze Why', target: 'analysis' }
            : { label: 'Analyze Why', target: 'performance' },
          metadata: {
            mediaId: top.id,
            recordId: record?.id ?? null,
            permalink: top.permalink ?? null,
            likes,
            baseline,
            compared: rest.length,
          },
        });
      }
    }
  }

  // ---- AI: an opportunity derived from the creator's own analyzed material ----
  if (records.length >= AI_OPPORTUNITY_MIN_RECORDS) {
    const subject = topTopicOf(records) ?? topFormatByLikes(dashboard);
    const opportunity = biggestOpportunity(records, dashboard);
    if (subject && opportunity) {
      push({
        type: 'ai_opportunity',
        title: 'CreatorDNA found a content opportunity',
        message: opportunity,
        dedupeKey: `ai:opportunity:${slugKey(subject)}`,
        metadata: { subject, records: records.length },
      });
    }
  }

  // ---- AI: a fresh batch of ideas ----
  if (signals.ideaCount === null) {
    next.ideaCount = ideas.length; // baseline: no notification for old ideas
  } else if (ideas.length > signals.ideaCount) {
    push({
      type: 'ideas_ready',
      title: `${ideas.length} content ideas are ready`,
      message: `CreatorDNA wrote ${ideas.length - signals.ideaCount} new idea${ideas.length - signals.ideaCount === 1 ? '' : 's'} for this account, ordered from high to medium priority.`,
      dedupeKey: `ai:ideas:${ideas.length}`,
      metadata: { count: ideas.length, added: ideas.length - signals.ideaCount },
    });
    next.ideaCount = ideas.length;
  } else {
    next.ideaCount = ideas.length;
  }

  // ---- Creator DNA moved ----
  const score = dnaScore(records);
  if (score !== null) {
    if (signals.dnaScore === null) {
      next.dnaScore = score;
    } else if (Math.abs(score - signals.dnaScore) >= DNA_SCORE_STEP) {
      const type = creatorType(records);
      push({
        type: 'dna',
        title: 'Your Creator DNA changed',
        message: type
          ? `Your Creator Type is ${type.label}. The score moved from ${signals.dnaScore} to ${score} out of 10.`
          : `Your DNA score moved from ${signals.dnaScore} to ${score} out of 10.`,
        dedupeKey: `dna:${score.toFixed(1)}`,
        metadata: {
          score,
          previousScore: signals.dnaScore,
          creatorType: type?.label ?? null,
        },
      });
      // Only a real move re-bases the comparison, so a slow drift still
      // accumulates until it crosses the threshold.
      next.dnaScore = score;
    }
  }

  // ---- Plan reminder for today ----
  if (planToday && planToday.status !== 'skipped') {
    const format = planToday.idea.format?.trim() || 'post';
    push({
      type: 'plan_today',
      title: `You planned ${withArticle(format)} for today`,
      message: `Your planned posting time is ${reminderLabel(input.reminderTime)}.`,
      dedupeKey: `plan:${dayKey(today)}`,
      metadata: {
        idea: planToday.idea.title,
        format,
        reminderTime: input.reminderTime,
        status: planToday.status,
      },
    });
  }

  // ---- Weekly report ready ----
  if (dashboard || records.length > 0) {
    push({
      type: 'weekly_report',
      title: 'Your weekly CreatorDNA report is ready.',
      message: 'Seven days of your own analytics — what worked, what did not, and what to post next.',
      dedupeKey: `report:${isoWeekKey(today)}`,
      metadata: { week: isoWeekKey(today) },
    });
  }

  // ---- Materialise ----
  const createdAt = new Date(now).toISOString();
  const notifications = drafts
    .filter((draft) => notificationAllowed(draft.type, prefs))
    .map((draft): CreatorNotification => {
      const meta = NOTIFICATION_TYPE_META[draft.type];
      const action = draft.action !== undefined ? draft.action : meta.defaultAction;
      return {
        id: newNotificationId(),
        type: draft.type,
        category: meta.category,
        title: draft.title.slice(0, 160),
        message: draft.message.slice(0, 600),
        isRead: false,
        actionType: action && action.target ? 'screen' : 'none',
        actionTarget: action && action.target ? action.target : null,
        actionLabel: action && action.target ? action.label : null,
        metadata: draft.metadata ?? {},
        dedupeKey: draft.dedupeKey.slice(0, 200),
        createdAt,
        readAt: null,
      };
    });

  return { notifications, signals: next };
}
