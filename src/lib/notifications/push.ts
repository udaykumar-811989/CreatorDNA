import type { CreatorNotification } from './model';

// The delivery seam.
//
// In-app notifications are the product: they work with no permission, no
// network and no service worker. This module owns everything *around* them —
// asking for browser permission (always after the creator has been told what
// it buys them, never on app open) and best-effort browser alerts while a
// CreatorDNA tab is in the background.
//
// Native push (expo-notifications / FCM) and email digests are deliberately
// not wired in: they need a new native dependency and a new build. Both plug in
// here later — they read the same `CreatorNotification`, so the notification
// model, the event engine, dedupe, preferences and the store do not change.

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export const PUSH_PROMPT = {
  title: 'Know when something matters',
  // First sentence is the product's own wording, verbatim.
  body:
    'Get notified when your content starts outperforming your usual results or when your next post is due. ' +
    'In-app notifications are already on — browser notifications only add an alert while CreatorDNA is in the background.',
  enable: 'Enable Notifications',
  dismiss: 'Not Now',
} as const;

function hasWebNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Notification !== 'undefined'
  );
}

export function getPushPermission(): PushPermission {
  if (!hasWebNotifications()) {
    return 'unsupported';
  }
  const value = Notification.permission;
  return value === 'granted' || value === 'denied' || value === 'default'
    ? value
    : 'default';
}

/**
 * Only ever called from a press on "Enable Notifications" — never at app
 * start, and never without the explanation that precedes it. A browser that
 * has already decided (`granted` / `denied`) answers immediately, so the
 * creator is never re-prompted by the OS.
 */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!hasWebNotifications()) {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return getPushPermission();
  }
  try {
    const result = await Notification.requestPermission();
    return result === 'granted' || result === 'denied' ? result : 'default';
  } catch {
    // Older WebView or a browser that refuses inline prompts: the in-app list
    // is unaffected and still fully functional.
    return getPushPermission();
  }
}

/**
 * A browser alert for a notification the creator opted into, shown only while
 * CreatorDNA is *not* the thing they are looking at — an alert for a screen
 * already in front of them would just be noise.
 *
 * Browsers that require a service worker (mobile Chrome) throw here; the
 * failure is swallowed because the in-app notification already exists.
 */
export function deliverInBackground(item: CreatorNotification, optedIn: boolean): boolean {
  if (!optedIn) return false;
  if (!hasWebNotifications()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    if (!document.hidden) return false;
    new Notification(item.title, {
      body: item.message || undefined,
      tag: item.dedupeKey,
    });
    return true;
  } catch {
    return false;
  }
}

/** Re-reads permission when the creator comes back to the tab (they may have
 *  changed it in browser settings). Returns an unsubscribe function. */
export function onPushPermissionChange(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }
  document.addEventListener('visibilitychange', listener);
  window.addEventListener('focus', listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
    window.removeEventListener('focus', listener);
  };
}
