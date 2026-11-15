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
  View,
} from 'react-native';
import { setStringAsync } from 'expo-clipboard';

import {
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  GridIcon,
  LinkOutIcon,
  PlusIcon,
  QuoteIcon,
  RefreshIcon,
  SendIcon,
  SparkIcon,
} from '../components/icons';
import {
  Badge,
  EmptyState,
  GradientButton,
  OutlineButton,
  ScreenHeader,
  Skeleton,
} from '../components/ui';
import { creatorAiFunctionUrl, supabaseAnonKey } from '../lib/config';
import {
  categoryLabelFor,
  relativeTime,
  sectionLabel,
  type TrendItem,
} from '../lib/discover/model';
import {
  generateStudioIdeas,
  runStudioAction,
  type StudioAction,
  type StudioIdea,
  type StudioIdeasResult,
  type StudioStory,
} from '../services/creatorAi';
import { saveStudioIdea } from '../services/savedIdeas';
import { radius, type } from '../theme';
import { useThemeColors, useTheme, useStyles } from '../themeContext';

// The AI Idea Studio: one exact story from Discover goes in, and five insight
// blocks plus ten unique, story-grounded ideas come out. Nothing here is
// generic — every field the studio shows was written against this story's
// headline, description, publisher and link, and every per-idea action sends
// that same story back so a script can never be built from a different card.

const ALL_PLATFORMS = 'All platforms';

/** The story as the studio wants it: bounded, and only real http(s) links. */
function studioStoryOf(story: TrendItem): StudioStory {
  const description = story.excerpt.trim();
  return {
    title: story.title.slice(0, 400),
    description: description ? description.slice(0, 4000) : null,
    publisher: story.publisher,
    url: story.url,
    category: (categoryLabelFor(story.section) || sectionLabel(story.section) || '').slice(0, 120) || null,
    imageUrl: story.imageUrl,
    videoUrl: story.videoUrl,
  };
}

/** Everything one idea says, in the order a creator would paste it out. */
function ideaAsText(idea: StudioIdea): string {
  const lines = [
    idea.title,
    `Platform: ${idea.platform}`,
    '',
    `Angle: ${idea.angle}`,
    `Hook: ${idea.hook}`,
    '',
    'Outline:',
    ...idea.outline.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Script:',
    idea.script,
    '',
    `Caption: ${idea.caption}`,
    `Hashtags: ${idea.hashtags.map((tag) => `#${tag}`).join(' ')}`,
    '',
    `Thumbnail concept: ${idea.thumbnail_concept}`,
  ];
  return lines.join('\n');
}

const INSIGHT_BLOCKS: Array<{
  key: 'why_it_matters' | 'audience_interest' | 'content_opportunities' | 'trending_angle';
  label: string;
}> = [
  { key: 'why_it_matters', label: 'Why this topic matters' },
  { key: 'audience_interest', label: 'Why the audience cares' },
  { key: 'content_opportunities', label: 'Content opportunities' },
  { key: 'trending_angle', label: 'The trending angle right now' },
];

type IdeaAction = StudioAction | 'save' | 'planner' | 'copy' | 'share';

