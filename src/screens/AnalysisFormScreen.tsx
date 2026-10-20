import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { DocIcon, ImageIcon, MicIcon, PlayIcon } from '../components/icons';
import { ScreenHeader, GradientButton } from '../components/ui';
import type { AnalysisSubmission } from '../lib/types';
import { humanizeMediaType } from '../lib/derived';
import { creatorAiFunctionUrl, supabaseAnonKey } from '../lib/config';
import {
  CreatorAiJob,
  CreatorAiMedia,
  readCreatorMedia,
  transcribeCreatorAudio,
} from '../services/creatorAi';
import type { InstagramDashboard } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

export function AnalysisFormScreen({
  dashboard,
  getCreatorToken,
  job,
  submitting,
  error,
  onSubmit,
  onBack,
}: {
  dashboard: InstagramDashboard | null;
  getCreatorToken: () => Promise<string>;
  job: CreatorAiJob | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (submission: AnalysisSubmission) => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [caption, setCaption] = useState('');
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<(CreatorAiMedia & { uri: string }) | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const busy =
    submitting || (job !== null && job.status !== 'completed' && job.status !== 'failed');
  const displayError =
    localError ?? (job?.status === 'failed' && job.error ? job.error : error);

  const setPickedMedia = async (
    uri: string,
    mimeType: string,
    name: string,
    kind: CreatorAiMedia['kind'],
    size?: number | null,
  ) => {
    if (size !== undefined && size !== null && size > 3_000_000) {
      throw new Error('Choose a media file smaller than 3 MB for this preview.');
    }
    const loaded = await readCreatorMedia(uri, mimeType, name, kind);
    setSelectedMedia({ ...loaded, uri });
    setLocalError(null);
  };

  const chooseImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        await setPickedMedia(
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileName ?? 'creator-image',
          'image',
          asset.fileSize,
        );
      }
    } catch (pickError) {
      setLocalError(pickError instanceof Error ? pickError.message : 'Could not open the image picker.');
    }
  };

  const chooseMediaFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/webm', 'video/quicktime', 'audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? '';
      const kind = mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : null;
      if (!kind) {
        throw new Error('Choose an audio or video file.');
      }
      await setPickedMedia(asset.uri, mimeType, asset.name, kind, asset.size);
    } catch (pickError) {
      setLocalError(pickError instanceof Error ? pickError.message : 'Could not open the file picker.');
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      setTranscribing(true);
      setLocalError(null);
      try {
        if (audioRecorder.getStatus().isRecording) {
          await audioRecorder.stop();
        }
        setRecording(false);
        if (!audioRecorder.uri) {
          throw new Error('The voice recording could not be saved.');
        }
        const mimeType =
          Platform.OS === 'web' || audioRecorder.uri.toLowerCase().endsWith('.webm')
            ? 'audio/webm'
            : 'audio/mp4';
        const voice = await readCreatorMedia(
          audioRecorder.uri,
          mimeType,
          mimeType === 'audio/webm' ? 'voice-note.webm' : 'voice-note.m4a',
          'audio',
        );
        setSelectedMedia({ ...voice, uri: audioRecorder.uri });
        if (!creatorAiFunctionUrl || !supabaseAnonKey) {
          throw new Error('Supabase is not configured for voice transcription.');
        }
        const token = await getCreatorToken();
        const transcribed = await transcribeCreatorAudio(
          creatorAiFunctionUrl,
          supabaseAnonKey,
          token,
          voice,
        );
        setTranscript((current) => [current.trim(), transcribed].filter(Boolean).join('\n'));
      } catch (recordError) {
        setLocalError(recordError instanceof Error ? recordError.message : 'Voice transcription failed.');
      } finally {
        setRecording(false);
        setTranscribing(false);
      }
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Allow microphone access to record your voice.');
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record({ forDuration: 30 });
      setRecording(true);
      setLocalError(null);
    } catch (recordError) {
      setLocalError(recordError instanceof Error ? recordError.message : 'Could not start voice recording.');
    }
  };

  const submit = () => {
    const cleanTitle = title.trim();
    const cleanTranscript = transcript.trim();
    const cleanCaption = caption.trim();
    if (!cleanTitle || (!cleanTranscript && !cleanCaption && !selectedMedia)) {
      setLocalError('Add a title and some text, a voice recording, or a media file before analyzing.');
      return;
    }
    const metrics: Record<string, number> = {};
    for (const [label, rawValue] of [
      ['views', views],
      ['likes', likes],
      ['comments', comments],
    ] as const) {
      if (!rawValue.trim()) {
        continue;
      }
      const value = Number(rawValue);
      if (!Number.isSafeInteger(value) || value < 0) {
        setLocalError(`${label[0].toUpperCase()}${label.slice(1)} must be a non-negative whole number.`);
        return;
      }
      metrics[label] = value;
    }
    setLocalError(null);
    onSubmit({
      idempotencyKey: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      title: cleanTitle,
      transcript: cleanTranscript || null,
      caption: cleanCaption || null,
      metrics,
      media: selectedMedia,
    });
  };

  const prefillFromMedia = (media: InstagramDashboard['media'][number]) => {
    const firstLine = (media.caption ?? '').split('\n')[0].trim();
    const nextTitle = firstLine
      ? firstLine.length > 80
        ? `${firstLine.slice(0, 77)}…`
        : firstLine
      : `${humanizeMediaType(media.mediaType)} post`;
    setTitle(nextTitle);
    if (media.caption) {
      setCaption(media.caption);
    }
    if (media.likes !== null) {
      setLikes(String(media.likes));
    }
    if (media.comments !== null) {
      setComments(String(media.comments));
    }
    setLocalError(null);
    setPickerOpen(false);
  };

  const mediaItems = dashboard?.media ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Analyze content"
          subtitle="Score a post and get the exact fixes to try next."
          onBack={onBack}
        />

        {busy ? (
          <View style={styles.progressCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.progressText}>
              {transcribing
                ? 'Transcribing your voice note…'
                : 'Analyzing your content… this can take up to a minute.'}
            </Text>
          </View>
        ) : null}

        {mediaItems.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.fromPosts, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.fromPostsIcon}>
              <ImageIcon size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fromPostsTitle}>Pick from your posts</Text>
              <Text style={styles.fromPostsSub}>Pre-fill the caption and engagement from Instagram</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}

        <Field label="Title">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. iPhone 15 vs iPhone 14 — worth it?"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
        </Field>

        <Field label="Transcript" hint="What you say on camera">
          <TextInput
            value={transcript}
            onChangeText={setTranscript}
            placeholder="Paste what you said, or record your voice below…"
            placeholderTextColor={colors.textDim}
            style={[styles.input, styles.multiline]}
            multiline
            textAlignVertical="top"
          />
        </Field>

        <View style={styles.mediaRow}>
          <MediaButton
            icon={<MicIcon size={17} color={recording ? colors.red : colors.primary} />}
            label={recording ? 'Stop (30s max)' : transcribing ? 'Transcribing…' : 'Record voice'}
            active={recording}
            onPress={() => void toggleRecording()}
          />
          <MediaButton
            icon={<ImageIcon size={17} color={colors.primary} />}
            label="Image"
            onPress={() => void chooseImage()}
          />
          <MediaButton
            icon={<DocIcon size={17} color={colors.primary} />}
            label="File"
            onPress={() => void chooseMediaFile()}
          />
        </View>

        {selectedMedia ? (
          <View style={styles.attachment}>
            <Text style={styles.attachmentLabel} numberOfLines={1}>
              📎 {selectedMedia.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove attachment"
              hitSlop={8}
              onPress={() => setSelectedMedia(null)}
            >
              <Text style={styles.attachmentRemove}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        <Field label="Caption" hint="Optional context from the post">
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="The post caption, if any…"
            placeholderTextColor={colors.textDim}
            style={[styles.input, styles.multilineSmall]}
            multiline
            textAlignVertical="top"
          />
        </Field>

        <Field label="Metrics" hint="Context only — never judged as performance">
          <View style={styles.metricsRow}>
            <TextInput
              value={views}
              onChangeText={setViews}
              placeholder="Views"
              placeholderTextColor={colors.textDim}
              keyboardType="numeric"
              style={[styles.input, styles.metricInput]}
            />
            <TextInput
              value={likes}
              onChangeText={setLikes}
              placeholder="Likes"
              placeholderTextColor={colors.textDim}
              keyboardType="numeric"
              style={[styles.input, styles.metricInput]}
            />
            <TextInput
              value={comments}
              onChangeText={setComments}
              placeholder="Comments"
              placeholderTextColor={colors.textDim}
              keyboardType="numeric"
              style={[styles.input, styles.metricInput]}
            />
          </View>
        </Field>

        {displayError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {displayError}
          </Text>
        ) : null}

        <GradientButton
          label={busy ? 'Analyzing…' : 'Analyze content'}
          loading={busy}
          onPress={submit}
        />
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} accessibilityLabel="Close" />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>Pick from your posts</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityLabel="Close">
                <Text style={styles.pickerClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {mediaItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => prefillFromMedia(item)}
                  style={({ pressed }) => [styles.pickerRow, pressed && { backgroundColor: colors.lightCard }]}
                >
                  {item.thumbnailUrl ? (
                    <Image source={{ uri: item.thumbnailUrl }} style={styles.pickerThumb} />
                  ) : (
                    <View style={[styles.pickerThumb, styles.pickerThumbFallback]}>
                      <PlayIcon size={18} color="rgba(255,255,255,0.9)" />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickerRowTitle} numberOfLines={2}>
                      {item.caption?.trim() || humanizeMediaType(item.mediaType)}
                    </Text>
                    <Text style={styles.pickerRowMeta}>
                      {humanizeMediaType(item.mediaType)}
                      {item.likes !== null ? ` • ${item.likes} likes` : ''}
                      {item.comments !== null ? ` • ${item.comments} comments` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function MediaButton({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaButton,
        active && { borderColor: colors.red, backgroundColor: colors.redSoft },
        pressed && { opacity: 0.75 },
      ]}
    >
      {icon}
      <Text style={[styles.mediaButtonLabel, active && { color: colors.red }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: FAB_CLEARANCE,
    gap: 15,
  },

  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 14,
  },
  progressText: { ...type.small, color: colors.primaryDeep, flex: 1, lineHeight: 18 },

  fromPosts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.lightCard,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: radius.md,
    padding: 13,
  },
  fromPostsIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromPostsTitle: { ...type.bodyBold, color: colors.text, fontSize: 14.5 },
  fromPostsSub: { ...type.small, color: colors.textSub, fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.textDim, fontWeight: '600' },

  field: { gap: 7 },
  fieldHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  fieldLabel: {
    ...type.tiny,
    color: colors.textSub,
    textTransform: 'uppercase',
  },
  fieldHint: { ...type.small, color: colors.textDim, fontSize: 11.5, flexShrink: 1, textAlign: 'right' },
  input: {
    borderWidth: 1.5,
    borderColor: colors.lightBorder,
    backgroundColor: colors.lightCard,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 15,
    color: colors.text,
  },
  multiline: { minHeight: 128, paddingTop: 13 },
  multilineSmall: { minHeight: 84, paddingTop: 12 },

  mediaRow: { flexDirection: 'row', gap: 9 },
  mediaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: colors.lightBorder,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.white,
    paddingHorizontal: 8,
  },
  mediaButtonLabel: { ...type.small, color: colors.primary, fontWeight: '700' },

  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.lightCard2,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  attachmentLabel: { ...type.small, color: colors.text, flex: 1 },
  attachmentRemove: { color: colors.textSub, fontSize: 14, fontWeight: '700' },

  metricsRow: { flexDirection: 'row', gap: 9 },
  metricInput: { flex: 1, minWidth: 0 },

  error: {
    ...type.small,
    color: colors.red,
    backgroundColor: colors.redSoft,
    borderRadius: radius.sm,
    padding: 12,
    lineHeight: 18,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 9, 26, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
  },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pickerTitle: { ...type.h3, color: colors.text },
  pickerClose: { fontSize: 16, color: colors.textSub, fontWeight: '700' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  pickerThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.lightCard2 },
  pickerThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  pickerRowTitle: { ...type.small, color: colors.text, fontWeight: '600', fontSize: 13.5 },
  pickerRowMeta: { ...type.small, color: colors.textSub, fontSize: 12, marginTop: 3 },
});
