import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinkOutIcon, RefreshIcon, TrashIcon } from '../components/icons';
import { ListRow, ScreenHeader } from '../components/ui';
import type { InstagramDashboard, InstagramProfile } from '../services/instagramDashboard';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button">
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogBody}>{body}</Text>
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.dialogButton, styles.dialogCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [styles.dialogButton, pressed && { opacity: 0.85 }]}
            >
              {destructive ? (
                <View style={[styles.dialogButtonFill, styles.dialogButtonDanger]}>
                  <Text style={styles.dialogConfirmText}>{confirmLabel}</Text>
                </View>
              ) : (
                <LinearGradient colors={colors.gradient} style={styles.dialogButtonFill}>
                  <Text style={styles.dialogConfirmText}>{confirmLabel}</Text>
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
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  chatCount: number;
  onBack: () => void;
  onReconnect: () => void;
  onClearChat: () => void;
  onEraseData: () => void;
}) {
  const [dialog, setDialog] = useState<'clearChat' | 'eraseData' | null>(null);
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const version = Constants.expoConfig?.version;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[colors.darkBg, colors.darkBg2, colors.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Settings" onBack={onBack} tone="dark" />

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <ListRow
            tone="dark"
            icon={<LinkOutIcon size={19} color="#9E8CFF" />}
            label="Instagram"
            value={username ? `@${username}` : 'Not connected'}
            onPress={onReconnect}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone="dark"
            icon={<RefreshIcon size={18} color="#9E8CFF" />}
            label="Reconnect Instagram"
            value="Fresh login"
            onPress={onReconnect}
          />
        </View>

        {/* Your data */}
        <Text style={styles.sectionLabel}>Your data</Text>
        <View style={styles.card}>
          <ListRow
            tone="dark"
            icon={<TrashIcon size={19} color="#9E8CFF" />}
            label="Clear AI chat history"
            value={chatCount > 0 ? `${chatCount} message${chatCount === 1 ? '' : 's'}` : 'Empty'}
            onPress={() => setDialog('clearChat')}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone="dark"
            icon={<TrashIcon size={19} color="#FF8B8B" />}
            label="Erase data on this device"
            onPress={() => setDialog('eraseData')}
            danger
          />
        </View>
        <Text style={styles.sectionNote}>
          Everything here is stored on this device only. Erasing removes your analyses, ideas,
          saved ideas and chat — your Instagram connection stays intact.
        </Text>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <ListRow tone="dark" label="App" value="CreatorDNA" />
          {version ? (
            <>
              <View style={styles.rowDivider} />
              <ListRow tone="dark" label="Version" value={version} />
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: FAB_CLEARANCE,
    gap: 8,
  },

  sectionLabel: {
    ...type.tiny,
    color: colors.onDarkDim,
    textTransform: 'uppercase',
    marginTop: 14,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.darkCard,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: radius.md + 2,
    paddingHorizontal: 16,
  },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.darkBorder },
  sectionNote: {
    ...type.small,
    color: colors.onDarkDim,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 8,
    marginHorizontal: 4,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,7,18,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.darkCard,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: radius.md + 4,
    padding: 20,
    gap: 10,
  },
  dialogTitle: { ...type.h4, color: colors.onDark, fontSize: 17 },
  dialogBody: { ...type.small, color: colors.onDarkSub, lineHeight: 19 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'flex-end' },
  dialogButton: { borderRadius: radius.pill, overflow: 'hidden', minWidth: 108 },
  dialogCancel: {
    borderWidth: 1.5,
    borderColor: colors.darkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  dialogCancelText: { ...type.small, color: colors.onDark, fontWeight: '800' },
  dialogButtonFill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  dialogButtonDanger: { backgroundColor: colors.red },
  dialogConfirmText: { ...type.small, color: '#FFFFFF', fontWeight: '800' },
});
