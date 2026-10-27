import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVER_CATEGORIES,
  buildXQuery,
  dedupeTrendItems,
  discoverCategory,
  engagementLabel,
  excerptOf,
  filterTrendItems,
  formatCount,
  hackerNewsToItems,
  hackerNewsUrl,
  rankTrendItems,
  redditListingToItems,
  redditSearchUrl,
  redditTopUrl,
  safeSubreddit,
  sourceNeedsKeyMessage,
  xSearchToItems,
  xSearchUrl,
  type TrendItem,
} from './discover.ts';

const now = () => new Date().toISOString();
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

// ------------------------------------------------------- URL construction ---

test('safeSubreddit only lets Reddit-shaped names through', () => {
  assert.equal(safeSubreddit('SocialMedia'), 'SocialMedia');
  assert.equal(safeSubreddit('askhistorians'), 'askhistorians');
  // Path traversal, host injection and over-long names all collapse to "all".
  assert.equal(safeSubreddit('../etc/passwd'), 'all');
  assert.equal(safeSubreddit('r/evil'), 'all');
  assert.equal(safeSubreddit('has space'), 'all');
  assert.equal(safeSubreddit('a'.repeat(30)), 'all');
  assert.equal(safeSubreddit(''), 'all');
});

test('redditTopUrl pins the host, path shape and week window', () => {
  const url = new URL(redditTopUrl('SocialMedia', 10));
  assert.equal(url.hostname, 'www.reddit.com');
  assert.equal(url.pathname, '/r/SocialMedia/top.json');
  assert.equal(url.searchParams.get('t'), 'week');
  assert.equal(url.searchParams.get('limit'), '10');
  assert.equal(url.searchParams.get('raw_json'), '1');
});

test('redditTopUrl validates the subreddit and clamps the page size', () => {
  const url = new URL(redditTopUrl('../../admin', 500));
  assert.equal(url.pathname, '/r/all/top.json');
  assert.equal(url.searchParams.get('limit'), '50');
});

test('redditTopUrl joins several validated subreddits into one request', () => {
  const url = new URL(redditTopUrl(['SocialMedia', 'marketing', 'SEO', 'advertising'], 10));
  assert.equal(url.pathname, '/r/SocialMedia+marketing+SEO/top.json');

  const mixed = new URL(redditTopUrl(['SocialMedia', '../evil'], 10));
  assert.equal(mixed.pathname, '/r/SocialMedia/top.json');

  const allInvalid = new URL(redditTopUrl(['../evil', 'a b'], 10));
  assert.equal(allInvalid.pathname, '/r/all/top.json');
});

test('redditTopUrl can target the OAuth host without changing anything else', () => {
  const url = new URL(redditTopUrl('fitness', 10, undefined, 'oauth.reddit.com'));
  assert.equal(url.hostname, 'oauth.reddit.com');
  assert.equal(url.pathname, '/r/fitness/top.json');
  assert.equal(url.searchParams.get('t'), 'week');
});

test('redditSearchUrl keeps the search on Reddit', () => {
  const url = new URL(redditSearchUrl('reels that convert', 5));
  assert.equal(url.hostname, 'www.reddit.com');
  assert.equal(url.pathname, '/search.json');
  assert.equal(url.searchParams.get('q'), 'reels that convert');
  assert.equal(url.searchParams.get('restrict_sr'), 'off');
});

test('buildXQuery quotes the phrase and drops reposts', () => {
  assert.equal(buildXQuery('content creator tips'), '"content creator tips" -is:retweet lang:en');
  assert.equal(buildXQuery('say "hello"\nnow'), '"say hello now" -is:retweet lang:en');
  assert.equal(buildXQuery(''), '"content creator" -is:retweet lang:en');
  assert.equal(buildXQuery('x'.repeat(400)).length < 200, true);
});

test('xSearchUrl asks only for fields the adapter reads', () => {
  const url = new URL(xSearchUrl('reels', 25));
  assert.equal(url.hostname, 'api.twitter.com');
  assert.equal(url.searchParams.get('max_results'), '25');
  assert.ok(url.searchParams.get('tweet.fields')?.includes('public_metrics'));
  assert.equal(url.searchParams.get('expansions'), 'author_id');
});

