import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRequiredPermissions,
  buildInstagramAuthorizationUrl,
  createOpaqueToken,
  decryptAccessToken,
  encryptAccessToken,
  fetchInstagramDashboard,
  normalizeInstagramMedia,
  normalizeInstagramProfile,
  parseInstagramInsightValue,
  REQUIRED_SCOPES,
} from './instagram';

test('authorization URL uses Instagram Login and only the requested scopes', () => {
  const state = createOpaqueToken();
  const url = new URL(
    buildInstagramAuthorizationUrl(
      '123456789',
      'https://api.example.test/api/instagram/callback',
      state,
    ),
  );

  assert.equal(url.origin, 'https://www.instagram.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('enable_fb_login'), 'false');
  assert.equal(url.searchParams.get('force_reauth'), 'true');
  assert.equal(url.searchParams.get('state'), state);
  assert.deepEqual(url.searchParams.get('scope')?.split(','), [
    ...REQUIRED_SCOPES,
  ]);
});

test('required Instagram permissions must both be granted', () => {
  assert.deepEqual(
    assertRequiredPermissions(REQUIRED_SCOPES.join(',')),
    [...REQUIRED_SCOPES],
  );
  assert.throws(
    () => assertRequiredPermissions('instagram_business_basic'),
    /missing_permissions/,
  );
});

test('profile parser accepts professional Creator and Business accounts only', () => {
  assert.deepEqual(
    normalizeInstagramProfile({
      user_id: '17840000000000000',
      username: 'veyyra_creator',
      account_type: 'Media_Creator',
      profile_picture_url: 'https://cdn.example.test/profile.jpg',
    }),
    {
      instagramUserId: '17840000000000000',
      username: 'veyyra_creator',
      accountType: 'Media_Creator',
      profilePictureUrl: 'https://cdn.example.test/profile.jpg',
    },
  );
  assert.throws(
    () =>
      normalizeInstagramProfile({
        user_id: '123',
        username: 'personal',
        account_type: 'Personal',
      }),
    /unsupported_account/,
  );
  assert.throws(
    () =>
      normalizeInstagramProfile({
        user_id: '123',
        username: 'personal',
        account_type: null,
      }),
    /invalid_profile/,
  );
});

test('access tokens encrypt and decrypt with authenticated AES-GCM', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const token = 'instagram-token-never-returned-to-the-client';
  const encrypted = await encryptAccessToken(token, key);

  assert.notEqual(encrypted.ciphertext, token);
  assert.equal(await decryptAccessToken(encrypted, key), token);

  const lastCharacter = encrypted.ciphertext.at(-1) === 'A' ? 'B' : 'A';
  const tampered = {
    ...encrypted,
    ciphertext: `${encrypted.ciphertext.slice(0, -1)}${lastCharacter}`,
  };
  await assert.rejects(() => decryptAccessToken(tampered, key));
});

test('insight parser preserves real totals and leaves unavailable values empty', () => {
  assert.equal(
    parseInstagramInsightValue(
      { data: [{ name: 'views', total_value: { value: 1432 } }] },
      'views',
    ),
    1432,
  );
  assert.equal(
    parseInstagramInsightValue(
      { data: [{ name: 'views', total_value: { value: null } }] },
      'views',
    ),
    null,
  );
  assert.equal(
    parseInstagramInsightValue({ data: [] }, 'views'),
    null,
  );
});

test('media parser returns only supported real fields and HTTPS image URLs', () => {
  assert.deepEqual(
    normalizeInstagramMedia({
      data: [
        {
          id: 'media-1',
          media_type: 'VIDEO',
          thumbnail_url: 'https://cdn.example.test/reel.jpg',
          media_url: 'http://insecure.example.test/reel.mp4',
          permalink: 'https://www.instagram.com/reel/abc/',
          timestamp: '2026-04-12T11:00:00+0000',
          like_count: 14,
          comments_count: 2,
        },
        {
          id: 'media-2',
          media_type: 'IMAGE',
          media_url: 'javascript:alert(1)',
          like_count: null,
        },
      ],
    }),
    [
      {
        id: 'media-1',
        mediaType: 'VIDEO',
        thumbnailUrl: 'https://cdn.example.test/reel.jpg',
        permalink: 'https://www.instagram.com/reel/abc/',
        timestamp: '2026-04-12T11:00:00+0000',
        likes: 14,
        comments: 2,
      },
      {
        id: 'media-2',
        mediaType: 'IMAGE',
        thumbnailUrl: null,
        permalink: null,
        timestamp: null,
        likes: null,
        comments: null,
      },
    ],
  );
});

test('dashboard reads only returned profile, media and insight data', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    if (url.pathname.endsWith('/me')) {
      return Response.json({
        data: [{
          user_id: '17840000000000000',
          username: 'veyyra_creator',
          account_type: 'Media_Creator',
          profile_picture_url: 'https://cdn.example.test/profile.jpg',
          followers_count: 321,
        }],
      });
    }
    if (url.pathname.endsWith('/me/media')) {
      return Response.json({
        data: [{
          id: 'media-1',
          media_type: 'VIDEO',
          thumbnail_url: 'https://cdn.example.test/reel.jpg',
          like_count: 16,
          comments_count: 3,
        }],
      });
    }
    if (url.pathname.endsWith('/insights')) {
      const metric = url.searchParams.get('metric');
      if (metric === 'comments') {
        return Response.json(
          { error: { code: 100, message: 'Metric unavailable' } },
          { status: 400 },
        );
      }
      return Response.json({
        data: [{
          name: metric,
          total_value: { value: metric === 'views' ? 1234 : 42 },
        }],
      });
    }
    return Response.json({ error: { message: 'Unexpected endpoint' } }, {
      status: 404,
    });
  };

  try {
    const dashboard = await fetchInstagramDashboard(
      '17840000000000000',
      'server-only-test-token',
    );
    assert.deepEqual(dashboard.stats, {
      views: 1234,
      likes: 42,
      comments: null,
      followers: 321,
    });
    assert.equal(dashboard.profile.username, 'veyyra_creator');
    assert.equal(dashboard.media[0]?.id, 'media-1');
    assert.equal(dashboard.media[0]?.likes, 16);
    assert.equal(
      requestedUrls.filter((url) => url.pathname.endsWith('/insights')).length,
      3,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
