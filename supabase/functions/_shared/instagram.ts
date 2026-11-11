export const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
] as const;

// 'Professional' is the honest fallback when Meta does not return
// `account_type` (the field is documented only for graph.instagram.com, not
// for the graph.facebook.com host Unified Login uses).
export type AccountType = 'Business' | 'Media_Creator' | 'Professional';

// Unified Login issues a system-user token whose expiration Meta stores as
// "Never". The connections table requires a non-null expiry, so a far-future
// sentinel is stored instead; the session RPCs already clamp it with
// least(token_expires_at, now() + 30 days).
const NON_EXPIRING_TOKEN_EXPIRES_AT = new Date('2100-01-01T00:00:00Z');

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
    // Account-level professional insights (30-day window); null when the
    // metric isn't shared with the connected account.
    shares: number | null;
    saves: number | null;
    profileViews: number | null;
    // Real window totals backing the period filters when no day-series is
    // shared; individual values are null when unavailable.
    week: {
      views: number | null;
      likes: number | null;
      comments: number | null;
    };
    ninety: {
      views: number | null;
      likes: number | null;
      comments: number | null;
    };
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

// graph.facebook.com identifies the IG User with `id`; the profile normalizer
// reads `user_id` (the graph.instagram.com spelling), so bridge the two
// spellings without loosening the normalizer's validation.
function withNormalizerUserId(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (data.user_id === undefined && typeof data.id === 'string') {
    return { ...data, user_id: data.id };
  }
  return data;
}

