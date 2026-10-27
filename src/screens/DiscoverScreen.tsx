import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  ChevronRightIcon,
  LinkOutIcon,
  PlusIcon,
  QuoteIcon,
  RefreshIcon,
  SendIcon,
  SparkIcon,
} from '../components/icons';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  GradientButton,
  PillTabs,
  ScreenHeader,
  Skeleton,
} from '../components/ui';
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_METRIC_LABELS,
  LEADERBOARD_RULES,
  POST_KINDS,
  POST_KIND_LABELS,
  currentUserIdFromToken,
  validateBio,
  validateComment,
  validateDisplayName,
  validateHandle,
  validateNiche,
  validatePostBody,
  type CommunityPost,
  type CreatorProfile,
  type LeaderboardMetric,
  type LeaderboardRow,
  type PostComment,
  type PostKind,
} from '../lib/community/model';
import {
  DEFAULT_CATEGORIES,
  SOURCE_LABELS,
  TREND_SOURCE_KEYS,
  engagementLabel,
  filterTrendItems,
  formatCount,
  relativeTime,
  type CategoryOption,
  type TrendItem,
  type TrendSourceKey,
  type TrendsPayload,
} from '../lib/discover/model';
import * as community from '../services/community';
import { TREND_TTL_MS, fetchTrends, trendsAgeLabel } from '../services/discover';
import { FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useTheme } from '../themeContext';

// Discover — the app's window onto what is happening outside it.
//
// Four tabs, each honest about where its numbers come from:
//   Trends      real Reddit / X / Hacker News posts, each linking to its source
//   Feed        the in-app community: posts, likes and comments
//   Creators    the public creator directory, with real follows
//   Leaderboard in-app metrics, with the ranking rule printed on screen
//
// Nothing here is seeded or invented. A source without a configured credential
// says so by name; an empty feed says so plainly; a ranking shows its formula.

type Tab = 'trends' | 'feed' | 'creators' | 'leaderboard';

const TAB_ORDER: Tab[] = ['trends', 'feed', 'creators', 'leaderboard'];

const TAB_LABELS: Record<Tab, string> = {
  trends: 'Trends',
  feed: 'Feed',
  creators: 'Creators',
  leaderboard: 'Leaderboard',
};

const SOURCE_TONES: Record<TrendSourceKey, 'green' | 'amber' | 'red' | 'gray'> = {
  reddit: 'amber',
  x: 'amber',
  hackernews: 'green',
};

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  ok: 'green',
  needs_key: 'amber',
  rate_limited: 'amber',
  unavailable: 'red',
  error: 'red',
};

/**
 * Every entry of the screen's stylesheet, typed once so the card fragments
 * below can share it without each declaring its own shape. An intersection is
 * used because the same object is handed to `View`, `Text` and `TextInput`.
 */
type ScreenStyles = Record<string, StyleProp<ViewStyle & TextStyle>>;

// ------------------------------------------------------------- primitives ---

