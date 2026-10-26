/**
 * The browser twin of `mediaGallery.ts`, and the only variant a web build ever
 * resolves. The native module does not exist there — `expo-media-library` and
 * `expo-file-system` call `requireNativeModule` while they are imported, so
 * bundling them into the site made it die on a white screen before React ever
 * mounted. Metro picks this file first on the web platform, which keeps those
 * imports out of the browser bundle entirely.
 *
 * ChatMedia runs its own download in the browser and returns before calling
 * here, so this exists purely so the import resolves; if it is ever reached
 * anyway, the throw lands in that card's catch and shows an honest reason
 * instead of failing silently.
 */
export type SaveOutcome = { status: 'saved' | 'denied' };

export async function saveMediaToGallery(): Promise<SaveOutcome> {
  throw new Error('Saving into the photo gallery only works in the app.');
}
