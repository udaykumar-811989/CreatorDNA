import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackIcon, EyeIcon, EyeOffIcon } from '../components/icons';
import { Avatar } from '../components/ui';

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
        d="M46.98 24.55c0-1.57-.14-3.09-.4-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
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

// The login hero shows the app's own logo (assets/icon.png) — the same
// artwork as the store icon — inside a glass halo, and the halo is the
// tappable "back home" control.

// Forest photo + glass card login (reference: phone layout, desktop = the
// same content in a centered compact card). The palette is fixed — this is
// the front door in both themes — every handler below is unchanged.
const fieldBg = 'rgba(4,14,9,0.42)';
const fieldBorder = 'rgba(255,255,255,0.18)';
const green = '#3AD07E';
const greenDeep = '#16A85E';

export function AuthScreen({
  onBack,
  onSignIn,
  onSignUp,
  onGoogleSignIn,
  formMode,
  onFormModeChange,
  authLoading,
  authError,
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

  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const isSignUp = formMode === 'signup';
  const canSubmit = isSignUp
    ? name.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length > 0 &&
      !authLoading
    : email.trim().length > 0 && password.length > 0 && !authLoading;

  const styles = useMemo(() => {
    const s = StyleSheet.create({
      screen: { flex: 1, backgroundColor: '#07130D' },
      // width/height 100% + object-fit: on web an absolutely-positioned <img>
      // keeps its intrinsic size when only left/right are set, and the
      // resizeMode prop does not reach computed object-fit.
      bg: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      },
      keyboardPad: { flex: 1 },
      topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 6,
        zIndex: 2,
      },
      backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
      },
      pill: {
        flexDirection: 'row',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 999,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
      },
      segment: {
        paddingVertical: 9,
        paddingHorizontal: 20,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
      },
      segmentActive: { backgroundColor: '#FFFFFF' },
      segmentText: { fontSize: 14.5, fontWeight: '600', color: 'rgba(255,255,255,0.78)' },
      segmentTextActive: { color: '#0D2A1B', fontWeight: '700' },
      scroll: { flexGrow: 1 },
      column: {
        width: '100%',
        maxWidth: 460,
        alignSelf: 'center',
        paddingHorizontal: 24,
        paddingTop: 18,
        paddingBottom: 34,
      },
      header: { alignItems: 'center', marginBottom: 22 },
      logoHalo: {
        width: 104,
        height: 104,
        borderRadius: 52,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.36)',
      },
      logoImg: {
        width: 64,
        height: 64,
        borderRadius: 32,
      },
      wordmark: {
        marginTop: 16,
        fontSize: 31,
        fontWeight: '800',
        letterSpacing: 0.3,
        color: '#FFFFFF',
      },
      tagline: { marginTop: 6, fontSize: 14.5, color: 'rgba(255,255,255,0.72)' },
      card: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        borderRadius: 26,
        padding: 22,
      },
      savedWrap: { marginBottom: 16, gap: 10 },
      savedTitle: {
        fontSize: 11.5,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        marginBottom: 2,
      },
      savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      savedAccount: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      savedIdentity: { flex: 1 },
      savedHandle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
      savedEmail: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 2 },
      savedGo: { color: 'rgba(255,255,255,0.7)', fontSize: 17, fontWeight: '700' },
      savedForget: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.14)',
      },
      savedForgetGlyph: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
      savedHint: {
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        marginTop: 2,
      },
      form: { gap: 13 },
      field: {
        backgroundColor: fieldBg,
        borderWidth: 1,
        borderColor: fieldBorder,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingTop: 9,
        paddingBottom: 10,
        minHeight: 58,
        justifyContent: 'center',
      },
      fieldLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.55)',
        marginBottom: 1,
      },
      fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
      input: { flex: 1, color: '#FFFFFF', fontSize: 15.5, padding: 0 },
      eyePress: { padding: 4 },
      submit: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
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
        fontSize: 13.5,
        lineHeight: 19,
        color: '#FFC9C9',
        backgroundColor: 'rgba(255,70,70,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,120,120,0.4)',
        borderRadius: 12,
        padding: 11,
        textAlign: 'center',
      },
      divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 3 },
      dividerLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255,255,255,0.3)',
      },
      dividerText: { color: 'rgba(255,255,255,0.65)', fontSize: 13.5, fontWeight: '600' },
      google: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: 54,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
      },
      googleLabel: { color: '#14261C', fontSize: 15.5, fontWeight: '600' },
      toggle: {
        marginTop: 18,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.78)',
        fontSize: 14.5,
      },
      toggleBold: { color: '#FFFFFF', fontWeight: '700' },
    });
    return s;
  }, [wide]);

  return (
    <View style={styles.screen}>
      <Image
        source={require('../../assets/auth-forest.jpg')}
        style={styles.bg}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        // Decorative backdrop behind the login card: an empty alt keeps it
        // out of the accessibility tree and off the crawler's image list.
        alt=""
        aria-hidden={true}
        accessible={false}
      />
      {/* Dark green wash keeps white text legible on any crop of the photo. */}
      <LinearGradient
        colors={['rgba(5,16,10,0.66)', 'rgba(5,16,10,0.34)', 'rgba(2,9,6,0.85)']}
        style={styles.bg}
      />
      {/* On iOS the keyboard pads the view up; on Android the window already
          resizes, so the ScrollView itself carries the extra bottom room. */}
      <KeyboardAvoidingView
        style={styles.keyboardPad}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          >
            <BackIcon size={20} color="#FFFFFF" />
          </Pressable>

          {/* Login | Sign Up — the single switch between both forms. */}
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
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            wide && { justifyContent: 'center' },
            {
              paddingBottom:
                34 + (Platform.OS === 'android' ? keyboardHeight : 0),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.column, wide && { paddingTop: 30 }]}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="CreatorDNA home"
                onPress={onBack}
                style={({ pressed }) => [styles.logoHalo, pressed && { opacity: 0.75 }]}
              >
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.logoImg}
                  accessibilityLabel="CreatorDNA logo"
                />
              </Pressable>
              <Text style={styles.wordmark}>CreatorDNA</Text>
              <Text style={styles.tagline}>Your AI Creator Coach</Text>
            </View>

            <View style={styles.card}>
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
                            {account.instagramUsername
                              ? `@${account.instagramUsername}`
                              : account.email}
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
                    <Text style={styles.fieldLabel}>Name</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      autoCorrect={false}
                      placeholder="Enter your name"
                      placeholderTextColor="rgba(255,255,255,0.38)"
                      accessibilityLabel="Name"
                      style={styles.input}
                    />
                  </View>
                ) : null}

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="Enter your email"
                    placeholderTextColor="rgba(255,255,255,0.38)"
                    accessibilityLabel="Email"
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View style={styles.fieldRow}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholder="Enter your password"
                      placeholderTextColor="rgba(255,255,255,0.38)"
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
                        <EyeOffIcon size={19} color="rgba(255,255,255,0.65)" />
                      ) : (
                        <EyeIcon size={19} color="rgba(255,255,255,0.65)" />
                      )}
                    </Pressable>
                  </View>
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
                    colors={[green, greenDeep]}
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
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
