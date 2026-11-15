import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVER_SECTIONS,
  TREND_SOURCE_KEYS,
  TREND_SOURCE_LABELS,
  blueskyPostUrl,
  blueskySearchUrl,
  blueskyToItems,
  canonicalUrlKey,
  categoryLabelFor,
  dedupeTrendItems,
  devArticlesUrl,
  devToItems,
  discoverSection,
  engagementLabel,
  excerptOf,
  extractXmlAttr,
  faviconUrl,
  filterTrendItems,
  formatCount,
  gdeltToItems,
  gdeltUrl,
  githubToItems,
  githubTrendingUrl,
  googleNewsRssToItems,
  googleNewsSearchUrl,
  googleNewsTopUrl,
  googleTrendsRssToItems,
  googleTrendsRssUrl,
  hackerNewsToItems,
  hackerNewsUrl,
  hostOf,
  lobstersToItems,
  lobstersUrl,
  mastodonToItems,
  mastodonTrendsUrl,
  rankTrendItems,
  sectionFromLegacyCategory,
  sourceCalls,
  stripMarkup,
  titleKey,
  xmlBlocks,
  xmlValue,
  youtubeVideoId,
  type TrendItem,
} from './discover.ts';

const now = () => new Date().toISOString();
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

function item(overrides: Partial<TrendItem> = {}): TrendItem {
  return {
    id: 'x:1',
    source: 'hackernews',
    section: 'for-you',
    title: 'A perfectly ordinary headline about a thing that happened today',
    excerpt: '',
    url: 'https://example.com/story',
    externalUrl: undefined,
    author: null,
    publisher: 'example.com',
    publisherLogo: null,
    imageUrl: null,
    imageAlt: null,
    videoUrl: null,
    videoKind: null,
    durationSeconds: null,
    community: null,
    createdAt: now(),
    metrics: {},
    sourceLabel: 'Hacker News',
    ...overrides,
  };
}

// ------------------------------------------------------- source inventory ---

test('exactly the nine Discover 2.0 sources exist — Reddit and X are gone', () => {
  assert.deepEqual([...TREND_SOURCE_KEYS].sort(), [
    'bluesky',
    'devto',
    'gdelt',
    'github',
    'googlenews',
    'googletrends',
    'hackernews',
    'lobsters',
    'mastodon',
  ]);
  for (const key of TREND_SOURCE_KEYS) {
    assert.equal(typeof TREND_SOURCE_LABELS[key], 'string');
    assert.ok(TREND_SOURCE_LABELS[key].length > 0);
  }
});

test('the nine sections are listed in the order the screen shows them', () => {
  assert.deepEqual(
    DISCOVER_SECTIONS.map((entry) => entry.key),
    [
      'for-you',
      'top-stories',
      'trending',
      'videos',
      'technology',
      'business',
      'entertainment',
      'creator-trends',
      'community',
    ],
  );
  assert.equal(discoverSection('videos').label, 'Videos');
  // Unknown keys fall back to For You rather than rendering an empty tab.
  assert.equal(discoverSection('nonsense').key, 'for-you');
  assert.equal(categoryLabelFor('for-you'), null);
  assert.equal(categoryLabelFor('videos'), 'Video');
  assert.equal(categoryLabelFor('technology'), 'Technology');
});

// ------------------------------------------------------------ URL builder ---

test('hackerNewsUrl switches between front page and search', () => {
  const front = hackerNewsUrl(null, 20);
  assert.ok(front.startsWith('https://hn.algolia.com/api/v1/search?'));
  assert.ok(front.includes('tags=front_page'));
  assert.ok(front.includes('hitsPerPage=20'));

  const search = hackerNewsUrl('creator economy', 20);
  assert.ok(search.includes('query=creator+economy'));
  assert.ok(search.includes('tags=story'));
});

test('blueskySearchUrl targets the keyless appview with a bounded limit', () => {
  const url = blueskySearchUrl('news', 60, 'latest');
  assert.ok(url.startsWith('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?'));
  assert.ok(url.includes('q=news'));
  assert.ok(url.includes('sort=latest'));
  assert.ok(url.includes('limit=60'));
  // The limit is clamped, never passed through raw.
  assert.ok(blueskySearchUrl('x', 500).includes('limit=100'));
});

