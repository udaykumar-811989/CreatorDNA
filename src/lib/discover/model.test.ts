import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CATEGORIES,
  TREND_TTL_MS,
  engagementLabel,
  filterTrendItems,
  formatCount,
  isTrendFresh,
  pruneTrendCache,
  relativeTime,
  sourceReportFromJson,
  trendCacheKey,
  trendItemFromJson,
  trendsPayloadFromJson,
  type TrendCacheFile,
  type TrendItem,
} from './model';

const wireItem = {
  id: 'reddit:abc',
  source: 'reddit',
  category: 'marketing',
  title: 'How I grew to 10K in 90 days',
  excerpt: 'A thread about consistency.',
  url: 'https://www.reddit.com/r/SocialMedia/comments/abc/',
  externalUrl: 'https://example.com/report.pdf',
  author: 'u/creatortips',
  community: 'r/SocialMedia',
  createdAt: '2026-10-27T06:00:00.000Z',
  metrics: { upvotes: 842, comments: 137 },
  sourceLabel: 'Reddit · r/SocialMedia',
};

// ----------------------------------------------------------------- parsing ---

test('trendItemFromJson accepts a real response row', () => {
  const item = trendItemFromJson(wireItem);
  assert.ok(item);
  assert.equal(item.id, 'reddit:abc');
  assert.equal(item.source, 'reddit');
  assert.equal(item.metrics.upvotes, 842);
  assert.equal(item.externalUrl, 'https://example.com/report.pdf');
  assert.equal(item.createdAt, '2026-10-27T06:00:00.000Z');
});

test('trendItemFromJson drops anything unusable instead of rendering it', () => {
  assert.equal(trendItemFromJson(null), null);
  assert.equal(trendItemFromJson('x'), null);
  assert.equal(trendItemFromJson({ ...wireItem, id: '' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, title: '  ' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, source: 'tiktok' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, source: undefined }), null);
  // A trend with no link to its source defeats the purpose of the screen.
  assert.equal(trendItemFromJson({ ...wireItem, url: 'not-a-url' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, url: 'javascript:alert(1)' }), null);
});

test('trendItemFromJson never emits a negative or NaN metric', () => {
  const item = trendItemFromJson({
    ...wireItem,
    metrics: { upvotes: -5, comments: Number.NaN, likes: 12.6 },
  });
  assert.ok(item);
  assert.equal(item.metrics.upvotes, undefined);
  assert.equal(item.metrics.comments, undefined);
  assert.equal(item.metrics.likes, 13);
});

test('trendItemFromJson blanks an unusable date rather than sorting on garbage', () => {
  const item = trendItemFromJson({ ...wireItem, createdAt: 'never' });
  assert.ok(item);
  assert.equal(item.createdAt, '');
});

test('trendItemFromJson omits a non-http external link', () => {
  const item = trendItemFromJson({ ...wireItem, externalUrl: 'javascript:x' });
  assert.ok(item);
  assert.equal(item.externalUrl, undefined);
});

test('sourceReportFromJson keeps every status the server can send', () => {
  for (const status of ['ok', 'needs_key', 'unavailable', 'rate_limited', 'error']) {
    const report = sourceReportFromJson({ key: 'reddit', status, message: 'm', count: 3 });
    assert.ok(report, status);
    assert.equal(report.status, status);
    assert.equal(report.count, 3);
  }
  // An unknown status degrades to "error" rather than passing through.
  assert.equal(sourceReportFromJson({ key: 'reddit', status: 'weird' })?.status, 'error');
  assert.equal(sourceReportFromJson({ key: 'tiktok', status: 'ok' }), null);
  assert.equal(sourceReportFromJson(null), null);
});

test('trendsPayloadFromJson requires an items array', () => {
  assert.equal(trendsPayloadFromJson(null), null);
  assert.equal(trendsPayloadFromJson({}), null);
  assert.equal(trendsPayloadFromJson({ items: 'nope' }), null);
  const payload = trendsPayloadFromJson({
    items: [wireItem, { id: 'broken' }, null],
    sources: [{ key: 'hackernews', status: 'ok', message: 'ok', count: 1 }, 5],
    categories: [{ key: 'all', label: 'All' }, { key: 'all', label: 'Dup' }, 'junk'],
    category: 'marketing',
    query: '',
    fetchedAt: '2026-10-27T06:00:00.000Z',
  });
  assert.ok(payload);
  // Malformed entries are dropped, not fatal.
  assert.equal(payload.items.length, 1);
  assert.equal(payload.sources.length, 1);
  assert.deepEqual(payload.categories, [{ key: 'all', label: 'All' }]);
  assert.equal(payload.category, 'marketing');
  assert.equal(payload.fetchedAt, '2026-10-27T06:00:00.000Z');
});

test('a payload with no usable items still parses — empty is not an error', () => {
  const payload = trendsPayloadFromJson({ items: [], sources: [], category: 'all' });
  assert.ok(payload);
  assert.deepEqual(payload.items, []);
  assert.equal(payload.fetchedAt, '');
  assert.deepEqual(payload.categories, []);
});

test('the fallback category chips are unique, non-empty and start at All', () => {
  const keys = DEFAULT_CATEGORIES.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], 'all');
  for (const entry of DEFAULT_CATEGORIES) {
    assert.ok(entry.label.length > 0, entry.key);
  }
});

// ----------------------------------------------------------------- filter ---

