import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { DnaMark } from '../components/DnaMark';
import { ChatMedia, type ChatMessageRecord } from '../components/ChatMedia';
import { BackIcon, ImageIcon, SendIcon, SparkIcon, VideoIcon } from '../components/icons';
import { creatorAiFunctionUrl, supabaseAnonKey } from '../lib/config';
import { attachCreatorMedia } from '../services/creatorAi';
import type {
  CreatorAiChatAttachmentInput,
  CreatorAiChatMessage,
} from '../services/creatorAi';
import { useTheme, useThemeColors } from '../themeContext';
import { radius, type } from '../theme';

const STARTERS = [
  'What should I post today?',
  'How can I grow faster?',
  'Review my latest analysis',
];

// Mirrors what the backend accepts for chat attachments.
const CHAT_MEDIA_TYPES: Record<'image' | 'video', readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

function guessMimeType(name: string, kind: 'image' | 'video'): string | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_BY_EXTENSION[extension];
  return mime && mime.startsWith(kind) ? mime : null;
}

function BubbleAttachment({
  attachment,
  mine,
}: {
  attachment: NonNullable<CreatorAiChatMessage['attachment']>;
  mine: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const chipIcon = mine ? '#FFFFFF' : c.primary;

  const s = useMemo(
    () =>
      StyleSheet.create({
        attachmentImage: {
          width: 200,
          height: 150,
          borderRadius: 12,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        attachmentChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          backgroundColor: c.primarySoft,
          borderRadius: 10,
          paddingHorizontal: 11,
          paddingVertical: 8,
          alignSelf: 'flex-start',
        },
        attachmentChipMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
        attachmentChipText: {
          ...type.small,
          color: c.primary,
          fontWeight: '700',
          fontSize: 12.5,
          maxWidth: 170,
        },
        attachmentChipTextMine: { color: '#FFFFFF' },
      }),
    [c, isDark],
  );

  if (attachment.kind === 'image' && attachment.uri && !failed) {
    return (
      <Image
        source={{ uri: attachment.uri }}
        style={s.attachmentImage}
        onError={() => setFailed(true)}
        accessibilityLabel={attachment.name}
      />
    );
  }
  return (
    <View style={[s.attachmentChip, mine && s.attachmentChipMine]}>
      {attachment.kind === 'image' ? (
        <ImageIcon size={15} color={chipIcon} />
      ) : (
        <VideoIcon size={15} color={chipIcon} />
      )}
      <Text
        style={[s.attachmentChipText, mine && s.attachmentChipTextMine]}
        numberOfLines={1}
      >
        {attachment.name}
      </Text>
    </View>
  );
}

export function ChatScreen({
  messages,
  sending,
  error,
  onSend,
  onBack,
  onClear,
  onRetryMedia,
  getCreatorToken,
}: {
  messages: ChatMessageRecord[];
  sending: boolean;
  error: string | null;
  onSend: (text: string, attachment?: CreatorAiChatAttachmentInput) => void;
  onBack: () => void;
  onClear: () => void;
  /** Re-run generation for a reply whose media job failed. */
  onRetryMedia: (message: ChatMessageRecord) => void;
  getCreatorToken: () => Promise<string>;
}) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<CreatorAiChatAttachmentInput | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; percent: number } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  // Light purple accent only reads on dark surfaces; use brand purple on white.
  const accent = c.primary;
  const dangerText = c.red;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },

        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.darkBorder,
        },
        headerBack: {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: c.surface2,
          borderWidth: isDark ? 0 : 1,
          borderColor: c.darkBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerTitle: { ...type.bodyBold, color: c.onDark, fontSize: 16.5 },
        headerSub: { fontSize: 11.5, color: c.onDarkDim, fontWeight: '600', marginTop: 2 },
        clearButton: { fontSize: 13, fontWeight: '700', color: c.onDarkSub },

        messages: { padding: 16, gap: 10, flexGrow: 1 },

        empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 12 },
        emptyIcon: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: c.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        },
        emptyTitle: { ...type.h4, color: c.onDark, textAlign: 'center', fontSize: 18 },
        emptyHint: {
          ...type.small,
          color: c.onDarkSub,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: 19,
        },
        chips: { marginTop: 22, gap: 9, alignSelf: 'stretch' },
        chip: {
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: 999,
          paddingVertical: 11,
          paddingHorizontal: 18,
          alignItems: 'center',
        },
        chipText: { ...type.small, color: c.onDark, fontSize: 13.5 },

        bubbleRow: { flexDirection: 'row' },
        bubbleRowMine: { justifyContent: 'flex-end' },
        bubbleRowAi: { justifyContent: 'flex-start' },
        bubble: {
          maxWidth: '84%',
          borderRadius: 18,
          paddingHorizontal: 15,
          paddingVertical: 11,
        },
        bubbleMine: { borderBottomRightRadius: 6 },
        bubbleAi: {
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderBottomLeftRadius: 6,
        },
        bubbleMineText: { ...type.body, color: '#FFFFFF', fontSize: 14.5 },
        bubbleAiText: { ...type.body, color: c.onDark, fontSize: 14.5 },

        attachmentImage: {
          width: 200,
          height: 150,
          borderRadius: 12,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        attachmentChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          backgroundColor: c.primarySoft,
          borderRadius: 10,
          paddingHorizontal: 11,
          paddingVertical: 8,
          alignSelf: 'flex-start',
        },
        attachmentChipMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
        attachmentChipText: {
          ...type.small,
          color: c.primary,
          fontWeight: '700',
          fontSize: 12.5,
          maxWidth: 170,
        },
        attachmentChipTextMine: { color: '#FFFFFF' },

        typing: { flexDirection: 'row', alignItems: 'center', gap: 9 },
        typingText: { ...type.small, color: c.onDarkSub },

        errorBox: {
          backgroundColor: c.redSoft,
          borderRadius: radius.sm,
          padding: 12,
          marginTop: 4,
        },
        errorText: { ...type.small, color: dangerText, lineHeight: 18 },

        pendingRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginHorizontal: 14,
          marginBottom: 8,
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: 12,
          padding: 8,
        },
        pendingThumb: {
          width: 42,
          height: 42,
          borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.3)',
        },
        pendingThumbVideo: { alignItems: 'center', justifyContent: 'center' },
        pendingName: { ...type.small, color: c.onDark, flex: 1, fontWeight: '700' },
        pendingRemove: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: c.surface3,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pendingRemoveText: { color: c.onDark, fontSize: 13, fontWeight: '700' },

        pickError: {
          ...type.small,
          color: dangerText,
          marginHorizontal: 16,
          marginBottom: 8,
          fontSize: 12,
        },

        inputBar: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 26 : 14,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.darkBorder,
          backgroundColor: c.footerBg,
        },
        attachButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.surface1,
          marginBottom: 4,
        },
        input: {
          flex: 1,
          minHeight: 44,
          maxHeight: 130,
          backgroundColor: c.surface2,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: 22,
          paddingHorizontal: 16,
          paddingTop: 11,
          paddingBottom: 11,
          color: c.onDark,
          fontSize: 15,
        },
        sendButton: { borderRadius: 24, overflow: 'hidden' },
        sendFill: {
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [c, isDark, dangerText],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length, sending, pending]);

  const pickAttachment = async (kind: 'image' | 'video') => {
    if (picking || sending) {
      return;
    }
    setPicking(true);
    setPickError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'image' ? ['images'] : ['videos'],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) {
        return;
      }
      const asset = result.assets[0];
      const name =
        asset.fileName ??
        asset.uri.split(/[\\/]/).pop() ??
        (kind === 'image' ? 'image' : 'clip');
      const mimeType = (asset.mimeType ?? guessMimeType(name, kind) ?? '').toLowerCase();
      if (!CHAT_MEDIA_TYPES[kind].includes(mimeType)) {
        setPickError(
          kind === 'image'
            ? 'Choose a JPEG, PNG, WebP or HEIC image.'
            : 'Choose an MP4, WebM or MOV video.',
        );
        return;
      }
      setUploading({ name, percent: 0 });
      // Small files attach inline; anything larger (up to 1 GB) streams to
      // Gemini's Files API and is referenced by URI.
      const attached = await attachCreatorMedia(asset.uri, mimeType, name, kind, {
        credentials: creatorAiFunctionUrl && supabaseAnonKey
          ? {
            functionUrl: creatorAiFunctionUrl,
            anonKey: supabaseAnonKey,
            accessToken: await getCreatorToken(),
          }
          : null,
        onProgress: (fraction) =>
          setUploading({ name, percent: Math.round(fraction * 100) }),
      });
      setPending({ ...attached, kind, name, uri: asset.uri });
    } catch (pickMediaError) {
      setPickError(
        pickMediaError instanceof Error
          ? pickMediaError.message
          : 'Could not read that file — try another one.',
      );
    } finally {
      setPicking(false);
      setUploading(null);
    }
  };

  const send = (text?: string) => {
    const content = (text ?? draft).trim();
    if (sending || picking || uploading) return;
    if (!content && !pending) return;
    setDraft('');
    setPickError(null);
    const attachment = pending;
    setPending(null);
    onSend(content, attachment ?? undefined);
  };

  const canSend = (draft.trim().length > 0 || pending !== null) && uploading === null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[c.darkBg, c.darkBg2, c.darkBg3]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close chat"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
        >
          <BackIcon size={20} color={c.onDark} />
        </Pressable>
        <DnaMark size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>CreatorDNA AI</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Knows your stats, DNA, plan & analyses
          </Text>
        </View>
        {messages.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={onClear} hitSlop={10}>
            <Text style={styles.clearButton}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <SparkIcon size={26} color={accent} />
            </View>
            <Text style={styles.emptyTitle}>Ask anything about your content</Text>
            <Text style={styles.emptyHint}>
              This assistant reads your real Instagram insights, Creator DNA, content plan, and
              analyses before answering — and can look at an image or video you attach.
            </Text>
            <View style={styles.chips}>
              {STARTERS.map((starter) => (
                <Pressable
                  key={starter}
                  accessibilityRole="button"
                  onPress={() => send(starter)}
                  style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipText}>{starter}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message, index) => {
            const mine = message.role === 'user';
            const rowKey = `${index}-${message.content.slice(0, 12)}`;
            return (
              <Fragment key={rowKey}>
                <View
                  style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowAi]}
                >
                  {mine ? (
                    <LinearGradient
                      colors={c.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.bubble, styles.bubbleMine]}
                    >
                      {message.attachment ? (
                        <BubbleAttachment attachment={message.attachment} mine />
                      ) : null}
                      {message.content ? (
                        <Text style={[styles.bubbleMineText, message.attachment && { marginTop: 8 }]}>
                          {message.content}
                        </Text>
                      ) : null}
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubble, styles.bubbleAi]}>
                      {message.attachment ? (
                        <BubbleAttachment attachment={message.attachment} mine={false} />
                      ) : null}
                      {message.content ? (
                        <Text style={[styles.bubbleAiText, message.attachment && { marginTop: 8 }]}>
                          {message.content}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
                {/* Generated media renders as its own card under the reply:
                    it needs the thread's width to size the 9:16 frame, which
                    a shrink-wrapping bubble can't give it. */}
                {message.media && !mine ? (
                  <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
                    <ChatMedia
                      media={message.media}
                      onRetry={() => onRetryMedia(message)}
                    />
                  </View>
                ) : null}
              </Fragment>
            );
          })
        )}

        {sending ? (
          <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
            <View style={[styles.bubble, styles.bubbleAi, styles.typing]}>
              <ActivityIndicator size="small" color={accent} />
              <Text style={styles.typingText}>CreatorDNA is thinking…</Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Upload progress for large attachments (up to 1 GB) */}
      {uploading ? (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={accent} />
          <Text style={styles.pendingName} numberOfLines={1}>
            Uploading {uploading.name}… {uploading.percent}%
          </Text>
        </View>
      ) : null}

      {/* Pending attachment preview */}
      {pending ? (
        <View style={styles.pendingRow}>
          {pending.kind === 'image' ? (
            <Image source={{ uri: pending.uri }} style={styles.pendingThumb} />
          ) : (
            <View style={[styles.pendingThumb, styles.pendingThumbVideo]}>
              <VideoIcon size={18} color={accent} />
            </View>
          )}
          <Text style={styles.pendingName} numberOfLines={1}>
            {pending.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            onPress={() => setPending(null)}
            hitSlop={10}
            style={({ pressed }) => [styles.pendingRemove, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.pendingRemoveText}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      {pickError ? (
        <Text accessibilityRole="alert" style={styles.pickError}>
          {pickError}
        </Text>
      ) : null}

      {/* Input */}
      <View style={styles.inputBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach an image"
          disabled={picking || sending || uploading !== null}
          onPress={() => void pickAttachment('image')}
          style={({ pressed }) => [
            styles.attachButton,
            (picking || sending) && { opacity: 0.45 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <ImageIcon size={20} color={c.onDarkSub} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a video"
          disabled={picking || sending || uploading !== null}
          onPress={() => void pickAttachment('video')}
          style={({ pressed }) => [
            styles.attachButton,
            (picking || sending) && { opacity: 0.45 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {picking ? (
            <ActivityIndicator size="small" color={c.onDarkSub} />
          ) : (
            <VideoIcon size={20} color={c.onDarkSub} />
          )}
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={pending ? 'Add a note about the attachment…' : 'Ask about your content…'}
          placeholderTextColor={c.onDarkDim}
          style={styles.input}
          multiline
          onSubmitEditing={() => send()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={sending || !canSend}
          onPress={() => send()}
          style={({ pressed }) => [
            styles.sendButton,
            (sending || !canSend) && { opacity: 0.45 },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <LinearGradient colors={c.gradient} style={styles.sendFill}>
            <SendIcon size={20} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