test('mastodon, trends, DEV and Lobsters URLs are keyless and bounded', () => {
  assert.equal(
    mastodonTrendsUrl(40),
    'https://mastodon.social/api/v1/trends/statuses?limit=40',
  );
  assert.equal(googleTrendsRssUrl(), 'https://trends.google.com/trending/rss?geo=US');
  // A malformed geo code falls back to US instead of producing a bad request.
  assert.equal(googleTrendsRssUrl('!!'), 'https://trends.google.com/trending/rss?geo=US');
  assert.ok(devArticlesUrl(20).startsWith('https://dev.to/api/articles?top=7&per_page=20'));
  assert.equal(lobstersUrl(), 'https://lobste.rs/hottest.json');
  assert.equal(lobstersUrl(2), 'https://lobste.rs/hottest.json?page=2');
  assert.equal(lobstersUrl(99), 'https://lobste.rs/hottest.json?page=5');
});

test('googleNews URLs: root feed, fresh topic scope, plain search', () => {
  assert.equal(googleNewsTopUrl(), 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
  const fresh = googleNewsSearchUrl('technology', true);
  assert.ok(fresh.includes('q=technology+when%3A1d'));
  assert.ok(fresh.includes('ceid=US%3Aen'));
  const plain = googleNewsSearchUrl('deep learning', false);
  assert.ok(plain.includes('q=deep+learning'));
  assert.ok(!plain.includes('when'));
});

test('githubTrendingUrl: weekly trending with no term, starred search with one', () => {
  const nowMs = Date.parse('2026-11-15T00:00:00Z');
  const trending = githubTrendingUrl(null, 20, nowMs);
  assert.ok(trending.includes('q=created%3A%3E2026-11-08'));
  assert.ok(trending.includes('sort=stars'));
  assert.ok(trending.includes('per_page=20'));
  const search = githubTrendingUrl('agent framework', 10, nowMs);
  assert.ok(search.includes('q=agent+framework'));
  assert.ok(!search.includes('created'));
});

test('gdeltUrl always scopes to English and sorts newest first', () => {
  const url = gdeltUrl('business OR economy OR markets', 15);
  assert.ok(url.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?'));
  assert.ok(url.includes('sourcelang%3Aenglish') || url.includes('sourcelang:english'));
  assert.ok(url.includes('sort=datedesc'));
  assert.ok(url.includes('maxrecords=15'));
  assert.ok(url.includes('mode=artlist'));
});

test('gdeltUrl wraps boolean queries — GDELT answers those with plain text', () => {
  // GDELT refuses an unparenthesised OR query with HTTP 200 and a sentence
  // instead of JSON, which reads as an unparseable response upstream.
  const booleanUrl = gdeltUrl('business OR economy OR markets', 15);
  const query = new URL(booleanUrl).searchParams.get('query') ?? '';
  assert.ok(query.startsWith('('), query);
  assert.ok(query.includes(') sourcelang:english'), query);

  // A single term and an already-wrapped query are passed through untouched.
  const plain = new URL(gdeltUrl('technology', 15)).searchParams.get('query') ?? '';
  assert.equal(plain, 'technology sourcelang:english');
  const wrapped = new URL(gdeltUrl('(film OR music)', 15)).searchParams.get('query') ?? '';
  assert.equal(wrapped, '(film OR music) sourcelang:english');
});

// ----------------------------------------------------------- section plan ---

test('every section names at least three sources, videos uses Bluesky video queries', () => {
  for (const { key } of DISCOVER_SECTIONS) {
    const calls = sourceCalls(key, '');
    assert.ok(calls.length >= 2, `${key} has too few sources`);
    for (const call of calls) assert.ok(TREND_SOURCE_KEYS.includes(call.key));
  }
  const videos = sourceCalls('videos', '');
  assert.deepEqual(videos.map((call) => call.key), ['bluesky', 'bluesky', 'mastodon']);
  assert.deepEqual(videos.map((call) => call.query), ['video', 'youtube', undefined]);
});

test('a search term routes only to sources that can actually search', () => {
  const calls = sourceCalls('for-you', 'reels hooks');
  assert.deepEqual(
    calls.map((call) => call.key),
    ['googlenews', 'gdelt', 'hackernews', 'bluesky', 'github'],
  );
  for (const call of calls) assert.equal(call.query, 'reels hooks');
  // Section content never leaks into a search.
  assert.equal(sourceCalls('videos', 'ai').length, 5);
});

test('legacy category keys from pre-2.0 clients map onto sections', () => {
  assert.equal(sectionFromLegacyCategory('all'), 'for-you');
  assert.equal(sectionFromLegacyCategory('tech'), 'technology');
  assert.equal(sectionFromLegacyCategory('business'), 'business');
  assert.equal(sectionFromLegacyCategory('entertainment'), 'entertainment');
  assert.equal(sectionFromLegacyCategory('fitness'), 'for-you');
  assert.equal(sectionFromLegacyCategory('anything-else'), 'for-you');
});

// ------------------------------------------------------------- helpers -----

test('stripMarkup removes tags and decodes entities, including numeric ones', () => {
  assert.equal(stripMarkup('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.equal(stripMarkup('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.equal(stripMarkup('it&#8217;s'), 'it’s');
  assert.equal(stripMarkup('&#x27;quoted&#x27;'), "'quoted'");
  // Bare comparison characters in prose survive.
  assert.equal(stripMarkup('5 < 6 and 7 > 2'), '5 < 6 and 7 > 2');
});

test('excerptOf collapses whitespace and cuts on a word boundary', () => {
  assert.equal(excerptOf('  a\n\t b  '), 'a b');
  const long = 'word '.repeat(80).trim();
  const cut = excerptOf(long, 50);
  assert.ok(cut.length <= 51);
  assert.ok(cut.endsWith('…'));
  assert.ok(!cut.includes('  '));
});

test('xml helpers read RSS fields, CDATA and self-closing tags', () => {
  const xml =
    '<channel><item><title><![CDATA[Headline &amp; more]]></title>' +
    '<description/><link>https://a.example/x?y=1&amp;z=2</link>' +
    '<source url="https://pub.example">Publisher</source></item></channel>';
  const blocks = xmlBlocks(xml, 'item');
  assert.equal(blocks.length, 1);
  assert.equal(xmlValue(blocks[0], 'title'), 'Headline & more');
  assert.equal(xmlValue(blocks[0], 'description'), '');
  assert.equal(xmlValue(blocks[0], 'missing'), '');
  assert.equal(xmlValue(blocks[0], 'link'), 'https://a.example/x?y=1&z=2');
  assert.equal(extractXmlAttr(blocks[0], 'source', 'url'), 'https://pub.example');
  assert.equal(xmlValue(blocks[0], 'source'), 'Publisher');
});

test('youtubeVideoId accepts every YouTube URL shape and rejects others', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://vimeo.com/12345'), null);
  assert.equal(youtubeVideoId('https://example.com/watch?v=nope'), null);
});

test('blueskyPostUrl turns an at:// URI into a real bsky.app link', () => {
  assert.equal(
    blueskyPostUrl('at://did:plc:abc123/app.bsky.feed.post/3n2c3ml', 'alice.bsky.social'),
    'https://bsky.app/profile/alice.bsky.social/post/3n2c3ml',
  );
  // Without a usable handle the DID still produces a working URL.
  assert.equal(
    blueskyPostUrl('at://did:plc:abc123/app.bsky.feed.post/3n2c3ml', ''),
    'https://bsky.app/profile/did:plc:abc123/post/3n2c3ml',
  );
  assert.equal(blueskyPostUrl('at://did:plc:abc123/app.bsky.feed.like/x', 'a.bsky.social'), null);
});

test('canonicalUrlKey ignores tracking parameters, fragments and case', () => {
  assert.equal(
    canonicalUrlKey('https://Example.com/Story/?utm_source=x&fbclid=y#top'),
    canonicalUrlKey('https://example.com/Story'),
  );
  // Meaningful parameters stay — they can change what the link points at.
  assert.notEqual(
    canonicalUrlKey('https://example.com/a?page=1'),
    canonicalUrlKey('https://example.com/a?page=2'),
  );
  assert.equal(hostOf('https://www.example.com/x'), 'example.com');
  assert.equal(hostOf('not a url'), '');
});

test('faviconUrl targets the publisher domain only', () => {
  assert.equal(
    faviconUrl('https://www.theverge.com/2026/story'),
    'https://www.google.com/s2/favicons?domain=theverge.com&sz=128',
  );
  assert.equal(faviconUrl('not-a-url'), null);
});

// -------------------------------------------------------------- parsing -----

test('hackerNewsToItems keeps the discussion link and points the card at the article', () => {
  const payload = {
    hits: [
      {
        objectID: '44012345',
        title: 'Show HN: A thing I built',
        url: 'https://example.com/thing',
        points: 320,
        num_comments: 87,
        created_at_i: 1794700000,
        author: 'builder',
        story_text: '',
        site: 'example.com',
      },
      { objectID: '', title: 'Broken row without an id' },
    ],
  };
  const items = hackerNewsToItems(payload, 'technology');
  assert.equal(items.length, 1);
  const [entry] = items;
  assert.equal(entry.id, 'hn:44012345');
  assert.equal(entry.source, 'hackernews');
  assert.equal(entry.section, 'technology');
  assert.equal(entry.title, 'Show HN: A thing I built');
  assert.equal(entry.url, 'https://news.ycombinator.com/item?id=44012345');
  assert.equal(entry.externalUrl, 'https://example.com/thing');
  assert.equal(entry.publisher, 'example.com');
  assert.equal(entry.publisherLogo, 'https://www.google.com/s2/favicons?domain=example.com&sz=128');
  assert.equal(entry.metrics.points, 320);
  assert.equal(entry.metrics.comments, 87);
  assert.ok(entry.createdAt.startsWith('2026-11'));
});

test('blueskyToItems reads YouTube embeds, native video and image posts', () => {
  const author = {
    did: 'did:plc:5snsqcpdjobpqhme4re2jse3',
    handle: 'lizzslockeroom.bsky.social',
    displayName: 'Strictly 4 My Navigators',
    avatar: 'https://cdn.bsky.app/img/avatar/plain/x',
  };
  const payload = {
    posts: [
      {
        uri: 'at://did:plc:5snsqcpdjobpqhme4re2jse3/app.bsky.feed.post/3n2c3ml',
        author,
        record: {
          $type: 'app.bsky.feed.post',
          createdAt: '2026-11-14T18:05:50.785Z',
          text: 'Watching this launch coverage right now',
        },
        embed: {
          $type: 'app.bsky.embed.external#view',
          external: {
            uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Launch coverage',
            description: 'The full stream',
            thumb: 'https://cdn.bsky.app/img/feed_thumbnail/plain/x',
          },
        },
        likeCount: 12,
        replyCount: 3,
        repostCount: 2,
        indexedAt: '2026-11-14T18:05:50.857Z',
      },
      {
        uri: 'at://did:plc:5snsqcpdjobpqhme4re2jse3/app.bsky.feed.post/3n2c3mn',
        author,
        record: {
          $type: 'app.bsky.feed.post',
          createdAt: '2026-11-14T17:00:00.000Z',
          text: 'A native clip',
        },
        embed: {
          $type: 'app.bsky.embed.video#view',
          playlist: 'https://video.bsky.app/watch/x/playlist.m3u8',
          thumbnail: 'https://video.bsky.app/watch/x/thumbnail.jpg',
          aspectRatio: { height: 1280, width: 720 },
        },
        likeCount: 4,
        indexedAt: '2026-11-14T17:00:00.100Z',
      },
      {
        uri: 'at://did:plc:5snsqcpdjobpqhme4re2jse3/app.bsky.feed.post/3n2c3mo',
        author,
        record: { $type: 'app.bsky.feed.post', createdAt: '2026-11-14T16:00:00.000Z', text: 'Photo post' },
        embed: {
          $type: 'app.bsky.embed.images#view',
          images: [{ fullsize: 'https://cdn.bsky.app/img/fullsize/x', thumb: 'https://cdn.bsky.app/img/thumb/x' }],
        },
        indexedAt: '2026-11-14T16:00:00.100Z',
      },
    ],
  };
  const items = blueskyToItems(payload, 'videos');
  assert.equal(items.length, 3);

  const [youtube, native, photo] = items;
  assert.equal(youtube.videoKind, 'youtube');
  assert.equal(youtube.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  // The embedded video's own title becomes the headline; the post is the summary.
  assert.equal(youtube.title, 'Launch coverage');
  assert.equal(youtube.excerpt, 'Watching this launch coverage right now');
  assert.equal(youtube.imageUrl, 'https://cdn.bsky.app/img/feed_thumbnail/plain/x');
  assert.equal(youtube.url, 'https://bsky.app/profile/lizzslockeroom.bsky.social/post/3n2c3ml');
  assert.equal(youtube.publisher, 'Strictly 4 My Navigators');
  assert.equal(youtube.publisherLogo, 'https://cdn.bsky.app/img/avatar/plain/x');
  assert.equal(youtube.sourceLabel, 'Bluesky · @lizzslockeroom.bsky.social');
  assert.equal(youtube.metrics.likes, 12);
  assert.equal(youtube.metrics.comments, 3);
  assert.equal(youtube.metrics.shares, 2);

  assert.equal(native.videoKind, 'hls');
  assert.equal(native.videoUrl, 'https://video.bsky.app/watch/x/playlist.m3u8');
  assert.equal(native.imageUrl, 'https://video.bsky.app/watch/x/thumbnail.jpg');
  // No duration is invented — the API does not publish one.
  assert.equal(native.durationSeconds, null);

  assert.equal(photo.videoKind, null);
  assert.equal(photo.imageUrl, 'https://cdn.bsky.app/img/fullsize/x');
});

test('mastodonToItems reads trending statuses with media and real durations', () => {
  const payload = [
    {
      id: '111',
      url: 'https://mastodon.social/@grickle/111',
      content: '<p>Big announcement about the show</p>',
      created_at: '2026-11-14T17:04:55.000Z',
      account: {
        display_name: 'Grickle',
        acct: 'grickle@mstdn.social',
        avatar: 'https://files.mastodon.social/cache/accounts/avatars/x.jpg',
      },
      favourites_count: 59,
      reblogs_count: 12,
      replies_count: 5,
      tags: [{ name: 'animation' }],
      media_attachments: [],
    },
    {
      id: '222',
      url: 'https://mastodon.social/@catsalad/222',
      content: '<p>Loop of the new edit</p>',
      created_at: '2026-11-14T16:26:42.000Z',
      account: { display_name: 'Cat', acct: 'catsalad@infosec.exchange', avatar: 'https://x/y.png' },
      favourites_count: 3,
      reblogs_count: 1,
      replies_count: 0,
      tags: [],
      media_attachments: [
        {
          type: 'gifv',
          url: 'https://files.mastodon.media/4e6ccca7e981cd4c.mp4',
          preview_url: 'https://files.mastodon.media/4e6ccca7e981cd4c.png',
          meta: { original: { width: 640, height: 800, duration: 11.666667 } },
        },
      ],
    },
  ];
  const items = mastodonToItems(payload, 'community');
  assert.equal(items.length, 2);

  const [textPost, videoPost] = items;
  assert.equal(textPost.title, 'Big announcement about the show');
  assert.equal(textPost.url, 'https://mastodon.social/@grickle/111');
  assert.equal(textPost.publisher, 'Grickle');
  assert.equal(textPost.community, '#animation');
  assert.equal(textPost.metrics.likes, 59);
  assert.equal(textPost.metrics.shares, 12);

  assert.equal(videoPost.videoKind, 'file');
  assert.equal(videoPost.videoUrl, 'https://files.mastodon.media/4e6ccca7e981cd4c.mp4');
  assert.equal(videoPost.imageUrl, 'https://files.mastodon.media/4e6ccca7e981cd4c.png');
  assert.equal(videoPost.durationSeconds, 12);
});

test('googleTrendsRssToItems builds an article card from the first news item', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel>
<title>Daily Search Trends</title>
<item>
  <title>joe thuney</title>
  <ht:approx_traffic>500+</ht:approx_traffic>
  <description/>
  <link>https://trends.google.com/trending/rss?geo=US</link>
  <pubDate>Sat, 14 Nov 2026 09:30:00 -0800</pubDate>
  <ht:picture>https://encrypted-tbn2.gstatic.com/images?q=tbn:ABC</ht:picture>
  <ht:picture_source>News &amp; Observer</ht:picture_source>
  <ht:news_item>
    <ht:news_item_title>Joe Thuney was grateful for a scholarship</ht:news_item_title>
    <ht:news_item_snippet/>
    <ht:news_item_url>https://www.newsobserver.com/sports/nc-state/article318068151.html</ht:news_item_url>
    <ht:news_item_picture>https://encrypted-tbn2.gstatic.com/images?q=tbn:ABC</ht:news_item_picture>
    <ht:news_item_source>News &amp; Observer</ht:news_item_source>
  </ht:news_item>
</item>
<item>
  <title>a trend with no news items</title>
  <ht:approx_traffic>200+</ht:approx_traffic>
  <link>https://trends.google.com/trending/rss?geo=US</link>
  <pubDate>Sat, 14 Nov 2026 08:00:00 -0800</pubDate>
</item>
</channel></rss>`;
  const items = googleTrendsRssToItems(xml, 'trending');
  assert.equal(items.length, 2);

  const [withNews, bare] = items;
  assert.equal(withNews.title, 'Joe Thuney was grateful for a scholarship');
  // The trending context travels with the story so the card explains itself.
  assert.ok(withNews.excerpt.includes('joe thuney'));
  assert.ok(withNews.excerpt.includes('500+'));
  assert.equal(withNews.url, 'https://www.newsobserver.com/sports/nc-state/article318068151.html');
  assert.equal(withNews.publisher, 'News & Observer');
  assert.ok(withNews.imageUrl?.startsWith('https://encrypted-tbn2.gstatic.com/'));
  assert.equal(withNews.sourceLabel, 'Google Trends');

  assert.equal(bare.title, 'a trend with no news items');
  assert.equal(bare.url, 'https://trends.google.com/trending/rss?geo=US');
  assert.equal(bare.imageUrl, null);
});

test('googleNewsRssToItems strips the publisher suffix and keeps the opaque link', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Top stories - Google News</title>
<item>
  <title>FAA investigating whether new AI technology contributed to nationwide ground stop - Click2Houston</title>
  <link>https://news.google.com/rss/articles/CBMiTESTID?oc=5</link>
  <guid isPermaLink="false">CBMiTESTID</guid>
  <pubDate>Fri, 13 Nov 2026 22:57:09 GMT</pubDate>
  <description>&lt;a href="https://news.google.com/rss/articles/CBMiTESTID?oc=5" target="_blank"&gt;FAA investigating&lt;/a&gt;</description>
  <source url="https://click2houston.com">Click2Houston</source>
</item>
<item>
  <title>A headline that already keeps its own dash - not the publisher</title>
  <link>https://news.google.com/rss/articles/CBMiTESTID2?oc=5</link>
  <pubDate>Fri, 13 Nov 2026 21:00:00 GMT</pubDate>
  <source url="https://other.example.com">Other</source>
</item>
</channel></rss>`;
  const items = googleNewsRssToItems(xml, 'top-stories');
  assert.equal(items.length, 2);

  const [first, second] = items;
  assert.equal(
    first.title,
    'FAA investigating whether new AI technology contributed to nationwide ground stop',
  );
  assert.equal(first.url, 'https://news.google.com/rss/articles/CBMiTESTID?oc=5');
  assert.equal(first.publisher, 'Click2Houston');
  assert.equal(first.publisherLogo, 'https://www.google.com/s2/favicons?domain=click2houston.com&sz=128');
  // Google News publishes no summary — an honest empty string, not filler.
  assert.equal(first.excerpt, '');
  assert.equal(first.imageUrl, null);
  // The suffix only strips when it really is the publisher's name.
  assert.equal(second.title, 'A headline that already keeps its own dash - not the publisher');
});

test('githubToItems carries stars, owner avatar and no invented image', () => {
  const payload = {
    items: [
      {
        full_name: 'huamidev/GestaltX',
        html_url: 'https://github.com/huamidev/GestaltX',
        description: 'An agent framework',
        stargazers_count: 1840,
        forks_count: 96,
        language: 'TypeScript',
        topics: ['ai', 'agents'],
        owner: { login: 'huamidev', avatar_url: 'https://avatars.githubusercontent.com/u/354314991?v=4' },
        created_at: '2026-11-12T10:00:00Z',
      },
      { full_name: '', html_url: 'https://github.com/x' },
    ],
  };
  const items = githubToItems(payload, 'trending');
  assert.equal(items.length, 1);
  const [repo] = items;
  assert.equal(repo.title, 'huamidev/GestaltX');
  assert.equal(repo.url, 'https://github.com/huamidev/GestaltX');
  assert.equal(repo.publisher, 'huamidev');
  assert.equal(repo.publisherLogo, 'https://avatars.githubusercontent.com/u/354314991?v=4');
  assert.equal(repo.imageUrl, null);
  assert.equal(repo.metrics.stars, 1840);
  assert.equal(repo.metrics.forks, 96);
  assert.equal(repo.community, 'TypeScript');
});

test('devToItems keeps the cover image and the author logo', () => {
  const payload = [
    {
      id: 123456,
      title: 'Why your React app re-renders',
      description: 'A practical guide to renders.',
      url: 'https://dev.to/jane/why-your-react-app-re-renders-abc1',
      published_at: '2026-11-14T09:00:00Z',
      positive_reactions_count: 210,
      comments_count: 34,
      social_image: 'https://media2.dev.to/cdn-cgi/image/cover.jpg',
      user: { name: 'Jane Doe', username: 'jane', profile_image_92: 'https://avatars.dev.to/jane.jpg' },
      tag_list: ['react', 'javascript'],
    },
  ];
  const items = devToItems(payload, 'technology');
  assert.equal(items.length, 1);
  const [entry] = items;
  assert.equal(entry.title, 'Why your React app re-renders');
  assert.equal(entry.url, 'https://dev.to/jane/why-your-react-app-re-renders-abc1');
  assert.equal(entry.imageUrl, 'https://media2.dev.to/cdn-cgi/image/cover.jpg');
  assert.equal(entry.publisher, 'Jane Doe');
  assert.equal(entry.publisherLogo, 'https://avatars.dev.to/jane.jpg');
  assert.equal(entry.author, '@jane');
  assert.equal(entry.community, '#react');
  assert.equal(entry.metrics.likes, 210);
});

test('gdeltToItems parses seendate, domain and social image', () => {
  const payload = {
    articles: [
      {
        url: 'https://www.example.com/2026/11/ai-story',
        title: 'AI story travels the wires',
        seendate: '20261114T033000Z',
        socialimage: 'https://cdn.example.com/ai-story.jpg',
        domain: 'example.com',
        language: 'English',
        sourcecountry: 'United States',
      },
      { url: 'not-a-url', title: 'Skipped' },
    ],
  };
  const items = gdeltToItems(payload, 'top-stories');
  assert.equal(items.length, 1);
  const [entry] = items;
  assert.equal(entry.id.startsWith('gdelt:'), true);
  assert.equal(entry.createdAt, '2026-11-14T03:30:00.000Z');
  assert.equal(entry.imageUrl, 'https://cdn.example.com/ai-story.jpg');
  assert.equal(entry.publisher, 'example.com');
  assert.equal(entry.publisherLogo, 'https://www.google.com/s2/favicons?domain=example.com&sz=128');
  assert.equal(entry.excerpt, '');
  assert.equal(entry.community, 'United States');
});

test('lobstersToItems separates the discussion link from the original article', () => {
  const payload = [
    {
      short_id: 'abc123',
      short_id_url: 'https://lobste.rs/s/abc123',
      created_at: '2026-11-14T12:00:00.000Z',
      title: 'Show HN: A very good tool',
      url: 'https://averygoodtool.dev/blog/launch',
      score: 42,
      comment_count: 10,
      description: 'Launch post',
      description_plain: 'Launch post',
      submitter_user: 'alice',
      tags: ['show'],
    },
    {
      short_id: 'ask456',
      short_id_url: 'https://lobste.rs/s/ask456',
      created_at: '2026-11-14T11:00:00.000Z',
      title: 'Ask: how do you price?',
      url: '',
      score: 5,
      comment_count: 2,
      description_plain: 'Discussion only',
      submitter_user: 'bob',
      tags: ['ask'],
    },
  ];
  const items = lobstersToItems(payload, 'community');
  assert.equal(items.length, 2);
  const [show, ask] = items;
  assert.equal(show.url, 'https://lobste.rs/s/abc123');
  assert.equal(show.externalUrl, 'https://averygoodtool.dev/blog/launch');
  assert.equal(show.publisher, 'averygoodtool.dev');
  assert.equal(show.metrics.upvotes, 42);
  assert.equal(show.community, '#show');
  // No outbound article: the discussion itself is the only link.
  assert.equal(ask.externalUrl, undefined);
  assert.equal(ask.publisher, 'Lobsters');
});

// -------------------------------------------------------------- merging -----

test('dedupeTrendItems collapses the same story across sources by URL', () => {
  const a = item({ id: 'gdelt:1', source: 'gdelt', url: 'https://example.com/story' });
  const b = item({
    id: 'hn:1',
    source: 'hackernews',
    url: 'https://example.com/story/?utm_source=hn',
  });
  const out = dedupeTrendItems([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'gdelt:1');
});

test('dedupeTrendItems matches identical syndicated headlines and prefers the image', () => {
  const textOnly = item({
    id: 'gnews:1',
    source: 'googlenews',
    url: 'https://news.google.com/rss/articles/OPAQUE1?oc=5',
    title: 'Regulators open a fresh inquiry into nationwide data center outages',
  });
  const withImage = item({
    id: 'gdelt:1',
    source: 'gdelt',
    url: 'https://wire.example.com/data-center-inquiry',
    title: 'Regulators open a fresh inquiry into nationwide data center outages',
    imageUrl: 'https://cdn.example.com/inquiry.jpg',
  });
  const out = dedupeTrendItems([textOnly, withImage]);
  assert.equal(out.length, 1);
  // The image-bearing card wins so the feed keeps its photo.
  assert.equal(out[0].id, 'gdelt:1');
});

test('dedupeTrendItems keeps short look-alike titles apart', () => {
  const a = item({ id: 'gnews:1', url: 'https://news.google.com/rss/articles/A?oc=5', title: 'Breaking news' });
  const b = item({ id: 'gnews:2', url: 'https://news.google.com/rss/articles/B?oc=5', title: 'Breaking news' });
  assert.equal(dedupeTrendItems([a, b]).length, 2);
});

test('rankTrendItems buckets by age first, then by platform weight', () => {
  const fresh = item({ id: 'f', createdAt: ago(1), metrics: { likes: 5 } });
  const old = item({ id: 'o', createdAt: ago(100), metrics: { likes: 50_000 } });
  const mid = item({ id: 'm', createdAt: ago(10), metrics: { likes: 500 } });
  const ranked = rankTrendItems([old, fresh, mid]);
  assert.deepEqual(ranked.map((entry) => entry.id), ['f', 'm', 'o']);
});

test('filterTrendItems narrows by source and free text', () => {
  const items = [
    item({ id: 'a', source: 'bluesky', title: 'Reels hooks that work' }),
    item({ id: 'b', source: 'hackernews', title: 'Something else entirely' }),
  ];
  assert.equal(filterTrendItems(items, { source: 'bluesky' }).length, 1);
  assert.equal(filterTrendItems(items, { query: 'reels' }).length, 1);
  assert.equal(filterTrendItems(items, { query: 'zzz' }).length, 0);
});

// -------------------------------------------------------------- display -----

test('engagementLabel speaks each source\'s own language', () => {
  assert.equal(engagementLabel(item({ metrics: { stars: 1840, forks: 96, comments: 12 } })), '1.8K stars · 96 forks · 12 comments');
  assert.equal(engagementLabel(item({ metrics: { upvotes: 320, comments: 87 } })), '320 upvotes · 87 comments');
  assert.equal(engagementLabel(item({ metrics: { likes: 59, shares: 12 } })), '59 likes · 12 reposts');
  assert.equal(engagementLabel(item({ metrics: {} })), null);
});

test('formatCount scales without lying about precision', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1234), '1.2K');
  assert.equal(formatCount(48_000), '48K');
  assert.equal(formatCount(4_800_000), '4.8M');
  assert.equal(formatCount(-5), '0');
});
