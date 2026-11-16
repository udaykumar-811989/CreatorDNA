import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import {
  BellIcon,
  BookmarkIcon,
  LinkOutIcon,
  PlayIcon,
  RefreshIcon,
  SearchIcon,
  SparkIcon,
  VideoIcon,
} from '../components/icons';
import { YouTubeEmbed } from '../components/YouTubeEmbed';
import {
  Badge,
  Card,
  EmptyState,
  ScreenHeader,
  Skeleton,
} from '../components/ui';
import {
  DEFAULT_SECTIONS,
  SOURCE_LABELS,
  TREND_SOURCE_KEYS,
  categoryLabelFor,
  engagementLabel,
  filterTrendItems,
  formatDuration,
  relativeTime,
  sectionLabel,
  type CategoryOption,
  type TrendItem,
  type TrendSectionKey,
  type TrendSourceKey,
  type TrendsPayload,
} from '../lib/discover/model';
import {
  TREND_TTL_MS,
  clearBookmark,
  fetchTrends,
  loadBookmarks,
  saveBookmark,
  trendsAgeLabel,
} from '../services/discover';
import { FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useTheme } from '../themeContext';

// Discover — the app's window onto what is happening around it.
//
// One feed, honest about where its numbers come from: nine keyless sources —
// Hacker News, Bluesky, Mastodon, Google Trends, Google News, GitHub, DEV,
// GDELT and Lobsters — each card linking back to its original story. (The
// Community feed and the Top Creators ranking were removed from this screen
// at the creator's request; the news sections below are unrelated to them.)
//
// Nothing here is seeded or invented. A source that fails, is rate limited or
// returns nothing says so by name in its own report; an empty feed says so
// plainly.

// One tone per source so a card's badge reads at a glance; colours are
// decorative (the label always spells the source out in full).
const SOURCE_TONES: Record<TrendSourceKey, 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'purple'> = {
  hackernews: 'green',
  bluesky: 'blue',
  mastodon: 'purple',
  googletrends: 'gray',
  googlenews: 'gray',
  github: 'green',
  devto: 'blue',
  gdelt: 'amber',
  lobsters: 'red',
};

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  ok: 'green',
  rate_limited: 'amber',
  unavailable: 'red',
  error: 'red',
};

/** How a source pill reads when its last pull did not succeed. */
function sourceDownLabel(status: string): string {
  if (status === 'rate_limited') return 'rate limited';
  if (status === 'unavailable') return 'down';
  return 'error';
}

/** The pseudo-section that shows locally bookmarked stories. */
const SAVED_SECTION_KEY = 'saved';

/** Human name for whatever the section rail is showing, for empty states. */
function sectionLabelOf(section: string): string {
  return section === SAVED_SECTION_KEY ? 'Saved' : sectionLabel(section) || 'this section';
}

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

/**
 * The horizontal section nav: nine sections in one row that scrolls sideways
 * rather than wrapping, so the feed keeps its editorial top strip on a phone.
 */
