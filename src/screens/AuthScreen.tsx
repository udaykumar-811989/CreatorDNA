import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { BackIcon } from '../components/icons';
import { GradientButton } from '../components/ui';
import { useTheme, useThemeColors } from '../themeContext';
import { radius, type } from '../theme';

export function AuthScreen({
  onBack,
  onSignIn,
  authLoading,
  authError,
  onConnectInstagram,
  onContinueWithoutInstagram,
}: {
  onBack: () => void;
  onSignIn: (email: string, password: string) => void;
  authLoading: boolean;
  authError: string | null;
  onConnectInstagram: () => void;
  onContinueWithoutInstagram: () => void;
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
