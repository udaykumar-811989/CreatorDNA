import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
// The root export of `expo-media-library` re-exports `saveToLibraryAsync` only
// as a shim that throws (it exists to print the migration hint), so the
// function that actually writes into the gallery lives behind /legacy.
import { saveToLibraryAsync } from 'expo-media-library/legacy';
import { File, Paths } from 'expo-file-system';
// Fallback downloader: the new file API and the legacy one fail for different
// reasons, so a second engine is worth having when the first one throws.
import { downloadAsync } from 'expo-file-system/legacy';
import type { CreatorAiChatMessage } from '../services/creatorAi';
import { useThemeColors } from '../themeContext';
import { radius, type } from '../theme';

// The generation payload carried by an assistant reply. `job` is the server
// handle used to poll a job still in flight, `url` is written once (and only
// once) the asset is ready so the conversation persists with the media in it.
// `edit` marks a request that changes the image the creator attached (a Retry
// has to know), and `detail` is the server's reason for a failure — both are
// optional so messages stored before they existed still render.
export type ChatMediaPayload = {
  kind: 'image' | 'video';
  prompt: string;
  url?: string;
  job?: string;
  status: 'pending' | 'ready' | 'failed';
  edit?: boolean;
  detail?: string;
};

// The shared chat message, plus the optional payload. Kept here (rather than
// in services/creatorAi.ts) because the wire format of a chat message is the
// service's business while this card is the app's — older messages stored
// without the field simply render as they always did.
export type ChatMessageRecord = CreatorAiChatMessage & { media?: ChatMediaPayload };

// Portrait frame: the coach's generations are made for Reels, so a 9:16 card
// is the honest preview, and a height cap stops one card owning the thread on
// narrow phones (the image letterboxes inside instead of being cropped).
const MEDIA_ASPECT = 9 / 16;
const MEDIA_MAX_HEIGHT = 380;

