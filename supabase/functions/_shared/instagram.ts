export const REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
] as const;

export type AccountType = 'Business' | 'Media_Creator';

export type InstagramProfile = {
  instagramUserId: string;
  username: string;
  accountType: AccountType;
  profilePictureUrl: string | null;
};

export type EncryptedToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type InstagramDashboard = {
  profile: InstagramProfile & {
    followersCount: number | null;
    mediaCount: number | null;
  };
  stats: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    followers: number | null;
    reach: number | null;
    previous: {
      views: number | null;
      likes: number | null;
      comments: number | null;
    } | null;
  };
  media: InstagramMedia[];
  daily: Array<{
    date: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
  }> | null;
};

export type InstagramMedia = {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likes: number | null;
  comments: number | null;
  caption: string | null;
};

export type InstagramErrorCode =
  | 'invalid_authorization_code'
  | 'missing_permissions'
  | 'unsupported_account'
  | 'invalid_profile'
  | 'instagram_api_error';

export class InstagramFlowError extends Error {
  constructor(
    readonly code: InstagramErrorCode,
    /** Raw provider detail (e.g. the rejected account_type) for display. */
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'InstagramFlowError';
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createOpaqueToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

type InstagramConfig = {
  instagramAppId: string;
  instagramAppSecret: string;
  instagramRedirectUri: string;
  tokenEncryptionKey: Uint8Array;
};

type TokenResponse = {
  access_token?: unknown;
  permissions?: unknown;
  expires_in?: unknown;
  data?: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return record(value[0]);
  }
  const direct = record(value);
  if (!direct) {
    return null;
  }
  return Array.isArray(direct.data) ? record(direct.data[0]) : direct;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildInstagramAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  url.searchParams.set('state', state);
  url.searchParams.set('enable_fb_login', 'false');
  url.searchParams.set('force_reauth', 'true');
  return url.toString();
}

export function parseGrantedPermissions(value: unknown): Set<string> {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return new Set(
    entries
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function assertRequiredPermissions(value: unknown): string[] {
  const granted = parseGrantedPermissions(value);
  const missing = REQUIRED_SCOPES.filter((permission) => !granted.has(permission));
  if (missing.length > 0) {
    throw new InstagramFlowError('missing_permissions');
  }
  return [...granted];
}

function normalizeAccountType(value: unknown): AccountType | null {
  if (typeof value !== 'string') {
    return null;
  }
  // Match case/separator-insensitively ('Creator', 'Media_Creator',
  // 'MEDIA CREATOR', …) so label drift never rejects a professional account
  // as unsupported.
  const label = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (label === 'business') {
    return 'Business';
  }
  if (label === 'creator' || label === 'mediacreator') {
    return 'Media_Creator';
  }
  return null;
}

export function normalizeInstagramProfile(value: unknown): InstagramProfile {
  const data = firstRecord(value);
  const instagramUserId = requiredString(data?.user_id);
  const username = requiredString(data?.username);
  const accountTypeValue = data?.account_type;
  const accountType = normalizeAccountType(accountTypeValue);
  const hasExplicitUnsupportedAccountType =
    instagramUserId !== null &&
    username !== null &&
    accountTypeValue !== undefined &&
    accountTypeValue !== null &&
    !(typeof accountTypeValue === 'string' && accountTypeValue.trim() === '');
  if (!instagramUserId || !username || !accountType) {
    if (hasExplicitUnsupportedAccountType) {
      // Carry the raw value to the app ("Instagram reports: …") so a stuck
      // conversion or wrong-account login is visible instead of a dead end.
      const reported = String(accountTypeValue).slice(0, 40);
      console.error(
        `Instagram rejected account_type=${JSON.stringify(reported)} for @${username || 'unknown'}`,
      );
      throw new InstagramFlowError('unsupported_account', reported);
    }
    throw new InstagramFlowError('invalid_profile');
  }

  const picture = requiredString(data?.profile_picture_url);
  let profilePictureUrl: string | null = null;
  if (picture) {
    try {
      const url = new URL(picture);
      if (url.protocol === 'https:') {
        profilePictureUrl = url.toString();
      }
    } catch {
      profilePictureUrl = null;
    }
  }

  return { instagramUserId, username, accountType, profilePictureUrl };
}

export async function encryptAccessToken(
  accessToken: string,
  keyBytes: Uint8Array,
): Promise<EncryptedToken> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      new TextEncoder().encode(accessToken),
    ),
  );
  return {
    ciphertext: encodeBase64(encrypted.slice(0, -16)),
    iv: encodeBase64(iv),
    authTag: encodeBase64(encrypted.slice(-16)),
  };
}

