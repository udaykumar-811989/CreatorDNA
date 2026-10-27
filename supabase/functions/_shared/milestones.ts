// Milestone arithmetic shared by the community edge functions.
//
// Deliberately pure and dependency-free: it is the same table the app screen
// uses (src/lib/community/model.ts), kept here because a Deno function cannot
// import from the app tree. `milestones.test.ts` asserts the two copies agree
// so they cannot drift apart silently.

export type AchievementMilestone = 1000 | 10000 | 50000 | 100000 | 500000 | 1000000;

export const MILESTONES: AchievementMilestone[] = [1000, 10000, 50000, 100000, 500000, 1000000];

export function isMilestone(value: unknown): value is AchievementMilestone {
  return MILESTONES.includes(value as AchievementMilestone);
}

/** The next milestone to aim for, or null once every one is behind them. */
export function nextMilestone(followers: number): AchievementMilestone | null {
  const count = Number.isFinite(followers) ? Math.max(0, Math.floor(followers)) : 0;
  for (const milestone of MILESTONES) {
    if (count < milestone) return milestone;
  }
  return null;
}

/** The largest milestone already reached — null when none is. */
export function highestEarned(followers: number): AchievementMilestone | null {
  const count = Number.isFinite(followers) ? Math.max(0, Math.floor(followers)) : 0;
  let best: AchievementMilestone | null = null;
  for (const milestone of MILESTONES) {
    if (count >= milestone) best = milestone;
  }
  return best;
}

/** 0…1 progress from the previous milestone to the given one. */
export function milestoneProgress(followers: number, target: AchievementMilestone): number {
  const count = Number.isFinite(followers) ? Math.max(0, followers) : 0;
  const index = MILESTONES.indexOf(target);
  if (index < 0) return 0;
  const floor = index === 0 ? 0 : MILESTONES[index - 1];
  if (count >= target) return 1;
  if (floor >= target) return 0;
  const ratio = (count - floor) / (target - floor);
  return Math.min(1, Math.max(0, ratio));
}
