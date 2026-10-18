import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  clearInstagramSession,
  DashboardRequestError,
  fetchInstagramDashboard,
  InstagramDashboard,
  InstagramProfile,
  loadInstagramSession,
  saveInstagramSession,
} from './src/services/instagramDashboard';
import {
  CreatorAiJob,
  CreatorAiChatContext,
  CreatorAiChatMessage,
  CreatorAiIdea,
  CreatorAiMedia,
  generateCreatorIdeas,
  getCreatorAiJob,
  readCreatorMedia,
  sendCreatorAiChat,
  signInAnonymouslyForCreatorAi,
  signInForCreatorAi,
  submitCreatorContent,
  transcribeCreatorAudio,
} from './src/services/creatorAi';
import {
  CreatorDashboardScreen,
  CreatorInsightsPlaceholder,
  InstagramConnectedScreen,
} from './src/screens/CreatorScreens';

type Screen =
  | 'onboarding'
  | 'auth'
  | 'connect'
  | 'connected'
  | 'dashboard'
  | 'insights'
  | 'create'
  | 'profile';
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'failed';

const pendingOAuthStorageKey = 'veyyra.instagram.oauth-state';
const connectionErrorMessages: Record<string, string> = {
  login_cancelled: 'Instagram connection was cancelled. Try again.',
  oauth_rejected:
    'Instagram rejected the login request. Check your app’s Instagram Login settings.',
  invalid_authorization_code:
    'Instagram authorization expired. Please try connecting again.',
  missing_permissions:
    'The required Instagram permissions were not granted. Please try again and approve both permissions.',
  unsupported_account:
    'Connect an Instagram Creator or Business account.',
  invalid_profile:
    'We could not read your Instagram professional profile. Please try again.',
  instagram_api_error:
    'Instagram could not verify your account right now. Please try again.',
  receipt_expired_or_used:
    'The connection confirmation expired. Please try again.',
  invalid_state: 'The login session expired. Please try again.',
  connection_setup_failed:
    'Instagram connection could not start. Please try again.',
  session_storage_failed:
    'Instagram connected, but this device could not securely save the session. Keep the app open to continue.',
  session_restore_failed:
    'We could not restore your secure Instagram session. Please connect your account again.',
  session_clear_failed:
    'We could not safely clear the saved Instagram session. Please try again.',
  invalid_return_uri:
    'This Veyyra app address is not configured for Instagram login. Open Veyyra from its configured development URL and try again.',
  origin_not_allowed:
    'This Veyyra app address is not configured for Instagram login. Open Veyyra from its configured development URL and try again.',
  rate_limited:
    'Too many Instagram login attempts. Please wait a minute and try again.',
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const instagramFunctionUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1/instagram-oauth`
  : null;
const creatorAiFunctionUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1/creator-ai`
  : null;

WebBrowser.maybeCompleteAuthSession();

const permissions = [
  { icon: '✓', label: 'Access your public profile' },
  { icon: '▥', label: 'Analyze your content & insights' },
  { icon: '↗', label: 'Track your performance' },
  { icon: '✣', label: 'Get personalized recommendations' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<InstagramDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] =
    useState<'reconnect_required' | 'try_again' | null>(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [supabaseAccessToken, setSupabaseAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const incomingUrl = Linking.useURL();
  const handledReceipts = useRef(new Set<string>());
  const handledOAuthStates = useRef(new Set<string>());
  const pendingOAuthState = useRef<string | null>(null);
  const sessionRestoreStarted = useRef(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const loadDashboard = useCallback(async (token: string) => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      if (!instagramFunctionUrl || !supabaseAnonKey) {
        throw new DashboardRequestError('try_again');
      }
      const data = await fetchInstagramDashboard(
        instagramFunctionUrl,
        supabaseAnonKey,
        token,
      );
      setDashboard(data);
      setProfile(data.profile);
    } catch (error) {
      setDashboardError(
        error instanceof DashboardRequestError
          ? error.code
          : 'try_again',
      );
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const getPendingOAuthState = () => {
    if (pendingOAuthState.current) {
      return pendingOAuthState.current;
    }
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(pendingOAuthStorageKey);
    }
    return null;
  };

  const clearPendingOAuthState = () => {
    pendingOAuthState.current = null;
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(pendingOAuthStorageKey);
    }
  };

  const handleInstagramReturn = useCallback(async (url: string) => {
    const query = Linking.parse(url).queryParams ?? {};
    if (query.instagram_status !== 'connected' && query.instagram_status !== 'failed') {
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(
        window.history.state,
        '',
        '/instagram-connected',
      );
    }
    const callbackState = query.instagram_state;
    if (
      typeof callbackState === 'string' &&
      handledOAuthStates.current.has(callbackState)
    ) {
      return;
    }
    setScreen('connect');
    if (
      typeof callbackState !== 'string' ||
      callbackState !== getPendingOAuthState()
    ) {
      clearPendingOAuthState();
      setConnectionError('invalid_state');
      setConnectionState('failed');
      return;
    }
    handledOAuthStates.current.add(callbackState);
    clearPendingOAuthState();
    if (query.instagram_status === 'failed') {
      const errorCode =
        typeof query.instagram_error === 'string'
          ? query.instagram_error
          : 'oauth_rejected';
      setConnectionError(errorCode);
      setConnectionState('failed');
      return;
    }

    const receipt = query.instagram_receipt;
    if (typeof receipt !== 'string') {
      setConnectionError('receipt_expired_or_used');
      setConnectionState('failed');
      return;
    }
    if (handledReceipts.current.has(receipt)) {
      return;
    }
    handledReceipts.current.add(receipt);
    setConnectionState('connecting');

    try {
      if (!instagramFunctionUrl || !supabaseAnonKey) {
        throw new Error('Supabase client configuration is missing.');
      }
      const response = await fetch(`${instagramFunctionUrl}/receipt`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ receipt }),
      });
      if (!response.ok) {
        throw new Error('The Instagram connection receipt could not be verified.');
      }
      const result: unknown = await response.json();
      const connectedProfile = isRecord(result) ? result : null;
      if (
        !connectedProfile ||
        typeof connectedProfile.username !== 'string' ||
        (connectedProfile.accountType !== 'Business' &&
          connectedProfile.accountType !== 'Media_Creator') ||
        typeof connectedProfile.sessionToken !== 'string'
      ) {
        throw new Error('The Instagram profile response was invalid.');
      }
      const token = connectedProfile.sessionToken;
      if (token.length < 40 || token.length > 128) {
        throw new Error('The Instagram session response was invalid.');
      }
      const actualProfile: InstagramProfile = {
        username: connectedProfile.username,
        accountType: connectedProfile.accountType,
        profilePictureUrl:
          typeof connectedProfile.profilePictureUrl === 'string'
            ? connectedProfile.profilePictureUrl
            : null,
      };
      setProfile(actualProfile);
      setSessionToken(token);
      setScreen('connected');
      setConnectionError(null);
      setConnectionState('connected');
      setDashboard(null);
      setDashboardError(null);
      try {
        await saveInstagramSession(token);
        setSessionWarning(false);
      } catch {
        setSessionWarning(true);
      }
    } catch {
      setConnectionError('receipt_expired_or_used');
      setConnectionState('failed');
    }
  }, []);

  useEffect(() => {
    if (incomingUrl || sessionRestoreStarted.current) {
      return;
    }
    sessionRestoreStarted.current = true;
    void loadInstagramSession()
      .then((token) => {
        if (!token) {
          return;
        }
        setSessionToken(token);
        setScreen('dashboard');
        void loadDashboard(token);
      })
      .catch(() => {
        setConnectionError('session_restore_failed');
        setConnectionState('failed');
        setScreen('connect');
      });
  }, [incomingUrl, loadDashboard]);

  useEffect(() => {
    if (incomingUrl) {
      void handleInstagramReturn(incomingUrl);
    }
  }, [handleInstagramReturn, incomingUrl]);

  const connectInstagram = useCallback(async () => {
    setConnectionState('connecting');
    setConnectionError(null);
    try {
      if (!instagramFunctionUrl || !supabaseAnonKey) {
        throw new Error('Supabase client configuration is missing.');
      }
      const platform = Platform.OS === 'web' ? 'web' : 'native';
      const returnUri =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? new URL('/instagram-connected', window.location.origin).toString()
          : Constants.executionEnvironment === 'storeClient'
            ? Linking.createURL('instagram/callback')
            : 'veyyra://instagram/callback';
      const response = await fetch(
        `${instagramFunctionUrl}/start`,
        {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ platform, returnUri }),
        },
      );
      if (!response.ok) {
        let errorCode = 'connection_setup_failed';
        try {
          const errorResponse: unknown = await response.json();
          if (
            isRecord(errorResponse) &&
            typeof errorResponse.error === 'string' &&
            connectionErrorMessages[errorResponse.error]
          ) {
            errorCode = errorResponse.error;
          }
        } catch {
          errorCode = 'connection_setup_failed';
        }
        setConnectionError(errorCode);
        setConnectionState('failed');
        return;
      }
      const result = (await response.json()) as {
        authorizationUrl?: unknown;
        state?: unknown;
      };
      if (
        typeof result.authorizationUrl !== 'string' ||
        typeof result.state !== 'string'
      ) {
        throw new Error('Instagram authorization URL was missing.');
      }
      pendingOAuthState.current = result.state;

      if (Platform.OS === 'web') {
        sessionStorage.setItem(pendingOAuthStorageKey, result.state);
        await Linking.openURL(result.authorizationUrl);
        return;
      }

      const authSession = await WebBrowser.openAuthSessionAsync(
        result.authorizationUrl,
        returnUri,
      );
      if (authSession.type === 'success' && authSession.url) {
        await handleInstagramReturn(authSession.url);
      } else {
        clearPendingOAuthState();
        setConnectionError('login_cancelled');
        setConnectionState('failed');
      }
    } catch {
      clearPendingOAuthState();
      setConnectionError('connection_setup_failed');
      setConnectionState('failed');
    }
  }, [handleInstagramReturn]);

  const navigateTab = useCallback((tab: 'Home' | 'Insights' | 'Create' | 'Profile') => {
    const nextScreen: Screen =
      tab === 'Home'
        ? 'dashboard'
        : tab === 'Insights'
          ? 'insights'
          : tab === 'Create'
            ? 'create'
            : 'profile';
    setScreen(nextScreen);
  }, []);

  const authenticate = useCallback(async (
    email: string,
    password: string,
  ): Promise<boolean> => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase Auth is not configured in this app.');
      }
      const token = await signInForCreatorAi(
        supabaseUrl,
        supabaseAnonKey,
        email,
        password,
      );
      setSupabaseAccessToken(token);
      return true;
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Sign-in failed. Please try again.',
      );
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const continueToDashboard = useCallback(() => {
    setScreen('dashboard');
    if (sessionToken) {
      void loadDashboard(sessionToken);
    } else {
      setDashboardError(null);
      setDashboard(null);
    }
  }, [loadDashboard, sessionToken]);

  const continueWithoutInstagram = useCallback(() => {
    setSessionToken(null);
    setProfile(null);
    setDashboard(null);
    setDashboardError(null);
    setConnectionState('idle');
    setConnectionError(null);
    setScreen('dashboard');
  }, []);

  const reconnectInstagram = useCallback(async () => {
    try {
      await clearInstagramSession();
    } catch {
      setConnectionError('session_clear_failed');
      setConnectionState('failed');
      return;
    }
    setSessionToken(null);
    setProfile(null);
    setDashboard(null);
    setDashboardError(null);
    setConnectionState('idle');
    setConnectionError(null);
    setSessionWarning(false);
    setScreen('connect');
  }, []);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        screen === 'connect' && styles.connectSafeArea,
      ]}
    >
      <StatusBar style={screen === 'connect' ? 'dark' : 'light'} />
      {screen === 'connected' && profile ? (
        <InstagramConnectedScreen
          profile={profile}
          onBack={() => setScreen('connect')}
          onContinue={continueToDashboard}
          sessionWarning={sessionWarning}
        />
      ) : screen === 'dashboard' ? (
        <CreatorDashboardScreen
          dashboard={dashboard}
          profile={profile}
          loading={dashboardLoading}
          error={dashboardError}
          onRetry={() => {
            if (sessionToken) {
              void loadDashboard(sessionToken);
            } else {
              setDashboardError(null);
              setDashboard(null);
            }
          }}
          onReconnect={() => void reconnectInstagram()}
          onViewInsights={() => setScreen('insights')}
          onNavigate={navigateTab}
        />
      ) : screen === 'insights' ? (
        <InsightsScreen onNavigate={navigateTab} onBack={() => setScreen('dashboard')} />
      ) : screen === 'create' ? (
        <CreateScreen
          onNavigate={navigateTab}
          onBack={() => setScreen('dashboard')}
          accessToken={supabaseAccessToken}
          onSessionCreated={setSupabaseAccessToken}
          dashboard={dashboard}
          profile={profile}
        />
      ) : screen === 'profile' ? (
        <ProfileScreen
          profile={profile}
          onNavigate={navigateTab}
          onBack={() => setScreen('dashboard')}
          onReconnect={() => void reconnectInstagram()}
        />
      ) : screen === 'onboarding' ? (
        <OnboardingScreen
          step={onboardingStep}
          onAdvance={() => setOnboardingStep((current) => current + 1)}
          onGetStarted={() => {
            setOnboardingStep(0);
            setScreen('connect');
          }}
          onSignIn={() => setScreen('auth')}
          onBack={() => setOnboardingStep((current) => Math.max(0, current - 1))}
        />
      ) : screen === 'auth' ? (
        <AuthScreen
          onBack={() => setScreen('onboarding')}
          onSignIn={async (email, password) => {
            const signedIn = await authenticate(email, password);
            if (!signedIn) {
              return;
            }
            setSessionToken(null);
            setProfile(null);
            setDashboard(null);
            setDashboardError(null);
            setScreen('dashboard');
          }}
          authLoading={authLoading}
          authError={authError}
          onConnectInstagram={() => setScreen('connect')}
          onContinueWithoutInstagram={continueWithoutInstagram}
        />
      ) : (
        <ConnectScreen
          onBack={() => setScreen('onboarding')}
          onConnect={connectInstagram}
          onConnected={continueToDashboard}
          onContinueWithoutInstagram={continueWithoutInstagram}
          connectionState={connectionState}
          connectionError={connectionError}
          profile={profile}
        />
      )}
    </SafeAreaView>
  );
}