export function buildInstagramAuthorizationUrl(
  clientId: string,
  configId: string,
  redirectUri: string,
  state: string,
): string {
  // Meta retired instagram.com/oauth/authorize for newer apps: login now runs
  // through Unified Login, where the configuration (config_id) fixes the
  // permission set instead of a `scope` parameter, and `prompt=login` keeps
  // the account picker showing on every attempt (the old force_reauth).
  const url = new URL('https://www.facebook.com/dialog/oauth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('config_id', configId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('display', 'popup');
  url.searchParams.set('prompt', 'login');
  url.searchParams.set('state', state);
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
  if (granted.size === 0) {
    // Unified Login's system-user token exchange returns no permissions list
    // at all (the config_id fixed the grant), so "nothing to check" is the
    // expected shape — the profile read immediately after is what proves
    // instagram_basic actually works. A non-empty list is still enforced.
    return [];
  }
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
  if (label === 'professional') {
    return 'Professional';
  }
  return null;
}

export function normalizeInstagramProfile(value: unknown): InstagramProfile {
  const data = firstRecord(value);
  const instagramUserId = requiredString(data?.user_id);
  const username = requiredString(data?.username);
  const accountTypeValue = data?.account_type;
  const accountType = normalizeAccountType(accountTypeValue);
  if (!instagramUserId || !username) {
    throw new InstagramFlowError('invalid_profile');
  }
  const hasExplicitAccountType =
    accountTypeValue !== undefined &&
    accountTypeValue !== null &&
    !(typeof accountTypeValue === 'string' && accountTypeValue.trim() === '');
  if (hasExplicitAccountType && !accountType) {
    // Carry the raw value to the app ("Instagram reports: …") so a stuck
    // conversion or wrong-account login is visible instead of a dead end.
    const reported = String(accountTypeValue).slice(0, 40);
    console.error(
      `Instagram rejected account_type=${JSON.stringify(reported)} for @${username}`,
    );
    throw new InstagramFlowError('unsupported_account', reported);
  }
  // Unified Login on graph.facebook.com can omit account_type entirely (the
  // field is documented only for graph.instagram.com). Every account that can
  // authorize here is professional — a personal one cannot — so an absent
  // value gets the honest 'Professional' label instead of failing the connect.
  const resolvedType: AccountType = accountType ?? 'Professional';

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

  return {
    instagramUserId,
    username,
    accountType: resolvedType,
    profilePictureUrl,
  };
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
  // Unified Login tokens are read on graph.facebook.com (the Instagram hosts
  // are retired for newer apps); the IG User node is addressed by its own id.
  return new URL(`https://graph.facebook.com/v27.0/${path}`);
}

export async function fetchInstagramDashboard(
  instagramUserId: string,
  accessToken: string,
): Promise<InstagramDashboard> {
  // Ask for the exact fields we consume: without them Meta returns only the
  // defaults, the profile normalizer rejects the account, and the dashboard
  // dies as "reconnect required" with null stats. The IG User node (not
  // `/me`, which would be the system user on this host) reports `id`, which
  // the normalizer bridges to `user_id`.
  const profileUrl = instagramGraphUrl(instagramUserId);
  profileUrl.searchParams.set(
    'fields',
    'id,username,account_type,profile_picture_url,followers_count,media_count',
  );
  let profileResponse: unknown;
  try {
    profileResponse = await instagramApiGet(profileUrl, accessToken);
  } catch (error) {
    if (
      error instanceof InstagramApiError &&
      error.code === 'reconnect_required'
    ) {
      throw error;
    }
    // `account_type` is documented only for graph.instagram.com; if Meta
    // rejects the field set on this host (error 100), retry without it — the
    // normalizer then labels the account Professional instead of killing the
    // dashboard.
    profileUrl.searchParams.set(
      'fields',
      'id,username,profile_picture_url,followers_count,media_count',
    );
    profileResponse = await instagramApiGet(profileUrl, accessToken);
  }
  const profileData = firstRecord(profileResponse);
  if (!profileData) {
    throw new InstagramApiError('instagram_api_error');
  }
  let profile: InstagramProfile;
  try {
    profile = normalizeInstagramProfile(withNormalizerUserId(profileData));
  } catch {
    throw new InstagramApiError('reconnect_required');
  }
  if (profile.instagramUserId !== instagramUserId) {
    throw new InstagramApiError('reconnect_required');
  }

  const followersCount = optionalCount(profileData.followers_count);
  const mediaCount = optionalCount(profileData.media_count);
  const mediaUrl = instagramGraphUrl(`${instagramUserId}/media`);
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
  // real growth deltas, and a ~90-day daily series for charts/period filters.
  // Every window is lenient so a metric hiccup (common on newly converted
  // accounts) degrades to null stats instead of taking the dashboard down —
  // auth failures still propagate as reconnect_required.
  // Instagram retains ~90 days of insights but rejects a single since/until
  // request spanning much more than a month — one 90-day day-series query
  // was silently failing, which left every period except 30 days empty. The
  // day-series is fetched in three one-month chunks instead (a failed chunk
  // is skipped: shorter history beats none), and the 7-/90-day window totals
  // fall back to sums of that series when Meta rejects their wider window.
  const dailyWindows = [1, 2, 3].map((back) => ({
    start: now - back * 30 * day,
    end: now - (back - 1) * 30 * day,
  }));
  const [insightValues, previousValues, dailySeriesValues, weekValues, ninetyValues] =
    await Promise.all([
      // Account-level insights beyond the core trio: reach, shares, saves and
      // profile visits power the professional-dashboard cards. Requested
      // per-metric so one unavailable metric can't sink the others.
      requestWindowTotals(
        ['views', 'likes', 'comments', 'reach', 'shares', 'saves', 'profile_views'],
        now - 30 * day,
        now,
        true,
      ),
      requestWindowTotals(['views', 'likes', 'comments'], now - 60 * day, now - 30 * day, true),
      Promise.all(
        (['views', 'likes', 'comments'] as const).map(async (metric) => {
          const chunks: unknown[] = [];
          await Promise.all(
            dailyWindows.map(async ({ start, end }) => {
              const insightUrl = instagramGraphUrl(`${instagramUserId}/insights`);
              insightUrl.searchParams.set('metric', metric);
              insightUrl.searchParams.set('period', 'day');
              insightUrl.searchParams.set('since', String(start));
              insightUrl.searchParams.set('until', String(end));
              try {
                chunks.push(await instagramApiGet(insightUrl, accessToken, true));
              } catch {
                // Lenient: skip this chunk and keep the rest of the history.
              }
            }),
          );
          return chunks;
        }),
      ),
      requestWindowTotals(['views', 'likes', 'comments'], now - 7 * day, now, true),
      requestWindowTotals(['views', 'likes', 'comments'], now - 90 * day, now, true),
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

  const seriesByMetric = (['views', 'likes', 'comments'] as const).map(
    (metric, metricIndex): Array<{ date: string; value: number }> | null => {
      const merged = new Map<string, number>();
      for (const chunk of dailySeriesValues[metricIndex] ?? []) {
        for (const point of parseInstagramInsightSeries(chunk, metric) ?? []) {
          // Adjacent chunks can repeat a boundary day; the newest value wins.
          merged.set(point.date, point.value);
        }
      }
      return merged.size > 0
        ? [...merged.entries()].map(([date, value]) => ({ date, value }))
        : null;
    },
  );
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

  // Window totals prefer the API's own sums; when Meta rejects a wide
  // since/until window (the 90-day request often fails this way), sum the
  // chunked day-series instead so the 90-day and 1-year filters stay live.
  const sumSeriesWindow = (
    points: Array<{ date: string; value: number }> | null,
    days: number,
  ): number | null => {
    if (!points) {
      return null;
    }
    const cutoff = new Date((now - (days - 1) * day) * 1000).toISOString().slice(0, 10);
    const values = points.filter((point) => point.date >= cutoff);
    if (values.length === 0) {
      return null;
    }
    return values.reduce((total, point) => total + point.value, 0);
  };

  return {
    profile: { ...profile, followersCount, mediaCount },
    stats: {
      views: parseInstagramInsightValue(insightValues[0], 'views'),
      likes: parseInstagramInsightValue(insightValues[1], 'likes'),
      comments: parseInstagramInsightValue(insightValues[2], 'comments'),
      reach: parseInstagramInsightValue(insightValues[3], 'reach'),
      // Professional-dashboard insights; null when Meta doesn't share them
      // (small or recently-converted accounts often don't).
      shares: parseInstagramInsightValue(insightValues[4], 'shares'),
      saves: parseInstagramInsightValue(insightValues[5], 'saves'),
      profileViews: parseInstagramInsightValue(insightValues[6], 'profile_views'),
      // Real window totals for the period filters; null values mean Meta
      // didn't share that metric for the window and the day-series had no
      // fallback to sum either.
      week: {
        views: parseInstagramInsightValue(weekValues[0], 'views')
          ?? sumSeriesWindow(seriesByMetric[0], 7),
        likes: parseInstagramInsightValue(weekValues[1], 'likes')
          ?? sumSeriesWindow(seriesByMetric[1], 7),
        comments: parseInstagramInsightValue(weekValues[2], 'comments')
          ?? sumSeriesWindow(seriesByMetric[2], 7),
      },
      ninety: {
        views: parseInstagramInsightValue(ninetyValues[0], 'views')
          ?? sumSeriesWindow(seriesByMetric[0], 90),
        likes: parseInstagramInsightValue(ninetyValues[1], 'likes')
          ?? sumSeriesWindow(seriesByMetric[1], 90),
        comments: parseInstagramInsightValue(ninetyValues[2], 'comments')
          ?? sumSeriesWindow(seriesByMetric[2], 90),
      },
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
  // Unified Login exchanges the code on graph.facebook.com with a plain GET
  // (api.instagram.com is retired for newer apps).
  const url = new URL('https://graph.facebook.com/v27.0/oauth/access_token');
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('client_id', config.instagramAppId);
  url.searchParams.set('client_secret', config.instagramAppSecret);
  url.searchParams.set('redirect_uri', config.instagramRedirectUri);
  url.searchParams.set('code', code);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
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
  // The system-user token response carries no permissions list (the config_id
  // fixed the grant); assertRequiredPermissions treats that as expected and
  // still enforces a list when Meta does return one.
  return { accessToken, permissions: data?.permissions };
}

async function graphNodeGet(url: URL): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }
  return readResponse(response);
}

async function fetchInstagramProfile(
  accessToken: string,
): Promise<InstagramProfile> {
  // Unified Login hands out a system-user token: `me` is not the Instagram
  // account, so Meta publishes the assigned professional accounts on this
  // edge. Multiple assigned accounts connect the first (a picker is a later
  // step).
  const assignedUrl = instagramGraphUrl('me/assigned_instagram_accounts');
  assignedUrl.searchParams.set('fields', 'id,username');
  assignedUrl.searchParams.set('access_token', accessToken);
  let assignedResponse: Response;
  try {
    assignedResponse = await fetch(assignedUrl, {
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }
  let assignedBody: unknown;
  try {
    assignedBody = await assignedResponse.json();
  } catch {
    throw new InstagramFlowError('instagram_api_error');
  }
  const assigned = assignedResponse.ok ? firstRecord(assignedBody) : null;
  const accountId = requiredString(assigned?.id);
  const accountUsername = requiredString(assigned?.username);
  if (!accountId || !accountUsername) {
    if (!assignedResponse.ok) {
      throw new InstagramFlowError('instagram_api_error');
    }
    // Meta accepted the request but found no rows: this login has no
    // professional Instagram attached (a personal account cannot be
    // assigned to the configuration).
    throw new InstagramFlowError(
      'unsupported_account',
      'no professional Instagram is attached to this login',
    );
  }

  const nodeUrl = instagramGraphUrl(accountId);
  nodeUrl.searchParams.set(
    'fields',
    'id,username,account_type,profile_picture_url',
  );
  nodeUrl.searchParams.set('access_token', accessToken);
  let node: Record<string, unknown>;
  try {
    node = await graphNodeGet(nodeUrl);
  } catch (error) {
    // `account_type` is documented only for graph.instagram.com; if Meta
    // rejects it on this host (error 100), retry without the field — the
    // normalizer then falls back to the honest 'Professional' label.
    if (
      !(error instanceof InstagramFlowError &&
        error.code === 'instagram_api_error')
    ) {
      throw error;
    }
    nodeUrl.searchParams.set('fields', 'id,username,profile_picture_url');
    node = await graphNodeGet(nodeUrl);
  }
  return normalizeInstagramProfile(
    withNormalizerUserId({
      ...node,
      id: typeof node.id === 'string' && node.id ? node.id : accountId,
      username:
        typeof node.username === 'string' && node.username
          ? node.username
          : accountUsername,
    }),
  );
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
  const exchanged = await exchangeAuthorizationCode(code, config);
  const grantedPermissions = assertRequiredPermissions(exchanged.permissions);
  const profile = await fetchInstagramProfile(exchanged.accessToken);

  return {
    profile,
    encryptedToken: await encryptAccessToken(
      exchanged.accessToken,
      config.tokenEncryptionKey,
    ),
    // Unified Login's system-user token never expires (Meta stores "Never"),
    // so the far-future sentinel stands in for a real expiry — the session
    // RPCs already clamp it to 30 days.
    tokenExpiresAt: new Date(NON_EXPIRING_TOKEN_EXPIRES_AT),
    grantedPermissions,
  };
}