export async function decryptAccessToken(
  encrypted: EncryptedToken,
  keyBytes: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const ciphertext = decodeBase64(encrypted.ciphertext);
  const authTag = decodeBase64(encrypted.authTag);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(decodeBase64(encrypted.iv)),
      tagLength: 128,
    },
    key,
    combined,
  );
  return new TextDecoder().decode(decrypted);
}

export class InstagramApiError extends Error {
  constructor(
    readonly code:
      | 'reconnect_required'
      | 'metric_unavailable'
      | 'instagram_api_error',
  ) {
    super(code);
    this.name = 'InstagramApiError';
  }
}

function optionalCount(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }
  const count = value;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseInstagramInsightValue(
  value: unknown,
  metric: string,
): number | null {
  const body = record(value);
  const data = Array.isArray(body?.data) ? body.data : [];
  const result = data
    .map(record)
    .find((item) => item?.name === metric);
  const totalValue = record(result?.total_value);
  return optionalCount(totalValue?.value);
}

export function parseInstagramInsightSeries(
  value: unknown,
  metric: string,
): Array<{ date: string; value: number }> | null {
  const body = record(value);
  const data = Array.isArray(body?.data) ? body.data : [];
  const result = data
    .map(record)
    .find((item) => item?.name === metric) ?? null;
  if (!result || !Array.isArray(result.values)) {
    return null;
  }
  const points = result.values
    .map(record)
    .flatMap((entry) => {
      if (!entry) {
        return [];
      }
      const endTime = requiredString(entry.end_time);
      const count = optionalCount(entry.value);
      if (!endTime || count === null) {
        return [];
      }
      const date = endTime.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return [];
      }
      return [{ date, value: count }];
    });
  return points.length > 0 ? points : null;
}

export function normalizeInstagramMedia(value: unknown): InstagramMedia[] {
  const body = record(value);
  if (!Array.isArray(body?.data)) {
    throw new InstagramApiError('instagram_api_error');
  }
  return body.data
    .map(record)
    .filter((item): item is Record<string, unknown> => item !== null)
    .flatMap((item) => {
      const id = requiredString(item.id);
      const mediaType = item.media_type;
      if (
        !id ||
        (mediaType !== 'IMAGE' &&
          mediaType !== 'VIDEO' &&
          mediaType !== 'CAROUSEL_ALBUM')
      ) {
        return [];
      }
      return [{
        id,
        mediaType,
        thumbnailUrl: safeHttpsUrl(
          mediaType === 'VIDEO' ? item.thumbnail_url ?? item.media_url : item.media_url,
        ),
        permalink: safeHttpsUrl(item.permalink),
        timestamp: requiredString(item.timestamp),
        likes: optionalCount(item.like_count),
        comments: optionalCount(item.comments_count),
        caption: typeof item.caption === 'string' && item.caption.trim().length > 0
          ? item.caption
          : null,
      }];
    });
}

async function instagramApiGet(
  url: URL,
  accessToken: string,
  allowMetricUnavailable = false,
): Promise<unknown> {
  url.searchParams.set('access_token', accessToken);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramApiError('instagram_api_error');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new InstagramApiError('instagram_api_error');
  }
  if (!response.ok) {
    const error = record(record(body)?.error);
    const code = error?.code;
    if (
      response.status === 401 ||
      response.status === 403 ||
      code === 190 ||
      code === '190'
    ) {
      throw new InstagramApiError('reconnect_required');
    }
    if (allowMetricUnavailable && response.status === 400 && code === 100) {
      throw new InstagramApiError('metric_unavailable');
    }
    throw new InstagramApiError('instagram_api_error');
  }
  return body;
}