test('hackerNewsUrl switches between the front page and a search', () => {
  const front = new URL(hackerNewsUrl(null, 20));
  assert.equal(front.searchParams.get('tags'), 'front_page');
  assert.equal(front.searchParams.get('query'), null);

  const search = new URL(hackerNewsUrl('react', 20));
  assert.equal(search.searchParams.get('query'), 'react');
  assert.equal(search.searchParams.get('tags'), 'story');
});

// ------------------------------------------------------------- categories ---

test('every category resolves, including unknown keys', () => {
  assert.ok(DISCOVER_CATEGORIES.length >= 10);
  assert.equal(discoverCategory('marketing').label, 'Marketing');
  assert.equal(discoverCategory('nonsense').key, 'all');
  assert.equal(discoverCategory(null).key, 'all');
  for (const category of DISCOVER_CATEGORIES) {
    assert.ok(category.subreddits.length > 0, category.key);
    assert.ok(category.seedQuery.length > 0, category.key);
  }
});

// ----------------------------------------------------------------- Reddit ---

const redditPayload = {
  kind: 'Listing',
  data: {
    children: [
      {
        kind: 't3',
        data: {
          id: 'abc123',
          title: 'How I grew to 10K in 90 days',
          selftext: 'A thread about  \n  consistency and hooks.',
          permalink: '/r/SocialMedia/comments/abc123/how_i_grew/',
          subreddit: 'SocialMedia',
          author: 'creatortips',
          created_utc: 1_760_000_000,
          ups: 842,
          score: 842,
          num_comments: 137,
          upvote_ratio: 0.97,
          url: 'https://www.reddit.com/r/SocialMedia/comments/abc123/how_i_grew/',
          is_self: true,
        },
      },
      {
        kind: 't3',
        data: {
          id: 'def456',
          title: 'Study: short-form video now leads discovery',
          selftext: '',
          permalink: '/r/marketing/comments/def456/study/',
          subreddit: 'marketing',
          author: 'researcher',
          created_utc: 1_760_000_000,
          ups: 210,
          num_comments: 12,
          url: 'https://example.com/report.pdf',
          is_self: false,
        },
      },
      // Malformed entries must be skipped, never rendered half-formed.
      { kind: 't3', data: { id: 'no-title' } },
      { kind: 't3', data: { title: 'no id' } },
      { kind: 't3' },
    ],
    after: null,
  },
};

test('redditListingToItems maps real fields and skips malformed rows', () => {
  const items = redditListingToItems(redditPayload, 'marketing');
  assert.equal(items.length, 2);

  const first = items[0];
  assert.equal(first.id, 'reddit:abc123');
  assert.equal(first.source, 'reddit');
  assert.equal(first.category, 'marketing');
  assert.equal(first.title, 'How I grew to 10K in 90 days');
  assert.equal(first.metrics.upvotes, 842);
  assert.equal(first.metrics.comments, 137);
  assert.equal(first.author, 'u/creatortips');
  assert.equal(first.community, 'r/SocialMedia');
  assert.equal(first.sourceLabel, 'Reddit · r/SocialMedia');
  assert.equal(
    first.url,
    'https://www.reddit.com/r/SocialMedia/comments/abc123/how_i_grew/',
  );
  // A self post links to itself, so no second link is offered.
  assert.equal(first.externalUrl, undefined);
  assert.equal(first.createdAt, new Date(1_760_000_000 * 1000).toISOString());
});

test('redditListingToItems exposes an outbound link only for link posts', () => {
  const items = redditListingToItems(redditPayload, 'marketing');
  assert.equal(items[1].externalUrl, 'https://example.com/report.pdf');
  // No view count is invented — Reddit never publishes one.
  assert.equal(items[0].metrics.likes, undefined);
  assert.equal(Object.keys(items[0].metrics).sort().join(','), 'comments,upvotes');
});

test('redditListingToItems survives junk input', () => {
  assert.deepEqual(redditListingToItems(null, 'all'), []);
  assert.deepEqual(redditListingToItems({}, 'all'), []);
  assert.deepEqual(redditListingToItems({ data: { children: 'nope' } }, 'all'), []);
  assert.deepEqual(redditListingToItems({ data: { children: [{ data: 5 }] } }, 'all'), []);
});

// --------------------------------------------------------------------- X ----

