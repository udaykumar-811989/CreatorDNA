import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { BackIcon } from '../components/icons';
import { Avatar, GradientButton } from '../components/ui';
import { useTheme, useThemeColors } from '../themeContext';
import { radius, type } from '../theme';

export function AuthScreen({
  onBack,
  onSignIn,
  authLoading,
  authError,
  onConnectInstagram,
  onContinueWithoutInstagram,
  savedAccounts,
  onLoginSaved,
  onForgetSavedAccount,
}: {
  onBack: () => void;
  onSignIn: (email: string, password: string) => void;
  authLoading: boolean;
  authError: string | null;
  onConnectInstagram: () => void;
  onContinueWithoutInstagram: () => void;
  // Accounts remembered on this device for one-tap re-login and swapping.
  savedAccounts: Array<{
    email: string;
    instagramUsername: string | null;
    instagramPictureUrl: string | null;
  }>;
  onLoginSaved: (email: string) => void;
  onForgetSavedAccount: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const canSignIn = email.trim().length > 0 && password.length > 0 && !authLoading;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.pageBg },
        content: {
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 18,
          paddingBottom: 34,
        },
        backButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: c.surface2,
          borderWidth: isDark ? 0 : 1,
          borderColor: c.darkBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        header: { alignItems: 'center', marginTop: 26, marginBottom: 26 },
        title: { ...type.h2, color: c.onDark, marginTop: 16 },
        subtitle: {
          ...type.small,
          color: c.onDarkSub,
          marginTop: 8,
          textAlign: 'center',
          fontSize: 14,
        },
        form: { gap: 14 },
        field: { gap: 7 },
        label: {
          ...type.tiny,
          color: c.onDarkSub,
          textTransform: 'uppercase',
        },
        input: {
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.sm + 2,
          paddingHorizontal: 15,
          minHeight: 52,
          color: c.onDark,
          fontSize: 15,
        },
        error: {
          ...type.small,
          color: isDark ? '#FF9B9B' : c.red,
          backgroundColor: c.redSoft,
          borderRadius: radius.sm,
          padding: 11,
          textAlign: 'center',
        },
        outline: {
          minHeight: 52,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: c.outlineSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        outlineLabel: { color: c.onDark, fontSize: 15, fontWeight: '700' },
        savedWrap: { marginBottom: 22, gap: 10 },
        savedTitle: {
          ...type.tiny,
          color: c.onDarkSub,
          textTransform: 'uppercase',
          marginBottom: 2,
        },
        savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        savedAccount: {
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
        savedIdentity: { flex: 1 },
        savedHandle: { color: c.onDark, fontSize: 15, fontWeight: '700' },
        savedEmail: { color: c.onDarkSub, fontSize: 12.5, marginTop: 2 },
        savedGo: { color: c.onDarkSub, fontSize: 17, fontWeight: '700' },
        savedForget: {
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.surface2,
        },
        savedForgetGlyph: { color: c.onDarkSub, fontSize: 12, fontWeight: '700' },
        savedHint: {
          ...type.tiny,
          color: c.onDarkDim,
          textAlign: 'center',
          marginTop: 2,
        },
        link: {
          color: c.onDarkSub,
          fontSize: 14,
          fontWeight: '600',
          textAlign: 'center',
          paddingVertical: 6,
        },
      }),
    [c, isDark],
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={c.entryBg} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
        >
          <BackIcon size={20} color={c.onDark} />
        </Pressable>

        <View style={styles.header}>
          <DnaMark size={56} />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to continue your CreatorDNA progress.
          </Text>
        </View>

        {savedAccounts.length > 0 ? (
          <View style={styles.savedWrap}>
            <Text style={styles.savedTitle}>Continue as</Text>
            {savedAccounts.map((account) => (
              <View key={account.email} style={styles.savedRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={authLoading}
                  onPress={() => onLoginSaved(account.email)}
                  style={({ pressed }) => [
                    styles.savedAccount,
                    authLoading && { opacity: 0.6 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Avatar
                    uri={account.instagramPictureUrl}
                    name={account.instagramUsername ?? account.email}
                    size={38}
                  />
                  <View style={styles.savedIdentity}>
                    <Text style={styles.savedHandle} numberOfLines={1}>
                      {account.instagramUsername ? `@${account.instagramUsername}` : account.email}
                    </Text>
                    <Text style={styles.savedEmail} numberOfLines={1}>
                      {account.instagramUsername
                        ? account.email
                        : 'Tap to sign in — no password needed'}
                    </Text>
                  </View>
                  <Text style={styles.savedGo}>{authLoading ? '…' : '→'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Forget ${account.email}`}
                  onPress={() => onForgetSavedAccount(account.email)}
                  hitSlop={10}
                  style={({ pressed }) => [styles.savedForget, pressed && { opacity: 0.5 }]}
                >
                  <Text style={styles.savedForgetGlyph}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Text style={styles.savedHint}>
              Saved on this device — tap to swap accounts without typing a password.
            </Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={c.onDarkDim}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={c.onDarkDim}
              style={styles.input}
            />
          </View>

          <GradientButton
            label={authLoading ? 'Signing in…' : 'Sign in'}
            loading={authLoading}
            disabled={!canSignIn}
            onPress={() => {
              void Promise.resolve(onSignIn(email, password)).finally(() => setPassword(''));
            }}
          />

          {authError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {authError}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={onConnectInstagram}
            style={({ pressed }) => [styles.outline, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.outlineLabel}>Connect Instagram</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onContinueWithoutInstagram}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={styles.link}>Continue without Instagram</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
