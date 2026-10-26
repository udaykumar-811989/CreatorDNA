import * as MediaLibrary from 'expo-media-library';
// The root export of `expo-media-library` re-exports `saveToLibraryAsync` only
// as a shim that throws (it exists to print the migration hint), so the
// function that actually writes into the gallery lives behind /legacy.
import { saveToLibraryAsync } from 'expo-media-library/legacy';
import { File, Paths } from 'expo-file-system';
// Fallback downloader: the new file API and the legacy one fail for different
// reasons, so a second engine is worth having when the first one throws.
import { downloadAsync } from 'expo-file-system/legacy';

/**
 * `mediaGallery.web.ts` is the twin of this file and the only variant the web
 * build ever resolves, because these modules do not exist in a browser: they
 * call `requireNativeModule` at import time, so loading them there crashes the
 * whole bundle before React can mount. Keeping every gallery concern behind
 * that one split is what stops a native import from taking the site down.
 *
 * Two outcomes are returned rather than thrown — `saved`, and `denied`, which
 * is the OS refusing photo access and deserves the quiet "Settings" line
 * rather than an error. Everything unexpected throws instead, so the card
 * keeps its friendly wording and carries the real reason underneath it.
 */
export type SaveOutcome = { status: 'saved' | 'denied' };

// Extensions worth keeping when the downloaded file is named locally: the
// media library infers the asset type from them, and anything else (signed
// URLs, path-less CDN routes) falls back to the kind being rendered.
const SAVE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov', 'webm'];

function saveFileName(url: string, kind: 'image' | 'video'): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const tail = path.split('/').pop() ?? '';
  const extension = tail.includes('.') ? (tail.split('.').pop() ?? '').toLowerCase() : '';
  const safe = SAVE_EXTENSIONS.includes(extension) ? extension : kind === 'image' ? 'jpg' : 'mp4';
  // A fresh name per tap: the download API rejects a destination that already
  // exists, and two saves of the same asset should not fight over one file.
  return `creatordna-${Date.now()}.${safe}`;
}

/**
 * Ask for photo access once per permission flavour. Returns the current state
 * untouched when the OS says it will not prompt again, so the caller can fall
 * through to the Settings wording instead of looping on a dead prompt.
 */
async function askMediaPermission(writeOnly: boolean) {
  const current = await MediaLibrary.getPermissionsAsync(writeOnly);
  if (current.granted || !current.canAskAgain) {
    return current;
  }
  return MediaLibrary.requestPermissionsAsync(writeOnly);
}

/**
 * Pull a finished asset out of the CDN into the app cache and hand that local
 * uri to the gallery. Native only — the browser path lives in ChatMedia, which
 * returns before ever calling in here.
 */
export async function saveMediaToGallery(
  url: string,
  kind: 'image' | 'video',
): Promise<SaveOutcome> {
  // Look before asking: once the user has denied, the OS stops showing the
  // prompt, so re-requesting would only bounce back here as a denial. Full
  // photo access is asked for first, but Android 13+ can also grant
  // write-only ("selected photos") access, and that is all saving a brand
  // new file needs — so it is worth a second attempt before giving up.
  let permission = await askMediaPermission(false);
  if (!permission.granted) {
    permission = await askMediaPermission(true);
  }
  if (!permission.granted) {
    return { status: 'denied' };
  }

  const destination = new File(Paths.cache, saveFileName(url, kind));
  let localUri: string;
  try {
    localUri = (await File.downloadFileAsync(url, destination)).uri;
  } catch (primaryError) {
    console.warn('[mediaGallery] primary download failed, trying legacy', primaryError);
    const legacy = await downloadAsync(url, destination.uri);
    if (legacy.status && (legacy.status < 200 || legacy.status >= 300)) {
      throw new Error(`the download was refused (HTTP ${legacy.status})`);
    }
    localUri = legacy.uri;
  }

  try {
    await saveToLibraryAsync(localUri);
  } finally {
    // The gallery keeps its own copy now; the cache file was only a stepping
    // stone, and repeated saves would otherwise pile up in it.
    try {
      const local = new File(localUri);
      if (local.exists) {
        local.delete();
      }
    } catch {
      // The OS reclaims the cache on its own — never fail a saved file here.
    }
  }
  return { status: 'saved' };
}
