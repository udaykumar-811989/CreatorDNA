import { Platform } from 'react-native';
import { File, UploadType } from 'expo-file-system';

import { supabaseAnonKey, supabaseUrl } from '../lib/config';
import { currentUserIdFromToken } from '../lib/community/model';

// Editing the Supabase login itself: display name, profile photo, email.
// Every request rides the creator's own session token — no service-role key
// ever reaches the app — and the app never asks for a password here: a
// password change arrives by Supabase's recovery email (requestPasswordReset),
// so no password is ever typed into, stored by, or shown in this app.

const TIMEOUT_MS = 15_000;

// The shared public-image bucket: writes only inside the caller's own folder
// (enforced by the storage policy from the community-photos migration),
// readable by anyone with the URL — exactly what an avatar needs. Objects
// cannot be replaced in place, so each saved photo is a new object and the
// superseded one is deleted best-effort afterwards.
const AVATAR_BUCKET = 'community-posts';

export type ProfilePhotoInput = { uri: string; mime: string };

export type ProfileSaveInput = {
  /** Desired display name; null clears it so Profile labels the field. */
  name: string | null;
  /** Desired email address, already validated by the screen. */
  email: string;
  /** The address on the account right now, for "did it change?" detection. */
  currentEmail: string | null;
  /** A newly picked photo; null = keep the stored photo. */
  photo: ProfilePhotoInput | null;
  /** Drop the stored photo (ignored when `photo` is set). */
  removePhoto: boolean;
  /** The photo URL currently on the account (from Profile's own state). */
  currentAvatarUrl: string | null;
};

export type ProfileSaveResult =
  | {
      ok: true;
      name: string | null;
      /** The email to show now — the old one until a pending change confirms. */
      email: string;
      avatarUrl: string | null;
      /** True when Supabase wants the new address confirmed by email first. */
      emailPending: boolean;
    }
  | { ok: false; error: string };

export type PasswordResetResult = { ok: boolean; error: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function authHeaders(token: string, contentType?: string): Record<string, string> {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

/** Human messages for a failed storage write, mirroring the community upload. */
function uploadFailure(status: number): string {
  if (status === 401 || status === 403) {
    return 'Your session has expired. Sign in again to change your photo.';
  }
  if (status === 413) return 'That photo is over the 8 MB limit. Pick a smaller one.';
  if (status === 415) return 'Use a JPEG, PNG or WebP photo.';
  if (status === 409) return 'That photo could not be saved. Please retry.';
  return 'That photo could not be uploaded. Please retry.';
}

type AvatarUpload =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

async function uploadAvatar(token: string, photo: ProfilePhotoInput): Promise<AvatarUpload> {
  const userId = currentUserIdFromToken(token);
  if (!userId) {
    return { ok: false, error: 'Your session has expired. Sign in again to change your photo.' };
  }
  const mime =
    photo.mime === 'image/png' || photo.mime === 'image/webp' ? photo.mime : 'image/jpeg';
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const endpoint = `${supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}/${path}`;
  const headers = { ...authHeaders(token, mime), 'x-upsert': 'false' };

  let status: number;
  try {
    if (Platform.OS === 'web') {
      // The picker hands back a blob URL on the web build, so the bytes are
      // read straight from it rather than through the file-system module.
      const blob = await (await fetch(photo.uri)).blob();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: blob,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
    } else {
      const file = new File(photo.uri);
      const result = await file.upload(endpoint, {
        uploadType: UploadType.BINARY_CONTENT,
        headers,
      });
      status = result.status;
    }
  } catch {
    return {
      ok: false,
      error: 'Could not reach storage to upload your photo. Check your connection and retry.',
    };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: uploadFailure(status) };
  }
  return {
    ok: true,
    path,
    url: `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`,
  };
}

/**
 * Best-effort removal of an avatar object this app uploaded. URLs that are not
 * this bucket's (Google's own picture, for example) are never touched, and any
 * failure is ignored — a leftover file costs nothing visible.
 */
async function deleteStoredAvatar(token: string, avatarUrl: string): Promise<void> {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const at = avatarUrl.indexOf(marker);
  if (at === -1) return;
  const path = avatarUrl.slice(at + marker.length);
  if (!path || path.includes('?') || path.includes('#')) return;
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: authHeaders(token),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Best-effort by design.
  }
}

/**
 * Saves the account's name, photo and email in one pass.
 *
 * Order matters: the server record is read first (user_metadata is replaced
 * wholesale, so every key this app doesn't touch must be carried over), the
 * photo is uploaded before the write so its URL rides along, and an email
 * change is only reported as applied when Supabase actually returned the new
 * address — a "secure email change" project instead wants a confirmation link,
 * and nothing local may re-key until that link has been clicked.
 */