function SectionNav({
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
        scroll: { flexGrow: 0 },
        row: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 2 },
        chip: {
          paddingHorizontal: 15,
          paddingVertical: 9,
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scroll}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      <View style={s.row}>
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
    </ScrollView>
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
  onOpenNotifications,
}: {
  getCreatorToken: () => Promise<string>;
  /**
   * Hands the *whole* story — title, description, publisher, original URL,
   * category, image and video — to the AI Idea Studio, so the ideas are built
   * from exactly this card's source material and never another story's.
   */
  onTurnToIdea: (item: TrendItem) => void;
  /** Opens the notifications screen from the header's bell. */
  onOpenNotifications?: () => void;
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

  const [notice, setNotice] = useState<string | null>(null);

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

  /** Shares the exact story — headline plus its original link — via the sheet. */
  const shareStory = useCallback(async (item: TrendItem) => {
    try {
      await Share.share({
        message: `${item.title}\n\n${item.url}`,
        url: item.url,
        title: item.title,
      });
    } catch {
      setNotice('That story could not be shared right now.');
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

        // ---- Discover 2.0 editorial cards ----
        sectionNavBleed: { marginHorizontal: -18 },
        headerActions: { flexDirection: 'row', gap: 8 },
        headerButton: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.primarySoft,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        headerButtonOn: { backgroundColor: c.primary, borderColor: c.primary },

        pubLogo: { width: 18, height: 18, borderRadius: 9, backgroundColor: c.darkCard2 },
        publisher: { ...type.small, fontWeight: '700', color: c.onDark, flexShrink: 1 },

        mediaFrame: {
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: c.darkCard2,
        },
        mediaImage: { ...StyleSheet.absoluteFill },
        mediaFallback: {
          width: '100%',
          aspectRatio: 16 / 9,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
        },
        fallbackLogo: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: c.darkCard,
        },
        fallbackLabel: { ...type.small, color: c.onDarkDim, textAlign: 'center' },

        videoFrame: {
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: '#0B1220',
        },
        videoNoPoster: { alignItems: 'center', justifyContent: 'center' },
        playOverlay: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(6, 18, 44, 0.28)',
        },
        playCircle: {
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(13, 46, 107, 0.92)',
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.9)',
        },
        durationBadge: {
          position: 'absolute',
          right: 8,
          bottom: 8,
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: radius.sm,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
        },
        durationText: { ...type.tiny, fontWeight: '800', color: '#FFFFFF' },
        videoOverlay: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(6, 18, 44, 0.5)',
        },
        videoError: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: 18,
          backgroundColor: '#132449',
        },
        videoErrorText: { ...type.small, color: '#FFFFFF', textAlign: 'center', lineHeight: 19 },

        ideaFull: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          paddingVertical: 12,
          borderRadius: radius.pill,
          backgroundColor: c.primary,
          marginTop: 2,
        },
        ideaFullLabel: { ...type.small, fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
        moreWrap: { alignItems: 'center', paddingTop: 4 },

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
        composerPrompt: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        composerPlaceholder: { ...type.body, color: c.onDarkDim, flex: 1 },
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
        // #1–#3 get one quiet, professional distinction: the accent bar and a
        // primary-tinted rank. No medals, no badges — the number is the honour.
        rankTop: { color: c.primary, fontWeight: '900' },
        boardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 13,
          overflow: 'hidden',
        },
        boardTop: {
          backgroundColor: c.primarySoft,
          borderLeftWidth: 3,
          borderLeftColor: c.primary,
        },
        boardWho: { flex: 1 },
        boardValue: { alignItems: 'flex-end' },
        boardNumber: { ...type.h4, color: c.onDark },
        boardCaption: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.3 },
      }),
    [c],
  );

  // ============================================================== TRENDS ====

  const [sections, setSections] = useState<CategoryOption[]>(DEFAULT_SECTIONS);
  const [section, setSection] = useState<TrendSectionKey | 'saved'>('for-you');
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Locally bookmarked stories (full cards, so "Saved" works across sections
  // and while offline). Persisted through the storage layer, never uploaded.
  const [bookmarks, setBookmarks] = useState<TrendItem[]>([]);
  useEffect(() => {
    setBookmarks(loadBookmarks());
  }, []);

  // How much of the current feed is on screen — the list grows as the creator
  // scrolls (and through an explicit button), so the first paint stays fast.
  const [visibleCount, setVisibleCount] = useState(12);

  const requestKey = `${section}|${trendQuery.trim().toLowerCase()}`;

  const loadTrends = useCallback(
    async (options: { force?: boolean } = {}) => {
      // "Saved" is served from local storage — there is nothing to fetch.
      if (section === SAVED_SECTION_KEY) return;
      const key = `${section}|${trendQuery.trim().toLowerCase()}`;
      loadedKeyRef.current = key;
      if (options.force) setTrendsRefreshing(true);
      else setTrendsLoading(true);
      setTrendsError(null);
      try {
        const token = await getCreatorToken();
        const result = await fetchTrends(
          token,
          { section, query: trendQuery, limit: 40 },
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
        if (result.payload.sections.length > 0) setSections(result.payload.sections);
      } catch {
        if (alive.current) {
          setTrendsError('CreatorDNA could not load stories. Check your connection and retry.');
        }
      } finally {
        if (alive.current) {
          setTrendsLoading(false);
          setTrendsRefreshing(false);
        }
      }
    },
    [section, trendQuery, getCreatorToken],
  );

  // First paint loads once; later section/search changes debounce so typing a
  // search term does not fire a request per keystroke.
  useEffect(() => {
    if (section === SAVED_SECTION_KEY) return undefined;
    if (!bootedRef.current) {
      bootedRef.current = true;
      void loadTrends();
      return undefined;
    }
    if (loadedKeyRef.current === requestKey) return undefined;
    const timer = setTimeout(() => void loadTrends(), 450);
    return () => clearTimeout(timer);
  }, [requestKey, section, loadTrends]);

  // A new section or filter starts the list over at the first page.
  useEffect(() => {
    setVisibleCount(12);
  }, [requestKey, sourceFilter]);

  const baseTrends = useMemo(
    () =>
      filterTrendItems(section === SAVED_SECTION_KEY ? bookmarks : trends?.items ?? [], {
        source: sourceFilter,
      }),
    [section, bookmarks, trends, sourceFilter],
  );

  const visibleTrends = useMemo(
    () => baseTrends.slice(0, visibleCount),
    [baseTrends, visibleCount],
  );
  const hasMore = baseTrends.length > visibleCount;

  const toggleBookmark = useCallback((item: TrendItem) => {
    setBookmarks((prev) => {
      const saved = prev.some((entry) => entry.id === item.id);
      if (saved) {
        clearBookmark(item.id);
        return prev.filter((entry) => entry.id !== item.id);
      }
      saveBookmark(item);
      return [item, ...prev].slice(0, 50);
    });
  }, []);

  const sectionOptions = useMemo(
    () => [
      ...sections,
      {
        key: SAVED_SECTION_KEY,
        label: bookmarks.length > 0 ? `Saved · ${bookmarks.length}` : 'Saved',
      },
    ],
    [sections, bookmarks.length],
  );

  const sourceFilters = useMemo(
    () =>
      [
        { key: 'all', label: 'All sources' },
        ...TREND_SOURCE_KEYS.map((key) => ({ key, label: SOURCE_LABELS[key] })),
      ] as { key: string; label: string }[],
    [],
  );

  // ================================================================ render ===

  const refreshNow = useCallback(() => {
    setNotice(null);
    void loadTrends({ force: true });
  }, [loadTrends]);

  const busy = trendsRefreshing;

  const renderTrends = () => {
    const statusReports = trends?.sources ?? [];
    const failed = statusReports.filter((entry) => entry.status !== 'ok');
    const isSaved = section === SAVED_SECTION_KEY;
    return (
      <>
        {/* Full-bleed: the section strip runs to the screen edge and scrolls
            sideways, the way a news app's category rail does. */}
        <View style={s.sectionNavBleed}>
          <SectionNav
            options={sectionOptions}
            value={section}
            onChange={(key) => setSection(key as TrendSectionKey | 'saved')}
            label="News sections"
          />
        </View>

        {searchOpen || trendQuery ? (
          <SearchField
            value={trendQuery}
            onChange={setTrendQuery}
            placeholder="Search stories — e.g. creator economy"
            label="Search stories"
          />
        ) : null}

        <ChipRow
          options={sourceFilters}
          value={sourceFilter}
          onChange={(key) => setSourceFilter(key as TrendSourceKey | 'all')}
          label="Filter by source"
        />

        <View style={s.toolbar}>
          <Text style={s.stamp}>
            {isSaved
              ? `${baseTrends.length} saved ${baseTrends.length === 1 ? 'story' : 'stories'} on this device`
              : trendsSavedAt
                ? `Updated ${trendsAgeLabel(trendsSavedAt) ?? 'just now'}${
                    trendsStale ? ' · saved copy' : ''
                  }`
                : trendsLoading
                  ? 'Loading live stories…'
                  : 'Not loaded yet'}
          </Text>
          {!isSaved ? (
            <Pressable
              onPress={() => void loadTrends({ force: true })}
              style={s.refresh}
              disabled={trendsRefreshing}
              accessibilityRole="button"
              accessibilityLabel="Refresh stories"
            >
              {trendsRefreshing ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : (
                <RefreshIcon size={16} color={c.primary} />
              )}
              <Text style={s.refreshLabel}>Refresh</Text>
            </Pressable>
          ) : null}
        </View>

        {statusReports.length > 0 && !isSaved ? (
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
                  {entry.status === 'ok' ? `${entry.count} live` : sourceDownLabel(entry.status)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* One banner per source that failed, naming that source — the rest of
            the feed keeps rendering from the sources that answered. */}
        {failed.map((entry) => (
          <View key={entry.key} style={s.errorCard}>
            <Text style={s.errorText}>{entry.message}</Text>
          </View>
        ))}

        {trendsError && !isSaved ? (
          <ErrorBanner message={trendsError} onRetry={() => void loadTrends({ force: true })} s={s} />
        ) : null}
        {notice ? <Text style={s.notice}>{notice}</Text> : null}

        {isSaved && bookmarks.length === 0 ? (
          <EmptyState
            tone={tone}
            glyph="★"
            title="No saved stories yet"
            hint="Tap Save on any story to keep it here. Saved stories stay on this device."
            actionLabel="Browse stories"
            onAction={() => setSection('for-you')}
          />
        ) : trendsLoading && !trends && !isSaved ? (
          <View style={s.list}>
            {[0, 1, 2].map((row) => (
              <RowSkeleton key={row} s={s} />
            ))}
          </View>
        ) : visibleTrends.length === 0 ? (
          <EmptyState
            tone={tone}
            glyph="◎"
            title={trendsError ? 'Stories are unavailable right now' : 'No stories here yet'}
            hint={
              trendsError
                ? 'Retry when you have a connection.'
                : isSaved
                  ? 'Nothing saved matches this source filter.'
                  : sourceFilter !== 'all'
                    ? `No ${SOURCE_LABELS[sourceFilter as TrendSourceKey]} results for “${
                        trendQuery || sectionLabelOf(section)
                      }”. Clear the source filter to see everything.`
                    : 'Try another section, or search for a topic. Live sources are labelled above.'
            }
            actionLabel="Clear filters"
            onAction={() => {
              setSourceFilter('all');
              setTrendQuery('');
              setSection(isSaved ? 'for-you' : section);
              if (isSaved) setVisibleCount(12);
            }}
          />
        ) : (
          <View style={s.list}>
            {visibleTrends.map((item) => {
              const bookmarked = bookmarks.some((entry) => entry.id === item.id);
              const shared = {
                item,
                s,
                tone,
                bookmarked,
                onOpen: () => void openLink(item.externalUrl ?? item.url),
                onIdea: () => onTurnToIdea(item),
                onBookmark: () => toggleBookmark(item),
                onShare: () => void shareStory(item),
              };
              return item.videoUrl ? (
                <VideoCard key={item.id} {...shared} />
              ) : (
                <NewsCard key={item.id} {...shared} />
              );
            })}
            {hasMore ? (
              <View style={s.moreWrap}>
                <Pressable
                  onPress={() => setVisibleCount((count) => count + 12)}
                  style={s.refresh}
                  accessibilityRole="button"
                  accessibilityLabel="Show more stories"
                >
                  <Text style={s.refreshLabel}>
                    Show more ({baseTrends.length - visibleTrends.length} remaining)
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      </>
    );
  };

  return (
    <View style={s.screen}>
      <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
        <ScreenHeader
          title="Discover"
          subtitle="Discover what's happening. Create what's next."
          tone={tone}
          right={
            <View style={s.headerActions}>
              <Pressable
                onPress={() => setSearchOpen((open) => !open)}
                style={[s.headerButton, searchOpen && s.headerButtonOn]}
                accessibilityRole="button"
                accessibilityLabel={searchOpen ? 'Close story search' : 'Search stories'}
                accessibilityState={{ selected: searchOpen }}
              >
                <SearchIcon
                  size={18}
                  color={searchOpen && mode !== 'dark' ? '#FFFFFF' : c.primary}
                />
              </Pressable>
              {onOpenNotifications ? (
                <Pressable
                  onPress={onOpenNotifications}
                  style={s.headerButton}
                  accessibilityRole="button"
                  accessibilityLabel="Open notifications"
                >
                  <BellIcon size={18} color={c.primary} />
                </Pressable>
              ) : null}
            </View>
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={160}
        onScroll={(event) => {
          // Near the end of the news list, pull the next slice in — the feed
          // loads more of the fetched page instead of stopping at the fold.
          if (!hasMore) return;
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 700) {
            setVisibleCount((count) => count + 12);
          }
        }}
      >
        {renderTrends()}
      </ScrollView>

    </View>
  );
}

// ------------------------------------------------------------ card pieces ---

/** YouTube id from any of YouTube's URL shapes; null for anything else. */
function youtubeIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const watch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watch && watch[1]) return watch[1];
  const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (short && short[1]) return short[1];
  const path = url.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/);
  return path && path[1] ? path[1] : null;
}

type StoryActionProps = {
  item: TrendItem;
  s: ScreenStyles;
  bookmarked: boolean;
  onOpen: () => void;
  onIdea: () => void;
  onBookmark: () => void;
  onShare: () => void;
};

type StoryCardProps = StoryActionProps & { tone: 'light' | 'dark' };

/** Publisher logo, name, age and the source/category badges — every card. */
function StoryMeta({ item, s }: { item: TrendItem; s: ScreenStyles }) {
  const age = relativeTime(item.createdAt);
  const badge = categoryLabelFor(item.section);
  return (
    <View style={s.metaRow}>
      {item.publisherLogo ? (
        <Image
          source={{ uri: item.publisherLogo }}
          style={s.pubLogo as StyleProp<ImageStyle>}
          accessibilityLabel={`${item.publisher ?? item.sourceLabel} logo`}
        />
      ) : null}
      <Text style={s.publisher} numberOfLines={1}>
        {item.publisher ?? item.sourceLabel}
      </Text>
      {age ? <Text style={s.meta}>· {age}</Text> : null}
      <Badge label={item.sourceLabel} tone={SOURCE_TONES[item.source]} />
      {badge ? <Badge label={badge} tone="gray" /> : null}
    </View>
  );
}

/** Open/Save/Share, then the one action every card shares: turn into an idea. */
function StoryActions({
  item,
  bookmarked,
  onOpen,
  onIdea,
  onBookmark,
  onShare,
  s,
}: StoryActionProps) {
  const c = useThemeColors();
  return (
    <>
      <View style={s.actions}>
        <Pressable
          onPress={onOpen}
          style={s.link}
          accessibilityRole="link"
          accessibilityLabel={`Open the original story from ${item.sourceLabel}`}
        >
          <LinkOutIcon size={15} color={c.primary} />
          <Text style={s.linkLabel}>Open story</Text>
        </Pressable>
        <Pressable
          onPress={onBookmark}
          style={s.link}
          accessibilityRole="button"
          accessibilityState={{ selected: bookmarked }}
          accessibilityLabel={bookmarked ? 'Remove this story from Saved' : 'Save this story'}
        >
          <BookmarkIcon size={15} color={c.primary} filled={bookmarked} />
          <Text style={s.linkLabel}>{bookmarked ? 'Saved' : 'Save'}</Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          style={s.link}
          accessibilityRole="button"
          accessibilityLabel="Share this story"
        >
          <Text style={s.linkLabel}>Share</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={onIdea}
        style={s.ideaFull}
        accessibilityRole="button"
        accessibilityLabel="Turn this story into a content idea"
      >
        <SparkIcon size={16} color="#FFFFFF" />
        <Text style={s.ideaFullLabel}>Turn into an idea</Text>
      </Pressable>
    </>
  );
}

function NewsCard({ item, s, tone, ...actions }: StoryCardProps) {
  // A broken image falls back to the publisher's own logo on the card's own
  // surface — never stock art, never an empty grey box, never a retry loop.
  const [imageBroken, setImageBroken] = useState(false);
  const engagement = engagementLabel(item);
  return (
    <Card tone={tone} style={s.card}>
      {item.imageUrl && !imageBroken ? (
        <Pressable
          onPress={actions.onOpen}
          style={s.mediaFrame}
          accessibilityRole="link"
          accessibilityLabel={`Open the original story: ${item.title}`}
        >
          <Image
            source={{ uri: item.imageUrl }}
            style={s.mediaImage as StyleProp<ImageStyle>}
            resizeMode="cover"
            onError={() => setImageBroken(true)}
            accessibilityLabel={item.imageAlt ?? item.title}
          />
        </Pressable>
      ) : (
        <View style={s.mediaFallback} accessibilityLabel={`No image for ${item.title}`}>
          {item.publisherLogo ? (
            <Image
              source={{ uri: item.publisherLogo }}
              style={s.fallbackLogo as StyleProp<ImageStyle>}
            />
          ) : null}
          <Text style={s.fallbackLabel} numberOfLines={1}>
            {item.publisher ?? item.sourceLabel}
          </Text>
        </View>
      )}

      <StoryMeta item={item} s={s} />
      <Text style={s.title} numberOfLines={3}>
        {item.title}
      </Text>
      {item.excerpt ? (
        <Text style={s.excerpt} numberOfLines={3}>
          {item.excerpt}
        </Text>
      ) : null}
      {engagement ? <Text style={s.engagement}>{engagement}</Text> : null}
      <StoryActions item={item} s={s} {...actions} />
    </Card>
  );
}

/**
 * Native HLS/file playback for a card's own video, with honest loading and
 * error states. `expo-video` supplies the player and its fullscreen control;
 * the card stays interactive until the creator taps play.
 */
function InlineVideo({
  url,
  onReady,
  onFail,
}: {
  url: string;
  onReady: () => void;
  onFail: () => void;
}) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.play();
  });
  useEffect(() => {
    const subscription = player.addListener(
      'statusChange',
      (payload: { status?: string } | string) => {
        const status = typeof payload === 'string' ? payload : payload?.status;
        if (status === 'readyToPlay') onReady();
        if (status === 'error') onFail();
      },
    );
    return () => subscription.remove();
  }, [player, onReady, onFail]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

function VideoCard({ item, s, tone, ...actions }: StoryCardProps) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const markFail = useCallback(() => setFailed(true), []);
  const duration = formatDuration(item.durationSeconds);
  const youtubeId = item.videoKind === 'youtube' ? youtubeIdFromUrl(item.videoUrl) : null;
  const engagement = engagementLabel(item);

  return (
    <Card tone={tone} style={s.card}>
      <View style={s.videoFrame}>
        {!playing ? (
          <>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={s.mediaImage as StyleProp<ImageStyle>}
                resizeMode="cover"
                accessibilityLabel={item.imageAlt ?? `Thumbnail for ${item.title}`}
              />
            ) : (
              <View style={[s.mediaImage, s.videoNoPoster]} accessibilityLabel="Video with no thumbnail">
                <VideoIcon size={30} color="rgba(255,255,255,0.8)" />
              </View>
            )}
            <Pressable
              onPress={() => setPlaying(true)}
              style={s.playOverlay}
              accessibilityRole="button"
              accessibilityLabel={`Play video: ${item.title}`}
            >
              <View style={s.playCircle}>
                <PlayIcon size={24} color="#FFFFFF" />
              </View>
            </Pressable>
            {duration ? (
              <View style={s.durationBadge}>
                <Text style={s.durationText}>{duration}</Text>
              </View>
            ) : null}
          </>
        ) : failed ? (
          <View style={s.videoError}>
            <Text style={s.videoErrorText}>
              This video could not be played here. Open the original post instead.
            </Text>
            <Pressable
              onPress={actions.onOpen}
              style={s.link}
              accessibilityRole="button"
              accessibilityLabel="Open the original post"
            >
              <Text style={s.linkLabel}>Open source</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {youtubeId ? (
              <YouTubeEmbed
                videoId={youtubeId}
                title={item.title}
                onReady={markReady}
                onError={markFail}
              />
            ) : item.videoUrl ? (
              <InlineVideo url={item.videoUrl} onReady={markReady} onFail={markFail} />
            ) : null}
            {!ready ? (
              <View style={s.videoOverlay} accessibilityLabel="Loading video">
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            ) : null}
          </>
        )}
      </View>

      <StoryMeta item={item} s={s} />
      <Text style={s.title} numberOfLines={3}>
        {item.title}
      </Text>
      {item.excerpt ? (
        <Text style={s.excerpt} numberOfLines={3}>
          {item.excerpt}
        </Text>
      ) : null}
      {engagement ? <Text style={s.engagement}>{engagement}</Text> : null}
      <StoryActions item={item} s={s} {...actions} />
    </Card>
  );
}
