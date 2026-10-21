import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';

import { BottomNav, NavTab } from './src/components/BottomNav';
import { FloatingAiButton } from './src/components/FloatingAiButton';
import type { IdeaRequest } from './src/components/modals';
import {
  AnalysisSubmission,
  ConnectionState,
  LIGHT_SCREENS,
  NAV_SCREENS,
  Screen,
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
import { ConnectScreen } from './src/screens/ConnectScreen';
import { ConnectedScreen } from './src/screens/ConnectedScreen';
import { DnaScreen } from './src/screens/DnaScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { IdeasScreen } from './src/screens/IdeasScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PerformanceScreen } from './src/screens/PerformanceScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RecommendationsScreen } from './src/screens/RecommendationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { VideoAnalysisScreen } from './src/screens/VideoAnalysisScreen';
import { colors, NAV_HEIGHT } from './src/theme';
import { ThemeProvider, useTheme } from './src/themeContext';

WebBrowser.maybeCompleteAuthSession();

const pendingOAuthStorageKey = 'veyyra.instagram.oauth-state';

// The floating AI button is hidden only on the entry flow (where it would
// fight the mock's layout) and inside the chat itself.
const NO_FAB: ReadonlySet<Screen> = new Set<Screen>([
  'onboarding',
  'auth',
  'connect',
  'connected',
  'chat',
]);

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
  const [screen, setScreen] = useState<Screen>('onboarding');
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
        error instanceof DashboardRequestError ? error.code : 'try_again',
      );
    } finally {
      setDashboardLoading(false);
    }
  }, []);

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
        setScreen('home');
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
      } else {
        clearPendingOAuthState();
        setConnectionError('login_cancelled');
        setConnectionState('failed');
      }
    } catch (error) {
      clearPendingOAuthState();
      setConnectionError(
        error instanceof Error && /^[a-z_]+$/.test(error.message)
          ? error.message
          : 'connection_setup_failed',
      );
      setConnectionState('failed');
    }
  }, [handleInstagramReturn]);

  // ---------- Auth ----------
  const authenticate = useCallback(
    async (email: string, password: string): Promise<boolean> => {
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
    if (sessionToken || profile) {
      void reconnectInstagram();
    } else {
      setConnectionState('idle');
      setConnectionError(null);
      setScreen('connect');
    }
  }, [profile, reconnectInstagram, sessionToken]);

  const logout = useCallback(() => {
    setSupabaseAccessToken(null);
    setAuthError(null);
    setOnboardingStep(0);
    setScreen('onboarding');
  }, []);

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
      '#root{position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;}';
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

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: isLight ? colors.white : colors.darkBg }]}
    >
      <StatusBar style={isLight ? 'dark' : 'light'} />
      {screen === 'onboarding' ? (
        <OnboardingScreen
          step={onboardingStep}
          onAdvance={() => setOnboardingStep((current) => current + 1)}
          onGetStarted={() => {
            setOnboardingStep(0);
            setScreen('connect');
          }}
          onSignIn={() => setScreen('auth')}
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
            setSessionToken(null);
            setProfile(null);
            setDashboard(null);
            setDashboardError(null);
            setScreen('home');
          }}
          authLoading={authLoading}
          authError={authError}
          onConnectInstagram={() => setScreen('connect')}
          onContinueWithoutInstagram={continueWithoutInstagram}
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
          onBack={() => setScreen('onboarding')}
          onConnect={() => void connectInstagram()}
          onConnected={continueToDashboard}
          onContinueWithoutInstagram={continueWithoutInstagram}
          connectionState={connectionState}
          connectionError={connectionError}
          profile={profile}
        />
      )}

      {showNav ? (
        <BottomNav active={navActive} onNavigate={navigateTab} tone={navDark ? 'dark' : 'light'} />
      ) : null}
      {showFab ? (
        <FloatingAiButton
          onPress={openChat}
          bottomReserve={showNav ? NAV_HEIGHT + 10 : 8}
        />
      ) : null}
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
