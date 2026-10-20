import { useEffect, useState } from 'react';
import {
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
import type { CreatorAiIdea } from '../services/creatorAi';
import { colors, radius, type } from '../theme';
import { Badge, GradientButton, OutlineButton, priorityBadgeProps } from './ui';
import { BookmarkIcon } from './icons';

function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>{children}</View>
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
    <Sheet visible={visible} onClose={onClose}>
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
        <ScriptRow label="Hook" text={idea.hook} highlight />
        <ScriptRow label="Concept" text={idea.concept} />
        <ScriptRow label="Format" text={idea.format} />
        <ScriptRow label="Call to action" text={idea.cta} />
      </ScrollView>

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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 9, 26, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
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
  sheetTitle: { ...type.h3, color: colors.text, flexShrink: 1 },
  sheetClose: { fontSize: 17, color: colors.textSub, fontWeight: '700', paddingHorizontal: 6 },
  sheetNote: { ...type.small, color: colors.textSub, marginBottom: 10, lineHeight: 18 },
  sheetError: {
    ...type.small,
    color: colors.red,
    backgroundColor: colors.redSoft,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 8,
  },

  field: { marginBottom: 12 },
  fieldLabel: {
    ...type.tiny,
    color: colors.textSub,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.lightBorder,
    backgroundColor: colors.lightCard,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    color: colors.text,
  },

  scriptScroll: { maxHeight: 330 },
  scriptRow: { marginBottom: 12 },
  scriptLabel: {
    ...type.tiny,
    color: colors.textSub,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  scriptBox: {
    backgroundColor: colors.lightCard,
    borderRadius: radius.sm + 2,
    padding: 13,
  },
  scriptText: { ...type.body, color: colors.text },
  scriptActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  saveIconText: { ...type.small, color: colors.textDim },
});
