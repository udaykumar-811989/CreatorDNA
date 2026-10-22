import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../themeContext';
import { radius, type } from '../theme';
import { Avatar, GradientButton } from './ui';

/**
 * "Save this account?" prompt shown once after a password sign-in — saving
 * for one-tap re-login is always an explicit choice (Save / Not now).
 */
export function SaveAccountPrompt({
  email,
  onSave,
  onNotNow,
}: {
  email: string;
  onSave: () => void;
  onNotNow: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makePromptStyles(c), [c]);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onNotNow} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Save this account?</Text>
          <Text style={styles.body}>
            Sign in to {email} next time with one tap — no password needed, and
            your Instagram connection comes back with it. Saved only on this
            device.
          </Text>
          <GradientButton label="Save" onPress={onSave} />
          <Pressable
            accessibilityRole="button"
            onPress={onNotNow}
            style={({ pressed }) => [styles.notNow, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.notNowLabel}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Saved-accounts switcher — opens from a long-press on the Profile tab.
 * Tapping a row swaps straight into that account (no password).
 */
export function SavedAccountsSheet({
  visible,
  accounts,
  onPick,
  onForget,
  onClose,
}: {
  visible: boolean;
  accounts: Array<{
    email: string;
    instagramUsername: string | null;
    instagramPictureUrl: string | null;
  }>;
  onPick: (email: string) => void;
  onForget: (email: string) => void;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeSheetStyles(c), [c]);
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Saved accounts</Text>
          <Text style={styles.subtitle}>Tap to switch — no password needed.</Text>

          {accounts.length === 0 ? (
            <Text style={styles.empty}>
              No saved accounts yet. Choose “Save” at the sign-in prompt and the
              account will appear here.
            </Text>
          ) : (
            accounts.map((account) => (
              <View key={account.email} style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onPick(account.email)}
                  style={({ pressed }) => [styles.account, pressed && { opacity: 0.7 }]}
                >
                  <Avatar
                    uri={account.instagramPictureUrl}
                    name={account.instagramUsername ?? account.email}
                    size={38}
                  />
                  <View style={styles.identity}>
                    <Text style={styles.handleText} numberOfLines={1}>
                      {account.instagramUsername ? `@${account.instagramUsername}` : account.email}
                    </Text>
                    <Text style={styles.emailText} numberOfLines={1}>
                      {account.instagramUsername ? account.email : 'Tap to sign in'}
                    </Text>
                  </View>
                  <Text style={styles.go}>→</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Forget ${account.email}`}
                  onPress={() => onForget(account.email)}
                  hitSlop={10}
                  style={({ pressed }) => [styles.forget, pressed && { opacity: 0.5 }]}
                >
                  <Text style={styles.forgetGlyph}>✕</Text>
                </Pressable>
              </View>
            ))
          )}

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makePromptStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(9,10,26,0.62)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 26,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: c.pageBg,
      borderRadius: radius.md + 4,
      borderWidth: 1,
      borderColor: c.darkBorder,
      padding: 22,
      gap: 14,
    },
    title: { ...type.h4, color: c.onDark, textAlign: 'center' },
    body: {
      ...type.small,
      color: c.onDarkSub,
      textAlign: 'center',
      lineHeight: 19,
      fontSize: 13.5,
    },
    notNow: { alignItems: 'center', paddingVertical: 8 },
    notNowLabel: { color: c.onDarkSub, fontSize: 14.5, fontWeight: '700' },
  });
}

function makeSheetStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(9,10,26,0.62)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.pageBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: c.darkBorder,
      padding: 20,
      paddingBottom: 30,
      gap: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.darkBorder,
      marginBottom: 4,
    },
    title: { ...type.h4, color: c.onDark, textAlign: 'center' },
    subtitle: { ...type.small, color: c.onDarkSub, textAlign: 'center', marginTop: -4 },
    empty: {
      ...type.small,
      color: c.onDarkDim,
      textAlign: 'center',
      lineHeight: 19,
      paddingVertical: 14,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    account: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface1,
      borderWidth: 1,
      borderColor: c.darkBorder,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    identity: { flex: 1 },
    handleText: { color: c.onDark, fontSize: 15, fontWeight: '700' },
    emailText: { color: c.onDarkSub, fontSize: 12.5, marginTop: 2 },
    go: { color: c.onDarkSub, fontSize: 17, fontWeight: '700' },
    forget: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface2,
    },
    forgetGlyph: { color: c.onDarkSub, fontSize: 12, fontWeight: '700' },
    closeButton: {
      marginTop: 6,
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.outlineSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeLabel: { color: c.onDark, fontSize: 15, fontWeight: '700' },
  });
}
