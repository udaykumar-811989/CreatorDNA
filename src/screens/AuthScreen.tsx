import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DnaMark } from '../components/DnaMark';
import { BackIcon } from '../components/icons';
import { GradientButton } from '../components/ui';
import { colors, radius, type } from '../theme';

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
  const canSignIn = email.trim().length > 0 && password.length > 0 && !authLoading;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#070A1A', '#11132D', '#16142D']} style={StyleSheet.absoluteFill} />
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
          <BackIcon size={20} color={colors.onDark} />
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
              placeholderTextColor={colors.onDarkDim}
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
              placeholderTextColor={colors.onDarkDim}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070A1A' },
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
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginTop: 26, marginBottom: 26 },
  title: { ...type.h2, color: colors.onDark, marginTop: 16 },
  subtitle: {
    ...type.small,
    color: colors.onDarkSub,
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  form: { gap: 14 },
  field: { gap: 7 },
  label: {
    ...type.tiny,
    color: colors.onDarkSub,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 15,
    minHeight: 52,
    color: colors.onDark,
    fontSize: 15,
  },
  error: {
    ...type.small,
    color: '#FF9B9B',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: radius.sm,
    padding: 11,
    textAlign: 'center',
  },
  outline: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineLabel: { color: colors.onDark, fontSize: 15, fontWeight: '700' },
  link: {
    color: colors.onDarkSub,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
  },
});
