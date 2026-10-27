import { supabaseAnonKey, supabaseUrl } from '../lib/config';
import { MILESTONES, type AchievementMilestone } from '../lib/community/model';

// Verified follower sync.
//
// The follower count is never supplied by the app. This posts the Instagram
// token the creator already holds to the `community` edge function, which asks
// Instagram for the number and awards milestones server-side. Only Instagram's
// answer can come back, so nothing here can be used to claim a reward.

const FUNCTION_URL = `${supabaseUrl}/functions/v1/community/followers`;
const TIMEOUT_MS = 30_000;

export type SyncFailureKind =
  | 'not_connected'
  | 'rejected'
  | 'unreachable'
  | 'unauthorized'
  | 'invalid';

export type SyncResult =
  | {
      ok: true;
      followers: number;
      username: string;
      /** Milestones Instagram's number just unlocked, newest first. */
      earned: AchievementMilestone[];
      next: AchievementMilestone | null;
      measuredAt: string;
    }
  | { ok: false; kind: SyncFailureKind; message: string };

const MESSAGES: Record<SyncFailureKind, string> = {
  not_connected: 'Connect Instagram first — a milestone needs a verified follower count.',
  rejected: "Instagram did not accept this connection. Reconnect Instagram, then try again.",
  unreachable: 'Instagram could not be reached just now. Please retry.',
  unauthorized: 'Your session has expired. Sign in again to refresh followers.',
  invalid: 'CreatorDNA received an unexpected response. Please retry.',
};

function isMilestone(value: unknown): value is AchievementMilestone {
  return MILESTONES.includes(value as AchievementMilestone);
}

export async function syncVerifiedFollowers(
  supabaseAccessToken: string,
  instagramAccessToken: string,
): Promise<SyncResult> {
  if (!supabaseAccessToken || !instagramAccessToken) {
    return { ok: false, kind: 'not_connected', message: MESSAGES.not_connected };
  }

  let response: Response;
  try {
    response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instagramAccessToken }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: 'unreachable', message: MESSAGES.unreachable };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error =
      body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
    const kind: SyncFailureKind =
      error === 'instagram_not_connected'
        ? 'not_connected'
        : error === 'instagram_rejected'
          ? 'rejected'
          : error === 'instagram_unreachable'
            ? 'unreachable'
            : error === 'unauthorized'
              ? 'unauthorized'
              : response.status === 401
                ? 'unauthorized'
                : 'unreachable';
    const message =
      body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
        ? ((body as { message: string }).message)
        : MESSAGES[kind];
    return { ok: false, kind, message };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, kind: 'invalid', message: MESSAGES.invalid };
  }

  const record = body as Record<string, unknown>;
  const followers = Number(record.followers);
  if (!Number.isFinite(followers) || followers < 0) {
    return { ok: false, kind: 'invalid', message: MESSAGES.invalid };
  }

  const earned = Array.isArray(record.earned)
    ? record.earned.filter(isMilestone).slice(0, MILESTONES.length)
    : [];
  const measuredAt =
    typeof record.measuredAt === 'string' && !Number.isNaN(Date.parse(record.measuredAt))
      ? new Date(record.measuredAt).toISOString()
      : new Date().toISOString();

  return {
    ok: true,
    followers: Math.round(followers),
    username: typeof record.username === 'string' ? record.username : '',
    earned,
    next: isMilestone(record.next) ? record.next : null,
    measuredAt,
  };
}

/**
 * The text of the shareable celebration card.
 *
 * Kept as plain text rather than an image so it needs no extra dependency and
 * still reads well in any app it is pasted into.
 */
export function milestoneShareText(options: {
  milestone: AchievementMilestone;
  followers: number;
  handle: string | null;
  measuredAt: string;
}): string {
  const label = options.followers.toLocaleString('en-US');
  const who = options.handle ? `@${options.handle.replace(/^@/, '')}` : 'A creator on CreatorDNA';
  return [
    `🏆 ${who} just reached ${label} followers on Instagram`,
    '',
    `Unlocked the ${options.milestone.toLocaleString('en-US')} follower milestone in CreatorDNA`,
    `Verified by Instagram on ${new Date(options.measuredAt).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`,
    '',
    'Know your DNA. Grow your audience. — CreatorDNA',
  ].join('\n');
}
