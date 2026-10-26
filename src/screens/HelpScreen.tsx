import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

import { BackIcon, ChevronRightIcon, HelpIcon, MailIcon, SendIcon, SparkIcon } from '../components/icons';
import { ListRow, ScreenHeader } from '../components/ui';
import { creatorAiFunctionUrl, supabaseAnonKey } from '../lib/config';
import {
  FAQ,
  GUIDES,
  SUPPORT_EMAIL,
  SUPPORT_SUBJECT,
  TROUBLESHOOTING,
  helpCenterPayload,
} from '../lib/helpContent';
import { sendCreatorSupportChat, type CreatorAiChatMessage } from '../services/creatorAi';
import { useTheme, useThemeColors } from '../themeContext';
import { radius, type } from '../theme';

type HelpMessage = CreatorAiChatMessage & { escalate?: boolean };

const STARTERS = [
  'Instagram won’t connect',
  'My analysis keeps failing',
  'Where is my data stored?',
];

// ---------- Accordion ----------

function Disclosure({
  title,
  open,
  onToggle,
  children,
  c,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  c: ReturnType<typeof useThemeColors>;
}) {
  const s = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          overflow: 'hidden',
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 13,
        },
        title: { ...type.small, color: c.onDark, fontSize: 14, fontWeight: '700', flex: 1 },
        chevron: { transform: [{ rotate: open ? '90deg' : '0deg' }] },
        body: {
          paddingHorizontal: 16,
          paddingBottom: 15,
          gap: 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.darkBorder,
          paddingTop: 12,
        },
      }),
    [c, open],
  );

  return (
    <View style={s.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [s.header, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.title}>{title}</Text>
        <View style={s.chevron}>
          <ChevronRightIcon size={17} color={c.onDarkDim} />
        </View>
      </Pressable>
      {open ? (
        <View style={s.body}>{children}</View>
      ) : null}
    </View>
  );
}

// ---------- Screen ----------

