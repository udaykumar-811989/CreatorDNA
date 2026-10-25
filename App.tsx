import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, PanResponder, Platform, SafeAreaView, StyleSheet } from 'react-native';

import { BottomNav, NavTab } from './src/components/BottomNav';
import { FloatingAiButton } from './src/components/FloatingAiButton';
import type { IdeaRequest } from './src/components/modals';
import {
  AnalysisSubmission,
  ConnectionState,
  LIGHT_SCREENS,
  NAV_SCREENS,
  Screen,
  isScreen,
  pathForScreen,
  screenForPath,
} from './src/lib/types';
import {
  creatorAiFunctionUrl,
  instagramFunctionUrl,
  supabaseAnonKey,
  supabaseUrl,
} from './src/lib/config';
import { AnalysisRecord, storageKeys, usePersistentState } from './src/lib/storage';
import {
  buildPlan,
  dnaScore,
  dnaStrengths,
  dnaWeaknesses,
  scoreOf,
  topicsBreakdown,
} from './src/lib/derived';
import {
  CreatorAiChatAttachmentInput,
  CreatorAiChatContext,
  CreatorAiChatMessage,
  CreatorAiIdea,
  CreatorAiJob,
  generateCreatorIdeas,
  getCreatorAiJob,
  refreshCreatorAiSession,
  sendCreatorAiChat,
  signInAnonymouslyForCreatorAi,
  signInForCreatorAi,
  submitCreatorContent,
} from './src/services/creatorAi';
import {
  clearInstagramSession,
  DashboardRequestError,
  fetchInstagramDashboard,
  InstagramDashboard,
  InstagramProfile,
  loadInstagramSession,
  saveInstagramSession,
} from './src/services/instagramDashboard';

import { AnalysesListScreen } from './src/screens/AnalysesListScreen';
import { AnalysisFormScreen } from './src/screens/AnalysisFormScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SaveAccountPrompt, SavedAccountsSheet } from './src/components/AccountModals';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { ConnectedScreen } from './src/screens/ConnectedScreen';
import { DnaScreen } from './src/screens/DnaScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { IdeasScreen } from './src/screens/IdeasScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PerformanceScreen } from './src/screens/PerformanceScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { LANDING_BG, LandingScreen } from './src/screens/LandingScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RecommendationsScreen } from './src/screens/RecommendationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { VideoAnalysisScreen } from './src/screens/VideoAnalysisScreen';
import { colors, NAV_HEIGHT } from './src/theme';
import { ThemeProvider, useTheme } from './src/themeContext';

WebBrowser.maybeCompleteAuthSession();

const pendingOAuthStorageKey = 'veyyra.instagram.oauth-state';

// Active email session (token + the account it belongs to). Persisted so a
// page refresh returns the creator to their dashboard; only an explicit
// logout clears it — and logout still remembers the account for one-tap
// re-login and account swapping.
const authSessionStorageKey = 'creatordna.auth.session';
const savedAccountsStorageKey = 'creatordna.accounts.v1';
const maxSavedAccounts = 5;

type AuthSessionRecord = {
  token: string;
  email: string | null;
  refreshToken: string | null;
};

// A remembered account: enough to sign back in without typing anything —
// the Supabase refresh token plus that account's Instagram connection.
type SavedAccount = {
  email: string;
  refreshToken: string;
  instagramToken: string | null;
  instagramUsername: string | null;
  instagramPictureUrl: string | null;
  savedAt: number;
};

const saveAuthSession = (session: AuthSessionRecord): void => {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(authSessionStorageKey, JSON.stringify(session));
    }
  } catch {
    // Storage can be unavailable (e.g. strict privacy settings). Sign-in
    // still works for this tab, it just won't survive a refresh.
  }
};

const loadAuthSession = (): AuthSessionRecord | null => {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(authSessionStorageKey);
    if (!raw) {
      return null;
    }
    // Older builds stored the bare token string; accept both shapes.
    let session: AuthSessionRecord = { token: raw, email: null, refreshToken: null };
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<AuthSessionRecord>;
      if (typeof parsed.token !== 'string') {
        return null;
      }
      session = {
        token: parsed.token,
        email: typeof parsed.email === 'string' ? parsed.email : null,
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
      };
    }
    // Supabase access tokens are short-lived JWTs — only restore one that
    // hasn't expired (`exp`, seconds since epoch).
    const payload = session.token.split('.')[1] ?? '';
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' && decoded.exp * 1000 > Date.now() ? session : null;
  } catch {
    return null;
  }
};

const clearAuthSession = (): void => {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(authSessionStorageKey);
    }
  } catch {
    // Best-effort cleanup.
  }
};

const loadSavedAccounts = (): SavedAccount[] => {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
      return [];
    }
    const raw = localStorage.getItem(savedAccountsStorageKey);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return mergeSavedAccounts(parsed.flatMap((entry): SavedAccount[] => {
      if (typeof entry !== 'object' || entry === null) {
        return [];
      }
      const account = entry as Record<string, unknown>;
      if (typeof account.email !== 'string' || typeof account.refreshToken !== 'string') {
        return [];
      }
      return [{
        email: account.email,
        refreshToken: account.refreshToken,
        instagramToken: typeof account.instagramToken === 'string' ? account.instagramToken : null,
        instagramUsername: typeof account.instagramUsername === 'string' ? account.instagramUsername : null,
        instagramPictureUrl: typeof account.instagramPictureUrl === 'string' ? account.instagramPictureUrl : null,
        savedAt: typeof account.savedAt === 'number' ? account.savedAt : 0,
      }];
    }));
  } catch {
    return [];
  }
};

// One row per Instagram handle: the same account saved twice (an older
// email-keyed entry plus an ig-keyed one) merges into a single row, so the
// switch list can never show two rows that both load the same account. The
// credential-carrying entry wins; the newest Instagram details apply on top.
const mergeSavedAccounts = (accounts: SavedAccount[]): SavedAccount[] => {
  const byHandle = new Map<string, SavedAccount>();
  const rest: SavedAccount[] = [];
  for (const entry of accounts) {
    const handle = entry.instagramUsername?.trim().toLowerCase() ?? null;
    if (!handle) {
      rest.push(entry);
      continue;
    }
    const existing = byHandle.get(handle);
    if (!existing) {
      byHandle.set(handle, { ...entry, instagramUsername: handle });
      continue;
    }
    const base =
      existing.refreshToken && !entry.refreshToken ? existing : entry;
    const details = entry.savedAt >= existing.savedAt ? entry : existing;
    byHandle.set(handle, {
      ...base,
      instagramToken: details.instagramToken ?? base.instagramToken,
      instagramPictureUrl:
        details.instagramPictureUrl ?? base.instagramPictureUrl,
      instagramUsername: handle,
      savedAt: Math.max(existing.savedAt, entry.savedAt),
    });
  }
  return [...byHandle.values(), ...rest];
};

const persistSavedAccounts = (accounts: SavedAccount[]): void => {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(
        savedAccountsStorageKey,
        JSON.stringify(accounts.slice(0, maxSavedAccounts)),
      );
    }
  } catch {
    // Best-effort: without storage the swap list just won't persist.
  }
};

const upsertSavedAccount = (account: SavedAccount): SavedAccount[] => {
  const next = [
    account,
    ...loadSavedAccounts().filter(
      (existing) => existing.email.toLowerCase() !== account.email.toLowerCase(),
    ),
  ].slice(0, maxSavedAccounts);
  persistSavedAccounts(next);
  return next;
};

