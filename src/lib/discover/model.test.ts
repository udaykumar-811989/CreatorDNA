import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SECTIONS,
  DISCOVER_SECTIONS,
  TREND_SOURCE_KEYS,
  TREND_TTL_MS,
  categoryLabelFor,
  engagementLabel,
  filterTrendItems,
  formatCount,
  formatDuration,
  isSectionKey,
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
  id: 'gdelt:abc123',
  source: 'gdelt',
  section: 'top-stories',
  title: 'Regulators open a fresh inquiry into nationwide data center outages',
  excerpt: '',
  url: 'https://www.example.com/2026/11/ai-story',
  externalUrl: 'https://mirror.example.com/story',
  author: null,
  publisher: 'example.com',
  publisherLogo: 'https://www.google.com/s2/favicons?domain=example.com&sz=128',
  imageUrl: 'https://cdn.example.com/ai-story.jpg',
  imageAlt: 'AI story travels the wires',
  videoUrl: null,
  videoKind: null,
  durationSeconds: null,
  community: 'United States',
  createdAt: '2026-11-14T03:30:00.000Z',
  metrics: {},
  sourceLabel: 'GDELT',
};

// ----------------------------------------------------------------- parsing ---

test('trendItemFromJson accepts a real response row', () => {
  const item = trendItemFromJson(wireItem);
  assert.ok(item);
  assert.equal(item.id, 'gdelt:abc123');
  assert.equal(item.source, 'gdelt');
  assert.equal(item.section, 'top-stories');
  assert.equal(item.publisher, 'example.com');
  assert.equal(item.imageUrl, 'https://cdn.example.com/ai-story.jpg');
  assert.equal(item.externalUrl, 'https://mirror.example.com/story');
  assert.equal(item.createdAt, '2026-11-14T03:30:00.000Z');
});

test('trendItemFromJson drops anything unusable instead of rendering it', () => {
  assert.equal(trendItemFromJson(null), null);
  assert.equal(trendItemFromJson('x'), null);
  assert.equal(trendItemFromJson({ ...wireItem, id: '' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, title: '  ' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, source: 'tiktok' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, source: 'reddit' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, source: 'x' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, source: undefined }), null);
  // A trend with no link to its source defeats the purpose of the screen.
  assert.equal(trendItemFromJson({ ...wireItem, url: 'not-a-url' }), null);
  assert.equal(trendItemFromJson({ ...wireItem, url: 'javascript:alert(1)' }), null);
});

test('trendItemFromJson never emits a negative or NaN metric', () => {
  const item = trendItemFromJson({
    ...wireItem,
    metrics: { upvotes: -5, comments: Number.NaN, likes: 12.6, stars: 42 },
  });
  assert.ok(item);
  assert.equal(item.metrics.upvotes, undefined);
  assert.equal(item.metrics.comments, undefined);
  assert.equal(item.metrics.likes, 13);
  assert.equal(item.metrics.stars, 42);
});

test('trendItemFromJson blanks an unusable date rather than sorting on garbage', () => {
  const item = trendItemFromJson({ ...wireItem, createdAt: 'never' });
  assert.ok(item);
  assert.equal(item.createdAt, '');
});

test('trendItemFromJson omits non-http links and images', () => {
  const item = trendItemFromJson({
    ...wireItem,
    externalUrl: 'javascript:x',
    imageUrl: 'data:text/html,hi',
    publisherLogo: 'not-a-url',
  });
  assert.ok(item);
  assert.equal(item.externalUrl, undefined);
  assert.equal(item.imageUrl, null);
  assert.equal(item.publisherLogo, null);
});

test('trendItemFromJson keeps a video only when URL, kind and duration agree', () => {
  const good = trendItemFromJson({
    ...wireItem,
    videoUrl: 'https://video.bsky.app/watch/x/playlist.m3u8',
    videoKind: 'hls',
    durationSeconds: 74,
  });
  assert.ok(good);
  assert.equal(good.videoKind, 'hls');
  assert.equal(good.durationSeconds, 74);

  // No playback URL → no video card, no orphan duration badge.
  const noUrl = trendItemFromJson({ ...wireItem, videoKind: 'hls', durationSeconds: 30 });
  assert.ok(noUrl);
  assert.equal(noUrl.videoKind, null);
  assert.equal(noUrl.durationSeconds, null);

  // Unknown kind or absurd duration never reaches the card.
  const badKind = trendItemFromJson({
    ...wireItem,
    videoUrl: 'https://x.example/v.mp4',
    videoKind: 'flash',
    durationSeconds: 12,
  });
  assert.ok(badKind);
  assert.equal(badKind.videoKind, null);
  assert.equal(badKind.durationSeconds, null);
});

