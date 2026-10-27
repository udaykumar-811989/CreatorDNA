import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BellIcon,
  ClockIcon,
  DocIcon,
  HelpIcon,
  LinkOutIcon,
  RefreshIcon,
  TrashIcon,
} from '../components/icons';
import { ListRow, ScreenHeader, Toggle } from '../components/ui';
import {
  NOTIFICATION_TOPICS,
  reminderLabel,
  type NotificationPrefs,
  type NotificationTopic,
} from '../lib/notifications/model';
import {
  PUSH_PROMPT,
  getPushPermission,
  onPushPermissionChange,
  requestPushPermission,
  type PushPermission,
} from '../lib/notifications/push';
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
          backgroundColor: 'rgba(13,46,107,0.45)',
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

// Two steppers instead of a picker widget: the setting is a single time, the
// controls stay reachable with one thumb, and nothing new is installed.
function ReminderDialog({
  visible,
  value,
  onSave,
  onCancel,
  c,
}: {
  visible: boolean;
  value: string;
  onSave: (next: string) => void;
  onCancel: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const [time, setTime] = useState(value);
  useEffect(() => {
    if (visible) {
      setTime(value);
    }
  }, [visible, value]);

  const parts = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = parts ? Number(parts[1]) : 20;
  const minute = parts ? Number(parts[2]) : 15;

  const stepHour = (delta: number): void => {
    setTime(`${String((hour + delta + 24) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };
  const stepMinute = (delta: number): void => {
    const total = (hour * 60 + minute + delta + 1440) % 1440;
    setTime(
      `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
    );
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(13,46,107,0.45)',
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
        title: { ...type.h4, color: c.onDark, fontSize: 17 },
        body: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
        stepper: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingVertical: 8,
        },
        stepperLabel: { ...type.small, color: c.onDark, fontWeight: '700', fontSize: 14 },
        stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        stepBtn: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        stepBtnText: { color: c.onDark, fontSize: 18, fontWeight: '800', lineHeight: 20 },
        stepperValue: {
          ...type.small,
          color: c.onDark,
          fontWeight: '800',
          fontSize: 15,
          minWidth: 34,
          textAlign: 'center',
        },
        preview: {
          ...type.small,
          color: c.onDarkSub,
          textAlign: 'center',
          backgroundColor: c.surface1,
          borderRadius: radius.sm,
          paddingVertical: 8,
          marginTop: 4,
        },
        actions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'flex-end' },
        cancel: {
          borderWidth: 1.5,
          borderColor: c.darkBorder,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 11,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
        },
        cancelText: { ...type.small, color: c.onDark, fontWeight: '800' },
        save: { borderRadius: radius.pill, overflow: 'hidden' },
        saveFill: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
          paddingHorizontal: 18,
        },
        saveText: { ...type.small, color: '#FFFFFF', fontWeight: '800' },
      }),
    [c],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button">
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.title}>Plan reminder time</Text>
          <Text style={styles.body}>
            When CreatorDNA reminds you about the content you planned for today.
          </Text>
          <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>Hour</Text>
            <View style={styles.stepperControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Earlier hour"
                onPress={() => stepHour(-1)}
                style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{hour}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Later hour"
                onPress={() => stepHour(1)}
                style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>Minutes</Text>
            <View style={styles.stepperControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer minutes"
                onPress={() => stepMinute(-15)}
                style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{String(minute).padStart(2, '0')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More minutes"
                onPress={() => stepMinute(15)}
                style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.preview}>{reminderLabel(time)}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onSave(time)}
              style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={c.gradient} style={styles.saveFill}>
                <Text style={styles.saveText}>Save</Text>
              </LinearGradient>
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
  notifPrefs,
  unreadNotifications,
  onBack,
  onReconnect,
  onClearChat,
  onEraseData,
  onOpenPrivacy,
  onOpenHelp,
  onToggleNotifMaster,
  onToggleNotifTopic,
  onSetNotifReminderTime,
  onNotifPushPermission,
  onOpenNotifications,
}: {
  profile: InstagramProfile | null;
  dashboard: InstagramDashboard | null;
  chatCount: number;
  notifPrefs: NotificationPrefs;
  unreadNotifications: number;
  onBack: () => void;
  onReconnect: () => void;
  onClearChat: () => void;
  onEraseData: () => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
  onToggleNotifMaster: (enabled: boolean) => void;
  onToggleNotifTopic: (topic: NotificationTopic, enabled: boolean) => void;
  onSetNotifReminderTime: (time: string) => void;
  onNotifPushPermission: (permission: PushPermission) => void;
  onOpenNotifications: () => void;
}) {
  const [dialog, setDialog] = useState<'clearChat' | 'eraseData' | 'reconnect' | 'push' | null>(
    null,
  );
  const [reminderOpen, setReminderOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission>(() => getPushPermission());
  // Re-read when the tab is focused again — the creator may have flipped the
  // permission in browser settings while CreatorDNA was in the background.
  useEffect(() => onPushPermissionChange(() => setPushPermission(getPushPermission())), []);

  const enablePush = async (): Promise<void> => {
    const result = await requestPushPermission();
    setPushPermission(result);
    onNotifPushPermission(result);
  };
  const pushValue: Record<PushPermission, string> = {
    granted: 'On',
    denied: 'Blocked by browser',
    default: 'Off',
    unsupported: 'Not available here',
  };
  const { mode, setMode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);
  const username = dashboard?.profile.username ?? profile?.username ?? null;
  const version = Constants.expoConfig?.version;
  const iconColor = c.primary;

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

        notifRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          paddingVertical: 13,
        },
        notifRowText: { flex: 1, gap: 3 },
        notifLabel: { ...type.small, color: c.onDark, fontWeight: '700', fontSize: 14.5 },
        notifLabelOff: { color: c.onDarkDim },
        notifHint: { ...type.tiny, color: c.onDarkDim, lineHeight: 15.5 },
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

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.notifRow}>
            <View style={styles.notifRowText}>
              <Text style={styles.notifLabel}>Master Notifications</Text>
              <Text style={styles.notifHint}>
                Off silences every optional category below.
              </Text>
            </View>
            <Toggle
              value={notifPrefs.master}
              onChange={onToggleNotifMaster}
              label="Master Notifications"
            />
          </View>
          {NOTIFICATION_TOPICS.map((topic) => (
            <View key={topic.key}>
              <View style={styles.rowDivider} />
              <View style={styles.notifRow}>
                <View style={styles.notifRowText}>
                  <Text
                    style={[styles.notifLabel, !notifPrefs.master && styles.notifLabelOff]}
                  >
                    {topic.label}
                  </Text>
                  <Text style={styles.notifHint}>{topic.hint}</Text>
                </View>
                <Toggle
                  value={notifPrefs.master && notifPrefs.topics[topic.key]}
                  disabled={!notifPrefs.master}
                  onChange={(next) => onToggleNotifTopic(topic.key, next)}
                  label={topic.label}
                />
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.sectionNote}>
          Critical Instagram connection and security messages always appear in-app, even with
          every switch above turned off.
        </Text>

        {/* Reminders & delivery */}
        <Text style={styles.sectionLabel}>Reminders & delivery</Text>
        <View style={styles.card}>
          <ListRow
            tone={tone}
            icon={<BellIcon size={19} color={iconColor} />}
            label="Notification history"
            value={unreadNotifications > 0 ? `${unreadNotifications} unread` : 'All caught up'}
            onPress={onOpenNotifications}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<ClockIcon size={19} color={iconColor} />}
            label="Plan reminder time"
            value={reminderLabel(notifPrefs.reminderTime)}
            onPress={() => setReminderOpen(true)}
          />
          <View style={styles.rowDivider} />
          <ListRow
            tone={tone}
            icon={<BellIcon size={19} color={iconColor} />}
            label="Browser notifications"
            value={pushValue[pushPermission]}
            onPress={() => setDialog('push')}
          />
        </View>
        <Text style={styles.sectionNote}>
          In-app notifications always work. Browser alerts only show while CreatorDNA is in the
          background, and only after you allow them.
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
            icon={<TrashIcon size={19} color={c.red} />}
            label="Erase data on this device"
            onPress={() => setDialog('eraseData')}
            danger
          />
        </View>
        <Text style={styles.sectionNote}>
          Everything here is stored on this device. Erasing removes your analyses, ideas,
          saved ideas, chat and notification history — your Instagram connection stays intact.
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
        body="This permanently removes your analyses, generated ideas, saved ideas, chat history and notification history from this browser and from your CreatorDNA account. Instagram stays connected, and you can start fresh any time."
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
      {/* Benefit first, permission second: the browser is only ever asked from
          this press, never when the app opens. */}
      <ConfirmDialog
        visible={dialog === 'push'}
        title={PUSH_PROMPT.title}
        body={
          pushPermission === 'granted'
            ? 'Browser notifications are already allowed for this site. CreatorDNA will alert you when something worth knowing happens while it is in the background.'
            : pushPermission === 'denied'
              ? 'Your browser is blocking notifications for this site. You can allow them again from its site settings — in-app notifications keep working either way.'
              : PUSH_PROMPT.body
        }
        confirmLabel={pushPermission === 'granted' ? 'Done' : PUSH_PROMPT.enable}
        onConfirm={() => {
          setDialog(null);
          void enablePush();
        }}
        onCancel={() => setDialog(null)}
        c={c}
        isDark={isDark}
      />
      <ReminderDialog
        visible={reminderOpen}
        value={notifPrefs.reminderTime}
        onSave={(next) => {
          setReminderOpen(false);
          onSetNotifReminderTime(next);
        }}
        onCancel={() => setReminderOpen(false)}
        c={c}
      />
    </View>
  );
}