function ChipRow({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  label: string;
}) {
  const c = useThemeColors();
  const s = useMemo(
    () =>
      StyleSheet.create({
        wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        chip: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        chipOn: { backgroundColor: c.primary, borderColor: c.primary },
        label: { ...type.small, fontWeight: '700', color: c.onDarkSub, fontSize: 13 },
        labelOn: { color: '#FFFFFF' },
      }),
    [c],
  );
  return (
    <View style={s.wrap} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[s.chip, active && s.chipOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <Text style={[s.label, active && s.labelOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
}) {
  const c = useThemeColors();
  const s = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          minHeight: 46,
        },
        input: { flex: 1, ...type.body, color: c.onDark, paddingVertical: 10 },
        clear: { paddingHorizontal: 4, paddingVertical: 4 },
        clearText: { fontSize: 17, color: c.onDarkDim, fontWeight: '700' },
      }),
    [c],
  );
  return (
    <View style={s.wrap}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.onDarkDim}
        style={s.input}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          style={s.clear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text style={s.clearText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RowSkeleton({ s, lines = 2 }: { s: ScreenStyles; lines?: number }) {
  return (
    <View style={s.card} accessibilityLabel="Loading">
      <Skeleton width="55%" height={12} />
      <Skeleton width="90%" height={16} />
      {lines > 1 ? <Skeleton width="70%" height={16} /> : null}
      <Skeleton width="40%" height={12} />
    </View>
  );
}

function ErrorBanner({
  message,
  onRetry,
  s,
}: {
  message: string;
  onRetry?: () => void;
  s: ScreenStyles;
}) {
  return (
    <View style={s.errorCard} accessibilityRole="alert">
      <Text style={s.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={s.retry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ screen --

export function DiscoverScreen({
  getCreatorToken,
  onTurnToIdea,
}: {
  getCreatorToken: () => Promise<string>;
  /** Hands a trend's subject to the Ideas tab so AI can build a post from it. */
  onTurnToIdea: (topic: string) => void;
}) {
  const c = useThemeColors();
  const { mode } = useTheme();
  const tone = mode === 'dark' ? ('dark' as const) : ('light' as const);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [tab, setTab] = useState<Tab>('trends');
  const [meId, setMeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recordId = useCallback((token: string) => {
    const id = currentUserIdFromToken(token);
    if (id) setMeId(id);
    return id;
  }, []);

  const openLink = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setNotice('That link could not be opened on this device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      setNotice('That link could not be opened right now.');
    }
  }, []);

  // ------------------------------------------------------------ shared look

  const s = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: FAB_CLEARANCE + 12,
          gap: 14,
        },
        sectionTitle: {
          ...type.tiny,
          color: c.onDarkDim,
          textTransform: 'uppercase',
          marginTop: 4,
        },
        list: { gap: 12 },
        toolbar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        },
        stamp: { ...type.small, color: c.onDarkDim, flex: 1 },
        refresh: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.primarySoft,
        },
        refreshLabel: { ...type.small, fontWeight: '800', color: c.primary },

        card: { gap: 9, padding: 15 },
        errorCard: {
          gap: 10,
          padding: 15,
          borderRadius: radius.md,
          backgroundColor: c.redSoft,
          borderWidth: 1,
          borderColor: c.red,
        },
        errorText: { ...type.small, color: c.red, lineHeight: 19 },
        retry: {
          alignSelf: 'flex-start',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.red,
        },
        retryText: { ...type.small, fontWeight: '800', color: '#FFFFFF' },

        notice: {
          ...type.small,
          color: c.onDarkSub,
          backgroundColor: c.darkCard2,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: c.darkBorder,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },

        metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
        meta: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.4 },
        title: { ...type.h4, color: c.onDark, lineHeight: 23 },
        excerpt: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
        engagement: { ...type.small, color: c.onDarkSub, fontWeight: '700' },
        link: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 11,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        linkLabel: { ...type.small, fontWeight: '700', color: c.primary },
        idea: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 11,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: c.primary,
        },
        ideaLabel: { ...type.small, fontWeight: '800', color: '#FFFFFF' },
        actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 },

        sourceStrip: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
        sourcePill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        dot: { width: 7, height: 7, borderRadius: 4 },
        sourcePillLabel: { ...type.tiny, color: c.onDarkSub, letterSpacing: 0.3 },

        field: { gap: 7 },
        fieldLabel: { ...type.tiny, color: c.onDarkDim, textTransform: 'uppercase' },
        input: {
          ...type.body,
          color: c.onDark,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 11,
          minHeight: 46,
        },
        inputError: { borderColor: c.red },
        fieldError: { ...type.small, color: c.red },

        postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        postWho: { flex: 1 },
        postName: { ...type.bodyBold, color: c.onDark },
        postHandle: { ...type.small, color: c.onDarkDim },
        postBody: { ...type.body, color: c.onDarkSub },
        tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
        tag: {
          ...type.tiny,
          color: c.primary,
          backgroundColor: c.primarySoft,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: radius.pill,
          letterSpacing: 0.3,
        },
        statRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2 },
        statBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: 2,
        },
        statText: { ...type.small, fontWeight: '700', color: c.onDarkSub },
        statOn: { color: c.primary },
        divider: { height: 1, backgroundColor: c.darkBorder, marginVertical: 2 },

        comments: { gap: 10, paddingLeft: 4 },
        comment: { gap: 3 },
        commentHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
        commentName: { ...type.small, fontWeight: '800', color: c.onDark },
        commentTime: { ...type.tiny, color: c.onDarkDim },
        commentBody: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
        commentForm: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
        commentInput: {
          flex: 1,
          ...type.small,
          color: c.onDark,
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 42,
        },
        send: {
          width: 42,
          height: 42,
          borderRadius: radius.md,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        sendOff: { backgroundColor: c.track },

        composer: { gap: 10 },
        composerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        composerTitle: { ...type.h4, color: c.onDark },
        composerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },

        rank: { ...type.h4, color: c.onDarkDim, width: 30, textAlign: 'center' },
        rankTop: { color: c.primary },
        boardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 13,
          overflow: 'hidden',
        },
        boardWho: { flex: 1 },
        boardValue: { alignItems: 'flex-end' },
        boardNumber: { ...type.h4, color: c.onDark },
        boardCaption: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.3 },
        rules: {
          ...type.small,
          color: c.onDarkSub,
          backgroundColor: c.darkCard2,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: c.darkBorder,
          padding: 12,
          lineHeight: 19,
        },
      }),
    [c],
  );

  // ============================================================== TRENDS ====

  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
  const [category, setCategory] = useState('all');
  const [trendQuery, setTrendQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<TrendSourceKey | 'all'>('all');
  const [trends, setTrends] = useState<TrendsPayload | null>(null);
  const [trendsSavedAt, setTrendsSavedAt] = useState<number | null>(null);
  const [trendsStale, setTrendsStale] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsRefreshing, setTrendsRefreshing] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const bootedRef = useRef(false);

  const requestKey = `${category}|${trendQuery.trim().toLowerCase()}`;

  const loadTrends = useCallback(
    async (options: { force?: boolean } = {}) => {
      const key = `${category}|${trendQuery.trim().toLowerCase()}`;
      loadedKeyRef.current = key;
      if (options.force) setTrendsRefreshing(true);
      else setTrendsLoading(true);
      setTrendsError(null);
      try {
        const token = await getCreatorToken();
        const result = await fetchTrends(
          token,
          { category, query: trendQuery, limit: 24 },
          { force: options.force },
        );
        if (!alive.current) return;
        if (!result.ok) {
          setTrendsError(result.message);
          return;
        }
        setTrends(result.payload);
        setTrendsSavedAt(result.savedAt);
        // A cache hit older than the freshness window is a saved copy, not a
        // live pull — the stamp says so rather than implying it is current.
        setTrendsStale(
          result.fromCache &&
            (result.savedAt === null || Date.now() - result.savedAt >= TREND_TTL_MS),
        );
        if (result.payload.categories.length > 0) setCategories(result.payload.categories);
      } catch {
        if (alive.current) {
          setTrendsError('CreatorDNA could not load trends. Check your connection and retry.');
        }
      } finally {
        if (alive.current) {
          setTrendsLoading(false);
          setTrendsRefreshing(false);
        }
      }
    },
    [category, trendQuery, getCreatorToken],
  );

  // First paint loads once; later category/search changes debounce so typing a
  // search term does not fire a request per keystroke.
  useEffect(() => {
    if (!bootedRef.current) {
      bootedRef.current = true;
      void loadTrends();
      return undefined;
    }
    if (loadedKeyRef.current === requestKey) return undefined;
    const timer = setTimeout(() => void loadTrends(), 450);
    return () => clearTimeout(timer);
  }, [requestKey, loadTrends]);

  const visibleTrends = useMemo(
    () => filterTrendItems(trends?.items ?? [], { source: sourceFilter }),
    [trends, sourceFilter],
  );

  const sourceFilters = useMemo(
    () =>
      [
        { key: 'all', label: 'All sources' },
        ...TREND_SOURCE_KEYS.map((key) => ({ key, label: SOURCE_LABELS[key] })),
      ] as { key: string; label: string }[],
    [],
  );

  // ============================================================== FEED =======

  const [myProfile, setMyProfile] = useState<CreatorProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postsTotal, setPostsTotal] = useState<number | null>(null);
  const [feedKind, setFeedKind] = useState<PostKind | 'all'>('all');
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<PostKind>('update');
  const [composerBody, setComposerBody] = useState('');
  const [composerSending, setComposerSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);

  const [profileDraft, setProfileDraft] = useState({ handle: '', name: '', niche: '' });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const loadFeed = useCallback(
    async (options: { kind?: PostKind | 'all' } = {}) => {
      const kind = options.kind ?? feedKind;
      setFeedLoading(true);
      setFeedError(null);
      try {
        const token = await getCreatorToken();
        const me = recordId(token);
        const [profileResult, postResult] = await Promise.all([
          community.listProfiles(token, me ? { userId: me, limit: 1 } : { limit: 1, offset: 0 }),
          community.listPosts(token, { kind, limit: 20 }),
        ]);
        if (!alive.current) return;
        if (profileResult.ok) {
          setMyProfile(profileResult.data.items[0] ?? null);
          setProfileLoaded(true);
        }
        if (!postResult.ok) {
          setFeedError(postResult.message);
          setPosts([]);
          setPostsTotal(null);
          return;
        }
        const decorated = await community.decoratePosts(token, postResult.data.items);
        if (!alive.current) return;
        if (!decorated.ok) {
          setFeedError(decorated.message);
          return;
        }
        setPosts(decorated.data);
        setPostsTotal(postResult.data.total);
      } catch {
        if (alive.current) {
          setFeedError('Community posts could not be loaded. Check your connection and retry.');
        }
      } finally {
        if (alive.current) setFeedLoading(false);
      }
    },
    [feedKind, getCreatorToken, recordId],
  );

  const loadComments = useCallback(
    async (postId: string) => {
      setCommentsLoading(true);
      setCommentsError(null);
      setComments([]);
      try {
        const token = await getCreatorToken();
        const result = await community.listComments(token, postId, { limit: 50 });
        if (!alive.current) return;
        if (!result.ok) {
          setCommentsError(result.message);
          return;
        }
        const decorated = await community.decorateComments(token, result.data);
        if (!alive.current) return;
        if (!decorated.ok) {
          setCommentsError(decorated.message);
          return;
        }
        setComments(decorated.data);
        // A genuine view, counted server-side once per reader per post.
        community.recordPostView(token, postId);
      } catch {
        if (alive.current) setCommentsError('Comments could not be loaded. Please retry.');
      } finally {
        if (alive.current) setCommentsLoading(false);
      }
    },
    [getCreatorToken],
  );

  const toggleComments = useCallback(
    (post: CommunityPost) => {
      setComposerError(null);
      if (openPostId === post.id) {
        setOpenPostId(null);
        setComments([]);
        return;
      }
      setOpenPostId(post.id);
      void loadComments(post.id);
    },
    [openPostId, loadComments],
  );

  const toggleLike = useCallback(
    async (post: CommunityPost) => {
      if (reactionBusy) return;
      const wasLiked = Boolean(post.likedByMe);
      setReactionBusy(post.id);
      // Optimistic, then reconciled: the server's count is the truth.
      setPosts((prev) =>
        prev.map((entry) =>
          entry.id === post.id
            ? {
                ...entry,
                likedByMe: !wasLiked,
                likeCount: Math.max(0, entry.likeCount + (wasLiked ? -1 : 1)),
              }
            : entry,
        ),
      );
      try {
        const token = await getCreatorToken();
        const result = wasLiked
          ? await community.unlikePost(token, post.id)
          : await community.likePost(token, post.id);
        if (!alive.current) return;
        if (!result.ok) {
          setNotice(result.message);
          setPosts((prev) =>
            prev.map((entry) =>
              entry.id === post.id
                ? {
                    ...entry,
                    likedByMe: wasLiked,
                    likeCount: post.likeCount,
                  }
                : entry,
            ),
          );
          return;
        }
        setPosts((prev) =>
          prev.map((entry) =>
            entry.id === post.id
              ? { ...entry, likedByMe: result.data.liked, likeCount: result.data.likeCount }
              : entry,
          ),
        );
      } catch {
        if (!alive.current) return;
        setNotice('That like could not be saved. Please retry.');
        setPosts((prev) =>
          prev.map((entry) =>
            entry.id === post.id
              ? { ...entry, likedByMe: wasLiked, likeCount: post.likeCount }
              : entry,
          ),
        );
      } finally {
        if (alive.current) setReactionBusy(null);
      }
    },
    [reactionBusy, getCreatorToken],
  );

  const submitPost = useCallback(async () => {
    const body = validatePostBody(composerBody);
    if (!body.ok) {
      setComposerError(body.error);
      return;
    }
    setComposerSending(true);
    setComposerError(null);
    try {
      const token = await getCreatorToken();
      const result = await community.createPost(token, { kind: composerKind, body: body.value });
      if (!alive.current) return;
      if (!result.ok) {
        setComposerError(result.message);
        return;
      }
      const decorated = await community.decoratePosts(token, [result.data]);
      if (!alive.current) return;
      const created = decorated.ok ? decorated.data[0] : result.data;
      setPosts((prev) => [created, ...prev]);
      setPostsTotal((total) => (total === null ? null : total + 1));
      setComposerBody('');
      setComposerOpen(false);
      setFeedKind('all');
    } catch {
      if (alive.current) setComposerError('Your update could not be posted. Please retry.');
    } finally {
      if (alive.current) setComposerSending(false);
    }
  }, [composerBody, composerKind, getCreatorToken]);

  const submitComment = useCallback(async () => {
    if (!openPostId) return;
    const body = validateComment(commentBody);
    if (!body.ok) {
      setCommentsError(body.error);
      return;
    }
    setCommentSending(true);
    setCommentsError(null);
    try {
      const token = await getCreatorToken();
      const result = await community.addComment(token, openPostId, body.value);
      if (!alive.current) return;
      if (!result.ok) {
        setCommentsError(result.message);
        return;
      }
      const decorated = await community.decorateComments(token, [result.data]);
      if (!alive.current) return;
      const created = decorated.ok ? decorated.data[0] : result.data;
      setComments((prev) => [...prev, created]);
      setCommentBody('');
      setPosts((prev) =>
        prev.map((entry) =>
          entry.id === openPostId ? { ...entry, commentCount: entry.commentCount + 1 } : entry,
        ),
      );
    } catch {
      if (alive.current) setCommentsError('Your comment could not be posted. Please retry.');
    } finally {
      if (alive.current) setCommentSending(false);
    }
  }, [commentBody, openPostId, getCreatorToken]);

  const submitProfile = useCallback(async () => {
    const handle = validateHandle(profileDraft.handle);
    if (!handle.ok) {
      setProfileError(handle.error);
      return;
    }
    const name = validateDisplayName(profileDraft.name);
    if (!name.ok) {
      setProfileError(name.error);
      return;
    }
    const niche = validateNiche(profileDraft.niche);
    if (!niche.ok) {
      setProfileError(niche.error);
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const token = await getCreatorToken();
      const result = await community.saveProfile(token, {
        handle: handle.value,
        displayName: name.value,
        niche: niche.value,
      });
      if (!alive.current) return;
      if (!result.ok) {
        setProfileError(result.message);
        return;
      }
      setMyProfile(result.data);
      setProfileLoaded(true);
    } catch {
      if (alive.current) setProfileError('Your profile could not be saved. Please retry.');
    } finally {
      if (alive.current) setProfileSaving(false);
    }
  }, [profileDraft, getCreatorToken]);

  // ============================================================ CREATORS ====

  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [creatorsTotal, setCreatorsTotal] = useState<number | null>(null);
  const [creatorQuery, setCreatorQuery] = useState('');
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsError, setCreatorsError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const creatorsKeyRef = useRef<string | null>(null);
  const creatorsBootedRef = useRef(false);

  const loadCreators = useCallback(async () => {
    creatorsKeyRef.current = creatorQuery.trim().toLowerCase();
    setCreatorsLoading(true);
    setCreatorsError(null);
    try {
      const token = await getCreatorToken();
      const me = recordId(token);
      const result = await community.listProfiles(token, {
        search: creatorQuery,
        limit: 30,
      });
      if (!alive.current) return;
      if (!result.ok) {
        setCreatorsError(result.message);
        setCreators([]);
        setCreatorsTotal(null);
        return;
      }
      const others = result.data.items.filter((entry) => entry.userId !== me);
      setCreators(others);
      setCreatorsTotal(result.data.total);
      const followedResult = await community.fetchFollowedIds(
        token,
        others.map((entry) => entry.userId),
      );
      if (!alive.current) return;
      if (followedResult.ok) setFollowed(followedResult.data);
    } catch {
      if (alive.current) {
        setCreatorsError('Creators could not be loaded. Check your connection and retry.');
      }
    } finally {
      if (alive.current) setCreatorsLoading(false);
    }
  }, [creatorQuery, getCreatorToken, recordId]);

  const creatorRequestKey = creatorQuery.trim().toLowerCase();
  useEffect(() => {
    if (!creatorsBootedRef.current) {
      creatorsBootedRef.current = true;
      void loadCreators();
      return undefined;
    }
    if (creatorsKeyRef.current === creatorRequestKey) return undefined;
    const timer = setTimeout(() => void loadCreators(), 450);
    return () => clearTimeout(timer);
  }, [creatorRequestKey, loadCreators]);

  const toggleFollow = useCallback(
    async (creator: CreatorProfile) => {
      if (followBusy) return;
      const wasFollowing = followed.has(creator.userId);
      setFollowBusy(creator.userId);
      setFollowed((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.delete(creator.userId);
        else next.add(creator.userId);
        return next;
      });
      setCreators((prev) =>
        prev.map((entry) =>
          entry.userId === creator.userId
            ? {
                ...entry,
                followerCount: Math.max(0, entry.followerCount + (wasFollowing ? -1 : 1)),
              }
            : entry,
        ),
      );
      try {
        const token = await getCreatorToken();
        const result = wasFollowing
          ? await community.unfollowCreator(token, creator.userId)
          : await community.followCreator(token, creator.userId);
        if (!alive.current) return;
        if (!result.ok) {
          setNotice(result.message);
          setFollowed((prev) => {
            const next = new Set(prev);
            if (wasFollowing) next.add(creator.userId);
            else next.delete(creator.userId);
            return next;
          });
          setCreators((prev) =>
            prev.map((entry) =>
              entry.userId === creator.userId
                ? { ...entry, followerCount: creator.followerCount }
                : entry,
            ),
          );
          return;
        }
        setCreators((prev) =>
          prev.map((entry) =>
            entry.userId === creator.userId
              ? { ...entry, followerCount: result.data.followerCount }
              : entry,
          ),
        );
      } catch {
        if (!alive.current) return;
        setNotice('That follow could not be saved. Please retry.');
        setFollowed((prev) => {
          const next = new Set(prev);
          if (wasFollowing) next.add(creator.userId);
          else next.delete(creator.userId);
          return next;
        });
        setCreators((prev) =>
          prev.map((entry) =>
            entry.userId === creator.userId ? { ...entry, followerCount: creator.followerCount } : entry,
          ),
        );
      } finally {
        if (alive.current) setFollowBusy(null);
      }
    },
    [followBusy, followed, getCreatorToken],
  );

  // =========================================================== LEADERBOARD ===

  const [metric, setMetric] = useState<LeaderboardMetric>('overall');
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      const token = await getCreatorToken();
      recordId(token);
      const result = await community.fetchLeaderboard(token, metric, 25);
      if (!alive.current) return;
      if (!result.ok) {
        setBoardError(result.message);
        setBoard([]);
        return;
      }
      setBoard(result.data);
    } catch {
      if (alive.current) {
        setBoardError('The ranking could not be loaded. Check your connection and retry.');
      }
    } finally {
      if (alive.current) setBoardLoading(false);
    }
  }, [metric, getCreatorToken, recordId]);

  // Each tab loads the first time it is opened and refreshes on demand; the
  // data it already fetched stays on screen while the creator switches back.
  const loadedTabs = useRef<Set<Tab>>(new Set());
  useEffect(() => {
    if (loadedTabs.current.has(tab)) return;
    loadedTabs.current.add(tab);
    if (tab === 'feed') void loadFeed();
    if (tab === 'creators') void loadCreators();
    if (tab === 'leaderboard') void loadBoard();
  }, [tab, loadFeed, loadCreators, loadBoard]);

  // ================================================================ render ===

  const refreshNow = useCallback(() => {
    setNotice(null);
    if (tab === 'trends') void loadTrends({ force: true });
    else if (tab === 'feed') void loadFeed();
    else if (tab === 'creators') void loadCreators();
    else void loadBoard();
  }, [tab, loadTrends, loadFeed, loadCreators, loadBoard]);

  const busy =
    tab === 'trends'
      ? trendsRefreshing
      : tab === 'feed'
        ? feedLoading
        : tab === 'creators'
          ? creatorsLoading
          : boardLoading;

  const renderTrends = () => {
    const statusReports = trends?.sources ?? [];
    const failed = statusReports.filter((entry) => entry.status !== 'ok');
    return (
      <>
        <ChipRow
          options={categories}
          value={category}
          onChange={setCategory}
          label="Trend categories"
        />
        <SearchField
          value={trendQuery}
          onChange={setTrendQuery}
          placeholder="Search trends — e.g. reels hooks"
          label="Search trends"
        />
        <ChipRow
          options={sourceFilters}
          value={sourceFilter}
          onChange={(key) => setSourceFilter(key as TrendSourceKey | 'all')}
          label="Filter by source"
        />

        <View style={s.toolbar}>
          <Text style={s.stamp}>
            {trendsSavedAt
              ? `Updated ${trendsAgeLabel(trendsSavedAt) ?? 'just now'}${
                  trendsStale ? ' · saved copy' : ''
                }`
              : trendsLoading
                ? 'Loading live trends…'
                : 'Not loaded yet'}
          </Text>
          <Pressable
            onPress={() => void loadTrends({ force: true })}
            style={s.refresh}
            disabled={trendsRefreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh trends"
          >
            {trendsRefreshing ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <RefreshIcon size={16} color={c.primary} />
            )}
            <Text style={s.refreshLabel}>Refresh</Text>
          </Pressable>
        </View>

        {statusReports.length > 0 ? (
          <View style={s.sourceStrip}>
            {statusReports.map((entry) => (
              <View key={entry.key} style={s.sourcePill}>
                <View
                  style={[
                    s.dot,
                    {
                      backgroundColor:
                        STATUS_TONE[entry.status] === 'green'
                          ? c.green
                          : STATUS_TONE[entry.status] === 'amber'
                            ? c.amber
                            : c.red,
                    },
                  ]}
                />
                <Text style={s.sourcePillLabel}>
                  {SOURCE_LABELS[entry.key]} ·{' '}
                  {entry.status === 'ok' ? `${entry.count} live` : 'not connected'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {failed.map((entry) => (
          <View
            key={entry.key}
            style={[
              s.errorCard,
              entry.status === 'needs_key' && {
                backgroundColor: c.amberSoft,
                borderColor: c.amber,
              },
            ]}
          >
            <Text style={[s.errorText, entry.status === 'needs_key' && { color: '#8A5300' }]}>
              {entry.message}
            </Text>
          </View>
        ))}

        {trendsError ? (
          <ErrorBanner message={trendsError} onRetry={() => void loadTrends({ force: true })} s={s} />
        ) : null}
        {notice ? <Text style={s.notice}>{notice}</Text> : null}

        {trendsLoading && !trends ? (
          <View style={s.list}>
            {[0, 1, 2].map((row) => (
              <RowSkeleton key={row} s={s} />
            ))}
          </View>
        ) : visibleTrends.length === 0 ? (
          <EmptyState
            tone={tone}
            glyph="◎"
            title={trendsError ? 'Trends are unavailable right now' : 'No trends here yet'}
            hint={
              trendsError
                ? 'Retry when you have a connection.'
                : sourceFilter !== 'all'
                  ? `No ${SOURCE_LABELS[sourceFilter as TrendSourceKey]} results for “${
                      trendQuery || category
                    }”. Clear the source filter to see everything.`
                  : 'Try another category, or search for a topic. Live sources are labelled above.'
            }
            actionLabel="Clear filters"
            onAction={() => {
              setSourceFilter('all');
              setTrendQuery('');
              setCategory('all');
            }}
          />
        ) : (
          <View style={s.list}>
            {visibleTrends.map((item) => (
              <TrendCard
                key={item.id}
                item={item}
                s={s}
                tone={tone}
                onOpen={() => void openLink(item.externalUrl ?? item.url)}
                onIdea={() => onTurnToIdea(item.title)}
              />
            ))}
          </View>
        )}
      </>
    );
  };

  const renderFeed = () => (
    <>
      {!profileLoaded ? null : myProfile ? null : (
        <Card tone={tone} style={s.composer}>
          <Text style={s.composerTitle}>Join the community</Text>
          <Text style={s.excerpt}>
            Pick a handle so other creators can see who posted. Your posts stay hidden from the
            directory until you do.
          </Text>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Handle</Text>
            <TextInput
              value={profileDraft.handle}
              onChangeText={(next) => setProfileDraft((d) => ({ ...d, handle: next }))}
              placeholder="yourhandle"
              placeholderTextColor={c.onDarkDim}
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
              accessibilityLabel="Creator handle"
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Display name</Text>
            <TextInput
              value={profileDraft.name}
              onChangeText={(next) => setProfileDraft((d) => ({ ...d, name: next }))}
              placeholder="Your name"
              placeholderTextColor={c.onDarkDim}
              style={s.input}
              accessibilityLabel="Display name"
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Niche (optional)</Text>
            <TextInput
              value={profileDraft.niche}
              onChangeText={(next) => setProfileDraft((d) => ({ ...d, niche: next }))}
              placeholder="e.g. fitness, food, tech"
              placeholderTextColor={c.onDarkDim}
              style={s.input}
              accessibilityLabel="Niche"
            />
          </View>
          {profileError ? <Text style={s.fieldError}>{profileError}</Text> : null}
          <GradientButton
            label={profileSaving ? 'Saving…' : 'Create my profile'}
            onPress={() => void submitProfile()}
            loading={profileSaving}
            disabled={profileSaving}
          />
        </Card>
      )}

      <Card tone={tone} style={s.composer}>
        <View style={s.composerHead}>
          <Text style={s.composerTitle}>Share an update</Text>
          <Pressable
            onPress={() => setComposerOpen((open) => !open)}
            style={s.refresh}
            accessibilityRole="button"
            accessibilityLabel={composerOpen ? 'Close composer' : 'Open composer'}
          >
            <PlusIcon size={15} color={c.primary} />
            <Text style={s.refreshLabel}>{composerOpen ? 'Cancel' : 'Post'}</Text>
          </Pressable>
        </View>
        {composerOpen ? (
          <>
            <ChipRow
              options={POST_KINDS.map((kind) => ({ key: kind, label: POST_KIND_LABELS[kind] }))}
              value={composerKind}
              onChange={(key) => setComposerKind(key as PostKind)}
              label="Update type"
            />
            <TextInput
              value={composerBody}
              onChangeText={setComposerBody}
              placeholder="What are you working on? Max 1000 characters."
              placeholderTextColor={c.onDarkDim}
              multiline
              maxLength={1000}
              style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]}
              accessibilityLabel="Update text"
            />
            {composerError ? <Text style={s.fieldError}>{composerError}</Text> : null}
            <View style={s.composerActions}>
              <GradientButton
                label={composerSending ? 'Posting…' : 'Post update'}
                onPress={() => void submitPost()}
                loading={composerSending}
                disabled={composerSending}
                style={{ flexGrow: 1 }}
              />
            </View>
          </>
        ) : (
          <Text style={s.excerpt}>
            {myProfile
              ? 'Ask for feedback, share a win, or post a collab call.'
              : 'Create your handle above to post.'}
          </Text>
        )}
      </Card>

      <View style={s.toolbar}>
        <ChipRow
          options={[
            { key: 'all', label: 'All' },
            ...POST_KINDS.map((kind) => ({ key: kind, label: POST_KIND_LABELS[kind] })),
          ]}
          value={feedKind}
          onChange={(key) => {
            const next = key as PostKind | 'all';
            setFeedKind(next);
            loadedTabs.current.add('feed');
            void loadFeed({ kind: next });
          }}
          label="Filter updates"
        />
      </View>

      <View style={s.toolbar}>
        <Text style={s.stamp}>
          {feedLoading
            ? 'Loading updates…'
            : postsTotal !== null
              ? `${postsTotal} update${postsTotal === 1 ? '' : 's'}`
              : `${posts.length} shown`}
        </Text>
        <Pressable
          onPress={() => void loadFeed()}
          style={s.refresh}
          disabled={feedLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh updates"
        >
          {feedLoading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <RefreshIcon size={16} color={c.primary} />
          )}
          <Text style={s.refreshLabel}>Refresh</Text>
        </Pressable>
      </View>

      {feedError ? (
        <ErrorBanner message={feedError} onRetry={() => void loadFeed()} s={s} />
      ) : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {feedLoading && posts.length === 0 ? (
        <View style={{ gap: 12 }}>
          {[0, 1].map((row) => (
            <RowSkeleton key={row} s={s} lines={3} />
          ))}
        </View>
      ) : posts.length === 0 ? (
        <EmptyState
          tone={tone}
          glyph="✎"
          title="No updates yet"
          hint={
            feedKind === 'all'
              ? 'Be the first to share what you are working on — a win, a question, or a collab call.'
              : `No ${POST_KIND_LABELS[feedKind as PostKind].toLowerCase()} posts yet. Try “All”.`
          }
          actionLabel={feedKind === 'all' ? undefined : 'Show all'}
          onAction={feedKind === 'all' ? undefined : () => setFeedKind('all')}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              s={s}
              busy={reactionBusy === post.id}
              expanded={openPostId === post.id}
              comments={comments}
              commentsLoading={commentsLoading}
              commentsError={commentsError}
              commentBody={commentBody}
              commentSending={commentSending}
              onCommentBody={setCommentBody}
              onToggleLike={() => void toggleLike(post)}
              onToggleComments={() => toggleComments(post)}
              onSendComment={() => void submitComment()}
              onOpenProfile={(handle) => setNotice(`@${handle} is on the Creators tab.`)}
              tone={tone}
            />
          ))}
        </View>
      )}
    </>
  );

  const renderCreators = () => (
    <>
      <SearchField
        value={creatorQuery}
        onChange={setCreatorQuery}
        placeholder="Search creators, niches, handles"
        label="Search creators"
      />
      <View style={s.toolbar}>
        <Text style={s.stamp}>
          {creatorsLoading
            ? 'Searching…'
            : creatorsTotal !== null && !creatorQuery
              ? `${creatorsTotal} creator${creatorsTotal === 1 ? '' : 's'} in the directory`
              : `${creators.length} result${creators.length === 1 ? '' : 's'}`}
        </Text>
        <Pressable
          onPress={() => void loadCreators()}
          style={s.refresh}
          disabled={creatorsLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh creators"
        >
          {creatorsLoading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <RefreshIcon size={16} color={c.primary} />
          )}
          <Text style={s.refreshLabel}>Refresh</Text>
        </Pressable>
      </View>

      {creatorsError ? (
        <ErrorBanner message={creatorsError} onRetry={() => void loadCreators()} s={s} />
      ) : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {creatorsLoading && creators.length === 0 ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((row) => (
            <RowSkeleton key={row} s={s} />
          ))}
        </View>
      ) : creators.length === 0 ? (
        <EmptyState
          tone={tone}
          glyph="◍"
          title={creatorQuery ? 'No creators match that search' : 'The directory is empty'}
          hint={
            creatorQuery
              ? 'Try a shorter term, or clear the search to see everyone.'
              : 'Create your handle on the Feed tab — creators who join will appear here.'
          }
          actionLabel={creatorQuery ? 'Clear search' : undefined}
          onAction={creatorQuery ? () => setCreatorQuery('') : undefined}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {creators.map((creator) => {
            const isFollowing = followed.has(creator.userId);
            const busyRow = followBusy === creator.userId;
            return (
              <Card key={creator.userId} tone={tone} style={s.card}>
                <View style={s.postHead}>
                  <Avatar uri={creator.avatarUrl} name={creator.displayName} size={44} />
                  <View style={s.postWho}>
                    <Text style={s.postName} numberOfLines={1}>
                      {creator.displayName}
                    </Text>
                    <Text style={s.postHandle} numberOfLines={1}>
                      @{creator.handle}
                      {creator.niche ? ` · ${creator.niche}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void toggleFollow(creator)}
                    disabled={busyRow}
                    style={[
                      s.refresh,
                      isFollowing && {
                        backgroundColor: c.darkCard,
                        borderWidth: 1,
                        borderColor: c.darkBorder,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isFollowing ? `Unfollow ${creator.displayName}` : `Follow ${creator.displayName}`
                    }
                  >
                    {busyRow ? (
                      <ActivityIndicator size="small" color={c.primary} />
                    ) : (
                      <Text style={[s.refreshLabel, isFollowing && { color: c.onDarkSub }]}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    )}
                  </Pressable>
                </View>
                {creator.bio ? (
                  <Text style={s.excerpt} numberOfLines={2}>
                    {creator.bio}
                  </Text>
                ) : null}
                <Text style={s.meta}>
                  {formatCount(creator.followerCount)} followers ·{' '}
                  {formatCount(creator.postCount)} posts · {formatCount(creator.viewCount)} views
                </Text>
              </Card>
            );
          })}
        </View>
      )}
    </>
  );

  const renderLeaderboard = () => (
    <>
      <PillTabs
        options={LEADERBOARD_METRICS.map((entry) => LEADERBOARD_METRIC_LABELS[entry])}
        value={LEADERBOARD_METRIC_LABELS[metric]}
        onChange={(label) => {
          const next = LEADERBOARD_METRICS.find(
            (entry) => LEADERBOARD_METRIC_LABELS[entry] === label,
          );
          if (next) setMetric(next);
        }}
        variant={mode === 'dark' ? 'dark' : 'light'}
      />
      <Text style={s.rules}>
        How this ranking is decided: {LEADERBOARD_RULES[metric]}
      </Text>
      <View style={s.toolbar}>
        <Text style={s.stamp}>
          {boardLoading ? 'Ranking…' : `${board.length} ranked creator${board.length === 1 ? '' : 's'}`}
        </Text>
        <Pressable
          onPress={() => void loadBoard()}
          style={s.refresh}
          disabled={boardLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh ranking"
        >
          {boardLoading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <RefreshIcon size={16} color={c.primary} />
          )}
          <Text style={s.refreshLabel}>Refresh</Text>
        </Pressable>
      </View>

      {boardError ? (
        <ErrorBanner message={boardError} onRetry={() => void loadBoard()} s={s} />
      ) : null}

      {boardLoading && board.length === 0 ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((row) => (
            <RowSkeleton key={row} s={s} />
          ))}
        </View>
      ) : board.length === 0 ? (
        <EmptyState
          tone={tone}
          glyph="#"
          title="No ranking yet"
          hint="Creators appear once they have a profile and at least one measured metric."
          actionLabel="Open the directory"
          onAction={() => {
            loadedTabs.current.add('creators');
            setTab('creators');
          }}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {board.map((row) => (
            <Card
              key={row.userId}
              tone={tone}
              style={[s.boardRow, row.rank <= 3 && { backgroundColor: c.primarySoft }]}
            >
              <Text style={[s.rank, row.rank <= 3 && s.rankTop]}>{row.rank}</Text>
              <Avatar uri={row.avatarUrl} name={row.displayName} size={40} />
              <View style={s.boardWho}>
                <Text style={s.postName} numberOfLines={1}>
                  {row.displayName}
                </Text>
                <Text style={s.postHandle} numberOfLines={1}>
                  @{row.handle}
                  {row.instagramFollowers >= 0
                    ? ` · ${formatCount(row.instagramFollowers)} on Instagram`
                    : ''}
                </Text>
              </View>
              <View style={s.boardValue}>
                <Text style={s.boardNumber}>{formatCount(row.value)}</Text>
                <Text style={s.boardCaption}>
                  {metric === 'followers'
                    ? 'followers'
                    : metric === 'views'
                      ? 'views'
                      : metric === 'trending'
                        ? '7-day engagement'
                        : 'points'}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
      <Text style={s.rules}>
        Instagram follower counts are shown as a verified badge only — they never change a rank.
      </Text>
    </>
  );

  return (
    <View style={s.screen}>
      <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
        <ScreenHeader
          title="Discover"
          subtitle="Live trends, your community, and where you stand"
          tone={tone}
        />
        <PillTabs
          options={TAB_ORDER.map((entry) => TAB_LABELS[entry])}
          value={TAB_LABELS[tab]}
          onChange={(label) => {
            const next = TAB_ORDER.find((entry) => TAB_LABELS[entry] === label);
            if (next) setTab(next);
          }}
          variant={mode === 'dark' ? 'dark' : 'light'}
        />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {tab === 'trends' ? renderTrends() : null}
        {tab === 'feed' ? renderFeed() : null}
        {tab === 'creators' ? renderCreators() : null}
        {tab === 'leaderboard' ? renderLeaderboard() : null}
      </ScrollView>
    </View>
  );
}

// ------------------------------------------------------------ card pieces ---

function TrendCard({
  item,
  s,
  tone,
  onOpen,
  onIdea,
}: {
  item: TrendItem;
  s: ScreenStyles;
  tone: 'light' | 'dark';
  onOpen: () => void;
  onIdea: () => void;
}) {
  const c = useThemeColors();
  const engagement = engagementLabel(item);
  const age = relativeTime(item.createdAt);
  return (
    <Card tone={tone} style={s.card}>
      <View style={s.metaRow}>
        <Badge label={item.sourceLabel} tone={SOURCE_TONES[item.source]} />
        {item.category && item.category !== 'all' ? (
          <Text style={s.meta}>{item.category}</Text>
        ) : null}
        {age ? <Text style={s.meta}>· {age} ago</Text> : null}
      </View>
      <Text style={s.title} numberOfLines={3}>
        {item.title}
      </Text>
      {item.excerpt ? (
        <Text style={s.excerpt} numberOfLines={3}>
          {item.excerpt}
        </Text>
      ) : null}
      {engagement ? <Text style={s.engagement}>{engagement}</Text> : null}
      <View style={s.actions}>
        <Pressable
          onPress={onOpen}
          style={s.link}
          accessibilityRole="link"
          accessibilityLabel={`Open on ${item.sourceLabel}`}
        >
          <LinkOutIcon size={15} color={c.primary} />
          <Text style={s.linkLabel}>Open source</Text>
        </Pressable>
        <Pressable
          onPress={onIdea}
          style={s.idea}
          accessibilityRole="button"
          accessibilityLabel="Turn this trend into a content idea"
        >
          <SparkIcon size={15} color="#FFFFFF" />
          <Text style={s.ideaLabel}>Turn into an idea</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function PostCard({
  post,
  s,
  busy,
  expanded,
  comments,
  commentsLoading,
  commentsError,
  commentBody,
  commentSending,
  onCommentBody,
  onToggleLike,
  onToggleComments,
  onSendComment,
  onOpenProfile,
  tone,
}: {
  post: CommunityPost;
  s: ScreenStyles;
  tone: 'light' | 'dark';
  busy: boolean;
  expanded: boolean;
  comments: readonly PostComment[];
  commentsLoading: boolean;
  commentsError: string | null;
  commentBody: string;
  commentSending: boolean;
  onCommentBody: (next: string) => void;
  onToggleLike: () => void;
  onToggleComments: () => void;
  onSendComment: () => void;
  onOpenProfile: (handle: string) => void;
}) {
  const c = useThemeColors();
  const author = post.author;
  return (
    <Card tone={tone} style={s.card}>
      <View style={s.postHead}>
        <Avatar uri={author?.avatarUrl ?? null} name={author?.displayName ?? '?'} size={40} />
        <Pressable style={s.postWho} onPress={() => author && onOpenProfile(author.handle)}>
          <Text style={s.postName} numberOfLines={1}>
            {author?.displayName ?? 'Creator'}
          </Text>
          <Text style={s.postHandle} numberOfLines={1}>
            @{author?.handle ?? 'unknown'} · {relativeTime(post.createdAt)} ago ·{' '}
            {POST_KIND_LABELS[post.kind]}
          </Text>
        </Pressable>
      </View>

      {post.title ? (
        <Text style={s.title} numberOfLines={2}>
          {post.title}
        </Text>
      ) : null}
      <Text style={s.postBody}>{post.body}</Text>
      {post.tags.length > 0 ? (
        <View style={s.tags}>
          {post.tags.map((tag) => (
            <Text key={tag} style={s.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      ) : null}
      {post.link ? (
        <Text style={s.linkLabel} numberOfLines={1} onPress={() => {}}>
          {post.link}
        </Text>
      ) : null}

      <View style={s.statRow}>
        <Pressable
          onPress={onToggleLike}
          disabled={busy}
          style={s.statBtn}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(post.likedByMe) }}
          accessibilityLabel={post.likedByMe ? 'Unlike this update' : 'Like this update'}
        >
          <Text style={[s.statText, post.likedByMe && s.statOn]}>
            {post.likedByMe ? '♥' : '♡'} {post.likeCount}
          </Text>
        </Pressable>
        <Pressable
          onPress={onToggleComments}
          style={s.statBtn}
          accessibilityRole="button"
          accessibilityLabel="Toggle comments"
        >
          <QuoteIcon size={15} color={c.onDarkSub} />
          <Text style={s.statText}> {post.commentCount}</Text>
        </Pressable>
        <Text style={s.statText}>{formatCount(post.viewCount)} views</Text>
      </View>

      {expanded ? (
        <>
          <View style={s.divider} />
          <View style={s.comments}>
            {commentsLoading ? (
              <Text style={s.excerpt}>Loading comments…</Text>
            ) : commentsError ? (
              <Text style={s.fieldError}>{commentsError}</Text>
            ) : comments.length === 0 ? (
              <Text style={s.excerpt}>No comments yet — be the first.</Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={s.comment}>
                  <View style={s.commentHead}>
                    <Text style={s.commentName}>
                      {comment.author?.displayName ?? 'Creator'}
                    </Text>
                    <Text style={s.commentTime}>{relativeTime(comment.createdAt)} ago</Text>
                  </View>
                  <Text style={s.commentBody}>{comment.body}</Text>
                </View>
              ))
            )}
            <View style={s.commentForm}>
              <TextInput
                value={commentBody}
                onChangeText={onCommentBody}
                placeholder="Add a comment…"
                placeholderTextColor="#8296C0"
                maxLength={500}
                style={s.commentInput}
                accessibilityLabel="Add a comment"
              />
              <Pressable
                onPress={onSendComment}
                disabled={commentSending || commentBody.trim().length === 0}
                style={[s.send, (commentSending || commentBody.trim().length === 0) && s.sendOff]}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
              >
                {commentSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <SendIcon size={18} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </Card>
  );
}