test('trendItemFromJson falls back to For You for an unknown section', () => {
  const item = trendItemFromJson({ ...wireItem, section: 'nonsense' });
  assert.ok(item);
  assert.equal(item.section, 'for-you');
  assert.equal(isSectionKey('videos'), true);
  assert.equal(isSectionKey('nonsense'), false);
});

test('sourceReportFromJson keeps every status the server can send', () => {
  for (const status of ['ok', 'rate_limited', 'unavailable', 'error']) {
    const report = sourceReportFromJson({ key: 'bluesky', status, message: 'm', count: 3 });
    assert.ok(report, status);
    assert.equal(report.status, status);
    assert.equal(report.count, 3);
  }
  // An unknown status degrades to "error" rather than passing through.
  assert.equal(sourceReportFromJson({ key: 'bluesky', status: 'weird' })?.status, 'error');
  // Reddit/X reports are dropped outright — those sources no longer exist.
  assert.equal(sourceReportFromJson({ key: 'reddit', status: 'ok' }), null);
  assert.equal(sourceReportFromJson({ key: 'x', status: 'ok' }), null);
  assert.equal(sourceReportFromJson(null), null);
});

test('trendsPayloadFromJson requires an items array', () => {
  assert.equal(trendsPayloadFromJson(null), null);
  assert.equal(trendsPayloadFromJson({}), null);
  assert.equal(trendsPayloadFromJson({ items: 'nope' }), null);
  const payload = trendsPayloadFromJson({
    items: [wireItem, { id: 'broken' }, null],
    sources: [{ key: 'hackernews', status: 'ok', message: 'ok', count: 1 }, 5],
    sections: [{ key: 'for-you', label: 'For You' }, { key: 'for-you', label: 'Dup' }, 'junk'],
    section: 'top-stories',
    query: '',
    fetchedAt: '2026-11-14T03:30:00.000Z',
  });
  assert.ok(payload);
  // Malformed entries are dropped, not fatal.
  assert.equal(payload.items.length, 1);
  assert.equal(payload.sources.length, 1);
  assert.deepEqual(payload.sections, [{ key: 'for-you', label: 'For You' }]);
  assert.equal(payload.section, 'top-stories');
  assert.equal(payload.fetchedAt, '2026-11-14T03:30:00.000Z');
});

test('a payload with no usable items still parses — empty is not an error', () => {
  const payload = trendsPayloadFromJson({ items: [], sources: [], section: 'videos' });
  assert.ok(payload);
  assert.deepEqual(payload.items, []);
  assert.equal(payload.fetchedAt, '');
  // The nav never goes blank: the built-in section list stands in.
  assert.deepEqual(payload.sections, DEFAULT_SECTIONS);
});

test('a pre-2.0 payload with categories/category still parses', () => {
  const payload = trendsPayloadFromJson({
    items: [],
    categories: [{ key: 'tech', label: 'Tech' }],
    category: 'tech',
  });
  assert.ok(payload);
  assert.deepEqual(payload.sections, [{ key: 'tech', label: 'Tech' }]);
  assert.equal(payload.section, 'tech');
});

test('the nine sections are unique, non-empty and start at For You', () => {
  const keys = DEFAULT_SECTIONS.map((entry) => entry.key);
  assert.equal(keys.length, 9);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], 'for-you');
  for (const entry of DEFAULT_SECTIONS) {
    assert.ok(entry.label.length > 0, entry.key);
  }
  assert.deepEqual(
    TREND_SOURCE_KEYS.slice().sort(),
    ['bluesky', 'devto', 'gdelt', 'github', 'googlenews', 'googletrends', 'hackernews', 'lobsters', 'mastodon'],
  );
});