const xPayload = {
  data: [
    {
      id: '12345',
      text: 'The hook is the whole video.\nEverything after it is a bonus.',
      author_id: 'u1',
      created_at: '2026-10-20T10:00:00.000Z',
      public_metrics: { like_count: 900, retweet_count: 120, reply_count: 45 },
    },
    {
      // No matching author expansion → no usable link, so it is dropped.
      id: '99999',
      text: 'orphan post',
      author_id: 'missing',
      created_at: '2026-10-20T10:00:00.000Z',
      public_metrics: {},
    },
    { id: '', text: 'no id', author_id: 'u1' },
    { id: 'x', text: '   ', author_id: 'u1' },
  ],
  includes: {
    users: [{ id: 'u1', name: 'Ada Creates', username: 'ada_creates' }],
  },
};

test('xSearchToItems joins authors and reads public metrics', () => {
  const items = xSearchToItems(xPayload, 'marketing');
  assert.equal(items.length, 1);
  const item = items[0];
  assert.equal(item.id, 'x:12345');
  assert.equal(item.url, 'https://x.com/ada_creates/status/12345');
  assert.equal(item.author, '@ada_creates');
  assert.equal(item.community, 'Ada Creates');
  assert.equal(item.sourceLabel, 'X · @ada_creates');
  assert.equal(item.metrics.likes, 900);
  assert.equal(item.metrics.shares, 120);
  assert.equal(item.metrics.comments, 45);
  assert.equal(item.createdAt, '2026-10-20T10:00:00.000Z');
  // The first line becomes the title, the whole post the excerpt.
  assert.equal(item.title, 'The hook is the whole video.');
  assert.ok(item.excerpt.includes('Everything after it'));
});

test('xSearchToItems drops posts it cannot link to, rather than faking a URL', () => {
  const items = xSearchToItems(xPayload, 'marketing');
  assert.equal(items.some((item) => item.id === 'x:99999'), false);
});

test('xSearchToItems survives junk input', () => {
  assert.deepEqual(xSearchToItems(null, 'all'), []);
  assert.deepEqual(xSearchToItems({}, 'all'), []);
  assert.deepEqual(xSearchToItems({ data: 'nope' }, 'all'), []);
  assert.deepEqual(
    xSearchToItems({ data: [{ id: '1', text: 'hi' }], includes: {} }, 'all'),
    [],
  );
});

// ------------------------------------------------------------ Hacker News ----

const hnPayload = {
  hits: [
    {
      objectID: '424242',
      title: 'Show HN: I built a Reel idea generator',
      url: 'https://example.com/reel-generator',
      author: 'builder',
      points: 310,
      num_comments: 88,
      created_at_i: 1_760_000_000,
    },
    {
      objectID: '434343',
      title: 'Ask HN: How do you pick a niche?',
      story_text: 'I keep changing my mind every week.',
      author: 'confused',
      points: 40,
      num_comments: 60,
      created_at_i: 1_760_000_000,
    },
    { objectID: 'bad' },
    { title: 'missing id' },
  ],
};

test('hackerNewsToItems maps points, comments and both links', () => {
  const items = hackerNewsToItems(hnPayload, 'tech');
  assert.equal(items.length, 2);

  const show = items[0];
  assert.equal(show.id, 'hn:424242');
  assert.equal(show.url, 'https://news.ycombinator.com/item?id=424242');
  assert.equal(show.externalUrl, 'https://example.com/reel-generator');
  assert.equal(show.metrics.points, 310);
  assert.equal(show.metrics.comments, 88);
  assert.equal(show.community, 'Hacker News');
  assert.equal(show.sourceLabel, 'Hacker News');

  const ask = items[1];
  assert.equal(ask.excerpt, 'I keep changing my mind every week.');
  assert.equal(ask.externalUrl, undefined);
});

test('hackerNewsToItems survives junk input', () => {
  assert.deepEqual(hackerNewsToItems(null, 'tech'), []);
  assert.deepEqual(hackerNewsToItems({}, 'tech'), []);
  assert.deepEqual(hackerNewsToItems({ hits: 'x' }, 'tech'), []);
});

// ------------------------------------------------------------- merging ------

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
    createdAt: now(),
    metrics: {},
    sourceLabel: 'Reddit',
    ...overrides,
  };
}