function BrandHeader({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={onBack}
          style={styles.headerBack}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.headerBack} />
      )}
      <Text style={styles.headerBrand}>Veyyra</Text>
      <Text style={[styles.headerBack, styles.headerCrown]}>♛</Text>
    </View>
  );
}

function BottomNavigation({
  active,
  onNavigate,
  onHome,
}: {
  active: 'Home' | 'Insights' | 'Create' | 'Profile';
  onNavigate: (tab: 'Home' | 'Insights' | 'Create' | 'Profile') => void;
  onHome?: () => void;
}) {
  const items: { name: 'Home' | 'Insights' | 'Create' | 'Profile'; icon: string }[] = [
    { name: 'Home', icon: '⌂' },
    { name: 'Insights', icon: '◔' },
    { name: 'Create', icon: '+' },
    { name: 'Profile', icon: '◉' },
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const isActive = active === item.name;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (item.name === 'Home' && onHome) {
                onHome();
                return;
              }
              onNavigate(item.name);
            }}
            style={styles.navItem}
          >
            <Text style={[styles.navIcon, isActive && styles.navActive]}>{item.icon}</Text>
            <Text style={[styles.navLabel, isActive && styles.navActive]}>{item.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OnboardingScreen({
  step,
  onAdvance,
  onGetStarted,
  onSignIn,
  onBack,
}: {
  step: number;
  onAdvance: () => void;
  onGetStarted: () => void;
  onSignIn: () => void;
  onBack: () => void;
}) {
  const slides = [
    {
      title: 'Know what makes you grow.',
      copy:
        'Veyyra learns from your content and helps you understand what your audience actually responds to.',
      cta: 'Get Started',
    },
    {
      title: 'Your content has a pattern.',
      copy:
        'Every creator has unique topics, hooks, formats, and styles that perform differently. Veyyra helps you spot the signals.',
      cta: 'Continue',
    },
    {
      title: 'Discover your Creator DNA',
      copy:
        'See the patterns behind your best work, from winning topics to ideal lengths and the content styles your audience loves most.',
      cta: 'Continue',
    },
  ];

  const slide = slides[step] ?? slides[0];
  const isLastSlide = step >= slides.length - 1;

  return (
    <View style={styles.onboarding}>
      <LinearGradient
        colors={['#070a1a', '#11132d', '#17102f']}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.pinkGlow} />
      <LinearGradient
        colors={['#8f1e9e', '#49248e', '#3734a0']}
        start={{ x: 0, y: 0.1 }}
        end={{ x: 1, y: 0.8 }}
        style={styles.backWave}
      />
      <LinearGradient
        colors={['#d429a2', '#842bb6', '#5448d3']}
        start={{ x: 0, y: 0.25 }}
        end={{ x: 1, y: 0.7 }}
        style={styles.frontWave}
      />

      <ScrollView
        contentContainerStyle={styles.onboardingContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <DnaMark />
          <Text style={styles.brand}>CreatorDNA</Text>
          {step === 0 ? (
            <>
              <Text style={styles.tagline}>Your Instagram. Smarter.</Text>
              <Text style={styles.intro}>
                AI-powered insights to help you{'\n'}
                create better content, grow faster{'\n'}
                and reach the right audience.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.intro}>{slide.copy}</Text>
            </>
          )}
        </View>

        <View style={styles.onboardingActions}>
          <View
            style={styles.pageDots}
            accessibilityLabel={`Page ${step + 1} of ${slides.length}`}
          >
            {slides.map((_, dot) => (
              <View
                key={dot}
                style={[styles.pageDot, dot === step && styles.activePageDot]}
              />
            ))}
          </View>
          <GradientButton
            label={slide.cta}
            onPress={isLastSlide ? onGetStarted : onAdvance}
          />
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Back</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onSignIn}
            style={({ pressed }) => [
              styles.signInButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.signInLabel}>I already have an account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function DnaMark() {
  return (
    <View style={styles.dnaMark} accessibilityLabel="CreatorDNA logo">
      <Svg width={52} height={52} viewBox="0 0 48 48">
        <Path
          d="M12 5c0 9 24 10 24 19S12 34 12 43"
          fill="none"
          stroke="#bc77ff"
          strokeLinecap="round"
          strokeWidth={3.4}
        />
        <Path
          d="M36 5c0 9-24 10-24 19s24 10 24 19"
          fill="none"
          stroke="#8959ed"
          strokeLinecap="round"
          strokeWidth={3.4}
        />
        <Path
          d="M16 11h16M13 20h22M13 29h22M16 38h16"
          fill="none"
          stroke="#a86af5"
          strokeLinecap="round"
          strokeWidth={2.5}
        />
      </Svg>
    </View>
  );
}

function AuthScreen({
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
    <View style={styles.authScreen}>
      <LinearGradient
        colors={['#070a1a', '#11132d', '#16142d']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.authContent}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <View style={styles.authHeader}>
          <DnaMark />
          <Text style={styles.authTitle}>Welcome back</Text>
          <Text style={styles.authSubtitle}>
            Sign in to continue your CreatorDNA progress.
          </Text>
        </View>

        <View style={styles.authForm}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#7c7d99"
              style={styles.textInput}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#7c7d99"
              style={styles.textInput}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canSignIn}
            onPress={() => {
              void Promise.resolve(onSignIn(email, password)).finally(() => {
                setPassword('');
              });
            }}
            style={({ pressed }) => [
              styles.authPrimaryButton,
              !canSignIn && styles.authPrimaryButtonDisabled,
              pressed && canSignIn && styles.pressed,
            ]}
          >
            <Text style={styles.authPrimaryLabel}>
              {authLoading ? 'Signing in…' : 'Sign in'}
            </Text>
          </Pressable>

          {authError && (
            <Text accessibilityRole="alert" style={styles.authError}>
              {authError}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={onConnectInstagram}
            style={({ pressed }) => [
              styles.authSecondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.authSecondaryLabel}>Connect Instagram</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onContinueWithoutInstagram}
            style={({ pressed }) => [
              styles.authLinkButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.authLinkLabel}>Continue without Instagram</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ConnectScreen({
  onBack,
  onConnect,
  onConnected,
  onContinueWithoutInstagram,
  connectionState,
  connectionError,
  profile,
}: {
  onBack: () => void;
  onConnect: () => void;
  onConnected: () => void;
  onContinueWithoutInstagram: () => void;
  connectionState: ConnectionState;
  connectionError: string | null;
  profile: InstagramProfile | null;
}) {
  return (
    <ScrollView
      style={styles.connectScreen}
      contentContainerStyle={styles.connectContent}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.backArrow}>‹</Text>
      </Pressable>

      <Text style={styles.connectTitle}>Connect Instagram</Text>
      <Text style={styles.connectDescription}>
        Let’s connect your Instagram account so we can analyze your content and
        help you grow.
      </Text>

      <InstagramIllustration />

      {connectionState === 'connected' && profile ? (
        <View style={styles.connectedCard}>
          <Text style={styles.connectedTitle}>Instagram Connected ✓</Text>
          <View style={styles.connectedProfile}>
            {profile.profilePictureUrl ? (
              <Image
                source={{ uri: profile.profilePictureUrl }}
                style={styles.profilePicture}
                accessibilityLabel="Instagram profile picture"
              />
            ) : (
              <View style={styles.profilePicturePlaceholder}>
                <Text style={styles.profilePictureInitial}>
                  {profile.username.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileDetails}>
              <Text style={styles.profileUsername}>@{profile.username}</Text>
              <Text style={styles.profileAccountType}>
                {profile.accountType === 'Media_Creator'
                  ? 'Creator'
                  : 'Business'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.permissionCard}>
          {permissions.map((permission, index) => (
            <View key={permission.label}>
              <View style={styles.permissionRow}>
                <View style={styles.permissionIcon}>
                  <Text style={styles.permissionGlyph}>{permission.icon}</Text>
                </View>
                <Text style={styles.permissionLabel}>{permission.label}</Text>
                <Text style={styles.permissionChevron}>›</Text>
              </View>
              {index < permissions.length - 1 && (
                <View style={styles.permissionDivider} />
              )}
            </View>
          ))}
        </View>
      )}

      <GradientButton
        label={
          connectionState === 'connected'
            ? 'Continue →'
            : connectionState === 'connecting'
              ? 'Connecting...'
              : connectionState === 'failed'
                ? 'Connection failed — Try again'
                : 'Connect Instagram'
        }
        onPress={connectionState === 'connected' ? onConnected : onConnect}
        disabled={connectionState === 'connecting'}
      />

      <Pressable
        accessibilityRole="button"
        onPress={onContinueWithoutInstagram}
        style={({ pressed }) => [
          styles.secondaryButton,
          styles.connectSecondaryButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.secondaryButtonLabel}>Continue without Instagram</Text>
      </Pressable>

      {connectionState === 'failed' && connectionError && (
        <Text accessibilityRole="alert" style={styles.connectionError}>
          {connectionErrorMessages[connectionError] ??
            'Instagram connection failed. Please try again.'}
        </Text>
      )}

      <View style={styles.privacyNote}>
        <Text style={styles.privacyIcon}>ⓘ</Text>
        <Text style={styles.privacyText}>
          Your data is safe with us. We only access what you allow.
        </Text>
      </View>
    </ScrollView>
  );
}

function InsightsScreen({
  onNavigate,
  onBack,
}: {
  onNavigate: (tab: 'Home' | 'Insights' | 'Create' | 'Profile') => void;
  onBack: () => void;
}) {
  const filters = ['7 days', '30 days', '90 days', 'All time'];
  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#080b1b', '#11112a', '#100e24']} style={StyleSheet.absoluteFill} />
      <View style={styles.screenContent}>
        <BrandHeader onBack={onBack} />
        <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeaderRow}>
            <View>
              <Text style={styles.pageEyebrow}>Insights</Text>
              <Text style={styles.pageTitle}>Performance Overview</Text>
            </View>
            <View style={styles.metaPill}><Text style={styles.metaPillText}>Live</Text></View>
          </View>

          <View style={styles.filterRow}>
            {filters.map((filter, index) => (
              <Pressable
                key={filter}
                accessibilityRole="button"
                style={[
                  styles.filterChip,
                  index === 0 && styles.filterChipActive,
                ]}
              >
                <Text style={[
                  styles.filterChipText,
                  index === 0 && styles.filterChipTextActive,
                ]}>{filter}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.metricsGrid}>
            {[
              { label: 'Engagement', value: '--' },
              { label: 'Saves', value: '--' },
              { label: 'Best format', value: 'Reels' },
              { label: 'Avg. watch', value: '--' },
            ].map((metric) => (
              <View key={metric.label} style={styles.metricCard}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={styles.metricValue}>{metric.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Content Patterns</Text>
            <Text style={styles.sectionCopy}>No data yet. Upload or connect Instagram to unlock pattern analysis.</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Top Content</Text>
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateGlyph}>◎</Text>
              <Text style={styles.emptyStateText}>No content has been analyzed yet.</Text>
            </View>
          </View>
        </ScrollView>
        <BottomNavigation active="Insights" onNavigate={onNavigate} onHome={() => onBack()} />
      </View>
    </View>
  );
}

function CreateScreen({
  onNavigate,
  onBack,
  accessToken,
  onSessionCreated,
  dashboard,
  profile,
}: {
  onNavigate: (tab: 'Home' | 'Insights' | 'Create' | 'Profile') => void;
  onBack: () => void;
  accessToken: string | null;
  onSessionCreated: (token: string) => void;
  dashboard: InstagramDashboard | null;
  profile: InstagramProfile | null;
}) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [caption, setCaption] = useState('');
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [mode, setMode] = useState<'chat' | 'create' | 'ideas'>('chat');
  const [selectedMedia, setSelectedMedia] = useState<
    (CreatorAiMedia & { uri: string }) | null
  >(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ideaTopic, setIdeaTopic] = useState('');
  const [ideaAudience, setIdeaAudience] = useState('');
  const [ideaGoal, setIdeaGoal] = useState('');
  const [ideas, setIdeas] = useState<CreatorAiIdea[]>([]);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [chatMessages, setChatMessages] = useState<CreatorAiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [job, setJob] = useState<CreatorAiJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSubmission = useRef<{
    idempotencyKey: string;
    title: string;
    transcript: string | null;
    caption: string | null;
    metrics: Record<string, number>;
    media: CreatorAiMedia | null;
  } | null>(null);
  const isMounted = useRef(true);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  useEffect(() => {
    if (
      !job ||
      job.status === 'completed' ||
      job.status === 'failed' ||
      !accessToken ||
      !creatorAiFunctionUrl ||
      !supabaseAnonKey
    ) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void getCreatorAiJob(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        accessToken,
        job.jobId,
      ).then((updatedJob) => {
        if (!cancelled) {
          setJob(updatedJob);
        }
      }).catch((pollError: unknown) => {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : 'Could not refresh analysis status.',
          );
        }
      });
    }, 1800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, job, job?.jobId, job?.status]);

  const runAnalysis = async (submission: NonNullable<typeof lastSubmission.current>) => {
    if (!creatorAiFunctionUrl || !supabaseUrl || !supabaseAnonKey) {
      setError('Supabase is not configured for content analysis.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = accessToken ?? await signInAnonymouslyForCreatorAi(
        supabaseUrl,
        supabaseAnonKey,
      );
      if (!accessToken) {
        onSessionCreated(token);
      }
      const result = await submitCreatorContent(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        token,
        submission,
        submission.media,
      );
      if (isMounted.current) {
        setJob(result);
      }
    } catch (submitError) {
      if (isMounted.current) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'Analysis could not be submitted.',
        );
      }
    } finally {
      if (isMounted.current) {
        setSubmitting(false);
      }
    }
  };

  const startAnalysis = () => {
    const cleanTitle = title.trim();
    const cleanTranscript = transcript.trim();
    const cleanCaption = caption.trim();
    if (!cleanTitle || (!cleanTranscript && !cleanCaption && !selectedMedia)) {
      setError('Add a title and some text, a voice recording, or a media file before analyzing.');
      return;
    }
    const metrics: Record<string, number> = {};
    for (const [label, rawValue] of [
      ['views', views],
      ['likes', likes],
      ['comments', comments],
    ] as const) {
      if (!rawValue.trim()) {
        continue;
      }
      const value = Number(rawValue);
      if (!Number.isSafeInteger(value) || value < 0) {
        setError(`${label[0].toUpperCase()}${label.slice(1)} must be a non-negative whole number.`);
        return;
      }
      metrics[label] = value;
    }

    const submission = {
      idempotencyKey: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      title: cleanTitle,
      transcript: cleanTranscript || null,
      caption: cleanCaption || null,
      metrics,
      media: selectedMedia,
    };
    lastSubmission.current = submission;
    setJob(null);
    void runAnalysis(submission);
  };

  const getCreatorToken = async (): Promise<string> => {
    if (accessToken) {
      return accessToken;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase is not configured for Creator AI.');
    }
    const token = await signInAnonymouslyForCreatorAi(supabaseUrl, supabaseAnonKey);
    onSessionCreated(token);
    return token;
  };

  const setPickedMedia = async (
    uri: string,
    mimeType: string,
    name: string,
    kind: CreatorAiMedia['kind'],
    size?: number | null,
  ) => {
    if (size !== undefined && size !== null && size > 3_000_000) {
      throw new Error('Choose a media file smaller than 3 MB for this preview.');
    }
    const loaded = await readCreatorMedia(uri, mimeType, name, kind);
    setSelectedMedia({ ...loaded, uri });
    setError(null);
  };

  const chooseImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        await setPickedMedia(
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileName ?? 'creator-image',
          'image',
          asset.fileSize,
        );
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Could not open the image picker.');
    }
  };

  const chooseMediaFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/webm', 'video/quicktime', 'audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? '';
      const kind = mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : null;
      if (!kind) {
        throw new Error('Choose an audio or video file.');
      }
      await setPickedMedia(asset.uri, mimeType, asset.name, kind, asset.size);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Could not open the file picker.');
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      setTranscribing(true);
      setError(null);
      try {
        if (audioRecorder.getStatus().isRecording) {
          await audioRecorder.stop();
        }
        setRecording(false);
        if (!audioRecorder.uri) {
          throw new Error('The voice recording could not be saved.');
        }
        const mimeType = Platform.OS === 'web' || audioRecorder.uri.toLowerCase().endsWith('.webm')
          ? 'audio/webm'
          : 'audio/mp4';
        const voice = await readCreatorMedia(
          audioRecorder.uri,
          mimeType,
          mimeType === 'audio/webm' ? 'voice-note.webm' : 'voice-note.m4a',
          'audio',
        );
        setSelectedMedia({ ...voice, uri: audioRecorder.uri });
        if (!creatorAiFunctionUrl || !supabaseAnonKey) {
          throw new Error('Supabase is not configured for voice transcription.');
        }
        const token = await getCreatorToken();
        const transcribed = await transcribeCreatorAudio(
          creatorAiFunctionUrl,
          supabaseAnonKey,
          token,
          voice,
        );
        setTranscript((current) => [current.trim(), transcribed].filter(Boolean).join('\n'));
      } catch (recordError) {
        setError(recordError instanceof Error ? recordError.message : 'Voice transcription failed.');
      } finally {
        setRecording(false);
        setTranscribing(false);
      }
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Allow microphone access to record your voice.');
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record({ forDuration: 30 });
      setRecording(true);
      setError(null);
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : 'Could not start voice recording.');
    }
  };

  const createIdeas = async () => {
    if (!ideaTopic.trim() || !ideaAudience.trim() || !ideaGoal.trim()) {
      setError('Add a topic, your audience, and what you want the Reel to achieve.');
      return;
    }
    if (!creatorAiFunctionUrl || !supabaseAnonKey) {
      setError('Supabase is not configured for Creator AI.');
      return;
    }
    setGeneratingIdeas(true);
    setError(null);
    try {
      const token = await getCreatorToken();
      const result = await generateCreatorIdeas(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        token,
        {
          topic: ideaTopic.trim(),
          audience: ideaAudience.trim(),
          goal: ideaGoal.trim(),
        },
      );
      setIdeas(result);
    } catch (ideaError) {
      setError(ideaError instanceof Error ? ideaError.message : 'Could not generate Reel ideas.');
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const buildChatContext = (): CreatorAiChatContext => {
    const context: CreatorAiChatContext = {};
    if (dashboard) {
      context.instagram = {
        username: dashboard.profile.username ?? profile?.username ?? null,
        accountType: dashboard.profile.accountType ?? profile?.accountType ?? null,
        followers: dashboard.stats.followers ?? dashboard.profile.followersCount ?? null,
        views: dashboard.stats.views ?? null,
        likes: dashboard.stats.likes ?? null,
        comments: dashboard.stats.comments ?? null,
        recentMedia: dashboard.media.slice(0, 10).map((item) => ({
          mediaType: item.mediaType,
          likes: item.likes ?? null,
          comments: item.comments ?? null,
          timestamp: item.timestamp ?? null,
        })),
      };
    } else if (profile) {
      context.instagram = {
        username: profile.username,
        accountType: profile.accountType,
        followers: null,
        views: null,
        likes: null,
        comments: null,
        recentMedia: [],
      };
    }
    if (ideas.length > 0) {
      context.generatedIdeas = ideas.map((idea) => ({
        title: idea.title,
        hook: idea.hook,
        concept: idea.concept,
        format: idea.format,
        cta: idea.cta,
      }));
    }
    return context;
  };

  const sendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || !creatorAiFunctionUrl || !supabaseAnonKey) {
      return;
    }
    setChatInput('');
    setChatSending(true);
    setError(null);
    const previousMessages = chatMessages;
    const conversation = [...previousMessages, { role: 'user' as const, content: message }];
    setChatMessages(conversation);
    try {
      const token = await getCreatorToken();
      const reply = await sendCreatorAiChat(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        token,
        job?.analysis ?? null,
        previousMessages,
        message,
        buildChatContext(),
      );
      setChatMessages([...conversation, { role: 'assistant', content: reply }]);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : 'Could not send your message.');
    } finally {
      setChatSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#080b1b', '#11112a', '#100e24']} style={StyleSheet.absoluteFill} />
      <View style={styles.screenContent}>
        <BrandHeader onBack={onBack} />
        <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageEyebrow}>Create</Text>
          <Text style={styles.pageTitle}>
            {mode === 'chat'
              ? 'Chat with Veyyra'
              : mode === 'create'
                ? 'Create with Veyyra'
                : 'Fresh Reel ideas'}
          </Text>
          <Text style={styles.sectionCopy}>
            {mode === 'chat'
              ? 'Ask me anything about your content, your Instagram insights, or your ideas.'
              : mode === 'create'
                ? 'Share your content or talk it through. I’ll help you make it stronger.'
                : 'Tell me your topic and audience, and I’ll brainstorm Reel concepts with you.'}
          </Text>

          <View style={styles.aiModeSwitch}>
            {(['chat', 'create', 'ideas'] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === option }}
                onPress={() => {
                  setMode(option);
                  setError(null);
                }}
                style={[styles.aiModeButton, mode === option && styles.aiModeButtonActive]}
              >
                <Text style={[styles.aiModeLabel, mode === option && styles.aiModeLabelActive]}>
                  {option === 'chat' ? 'Chat' : option === 'create' ? 'Create' : 'Ideas'}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'chat' ? (
              <View style={[styles.aiChat, styles.aiChatStandalone]}>
                {chatMessages.length === 0 && (
                  <Text style={styles.aiFootnote}>
                    Hi, I’m Veyyra 👋 Ask me what to post, how your recent content performed, or
                    for ideas tailored to your audience.
                  </Text>
                )}
                {chatMessages.map((message, index) => (
                  <View
                    key={`${message.role}-${index}`}
                    style={[
                      styles.aiChatBubble,
                      message.role === 'user' && styles.aiChatUserBubble,
                    ]}
                  >
                    <Text style={styles.aiChatRole}>
                      {message.role === 'assistant' ? 'Veyyra' : 'You'}
                    </Text>
                    <Text style={styles.aiResultCopy}>{message.content}</Text>
                  </View>
                ))}
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask me anything…"
                  placeholderTextColor="#82839d"
                  maxLength={2000}
                  onSubmitEditing={() => void sendChatMessage()}
                  returnKeyType="send"
                  style={styles.aiTextInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={chatSending || !chatInput.trim()}
                  onPress={() => void sendChatMessage()}
                  style={[
                    styles.aiChatSendButton,
                    (chatSending || !chatInput.trim()) && styles.aiButtonDisabled,
                  ]}
                >
                  <Text style={styles.aiRetryLabel}>
                    {chatSending ? 'Thinking…' : 'Send message'}
                  </Text>
                </Pressable>
              </View>
          ) : mode === 'ideas' ? (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Let’s brainstorm</Text>
                <Text style={styles.aiFieldLabel}>What’s your topic?</Text>
                <TextInput
                  value={ideaTopic}
                  onChangeText={setIdeaTopic}
                  placeholder="e.g. easy meals for busy students"
                  placeholderTextColor="#82839d"
                  maxLength={500}
                  style={styles.aiTextInput}
                />
                <Text style={styles.aiFieldLabel}>Who do you want to reach?</Text>
                <TextInput
                  value={ideaAudience}
                  onChangeText={setIdeaAudience}
                  placeholder="e.g. students living on a budget"
                  placeholderTextColor="#82839d"
                  maxLength={500}
                  style={styles.aiTextInput}
                />
                <Text style={styles.aiFieldLabel}>What should the Reel achieve?</Text>
                <TextInput
                  value={ideaGoal}
                  onChangeText={setIdeaGoal}
                  placeholder="e.g. save-worthy tips and new followers"
                  placeholderTextColor="#82839d"
                  maxLength={500}
                  style={styles.aiTextInput}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={generatingIdeas}
                onPress={() => void createIdeas()}
                style={[styles.aiSubmitButton, generatingIdeas && styles.aiButtonDisabled]}
              >
                <Text style={styles.aiSubmitLabel}>
                  {generatingIdeas ? 'Brainstorming…' : 'Give me ideas'}
                </Text>
              </Pressable>
              {ideas.map((idea, index) => (
                <View key={`${idea.title}-${index}`} style={styles.sectionCard}>
                  <Text style={styles.aiResultHeading}>Idea {index + 1} · {idea.format}</Text>
                  <Text style={styles.aiIdeaTitle}>{idea.title}</Text>
                  <Text style={styles.aiResultHeading}>Opening hook</Text>
                  <Text style={styles.aiResultCopy}>{idea.hook}</Text>
                  <Text style={styles.aiResultHeading}>The concept</Text>
                  <Text style={styles.aiResultCopy}>{idea.concept}</Text>
                  <Text style={styles.aiResultHeading}>Call to action</Text>
                  <Text style={styles.aiResultCopy}>{idea.cta}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setTitle(idea.title);
                      setTranscript(`${idea.hook}\n\n${idea.concept}\n\n${idea.cta}`);
                      setMode('create');
                      setError(null);
                    }}
                    style={styles.aiRetryButton}
                  >
                    <Text style={styles.aiRetryLabel}>Build this idea</Text>
                  </Pressable>
                </View>
              ))}
              {ideas.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  disabled={generatingIdeas}
                  onPress={() => void createIdeas()}
                  style={[styles.aiRetryButton, styles.aiRefreshIdeasButton, generatingIdeas && styles.aiButtonDisabled]}
                >
                  <Text style={styles.aiRetryLabel}>
                    {generatingIdeas ? 'Brainstorming…' : '↻ Refresh ideas'}
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
          <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Your content</Text>
            <Text style={styles.aiFieldLabel}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. A quick weekly planning tip"
              placeholderTextColor="#82839d"
              maxLength={200}
              style={styles.aiTextInput}
            />
            <Text style={styles.aiFieldLabel}>Add your voice or media</Text>
            <View style={styles.aiMediaActions}>
              <Pressable
                accessibilityRole="button"
                disabled={transcribing}
                onPress={() => void toggleRecording()}
                style={[styles.aiMediaButton, recording && styles.aiRecordingButton]}
              >
                <Text style={styles.aiMediaButtonLabel}>
                  {transcribing
                    ? 'Transcribing…'
                    : recording
                      ? 'Stop & transcribe'
                      : 'Record voice'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void chooseImage()}
                style={styles.aiMediaButton}
              >
                <Text style={styles.aiMediaButtonLabel}>Add image</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void chooseMediaFile()}
                style={styles.aiMediaButton}
              >
                <Text style={styles.aiMediaButtonLabel}>Add video/audio</Text>
              </Pressable>
            </View>
            {recording && (
              <Text style={styles.aiFootnote}>Recording… Tap “Stop & transcribe” when you’re done (up to 30 seconds).</Text>
            )}
            {selectedMedia && (
              <View style={styles.aiSelectedMedia}>
                {selectedMedia.kind === 'image' && (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.aiMediaPreview} />
                )}
                <View style={styles.aiMediaDetails}>
                  <Text style={styles.aiSelectedMediaName} numberOfLines={1}>
                    {selectedMedia.name}
                  </Text>
                  <Text style={styles.aiFootnote}>
                    {selectedMedia.kind} · sent securely to Gemini for analysis · max 3 MB
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove attached media"
                  onPress={() => setSelectedMedia(null)}
                  style={styles.aiRemoveMedia}
                >
                  <Text style={styles.aiRemoveMediaLabel}>Remove</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.aiFieldLabel}>Transcript</Text>
            <TextInput
              value={transcript}
              onChangeText={setTranscript}
              placeholder="Paste the spoken words from your Reel"
              placeholderTextColor="#82839d"
              multiline
              textAlignVertical="top"
              maxLength={20000}
              style={[styles.aiTextInput, styles.aiMultilineInput]}
            />
            <Text style={styles.aiFieldLabel}>Caption (optional)</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Paste the post caption"
              placeholderTextColor="#82839d"
              multiline
              textAlignVertical="top"
              maxLength={10000}
              style={[styles.aiTextInput, styles.aiCaptionInput]}
            />
            <Text style={styles.aiFieldLabel}>Available metrics (optional)</Text>
            <View style={styles.aiMetricRow}>
              {[
                { label: 'Views', value: views, setValue: setViews },
                { label: 'Likes', value: likes, setValue: setLikes },
                { label: 'Comments', value: comments, setValue: setComments },
              ].map((metric) => (
                <View key={metric.label} style={styles.aiMetricField}>
                  <Text style={styles.aiMetricLabel}>{metric.label}</Text>
                  <TextInput
                    value={metric.value}
                    onChangeText={metric.setValue}
                    placeholder="—"
                    placeholderTextColor="#82839d"
                    keyboardType="number-pad"
                    style={styles.aiMetricInput}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.aiFootnote}>
              Add text, record a voice note, or attach one image, audio, or video file. Media is limited to 3 MB and is not stored with your analysis.
            </Text>
          </View>

          {error && (
            <View>
              <Text accessibilityRole="alert" style={styles.aiError}>{error}</Text>
              {job && job.status !== 'completed' && job.status !== 'failed' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setError(null);
                    setJob({ ...job });
                  }}
                  style={styles.aiRetryButton}
                >
                  <Text style={styles.aiRetryLabel}>Check status again</Text>
                </Pressable>
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={startAnalysis}
            style={({ pressed }) => [
              styles.aiSubmitButton,
              submitting && styles.aiButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.aiSubmitLabel}>
              {submitting ? 'Working on it…' : 'Analyze my content'}
            </Text>
          </Pressable>

          {job && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {job.status === 'completed'
                  ? 'Content analysis'
                  : job.status === 'failed'
                    ? 'Analysis failed'
                    : 'Analyzing your content…'}
              </Text>
              {job.status !== 'completed' && job.status !== 'failed' && (
                <Text style={styles.sectionCopy}>
                  Your analysis is processing securely. This screen checks for the result automatically.
                </Text>
              )}
              {job.status === 'failed' && (
                <>
                  <Text style={styles.aiError}>
                    {job.error ?? 'Analysis failed. You can safely retry.'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => {
                      if (lastSubmission.current) {
                        void runAnalysis(lastSubmission.current);
                      }
                    }}
                    style={styles.aiRetryButton}
                  >
                    <Text style={styles.aiRetryLabel}>Retry analysis</Text>
                  </Pressable>
                </>
              )}
              {job.analysis && (
                <View style={styles.aiResult}>
                  <Text style={styles.aiConfidence}>
                    Confidence: {job.analysis.confidence}
                  </Text>
                  <Text style={styles.aiResultCopy}>{job.analysis.summary}</Text>
                  <Text style={styles.aiResultHeading}>Hook</Text>
                  <Text style={styles.aiResultCopy}>
                    {job.analysis.hook.text ?? 'Not assessable from the supplied text'}
                    {' · '}
                    {job.analysis.hook.type.replaceAll('_', ' ')}
                  </Text>
                  <Text style={styles.aiResultHeading}>Format</Text>
                  <Text style={styles.aiResultCopy}>
                    {job.analysis.format.replaceAll('_', ' ')}
                  </Text>
                  <Text style={styles.aiResultHeading}>Strengths</Text>
                  {job.analysis.strengths.map((item, index) => (
                    <Text key={`strength-${index}`} style={styles.aiResultBullet}>• {item}</Text>
                  ))}
                  <Text style={styles.aiResultHeading}>Ways to improve</Text>
                  {job.analysis.improvement_opportunities.map((item, index) => (
                    <Text key={`improvement-${index}`} style={styles.aiResultBullet}>• {item}</Text>
                  ))}
                  {!!job.analysis.limitations.length && (
                    <Text style={styles.aiFootnote}>
                      Limits: {job.analysis.limitations.join(' ')}
                    </Text>
                  )}
                </View>
              )}
              {job.analysis && (
                <View style={styles.aiChat}>
                  <Text style={styles.aiResultHeading}>Keep the conversation going</Text>
                  <Text style={styles.aiFootnote}>
                    Ask me to explain a suggestion, rewrite your hook, or help with your next draft.
                  </Text>
                  {chatMessages.map((message, index) => (
                    <View
                      key={`${message.role}-${index}`}
                      style={[
                        styles.aiChatBubble,
                        message.role === 'user' && styles.aiChatUserBubble,
                      ]}
                    >
                      <Text style={styles.aiChatRole}>
                        {message.role === 'assistant' ? 'Veyyra' : 'You'}
                      </Text>
                      <Text style={styles.aiResultCopy}>{message.content}</Text>
                    </View>
                  ))}
                  <TextInput
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="Ask me anything about this analysis…"
                    placeholderTextColor="#82839d"
                    maxLength={2000}
                    onSubmitEditing={() => void sendChatMessage()}
                    returnKeyType="send"
                    style={styles.aiTextInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={chatSending || !chatInput.trim()}
                    onPress={() => void sendChatMessage()}
                    style={[
                      styles.aiChatSendButton,
                      (chatSending || !chatInput.trim()) && styles.aiButtonDisabled,
                    ]}
                  >
                    <Text style={styles.aiRetryLabel}>
                      {chatSending ? 'Thinking…' : 'Send message'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          </>
          )}
        </ScrollView>
        <BottomNavigation active="Create" onNavigate={onNavigate} onHome={() => onBack()} />
      </View>
    </View>
  );
}

function ProfileScreen({
  profile,
  onNavigate,
  onBack,
  onReconnect,
}: {
  profile: InstagramProfile | null;
  onNavigate: (tab: 'Home' | 'Insights' | 'Create' | 'Profile') => void;
  onBack: () => void;
  onReconnect: () => void;
}) {
  const name = profile?.username ? `@${profile.username}` : 'Creator';
  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#080b1b', '#11112a', '#100e24']} style={StyleSheet.absoluteFill} />
      <View style={styles.screenContent}>
        <BrandHeader onBack={onBack} />
        <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHeaderCard}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{name.slice(1, 2).toUpperCase() || 'C'}</Text>
            </View>
            <View style={styles.profileHeaderText}>
              <Text style={styles.pageTitle}>Creator</Text>
              <Text style={styles.sectionCopy}>{name}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Instagram</Text>
            <Text style={styles.sectionCopy}>
              {profile ? 'Connected' : 'Not connected yet'}
            </Text>
            <Pressable onPress={profile ? onReconnect : onReconnect} style={styles.rowAction}>
              <Text style={styles.rowActionText}>{profile ? 'Reconnect' : 'Connect Instagram'}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Creator DNA</Text>
            <Text style={styles.sectionCopy}>No DNA yet — add content to start learning your patterns.</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account</Text>
            {['Privacy', 'Data controls', 'Help', 'About Veyyra', 'Sign out'].map((item) => (
              <Pressable key={item} style={styles.listRow}>
                <Text style={styles.listRowText}>{item}</Text>
                <Text style={styles.listRowChevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <BottomNavigation active="Profile" onNavigate={onNavigate} onHome={() => onBack()} />
      </View>
    </View>
  );
}

function InstagramIllustration() {
  return (
    <View style={styles.illustration}>
      <Text style={[styles.illustrationSpark, styles.sparkLeft]}>✧</Text>
      <Text style={[styles.illustrationSpark, styles.sparkRight]}>✧</Text>
      <View style={styles.instagramLogo}>
        <LinearGradient
          colors={['#7438e8', '#c135bd', '#f56040', '#ffbd45']}
          locations={[0, 0.45, 0.76, 1]}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.instagramGradient}
        >
          <View style={styles.instagramCamera}>
            <View style={styles.instagramLens} />
            <View style={styles.instagramFlash} />
          </View>
        </LinearGradient>
      </View>
      <View style={[styles.illustrationDot, styles.illustrationDotLeft]} />
      <View style={[styles.illustrationDot, styles.illustrationDotRight]} />
    </View>
  );
}

function GradientButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.gradientButton, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={['#7765f4', '#7660e9', '#6859e6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientButtonFill}
      >
        <Text style={styles.gradientButtonLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#070a1a',
  },
  connectSafeArea: {
    backgroundColor: '#f8f9fd',
  },
  onboarding: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#070a1a',
  },
  pinkGlow: {
    position: 'absolute',
    width: 290,
    height: 270,
    left: -155,
    bottom: 36,
    borderRadius: 150,
    backgroundColor: '#a51ca4',
    opacity: 0.48,
    transform: [{ rotate: '-18deg' }],
  },
  backWave: {
    position: 'absolute',
    width: 570,
    height: 112,
    left: 46,
    bottom: -44,
    borderRadius: 90,
    transform: [{ rotate: '-7deg' }],
    opacity: 0.86,
  },
  frontWave: {
    position: 'absolute',
    width: 540,
    height: 102,
    left: -184,
    bottom: 5,
    borderRadius: 90,
    transform: [{ rotate: '10deg' }],
    opacity: 0.92,
  },
  onboardingContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 48,
    paddingBottom: 24,
  },
  hero: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 30,
  },
  dnaMark: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  brand: {
    color: '#f8f7ff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  tagline: {
    color: '#f4f1ff',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 17,
  },
  intro: {
    color: '#c3c3d5',
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 30,
  },
  onboardingActions: {
    width: '100%',
    gap: 12,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 19,
  },
  pageDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(222, 219, 245, 0.35)',
  },
  activePageDot: {
    width: 7,
    height: 7,
    backgroundColor: '#f4efff',
  },
  gradientButton: {
    height: 54,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientButtonFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  gradientButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  signInButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(221, 215, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 11, 34, 0.16)',
  },
  signInLabel: {
    color: '#f7f3ff',
    fontSize: 14,
    fontWeight: '600',
  },
  authScreen: {
    flex: 1,
    backgroundColor: '#070a1a',
  },
  authContent: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  authTitle: {
    color: '#f5f3ff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 10,
  },
  authSubtitle: {
    color: '#c3c3d5',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 260,
  },
  authForm: {
    width: '100%',
    gap: 14,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: '#d8d7ec',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  textInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(206, 190, 255, 0.2)',
    backgroundColor: 'rgba(19, 22, 45, 0.8)',
    color: '#f5f4ff',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  authPrimaryButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#8669f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  authPrimaryButtonDisabled: {
    opacity: 0.45,
  },
  authPrimaryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  authSecondaryButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217, 210, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 19, 40, 0.3)',
  },
  authSecondaryLabel: {
    color: '#f7f3ff',
    fontSize: 14,
    fontWeight: '600',
  },
  authLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  authLinkLabel: {
    color: '#d9c9ff',
    fontSize: 13,
    fontWeight: '600',
  },
  authError: {
    color: '#ff9ea6',
    fontSize: 12,
    lineHeight: 18,
  },
  aiFieldLabel: {
    color: '#d7d4ea',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 7,
  },
  aiModeSwitch: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: 16,
    borderRadius: 13,
    backgroundColor: 'rgba(19, 22, 45, 0.8)',
  },
  aiModeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  aiModeButtonActive: {
    backgroundColor: '#765de9',
  },
  aiModeLabel: {
    color: '#b8bad1',
    fontSize: 13,
    fontWeight: '600',
  },
  aiModeLabelActive: {
    color: '#fff',
  },
  aiIdeaTitle: {
    color: '#f2eeff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 3,
  },
  aiMediaActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aiMediaButton: {
    flexGrow: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(202,192,255,0.28)',
    backgroundColor: 'rgba(18, 19, 40, 0.65)',
  },
  aiRecordingButton: {
    borderColor: '#ff7186',
    backgroundColor: 'rgba(112, 35, 61, 0.5)',
  },
  aiMediaButtonLabel: {
    color: '#e9e2ff',
    fontSize: 11,
    fontWeight: '600',
  },
  aiSelectedMedia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(9, 11, 28, 0.65)',
  },
  aiMediaPreview: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#25243d',
  },
  aiMediaDetails: {
    flex: 1,
  },
  aiSelectedMediaName: {
    color: '#f5f3ff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiRemoveMedia: {
    padding: 7,
  },
  aiRemoveMediaLabel: {
    color: '#ff9ea6',
    fontSize: 11,
    fontWeight: '600',
  },
  aiChat: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(197, 195, 220, 0.18)',
    marginTop: 18,
    paddingTop: 12,
  },
  aiChatStandalone: {
    borderTopWidth: 0,
    marginTop: 4,
    paddingTop: 0,
  },
  aiChatBubble: {
    marginTop: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(118, 93, 233, 0.14)',
  },
  aiChatUserBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  aiChatRole: {
    color: '#c6b1ff',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 5,
  },
  aiChatSendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(202,192,255,0.25)',
  },
  aiTextInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(190, 174, 255, 0.2)',
    backgroundColor: 'rgba(9, 11, 28, 0.65)',
    color: '#f5f3ff',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
  },
  aiMultilineInput: {
    minHeight: 138,
  },
  aiCaptionInput: {
    minHeight: 82,
  },
  aiMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  aiMetricField: {
    flex: 1,
  },
  aiMetricLabel: {
    color: '#aeb0c8',
    fontSize: 10,
    marginBottom: 6,
  },
  aiMetricInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(190, 174, 255, 0.18)',
    backgroundColor: 'rgba(9, 11, 28, 0.65)',
    color: '#f5f3ff',
    paddingHorizontal: 10,
    fontSize: 13,
  },
  aiFootnote: {
    color: '#9799b4',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  aiAuthCopy: {
    marginBottom: 4,
  },
  aiSubmitButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#765de9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  aiButtonDisabled: {
    opacity: 0.45,
  },
  aiSubmitLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  aiSignedInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 2,
    marginBottom: 14,
  },
  aiSignedInText: {
    color: '#b8bad1',
    fontSize: 11,
  },
  aiSignOutText: {
    color: '#cebaff',
    fontSize: 11,
    fontWeight: '700',
  },
  aiError: {
    color: '#ff9ea6',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  aiRetryButton: {
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(202,192,255,0.25)',
    marginTop: 10,
  },
  aiRetryLabel: {
    color: '#e5d9ff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiRefreshIdeasButton: {
    marginTop: 14,
    marginBottom: 4,
  },
  aiResult: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(197, 195, 220, 0.18)',
    marginTop: 16,
    paddingTop: 14,
  },
  aiConfidence: {
    alignSelf: 'flex-start',
    color: '#c6b1ff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  aiResultHeading: {
    color: '#f2eeff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 5,
  },
  aiResultCopy: {
    color: '#c6c7dc',
    fontSize: 12,
    lineHeight: 19,
  },
  aiResultBullet: {
    color: '#c6c7dc',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 4,
  },
  screen: {
    flex: 1,
    backgroundColor: '#080b1b',
  },
  screenContent: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 23,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(194, 179, 255, 0.12)',
  },
  headerBrand: {
    color: '#c987ff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerCrown: {
    color: '#c584ff',
    fontSize: 17,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  slideTitle: {
    color: '#f4f1ff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.7,
    textAlign: 'center',
    marginTop: 10,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(221, 215, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 19, 45, 0.42)',
  },
  secondaryButtonLabel: {
    color: '#f3ebff',
    fontSize: 14,
    fontWeight: '600',
  },
  connectSecondaryButton: {
    marginTop: 12,
  },
  tabScroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pageEyebrow: {
    color: '#b59efb',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: '#f5f0ff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginTop: 4,
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(64, 211, 154, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(64, 211, 154, 0.2)',
  },
  metaPillText: {
    color: '#6ef3bf',
    fontSize: 10,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(188, 170, 255, 0.14)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(139, 104, 255, 0.24)',
    borderColor: 'rgba(170, 143, 255, 0.35)',
  },
  filterChipText: {
    color: '#d3d0ea',
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  metricCard: {
    width: '48%',
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(27, 27, 57, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(183, 164, 255, 0.14)',
  },
  metricLabel: {
    color: '#aeb0c8',
    fontSize: 11,
    marginBottom: 8,
  },
  metricValue: {
    color: '#f7f4ff',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: 'rgba(22, 24, 42, 0.88)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(183, 164, 255, 0.12)',
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#f4f1ff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionCopy: {
    color: '#b9bad0',
    fontSize: 12,
    lineHeight: 20,
  },
  emptyStateBox: {
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  emptyStateGlyph: {
    color: '#a17cff',
    fontSize: 20,
    marginBottom: 8,
  },
  emptyStateText: {
    color: '#c6c9db',
    fontSize: 12,
  },
  ideaCard: {
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(190,174,255,0.15)',
  },
  ideaTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  ideaMeta: {
    color: '#d5d7eb',
    fontSize: 12,
    marginBottom: 4,
  },
  ideaWhy: {
    marginTop: 10,
    color: '#bcead5',
    fontSize: 12,
    lineHeight: 18,
  },
  ideaActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  ideaGhostButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(202,192,255,0.25)',
    alignItems: 'center',
  },
  ideaGhostLabel: {
    color: '#eee7ff',
    fontSize: 12,
    fontWeight: '600',
  },
  ideaPrimaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: '#7b63f7',
    alignItems: 'center',
  },
  ideaPrimaryLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  profileHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(26, 27, 48, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(180, 162, 255, 0.12)',
    padding: 16,
    marginBottom: 16,
  },
  avatarLarge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2e294d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeText: {
    color: '#d9c4ff',
    fontSize: 22,
    fontWeight: '700',
  },
  profileHeaderText: {
    flex: 1,
  },
  rowAction: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(137, 92, 255, 0.12)',
    alignItems: 'center',
  },
  rowActionText: {
    color: '#d4baff',
    fontSize: 12,
    fontWeight: '700',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(197, 195, 220, 0.18)',
  },
  listRowText: {
    color: '#e8e4f7',
    fontSize: 13,
  },
  listRowChevron: {
    color: '#9ca2bd',
    fontSize: 20,
  },
  bottomNav: {
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(194, 179, 255, 0.14)',
    backgroundColor: 'rgba(7, 10, 26, 0.92)',
  },
  navItem: {
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navIcon: {
    color: '#777991',
    fontSize: 22,
    lineHeight: 26,
  },
  navLabel: {
    color: '#777991',
    fontSize: 10,
  },
  navActive: {
    color: '#b39aff',
  },
  connectScreen: {
    flex: 1,
    backgroundColor: '#f8f9fd',
  },
  connectContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 28,
  },
  backButton: {
    width: 30,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
  },
  backArrow: {
    color: '#1a2038',
    fontSize: 36,
    lineHeight: 38,
    fontWeight: '300',
  },
  connectTitle: {
    color: '#171d35',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  connectDescription: {
    color: '#555d73',
    fontSize: 14,
    lineHeight: 23,
    marginTop: 14,
  },
  illustration: {
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  instagramLogo: {
    width: 70,
    height: 70,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#bd50c8',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  instagramGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramCamera: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramLens: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#fff',
  },
  instagramFlash: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fff',
    top: 6,
    right: 6,
  },
  illustrationSpark: {
    position: 'absolute',
    color: '#9a83e8',
    fontSize: 25,
    fontWeight: '300',
  },
  sparkLeft: {
    left: '24%',
    top: 35,
    transform: [{ rotate: '-20deg' }],
  },
  sparkRight: {
    right: '22%',
    top: 47,
    transform: [{ rotate: '18deg' }],
  },
  illustrationDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#c5b7f3',
  },
  illustrationDotLeft: {
    left: '27%',
    bottom: 35,
  },
  illustrationDotRight: {
    right: '27%',
    bottom: 39,
  },
  permissionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 13,
    marginBottom: 20,
    shadowColor: '#26304d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  connectedCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#26304d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  connectedTitle: {
    color: '#171d35',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 15,
  },
  connectedProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicture: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e9e7f7',
  },
  profilePicturePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9e7f7',
  },
  profilePictureInitial: {
    color: '#5d51c8',
    fontSize: 20,
    fontWeight: '700',
  },
  profileDetails: {
    marginLeft: 13,
  },
  profileUsername: {
    color: '#26304d',
    fontSize: 14,
    fontWeight: '700',
  },
  profileAccountType: {
    color: '#707a90',
    fontSize: 12,
    marginTop: 5,
  },
  permissionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e4f7f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  permissionGlyph: {
    color: '#28a985',
    fontSize: 14,
    fontWeight: '800',
  },
  permissionLabel: {
    flex: 1,
    color: '#465067',
    fontSize: 12,
    fontWeight: '600',
  },
  permissionChevron: {
    color: '#9299aa',
    fontSize: 24,
    lineHeight: 27,
    marginLeft: 8,
  },
  permissionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e9ebf1',
    marginLeft: 40,
  },
  privacyNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 7,
  },
  connectionError: {
    color: '#b42336',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
  },
  privacyIcon: {
    color: '#78849e',
    fontSize: 12,
    marginRight: 6,
  },
  privacyText: {
    flex: 1,
    color: '#707a90',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
