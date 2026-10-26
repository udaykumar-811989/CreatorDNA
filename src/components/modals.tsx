import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import type { CreatorAiIdea } from '../services/creatorAi';
import { colors, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';
import { Badge, GradientButton, OutlineButton, priorityBadgeProps } from './ui';
import { BookmarkIcon } from './icons';

function Sheet({
  visible,
  onClose,
  children,
  scrollBody = false,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  // Sheets holding text inputs scroll their whole body, so a tall keyboard
  // can never park the last field or the action button behind it. Sheets
  // without inputs keep the plain, non-scrolling layout.
  scrollBody?: boolean;
}) {
  const styles = useStyles(makeStyles);
  // Android does not reliably resize a Modal window for the keyboard, so the
  // scrolling body also pads itself by the keyboard height — that is what
  // keeps the last field and the primary button above the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const onHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          {scrollBody ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
              contentContainerStyle={[
                styles.sheetScrollContent,
                { paddingBottom: 20 + (Platform.OS === 'android' ? keyboardHeight : 0) },
              ]}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- Generate ideas ----------

export type IdeaRequest = { topic: string; audience: string; goal: string };

export function GenerateIdeasModal({
  visible,
  onClose,
  onSubmit,
  loading,
  error,
  defaults,
  title = 'Fresh Reel ideas',
  submitLabel = 'Generate ideas',
  appendNote,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (request: IdeaRequest) => void;
  loading: boolean;
  error?: string | null;
  defaults: IdeaRequest;
  title?: string;
  submitLabel?: string;
  appendNote?: string;
}) {
  const styles = useStyles(makeStyles);
  const [topic, setTopic] = useState(defaults.topic);
  const [audience, setAudience] = useState(defaults.audience);
  const [goal, setGoal] = useState(defaults.goal);

  useEffect(() => {
    if (visible) {
      setTopic(defaults.topic);
      setAudience(defaults.audience);
      setGoal(defaults.goal);
    }
  }, [visible, defaults.topic, defaults.audience, defaults.goal]);

  const canSubmit =
    topic.trim().length > 0 && audience.trim().length > 0 && goal.trim().length > 0 && !loading;

  return (
    <Sheet visible={visible} onClose={onClose} scrollBody>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
          <Text style={styles.sheetClose}>✕</Text>
        </Pressable>
      </View>
      {appendNote ? <Text style={styles.sheetNote}>{appendNote}</Text> : null}

      <Field label="Topic" value={topic} onChangeText={setTopic} placeholder="e.g. phone comparisons" />
      <Field
        label="Audience"
        value={audience}
        onChangeText={setAudience}
        placeholder="e.g. college students in India"
      />
      <Field
        label="Goal"
        value={goal}
        onChangeText={setGoal}
        placeholder="e.g. grow followers with short reels"
      />

      {error ? (
        <Text accessibilityRole="alert" style={styles.sheetError}>
          {error}
        </Text>
      ) : null}

      <GradientButton
        label={submitLabel}
        loading={loading}
        disabled={!canSubmit}
        onPress={() =>
          onSubmit({
            topic: topic.trim(),
            audience: audience.trim(),
            goal: goal.trim(),
          })
        }
        style={{ marginTop: 6 }}
      />
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
      />
    </View>
  );
}

// ---------- Idea script ----------

export function IdeaScriptModal({
  visible,
  idea,
  saved,
  onToggleSave,
  onClose,
}: {
  visible: boolean;
  idea: CreatorAiIdea | null;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  // Hooks first: this modal early-returns while no idea is selected, and
  // useStyles/useThemeColors must still run on every render.
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const [copied, setCopied] = useState(false);
  // A fresh idea should never open with the previous one's confirmation showing.
  useEffect(() => setCopied(false), [idea]);

  const copyScript = async () => {
    if (!idea) return;
    try {
      await setStringAsync(buildScriptText(idea));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the script is still readable on screen.
    }
  };

  if (!idea) {
    return null;
  }
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheetHead}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Badge {...priorityBadgeProps(idea.priority)} />
          <Text style={[styles.sheetTitle, { marginTop: 8 }]}>{idea.title}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
          <Text style={styles.sheetClose}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scriptScroll} showsVerticalScrollIndicator={false}>
        <ScriptRow label="Opening line" text={idea.hook} highlight />
        {/* Optional sections disappear entirely for ideas saved before these
            fields existed, so old scripts never show an empty box. */}
        {idea.why_it_works ? <ScriptRow label="Why this works" text={idea.why_it_works} /> : null}
        <ScriptRow label="What to film" text={idea.concept} />
        {idea.beats && idea.beats.length > 0 ? <ScriptBeats beats={idea.beats} /> : null}
        <ScriptDetails idea={idea} />
        <ScriptRow label="Ask at the end" text={idea.cta} />
      </ScrollView>

      {/* Own row: three buttons would crowd one line, and the confirmation has
          to stay on screen — "Done" closes the sheet. */}
      <OutlineButton
        label={copied ? 'Copied ✓' : 'Copy script'}
        onPress={() => void copyScript()}
        tone="light"
        style={styles.copyAction}
      />

      <View style={styles.scriptActions}>
        <OutlineButton
          label={saved ? 'Saved ✓' : 'Save idea'}
          onPress={onToggleSave}
          tone="light"
          style={{ flex: 1 }}
        />
        <GradientButton label="Done" onPress={onClose} style={{ flex: 1 }} />
      </View>
      <View style={styles.saveIconRow}>
        <BookmarkIcon size={14} color={saved ? colors.primary : colors.textDim} filled={saved} />
        <Text style={styles.saveIconText}>
          {saved ? 'Kept in your Saved tab' : 'Save to keep it in your Saved tab'}
        </Text>
      </View>
    </Sheet>
  );
}

