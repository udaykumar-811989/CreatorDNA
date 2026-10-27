import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MILESTONES,
  highestEarned,
  isMilestone,
  milestoneProgress,
  nextMilestone,
} from './milestones';
// The app ships its own copy (Deno cannot import across the tree boundary).
// Reading it from here is what keeps the two definitions honest.
import {
  MILESTONES as APP_MILESTONES,
  highestEarned as appHighestEarned,
  milestoneProgress as appMilestoneProgress,
  nextMilestone as appNextMilestone,
} from '../../../src/lib/community/model';

test('the function copy and the app copy of the milestone table are identical', () => {
  assert.deepEqual(MILESTONES, APP_MILESTONES);
  assert.deepEqual(MILESTONES, [1000, 10000, 50000, 100000, 500000, 1000000]);
});

test('the two copies agree at every boundary', () => {
  const probes = [
    -5, 0, 1, 999, 1000, 1001, 9999, 10000, 49_999, 50_000, 99_999, 100_000,
    499_999, 500_000, 999_999, 1_000_000, 1_000_001, 5_000_000, Number.NaN,
  ];
  for (const probe of probes) {
    assert.equal(nextMilestone(probe), appNextMilestone(probe), `next(${probe})`);
    assert.equal(highestEarned(probe), appHighestEarned(probe), `highest(${probe})`);
    for (const target of MILESTONES) {
      assert.equal(
        milestoneProgress(probe, target),
        appMilestoneProgress(probe, target),
        `progress(${probe}, ${target})`,
      );
    }
  }
});

test('nextMilestone walks the ladder and stops at the end', () => {
  assert.equal(nextMilestone(0), 1000);
  assert.equal(nextMilestone(999), 1000);
  assert.equal(nextMilestone(1000), 10_000);
  assert.equal(nextMilestone(10_000), 50_000);
  assert.equal(nextMilestone(50_000), 100_000);
  assert.equal(nextMilestone(100_000), 500_000);
  assert.equal(nextMilestone(500_000), 1_000_000);
  assert.equal(nextMilestone(1_000_000), null);
  // A garbage reading behaves like zero rather than yielding a bogus target.
  assert.equal(nextMilestone(-40), 1000);
  assert.equal(nextMilestone(Number.NaN), 1000);
});

test('highestEarned only reports a milestone actually reached', () => {
  assert.equal(highestEarned(999), null);
  assert.equal(highestEarned(1000), 1000);
  assert.equal(highestEarned(60_000), 50_000);
  assert.equal(highestEarned(1_000_000), 1_000_000);
  assert.equal(highestEarned(-1), null);
});

test('milestoneProgress fills the gap from the rung below', () => {
  assert.equal(milestoneProgress(0, 1000), 0);
  assert.equal(milestoneProgress(500, 1000), 0.5);
  assert.equal(milestoneProgress(1000, 1000), 1);
  assert.equal(milestoneProgress(2000, 1000), 1);
  // 10K sits between 1K and 10K, so 5.5K is 50% of that rung.
  assert.equal(milestoneProgress(5500, 10_000), 0.5);
  assert.equal(milestoneProgress(-1, 1000), 0);
  assert.equal(milestoneProgress(Number.NaN, 1000), 0);
  // An unknown target (a value the table does not contain) shows no progress
  // rather than a made-up percentage.
  assert.equal(milestoneProgress(999_999, 1234 as never), 0);
});

test('isMilestone accepts only the six real rewards', () => {
  for (const value of MILESTONES) assert.equal(isMilestone(value), true);
  for (const value of [0, 999, 1001, 250_000, '1000', null, undefined, Number.NaN]) {
    assert.equal(isMilestone(value), false, String(value));
  }
});
