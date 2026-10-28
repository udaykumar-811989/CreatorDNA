import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  ImageIcon,
  LinkOutIcon,
  PlusIcon,
  QuoteIcon,
  RefreshIcon,
  SendIcon,
  SparkIcon,
  TrashIcon,
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
  Toggle,
} from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReportSheet } from '../components/ReportSheet';
import {
  FEED_SORTS,
  FEED_SORT_LABELS,
  FEED_SORT_RULES,
  LEADERBOARD_RULES,
  LEADERBOARD_SCOPE_RULES,
  MEDIA_MAX_BYTES,
  POST_KINDS,
  POST_KIND_LABELS,
  TOP_CREATOR_LIMIT,
  currentUserIdFromToken,
  validateComment,
  validateDisplayName,
  validateHandle,
  validateNiche,
  validatePostBody,
  type CommunityPost,
  type CreatorProfile,
  type FeedSort,
  type LeaderboardRow,
  type PostComment,
  type PostKind,
  type ReportReason,
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

// Discover — the app's window onto what is happening around it.
//
// Three tabs, each honest about where its numbers come from:
//   Trends       real Reddit / X / Hacker News posts, each linking to its source
//   Community    the in-app feed: photo posts, likes and comments, in a Latest
//                or Trending order whose rule is printed on screen
//   Top Creators the connected Instagram accounts, ranked 1..20 by the follower
//                count this app read from Instagram itself
//
// Nothing here is seeded or invented. A source without a configured credential
// says so by name; an empty feed says so plainly; the ranking prints its rule.

export type DiscoverTab = 'trends' | 'community' | 'topCreators';

type Tab = DiscoverTab;

const TAB_ORDER: Tab[] = ['trends', 'community', 'topCreators'];

const TAB_LABELS: Record<Tab, string> = {
  trends: 'Trends',
  community: 'Community',
  topCreators: 'Top Creators',
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
  initialTab,
  onTabChange,
  onOpenCreator,
}: {
  getCreatorToken: () => Promise<string>;
  /** Hands a trend's subject to the Ideas tab so AI can build a post from it. */
  onTurnToIdea: (topic: string) => void;
  /** Sub-tab to restore — the shell keeps it while a profile is open. */
  initialTab?: DiscoverTab;
  onTabChange?: (tab: DiscoverTab) => void;
  /** Opens a creator's profile screen. */
  onOpenCreator: (userId: string) => void;
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

  const [tab, setTab] = useState<Tab>(initialTab ?? 'trends');
  const [meId, setMeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The shell stores the sub-tab so returning from a profile lands back here.
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);

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
        photoPreview: { gap: 8 },
        photoImage: {
          width: '100%',
          aspectRatio: 4 / 3,
          borderRadius: radius.md,
          backgroundColor: c.track,
        },
        attach: {
          flexDirection: 'row',
          gap: 6,
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },

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
  const [feedSort, setFeedSort] = useState<FeedSort>('latest');
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<PostKind>('update');
  const [composerBody, setComposerBody] = useState('');
  const [composerSending, setComposerSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  // The picked photo, held locally until the post is actually created. It is
  // uploaded first and the returned storage URL is what gets written to the
  // row — the device path never leaves the device as data.
  const [composerPhoto, setComposerPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

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

  // Editing, deleting, reporting, and the directory-visibility switch.
  const [editPost, setEditPost] = useState<CommunityPost | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editKind, setEditKind] = useState<PostKind>('update');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunityPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<PostComment | null>(null);
  const [deleteCommentBusy, setDeleteCommentBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'post' | 'comment' | 'profile';
    id: string;
    label: string;
  } | null>(null);
  const [listedBusy, setListedBusy] = useState(false);

  const loadFeed = useCallback(
    async (options: { kind?: PostKind | 'all'; sort?: FeedSort } = {}) => {
      const kind = options.kind ?? feedKind;
      const sort = options.sort ?? feedSort;
      setFeedLoading(true);
      setFeedError(null);
      try {
        const token = await getCreatorToken();
        const me = recordId(token);
        const [profileResult, postResult] = await Promise.all([
          community.listProfiles(token, me ? { userId: me, limit: 1 } : { limit: 1, offset: 0 }),
          community.listPosts(token, { kind, sort, limit: 20 }),
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
    [feedKind, feedSort, getCreatorToken, recordId],
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
      // The photo goes up first: if the upload fails the creator still keeps
      // their words, and is told plainly what happened before posting.
      let mediaUrl: string | null = null;
      if (composerPhoto) {
        const upload = await community.uploadPostPhoto(token, composerPhoto);
        if (!alive.current) return;
        if (!upload.ok) {
          setComposerError(upload.message);
          return;
        }
        mediaUrl = upload.data;
      }
      const result = await community.createPost(token, {
        kind: composerKind,
        body: body.value,
        mediaUrl,
      });
      if (!alive.current) return;
      if (!result.ok) {
        // The photo is already in storage but its post never existed — remove
        // it so a failed share does not leave an orphaned object behind.
        if (mediaUrl) void community.deletePostPhoto(token, mediaUrl);
        setComposerError(result.message);
        return;
      }
      const decorated = await community.decoratePosts(token, [result.data]);
      if (!alive.current) return;
      const created = decorated.ok ? decorated.data[0] : result.data;
      setPosts((prev) => [created, ...prev]);
      setPostsTotal((total) => (total === null ? null : total + 1));
      setComposerBody('');
      setComposerPhoto(null);
      setComposerOpen(false);
      setFeedKind('all');
    } catch {
      if (alive.current) setComposerError('Your update could not be posted. Please retry.');
    } finally {
      if (alive.current) setComposerSending(false);
    }
  }, [composerBody, composerKind, composerPhoto, getCreatorToken]);

  /**
   * Attaches one photo. Nothing is uploaded here — only chosen — so a creator
   * who changes their mind can remove it before the post exists. Metadata
   * (including location) is not read from the file.
   */
  const pickPhoto = useCallback(async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setComposerError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      if (asset.fileSize && asset.fileSize > MEDIA_MAX_BYTES) {
        setComposerError('That photo is over the 8 MB limit. Pick a smaller one.');
        return;
      }
      setComposerPhoto(asset.uri);
    } catch {
      if (alive.current) {
        setComposerError('The photo picker could not be opened. Check permissions and retry.');
      }
    } finally {
      if (alive.current) setPhotoBusy(false);
    }
  }, [photoBusy]);

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

  // ------------------------------------------------- edit / delete / report

  const startEdit = useCallback((post: CommunityPost) => {
    setEditPost(post);
    setEditBody(post.body);
    setEditKind(post.kind);
    setEditError(null);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editPost) return;
    const body = validatePostBody(editBody);
    if (!body.ok) {
      setEditError(body.error);
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const token = await getCreatorToken();
      const result = await community.updatePost(token, editPost.id, {
        kind: editKind,
        body: body.value,
      });
      if (!alive.current) return;
      if (!result.ok) {
        setEditError(result.message);
        return;
      }
      setPosts((prev) =>
        prev.map((entry) =>
          entry.id === editPost.id
            ? { ...entry, ...result.data, author: entry.author, likedByMe: entry.likedByMe }
            : entry,
        ),
      );
      setEditPost(null);
      setNotice('Your update was saved.');
    } catch {
      if (alive.current) setEditError('Your update could not be saved. Please retry.');
    } finally {
      if (alive.current) setEditSaving(false);
    }
  }, [editPost, editBody, editKind, getCreatorToken]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const token = await getCreatorToken();
      const result = await community.deletePost(token, deleteTarget.id);
      if (!alive.current) return;
      if (!result.ok) {
        setNotice(result.message);
        setDeleteTarget(null);
        return;
      }
      const id = deleteTarget.id;
      // Best effort: the post is gone, so a photo that cannot be removed must
      // not turn a successful delete into an error. It is already unreadable
      // to everyone once its post row is deleted.
      if (deleteTarget.mediaUrl) void community.deletePostPhoto(token, deleteTarget.mediaUrl);
      setPosts((prev) => prev.filter((entry) => entry.id !== id));
      setPostsTotal((total) => (total === null ? null : Math.max(0, total - 1)));
      if (openPostId === id) {
        setOpenPostId(null);
        setComments([]);
      }
      setDeleteTarget(null);
      setNotice('Your post was deleted.');
    } catch {
      if (alive.current) setNotice('That update could not be deleted. Please retry.');
    } finally {
      if (alive.current) setDeleteBusy(false);
    }
  }, [deleteTarget, openPostId, getCreatorToken]);

  const confirmDeleteComment = useCallback(async () => {
    if (!deleteCommentTarget || !openPostId) return;
    setDeleteCommentBusy(true);
    try {
      const token = await getCreatorToken();
      const result = await community.deleteComment(token, deleteCommentTarget.id);
      if (!alive.current) return;
      if (!result.ok) {
        setCommentsError(result.message);
        setDeleteCommentTarget(null);
        return;
      }
      const id = deleteCommentTarget.id;
      setComments((prev) => prev.filter((entry) => entry.id !== id));
      setPosts((prev) =>
        prev.map((entry) =>
          entry.id === openPostId
            ? { ...entry, commentCount: Math.max(0, entry.commentCount - 1) }
            : entry,
        ),
      );
      setDeleteCommentTarget(null);
    } catch {
      if (alive.current) setCommentsError('That comment could not be removed. Please retry.');
    } finally {
      if (alive.current) setDeleteCommentBusy(false);
    }
  }, [deleteCommentTarget, openPostId, getCreatorToken]);

  const submitReport = useCallback(
    async (reason: ReportReason, details: string): Promise<string | null> => {
      if (!reportTarget) return null;
      try {
        const token = await getCreatorToken();
        const result = await community.reportContent(token, {
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          reason,
          details,
        });
        if (!alive.current) return null;
        if (!result.ok) return result.message;
        setReportTarget(null);
        setNotice('Thanks — your report was sent to the moderators.');
        return null;
      } catch {
        return 'Your report could not be sent. Please retry.';
      }
    },
    [reportTarget, getCreatorToken],
  );

  /**
   * Directory visibility. The profile row is saved whole, with only this one
   * flag flipped, so nothing else the creator typed can be lost by toggling it.
   */
  const toggleListed = useCallback(async () => {
    if (!myProfile || listedBusy) return;
    const next = !myProfile.isListed;
    const previous = myProfile;
    setListedBusy(true);
    setMyProfile({ ...previous, isListed: next });
    try {
      const token = await getCreatorToken();
      const result = await community.saveProfile(token, {
        handle: previous.handle,
        displayName: previous.displayName,
        bio: previous.bio,
        niche: previous.niche,
        goals: previous.goals,
        avatarUrl: previous.avatarUrl,
        website: previous.website,
        location: previous.location,
        isListed: next,
      });
      if (!alive.current) return;
      if (!result.ok) {
        setMyProfile(previous);
        setNotice(result.message);
        return;
      }
      setMyProfile(result.data);
      setNotice(
        next
          ? 'Your profile is now visible in the directory and on the leaderboard.'
          : 'Your profile is hidden from the directory and the leaderboard.',
      );
    } catch {
      if (!alive.current) return;
      setMyProfile(previous);
      setNotice('That change could not be saved. Please retry.');
    } finally {
      if (alive.current) setListedBusy(false);
    }
  }, [myProfile, listedBusy, getCreatorToken]);

  // ======================================================== TOP CREATORS ====
  //
  // One list, one rule: the accounts whose Instagram this app has actually
  // read, ordered by that follower count, ranked 1..20. No metric, window or
  // niche controls here — each of those would answer a different question
  // than the one this tab asks, and the rule is printed under the title.

  const [top, setTop] = useState<LeaderboardRow[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const loadTop = useCallback(async () => {
    setTopLoading(true);
    setTopError(null);
    try {
      const token = await getCreatorToken();
      recordId(token);
      // `instagram` names both the column and the pool: the server ranks only
      // creators it has a verified reading for, so nothing on this device can
      // widen the list or move a rank.
      const result = await community.fetchLeaderboard(token, 'instagram', {
        limit: TOP_CREATOR_LIMIT,
        verifiedOnly: true,
      });
      if (!alive.current) return;
      if (!result.ok) {
        setTopError(result.message);
        setTop([]);
        return;
      }
      setTop(result.data);
    } catch {
      if (alive.current) {
        setTopError('The ranking could not be loaded. Check your connection and retry.');
      }
    } finally {
      if (alive.current) setTopLoading(false);
    }
  }, [getCreatorToken, recordId]);

  // Each tab loads the first time it is opened and refreshes on demand; the
  // data it already fetched stays on screen while the creator switches back.
  const loadedTabs = useRef<Set<Tab>>(new Set());
  useEffect(() => {
    if (loadedTabs.current.has(tab)) return;
    loadedTabs.current.add(tab);
    if (tab === 'community') void loadFeed();
    if (tab === 'topCreators') void loadTop();
  }, [tab, loadFeed, loadTop]);

  // ================================================================ render ===

  const refreshNow = useCallback(() => {
    setNotice(null);
    if (tab === 'trends') void loadTrends({ force: true });
    else if (tab === 'community') void loadFeed();
    else void loadTop();
  }, [tab, loadTrends, loadFeed, loadTop]);

  const busy =
    tab === 'trends' ? trendsRefreshing : tab === 'community' ? feedLoading : topLoading;

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

  const renderCommunity = () => (
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
          <Text style={s.composerTitle}>Share a post</Text>
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
              placeholder="What are you working on? Add a caption for your photo. Max 1000 characters."
              placeholderTextColor={c.onDarkDim}
              multiline
              maxLength={1000}
              style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]}
              accessibilityLabel="Post text"
            />
            {composerPhoto ? (
              <View style={s.photoPreview}>
                <Image
                  source={{ uri: composerPhoto }}
                  style={s.photoImage as StyleProp<ImageStyle>}
                  resizeMode="cover"
                  accessibilityLabel="Photo attached to this post"
                />
                <Pressable
                  onPress={() => setComposerPhoto(null)}
                  style={s.refresh}
                  accessibilityRole="button"
                  accessibilityLabel="Remove the attached photo"
                >
                  <TrashIcon size={14} color={c.red} />
                  <Text style={[s.refreshLabel, { color: c.red }]}>Remove photo</Text>
                </Pressable>
              </View>
            ) : null}
            {composerError ? <Text style={s.fieldError}>{composerError}</Text> : null}
            <View style={s.composerActions}>
              <Pressable
                onPress={() => void pickPhoto()}
                disabled={photoBusy}
                style={s.attach}
                accessibilityRole="button"
                accessibilityLabel={composerPhoto ? 'Change the photo' : 'Add a photo'}
              >
                {photoBusy ? (
                  <ActivityIndicator size="small" color={c.primary} />
                ) : (
                  <ImageIcon size={16} color={c.primary} />
                )}
                <Text style={s.refreshLabel}>
                  {photoBusy ? 'Opening…' : composerPhoto ? 'Change photo' : 'Add photo'}
                </Text>
              </Pressable>
              <GradientButton
                label={composerSending ? 'Sharing…' : 'Share a post'}
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
              ? 'Share a photo or an update — every signed-in creator can see, like and comment on it.'
              : 'Create your handle above to post.'}
          </Text>
        )}
      </Card>

      {profileLoaded && myProfile ? (
        <Card tone={tone} style={s.card}>
          <View style={s.composerHead}>
            <Text style={s.composerTitle}>Directory visibility</Text>
            <Toggle
              value={myProfile.isListed}
              onChange={() => void toggleListed()}
              disabled={listedBusy}
              label="Show my profile in the directory"
            />
          </View>
          <Text style={s.excerpt}>
            {listedBusy
              ? 'Saving…'
              : myProfile.isListed
                ? 'Your profile appears on Top Creators if your Instagram is connected, and other creators can follow you.'
                : 'Your profile is hidden from Top Creators. Your posts still show your handle in the community.'}
          </Text>
        </Card>
      ) : null}

      {editPost ? (
        <Card tone={tone} style={s.composer}>
          <View style={s.composerHead}>
            <Text style={s.composerTitle}>Edit your update</Text>
            <Pressable
              onPress={() => setEditPost(null)}
              style={s.refresh}
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
            >
              <Text style={s.refreshLabel}>Cancel</Text>
            </Pressable>
          </View>
          <ChipRow
            options={POST_KINDS.map((kind) => ({ key: kind, label: POST_KIND_LABELS[kind] }))}
            value={editKind}
            onChange={(key) => setEditKind(key as PostKind)}
            label="Update type"
          />
          <TextInput
            value={editBody}
            onChangeText={setEditBody}
            placeholder="What are you working on?"
            placeholderTextColor={c.onDarkDim}
            multiline
            maxLength={2000}
            style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]}
            accessibilityLabel="Edit update text"
          />
          {editError ? <Text style={s.fieldError}>{editError}</Text> : null}
          <GradientButton
            label={editSaving ? 'Saving…' : 'Save changes'}
            onPress={() => void submitEdit()}
            loading={editSaving}
            disabled={editSaving}
            style={{ flexGrow: 1 }}
          />
        </Card>
      ) : null}

      <View style={s.toolbar}>
        <ChipRow
          options={FEED_SORTS.map((entry) => ({ key: entry, label: FEED_SORT_LABELS[entry] }))}
          value={feedSort}
          onChange={(key) => {
            const next = key as FeedSort;
            setFeedSort(next);
            loadedTabs.current.add('community');
            void loadFeed({ sort: next });
          }}
          label="Order the community feed"
        />
      </View>
      <Text style={s.stamp}>{FEED_SORT_RULES[feedSort]}</Text>

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
            loadedTabs.current.add('community');
            void loadFeed({ kind: next });
          }}
          label="Filter posts"
        />
      </View>

      <View style={s.toolbar}>
        <Text style={s.stamp}>
          {feedLoading
            ? 'Loading posts…'
            : postsTotal !== null
              ? `${postsTotal} post${postsTotal === 1 ? '' : 's'}`
              : `${posts.length} shown`}
        </Text>
        <Pressable
          onPress={() => void loadFeed()}
          style={s.refresh}
          disabled={feedLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh posts"
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
          title={feedSort === 'trending' ? 'Nothing trending yet' : 'No posts yet'}
          hint={
            feedSort === 'trending'
              ? 'Trending is ordered by real likes and comments — the first post gets it moving.'
              : feedKind === 'all'
                ? 'Be the first to share a photo or an update — every signed-in creator can see it.'
                : `No ${POST_KIND_LABELS[feedKind as PostKind].toLowerCase()} posts yet. Try “All”.`
          }
          actionLabel={
            feedSort === 'trending' ? 'See latest' : feedKind === 'all' ? undefined : 'Show all'
          }
          onAction={
            feedSort === 'trending'
              ? () => {
                  setFeedSort('latest');
                  void loadFeed({ sort: 'latest' });
                }
              : feedKind === 'all'
                ? undefined
                : () => setFeedKind('all')
          }
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
              onOpenProfile={(userId) => onOpenCreator(userId)}
              onEdit={() => startEdit(post)}
              onDelete={() => setDeleteTarget(post)}
              onDeleteComment={(commentId) =>
                setDeleteCommentTarget(comments.find((entry) => entry.id === commentId) ?? null)
              }
              onReport={(targetType, targetId, label) =>
                setReportTarget({ type: targetType, id: targetId, label })
              }
              myId={meId}
              tone={tone}
            />
          ))}
        </View>
      )}
    </>
  );

  /**
   * The single number this tab ranks on. `-1` from the RPC means no reading
   * exists, and it is shown as unavailable rather than as a confident zero —
   * a pool member always has a real count, so this is belt and braces.
   */
  const igFollowerCaption = (row: LeaderboardRow): string =>
    row.instagramFollowers >= 0
      ? formatCount(row.instagramFollowers)
      : 'Unavailable';

  const renderTopCreators = () => (
    <>
      {/* The rules are printed, not buried: who qualifies and how they are
          ordered is the whole contract of this tab. */}
      <Text style={s.rules}>{LEADERBOARD_SCOPE_RULES.top}</Text>
      <Text style={s.rules}>{LEADERBOARD_RULES.instagram}</Text>

      <View style={s.toolbar}>
        <Text style={s.stamp}>
          {topLoading
            ? 'Ranking…'
            : top.length === 0
              ? `Top ${TOP_CREATOR_LIMIT} · ranked 1–${TOP_CREATOR_LIMIT}`
              : `Top ${top.length} of ${TOP_CREATOR_LIMIT} · ranked 1–${top.length}`}
        </Text>
        <Pressable
          onPress={() => void loadTop()}
          style={s.refresh}
          disabled={topLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh the ranking"
        >
          {topLoading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <RefreshIcon size={16} color={c.primary} />
          )}
          <Text style={s.refreshLabel}>Refresh</Text>
        </Pressable>
      </View>

      {topError ? <ErrorBanner message={topError} onRetry={() => void loadTop()} s={s} /> : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {topLoading && top.length === 0 ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((row) => (
            <RowSkeleton key={row} s={s} />
          ))}
        </View>
      ) : top.length === 0 ? (
        <EmptyState
          tone={tone}
          glyph="#"
          title="No Instagram-connected creators yet"
          hint="This list fills itself: a creator appears once they open CreatorDNA, connect Instagram, and let the app read their real follower count. Connect yours to be ranked."
          actionLabel="Refresh"
          onAction={() => void loadTop()}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {top.map((row) => (
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
                </Text>
                <View style={s.metaRow}>
                  <Badge label={`${igFollowerCaption(row)} IG followers`} tone="green" />
                  {row.verified ? <Badge label="Verified" tone="blue" /> : null}
                </View>
              </View>
              <View style={s.boardValue}>
                <Text style={s.boardNumber}>{igFollowerCaption(row)}</Text>
                <Text style={s.boardCaption}>Instagram followers</Text>
                <Pressable
                  onPress={() => onOpenCreator(row.userId)}
                  style={s.link}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${row.displayName}'s profile`}
                >
                  <Text style={s.linkLabel}>Profile</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}

      <Text style={s.rules}>
        Every row above is a connected account and every number is the follower count this app
        read from Instagram. Ranks are 1–{TOP_CREATOR_LIMIT}, do not restart on a later page, and
        never come from an estimate or a guess.
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
        {tab === 'community' ? renderCommunity() : null}
        {tab === 'topCreators' ? renderTopCreators() : null}
      </ScrollView>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this update?"
        message={`${
          deleteTarget ? `“${deleteTarget.body.slice(0, 110)}${deleteTarget.body.length > 110 ? '…' : ''}”` : 'This update'
        } and its comments will be removed for everyone. This cannot be undone.`}
        confirmLabel="Delete update"
        destructive
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />

      <ConfirmDialog
        visible={deleteCommentTarget !== null}
        title="Delete this comment?"
        message="Your comment will be removed from the conversation. This cannot be undone."
        confirmLabel="Delete comment"
        destructive
        busy={deleteCommentBusy}
        onCancel={() => setDeleteCommentTarget(null)}
        onConfirm={() => void confirmDeleteComment()}
      />

      <ReportSheet
        visible={reportTarget !== null}
        targetLabel={reportTarget?.label ?? 'this content'}
        onCancel={() => setReportTarget(null)}
        onSubmit={submitReport}
      />
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
  onEdit,
  onDelete,
  onDeleteComment,
  onReport,
  myId,
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
  /** Opens the author's profile — the author id, not the handle. */
  onOpenProfile: (userId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteComment: (commentId: string) => void;
  onReport: (type: 'post' | 'comment', id: string, label: string) => void;
  /** The signed-in creator's id — decides which row actions are offered. */
  myId: string | null;
}) {
  const c = useThemeColors();
  const author = post.author;
  const isMine = myId !== null && post.userId === myId;
  // A photo URL that fails to load shows an honest line instead of an empty
  // box, and never retries in a loop.
  const [photoBroken, setPhotoBroken] = useState(false);
  return (
    <Card tone={tone} style={s.card}>
      <View style={s.postHead}>
        <Avatar uri={author?.avatarUrl ?? null} name={author?.displayName ?? '?'} size={40} />
        <Pressable
          style={s.postWho}
          onPress={() => author && onOpenProfile(author.userId)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${author?.displayName ?? 'creator'}'s profile`}
        >
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
      {post.mediaUrl && !photoBroken ? (
        <View style={s.photoPreview}>
          <Image
            source={{ uri: post.mediaUrl }}
            style={s.photoImage as StyleProp<ImageStyle>}
            resizeMode="cover"
            onError={() => setPhotoBroken(true)}
            accessibilityLabel={`Photo shared by ${author?.displayName ?? 'a creator'}`}
          />
        </View>
      ) : null}
      {post.mediaUrl && photoBroken ? (
        <Text style={s.stamp}>The photo for this post could not be loaded.</Text>
      ) : null}
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

      <View style={s.actions}>
        {isMine ? (
          <>
            <Pressable
              onPress={onEdit}
              style={s.link}
              accessibilityRole="button"
              accessibilityLabel="Edit this update"
            >
              <Text style={s.linkLabel}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={s.link}
              accessibilityRole="button"
              accessibilityLabel="Delete this update"
            >
              <TrashIcon size={14} color={c.red} />
              <Text style={[s.linkLabel, { color: c.red }]}>Delete</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => onReport('post', post.id, 'this update')}
            style={s.link}
            accessibilityRole="button"
            accessibilityLabel="Report this update"
          >
            <Text style={s.linkLabel}>Report</Text>
          </Pressable>
        )}
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
                  <View style={s.actions}>
                    {myId !== null && comment.userId === myId ? (
                      <Pressable
                        onPress={() => onDeleteComment(comment.id)}
                        style={s.link}
                        accessibilityRole="button"
                        accessibilityLabel="Delete this comment"
                      >
                        <Text style={[s.linkLabel, { color: c.red }]}>Delete</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => onReport('comment', comment.id, 'this comment')}
                        style={s.link}
                        accessibilityRole="button"
                        accessibilityLabel="Report this comment"
                      >
                        <Text style={s.linkLabel}>Report</Text>
                      </Pressable>
                    )}
                  </View>
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