const removeSavedAccount = (email: string): SavedAccount[] => {
  const next = loadSavedAccounts().filter(
    (account) => account.email.toLowerCase() !== email.toLowerCase(),
  );
  persistSavedAccounts(next);
  return next;
};


// The floating AI button is hidden only on the entry flow (where it would
// fight the mock's layout), inside the chat itself, and on the Help screen
// (its own helper chat owns the bottom of the screen).
const NO_FAB: ReadonlySet<Screen> = new Set<Screen>([
  'landing',
  'onboarding',
  'auth',
  'connect',
  'connected',
  'chat',
  'help',
  'privacy',
]);

// The five bottom-bar screens, in order: a left/right swipe across the app
// cycles through them, and Back from any of them lands on Home.
const TAB_SCREENS: readonly string[] = ['home', 'ideas', 'dna', 'plan', 'profile'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  // ---------- Navigation & entry flow ----------
  // A linked /privacy or /help URL opens straight on that screen — that is
  // what makes the routes shareable from a store listing or a support reply.
  const [screen, setScreen] = useState<Screen>(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? screenForPath(window.location.pathname) ?? 'onboarding'
      : 'onboarding',
  );
  // Screen to return to when the browser back button leaves a linked route.
  const legalReturn = useRef<Screen>('settings');
  // Current screen for the listeners that register once (browser history,
  // Android hardware back) and therefore can't close over fresh state.
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  const goBackRef = useRef<(() => boolean) | null>(null);

  // Replace the current history entry instead of adding one. Used by the
  // one-time transitions on load (session restore) so Back never walks back
  // through a screen the creator never chose.
  const settleOnScreen = (next: Screen): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(
        { screen: next },
        '',
        // A screen with no route of its own keeps the URL as it is — never
        // drop a query string the Instagram return still needs to read.
        pathForScreen(next) ?? window.location.href,
      );
    }
    setScreen(next);
  };
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<InstagramDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<
    'reconnect_required' | 'try_again' | null
  >(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [supabaseAccessToken, setSupabaseAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionErrorDetail, setConnectionErrorDetail] = useState<
    string | null
  >(null);
  const incomingUrl = Linking.useURL();
  const handledReceipts = useRef(new Set<string>());
  const handledOAuthStates = useRef(new Set<string>());
  const pendingOAuthState = useRef<string | null>(null);
  const sessionRestoreStarted = useRef(false);

  // ---------- Real, persisted app data ----------
  const [analyses, setAnalyses] = usePersistentState<AnalysisRecord[]>(
    storageKeys.analyses,
    [],
  );
  const [ideas, setIdeas] = usePersistentState<CreatorAiIdea[]>(storageKeys.ideas, []);
  const [trendingIdeas, setTrendingIdeas] = usePersistentState<CreatorAiIdea[]>(
    storageKeys.trendingIdeas,
    [],
  );
  const [savedIdeas, setSavedIdeas] = usePersistentState<CreatorAiIdea[]>(
    storageKeys.savedIdeas,
    [],
  );
  const [chatMessages, setChatMessages] = usePersistentState<CreatorAiChatMessage[]>(
    storageKeys.chat,
    [],
  );

  // ---------- Transient AI job state ----------
  const [job, setJob] = useState<CreatorAiJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [formReturn, setFormReturn] = useState<Screen>('ideas');
  const [analysisReturn, setAnalysisReturn] = useState<Screen>('ideas');
  const [chatReturn, setChatReturn] = useState<Screen>('home');

  const pendingSubmission = useRef<
    { submission: AnalysisSubmission; origin: Screen } | null
  >(null);
  const handledJobIds = useRef(new Set<string>());
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ---------- Instagram dashboard ----------
  // Monotonic id so a slow dashboard response can never overwrite a newer
  // one — e.g. an account swap whose earlier load for the previous account
  // resolves late and would silently bring the old account back.
  const dashboardRequestId = useRef(0);

  const loadDashboard = useCallback(
    async (token: string): Promise<boolean> => {
      const requestId = ++dashboardRequestId.current;
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
        if (requestId !== dashboardRequestId.current) {
          return false;
        }
        setDashboard(data);
        setProfile(data.profile);
        return true;
      } catch (error) {
        if (requestId === dashboardRequestId.current) {
          setDashboardError(
            error instanceof DashboardRequestError ? error.code : 'try_again',
          );
        }
        return false;
      } finally {
        if (requestId === dashboardRequestId.current) {
          setDashboardLoading(false);
        }
      }
    },
    [],
  );

  const getPendingOAuthState = (): string | null => {
    if (pendingOAuthState.current) {
      return pendingOAuthState.current;
    }
    if (Platform.OS !== 'web') {
      return null;
    }
    // localStorage first: phones often process the Instagram return in a
    // different tab or webview than the one that started the flow, where the
    // in-memory state and sessionStorage (scoped to one tab) are unavailable.
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(pendingOAuthStorageKey);
      if (stored) {
        return stored;
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(pendingOAuthStorageKey);
    }
    return null;
  };

  const clearPendingOAuthState = () => {
    pendingOAuthState.current = null;
    if (Platform.OS !== 'web') {
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(pendingOAuthStorageKey);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(pendingOAuthStorageKey);
    }
  };

  const handleInstagramReturn = useCallback(async (url: string) => {
    const query = Linking.parse(url).queryParams ?? {};
    if (
      query.instagram_status !== 'connected' &&
      query.instagram_status !== 'failed'
    ) {
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', '/instagram-connected');
    }
    const callbackState = query.instagram_state;
    if (
      typeof callbackState === 'string' &&
      handledOAuthStates.current.has(callbackState)
    ) {
      return;
    }
    setScreen('connect');
    const pendingState = getPendingOAuthState();
    if (
      typeof callbackState !== 'string' ||
      // Reject only a genuine mismatch (a different attempt's state is
      // stored). When no pending state exists at all, the return landed in a
      // fresh browsing context — common on phones — and the server has
      // already consumed this one-time state while building the redirect,
      // which proves the session was started by this app.
      (pendingState !== null && callbackState !== pendingState)
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
      setConnectionErrorDetail(
        typeof query.instagram_error_detail === 'string'
          ? query.instagram_error_detail
          : null,
      );
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
      // The Instagram connection IS the sign-in moment in this app — no
      // password is typed anywhere. Offer "Save this account?" right here;
      // a match on THIS Instagram account (handle or token) refreshes the
      // stored connection silently instead. Never match on email: that let
      // connecting a different account hijack the saved entry, so the list
      // could never grow past a single row and switching seemed impossible.
      const igHandle = actualProfile.username;
      const stored = loadSavedAccounts().find(
        (entry) =>
          entry.instagramUsername?.toLowerCase() === igHandle.toLowerCase() ||
          entry.instagramToken === token,
      );
      if (stored) {
        setSavedAccounts(upsertSavedAccount({
          ...stored,
          instagramToken: token,
          instagramUsername: igHandle,
          instagramPictureUrl:
            actualProfile.profilePictureUrl ?? stored.instagramPictureUrl,
        }));
      } else {
        setSaveAccountPrompt({ email: null, handle: igHandle });
      }
    } catch {
      setConnectionError('receipt_expired_or_used');
      setConnectionState('failed');
    }
  }, []);

  useEffect(() => {
    // Only an actual Instagram OAuth return should preempt restore. On the
    // web `incomingUrl` is *always* the current URL, which made every page
    // refresh skip session restore and log the creator out.
    const isInstagramReturn =
      typeof incomingUrl === 'string' && incomingUrl.includes('instagram_status=');
    if (isInstagramReturn || sessionRestoreStarted.current) {
      return;
    }
    sessionRestoreStarted.current = true;
    // A linked /privacy or /help entry still restores the session (tokens,
    // dashboard) — it just never steals the screen the URL asked for, and it
    // never pushes a history entry (the initial screen already is that one).
    const legalEntry =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? screenForPath(window.location.pathname)
        : null;
    void loadInstagramSession()
      .then((token) => {
        if (token) {
          setSessionToken(token);
          if (!legalEntry) {
            settleOnScreen('home');
          }
          void loadDashboard(token);
          return;
        }
        // Email/password session only (no Instagram connected): restoring it
        // keeps the creator on their dashboard across refreshes too.
        if (loadAuthSession() && !legalEntry) {
          settleOnScreen('home');
        }
      })
      .catch(() => {
        setConnectionError('session_restore_failed');
        setConnectionState('failed');
        if (!legalEntry) {
          settleOnScreen('connect');
        }
      });
  }, [incomingUrl, loadDashboard]);

  // ---------- Browser history ----------
  // Every screen change becomes a history entry, so the browser back button
  // (and the mobile edge-swipe) walks backwards through the app exactly like
  // the in-app swipe does — not only on /privacy and /help.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const recorded = (window.history.state as { screen?: unknown } | null)?.screen;
    if (recorded === screen) {
      // Already this entry — a popstate we just applied, or a setScreen that
      // landed where we already were. Never push a twin; just keep the path
      // honest (the Instagram return rewrites it to /instagram-connected).
      const target = pathForScreen(screen) ?? '/';
      if (window.location.pathname !== target) {
        window.history.replaceState({ screen }, '', target);
      }
      return;
    }
    const target = pathForScreen(screen) ?? '/';
    if (typeof recorded !== 'string') {
      // First entry in this tab: tag it in place instead of adding one. Keep
      // the whole URL (query included) — the Instagram return lands with its
      // one-time receipt in the query string and still has to be readable.
      if (target === '/') {
        window.history.replaceState({ screen }, '', window.location.href);
      } else {
        // Deep link straight into /privacy or /help: seed an app entry
        // underneath, so Back enters the app instead of leaving the site.
        window.history.replaceState({ screen: legalReturn.current }, '', '/');
        window.history.pushState({ screen }, '', target);
      }
      return;
    }
    window.history.pushState({ screen }, '', target);
  }, [screen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const onPopState = (event: PopStateEvent): void => {
      const recorded = (event.state as { screen?: unknown } | null)?.screen;
      const target =
        (isScreen(recorded) ? recorded : null) ?? screenForPath(window.location.pathname);
      if (!target) {
        // An entry from before the app (typed URL, external link, cleared
        // state): only a linked route needs its "opened from" rule.
        if (pathForScreen(screenRef.current)) {
          setScreen(legalReturn.current);
        }
        return;
      }
      if (target === screenRef.current) {
        return;
      }
      if (pathForScreen(target)) {
        // Landed on a linked route from history — remember where from, so its
        // in-app back chevron matches this Back button.
        legalReturn.current = screenRef.current;
      }
      setScreen(target);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Restore the persisted email session token alongside the Instagram
  // connection (state only — the screen restore above decides navigation).
  useEffect(() => {
    const stored = loadAuthSession();
    if (stored) {
      setSupabaseAccessToken(stored.token);
    }
  }, []);

  // Accounts remembered on this device (email + Instagram connection) so
  // logout doesn't cost a password re-type — swap with one tap.
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => loadSavedAccounts());
  // Non-null = show the "Save this account?" prompt. `email` is set when a
  // password login created the session; `handle` is the connected Instagram
  // identity — the sign-in path in this app usually has no password at all.
  const [saveAccountPrompt, setSaveAccountPrompt] = useState<{
    email: string | null;
    handle: string;
  } | null>(null);
  // Open switcher sheet (long-press on the Profile tab).
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);

  const loginWithSavedAccount = useCallback(
    async (
      email: string,
      options?: { stayOnScreen?: boolean },
    ): Promise<void> => {
      if (!supabaseUrl || !supabaseAnonKey) {
        return;
      }
      const account = loadSavedAccounts().find(
        (entry) => entry.email.toLowerCase() === email.toLowerCase(),
      );
      if (!account) {
        return;
      }
      setAuthLoading(true);
      setAuthError(null);
      try {
        // Instagram-only saved account (no password is ever involved in
        // this app's usual flow): restore the stored connection directly —
        // there is no credential to refresh.
        if (!account.refreshToken) {
          setProfile(null);
          setDashboard(null);
          setDashboardError(null);
          setConnectionError(null);
          setSessionWarning(false);
          if (account.instagramToken) {
            try {
              await saveInstagramSession(account.instagramToken);
            } catch {
              setSessionWarning(true);
            }
            setSessionToken(account.instagramToken);
            setConnectionState('connected');
            if (options?.stayOnScreen) {
              setScreen('connect');
            } else {
              setScreen('home');
            }
            await loadDashboard(account.instagramToken);
          } else {
            // Never leave the previous account's Instagram session behind.
            void clearInstagramSession();
            setSessionToken(null);
            setConnectionState('idle');
            if (options?.stayOnScreen) {
              setScreen('connect');
            } else {
              setScreen('home');
            }
          }
          return;
        }
        // Silent sign-in with the stored refresh token — no password typed.
        // A dead app credential must never abort the swap silently: this
        // saved login still restores the Instagram connection itself, so
        // fall back to that instead of leaving the previous account on
        // screen (Instagram's saved-profile behaviour).
        let session: Awaited<ReturnType<typeof refreshCreatorAiSession>> | null =
          null;
        try {
          session = await refreshCreatorAiSession(
            supabaseUrl,
            supabaseAnonKey,
            account.refreshToken,
          );
        } catch {
          session = null;
        }
        if (session) {
          // Supabase rotates refresh tokens on use; store the new one.
          const refreshToken = session.refreshToken ?? account.refreshToken;
          saveAuthSession({ token: session.accessToken, email: account.email, refreshToken });
          setSupabaseAccessToken(session.accessToken);
          setSavedAccounts(upsertSavedAccount({ ...account, refreshToken, savedAt: Date.now() }));
        }
        // Swap into this account: drop the previous account's live state and
        // restore this account's own Instagram connection if it has one.
        setProfile(null);
        setDashboard(null);
        setDashboardError(null);
        setConnectionError(null);
        setConnectionState('idle');
        setSessionWarning(false);
        if (account.instagramToken) {
          try {
            await saveInstagramSession(account.instagramToken);
          } catch {
            setSessionWarning(true);
          }
          setSessionToken(account.instagramToken);
          if (options?.stayOnScreen) {
            // Picked from the Connect page's own account list: swap in
            // place — the connected card updates when its dashboard lands.
            setConnectionState('connected');
            setScreen('connect');
          } else {
            setScreen('home');
          }
          await loadDashboard(account.instagramToken);
        } else {
          // Never leave the previous account's Instagram session behind.
          void clearInstagramSession();
          setSessionToken(null);
          if (options?.stayOnScreen) {
            setConnectionState('idle');
            setScreen('connect');
          } else {
            setScreen('home');
          }
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'saved_login_revoked') {
          // The stored credential no longer works — forget it so the list
          // only ever shows accounts that can actually sign in.
          setSavedAccounts(removeSavedAccount(account.email));
          setAuthError('That saved account needs its password once — sign in below.');
        } else {
          setAuthError('Could not reach sign-in. Check your connection and try again.');
        }
      } finally {
        setAuthLoading(false);
      }
    },
    [loadDashboard, supabaseAnonKey, supabaseUrl],
  );

  const forgetSavedAccount = useCallback((email: string) => {
    // Removing the entry re-offers the Save prompt at the next sign-in.
    setSavedAccounts(removeSavedAccount(email));
  }, []);

  // Keep the remembered account's Instagram details fresh for the swap list
  // (runs after connect, dashboard loads, and profile changes). Password
  // sessions refresh their email entry; Instagram-only sessions refresh the
  // entry saved under their handle. Only refresh — never auto-create.
  useEffect(() => {
    if (!sessionToken) {
      return;
    }
    const session = loadAuthSession();
    const email = session?.email;
    const shown = dashboard?.profile ?? profile;
    const existing = loadSavedAccounts().find((entry) =>
      email && session?.refreshToken
        ? entry.email.toLowerCase() === email.toLowerCase()
        : Boolean(
            shown &&
              entry.instagramUsername?.toLowerCase() ===
                shown.username.toLowerCase(),
          ),
    );
    if (!existing) {
      return;
    }
    setSavedAccounts(upsertSavedAccount({
      ...existing,
      refreshToken: session?.refreshToken ?? existing.refreshToken,
      instagramToken: sessionToken,
      instagramUsername: shown?.username ?? existing.instagramUsername,
      instagramPictureUrl:
        shown?.profilePictureUrl ?? existing.instagramPictureUrl,
      savedAt: Date.now(),
    }));
  }, [dashboard, profile, sessionToken]);

  useEffect(() => {
    if (incomingUrl) {
      void handleInstagramReturn(incomingUrl);
    }
  }, [handleInstagramReturn, incomingUrl]);

  const connectInstagram = useCallback(async () => {
    setConnectionState('connecting');
    setConnectionError(null);
    setConnectionErrorDetail(null);
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
            : 'creatordna://instagram/callback';
      const response = await fetch(`${instagramFunctionUrl}/start`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform, returnUri }),
      });
      if (!response.ok) {
        let errorCode = 'connection_setup_failed';
        try {
          const errorResponse: unknown = await response.json();
          if (
            isRecord(errorResponse) &&
            typeof errorResponse.error === 'string'
          ) {
            errorCode = errorResponse.error;
          }
        } catch {
          // Keep the generic message.
        }
        throw new Error(errorCode);
      }
      const payload: unknown = await response.json();
      if (
        !isRecord(payload) ||
        typeof payload.state !== 'string' ||
        typeof payload.authorizationUrl !== 'string'
      ) {
        throw new Error('connection_setup_failed');
      }
      pendingOAuthState.current = payload.state;
      if (Platform.OS === 'web') {
        // Persist in both storages: localStorage is what lets the return
        // find its pending state when it comes back in another tab or
        // webview (phones), sessionStorage keeps the per-tab copy.
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(pendingOAuthStorageKey, payload.state);
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(pendingOAuthStorageKey, payload.state);
        }
      }
      const authSession = await WebBrowser.openAuthSessionAsync(
        payload.authorizationUrl,
        returnUri,
      );
      if (authSession.type === 'success' && authSession.url) {
        await handleInstagramReturn(authSession.url);
      } else if (profile && sessionToken) {
        // Cancelling a "connect a different account" swap must never log the
        // connected account out — the live session is untouched, so return to
        // its connected view instead of a failure state.
        clearPendingOAuthState();
        setConnectionState('connected');
        setConnectionError(null);
      } else {
        clearPendingOAuthState();
        setConnectionError('login_cancelled');
        setConnectionState('failed');
      }
    } catch (error) {
      clearPendingOAuthState();
      if (profile && sessionToken) {
        setConnectionState('connected');
        setConnectionError(null);
      } else {
        setConnectionError(
          error instanceof Error && /^[a-z_]+$/.test(error.message)
            ? error.message
            : 'connection_setup_failed',
        );
        setConnectionState('failed');
      }
    }
  }, [handleInstagramReturn, profile, sessionToken]);

  // ---------- Auth ----------
  const authenticate = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase Auth is not configured in this app.');
        }
        const session = await signInForCreatorAi(
          supabaseUrl,
          supabaseAnonKey,
          email,
          password,
        );
        setSupabaseAccessToken(session.accessToken);
        // Persist the email session so a refresh returns to the dashboard
        // instead of the sign-in screen; logout clears it. Whether the
        // account is remembered for one-tap login is the caller's explicit
        // Save / Not now prompt decision — never automatic.
        saveAuthSession({
          token: session.accessToken,
          email: email.trim().toLowerCase(),
          refreshToken: session.refreshToken,
        });
        return true;
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : 'Sign-in failed. Please try again.',
        );
        return false;
      } finally {
        setAuthLoading(false);
      }
    },
    [],
  );

  const continueToDashboard = useCallback(() => {
    setScreen('home');
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
    setScreen('home');
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

  const handleConnectEntry = useCallback(() => {
    if (sessionToken && profile) {
      // Connected: show the account as-is — never tear down a live session
      // from here. Only Logout (or an explicit Reconnect on an error card)
      // ends a connection.
      setConnectionState('connected');
      setConnectionError(null);
      setScreen('connect');
      return;
    }
    setConnectionState('idle');
    setConnectionError(null);
    setScreen('connect');
  }, [profile, sessionToken]);

  const logout = useCallback(() => {
    // Invalidate any dashboard request still in flight — its late response
    // must never resurrect the logged-out account's data.
    dashboardRequestId.current += 1;
    // Refresh (never create) the saved entry for this account so a saved
    // user's Instagram connection stays current across logouts. Saving is
    // opt-in via the sign-in prompt — logout alone doesn't add accounts.
    const session = loadAuthSession();
    const email = session?.email;
    if (email && session?.refreshToken) {
      const existing = loadSavedAccounts().find(
        (entry) => entry.email.toLowerCase() === email.toLowerCase(),
      );
      if (existing) {
        const shown = dashboard?.profile ?? profile;
        setSavedAccounts(upsertSavedAccount({
          email,
          refreshToken: session.refreshToken,
          instagramToken: sessionToken,
          instagramUsername: shown?.username ?? null,
          instagramPictureUrl: shown?.profilePictureUrl ?? null,
          savedAt: Date.now(),
        }));
      }
    }
    setSupabaseAccessToken(null);
    // Logout is the only thing that ends a live session — clear every
    // persisted credential so a refresh stays signed out.
    clearAuthSession();
    void clearInstagramSession();
    setSessionToken(null);
    setProfile(null);
    setDashboard(null);
    setDashboardError(null);
    setConnectionState('idle');
    setConnectionError(null);
    setSessionWarning(false);
    setAuthError(null);
    setOnboardingStep(0);
    // With saved accounts, logging out lands straight on the login screen
    // showing them (Instagram-style one-tap return); fresh devices start at
    // onboarding.
    setScreen(loadSavedAccounts().length > 0 ? 'auth' : 'onboarding');
  }, [dashboard, profile, sessionToken]);

  // ---------- Creator AI: token, analysis, ideas, chat ----------
  const getCreatorToken = useCallback(async (): Promise<string> => {
    if (supabaseAccessToken) {
      return supabaseAccessToken;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase is not configured for Creator AI.');
    }
    const token = await signInAnonymouslyForCreatorAi(supabaseUrl, supabaseAnonKey);
    setSupabaseAccessToken(token);
    return token;
  }, [supabaseAccessToken]);

  const runAnalysis = useCallback(
    async (submission: AnalysisSubmission, origin: Screen) => {
      if (!creatorAiFunctionUrl || !supabaseUrl || !supabaseAnonKey) {
        setAnalysisError('Supabase is not configured for content analysis.');
        return;
      }
      setSubmitting(true);
      setAnalysisError(null);
      pendingSubmission.current = { submission, origin };
      try {
        const token = await getCreatorToken();
        const result = await submitCreatorContent(
          creatorAiFunctionUrl,
          supabaseAnonKey,
          token,
          submission,
          submission.media ?? null,
        );
        if (isMounted.current) {
          setJob(result);
        }
      } catch (submitError) {
        if (isMounted.current) {
          setAnalysisError(
            submitError instanceof Error
              ? submitError.message
              : 'Analysis could not be submitted.',
          );
          pendingSubmission.current = null;
        }
      } finally {
        if (isMounted.current) {
          setSubmitting(false);
        }
      }
    },
    [getCreatorToken],
  );

  const handleAnalysisSubmit = useCallback(
    (submission: AnalysisSubmission) => {
      setJob(null);
      void runAnalysis(submission, formReturn);
    },
    [formReturn, runAnalysis],
  );

  const handleReanalyze = useCallback(
    (record: AnalysisRecord) => {
      if (!record.transcript && !record.caption) {
        setAnalysisError(
          'This record has no stored text to re-analyze — run a new analysis instead.',
        );
        return;
      }
      setJob(null);
      void runAnalysis(
        {
          idempotencyKey: `re-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
          title: record.title,
          transcript: record.transcript,
          caption: record.caption,
          metrics: record.metrics,
          media: null,
          mediaLink: {
            mediaId: record.mediaId ?? null,
            thumbnailUrl: record.thumbnailUrl ?? null,
            permalink: record.permalink ?? null,
            mediaType: record.mediaType ?? null,
          },
        },
        'analysis',
      );
    },
    [runAnalysis],
  );

  // Poll the running analysis job.
  useEffect(() => {
    if (
      !job ||
      job.status === 'completed' ||
      job.status === 'failed' ||
      !supabaseAccessToken ||
      !creatorAiFunctionUrl ||
      !supabaseAnonKey
    ) {
      return;
    }
    let cancelled = false;
    const functionUrl = creatorAiFunctionUrl;
    const anonKey = supabaseAnonKey;
    const token = supabaseAccessToken;
    const jobId = job.jobId;
    const timer = setTimeout(() => {
      void getCreatorAiJob(
        functionUrl,
        anonKey,
        token,
        jobId,
      )
        .then((updatedJob) => {
          if (!cancelled) {
            setJob(updatedJob);
          }
        })
        .catch((pollError: unknown) => {
          if (!cancelled) {
            setAnalysisError(
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
  }, [supabaseAccessToken, job, job?.jobId, job?.status]);

  // When a job completes, persist the real result and open its detail screen.
  useEffect(() => {
    if (!job || job.status !== 'completed' || !job.analysis) {
      return;
    }
    if (handledJobIds.current.has(job.jobId)) {
      return;
    }
    handledJobIds.current.add(job.jobId);
    const pending = pendingSubmission.current;
    const submission = pending?.submission ?? null;
    const record: AnalysisRecord = {
      id: job.jobId,
      createdAt: new Date().toISOString(),
      title: submission?.title?.trim() || 'Analyzed content',
      transcript: submission?.transcript ?? null,
      caption: submission?.caption ?? null,
      metrics: submission?.metrics ?? {},
      mediaId: submission?.mediaLink?.mediaId ?? null,
      thumbnailUrl: submission?.mediaLink?.thumbnailUrl ?? null,
      permalink: submission?.mediaLink?.permalink ?? null,
      mediaType: submission?.mediaLink?.mediaType ?? null,
      analysis: job.analysis,
    };
    setAnalyses((previous) => [record, ...previous].slice(0, 60));
    setSelectedAnalysisId(record.id);
    if (pending && pending.origin !== 'analysis') {
      setAnalysisReturn(pending.origin);
    }
    setScreen('analysis');
    pendingSubmission.current = null;
    setAnalysisError(null);
    setJob(null);
  }, [job, setAnalyses]);

  const handleGenerate = useCallback(
    async (mode: 'replace' | 'append' | 'trending', request: IdeaRequest) => {
      if (!creatorAiFunctionUrl || !supabaseAnonKey) {
        setGenerateError('Supabase is not configured for Creator AI.');
        return;
      }
      setGenerating(true);
      setGenerateError(null);
      try {
        const token = await getCreatorToken();
        const result = await generateCreatorIdeas(
          creatorAiFunctionUrl,
          supabaseAnonKey,
          token,
          { topic: request.topic, audience: request.audience, goal: request.goal },
        );
        if (mode === 'replace') {
          setIdeas(result);
        } else if (mode === 'trending') {
          setTrendingIdeas(result);
        } else {
          setIdeas((previous) => {
            const seen = new Set(
              previous.map((idea) => idea.title.trim().toLowerCase()),
            );
            const additions = result.filter(
              (idea) => !seen.has(idea.title.trim().toLowerCase()),
            );
            return [...previous, ...additions].slice(0, 20);
          });
        }
      } catch (ideaError) {
        setGenerateError(
          ideaError instanceof Error
            ? ideaError.message
            : 'Could not generate content ideas.',
        );
      } finally {
        setGenerating(false);
      }
    },
    [getCreatorToken, setIdeas, setTrendingIdeas],
  );

  const handleToggleSave = useCallback(
    (idea: CreatorAiIdea) => {
      const title = idea.title.trim().toLowerCase();
      setSavedIdeas((previous) => {
        const exists = previous.some(
          (item) => item.title.trim().toLowerCase() === title,
        );
        if (exists) {
          return previous.filter(
            (item) => item.title.trim().toLowerCase() !== title,
          );
        }
        return [...previous, idea];
      });
    },
    [setSavedIdeas],
  );

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

    const ideaPool = [...ideas];
    const seenIdeaTitles = new Set(
      ideaPool.map((idea) => idea.title.trim().toLowerCase()),
    );
    for (const saved of savedIdeas) {
      const key = saved.title.trim().toLowerCase();
      if (!seenIdeaTitles.has(key)) {
        ideaPool.push(saved);
        seenIdeaTitles.add(key);
      }
    }
    if (ideaPool.length > 0) {
      context.generatedIdeas = ideaPool.slice(0, 6).map((idea) => ({
        title: idea.title,
        hook: idea.hook,
        concept: idea.concept,
        format: idea.format,
        cta: idea.cta,
      }));
    }

    const topicList = topicsBreakdown(analyses);
    if (analyses.length > 0) {
      context.creatorDna = {
        score: dnaScore(analyses),
        strengths: dnaStrengths(analyses)
          .slice(0, 4)
          .map((item) => (item.detail ? `${item.title} — ${item.detail}` : item.title)),
        weaknesses: dnaWeaknesses(analyses)
          .slice(0, 4)
          .map((item) => (item.detail ? `${item.title} — ${item.detail}` : item.title)),
        topTopics: topicList ? topicList.map((entry) => entry.topic) : [],
      };
    }

    const planned = buildPlan(ideas).filter((day) => day.idea !== null);
    if (planned.length > 0) {
      context.contentPlan = planned.map((day) => ({
        day: `${day.weekday} ${day.dayNumber}`,
        title: day.idea?.title ?? '',
        format: day.idea?.format ?? '',
        priority: day.idea?.priority ?? null,
      }));
    }

    if (dashboard) {
      context.performance = {
        views: dashboard.stats.views,
        likes: dashboard.stats.likes,
        comments: dashboard.stats.comments,
        reach: dashboard.stats.reach ?? null,
        followers: dashboard.stats.followers ?? dashboard.profile.followersCount ?? null,
        previousViews: dashboard.stats.previous?.views ?? null,
        topTopics: topicList ?? [],
      };
    }

    if (analyses.length > 0) {
      context.analyses = analyses.slice(0, 3).map((record) => ({
        title: record.title,
        overallScore: scoreOf(record),
        mainIssue: record.analysis.main_issue ?? null,
        strengths: record.analysis.strengths.slice(0, 2),
        improvements: record.analysis.improvement_opportunities.slice(0, 2),
      }));
    }

    return context;
  };

  const sendChatMessage = async (
    text: string,
    attachment?: CreatorAiChatAttachmentInput,
  ) => {
    const message = text.trim();
    if ((!message && !attachment) || !creatorAiFunctionUrl || !supabaseAnonKey) {
      return;
    }
    setChatSending(true);
    setChatError(null);
    const previousMessages = chatMessages;
    const userMessage: CreatorAiChatMessage = {
      role: 'user',
      content: message,
      ...(attachment
        ? {
            attachment: {
              kind: attachment.kind,
              name: attachment.name,
              mimeType: attachment.mimeType,
              uri: attachment.uri,
            },
          }
        : {}),
    };
    const conversation = [...previousMessages, userMessage].slice(-100);
    setChatMessages(conversation);
    try {
      const token = await getCreatorToken();
      const reply = await sendCreatorAiChat(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        token,
        analyses[0]?.analysis ?? null,
        previousMessages.slice(-8),
        message,
        buildChatContext(),
        attachment ?? null,
      );
      setChatMessages(
        [...conversation, { role: 'assistant' as const, content: reply }].slice(-100),
      );
    } catch (chatSendError) {
      setChatError(
        chatSendError instanceof Error
          ? chatSendError.message
          : 'Could not send your message.',
      );
    } finally {
      setChatSending(false);
    }
  };

  const clearChat = useCallback(() => {
    setChatMessages([]);
    setChatError(null);
  }, [setChatMessages]);

  const eraseLocalData = useCallback(() => {
    setAnalyses([]);
    setIdeas([]);
    setTrendingIdeas([]);
    setSavedIdeas([]);
    setChatMessages([]);
    setSelectedAnalysisId(null);
    setJob(null);
    setAnalysisError(null);
    setGenerateError(null);
    setChatError(null);
    // Saved accounts are intentionally kept — they're login credentials,
    // not content data, and removing them would break one-tap sign-in.
  }, [setAnalyses, setChatMessages, setIdeas, setSavedIdeas, setTrendingIdeas]);

  const navigateTab = useCallback((tab: NavTab) => {
    setScreen(tab === 'content' ? 'ideas' : tab);
  }, []);

  const openChat = useCallback(() => {
    setChatReturn(screen === 'chat' ? 'home' : screen);
    setChatError(null);
    setScreen('chat');
  }, [screen]);

  const openForm = useCallback((origin: Screen) => {
    setFormReturn(origin);
    setAnalysisError(null);
    setJob(null);
    setScreen('analysisForm');
  }, []);

  const openAnalysis = useCallback(
    (record: AnalysisRecord, origin: Screen) => {
      setSelectedAnalysisId(record.id);
      setAnalysisReturn(origin);
      setScreen('analysis');
    },
    [],
  );

  const selectedRecord =
    analyses.find((record) => record.id === selectedAnalysisId) ?? null;

  const ideaDefaults: IdeaRequest = {
    topic:
      analyses[0]?.analysis.topics.primary ??
      'short-form reel ideas for my niche',
    audience: dashboard?.profile.username
      ? `my followers on @${dashboard.profile.username}`
      : 'my current followers',
    goal: 'grow engagement with short reels',
  };

  const jobBusy =
    submitting || (job !== null && job.status !== 'completed' && job.status !== 'failed');

  // ---------- Render ----------
  // Pin the app viewport on web: scroll chaining / touch overscroll must
  // never pan the document, otherwise the whole app (including the bottom
  // bar) drifts upward while scrolling.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const el = document.createElement('style');
    el.setAttribute('data-creatordna-root', '1');
    el.textContent =
      'html,body{overflow:hidden !important;overscroll-behavior:none;height:100%;}' +
      '#root{position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;}' +
      // Android Chrome starts text selection / callouts on long-press, which
      // cancels presses mid-hold — keep app chrome unselectable (form fields
      // stay selectable).
      '#root,#root *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}' +
      '#root input,#root textarea,#root [contenteditable="true"]{-webkit-user-select:text;user-select:text;}';
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);

  const { mode } = useTheme();
  // Effective brightness of the current screen: light mode makes every
  // screen light; in dark mode only the mock's light screens are light.
  const isLight = mode === 'light' || LIGHT_SCREENS.has(screen);
  const showNav = NAV_SCREENS.has(screen);
  const navActive: NavTab =
    screen === 'performance'
      ? 'dna'
      : screen === 'settings'
        ? 'profile'
        : screen === 'ideas'
          ? 'content'
          : screen === 'home' ||
              screen === 'dna' ||
              screen === 'plan' ||
              screen === 'profile'
            ? screen
            : 'home';
  const navDark =
    mode === 'dark' &&
    (screen === 'home' || screen === 'profile' || screen === 'settings');
  const showFab = !NO_FAB.has(screen);
  // The public landing's CTA enters the app directly when there is already a
  // session (Instagram or password), and otherwise starts the welcome flow.
  const signedInEntry = sessionToken !== null || loadAuthSession() !== null;

  // Mobile "slide navigation": a horizontal swipe across the page moves
  // between the bottom-nav screens (previous/next tab), and on detail
  // screens a right-swipe goes back — like the iOS edge gesture. Only
  // clearly-horizontal moves are claimed, so vertical scrolling is
  // untouched.
  const slideHandlerRef = useRef<((direction: 'left' | 'right') => void) | null>(
    null,
  );
  const [panResponder] = useState(() =>
    PanResponder.create({
      // Capture phase: claim clearly-horizontal moves before nested
      // ScrollViews can (Chrome/Android otherwise steals the gesture and
      // the swipe-navigation never sees it). Vertical moves are never
      // captured, so scrolling is untouched.
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        if (
          Math.abs(gesture.dx) >= 60 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2
        ) {
          slideHandlerRef.current?.(gesture.dx < 0 ? 'left' : 'right');
        }
      },
    }),
  );

  // One rule for "where does Back go" — shared by the right-swipe gesture,
  // the Android hardware button, and the browser history entries pushed above,
  // so every kind of back behaves the same on every screen.
  const goBack = (): boolean => {
    const current = screenRef.current;
    if (TAB_SCREENS.includes(current)) {
      // Back on a bottom tab lands on Home first; from Home the system does
      // its own default (leave the app). It never nukes the app mid-flow.
      if (current === 'home') {
        return false;
      }
      setScreen('home');
      return true;
    }
    switch (current) {
      case 'onboarding':
        // The welcome flow steps back instead of leaving the app.
        if (onboardingStep > 0) {
          setOnboardingStep((step) => Math.max(0, step - 1));
          return true;
        }
        return false;
      case 'auth':
        setScreen('onboarding');
        return true;
      case 'connect':
        setScreen(sessionToken ? 'home' : 'onboarding');
        return true;
      case 'connected':
        setScreen('connect');
        return true;
      case 'chat':
        setScreen(chatReturn === 'chat' ? 'home' : chatReturn);
        return true;
      case 'analysis':
        setScreen(analysisReturn);
        return true;
      case 'recommendations':
        setScreen('analysis');
        return true;
      case 'analysisForm':
        setScreen(formReturn);
        return true;
      case 'analysesList':
        setScreen('profile');
        return true;
      case 'performance':
        setScreen('dna');
        return true;
      case 'settings':
        setScreen('profile');
        return true;
      case 'privacy':
      case 'help':
        setScreen(legalReturn.current);
        return true;
      default:
        return false;
    }
  };
  goBackRef.current = goBack;

  const handleSlide = (direction: 'left' | 'right') => {
    const tabIndex = TAB_SCREENS.indexOf(screen);
    if (tabIndex >= 0) {
      const next =
        TAB_SCREENS[direction === 'left' ? tabIndex + 1 : tabIndex - 1];
      if (next) {
        setScreen(next as Screen);
      }
      return;
    }
    if (direction === 'right') {
      goBack();
    }
  };
  slideHandlerRef.current = handleSlide;

  // Android hardware back — same rule as the swipe, so native matches web.
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      goBackRef.current?.() ?? false,
    );
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor:
            screen === 'landing' ? LANDING_BG : isLight ? colors.white : colors.darkBg,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <StatusBar style={isLight ? 'dark' : 'light'} />
      {screen === 'landing' ? (
        <LandingScreen
          signedIn={signedInEntry}
          onEnterApp={() => setScreen(signedInEntry ? 'home' : 'onboarding')}
          onOpenPrivacy={() => {
            legalReturn.current = 'landing';
            setScreen('privacy');
          }}
          onOpenHelp={() => {
            legalReturn.current = 'landing';
            setScreen('help');
          }}
        />
      ) : screen === 'onboarding' ? (
        <OnboardingScreen
          step={onboardingStep}
          onAdvance={() => setOnboardingStep((current) => current + 1)}
          onGetStarted={() => {
            setOnboardingStep(0);
            setScreen('connect');
          }}
          onBack={() =>
            setOnboardingStep((current) => Math.max(0, current - 1))
          }
        />
      ) : screen === 'auth' ? (
        <AuthScreen
          onBack={() => setScreen('onboarding')}
          onSignIn={async (email, password) => {
            const signedIn = await authenticate(email, password);
            if (!signedIn) {
              return;
            }
            // Fresh sign-in: never keep another account's live Instagram
            // session (its saved copy lives with its own account entry).
            void clearInstagramSession();
            setSessionToken(null);
            setProfile(null);
            setDashboard(null);
            setDashboardError(null);
            // Instagram-style "Save login info?": the moment a password
            // login completes on a device, offer saving it — unless this
            // account is already saved here (an unsaved account is also
            // offered again after its Instagram connects).
            const normalized = email.trim().toLowerCase();
            if (
              !loadSavedAccounts().some(
                (entry) => entry.email.toLowerCase() === normalized,
              )
            ) {
              setSaveAccountPrompt({ email: normalized, handle: '' });
              return;
            }
            setScreen('home');
          }}
          authLoading={authLoading}
          authError={authError}
          onConnectInstagram={() => setScreen('connect')}
          onContinueWithoutInstagram={continueWithoutInstagram}
          savedAccounts={savedAccounts.map((account) => ({
            email: account.email,
            instagramUsername: account.instagramUsername,
            instagramPictureUrl: account.instagramPictureUrl,
          }))}
          onLoginSaved={(email) => void loginWithSavedAccount(email)}
          onForgetSavedAccount={forgetSavedAccount}
        />
      ) : screen === 'connected' && profile ? (
        <ConnectedScreen
          profile={profile}
          sessionWarning={sessionWarning}
          onBack={() => setScreen('connect')}
          onContinue={continueToDashboard}
        />
      ) : screen === 'home' ? (
        <HomeScreen
          profile={profile}
          dashboard={dashboard}
          loading={dashboardLoading}
          error={dashboardError}
          records={analyses}
          ideaCount={ideas.length}
          onRetry={() => {
            if (sessionToken) {
              void loadDashboard(sessionToken);
            } else {
              setDashboardError(null);
              setDashboard(null);
            }
          }}
          onReconnect={() => void reconnectInstagram()}
          onConnect={handleConnectEntry}
          onViewDna={() => setScreen('dna')}
        />
      ) : screen === 'dna' ? (
        <DnaScreen
          profile={profile}
          dashboard={dashboard}
          records={analyses}
          onViewReport={() => setScreen('performance')}
          onAnalyze={() => openForm('dna')}
          onConnect={handleConnectEntry}
        />
      ) : screen === 'ideas' ? (
        <IdeasScreen
          ideas={ideas}
          trendingIdeas={trendingIdeas}
          savedIdeas={savedIdeas}
          generating={generating}
          generateError={generateError}
          defaults={ideaDefaults}
          onGenerate={(mode, request) => void handleGenerate(mode, request)}
          onToggleSave={handleToggleSave}
          onAnalyze={() => openForm('ideas')}
        />
      ) : screen === 'analysisForm' ? (
        <AnalysisFormScreen
          dashboard={dashboard}
          getCreatorToken={getCreatorToken}
          job={job}
          submitting={submitting}
          error={analysisError}
          onSubmit={(submission) => handleAnalysisSubmit(submission)}
          onBack={() => {
            setJob(null);
            setAnalysisError(null);
            setScreen(formReturn);
          }}
        />
      ) : screen === 'analysesList' ? (
        <AnalysesListScreen
          records={analyses}
          onBack={() => setScreen('profile')}
          onOpen={(record) => openAnalysis(record, 'analysesList')}
          onAnalyze={() => openForm('analysesList')}
        />
      ) : screen === 'analysis' ? (
        <VideoAnalysisScreen
          record={selectedRecord}
          reanalyzing={jobBusy}
          reanalyzeError={job?.status === 'failed' ? job.error ?? analysisError : null}
          onBack={() => setScreen(analysisReturn)}
          onRecommendations={() => setScreen('recommendations')}
          onReanalyze={() => {
            if (selectedRecord) handleReanalyze(selectedRecord);
          }}
        />
      ) : screen === 'recommendations' ? (
        <RecommendationsScreen
          record={selectedRecord}
          records={analyses}
          onBack={() => setScreen('analysis')}
        />
      ) : screen === 'plan' ? (
        <PlanScreen
          ideas={ideas}
          savedIdeas={savedIdeas}
          generating={generating}
          generateError={generateError}
          defaults={ideaDefaults}
          onGenerate={(mode, request) => void handleGenerate(mode, request)}
          onToggleSave={handleToggleSave}
        />
      ) : screen === 'performance' ? (
        <PerformanceScreen
          dashboard={dashboard}
          records={analyses}
          onBack={() => setScreen('dna')}
        />
      ) : screen === 'profile' ? (
        <ProfileScreen
          profile={profile}
          dashboard={dashboard}
          recordCount={analyses.length}
          sessionWarning={sessionWarning}
          onReconnect={handleConnectEntry}
          onOpenAnalyses={() => setScreen('analysesList')}
          onViewDna={() => setScreen('dna')}
          onOpenSettings={() => setScreen('settings')}
          onSwitchAccount={() => setAccountSwitcherOpen(true)}
          onLogout={logout}
        />
      ) : screen === 'settings' ? (
        <SettingsScreen
          profile={profile}
          dashboard={dashboard}
          chatCount={chatMessages.length}
          onBack={() => setScreen('profile')}
          onReconnect={handleConnectEntry}
          onClearChat={clearChat}
          onEraseData={eraseLocalData}
          onOpenPrivacy={() => {
            legalReturn.current = 'settings';
            setScreen('privacy');
          }}
          onOpenHelp={() => {
            legalReturn.current = 'settings';
            setScreen('help');
          }}
        />
      ) : screen === 'privacy' ? (
        <PrivacyScreen onBack={() => setScreen(legalReturn.current)} />
      ) : screen === 'help' ? (
        <HelpScreen
          onBack={() => setScreen(legalReturn.current)}
          onOpenPrivacy={() => {
            // Came from Help: back should return there, not to Settings.
            legalReturn.current = 'help';
            setScreen('privacy');
          }}
          getCreatorToken={getCreatorToken}
        />
      ) : screen === 'chat' ? (
        <ChatScreen
          messages={chatMessages}
          sending={chatSending}
          error={chatError}
          onSend={(text, attachment) => void sendChatMessage(text, attachment)}
          onBack={() => setScreen(chatReturn === 'chat' ? 'home' : chatReturn)}
          onClear={() => setChatMessages([])}
          getCreatorToken={getCreatorToken}
        />
      ) : (
        <ConnectScreen
          onBack={() => setScreen(sessionToken ? 'home' : 'onboarding')}
          onConnect={() => void connectInstagram()}
          onConnected={continueToDashboard}
          onConnectDifferent={() => {
            // Fresh OAuth replaces the connection on success; nothing is
            // cleared up front, so cancelling keeps the current account.
            void connectInstagram();
          }}
          onShowAccounts={() => setAccountSwitcherOpen(true)}
          onContinueWithoutInstagram={continueWithoutInstagram}
          connectionState={connectionState}
          connectionError={connectionError}
          connectionErrorDetail={connectionErrorDetail}
          profile={profile}
        />
      )}

      {showNav ? (
        <BottomNav
          active={navActive}
          onNavigate={navigateTab}
          onProfileLongPress={() => setAccountSwitcherOpen(true)}
          tone={navDark ? 'dark' : 'light'}
        />
      ) : null}
      {showFab ? (
        <FloatingAiButton
          onPress={openChat}
          bottomReserve={showNav ? NAV_HEIGHT + 10 : 8}
        />
      ) : null}

      {/* Instagram-style "Save login info?" — asked the moment the account
          signs in here: a password login or (the usual case) an Instagram
          connect. */}
      {saveAccountPrompt ? (
        <SaveAccountPrompt
          email={saveAccountPrompt.email ?? `@${saveAccountPrompt.handle}`}
          onSave={() => {
            const prompt = saveAccountPrompt;
            const session = loadAuthSession();
            const igToken = sessionToken;
            const igProfile = profile;
            const handle = igProfile?.username ?? null;
            let key: string | null = null;
            let savedNext: SavedAccount[] | null = null;
            if (
              prompt.email &&
              session?.refreshToken &&
              session.email &&
              session.email.toLowerCase() === prompt.email.toLowerCase()
            ) {
              // Password-created account: the credential itself, plus
              // whatever Instagram connection is live right now.
              key = prompt.email;
              savedNext = upsertSavedAccount({
                email: prompt.email,
                refreshToken: session.refreshToken,
                instagramToken: igToken ?? null,
                instagramUsername: handle,
                instagramPictureUrl: igProfile?.profilePictureUrl ?? null,
                savedAt: Date.now(),
              });
            } else if (handle && igToken) {
              // Instagram-only account (this app's usual flow): the handle
              // is the identity — nothing password-related exists to store.
              key = `ig:${handle.toLowerCase()}`;
              savedNext = upsertSavedAccount({
                email: key,
                refreshToken: '',
                instagramToken: igToken,
                instagramUsername: handle,
                instagramPictureUrl: igProfile?.profilePictureUrl ?? null,
                savedAt: Date.now(),
              });
            }
            if (savedNext && key) {
              // One row per Instagram handle: if this connection was ever
              // saved twice (once by email, once by handle), collapse it to
              // a single row so switching accounts really changes accounts.
              const keyNow = key.toLowerCase();
              const lowerHandle = handle?.toLowerCase() ?? null;
              const deduped = lowerHandle
                ? savedNext.filter(
                    (entry) =>
                      entry.email.toLowerCase() === keyNow ||
                      entry.instagramUsername?.toLowerCase() !== lowerHandle,
                  )
                : savedNext;
              if (deduped.length !== savedNext.length) {
                persistSavedAccounts(deduped);
              }
              setSavedAccounts(deduped);
            }
            setSaveAccountPrompt(null);
            // Login-time prompt: continue into the app. Connect-time
            // prompt leaves you on the connected screen's Continue.
            if (screen === 'auth') {
              setScreen('home');
            }
          }}
          onNotNow={() => {
            // Declining = don't save; an unsaved account is asked again at
            // the next sign-in (login screen or Instagram connect).
            const prompt = saveAccountPrompt;
            setSavedAccounts(
              removeSavedAccount(
                prompt.email ?? `ig:${prompt.handle.toLowerCase()}`,
              ),
            );
            setSaveAccountPrompt(null);
            if (screen === 'auth') {
              setScreen('home');
            }
          }}
        />
      ) : null}

      {/* Long-press the Profile tab (or tap the connected card on the
          Connect page): swap between remembered accounts. */}
      <SavedAccountsSheet
        visible={accountSwitcherOpen}
        currentEmail={loadAuthSession()?.email ?? null}
        accounts={savedAccounts.map((account) => ({
          email: account.email,
          instagramUsername: account.instagramUsername,
          instagramPictureUrl: account.instagramPictureUrl,
        }))}
        onClose={() => setAccountSwitcherOpen(false)}
        onPick={(email) => {
          setAccountSwitcherOpen(false);
          void loginWithSavedAccount(email, {
            // Swapping from the Connect page stays there (login on the same
            // page); elsewhere it lands on home.
            stayOnScreen: screen === 'connect',
          });
        }}
        onForget={(email) => forgetSavedAccount(email)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // Anchors the absolutely-positioned bottom bar to the app box on web so
    // it can never resolve against (and drift with) the document.
    position: 'relative',
  },
});