export async function saveAccountProfile(
  token: string,
  input: ProfileSaveInput,
): Promise<ProfileSaveResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Account editing is not configured in this app.' };
  }

  let meResponse: Response;
  try {
    meResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'Could not reach your account. Check your connection and retry.' };
  }
  if (meResponse.status === 401 || meResponse.status === 403) {
    return {
      ok: false,
      error: 'Your session has expired. Sign out and sign in again to edit your profile.',
    };
  }
  if (!meResponse.ok) {
    return { ok: false, error: 'Your account could not be loaded right now. Please retry.' };
  }
  const me = await meResponse.json().catch(() => null);
  if (!isRecord(me)) {
    return { ok: false, error: 'Your account returned an unreadable response. Please retry.' };
  }
  const currentMeta = isRecord(me.user_metadata) ? me.user_metadata : {};
  const serverEmail = typeof me.email === 'string' && me.email ? me.email : input.currentEmail;
  const currentAvatar =
    typeof currentMeta.avatar_url === 'string' && currentMeta.avatar_url
      ? currentMeta.avatar_url
      : input.currentAvatarUrl;

  // Photo first, so the new URL is part of the same metadata write below.
  let avatarUrl = currentAvatar;
  let uploaded: { url: string } | null = null;
  if (input.photo) {
    const result = await uploadAvatar(token, input.photo);
    if (!result.ok) return { ok: false, error: result.error };
    avatarUrl = result.url;
    uploaded = result;
  } else if (input.removePhoto) {
    avatarUrl = null;
  }

  const name = input.name?.trim() || null;
  const meta: Record<string, unknown> = { ...currentMeta };
  if (name) {
    // Profile accepts either key (Google writes `full_name`, sign-up writes
    // `name`), so both are kept equal and a cleared name removes both.
    meta.name = name;
    meta.full_name = name;
  } else {
    delete meta.name;
    delete meta.full_name;
  }
  if (avatarUrl) meta.avatar_url = avatarUrl;
  else delete meta.avatar_url;

  const desiredEmail = input.email.trim().toLowerCase();
  const emailChanged = Boolean(
    serverEmail && desiredEmail && desiredEmail !== serverEmail.toLowerCase(),
  );
  const body: Record<string, unknown> = { data: meta };
  if (emailChanged) body.email = desiredEmail;

  const rollbackUpload = async (): Promise<void> => {
    if (uploaded) await deleteStoredAvatar(token, uploaded.url);
  };

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: authHeaders(token, 'application/json'),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    await rollbackUpload();
    return { ok: false, error: 'Could not reach your account. Check your connection and retry.' };
  }
  if (response.status === 401 || response.status === 403) {
    await rollbackUpload();
    return {
      ok: false,
      error: 'Your session has expired. Sign out and sign in again to edit your profile.',
    };
  }
  if (!response.ok) {
    await rollbackUpload();
    if (response.status === 422) {
      return { ok: false, error: 'Check the details you entered, then try saving again.' };
    }
    return { ok: false, error: 'Your changes could not be saved. Please retry.' };
  }
  const updated = await response.json().catch(() => null);

  // Email: applied now, or awaiting the confirmation link ("secure email
  // change"). Only the applied case may present the new address — a pending
  // change keeps showing the current one until the link has been clicked;
  // the next user-record fetch then reconciles the rest.
  let effectiveEmail = serverEmail ?? desiredEmail;
  let emailPending = false;
  if (emailChanged) {
    const returned =
      isRecord(updated) && typeof updated.email === 'string'
        ? updated.email.trim().toLowerCase()
        : null;
    if (returned === desiredEmail) effectiveEmail = returned;
    else emailPending = true;
  }

  // The replaced (or removed) photo is no longer referenced: drop it ours-only.
  if (input.photo && currentAvatar && currentAvatar !== avatarUrl) {
    await deleteStoredAvatar(token, currentAvatar);
  } else if (!input.photo && input.removePhoto && currentAvatar) {
    await deleteStoredAvatar(token, currentAvatar);
  }

  return { ok: true, name, email: effectiveEmail || input.currentEmail || '', avatarUrl, emailPending };
}

/**
 * Sends Supabase's password-recovery email to the address that signed in
 * here. The app never handles the password itself — the creator taps the
 * link in the email and chooses it on Supabase's own page. Unknown addresses
 * get the same honest error the form would show; nothing else about the
 * account is revealed.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Password reset is not configured in this app.' };
  }
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      error: 'Could not reach password reset. Check your connection and retry.',
    };
  }
  if (response.ok) return { ok: true, error: null };

  const body = await response.json().catch(() => null);
  const code = isRecord(body) && typeof body.code === 'string' ? body.code : '';
  const detail = !isRecord(body)
    ? ''
    : typeof body.error_description === 'string'
      ? body.error_description
      : typeof body.msg === 'string'
        ? body.msg
        : '';
  if (code === 'user_not_found' || /not found/i.test(detail)) {
    return {
      ok: false,
      error: 'No account uses that email address. Check the spelling, or sign up instead.',
    };
  }
  if (code === 'email_not_confirmed' || /not confirmed/i.test(detail)) {
    return {
      ok: false,
      error: 'Confirm your email address first, then ask for the reset link again.',
    };
  }
  if (response.status === 422 || /valid|invalid/i.test(detail)) {
    return { ok: false, error: 'That email address isn’t valid.' };
  }
  return { ok: false, error: 'Couldn’t send the reset link right now. Please retry.' };
}
