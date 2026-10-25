import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DocIcon, HelpIcon, LinkOutIcon, RefreshIcon, TrashIcon } from '../components/icons';
import { ListRow, ScreenHeader } from '../components/ui';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, radius, type } from '../theme';

function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
  c,
  isDark,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  c: ReturnType<typeof useThemeColors>;
  isDark: boolean;
}) {
  const s = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: isDark ? 'rgba(5,7,18,0.66)' : 'rgba(22,20,43,0.42)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        },
        dialog: {
          width: '100%',
          maxWidth: 380,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 4,
          padding: 20,
          gap: 10,
        },
        dialogTitle: { ...type.h4, color: c.onDark, fontSize: 17 },
        dialogBody: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
        dialogActions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'flex-end' },
        dialogButton: { borderRadius: radius.pill, overflow: 'hidden', minWidth: 108 },
        dialogCancel: {
          borderWidth: 1.5,
          borderColor: c.darkBorder,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 11,
        },
        dialogCancelText: { ...type.small, color: c.onDark, fontWeight: '800' },
        dialogButtonFill: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
          paddingHorizontal: 18,
        },
        dialogButtonDanger: { backgroundColor: c.red },
        dialogConfirmText: { ...type.small, color: '#FFFFFF', fontWeight: '800' },
      }),
    [c, isDark],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={s.backdrop} onPress={onCancel} accessibilityRole="button">
        <Pressable style={s.dialog} onPress={() => {}}>
          <Text style={s.dialogTitle}>{title}</Text>
          <Text style={s.dialogBody}>{body}</Text>
          <View style={s.dialogActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [s.dialogButton, s.dialogCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.dialogCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [s.dialogButton, pressed && { opacity: 0.85 }]}
            >
              {destructive ? (
                <View style={[s.dialogButtonFill, s.dialogButtonDanger]}>
                  <Text style={s.dialogConfirmText}>{confirmLabel}</Text>
                </View>
              ) : (
                <LinearGradient colors={c.gradient} style={s.dialogButtonFill}>
                  <Text style={s.dialogConfirmText}>{confirmLabel}</Text>
                </LinearGradient>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SettingsScreen({
  profile,
  dashboard,
  chatCount,
  onBack,
  onReconnect,
  onClearChat,
  onEraseData,
  onOpenPrivacy,
  onOpenHelp,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  chatCount: number;
  onBack: () => void;
  onReconnect: () => void;
  onClearChat: () => void;
  onEraseData: () => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
}) {
  const [dialog, setDialog] = useState<'clearChat' | 'eraseData' | 'reconnect' | null>(null);
  const { mode, setMode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const version = Constants.expoConfig?.version;
  const iconColor = isDark ? '#9E8CFF' : c.primary;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: FAB_CLEARANCE,
          gap: 8,
        },
        sectionLabel: {
          ...type.tiny,
          color: c.onDarkDim,
          textTransform: 'uppercase',
          marginTop: 14,
          marginLeft: 4,
        },
        card: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          paddingHorizontal: 16,
        },
        rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.darkBorder },
        sectionNote: {
          ...type.small,
          color: c.onDarkDim,
          fontSize: 11.5,
          lineHeight: 17,
          marginTop: 8,
          marginHorizontal: 4,
        },

        themeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          gap: 12,
        },
        themeLabel: { ...type.small, color: c.onDark, fontWeight: '700', fontSize: 14.5 },
        themeSwitch: {
          flexDirection: 'row',
          backgroundColor: c.surface1,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: c.darkBorder,
          padding: 3,
        },
        themeOption: {
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
        },
        themeOptionActive: { backgroundColor: c.primary },
        themeOptionText: { fontSize: 13, fontWeight: '700', color: c.onDarkSub },
        themeOptionTextActive: { color: '#FFFFFF' },
      }),
    [c],
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Settings" onBack={onBack} tone={tone} />

        {/* Appearance */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.themeRow}>
            <Text style={styles.themeLabel}>Theme</Text>
            <View style={styles.themeSwitch}>
              {(['light', 'dark'] as const).map((option) => {
                const active = mode === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setMode(option)}
                    style={({ pressed }) => [
                      styles.themeOption,
                      active && styles.themeOptionActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[styles.themeOptionText, active && styles.themeOptionTextActive]}
                    >
                      {option === 'light' ? 'Light' : 'Dark'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <Text style={styles.sectionNote}>
          Applies across the whole app and stays saved on this device.
        </Text>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          {/* Non-destructive: tapping shows the connected account card — the
              explicit row below is the only thing that ends the session. */}
          <ListRow
            tone={tone}
            icon={<LinkOutIcon size={19} color={iconColor} />}
            label="Instagram"
            value={username ? `@${username}` : 'Not connected'}
            onPress={onReconnect}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<RefreshIcon size={18} color={iconColor} />}
            label="Reconnect Instagram"
            value="Fresh login"
            onPress={() => setDialog('reconnect')}
          />
        </View>

        {/* Your data */}
        <Text style={styles.sectionLabel}>Your data</Text>
        <View style={styles.card}>
          <ListRow
            tone={tone}
            icon={<TrashIcon size={19} color={iconColor} />}
            label="Clear AI chat history"
            value={chatCount > 0 ? `${chatCount} message${chatCount === 1 ? '' : 's'}` : 'Empty'}
            onPress={() => setDialog('clearChat')}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<TrashIcon size={19} color={isDark ? '#FF8B8B' : c.red} />}
            label="Erase data on this device"
            onPress={() => setDialog('eraseData')}
            danger
          />
        </View>
        <Text style={styles.sectionNote}>
          Everything here is stored on this device only. Erasing removes your analyses, ideas,
          saved ideas and chat — your Instagram connection stays intact.
        </Text>

        {/* Help & legal */}
        <Text style={styles.sectionLabel}>Help & legal</Text>
        <View style={styles.card}>
          <ListRow
            tone={tone}
            icon={<HelpIcon size={19} color={iconColor} />}
            label="Help centre"
            value="FAQ, guides & assistant"
            onPress={onOpenHelp}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<DocIcon size={19} color={iconColor} />}
            label="Privacy Policy"
            value="How your data is handled"
            onPress={onOpenPrivacy}
          />
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <ListRow tone={tone} label="App" value="CreatorDNA" />
          {version ? (
            <>
              <View style={styles.rowDivider} />
              <ListRow tone={tone} label="Version" value={version} />
            </>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={dialog === 'clearChat'}
        title="Clear AI chat history?"
        body={`This removes all ${chatCount} chat message${chatCount === 1 ? '' : 's'} with the CreatorDNA AI from this device. Your analyses and ideas are not affected.`}
        confirmLabel="Clear chat"
        onConfirm={() => {
          setDialog(null);
          onClearChat();
        }}
        onCancel={() => setDialog(null)}
        c={c}
        isDark={isDark}
      />
      <ConfirmDialog
        visible={dialog === 'eraseData'}
        title="Erase data on this device?"
        body="This permanently removes your analyses, generated ideas, saved ideas and chat history from this browser. Instagram stays connected, and you can start fresh any time."
        confirmLabel="Erase everything"
        destructive
        onConfirm={() => {
          setDialog(null);
          onEraseData();
        }}
        onCancel={() => setDialog(null)}
        c={c}
        isDark={isDark}
      />
      <ConfirmDialog
        visible={dialog === 'reconnect'}
        title="Reconnect Instagram?"
        body={
          username
            ? `This signs this device out of @${username} and starts a fresh Instagram login. Your analyses, ideas and chat history stay untouched.`
            : 'This starts a fresh Instagram login. Your analyses, ideas and chat history stay untouched.'
        }
        confirmLabel="Reconnect"
        destructive
        onConfirm={() => {
          setDialog(null);
          onReconnect();
        }}
        onCancel={() => setDialog(null)}
        c={c}
        isDark={isDark}
      />
    </View>
  );
}
