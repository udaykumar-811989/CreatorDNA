import {
  buildInstagramAuthorizationUrl,
  completeInstagramConnection,
  createOpaqueToken,
  decryptAccessToken,
  fetchInstagramDashboard,
  InstagramApiError,
  InstagramFlowError,
} from '../_shared/instagram.ts';

const requiredScopes = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
];

type ProfileRecord = {
  username: string;
  accountType: 'Business' | 'Media_Creator';
  profilePictureUrl: string | null;
};

type DashboardConnectionRecord = {
  instagramUserId: string;
  encryptedAccessToken: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenExpiresAt: string;
};

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required Supabase function secret: ${name}`);
  }
  return value;
}

function decodeKey(value: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0)
    );
  } catch {
    throw new Error('TOKEN_ENCRYPTION_KEY must be valid base64.');
  }
  if (decoded.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  }
  return decoded;
}

function getConfig() {
  const appId = required('INSTAGRAM_APP_ID');
  if (!/^\d+$/.test(appId)) {
    throw new Error('INSTAGRAM_APP_ID must contain only digits.');
  }

  const redirectUri = required('INSTAGRAM_REDIRECT_URI');
  const redirectUrl = new URL(redirectUri);
  if (
    redirectUrl.pathname !==
      '/functions/v1/instagram-oauth/callback' ||
    redirectUrl.search ||
    redirectUrl.hash ||
    (redirectUrl.protocol !== 'https:' &&
      redirectUrl.hostname !== 'localhost')
  ) {
    throw new Error(
      'INSTAGRAM_REDIRECT_URI must be HTTPS and end with /functions/v1/instagram-oauth/callback.',
    );
  }

  const appWebOriginValue = required('APP_WEB_ORIGIN');
  const appWebUrl = new URL(appWebOriginValue);
  if (
    (appWebUrl.protocol !== 'https:' &&
      appWebUrl.hostname !== 'localhost') ||
    appWebUrl.origin !== appWebOriginValue.replace(/\/$/, '')
  ) {
    throw new Error(
      'APP_WEB_ORIGIN must be an HTTPS origin, or localhost in development, without a path.',
    );
  }
  const appWebOrigin = appWebUrl.origin;
  const nativeRedirectUri = required('APP_NATIVE_REDIRECT_URI');
  if (nativeRedirectUri !== 'creatordna://instagram/callback') {
    throw new Error(
      'APP_NATIVE_REDIRECT_URI must be creatordna://instagram/callback.',
    );
  }

  const supabaseUrl = required('SUPABASE_URL').replace(/\/+$/, '');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');

  return {
    appId,
    appSecret: required('INSTAGRAM_APP_SECRET'),
    redirectUri,
    tokenEncryptionKey: decodeKey(required('TOKEN_ENCRYPTION_KEY')),
    appWebOrigin,
    nativeRedirectUri,
    allowExpoGoRedirects: Deno.env.get('ALLOW_EXPO_GO_REDIRECTS') === 'true',
    supabaseUrl,
    serviceRoleKey,
  };
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 127 && octets[1] === 0 && octets[2] === 0 && octets[3] === 1)
  );
}

function isAllowedReturnUri(
  value: unknown,
  platform: unknown,
  config: ReturnType<typeof getConfig>,
): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (platform === 'web') {
    try {
      const uri = new URL(value);
      return (
        uri.origin === config.appWebOrigin &&
        uri.pathname === '/instagram-connected' &&
        !uri.search &&
        !uri.hash &&
        !uri.username &&
        !uri.password
      );
    } catch {
      return false;
    }
  }
  if (platform !== 'native') {
    return false;
  }
  if (value === config.nativeRedirectUri) {
    return true;
  }
  if (!config.allowExpoGoRedirects) {
    return false;
  }
  try {
    const uri = new URL(value);
    const isExpoHost =
      uri.hostname === 'exp.host' ||
      uri.hostname.endsWith('.exp.host') ||
      uri.hostname === 'expo.dev' ||
      uri.hostname.endsWith('.expo.dev') ||
      uri.hostname === 'exp.direct' ||
      uri.hostname.endsWith('.exp.direct');
    return (
      uri.protocol === 'exp:' &&
      uri.pathname === '/--/instagram/callback' &&
      (isPrivateIpv4(uri.hostname) || isExpoHost) &&
      !uri.search &&
      !uri.hash &&
      !uri.username &&
      !uri.password
    );
  } catch {
    return false;
  }
}

function baseHeaders(origin: string | null, appWebOrigin: string) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  if (origin === appWebOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'apikey, authorization, content-type, x-client-info',
  );
  headers.set('Access-Control-Max-Age', '600');
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Headers,
): Response {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

async function supabaseRpc<T>(
  config: ReturnType<typeof getConfig>,
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error('Supabase database request failed.');
  }
  const result = await response.text();
  return result ? JSON.parse(result) as T : null as T;
}

function clientAddress(request: Request): string {
  return request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
}

async function handleStart(
  request: Request,
  config: ReturnType<typeof getConfig>,
  headers: Headers,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return jsonResponse({ error: 'invalid_request' }, 400, headers);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400, headers);
  }

  const returnUri = body.returnUri;
  const platform = body.platform;
  if (!isAllowedReturnUri(returnUri, platform, config)) {
    return jsonResponse({ error: 'invalid_return_uri' }, 400, headers);
  }

  const state = createOpaqueToken();
  const allowed = await supabaseRpc<boolean>(
    config,
    'begin_instagram_oauth',
    {
      p_state_hash: await sha256(state),
      p_return_uri: returnUri,
      p_client_hash: await sha256(clientAddress(request)),
    },
  );
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, headers);
  }

  return jsonResponse(
    {
      authorizationUrl: buildInstagramAuthorizationUrl(
        config.appId,
        config.redirectUri,
        state,
      ),
      state,
      permissions: requiredScopes,
    },
    200,
    headers,
  );
}

async function handleCallback(
  request: Request,
  config: ReturnType<typeof getConfig>,
  headers: Headers,
): Promise<Response> {
  const callbackUrl = new URL(request.url);
  const state = callbackUrl.searchParams.get('state');
  if (!state) {
    return new Response('Invalid or expired Instagram login.', {
      status: 400,
      headers,
    });
  }

  const storedState = await supabaseRpc<{ return_uri: string } | null>(
    config,
    'consume_instagram_oauth_state',
    { p_state_hash: await sha256(state) },
  );
  if (!storedState?.return_uri) {
    return new Response('Invalid or expired Instagram login.', {
      status: 400,
      headers,
    });
  }

  const redirectToApp = (
    status: 'connected' | 'failed',
    receipt?: string,
    errorCode?: string,
    errorDetail?: string,
  ) => {
    const destination = new URL(storedState.return_uri);
    destination.searchParams.set('instagram_status', status);
    destination.searchParams.set('instagram_state', state);
    if (receipt) {
      destination.searchParams.set('instagram_receipt', receipt);
    }
    if (errorCode) {
      destination.searchParams.set('instagram_error', errorCode);
    }
    if (errorDetail) {
      destination.searchParams.set('instagram_error_detail', errorDetail);
    }
    headers.set('Location', destination.toString());
    return new Response(null, { status: 303, headers });
  };

  if (
    callbackUrl.searchParams.has('error') ||
    callbackUrl.searchParams.has('error_reason')
  ) {
    const error = callbackUrl.searchParams.get('error');
    const reason = callbackUrl.searchParams.get('error_reason');
    const errorCode =
      error === 'access_denied' ||
        reason === 'user_denied' ||
        reason === 'access_denied'
        ? 'login_cancelled'
        : 'oauth_rejected';
    console.info(`Instagram OAuth provider returned ${errorCode}.`);
    return redirectToApp('failed', undefined, errorCode);
  }

  const code = callbackUrl.searchParams.get('code');
  if (!code) {
    console.error('Instagram OAuth callback did not include an authorization code.');
    return redirectToApp('failed', undefined, 'invalid_authorization_code');
  }

  try {
    const connection = await completeInstagramConnection(code, {
      instagramAppId: config.appId,
      instagramAppSecret: config.appSecret,
      instagramRedirectUri: config.redirectUri,
      tokenEncryptionKey: config.tokenEncryptionKey,
    });
    const receipt = createOpaqueToken();
    await supabaseRpc<null>(config, 'save_instagram_connection', {
      p_instagram_user_id: connection.profile.instagramUserId,
      p_username: connection.profile.username,
      p_account_type: connection.profile.accountType,
      p_profile_picture_url: connection.profile.profilePictureUrl,
      p_encrypted_access_token: connection.encryptedToken.ciphertext,
      p_token_iv: connection.encryptedToken.iv,
      p_token_auth_tag: connection.encryptedToken.authTag,
      p_token_expires_at: connection.tokenExpiresAt.toISOString(),
      p_granted_permissions: connection.grantedPermissions,
      p_receipt_hash: await sha256(receipt),
    });
    return redirectToApp('connected', receipt);
  } catch (error) {
    const code = error instanceof InstagramFlowError
      ? error.code
      : 'instagram_api_error';
    const detail = error instanceof InstagramFlowError
      ? error.detail
      : undefined;
    console.error(
      `Instagram OAuth callback failed: ${code}${detail ? ` detail=${detail}` : ''}`,
    );
    return redirectToApp('failed', undefined, code, detail);
  }
}

async function handleReceipt(
  request: Request,
  config: ReturnType<typeof getConfig>,
  headers: Headers,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return jsonResponse({ error: 'invalid_receipt' }, 400, headers);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'invalid_receipt' }, 400, headers);
  }

  const receipt = body.receipt;
  if (
    typeof receipt !== 'string' ||
    receipt.length < 32 ||
    receipt.length > 128
  ) {
    return jsonResponse({ error: 'invalid_receipt' }, 400, headers);
  }

  const sessionToken = createOpaqueToken();
  const profile = await supabaseRpc<ProfileRecord | null>(
    config,
    'consume_instagram_connection_receipt',
    {
      p_receipt_hash: await sha256(receipt),
      p_session_hash: await sha256(sessionToken),
    },
  );
  if (!profile) {
    return jsonResponse({ error: 'receipt_expired_or_used' }, 410, headers);
  }
  return jsonResponse({ ...profile, sessionToken }, 200, headers);
}

async function handleDashboard(
  request: Request,
  config: ReturnType<typeof getConfig>,
  headers: Headers,
): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? '';
  const sessionToken = /^Bearer ([A-Za-z0-9_-]{40,128})$/.exec(authorization)?.[1];
  if (!sessionToken) {
    return jsonResponse({ error: 'reconnect_required' }, 401, headers);
  }

  const connection = await supabaseRpc<DashboardConnectionRecord | null>(
    config,
    'get_instagram_dashboard_connection',
    { p_session_hash: await sha256(sessionToken) },
  );
  if (!connection) {
    return jsonResponse({ error: 'reconnect_required' }, 401, headers);
  }

  try {
    const accessToken = await decryptAccessToken(
      {
        ciphertext: connection.encryptedAccessToken,
        iv: connection.tokenIv,
        authTag: connection.tokenAuthTag,
      },
      config.tokenEncryptionKey,
    );
    const dashboard = await fetchInstagramDashboard(
      connection.instagramUserId,
      accessToken,
    );
    return jsonResponse(dashboard, 200, headers);
  } catch (error) {
    if (error instanceof InstagramApiError) {
      const status = error.code === 'reconnect_required' ? 401 : 502;
      console.error(`Instagram dashboard request failed: ${error.code}.`);
      return jsonResponse({ error: error.code }, status, headers);
    }
    console.error('Instagram dashboard request failed.');
    return jsonResponse({ error: 'instagram_api_error' }, 502, headers);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Supabase function configuration failed.',
    );
    return new Response('Instagram connection is not configured.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const origin = request.headers.get('origin');
  const headers = baseHeaders(origin, config.appWebOrigin);
  const path = new URL(request.url).pathname;
  const isCallback = path.endsWith('/callback');
  if (origin && origin !== config.appWebOrigin && !isCallback) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (path.endsWith('/callback') && request.method === 'GET') {
      return await handleCallback(request, config, headers);
    }
    if (path.endsWith('/start') && request.method === 'POST') {
      return await handleStart(request, config, headers);
    }
    if (path.endsWith('/receipt') && request.method === 'POST') {
      return await handleReceipt(request, config, headers);
    }
    if (path.endsWith('/dashboard') && request.method === 'GET') {
      return await handleDashboard(request, config, headers);
    }
    return jsonResponse({ error: 'not_found' }, 404, headers);
  } catch {
    console.error('Instagram OAuth request failed.');
    return jsonResponse({ error: 'internal_server_error' }, 500, headers);
  }
});