export function IdeaStudioScreen({
  story,
  onBack,
  getCreatorToken,
  onAddToPlanner,
  onViewSaved,
}: {
  story: TrendItem;
  onBack: () => void;
  getCreatorToken: () => Promise<string>;
  /** Drops the idea into the Content tab's plan as a hand-off draft. */
  onAddToPlanner: (input: { title: string; hook: string; format: string }) => void;
  /** Opens Content with the Saved list, where a saved idea can be revisited. */
  onViewSaved?: () => void;
}) {
  const c = useThemeColors();
  const { mode } = useTheme();
  const tone = mode === 'dark' ? ('dark' as const) : ('light' as const);
  const s = useStyles(makeStyles);

  const studioStory = useMemo(() => studioStoryOf(story), [story]);

  const [result, setResult] = useState<StudioIdeasResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState(ALL_PLATFORMS);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [fullScriptIds, setFullScriptIds] = useState<ReadonlySet<string>>(new Set());
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<{ id: string; action: IdeaAction } | null>(null);
  const [actionError, setActionError] = useState<{
    id: string;
    action: IdeaAction;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      if (alive.current) setNotice(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  const load = useCallback(async () => {
    if (!creatorAiFunctionUrl || !supabaseAnonKey) {
      setError('Supabase is not configured for Creator AI.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getCreatorToken();
      const next = await generateStudioIdeas(
        creatorAiFunctionUrl,
        supabaseAnonKey,
        token,
        { story: studioStory },
      );
      if (!alive.current) return;
      setResult(next);
      setPlatformFilter(ALL_PLATFORMS);
      // Open the first idea so the screen never starts as ten closed stubs.
      setExpanded(new Set(next.ideas.slice(0, 1).map((idea) => idea.id)));
      setFullScriptIds(new Set());
      setSavedIds(new Set());
    } catch (err) {
      if (!alive.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'CreatorDNA AI is temporarily unavailable. Please try again.',
      );
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [getCreatorToken, studioStory]);

  // One generation per visit to this story: a remount (navigation, a Strict
  // Mode double-effect) must not spend a second two-minute model call.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  const patchIdea = useCallback((id: string, patch: Partial<StudioIdea>) => {
    setResult((previous) =>
      previous
        ? {
            ...previous,
            ideas: previous.ideas.map((idea) =>
              idea.id === id ? { ...idea, ...patch, id } : idea,
            ),
          }
        : previous,
    );
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (idea: StudioIdea, action: IdeaAction) => {
      if (busy) return;
      setActionError(null);

      // Local actions never leave the device, so they skip the network call.
      if (action === 'copy') {
        try {
          await setStringAsync(ideaAsText(idea));
          setNotice('Idea copied to the clipboard.');
        } catch {
          setNotice('That idea could not be copied right now.');
        }
        return;
      }
      if (action === 'share') {
        try {
          await Share.share({ message: ideaAsText(idea) });
        } catch {
          setNotice('That idea could not be shared right now.');
        }
        return;
      }
      if (action === 'planner') {
        onAddToPlanner({ title: idea.title, hook: idea.hook, format: idea.platform });
        setNotice('Added to your Content plan.');
        return;
      }

      if (!creatorAiFunctionUrl || !supabaseAnonKey) {
        setActionError({
          id: idea.id,
          action,
          message: 'Supabase is not configured for Creator AI.',
        });
        return;
      }

      setBusy({ id: idea.id, action });
      try {
        const token = await getCreatorToken();
        if (action === 'save') {
          const saved = await saveStudioIdea(token, { idea, story: studioStory });
          if (!saved.ok) throw new Error(saved.message);
          if (!alive.current) return;
          setSavedIds((previous) => new Set(previous).add(idea.id));
          setNotice('Saved to your ideas.');
          return;
        }
        const next = await runStudioAction(
          creatorAiFunctionUrl,
          supabaseAnonKey,
          token,
          { action, story: studioStory, idea },
        );
        if (!alive.current) return;
        if (next.action === 'script') {
          patchIdea(idea.id, { script: next.script });
          setFullScriptIds((previous) => new Set(previous).add(idea.id));
          setExpanded((previous) => new Set(previous).add(idea.id));
          setNotice('Full script ready.');
        } else if (next.action === 'variant') {
          patchIdea(idea.id, next.idea);
          // A fresh version carries its own short script, so the old badge go.
          setFullScriptIds((previous) => {
            const copy = new Set(previous);
            copy.delete(idea.id);
            return copy;
          });
          setExpanded((previous) => new Set(previous).add(idea.id));
          setNotice('A new version of this idea is ready.');
        } else {
          patchIdea(idea.id, { thumbnail_concept: next.thumbnail });
          setExpanded((previous) => new Set(previous).add(idea.id));
          setNotice('Thumbnail concept ready.');
        }
      } catch (err) {
        if (!alive.current) return;
        setActionError({
          id: idea.id,
          action,
          message: err instanceof Error ? err.message : 'That action failed. Please retry.',
        });
      } finally {
        if (alive.current) setBusy(null);
      }
    },
    [busy, getCreatorToken, onAddToPlanner, patchIdea, studioStory],
  );

  const openOriginal = useCallback(async () => {
    try {
      await Linking.openURL(story.url);
    } catch {
      setNotice('That link could not be opened right now.');
    }
  }, [story.url]);

  const ideas = result?.ideas ?? [];
  const platforms = useMemo(() => {
    const seen: string[] = [];
    for (const idea of ideas) {
      if (!seen.includes(idea.platform)) seen.push(idea.platform);
    }
    return seen;
  }, [ideas]);
  const visibleIdeas = useMemo(
    () =>
      platformFilter === ALL_PLATFORMS
        ? ideas
        : ideas.filter((idea) => idea.platform === platformFilter),
    [ideas, platformFilter],
  );

  // ------------------------------------------------------------ rendering ---

  const renderIdea = (idea: StudioIdea) => {
    const isOpen = expanded.has(idea.id);
    const isBusy = busy?.id === idea.id;
    const isSaved = savedIds.has(idea.id);
    const hasFullScript = fullScriptIds.has(idea.id);
    const failure = actionError?.id === idea.id ? actionError.message : null;
    const chip = (action: IdeaAction) =>
      isBusy && busy?.action === action ? <ActivityIndicator size="small" color={c.primary} /> : null;

    return (
      <View key={idea.id} style={s.ideaCard}>
        <View style={s.ideaHead}>
          <Badge label={idea.platform} tone="purple" />
          {hasFullScript ? <Badge label="Full script" tone="green" /> : null}
          {isSaved ? <Badge label="Saved" tone="blue" /> : null}
        </View>

        <Text style={s.ideaTitle}>{idea.title}</Text>
        <Text style={s.ideaAngle}>{idea.angle}</Text>

        <View style={s.hookBox}>
          <QuoteIcon size={15} color={c.primary} />
          <Text style={s.hookText}>{idea.hook}</Text>
        </View>

        {isOpen ? (
          <View style={s.detail}>
            <Text style={s.detailLabel}>Outline</Text>
            {idea.outline.map((step, index) => (
              <View key={`${idea.id}-step-${index}`} style={s.outlineRow}>
                <View style={s.outlineDot}>
                  <Text style={s.outlineDotText}>{index + 1}</Text>
                </View>
                <Text style={s.outlineText}>{step}</Text>
              </View>
            ))}

            <Text style={s.detailLabel}>Script</Text>
            <Text style={s.bodyText}>{idea.script}</Text>

            <Text style={s.detailLabel}>Caption</Text>
            <Text style={s.bodyText}>{idea.caption}</Text>

            <Text style={s.detailLabel}>Hashtags</Text>
            <View style={s.hashRow}>
              {idea.hashtags.map((tag) => (
                <View key={`${idea.id}-tag-${tag}`} style={s.hashChip}>
                  <Text style={s.hashText}>{`#${tag}`}</Text>
                </View>
              ))}
            </View>

            <Text style={s.detailLabel}>Thumbnail concept</Text>
            <Text style={s.bodyText}>{idea.thumbnail_concept}</Text>
          </View>
        ) : null}

        {failure ? (
          <View style={s.errorCard}>
            <Text style={s.errorText}>{failure}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void runAction(idea, busy?.action ?? 'script')}
              style={({ pressed }) => [s.retry, pressed && { opacity: 0.75 }]}
            >
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isOpen ? 'Hide the rest of this idea' : 'Show the full idea'}
          onPress={() => toggleExpanded(idea.id)}
          style={({ pressed }) => [s.disclosure, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.disclosureLabel}>{isOpen ? 'Show less' : 'Show full idea'}</Text>
        </Pressable>

        <View style={s.actionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void runAction(idea, 'script')}
            style={({ pressed }) => [
              s.chip,
              s.chipPrimary,
              isBusy && s.chipMuted,
              pressed && { opacity: 0.82 },
            ]}
          >
            {chip('script') ?? <SparkIcon size={15} color="#FFFFFF" />}
            <Text style={[s.chipLabel, s.chipLabelPrimary]}>Full script</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void runAction(idea, 'variant')}
            style={({ pressed }) => [s.chip, isBusy && s.chipMuted, pressed && { opacity: 0.82 }]}
          >
            {chip('variant') ?? <RefreshIcon size={15} color={c.primary} />}
            <Text style={s.chipLabel}>Another version</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy || isSaved}
            onPress={() => void runAction(idea, 'save')}
            style={({ pressed }) => [
              s.chip,
              isSaved && s.chipDone,
              isBusy && s.chipMuted,
              pressed && { opacity: 0.82 },
            ]}
          >
            {chip('save') ??
              (isSaved ? (
                <CheckIcon size={15} color={c.green} />
              ) : (
                <BookmarkIcon size={15} color={c.primary} />
              ))}
            <Text style={[s.chipLabel, isSaved && s.chipLabelDone]}>
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void runAction(idea, 'copy')}
            style={({ pressed }) => [s.chip, isBusy && s.chipMuted, pressed && { opacity: 0.82 }]}
          >
            <CopyIcon size={15} color={c.primary} />
            <Text style={s.chipLabel}>Copy</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void runAction(idea, 'share')}
            style={({ pressed }) => [s.chip, isBusy && s.chipMuted, pressed && { opacity: 0.82 }]}
          >
            <SendIcon size={15} color={c.primary} />
            <Text style={s.chipLabel}>Share</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void runAction(idea, 'planner')}
            style={({ pressed }) => [s.chip, isBusy && s.chipMuted, pressed && { opacity: 0.82 }]}
          >
            <PlusIcon size={15} color={c.primary} />
            <Text style={s.chipLabel}>Add to plan</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void runAction(idea, 'thumbnail')}
            style={({ pressed }) => [s.chip, isBusy && s.chipMuted, pressed && { opacity: 0.82 }]}
          >
            {chip('thumbnail') ?? <GridIcon size={15} color={c.primary} />}
            <Text style={s.chipLabel}>Thumbnail</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <View style={s.list}>
          <View style={s.sourceCard}>
            <Skeleton height={170} radius={0} />
            <View style={s.sourceBody}>
              <Skeleton width="45%" height={14} />
              <Skeleton height={22} />
              <Skeleton height={54} />
            </View>
          </View>
          {[0, 1, 2, 3].map((row) => (
            <View key={`insight-${row}`} style={s.insightCard}>
              <Skeleton width="40%" height={12} />
              <Skeleton height={14} />
              <Skeleton width="85%" height={14} />
            </View>
          ))}
          {[0, 1].map((row) => (
            <View key={`idea-${row}`} style={s.ideaCard}>
              <Skeleton width="34%" height={20} radius={radius.pill} />
              <Skeleton width="75%" height={20} />
              <Skeleton height={14} />
              <Skeleton height={62} />
              <Skeleton width="60%" height={34} radius={radius.pill} />
            </View>
          ))}
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={c.primary} />
            <Text style={s.loadingText}>
              Reading this story and writing ten ideas — this can take up to a minute.
            </Text>
          </View>
        </View>
      );
    }

    if (error || !result) {
      return (
        <EmptyState
          tone={tone}
          glyph="✦"
          title="The studio could not start"
          hint={error ?? 'CreatorDNA AI is temporarily unavailable. Please try again.'}
          actionLabel="Try again"
          onAction={() => {
            startedRef.current = true;
            void load();
          }}
        />
      );
    }

    return (
      <View style={s.list}>
        {/* The exact story every idea below was built from. */}
        <View style={s.sourceCard}>
          {story.imageUrl && !heroImageFailed ? (
            <Image
              source={{ uri: story.imageUrl }}
              accessibilityLabel={story.imageAlt ?? story.title}
              onError={() => setHeroImageFailed(true)}
              style={s.sourceImage}
            />
          ) : (
            <View style={s.sourceImageFallback}>
              <SparkIcon size={26} color={c.primary} />
              <Text style={s.sourceFallbackText}>
                {(categoryLabelFor(story.section) || sectionLabel(story.section) || 'Story').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={s.sourceBody}>
            <View style={s.metaRow}>
              {story.publisherLogo ? (
                <Image source={{ uri: story.publisherLogo }} style={s.publisherLogo} />
              ) : null}
              <Text style={s.meta}>{story.publisher ?? story.sourceLabel}</Text>
              <Text style={s.metaDot}>·</Text>
              <Text style={s.meta}>{relativeTime(story.createdAt)}</Text>
            </View>
            <Text style={s.sourceTitle}>{story.title}</Text>
            {story.excerpt ? <Text style={s.sourceExcerpt}>{story.excerpt}</Text> : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open the original story: ${story.title}`}
              onPress={() => void openOriginal()}
              style={({ pressed }) => [s.link, pressed && { opacity: 0.72 }]}
            >
              <LinkOutIcon size={15} color={c.primary} />
              <Text style={s.linkLabel}>Open original story</Text>
            </Pressable>
          </View>
        </View>

        <Text style={s.sectionLabel}>What the studio found</Text>
        {INSIGHT_BLOCKS.map((block) => (
          <View key={block.key} style={s.insightCard}>
            <Text style={s.insightLabel}>{block.label}</Text>
            <Text style={s.insightText}>{result.insights[block.key]}</Text>
          </View>
        ))}
        <View style={s.insightCard}>
          <Text style={s.insightLabel}>Suggested formats</Text>
          <View style={s.hashRow}>
            {result.insights.suggested_formats.map((format) => (
              <View key={format} style={s.formatChip}>
                <Text style={s.formatText}>{format}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.toolbar}>
          <Text style={s.sectionLabel}>{`${ideas.length} unique ideas`}</Text>
          {onViewSaved ? (
            <Pressable
              accessibilityRole="button"
              onPress={onViewSaved}
              style={({ pressed }) => [s.savedLink, pressed && { opacity: 0.7 }]}
            >
              <BookmarkIcon size={14} color={c.primary} />
              <Text style={s.savedLinkLabel}>Saved ideas</Text>
            </Pressable>
          ) : null}
        </View>

        {platforms.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterRow}
          >
            {[ALL_PLATFORMS, ...platforms].map((platform) => {
              const active = platform === platformFilter;
              return (
                <Pressable
                  key={platform}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPlatformFilter(platform)}
                  style={({ pressed }) => [
                    s.filterChip,
                    active && s.filterChipOn,
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <Text style={[s.filterLabel, active && s.filterLabelOn]}>{platform}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {visibleIdeas.length === 0 ? (
          <EmptyState
            tone={tone}
            glyph="✦"
            title="No ideas on that platform"
            hint="Pick another platform to see the ideas written for it."
            actionLabel="Show all platforms"
            onAction={() => setPlatformFilter(ALL_PLATFORMS)}
          />
        ) : (
          visibleIdeas.map(renderIdea)
        )}
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <View style={s.headerWrap}>
        <ScreenHeader title="Idea Studio" onBack={onBack} tone={tone} />
        <Text style={s.hero}>Your next big idea starts here.</Text>
        <Text style={s.heroSub}>
          Ten unique ideas built from this exact story — pick one and make it yours.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderBody()}
      </ScrollView>

      {notice ? (
        <View style={s.toast} accessibilityRole="alert">
          <Text style={s.toastText}>{notice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.darkBg },
    headerWrap: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4, gap: 4 },
    hero: { ...type.h2, color: c.onDark, marginTop: 4 },
    heroSub: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
    content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 48, gap: 12 },
    list: { gap: 12 },

    sectionLabel: {
      ...type.tiny,
      color: c.onDarkDim,
      textTransform: 'uppercase',
      marginTop: 6,
    },

    // ---- source preview ----
    sourceCard: {
      borderRadius: radius.md,
      backgroundColor: c.darkCard,
      borderWidth: 1,
      borderColor: c.darkBorder,
      overflow: 'hidden',
    },
    sourceImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: c.darkCard2 },
    sourceImageFallback: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    sourceFallbackText: { ...type.tiny, color: c.primary, letterSpacing: 1.1 },
    sourceBody: { padding: 15, gap: 9 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    publisherLogo: { width: 18, height: 18, borderRadius: 9, backgroundColor: c.darkCard2 },
    meta: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.3 },
    metaDot: { ...type.tiny, color: c.onDarkDim },
    sourceTitle: { ...type.h4, color: c.onDark, lineHeight: 24 },
    sourceExcerpt: { ...type.small, color: c.onDarkSub, lineHeight: 20 },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: c.darkCard2,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    linkLabel: { ...type.small, fontWeight: '700', color: c.primary },

    // ---- insight blocks ----
    insightCard: {
      gap: 7,
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: c.darkCard,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    insightLabel: { ...type.tiny, color: c.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
    insightText: { ...type.body, color: c.onDark },

    // ---- toolbar + filters ----
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 4,
    },
    savedLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    savedLinkLabel: { ...type.small, fontWeight: '700', color: c.primary },
    filterRow: { gap: 8, paddingVertical: 2, paddingRight: 6 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: c.darkCard,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    filterChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    filterLabel: { ...type.small, fontWeight: '700', color: c.onDarkSub },
    filterLabelOn: { color: '#FFFFFF' },

    // ---- idea cards ----
    ideaCard: {
      gap: 10,
      padding: 15,
      borderRadius: radius.md,
      backgroundColor: c.darkCard,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    ideaHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    ideaTitle: { ...type.h4, color: c.onDark, lineHeight: 24 },
    ideaAngle: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
    hookBox: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderRadius: radius.sm,
      backgroundColor: c.primarySoft,
    },
    hookText: { ...type.bodyBold, color: c.onDark, flex: 1, lineHeight: 21 },

    detail: { gap: 6, borderTopWidth: 1, borderTopColor: c.darkBorder, paddingTop: 10 },
    detailLabel: {
      ...type.tiny,
      color: c.onDarkDim,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 6,
    },
    bodyText: { ...type.body, color: c.onDark },
    outlineRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
    outlineDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    outlineDotText: { ...type.tiny, color: c.primary, letterSpacing: 0 },
    outlineText: { ...type.body, color: c.onDark, flex: 1 },
    hashRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    hashChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: c.darkCard2,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    hashText: { ...type.tiny, color: c.onDarkSub, letterSpacing: 0 },
    formatChip: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: radius.pill,
      backgroundColor: c.primarySoft,
    },
    formatText: { ...type.small, fontWeight: '700', color: c.primary },

    disclosure: { alignSelf: 'flex-start', paddingVertical: 2 },
    disclosureLabel: { ...type.small, fontWeight: '800', color: c.primary },

    // ---- per-idea actions ----
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: c.darkCard2,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    chipPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    chipDone: { backgroundColor: c.greenSoft, borderColor: c.green },
    chipMuted: { opacity: 0.55 },
    chipLabel: { ...type.small, fontWeight: '700', color: c.primary },
    chipLabelPrimary: { color: '#FFFFFF' },
    chipLabelDone: { color: c.green },

    errorCard: {
      gap: 9,
      padding: 12,
      borderRadius: radius.sm,
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

    // ---- loading ----
    loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 4 },
    loadingText: { ...type.small, color: c.onDarkSub, flex: 1, lineHeight: 19 },

    // ---- toast ----
    toast: {
      position: 'absolute',
      left: 18,
      right: 18,
      bottom: 26,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radius.sm,
      backgroundColor: c.onDark,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    toastText: { ...type.small, fontWeight: '700', color: c.darkBg, textAlign: 'center' },
  });