test('categoryLabelFor names the badge without repeating the nav', () => {
  assert.equal(categoryLabelFor('for-you'), null);
  assert.equal(categoryLabelFor('videos'), 'Video');
  assert.equal(categoryLabelFor('technology'), 'Technology');
  assert.equal(categoryLabelFor('nonsense'), null);
});

// ----------------------------------------------------------------- filter ---

function item(overrides: Partial<TrendItem>): TrendItem {
  return {
    id: 'id',
    source: 'bluesky',
    section: 'for-you',
    title: 'Title',
    excerpt: '',
    url: 'https://example.com',
    author: null,
    publisher: null,
    publisherLogo: null,
    imageUrl: null,
    imageAlt: null,
    videoUrl: null,
    videoKind: null,
    durationSeconds: null,
    community: null,
    createdAt: '2026-11-14T06:00:00.000Z',
    metrics: {},
    sourceLabel: 'Bluesky',
    ...overrides,
  };
}

test('filterTrendItems narrows by source and free text', () => {
  const items = [
    item({ id: '1', source: 'bluesky', title: 'Reels that convert', publisher: '@ada' }),
    item({ id: '2', source: 'hackernews', title: 'Show HN: Reel tool' }),
    item({ id: '3', source: 'googlenews', title: 'Fitness hooks', publisher: 'Example Times' }),
  ];
  assert.equal(filterTrendItems(items).length, 3);
  assert.equal(filterTrendItems(items, { source: 'bluesky' }).length, 1);
  assert.equal(filterTrendItems(items, { query: 'reel' }).length, 2);
  assert.equal(filterTrendItems(items, { query: 'example times' }).length, 1);
  assert.equal(filterTrendItems(items, { source: 'googlenews', query: 'reel' }).length, 0);
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
    engagementLabel(item({ metrics: { stars: 1840, forks: 96, comments: 12 } })),
    '1.8K stars · 96 forks · 12 comments',
  );
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
  const now = Date.parse('2026-11-14T12:00:00.000Z');
  assert.equal(relativeTime('2026-11-14T11:59:30.000Z', now), 'now');
  assert.equal(relativeTime('2026-11-14T11:48:00.000Z', now), '12m');
  assert.equal(relativeTime('2026-11-14T09:00:00.000Z', now), '3h');
  assert.equal(relativeTime('2026-11-12T12:00:00.000Z', now), '2d');
  assert.equal(relativeTime('2026-10-24T12:00:00.000Z', now), '3w');
  assert.equal(relativeTime('not a date', now), '');
  // A post dated in the future reads as "now" rather than "-3h".
  assert.equal(relativeTime('2026-11-14T13:00:00.000Z', now), 'now');
});

test('formatDuration renders a video badge only for real durations', () => {
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(0), null);
  assert.equal(formatDuration(-4), null);
  assert.equal(formatDuration(12), '0:12');
  assert.equal(formatDuration(74), '1:14');
  assert.equal(formatDuration(600), '10:00');
  assert.equal(formatDuration(3725), '62:05');
});

// ------------------------------------------------------------------ cache ---

test('trendCacheKey distinguishes section, search term and page size', () => {
  const base = trendCacheKey({ section: 'technology' });
  assert.equal(base, 'technology||24');
  assert.notEqual(base, trendCacheKey({ section: 'business' }));
  assert.notEqual(base, trendCacheKey({ section: 'technology', query: 'react' }));
  assert.notEqual(base, trendCacheKey({ section: 'technology', limit: 40 }));
  // Case and stray whitespace must not create a second cache slot.
  assert.equal(
    trendCacheKey({ section: 'technology', query: '  REACT ' }),
    trendCacheKey({ section: 'technology', query: 'react' }),
  );
});

test('isTrendFresh honours the TTL in both directions', () => {
  const now = Date.parse('2026-11-14T12:00:00.000Z');
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
  const now = Date.parse('2026-11-14T12:00:00.000Z');
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

test('DISCOVER_SECTIONS and DEFAULT_SECTIONS stay in sync', () => {
  assert.deepEqual(DEFAULT_SECTIONS, DISCOVER_SECTIONS);
});
