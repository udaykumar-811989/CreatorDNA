import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type InstagramProfile = {
  username: string;
  accountType: 'Business' | 'Media_Creator';
  profilePictureUrl: string | null;
};

export type InstagramMedia = {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likes: number | null;
  comments: number | null;
};

export type InstagramDashboard = {
  profile: InstagramProfile & { followersCount: number | null };
  stats: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    followers: number | null;
  };
  media: InstagramMedia[];
};

export class DashboardRequestError extends Error {
  constructor(readonly code: 'reconnect_required' | 'try_again') {
    super(code);
    this.name = 'DashboardRequestError';
  }
}

const sessionStorageKey = 'veyyra.instagram.connection-session';

export async function saveInstagramSession(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage === 'undefined') {
      throw new Error('Browser session storage is unavailable.');
    }
    sessionStorage.setItem(sessionStorageKey, token);
    return;
  }
  await SecureStore.setItemAsync(sessionStorageKey, token);
}

export async function loadInstagramSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(sessionStorageKey);
  }
  return SecureStore.getItemAsync(sessionStorageKey);
}

export async function clearInstagramSession(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(sessionStorageKey);
    }
    return;
  }
  await SecureStore.deleteItemAsync(sessionStorageKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalCount(value: unknown): number | null {
  return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0
    ? value
    : null;
}

function safeUrl(value: unknown): string | null {
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

function parseDashboard(value: unknown): InstagramDashboard {
  if (!isRecord(value) || !isRecord(value.profile) || !isRecord(value.stats)) {
    throw new DashboardRequestError('try_again');
  }
  const profile = value.profile;
  if (
    typeof profile.username !== 'string' ||
    (profile.accountType !== 'Business' &&
      profile.accountType !== 'Media_Creator') ||
    !Array.isArray(value.media)
  ) {
    throw new DashboardRequestError('try_again');
  }

  const media = value.media.flatMap((entry): InstagramMedia[] => {
    if (!isRecord(entry)) {
      return [];
    }
    if (
      typeof entry.id !== 'string' ||
      (entry.mediaType !== 'IMAGE' &&
        entry.mediaType !== 'VIDEO' &&
        entry.mediaType !== 'CAROUSEL_ALBUM')
    ) {
      return [];
    }
    return [{
      id: entry.id,
      mediaType: entry.mediaType,
      thumbnailUrl: safeUrl(entry.thumbnailUrl),
      permalink: safeUrl(entry.permalink),
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      likes: optionalCount(entry.likes),
      comments: optionalCount(entry.comments),
    }];
  });

  return {
    profile: {
      username: profile.username,
      accountType: profile.accountType,
      profilePictureUrl: safeUrl(profile.profilePictureUrl),
      followersCount: optionalCount(profile.followersCount),
    },
    stats: {
      views: optionalCount(value.stats.views),
      likes: optionalCount(value.stats.likes),
      comments: optionalCount(value.stats.comments),
      followers: optionalCount(value.stats.followers),
    },
    media,
  };
}

export async function fetchInstagramDashboard(
  functionUrl: string,
  anonKey: string,
  sessionToken: string,
): Promise<InstagramDashboard> {
  let response: Response;
  try {
    response = await fetch(`${functionUrl}/dashboard`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${sessionToken}`,
      },
    });
  } catch {
    throw new DashboardRequestError('try_again');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardRequestError('try_again');
  }
  if (!response.ok) {
    const code = isRecord(body) ? body.error : null;
    throw new DashboardRequestError(
      code === 'reconnect_required' || response.status === 401
        ? 'reconnect_required'
        : 'try_again',
    );
  }
  return parseDashboard(body);
}