// One player per mounted VideoView: `useVideoPlayer` releases the player when
// the component unmounts, so a clip is only ever alive while its card (or the
// full-screen viewer) is on screen.
function MediaVideo({ url, style }: { url: string; style: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(url, (instance) => {
    // A finished clip stays finished — nothing should loop behind the chat.
    instance.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls
      accessibilityLabel="Generated video"
    />
  );
}

function ChatMediaViewer({
  media,
  onClose,
}: {
  media: ChatMediaPayload & { url: string };
  onClose: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        viewer: { flex: 1, backgroundColor: c.darkBg },
        stage: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
        media: { width: '100%', height: '100%' },
        close: {
          position: 'absolute',
          top: insets.top + 12,
          right: 14,
          backgroundColor: c.surface2,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.pill,
          paddingHorizontal: 16,
          paddingVertical: 8,
        },
        closeText: { ...type.small, color: c.onDark, fontWeight: '700' },
      }),
    [c, insets.top],
  );

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <View style={styles.stage}>
          {media.kind === 'image' ? (
            <Image source={{ uri: media.url }} style={styles.media} resizeMode="contain" />
          ) : (
            <MediaVideo url={media.url} style={styles.media} />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close viewer"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

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

/** First line of an error, capped — enough to identify the failure, never a trace. */
function errorReason(error: unknown): string | undefined {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const first = (raw.split('\n')[0] ?? '').trim();
  if (!first) {
    return undefined;
  }
  return first.length > 90 ? `${first.slice(0, 90)}…` : first;
}

/**
 * The Download pill under a finished asset: ask for photo access, pull the
 * remote file into the app cache, then hand that local uri to the gallery.
 * Owns its own timers (the "Saved ✓" label reverts on its own) so they are
 * cleared with the card instead of outliving it.
 */
function ChatMediaSave({ url, kind }: { url: string; kind: 'image' | 'video' }) {
  const c = useThemeColors();
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [note, setNote] = useState<{
    text: string;
    error: boolean;
    detail?: string;
  } | null>(null);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (restoreTimer.current) {
        clearTimeout(restoreTimer.current);
      }
    },
    [],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { paddingHorizontal: 12, paddingVertical: 10, gap: 7 },
        button: {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          backgroundColor: c.primarySoft,
          borderRadius: radius.pill,
          paddingHorizontal: 13,
          paddingVertical: 6,
        },
        buttonText: { color: c.primary, fontSize: 12.5, fontWeight: '700' },
        note: { ...type.small, fontSize: 11.5, lineHeight: 16, color: c.onDarkDim },
        noteError: { color: c.red },
        // The machine reason sits under the friendly line, deliberately quieter.
        noteDetail: { fontSize: 10.5, lineHeight: 14, opacity: 0.75 },
      }),
    [c],
  );

  const save = async (): Promise<void> => {
    if (phase !== 'idle') {
      return;
    }
    setNote(null);
    if (restoreTimer.current) {
      clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }

    // There is no gallery on the web: open the file so the browser's own
    // long-press / save path takes over instead of failing silently.
    if (Platform.OS === 'web') {
      try {
        await Linking.openURL(url);
      } catch {
        setNote({ text: 'Long-press the image to save it.', error: false });
      }
      return;
    }

    setPhase('saving');
    try {
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
        setNote({ text: 'Allow photo access in Settings to save this.', error: false });
        setPhase('idle');
        return;
      }

      const destination = new File(Paths.cache, saveFileName(url, kind));
      let localUri: string;
      try {
        localUri = (await File.downloadFileAsync(url, destination)).uri;
      } catch (primaryError) {
        console.warn('[ChatMedia] primary download failed, trying legacy', primaryError);
        const legacy = await downloadAsync(url, destination.uri);
        if (legacy.status && (legacy.status < 200 || legacy.status >= 300)) {
          throw new Error(`the download was refused (HTTP ${legacy.status})`);
        }
        localUri = legacy.uri;
      }
      try {
        await saveToLibraryAsync(localUri);
      } finally {
        // The gallery keeps its own copy now; the cache file was only a
        // stepping stone, and repeated saves would otherwise pile up in it.
        try {
          const local = new File(localUri);
          if (local.exists) {
            local.delete();
          }
        } catch {
          // The OS reclaims the cache on its own — never fail a saved file here.
        }
      }
      setPhase('saved');
      restoreTimer.current = setTimeout(() => {
        restoreTimer.current = null;
        setPhase('idle');
      }, 2500);
    } catch (error) {
      // A one-word "didn't work" tells nobody anything when a save fails on a
      // real device: keep the friendly line for the creator and carry the
      // actual reason underneath it, short and stack-trace free.
      console.warn('[ChatMedia] save failed', error);
      setNote({
        text: 'Couldn’t save that — check your connection and try again.',
        error: true,
        detail: errorReason(error),
      });
      setPhase('idle');
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          phase === 'saving'
            ? 'Saving to your gallery'
            : `Download this generated ${kind} to your gallery`
        }
        onPress={() => void save()}
        disabled={phase === 'saving'}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
      >
        {phase === 'saving' ? <ActivityIndicator size="small" color={c.primary} /> : null}
        <Text style={styles.buttonText}>
          {phase === 'saving' ? 'Saving…' : phase === 'saved' ? 'Saved ✓' : 'Download'}
        </Text>
      </Pressable>
      {note ? (
        <>
          <Text style={[styles.note, note.error && styles.noteError]}>{note.text}</Text>
          {note.detail ? (
            <Text style={[styles.note, styles.noteDetail]}>{note.detail}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * The card an assistant reply's generated image or video renders in: a
 * spinner while the server job runs, the media itself once it is ready (tap
 * for a full-screen viewer), and an honest failure with a Retry otherwise.
 */
export function ChatMedia({
  media,
  onRetry,
}: {
  media: ChatMediaPayload;
  onRetry: () => void;
}) {
  const c = useThemeColors();
  const [viewerOpen, setViewerOpen] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          // Sized like a chat bubble: fills the thread up to the bubble cap,
          // so the media sits at full bubble width under the reply text.
          alignSelf: 'flex-start',
          width: '100%',
          maxWidth: '84%',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.darkBorder,
          backgroundColor: c.surface1,
          overflow: 'hidden',
        },
        padded: { padding: 12 },

        pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
        pendingText: { ...type.small, color: c.onDark, fontWeight: '700', fontSize: 12.5 },
        promptText: {
          ...type.small,
          color: c.onDarkDim,
          fontSize: 11.5,
          lineHeight: 16,
          marginTop: 6,
        },

        failedText: { ...type.small, color: c.red, fontSize: 12.5, lineHeight: 17 },
        retry: {
          alignSelf: 'flex-start',
          marginTop: 10,
          backgroundColor: c.primarySoft,
          borderRadius: radius.pill,
          paddingHorizontal: 14,
          paddingVertical: 7,
        },
        retryText: { color: c.primary, fontSize: 12.5, fontWeight: '700' },

        media: {
          width: '100%',
          aspectRatio: MEDIA_ASPECT,
          maxHeight: MEDIA_MAX_HEIGHT,
          backgroundColor: c.surface2,
        },
        mediaImage: { width: '100%', height: '100%' },
        openHint: {
          // Top corner, not bottom: native video controls own the bottom edge.
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: c.surface2,
          borderRadius: radius.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
        openHintText: { color: c.onDark, fontSize: 11, fontWeight: '700' },
      }),
    [c],
  );

  if (media.status === 'pending') {
    return (
      <View style={[styles.card, styles.padded]}>
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={styles.pendingText}>
            {media.kind === 'image' ? 'Creating your image…' : 'Creating your 15s video…'}
          </Text>
        </View>
        <Text style={styles.promptText} numberOfLines={2}>
          {media.prompt}
        </Text>
      </View>
    );
  }

  if (media.status !== 'ready' || !media.url) {
    // The server's own reason when it sent one (a bad prompt, a content
    // refusal, a provider timeout) — the generic line only covers failures
    // that happened without one, like a dropped connection.
    const failure =
      media.detail?.trim() || 'Couldn’t create that — check your connection and try again.';
    return (
      <View style={[styles.card, styles.padded]}>
        <Text style={styles.failedText}>{failure}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry generating media"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const ready = media as ChatMediaPayload & { url: string };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          ready.kind === 'image' ? 'Open generated image full screen' : 'Open generated video full screen'
        }
        onPress={() => setViewerOpen(true)}
        style={({ pressed }) => [styles.media, pressed && { opacity: 0.85 }]}
      >
        {ready.kind === 'image' ? (
          <Image source={{ uri: ready.url }} style={styles.mediaImage} resizeMode="contain" />
        ) : (
          <MediaVideo url={ready.url} style={styles.mediaImage} />
        )}
        <View style={styles.openHint} pointerEvents="none">
          <Text style={styles.openHintText}>Tap to enlarge</Text>
        </View>
      </Pressable>
      {/* Its own row under the 9:16 frame: the media keeps the full card
          width, and the pill lands below it instead of over it. */}
      <ChatMediaSave url={ready.url} kind={ready.kind} />
      {viewerOpen ? <ChatMediaViewer media={ready} onClose={() => setViewerOpen(false)} /> : null}
    </View>
  );
}
