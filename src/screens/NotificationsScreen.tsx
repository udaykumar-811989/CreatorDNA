import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NotificationIcon } from '../components/NotificationIcon';
import { TrashIcon } from '../components/icons';
import { EmptyState, ScreenHeader } from '../components/ui';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPE_META,
  groupNotifications,
  notificationTimeLabel,
  type CreatorNotification,
  type NotificationCategory,
  type NotificationPrefs,
} from '../lib/notifications/model';
import {
  PUSH_PROMPT,
  getPushPermission,
  onPushPermissionChange,
  requestPushPermission,
  type PushPermission,
} from '../lib/notifications/push';
import { FAB_CLEARANCE, radius, type } from '../theme';
import { useTheme, useThemeColors } from '../themeContext';

// The notification history: grouped, filterable, and honest about what it is
// showing. Unread rows are visually heavier than read ones, every row can be
// dismissed, and tapping one deep-links to the screen (or the specific
// analysis) it is about.

type Filter = 'all' | NotificationCategory;

export function NotificationsScreen({
  notifications,
  prefs,
  onBack,
  onOpen,
  onMarkAllRead,
  onDelete,
  onEnablePush,
  onDismissPushPrompt,
  onOpenSettings,
}: {
  notifications: readonly CreatorNotification[];
  prefs: NotificationPrefs;
  onBack: () => void;
  onOpen: (item: CreatorNotification) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  onEnablePush: (permission: PushPermission) => void;
  onDismissPushPrompt: () => void;
  onOpenSettings: () => void;
}) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);
  const [filter, setFilter] = useState<Filter>('all');
  const [permission, setPermission] = useState<PushPermission>(() => getPushPermission());

  // Browser settings can change outside the app; re-read when the tab is
  // focused again so the prompt never asks for something already answered.
  useEffect(() => onPushPermissionChange(() => setPermission(getPushPermission())), []);

  const unread = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );
  const filtered = useMemo(
    () =>
      filter === 'all'
        ? notifications
        : notifications.filter((item) => item.category === filter),
    [notifications, filter],
  );
  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  // Never re-ask after "Not Now", and never ask a browser that has already
  // decided — the in-app list does not depend on the answer either way.
  const showPrompt = permission === 'default' && !prefs.pushPromptDismissed;

  const handleEnable = async (): Promise<void> => {
    const result = await requestPushPermission();
    setPermission(result);
    onEnablePush(result);
  };

  const s = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: FAB_CLEARANCE + 12,
          gap: 14,
        },
        markAll: { ...type.small, color: c.primary, fontWeight: '800', fontSize: 13 },

        chipTrack: { gap: 8, paddingVertical: 2, paddingRight: 8 },
        chip: {
          paddingHorizontal: 15,
          paddingVertical: 9,
          borderRadius: radius.pill,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        chipActive: { backgroundColor: c.primary, borderColor: c.primary },
        chipLabel: { ...type.small, color: c.onDarkSub, fontWeight: '700', fontSize: 13 },
        chipLabelActive: { color: '#FFFFFF' },

        groupLabel: {
          ...type.tiny,
          color: c.onDarkDim,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginTop: 4,
          marginLeft: 2,
        },
        group: { gap: 10 },

        item: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 14,
          gap: 12,
        },
        itemUnread: {
          backgroundColor: c.darkCard2,
          borderColor: c.primary,
          borderLeftWidth: 3,
        },
        itemMain: { flexDirection: 'row', gap: 12 },
        itemBody: { flex: 1, gap: 5 },
        itemTitle: { ...type.bodyBold, color: c.onDarkSub, fontSize: 14.5, lineHeight: 19 },
        itemTitleUnread: { color: c.onDark, fontWeight: '800' },
        itemMessage: { ...type.small, color: c.onDarkSub, fontSize: 13, lineHeight: 18.5 },
        itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
        itemTime: { ...type.tiny, color: c.onDarkDim },
        readTag: { ...type.tiny, color: c.onDarkDim, fontStyle: 'italic' },
        unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.primary },
        itemFooter: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.darkBorder,
          paddingTop: 10,
        },
        actionBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.primarySoft,
        },
        actionLabel: { ...type.small, color: c.primary, fontWeight: '800', fontSize: 13 },
        dismissBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },

        prompt: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.primary,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 8,
        },
        promptTitle: { ...type.h4, color: c.onDark, fontSize: 16.5 },
        promptBody: { ...type.small, color: c.onDarkSub, fontSize: 13.5, lineHeight: 19 },
        promptActions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
        promptEnable: {
          backgroundColor: c.primary,
          borderRadius: radius.pill,
          paddingHorizontal: 18,
          paddingVertical: 11,
        },
        promptEnableText: { ...type.small, color: '#FFFFFF', fontWeight: '800' },
        promptDismiss: {
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: c.darkBorder,
          paddingHorizontal: 18,
          paddingVertical: 10,
        },
        promptDismissText: { ...type.small, color: c.onDark, fontWeight: '700' },

        prefsLink: {
          alignItems: 'center',
          paddingVertical: 12,
          borderRadius: radius.md,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        prefsLinkText: { ...type.small, color: c.onDarkSub, fontWeight: '700' },
      }),
    [c],
  );

  const filterLabel =
    NOTIFICATION_CATEGORIES.find((entry) => entry.key === filter)?.label ?? 'All';

  return (
    <View style={s.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Notifications"
          subtitle={
            unread > 0
              ? `${unread} unread`
              : notifications.length > 0
                ? 'All read'
                : 'Nothing new'
          }
          onBack={onBack}
          tone={tone}
          right={
            unread > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark all notifications as read"
                onPress={onMarkAllRead}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Text style={s.markAll}>Mark all read</Text>
              </Pressable>
            ) : null
          }
        />

        {showPrompt ? (
          <View style={s.prompt}>
            <Text style={s.promptTitle}>{PUSH_PROMPT.title}</Text>
            <Text style={s.promptBody}>{PUSH_PROMPT.body}</Text>
            <View style={s.promptActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleEnable()}
                style={({ pressed }) => [s.promptEnable, pressed && { opacity: 0.85 }]}
              >
                <Text style={s.promptEnableText}>{PUSH_PROMPT.enable}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onDismissPushPrompt}
                style={({ pressed }) => [s.promptDismiss, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.promptDismissText}>{PUSH_PROMPT.dismiss}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipTrack}
        >
          {NOTIFICATION_CATEGORIES.map((entry) => {
            const active = filter === entry.key;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(entry.key)}
                style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { opacity: 0.8 }]}
              >
                <Text style={[s.chipLabel, active && s.chipLabelActive]}>{entry.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <EmptyState
            tone={tone}
            glyph={notifications.length === 0 ? '✨' : '🔍'}
            title={
              notifications.length === 0
                ? 'You’re all caught up ✨'
                : `Nothing in ${filterLabel} yet`
            }
            hint={
              notifications.length === 0
                ? 'CreatorDNA will notify you when there’s something worth knowing.'
                : 'Notifications for this category will appear here as soon as they happen.'
            }
            actionLabel={notifications.length === 0 ? 'Notification settings' : 'Show all'}
            onAction={
              notifications.length === 0 ? onOpenSettings : () => setFilter('all')
            }
          />
        ) : (
          groups.map((group) => (
            <View key={group.key} style={s.group}>
              <Text style={s.groupLabel}>{group.label}</Text>
              {group.items.map((item) => {
                const meta = NOTIFICATION_TYPE_META[item.type];
                const showAction = Boolean(item.actionLabel && item.actionTarget);
                return (
                  <View key={item.id} style={[s.item, !item.isRead && s.itemUnread]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open notification: ${item.title}`}
                      onPress={() => onOpen(item)}
                      style={s.itemMain}
                    >
                      <NotificationIcon name={meta.icon} />
                      <View style={s.itemBody}>
                        <Text style={[s.itemTitle, !item.isRead && s.itemTitleUnread]}>
                          {item.title}
                        </Text>
                        {item.message ? <Text style={s.itemMessage}>{item.message}</Text> : null}
                        <View style={s.itemMeta}>
                          <Text style={s.itemTime}>{notificationTimeLabel(item.createdAt)}</Text>
                          {item.isRead ? (
                            <Text style={s.readTag}>Read</Text>
                          ) : (
                            <>
                              <View style={s.unreadDot} />
                              <Text style={s.itemTime}>Unread</Text>
                            </>
                          )}
                        </View>
                      </View>
                    </Pressable>
                    <View style={s.itemFooter}>
                      {showAction ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onOpen(item)}
                          style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.75 }]}
                        >
                          <Text style={s.actionLabel}>{item.actionLabel}</Text>
                        </Pressable>
                      ) : (
                        <View />
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove notification: ${item.title}`}
                        onPress={() => onDelete(item.id)}
                        hitSlop={10}
                        style={({ pressed }) => [s.dismissBtn, pressed && { opacity: 0.7 }]}
                      >
                        <TrashIcon size={16} color={c.onDarkDim} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {notifications.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenSettings}
            style={({ pressed }) => [s.prefsLink, pressed && { opacity: 0.75 }]}
          >
            <Text style={s.prefsLinkText}>Notification preferences</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
