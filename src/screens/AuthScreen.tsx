import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DnaMark } from '../components/DnaMark';
import { BackIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, PersonIcon } from '../components/icons';
import { Avatar } from '../components/ui';
import { useTheme, useThemeColors } from '../themeContext';
import { radius, type } from '../theme';

// Google's four-colour "G", inlined so the sign-in button matches the
// official lockup without shipping an image asset.
function GoogleGlyph({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

// The auth screen wears the brand mock's fixed night-purple palette — it is
// the app's front door in both themes, so it never flips to light.
const authBg = ['#1B0B44', '#251055', '#140931'] as const;
const authGlow = ['rgba(124,58,237,0.38)', 'rgba(124,58,237,0)'] as const;
const fieldBg = '#241750';
const fieldBorder = 'rgba(255,255,255,0.09)';
const subtle = '#A79FC9';
const accent = '#A78BFA';

export function AuthScreen({
  onBack,
  onSignIn,
  onSignUp,
  onGoogleSignIn,
  formMode,
  onFormModeChange,
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
  onSignUp: (name: string, email: string, password: string) => void;
  // Email/password is always available; Google is a one-liner that App turns
  // into Supabase's OAuth redirect (or a clear in-app message where the
  // platform can't open it).
  onGoogleSignIn: () => void;
  // Sign up asks for a name; Log in does not. The mode lives in App so the
  // entry point decides which of the two opens first. (Named `formMode`
  // because `mode` is already the theme's light/dark value here.)
  formMode: 'login' | 'signup';
  onFormModeChange: (mode: 'login' | 'signup') => void;
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
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Height of the open keyboard. Android resizes the window (adjustResize) but
  // never scrolls the focused field clear of the keyboard, so the form pads its
  // bottom by this much instead. iOS is lifted by the KeyboardAvoidingView.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const onHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const isSignUp = formMode === 'signup';
  const canSubmit = isSignUp
    ? name.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length > 0 &&
      !authLoading
    : email.trim().length > 0 && password.length > 0 && !authLoading;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: '#140931' },
        keyboardPad: { flex: 1 },
        content: {
          flexGrow: 1,
          paddingHorizontal: 26,
          paddingTop: 18,
          paddingBottom: 34,
        },
        backButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        header: { alignItems: 'center', marginTop: 14, marginBottom: 24 },
        logoHalo: {
          width: 116,
          height: 116,
          borderRadius: 58,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(139,92,246,0.16)',
          borderWidth: 1,
          borderColor: 'rgba(167,139,250,0.35)',
        },
        wordmark: {
          marginTop: 18,
          fontSize: 33,
          fontWeight: '800',
          letterSpacing: 0.4,
          color: '#FFFFFF',
        },
        dna: { color: accent },
        tagline: { marginTop: 6, fontSize: 15, color: '#B7AFD9' },
        pill: {
          flexDirection: 'row',
          gap: 4,
          backgroundColor: 'rgba(255,255,255,0.07)',
          borderRadius: 999,
          padding: 4,
          marginBottom: 22,
        },
        segment: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
        },
        segmentActive: { backgroundColor: '#7159E1' },
        segmentText: { fontSize: 15.5, fontWeight: '700', color: subtle },
        segmentTextActive: { color: '#FFFFFF' },
        form: { gap: 13 },
        field: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          backgroundColor: fieldBg,
          borderWidth: 1,
          borderColor: fieldBorder,
          borderRadius: 14,
          paddingHorizontal: 15,
          minHeight: 54,
        },
        input: {
          flex: 1,
          color: '#FFFFFF',
          fontSize: 15,
          paddingVertical: 14,
        },
        eyePress: { padding: 4 },
        submit: {
          borderRadius: 14,
          overflow: 'hidden',
          marginTop: 4,
        },
        submitInner: {
          minHeight: 54,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        submitLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
        submitDisabled: { opacity: 0.55 },
        error: {
          ...type.small,
          color: '#FFB4B4',
          backgroundColor: 'rgba(255,82,82,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(255,82,82,0.3)',
          borderRadius: radius.sm,
          padding: 11,
          textAlign: 'center',
        },
        divider: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginVertical: 3,
        },
        dividerLine: {
          flex: 1,
          height: StyleSheet.hairlineWidth,
          backgroundColor: 'rgba(255,255,255,0.16)',
        },
        dividerText: { color: '#9B93BE', fontSize: 13.5, fontWeight: '600' },
        google: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          minHeight: 54,
          borderRadius: 14,
          backgroundColor: fieldBg,
          borderWidth: 1,
          borderColor: fieldBorder,
        },
        googleLabel: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
        secondaryLinks: { alignItems: 'center', gap: 2, marginTop: 6 },
        link: {
          color: subtle,
          fontSize: 14,
          fontWeight: '600',
          textAlign: 'center',
          paddingVertical: 7,
        },
        toggle: {
          marginTop: 18,
          textAlign: 'center',
          color: '#B7AFD9',
          fontSize: 14.5,
        },
        toggleBold: { color: '#FFFFFF', fontWeight: '700' },
        savedWrap: { marginBottom: 18, gap: 10 },
        savedTitle: {
          ...type.tiny,
          color: subtle,
          textTransform: 'uppercase',
          marginBottom: 2,
        },
        savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        savedAccount: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          borderColor: fieldBorder,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        savedIdentity: { flex: 1 },
        savedHandle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
        savedEmail: { color: subtle, fontSize: 12.5, marginTop: 2 },
        savedGo: { color: subtle, fontSize: 17, fontWeight: '700' },
        savedForget: {
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.08)',
        },
        savedForgetGlyph: { color: subtle, fontSize: 12, fontWeight: '700' },
        savedHint: {
          ...type.tiny,
          color: '#8B82B8',
          textAlign: 'center',
          marginTop: 2,
        },
      }),
    [c, isDark],
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={authBg} style={StyleSheet.absoluteFill} />
      {/* The mock's centre glow sits above the base wash. */}
      <LinearGradient
        colors={authGlow}
        start={{ x: 0.5, y: 0.1 }}
        end={{ x: 0.5, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />
      {/* On iOS the keyboard pads the view up; on Android the window already
          resizes, so the ScrollView itself carries the extra bottom room. */}
      <KeyboardAvoidingView
        style={styles.keyboardPad}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom:
                34 + (Platform.OS === 'android' ? keyboardHeight : 0),
            },
          ]}
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
            <BackIcon size={20} color="#FFFFFF" />
          </Pressable>

          <View style={styles.header}>
            <View style={styles.logoHalo}>
              <DnaMark size={72} />
            </View>
            <Text style={styles.wordmark}>
              Creator<Text style={styles.dna}>DNA</Text>
            </Text>
            <Text style={styles.tagline}>Your AI Creator Coach</Text>
          </View>

          {/* Login | Sign Up — the mock's single switch between both forms. */}
          <View style={styles.pill} accessibilityRole="tablist">
            {(['login', 'signup'] as const).map((segment) => {
              const active = formMode === segment;
              return (
                <Pressable
                  key={segment}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={segment === 'login' ? 'Login' : 'Sign Up'}
                  disabled={authLoading}
                  onPress={() => onFormModeChange(segment)}
                  style={({ pressed }) => [
                    styles.segment,
                    active && styles.segmentActive,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {segment === 'login' ? 'Login' : 'Sign Up'}
                  </Text>
                </Pressable>
              );
            })}
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
                        {account.instagramUsername && !account.email.startsWith('ig:')
                          ? account.email
                          : 'Tap to sign in'}
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
            {isSignUp ? (
              <View style={styles.field}>
                <PersonIcon size={19} color="#8B82B8" />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder="Enter your name"
                  placeholderTextColor="#8B82B8"
                  accessibilityLabel="Name"
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <MailIcon size={19} color="#8B82B8" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="Enter your email"
                placeholderTextColor="#8B82B8"
                accessibilityLabel="Email"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <LockIcon size={19} color="#8B82B8" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Enter your password"
                placeholderTextColor="#8B82B8"
                accessibilityLabel="Password"
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((shown) => !shown)}
                hitSlop={8}
                style={({ pressed }) => [styles.eyePress, pressed && { opacity: 0.6 }]}
              >
                {showPassword ? (
                  <EyeOffIcon size={19} color="#8B82B8" />
                ) : (
                  <EyeIcon size={19} color="#8B82B8" />
                )}
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => {
                void Promise.resolve(
                  isSignUp
                    ? onSignUp(name, email, password)
                    : onSignIn(email, password),
                ).finally(() => setPassword(''));
              }}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && canSubmit && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={['#7C5CE8', '#5B3FD1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitInner}
              >
                <Text style={styles.submitLabel}>
                  {authLoading
                    ? isSignUp
                      ? 'Creating account…'
                      : 'Signing in…'
                    : isSignUp
                      ? 'Sign Up'
                      : 'Login'}
                </Text>
                {!authLoading ? <Text style={styles.submitLabel}>→</Text> : null}
              </LinearGradient>
            </Pressable>

            {authError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {authError}
              </Text>
            ) : null}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={authLoading}
              onPress={onGoogleSignIn}
              style={({ pressed }) => [styles.google, pressed && { opacity: 0.75 }]}
            >
              <GoogleGlyph size={20} />
              <Text style={styles.googleLabel}>Continue with Google</Text>
            </Pressable>

            <View style={styles.secondaryLinks}>
              <Pressable
                accessibilityRole="button"
                onPress={onConnectInstagram}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.link}>Connect Instagram instead</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onContinueWithoutInstagram}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.link}>Continue without Instagram</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={authLoading}
              onPress={() => onFormModeChange(isSignUp ? 'login' : 'signup')}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.toggle}>
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <Text style={styles.toggleBold}>Log in</Text>
                  </>
                ) : (
                  <>
                    Don't have an account?{' '}
                    <Text style={styles.toggleBold}>Sign Up</Text>
                  </>
                )}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