function instagramGraphUrl(path: string): URL {
  return new URL(`https://graph.instagram.com/v25.0/${path}`);
}

export async function fetchInstagramDashboard(
  instagramUserId: string,
  accessToken: string,
): Promise<InstagramDashboard> {
  // Ask for the exact fields we consume: without them Meta returns only the
  // defaults, the profile normalizer rejects the account, and the dashboard
  // dies as "reconnect required" with null stats.
  const profileUrl = instagramGraphUrl('me');
  profileUrl.searchParams.set(
    'fields',
    'user_id,username,account_type,profile_picture_url,followers_count,media_count',
  );
  const profileResponse = await instagramApiGet(profileUrl, accessToken);
  const profileData = firstRecord(profileResponse);
  if (!profileData) {
    throw new InstagramApiError('instagram_api_error');
  }
  let profile: InstagramProfile;
  try {
    profile = normalizeInstagramProfile(profileData);
  } catch {
    throw new InstagramApiError('reconnect_required');
  }
  if (profile.instagramUserId !== instagramUserId) {
    throw new InstagramApiError('reconnect_required');
  }

  const followersCount = optionalCount(profileData.followers_count);
  const mediaCount = optionalCount(profileData.media_count);
  const mediaUrl = instagramGraphUrl('me/media');
  mediaUrl.searchParams.set(
    'fields',
    'id,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,caption',
  );
  mediaUrl.searchParams.set('limit', '10');

  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  const requestWindowTotals = async (
    metrics: readonly string[],
    from: number,
    to: number,
    lenient: boolean,
  ): Promise<unknown[]> =>
    Promise.all(
      metrics.map(async (metric) => {
        const insightUrl = instagramGraphUrl(`${instagramUserId}/insights`);
        insightUrl.searchParams.set('metric', metric);
        insightUrl.searchParams.set('period', 'day');
        insightUrl.searchParams.set('metric_type', 'total_value');
        insightUrl.searchParams.set('since', String(from));
        insightUrl.searchParams.set('until', String(to));
        try {
          return await instagramApiGet(insightUrl, accessToken, true);
        } catch (error) {
          if (
            error instanceof InstagramApiError &&
            error.code === 'reconnect_required'
          ) {
            throw error;
          }
          if (
            !lenient &&
            (!(error instanceof InstagramApiError) ||
              error.code !== 'metric_unavailable')
          ) {
            throw error;
          }
          return null;
        }
      }),
    );

  // Current 30-day totals for the headline stats, previous 30-day totals for
  // real growth deltas, and a 90-day daily series for charts/period filters.
  // Every window is lenient so a metric hiccup (common on newly converted
  // accounts) degrades to null stats instead of taking the dashboard down —
  // auth failures still propagate as reconnect_required.
  const [insightValues, previousValues, dailySeriesValues] = await Promise.all([
    requestWindowTotals(['views', 'likes', 'comments', 'reach'], now - 30 * day, now, true),
    requestWindowTotals(['views', 'likes', 'comments'], now - 60 * day, now - 30 * day, true),
    Promise.all(
      (['views', 'likes', 'comments'] as const).map(async (metric) => {
        const insightUrl = instagramGraphUrl(`${instagramUserId}/insights`);
        insightUrl.searchParams.set('metric', metric);
        insightUrl.searchParams.set('period', 'day');
        insightUrl.searchParams.set('since', String(now - 90 * day));
        insightUrl.searchParams.set('until', String(now));
        try {
          return await instagramApiGet(insightUrl, accessToken, true);
        } catch {
          return null;
        }
      }),
    ),
  ]);
  let mediaResponse: unknown;
  try {
    mediaResponse = await instagramApiGet(mediaUrl, accessToken);
  } catch (error) {
    if (
      error instanceof InstagramApiError &&
      error.code === 'reconnect_required'
    ) {
      throw error;
    }
    // Some API responses reject the caption field; retry without it rather than fail the dashboard.
    mediaUrl.searchParams.set(
      'fields',
      'id,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    );
    mediaResponse = await instagramApiGet(mediaUrl, accessToken);
  }
  const media = normalizeInstagramMedia(mediaResponse);

  const seriesByMetric = [
    parseInstagramInsightSeries(dailySeriesValues[0], 'views'),
    parseInstagramInsightSeries(dailySeriesValues[1], 'likes'),
    parseInstagramInsightSeries(dailySeriesValues[2], 'comments'),
  ];
  const dailyDates = new Set<string>();
  for (const points of seriesByMetric) {
    for (const point of points ?? []) {
      dailyDates.add(point.date);
    }
  }
  const valueAt = (
    points: Array<{ date: string; value: number }> | null,
    date: string,
  ): number | null => points?.find((point) => point.date === date)?.value ?? null;
  const daily = dailyDates.size === 0
    ? null
    : [...dailyDates].sort().map((date) => ({
      date,
      views: valueAt(seriesByMetric[0], date),
      likes: valueAt(seriesByMetric[1], date),
      comments: valueAt(seriesByMetric[2], date),
    }));

  return {
    profile: { ...profile, followersCount, mediaCount },
    stats: {
      views: parseInstagramInsightValue(insightValues[0], 'views'),
      likes: parseInstagramInsightValue(insightValues[1], 'likes'),
      comments: parseInstagramInsightValue(insightValues[2], 'comments'),
      reach: parseInstagramInsightValue(insightValues[3], 'reach'),
      followers: followersCount,
      previous: {
        views: parseInstagramInsightValue(previousValues[0], 'views'),
        likes: parseInstagramInsightValue(previousValues[1], 'likes'),
        comments: parseInstagramInsightValue(previousValues[2], 'comments'),
      },
    },
    media,
    daily,
  };
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }

  const data = firstRecord(body);
  if (!response.ok || !data) {
    throw new InstagramFlowError('instagram_api_error');
  }
  return data;
}

