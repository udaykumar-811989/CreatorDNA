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
  caption: string | null;
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
    // 30-day account-level insights (professional dashboard); null when the
    // metric isn't shared with the connected account.
    shares: number | null;
    saves: number | null;
    profileViews: number | null;
    // Real window totals for the period filters (7-day; 90-day backs the
    // 90-day and 1-year filters); values null when unavailable.
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

export class DashboardRequestError extends Error {
  constructor(readonly code: 'reconnect_required' | 'try_again') {
    super(code);
    this.name = 'DashboardRequestError';
  }
}

const sessionStorageKey = 'veyyra.instagram.connection-session';

// On the web the connection session lives in localStorage so refreshing the
// page (or reopening the tab) keeps the creator signed in. sessionStorage
// was tab-scoped, so any navigation that landed in a new tab silently
// dropped the session and looked like a logout. Explicit logout clears it.
function webSessionStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage;
    }
  } catch {
    // Storage access can throw under strict browser privacy settings.
  }
  return null;
}

export async function saveInstagramSession(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = webSessionStorage();
    if (!storage) {
      throw new Error('Browser storage is unavailable.');
    }
    storage.setItem(sessionStorageKey, token);
    return;
  }
  await SecureStore.setItemAsync(sessionStorageKey, token);
}

export async function loadInstagramSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Prefer the durable storage; fall back to any legacy session-scoped value.
    const storage = webSessionStorage();
    return storage?.getItem(sessionStorageKey)
      ?? (typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(sessionStorageKey)
        : null);
  }
  return SecureStore.getItemAsync(sessionStorageKey);
}

export async function clearInstagramSession(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(sessionStorageKey);
    }
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
      caption: typeof entry.caption === 'string' && entry.caption.trim().length > 0
        ? entry.caption
        : null,
    }];
  });

  const previous = isRecord(value.stats.previous)
    ? {
      views: optionalCount(value.stats.previous.views),
      likes: optionalCount(value.stats.previous.likes),
      comments: optionalCount(value.stats.previous.comments),
    }
    : null;
  const weekTotals = isRecord(value.stats.week) ? value.stats.week : null;
  const ninetyTotals = isRecord(value.stats.ninety) ? value.stats.ninety : null;
  const parsedDaily = Array.isArray(value.daily)
    ? value.daily.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.date !== 'string') {
        return [];
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return [];
      }
      return [{
        date: entry.date,
        views: optionalCount(entry.views),
        likes: optionalCount(entry.likes),
        comments: optionalCount(entry.comments),
      }];
    })
    : [];

  return {
    profile: {
      username: profile.username,
      accountType: profile.accountType,
      profilePictureUrl: safeUrl(profile.profilePictureUrl),
      followersCount: optionalCount(profile.followersCount),
      mediaCount: optionalCount(profile.mediaCount),
    },
    stats: {
      views: optionalCount(value.stats.views),
      likes: optionalCount(value.stats.likes),
      comments: optionalCount(value.stats.comments),
      followers: optionalCount(value.stats.followers),
      reach: optionalCount(value.stats.reach),
      shares: optionalCount(value.stats.shares),
      saves: optionalCount(value.stats.saves),
      profileViews: optionalCount(value.stats.profileViews),
      week: {
        views: optionalCount(weekTotals?.views),
        likes: optionalCount(weekTotals?.likes),
        comments: optionalCount(weekTotals?.comments),
      },
      ninety: {
        views: optionalCount(ninetyTotals?.views),
        likes: optionalCount(ninetyTotals?.likes),
        comments: optionalCount(ninetyTotals?.comments),
      },
      previous,
    },
    media,
    daily: parsedDaily.length > 0 ? parsedDaily : null,
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
