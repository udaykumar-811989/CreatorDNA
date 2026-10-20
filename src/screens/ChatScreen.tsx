import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { DnaMark } from '../components/DnaMark';
import { BackIcon, SendIcon, SparkIcon } from '../components/icons';
import type { CreatorAiChatMessage } from '../services/creatorAi';
import { colors, radius, type } from '../theme';

const STARTERS = [
  'What should I post today?',
  'How can I grow faster?',
  'Review my latest analysis',
];

export function ChatScreen({
  messages,
  sending,
  error,
  onSend,
  onBack,
  onClear,
}: {
  messages: CreatorAiChatMessage[];
  sending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onBack: () => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length, sending]);

  const send = (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    setDraft('');
    onSend(content);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={[colors.darkBg, colors.darkBg2, colors.darkBg3]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close chat"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
        >
          <BackIcon size={20} color={colors.onDark} />
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
              <SparkIcon size={26} color="#C4A8FF" />
            </View>
            <Text style={styles.emptyTitle}>Ask anything about your content</Text>
            <Text style={styles.emptyHint}>
              This assistant reads your real Instagram insights, Creator DNA, content plan, and
              analyses before answering.
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
            return (
              <View
                key={`${index}-${message.content.slice(0, 12)}`}
                style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowAi]}
              >
                {mine ? (
                  <LinearGradient
                    colors={colors.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.bubble, styles.bubbleMine]}
                  >
                    <Text style={styles.bubbleMineText}>{message.content}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.bubbleAi]}>
                    <Text style={styles.bubbleAiText}>{message.content}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        {sending ? (
          <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
            <View style={[styles.bubble, styles.bubbleAi, styles.typing]}>
              <ActivityIndicator size="small" color="#C4A8FF" />
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

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your content…"
          placeholderTextColor={colors.onDarkDim}
          style={styles.input}
          multiline
          onSubmitEditing={() => send()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={sending || draft.trim().length === 0}
          onPress={() => send()}
          style={({ pressed }) => [
            styles.sendButton,
            (sending || draft.trim().length === 0) && { opacity: 0.45 },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <LinearGradient colors={colors.gradient} style={styles.sendFill}>
            <SendIcon size={20} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkBg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.darkBorder,
  },
  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.bodyBold, color: colors.onDark, fontSize: 16.5 },
  headerSub: { fontSize: 11.5, color: colors.onDarkDim, fontWeight: '600', marginTop: 2 },
  clearButton: { fontSize: 13, fontWeight: '700', color: colors.onDarkSub },

  messages: { padding: 16, gap: 10, flexGrow: 1 },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 12 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(196,168,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { ...type.h4, color: colors.onDark, textAlign: 'center', fontSize: 18 },
  emptyHint: {
    ...type.small,
    color: colors.onDarkSub,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  chips: { marginTop: 22, gap: 9, alignSelf: 'stretch' },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  chipText: { ...type.small, color: colors.onDark, fontSize: 13.5 },

  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowAi: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11 },
  bubbleMine: { borderBottomRightRadius: 6 },
  bubbleAi: { backgroundColor: colors.darkCard2, borderWidth: 1, borderColor: colors.darkBorder, borderBottomLeftRadius: 6 },
  bubbleMineText: { ...type.body, color: '#FFFFFF', fontSize: 14.5 },
  bubbleAiText: { ...type.body, color: '#E9E7FA', fontSize: 14.5 },

  typing: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  typingText: { ...type.small, color: colors.onDarkSub },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: radius.sm,
    padding: 12,
    marginTop: 4,
  },
  errorText: { ...type.small, color: '#FF9B9B', lineHeight: 18 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 26 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.darkBorder,
    backgroundColor: 'rgba(8,11,27,0.72)',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 130,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: colors.onDark,
    fontSize: 15,
  },
  sendButton: { borderRadius: 24, overflow: 'hidden' },
  sendFill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
