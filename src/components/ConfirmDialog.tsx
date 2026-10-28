import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, type } from '../theme';
import { useThemeColors } from '../themeContext';

/**
 * A confirmation for anything that cannot be undone.
 *
 * Deliberately its own component: a destructive action that relies on the user
 * remembering a keyboard shortcut, or on an alert that never renders on web,
 * is not a confirmation at all. The destructive button is the one that looks
 * dangerous, and it carries the exact action in its label.
 */
export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep it',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const c = useThemeColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View
          style={[
            s.sheet,
            { backgroundColor: c.darkCard, borderColor: destructive ? c.red : c.darkBorder },
          ]}
          accessibilityRole="alert"
        >
          <Text style={[s.title, { color: c.onDark }]}>{title}</Text>
          <Text style={[s.message, { color: c.onDarkSub }]}>{message}</Text>
          <View style={s.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              style={[s.cancel, { borderColor: c.darkBorder, backgroundColor: c.darkCard2 }]}
            >
              <Text style={[s.cancelLabel, { color: c.onDarkSub }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              style={[s.confirm, { backgroundColor: destructive ? c.red : c.primary }]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={s.confirmLabel}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,46,107,0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: 18,
    gap: 10,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  title: { ...type.h4 },
  message: { ...type.small, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancel: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelLabel: { ...type.small, fontWeight: '800' },
  confirm: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmLabel: { ...type.small, fontWeight: '800', color: '#FFFFFF' },
});