test('rankTrendItems puts freshest material first, then engagement', () => {
  const fresh = item({ id: 'fresh', createdAt: ago(1), metrics: { upvotes: 5 } });
  const oldButHuge = item({ id: 'old', createdAt: ago(100), metrics: { upvotes: 9000 } });
  const recent = item({ id: 'recent', createdAt: ago(10), metrics: { upvotes: 9000 } });

  const ranked = rankTrendItems([oldButHuge, fresh, recent]).map((entry) => entry.id);
  // Under 6h is one bucket, 6–24h the next, beyond 72h the last.
  assert.deepEqual(ranked, ['fresh', 'recent', 'old']);
});

test('rankTrendItems is stable for undated items instead of throwing', () => {
  const broken = item({ id: 'broken', createdAt: 'not-a-date' });
  const normal = item({ id: 'normal', createdAt: ago(1) });
  const ranked = rankTrendItems([broken, normal]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'normal');
});

test('dedupeTrendItems keeps the first occurrence of a repeated source id', () => {
  const a = item({ id: 'reddit:1', metrics: { upvotes: 1 } });
  const b = item({ id: 'reddit:1', metrics: { upvotes: 999 } });
  const c = item({ id: 'hn:2' });
  const out = dedupeTrendItems([a, b, c, a]);
  assert.deepEqual(out.map((entry) => entry.id), ['reddit:1', 'hn:2']);
});

test('filterTrendItems filters by source and by free text', () => {
  const items = [
    item({ id: '1', source: 'reddit', title: 'Reels that convert', community: 'r/socialmedia' }),
    item({ id: '2', source: 'hackernews', title: 'Show HN: Reel tool', community: 'Hacker News' }),
    item({ id: '3', source: 'x', title: 'Fitness hooks', author: '@ada' }),
  ];
  assert.equal(filterTrendItems(items, {}).length, 3);
  assert.equal(filterTrendItems(items, { source: 'reddit' }).length, 1);
  assert.equal(filterTrendItems(items, { query: 'reel' }).length, 2);
  assert.equal(filterTrendItems(items, { query: '@ada' }).length, 1);
  assert.equal(filterTrendItems(items, { query: 'r/socialmedia' }).length, 1);
  assert.equal(filterTrendItems(items, { source: 'x', query: 'reel' }).length, 0);
});

// ------------------------------------------------------------- formatting ---

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

test('engagementLabel reflects whichever metrics the source actually gave', () => {
  assert.equal(engagementLabel(item({ metrics: {} })), null);
  assert.equal(
    engagementLabel(item({ source: 'reddit', metrics: { upvotes: 842, comments: 137 } })),
    '842 upvotes · 137 comments',
  );
  assert.equal(
    engagementLabel(item({ source: 'hackernews', metrics: { points: 310, comments: 88 } })),
    '310 points · 88 comments',
  );
  assert.equal(
    engagementLabel(item({ source: 'x', metrics: { likes: 900, shares: 120, comments: 45 } })),
    '900 likes · 45 comments · 120 reposts',
  );
});

test('excerptOf collapses whitespace and truncates on a word boundary', () => {
  assert.equal(excerptOf('  a\n\n b\t c  '), 'a b c');
  assert.equal(excerptOf(''), '');
  assert.equal(excerptOf(null), '');
  const long = 'word '.repeat(200);
  const out = excerptOf(long, 100);
  assert.ok(out.length <= 101, out.length);
  assert.ok(out.endsWith('…'));
  assert.equal(out.includes('  '), false);
});

test('excerptOf strips the markup Hacker News stores in story_text', () => {
  assert.equal(
    excerptOf(
      'Related:<p><i>The Exponential Time Hypothesis Is False [pdf]</i> - ' +
        '<a href="https:&#x2F;&#x2F;news.ycombinator.com&#x2F;item?id=1">link</a></p>',
    ),
    'Related: The Exponential Time Hypothesis Is False [pdf] - link',
  );
  assert.equal(excerptOf('A &amp; B &lt;tag&gt; &#x2F; path'), 'A & B <tag> / path');
  // Characters that merely look like angles are not treated as tags.
  assert.equal(excerptOf('5 < 7 and 9 > 3'), '5 < 7 and 9 > 3');
});

// ----------------------------------------------------------------- states ---

test('an unconfigured source says exactly what is missing', () => {
  assert.match(sourceNeedsKeyMessage('reddit'), /REDDIT_CLIENT_ID/);
  assert.match(sourceNeedsKeyMessage('reddit'), /REDDIT_CLIENT_SECRET/);
  assert.match(sourceNeedsKeyMessage('x'), /X_BEARER_TOKEN/);
});