function item(overrides: Partial<TrendItem>): TrendItem {
  return {
    id: 'id',
    source: 'reddit',
    category: 'all',
    title: 'Title',
    excerpt: '',
    url: 'https://example.com',
    author: null,
    community: null,
    createdAt: '2026-10-27T06:00:00.000Z',
    metrics: {},
    sourceLabel: 'Reddit',
    ...overrides,
  };
}

test('filterTrendItems narrows by source and free text', () => {
  const items = [
    item({ id: '1', source: 'reddit', title: 'Reels that convert', community: 'r/socialmedia' }),
    item({ id: '2', source: 'hackernews', title: 'Show HN: Reel tool' }),
    item({ id: '3', source: 'x', title: 'Fitness hooks', author: '@ada' }),
  ];
  assert.equal(filterTrendItems(items).length, 3);
  assert.equal(filterTrendItems(items, { source: 'reddit' }).length, 1);
  assert.equal(filterTrendItems(items, { query: 'reel' }).length, 2);
  assert.equal(filterTrendItems(items, { query: '@ada' }).length, 1);
  assert.equal(filterTrendItems(items, { source: 'x', query: 'reel' }).length, 0);
  assert.equal(filterTrendItems(items, { query: '   ' }).length, 3);
});

// ---------------------------------------------------------------- display ---

test('formatCount shortens large numbers without inventing precision', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1000), '1K');
  assert.equal(formatCount(1234), '1.2K');
  assert.equal(formatCount(12_340), '12.3K');
  assert.equal(formatCount(999_999), '1000K');
  assert.equal(formatCount(1_000_000), '1M');
  assert.equal(formatCount(4_800_000), '4.8M');
  assert.equal(formatCount(-5), '0');
  assert.equal(formatCount(Number.NaN), '0');
});

test('engagementLabel reflects only the metrics that source actually gave', () => {
  assert.equal(engagementLabel(item({ metrics: {} })), null);
  assert.equal(
    engagementLabel(item({ metrics: { upvotes: 842, comments: 137 } })),
    '842 upvotes · 137 comments',
  );
  assert.equal(
    engagementLabel(item({ metrics: { points: 310, comments: 88 } })),
    '310 points · 88 comments',
  );
  assert.equal(
    engagementLabel(item({ metrics: { likes: 900, shares: 120, comments: 45 } })),
    '900 likes · 45 comments · 120 reposts',
  );
});

test('relativeTime walks from now up to weeks', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  assert.equal(relativeTime('2026-10-27T11:59:30.000Z', now), 'now');
  assert.equal(relativeTime('2026-10-27T11:48:00.000Z', now), '12m');
  assert.equal(relativeTime('2026-10-27T09:00:00.000Z', now), '3h');
  assert.equal(relativeTime('2026-10-25T12:00:00.000Z', now), '2d');
  assert.equal(relativeTime('2026-10-06T12:00:00.000Z', now), '3w');
  assert.equal(relativeTime('not a date', now), '');
  // A post dated in the future reads as "now" rather than "-3h".
  assert.equal(relativeTime('2026-10-27T13:00:00.000Z', now), 'now');
});

// ------------------------------------------------------------------ cache ---

test('trendCacheKey distinguishes category, search term and page size', () => {
  const base = trendCacheKey({ category: 'tech' });
  assert.equal(base, 'tech||24');
  assert.notEqual(base, trendCacheKey({ category: 'marketing' }));
  assert.notEqual(base, trendCacheKey({ category: 'tech', query: 'react' }));
  assert.notEqual(base, trendCacheKey({ category: 'tech', limit: 40 }));
  // Case and stray whitespace must not create a second cache slot.
  assert.equal(
    trendCacheKey({ category: 'tech', query: '  REACT ' }),
    trendCacheKey({ category: 'tech', query: 'react' }),
  );
});

test('isTrendFresh honours the TTL in both directions', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  assert.equal(isTrendFresh(now - 1000, now), true);
  assert.equal(isTrendFresh(now - TREND_TTL_MS + 1, now), true);
  assert.equal(isTrendFresh(now - TREND_TTL_MS - 1, now), false);
  // Saved from a skewed clock — never treated as fresh.
  assert.equal(isTrendFresh(now + 60_000, now), false);
  assert.equal(isTrendFresh(null, now), false);
  assert.equal(isTrendFresh('garbage', now), false);
  assert.equal(isTrendFresh(new Date(now - 1000).toISOString(), now), true);
});

test('pruneTrendCache drops stale entries and keeps the newest', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  const payload = trendsPayloadFromJson({ items: [] })!;
  const file: TrendCacheFile = {
    stale: { savedAt: now - TREND_TTL_MS - 1, payload },
    fresh_old: { savedAt: now - 5 * 60_000, payload },
    fresh_new: { savedAt: now - 60_000, payload },
    fresh_mid: { savedAt: now - 3 * 60_000, payload },
    fresh_3: { savedAt: now - 4 * 60_000, payload },
    fresh_4: { savedAt: now - 60_000 - 5, payload },
    fresh_5: { savedAt: now - 7 * 60_000, payload },
    fresh_6: { savedAt: now - 8 * 60_000, payload },
    fresh_7: { savedAt: now - 9 * 60_000, payload },
    fresh_8: { savedAt: now - 10 * 60_000 + 1, payload },
    '': { savedAt: now, payload },
  };
  const pruned = pruneTrendCache(file, now, 3);
  // Newest three survive: fresh_new (-1m), fresh_4 (-1m5s), fresh_mid (-3m).
  assert.deepEqual(Object.keys(pruned).sort(), ['fresh_4', 'fresh_mid', 'fresh_new']);
});