export function HelpScreen({
  onBack,
  onOpenPrivacy,
  getCreatorToken,
}: {
  onBack: () => void;
  onOpenPrivacy: () => void;
  getCreatorToken: () => Promise<string>;
}) {
  const [view, setView] = useState<'home' | 'assistant'>('home');
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);
  const accent = c.primary;
  const dangerText = c.red;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: 40,
          gap: 8,
        },
        sectionLabel: {
          ...type.tiny,
          color: c.onDarkDim,
          textTransform: 'uppercase',
          marginTop: 14,
          marginLeft: 4,
        },
        hero: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 10,
        },
        heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        heroIcon: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.primarySoft,
        },
        heroTitle: { ...type.h4, color: c.onDark, fontSize: 16, flex: 1 },
        heroText: { ...type.small, color: c.onDarkSub, fontSize: 13, lineHeight: 19 },
        heroButton: { borderRadius: 14, overflow: 'hidden', marginTop: 2 },
        heroFill: {
          minHeight: 46,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        heroLabel: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
        note: {
          ...type.small,
          color: c.onDarkDim,
          fontSize: 11.5,
          lineHeight: 17,
          marginTop: 4,
          marginHorizontal: 4,
        },
        contactCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          paddingHorizontal: 16,
        },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.darkBorder },
        stepRow: { flexDirection: 'row', gap: 9 },
        stepIndex: { color: c.primary, fontSize: 13, fontWeight: '800', lineHeight: 20 },
        stepText: { ...type.small, color: c.onDarkSub, fontSize: 13.5, lineHeight: 20, flex: 1 },

        // Assistant view
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
        messages: { padding: 16, gap: 10, flexGrow: 1 },
        empty: { alignItems: 'center', paddingTop: 44, paddingHorizontal: 12 },
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
        typing: { flexDirection: 'row', alignItems: 'center', gap: 9 },
        typingText: { ...type.small, color: c.onDarkSub },
        errorBox: {
          backgroundColor: c.redSoft,
          borderRadius: radius.sm,
          padding: 12,
        },
        errorText: { ...type.small, color: dangerText, lineHeight: 18 },
        escalate: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: 14,
          padding: 14,
          gap: 8,
          maxWidth: '92%',
        },
        escalateTitle: { ...type.small, color: c.onDark, fontWeight: '800', fontSize: 13.5 },
        escalateText: { ...type.small, color: c.onDarkSub, fontSize: 12.5, lineHeight: 18 },
        escalateButton: { borderRadius: 12, overflow: 'hidden', marginTop: 2 },
        escalateFill: {
          minHeight: 42,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        escalateLabel: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
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
    if (view !== 'assistant') {
      return;
    }
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [view, messages.length, sending]);

  const toggle = (id: string) => {
    setOpenItem((current) => (current === id ? null : id));
  };

  const openSupportMail = (transcript: HelpMessage[]): Promise<void> => {
    const lines = transcript.map(
      (entry) => `${entry.role === 'user' ? 'Me' : 'Helper'}: ${entry.content}`,
    );
    const body = ['Hi CreatorDNA support,', '', 'I need help with:', '', ...lines].join('\n');
    return Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}&body=${encodeURIComponent(body.slice(0, 1800))}`,
    ).then(() => undefined);
  };

  const emailSupport = (transcript: HelpMessage[]) => {
    setMailError(null);
    openSupportMail(transcript).catch(() => {
      // No mail client on this device/browser — fall back to the address.
      setMailError(
        `No email app opened. Write to us at ${SUPPORT_EMAIL} and paste your question.`,
      );
    });
  };

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || sending) {
      return;
    }
    setDraft('');
    setError(null);
    setMailError(null);
    const next: HelpMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setSending(true);
    try {
      if (!creatorAiFunctionUrl || !supabaseAnonKey) {
        throw new Error('CreatorDNA AI is not configured yet.');
      }
      const token = await getCreatorToken();
      const reply = await sendCreatorSupportChat(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        token,
        // Prior turns only — the new message travels separately, exactly like
        // the creator-coach chat, so nothing is sent twice. The escalation
        // flag is app-side metadata and never goes back to the backend.
        messages.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        content,
        helpCenterPayload(),
      );
      setMessages([...next, { role: 'assistant', content: reply.reply, escalate: reply.escalate }]);
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : 'Could not send your message.',
      );
    } finally {
      setSending(false);
    }
  };

  // ---------- Assistant ----------
  if (view === 'assistant') {
    const canSend = draft.trim().length > 0 && !sending;
    const lastEscalated =
      messages.length > 0 && messages[messages.length - 1].role === 'assistant'
        ? messages[messages.length - 1].escalate === true
        : false;

    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LinearGradient
          colors={[c.darkBg, c.darkBg2, c.darkBg3]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Help"
            onPress={() => setView('home')}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
          >
            <BackIcon size={20} color={c.onDark} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>CreatorDNA Helper</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              Answers from the Help Centre
            </Text>
          </View>
        </View>

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
              <Text style={styles.emptyTitle}>What’s going wrong?</Text>
              <Text style={styles.emptyHint}>
                The helper answers from CreatorDNA’s own Help Centre. If it cannot solve your
                problem, it will hand you off to our support email with your conversation.
              </Text>
              <View style={styles.chips}>
                {STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    accessibilityRole="button"
                    onPress={() => void send(starter)}
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
                <View key={`${index}-${message.content.slice(0, 12)}`}>
                  <View
                    style={[
                      styles.bubbleRow,
                      mine ? styles.bubbleRowMine : undefined,
                    ]}
                  >
                    {mine ? (
                      <LinearGradient
                        colors={c.gradient}
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

                  {/* The assistant could not settle it: hand off to email with
                      the whole conversation attached as the message body. */}
                  {message.escalate && index === messages.length - 1 ? (
                    <View style={styles.escalate}>
                      <Text style={styles.escalateTitle}>This needs a human</Text>
                      <Text style={styles.escalateText}>
                        Send your conversation to support and a specialist will reply to your
                        email.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => emailSupport(messages)}
                        style={({ pressed }) => [
                          styles.escalateButton,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <LinearGradient colors={c.gradient} style={styles.escalateFill}>
                          <MailIcon size={17} color="#FFFFFF" />
                          <Text style={styles.escalateLabel}>Email support</Text>
                        </LinearGradient>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}

          {sending ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, styles.bubbleAi, styles.typing]}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={styles.typingText}>Checking the Help Centre…</Text>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => emailSupport(messages)}
                style={{ marginTop: 8 }}
              >
                <Text style={styles.escalateTitle}>Email support instead</Text>
              </Pressable>
            </View>
          ) : null}

          {mailError ? (
            <View style={styles.errorBox}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {mailError}
              </Text>
            </View>
          ) : null}

          {!sending && lastEscalated && !mailError ? (
            <Pressable accessibilityRole="button" onPress={() => emailSupport(messages)}>
              <Text style={[styles.typingText, { textAlign: 'center', marginTop: 4 }]}>
                Or email us directly at {SUPPORT_EMAIL}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Describe your problem…"
            placeholderTextColor={c.onDarkDim}
            style={styles.input}
            multiline
            onSubmitEditing={() => void send()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            onPress={() => void send()}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && { opacity: 0.45 },
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

  // ---------- Help home ----------
  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Help" onBack={onBack} tone={tone} />

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <HelpIcon size={20} color={accent} />
            </View>
            <Text style={styles.heroTitle}>Ask the CreatorDNA Helper</Text>
          </View>
          <Text style={styles.heroText}>
            Describe the problem in your own words. The helper answers from these same articles —
            and passes you to support email when it cannot solve it.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setMailError(null);
              setView('assistant');
            }}
            style={({ pressed }) => [styles.heroButton, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={c.gradient} style={styles.heroFill}>
              <SparkIcon size={17} color="#FFFFFF" />
              <Text style={styles.heroLabel}>Start a helper chat</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* FAQ */}
        <Text style={styles.sectionLabel}>Frequently asked</Text>
        {FAQ.map((item) => (
          <Disclosure
            key={item.id}
            title={item.question}
            open={openItem === item.id}
            onToggle={() => toggle(item.id)}
            c={c}
          >
            <Text style={styles.heroText}>{item.answer}</Text>
          </Disclosure>
        ))}

        {/* Guides */}
        <Text style={styles.sectionLabel}>Setup guides</Text>
        {GUIDES.map((guide) => (
          <Disclosure
            key={guide.id}
            title={guide.title}
            open={openItem === guide.id}
            onToggle={() => toggle(guide.id)}
            c={c}
          >
            <Text style={styles.heroText}>{guide.summary}</Text>
            <View style={{ gap: 7, marginTop: 4 }}>
              {guide.steps.map((step, index) => (
                <View key={index} style={styles.stepRow}>
                  <Text style={styles.stepIndex}>{index + 1}.</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </Disclosure>
        ))}

        {/* Troubleshooting */}
        <Text style={styles.sectionLabel}>Troubleshooting</Text>
        {TROUBLESHOOTING.map((item) => (
          <Disclosure
            key={item.id}
            title={item.question}
            open={openItem === item.id}
            onToggle={() => toggle(item.id)}
            c={c}
          >
            <Text style={styles.heroText}>{item.answer}</Text>
          </Disclosure>
        ))}

        {/* Contact */}
        <Text style={styles.sectionLabel}>Still stuck?</Text>
        <View style={styles.contactCard}>
          <ListRow
            tone={tone}
            icon={<MailIcon size={19} color={accent} />}
            label="Email support"
            value={SUPPORT_EMAIL}
            onPress={() => emailSupport(messages)}
          />
          <View style={styles.divider} />
          <ListRow
            tone={tone}
            icon={<HelpIcon size={19} color={accent} />}
            label="Privacy Policy"
            value="Data & rights"
            onPress={onOpenPrivacy}
          />
        </View>
        {mailError ? (
          <Text accessibilityRole="alert" style={styles.note}>
            {mailError}
          </Text>
        ) : (
          <Text style={styles.note}>
            Support replies to the email you write from. Include the account you connected and
            what you expected to happen.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