async function exchangeAuthorizationCode(
  code: string,
  config: InstagramConfig,
): Promise<{ accessToken: string; permissions: unknown }> {
  const form = new FormData();
  form.append('client_id', config.instagramAppId);
  form.append('client_secret', config.instagramAppSecret);
  form.append('grant_type', 'authorization_code');
  form.append('redirect_uri', config.instagramRedirectUri);
  form.append('code', code);

  let response: Response;
  try {
    response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new InstagramFlowError('invalid_authorization_code');
  }
  const data = firstRecord(body);
  const accessToken = requiredString(data?.access_token);
  if (!response.ok || !accessToken) {
    throw new InstagramFlowError('invalid_authorization_code');
  }
  return { accessToken, permissions: data?.permissions };
}

async function exchangeLongLivedToken(
  shortLivedToken: string,
  config: InstagramConfig,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', config.instagramAppSecret);
  url.searchParams.set('access_token', shortLivedToken);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }

  const data = await readResponse(response);
  const accessToken = requiredString(data.access_token);
  const expiresIn = Number(data.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new InstagramFlowError('instagram_api_error');
  }

  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

async function fetchInstagramProfile(
  accessToken: string,
): Promise<InstagramProfile> {
  const url = new URL('https://graph.instagram.com/v25.0/me');
  url.searchParams.set(
    'fields',
    'user_id,username,account_type,profile_picture_url',
  );
  url.searchParams.set('access_token', accessToken);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }

  return normalizeInstagramProfile(await readResponse(response));
}

export async function completeInstagramConnection(
  code: string,
  config: InstagramConfig,
): Promise<{
  profile: InstagramProfile;
  encryptedToken: EncryptedToken;
  tokenExpiresAt: Date;
  grantedPermissions: string[];
}> {
  const shortLived = await exchangeAuthorizationCode(code, config);
  const grantedPermissions = assertRequiredPermissions(shortLived.permissions);
  const longLived = await exchangeLongLivedToken(
    shortLived.accessToken,
    config,
  );
  const profile = await fetchInstagramProfile(longLived.accessToken);

  return {
    profile,
    encryptedToken: await encryptAccessToken(
      longLived.accessToken,
      config.tokenEncryptionKey,
    ),
    tokenExpiresAt: longLived.expiresAt,
    grantedPermissions,
  };
}
