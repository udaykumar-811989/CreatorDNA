import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkRateLimit, rateLimitSize, resetRateLimits } from './rateLimit';

test('allows up to the limit, then blocks with a Retry-After', () => {
  resetRateLimits();
  let now = 1_000_000;
  const options = { limit: 3, windowMs: 60_000, now: () => now };

  assert.equal(checkRateLimit('user-a', options).allowed, true);
  assert.equal(checkRateLimit('user-a', options).allowed, true);
  const lastAllowed = checkRateLimit('user-a', options);
  assert.equal(lastAllowed.allowed, true);
  assert.equal(lastAllowed.remaining, 0);

  const blocked = checkRateLimit('user-a', options);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(
    blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60,
    `Retry-After must be inside the window, got ${blocked.retryAfterSeconds}`,
  );
});

test('keys are independent — one user cannot starve another', () => {
  resetRateLimits();
  const now = 2_000_000;
  const options = { limit: 1, windowMs: 60_000, now: () => now };

  assert.equal(checkRateLimit('user-a', options).allowed, true);
  assert.equal(checkRateLimit('user-a', options).allowed, false);
  assert.equal(checkRateLimit('user-b', options).allowed, true);
});

test('the window resets after it elapses', () => {
  resetRateLimits();
  let now = 3_000_000;
  const options = { limit: 1, windowMs: 60_000, now: () => now };

  assert.equal(checkRateLimit('user-a', options).allowed, true);
  assert.equal(checkRateLimit('user-a', options).allowed, false);

  now += 59_999;
  assert.equal(checkRateLimit('user-a', options).allowed, false, 'still inside the window');

  now += 2;
  assert.equal(checkRateLimit('user-a', options).allowed, true, 'window elapsed');
});

test('Retry-After counts down as the window runs out', () => {
  resetRateLimits();
  let now = 4_000_000;
  const options = { limit: 1, windowMs: 60_000, now: () => now };

  checkRateLimit('user-a', options);
  now += 30_000;
  const blocked = checkRateLimit('user-a', options);
  assert.equal(blocked.allowed, false);
  assert.ok(
    blocked.retryAfterSeconds >= 29 && blocked.retryAfterSeconds <= 30,
    `expected ~30s, got ${blocked.retryAfterSeconds}`,
  );
});

test('a flood of distinct keys stays capped in memory', () => {
  resetRateLimits();
  const now = 5_000_000;
  const options = { limit: 1, windowMs: 600_000, now: () => now };
  for (let index = 0; index < 10_500; index += 1) {
    assert.equal(checkRateLimit(`flood-${index}`, options).allowed, true);
  }
  assert.ok(
    rateLimitSize() <= 10_000,
    `bucket map must stay capped, got ${rateLimitSize()}`,
  );
  resetRateLimits();
});