function ScriptRow({ label, text, highlight = false }: { label: string; text: string; highlight?: boolean }) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.scriptRow}>
      <Text style={styles.scriptLabel}>{label}</Text>
      <View style={[styles.scriptBox, highlight && { backgroundColor: colors.primarySoft }]}>
        <Text style={[styles.scriptText, highlight && { color: colors.primaryDeep, fontWeight: '600' }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

// Numbered list of what happens in the video: the marker carries the order
// while each step wraps onto as many lines as it needs, so nothing is clipped.
function ScriptBeats({ beats }: { beats: string[] }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.scriptRow}>
      <Text style={styles.scriptLabel}>Steps</Text>
      <View style={styles.beatList}>
        {beats.map((beat, index) => (
          <View key={`${index}-${beat}`} style={styles.beatRow}>
            <View style={styles.beatMarker}>
              <Text style={styles.beatMarkerText}>{index + 1}</Text>
            </View>
            <Text style={styles.beatText}>{beat}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Compact meta strip. Format is required so the strip always renders; length
// and viewer columns only join it when the server sent them, which keeps the
// columns evenly spread for older two- and one-column ideas.
function ScriptDetails({ idea }: { idea: CreatorAiIdea }) {
  const styles = useStyles(makeStyles);
  const columns = [
    { label: 'Format', value: idea.format },
    ...(idea.target_length ? [{ label: 'How long', value: idea.target_length }] : []),
    ...(idea.target_viewer ? [{ label: 'Who it is for', value: idea.target_viewer }] : []),
  ];
  return (
    <View style={styles.scriptRow}>
      <Text style={styles.scriptLabel}>Details</Text>
      <View style={styles.metaStrip}>
        {columns.map((column) => (
          <View key={column.label} style={styles.metaColumn}>
            <Text style={styles.metaLabel}>{column.label}</Text>
            <Text style={styles.metaValue} numberOfLines={3}>
              {column.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Plain-text version of the script for the clipboard: the same sections in
// the same order with a blank line between them, headings spelled out so the
// text still makes sense outside the app. Sections the idea does not have
// (older ideas predate those fields) are left out instead of copied empty.
function buildScriptText(idea: CreatorAiIdea): string {
  const blocks: string[] = [];
  const add = (heading: string, body: string) => {
    if (body.trim()) {
      blocks.push(`${heading}\n${body.trim()}`);
    }
  };
  add('Opening line', idea.hook);
  if (idea.why_it_works) {
    add('Why this works', idea.why_it_works);
  }
  add('What to film', idea.concept);
  if (idea.beats && idea.beats.length > 0) {
    add('Steps', idea.beats.map((beat, index) => `${index + 1}. ${beat}`).join('\n'));
  }
  const details = [
    idea.format ? `Format: ${idea.format}` : '',
    idea.target_length ? `How long: ${idea.target_length}` : '',
    idea.target_viewer ? `Who it is for: ${idea.target_viewer}` : '',
  ].filter((line) => line.length > 0);
  if (details.length > 0) {
    add('Details', details.join('\n'));
  }
  // The call to action is the last thing to say on camera, so it ends the text.
  add('Ask at the end', idea.cta);
  return [idea.title, ...blocks].join('\n\n');
}

// Built from the active palette through useStyles (one StyleSheet per palette,
// cached) so the sheet, fields and script boxes follow the theme toggle;
// `c` is the palette inside the factory. The scrim stays a fixed literal —
// it reads correctly over either mode.
const makeStyles = (c: typeof colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 9, 26, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: '86%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { ...type.h3, color: c.text, flexShrink: 1 },
  // Shrink (rather than overflow) when the sheet hits its maxHeight, so the
  // body scrolls instead of pushing the button off the sheet.
  sheetScroll: { flexShrink: 1 },
  // Base room under the action button; the keyboard height is added on top of
  // it while the keyboard is open.
  sheetScrollContent: { paddingBottom: 20 },
  sheetClose: { fontSize: 17, color: c.textSub, fontWeight: '700', paddingHorizontal: 6 },
  sheetNote: { ...type.small, color: c.textSub, marginBottom: 10, lineHeight: 18 },
  sheetError: {
    ...type.small,
    color: c.red,
    backgroundColor: c.redSoft,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 8,
  },

  field: { marginBottom: 12 },
  fieldLabel: {
    ...type.tiny,
    color: c.textSub,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: c.lightBorder,
    backgroundColor: c.lightCard,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    color: c.text,
  },

  scriptScroll: { maxHeight: 330 },
  scriptRow: { marginBottom: 14 },
  scriptLabel: {
    ...type.tiny,
    color: c.textSub,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  scriptBox: {
    backgroundColor: c.lightCard,
    borderRadius: radius.sm + 2,
    padding: 13,
  },
  scriptText: { ...type.body, color: c.text },

  beatList: { gap: 9 },
  beatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  beatMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  beatMarkerText: { fontSize: 11.5, fontWeight: '800', color: c.primary },
  beatText: { ...type.body, color: c.text, flex: 1 },

  metaStrip: { flexDirection: 'row', gap: 8 },
  metaColumn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: c.lightCard,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  metaLabel: {
    ...type.tiny,
    fontSize: 10,
    color: c.textDim,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaValue: { ...type.small, color: c.text, lineHeight: 18 },

  copyAction: { marginTop: 10 },
  scriptActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  saveIconText: { ...type.small, color: c.textDim },
});
