import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  GenerateIdeasModal,
  IdeaScoreModal,
  IdeaScriptModal,
  IdeaRequest,
} from '../components/modals';
import { DotsIcon, PlayIcon, SparkIcon, BookmarkIcon } from '../components/icons';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  Badge,
  EmptyState,
  GradientButton,
  OutlineButton,
  PillTabs,
  priorityBadgeProps,
} from '../components/ui';
import { PLAN_STATUSES, isIdeaSaved, sortIdeas, statusMeta } from '../lib/derived';
import type { CreatorAiIdea, IdeaScoreResult } from '../services/creatorAi';
import type { SavedIdea, SavedIdeaStatus } from '../services/savedIdeas';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

const TABS = ['Next 7 Days', 'Trending', 'Saved'];

/**
 * The Supabase-backed ideas a creator saved out of the Idea Studio, plus the
 * two edits the Content tab owns over them. Every failure comes back as the
 * message to show, so one bad row never blanks the whole list.
 */
export type DiscoverSavedSection = {
  ideas: SavedIdea[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Returns null on success, or the message to show on failure. */
  onDelete: (id: string) => Promise<string | null>;
  /** Returns null on success, or the message to show on failure. */
  onUpdate: (
    id: string,
    patch: { title: string; script: string; caption: string; status: SavedIdeaStatus },
  ) => Promise<string | null>;
};

export function IdeasScreen({
  initialTab,
  discoverSaved,
  ideas,
  trendingIdeas,
  savedIdeas,
  generating,
  generateError,
  generateTopic,
  onRetryGenerate,
  defaults,
  onGenerate,
  onToggleSave,
  onAnalyze,
  onScoreIdea,
}: {
  /** Which sub-tab opens first — the Idea Studio's Saved link passes it. */
  initialTab?: string;
  /** Ideas saved from the Idea Studio, kept in the signed-in account. */
  discoverSaved: DiscoverSavedSection;
  ideas: CreatorAiIdea[];
  trendingIdeas: CreatorAiIdea[];
  savedIdeas: CreatorAiIdea[];
  generating: boolean;
  generateError: string | null;
  /** Topic of the in-flight generation, so the list can say what it builds. */
  generateTopic: string | null;
  /** Re-runs the request that failed (used by the trend → idea flow). */
  onRetryGenerate: () => void;
  defaults: IdeaRequest;
  onGenerate: (mode: 'replace' | 'append' | 'trending', request: IdeaRequest) => void;
  onToggleSave: (idea: CreatorAiIdea) => void;
  onAnalyze: () => void;
  onScoreIdea: (input: {
    idea: string;
    audience: string;
    goal: string;
  }) => Promise<IdeaScoreResult>;
}) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const [tab, setTab] = useState(initialTab ?? TABS[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [generateMode, setGenerateMode] = useState<'replace' | 'trending' | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scriptIdea, setScriptIdea] = useState<CreatorAiIdea | null>(null);
  // Editing one saved-from-Discover idea: the row itself, the draft fields,
  // and whether the save is in flight so the sheet cannot be double-submitted.
  const [editTarget, setEditTarget] = useState<SavedIdea | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editStatus, setEditStatus] = useState<SavedIdeaStatus>('draft');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedIdea | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** A one-line result of the last delete, shown above the Discover list. */
  const [discoverNotice, setDiscoverNotice] = useState<string | null>(null);
  const wasGenerating = useRef(false);

  const openEdit = (idea: SavedIdea) => {
    setEditTarget(idea);
    setEditTitle(idea.title);
    setEditScript(idea.script);
    setEditCaption(idea.caption);
    setEditStatus(idea.status);
    setEditError(null);
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditTarget(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editTarget || editSaving) return;
    const title = editTitle.trim();
    if (!title) {
      setEditError('A saved idea needs a title.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const failure = await discoverSaved.onUpdate(editTarget.id, {
      title,
      script: editScript,
      caption: editCaption,
      status: editStatus,
    });
    setEditSaving(false);
    if (failure) {
      setEditError(failure);
      return;
    }
    setEditTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    const failure = await discoverSaved.onDelete(deleteTarget.id);
    setDeleteBusy(false);
    setDeleteTarget(null);
    setDiscoverNotice(failure);
  };

  useEffect(() => {
    if (wasGenerating.current && !generating && !generateError) {
      setGenerateMode(null);
      setMenuOpen(false);
    }
    wasGenerating.current = generating;
  }, [generating, generateError]);

  const list =
    tab === 'Trending'
      ? trendingIdeas
      : tab === 'Saved'
        ? savedIdeas
        : sortIdeas(ideas);

  const openGenerate = (mode: 'replace' | 'trending') => {
    setMenuOpen(false);
    setGenerateMode(mode);
  };

  // One locally saved idea's card (the bookmark list, unchanged behaviour).
  const renderLocalCard = (idea: CreatorAiIdea, index: number) => (
    <Pressable
      key={`${idea.title}-${index}`}
      accessibilityRole="button"
      onPress={() => setScriptIdea(idea)}
      style={({ pressed }) => [styles.ideaCard, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.thumb}>
        <PlayIcon size={26} color="rgba(255,255,255,0.92)" />
        <SparkIcon size={13} color="rgba(255,255,255,0.6)" />
      </View>
      <View style={styles.ideaBody}>
        <Badge {...priorityBadgeProps(idea.priority)} />
        <Text style={styles.ideaTitle} numberOfLines={2}>
          {idea.title}
        </Text>
        <Text style={styles.ideaMeta} numberOfLines={1}>
          {/* Length is the one extra the card can spare — it tells the
              creator the time commitment before they open the script.
              Older ideas have no length, so say that plainly. */}
          {idea.format} • {idea.target_length ?? 'Length not set'}
        </Text>
        <View style={styles.ideaActions}>
          <View style={styles.scriptChip}>
            <Text style={styles.scriptChipText}>View Script</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isIdeaSaved(savedIdeas, idea) ? 'Remove from saved' : 'Save idea'
            }
            hitSlop={10}
            onPress={() => onToggleSave(idea)}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <BookmarkIcon
              size={19}
              color={isIdeaSaved(savedIdeas, idea) ? colors.primary : colors.textDim}
              filled={isIdeaSaved(savedIdeas, idea)}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  // The Saved tab's second list: ideas a creator saved in the Idea Studio.
  // Each one keeps the exact story it came from, and can be edited or
  // deleted here without touching the account's other ideas.
  const renderDiscoverSection = () => {
    const d = discoverSaved;
    const head = <Text style={styles.discoverHead}>Saved from Discover</Text>;

    if (d.ideas.length === 0) {
      if (d.loading) {
        return (
          <View style={styles.discoverBlock}>
            {head}
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusHint}>Loading the ideas you saved…</Text>
            </View>
          </View>
        );
      }
      if (d.error) {
        return (
          <View style={styles.discoverBlock}>
            {head}
            <View style={styles.statusRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Couldn’t load your saved ideas</Text>
                <Text style={styles.statusHint}>{d.error}</Text>
              </View>
              <OutlineButton label="Retry" tone="light" onPress={d.onRetry} />
            </View>
          </View>
        );
      }
      if (list.length > 0) {
        return (
          <View style={styles.discoverBlock}>
            {head}
            <Text style={styles.discoverEmpty}>
              Nothing saved from the Idea Studio yet — open a story in Discover, tap “Turn into
              an idea”, then save the one you like.
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.discoverBlock}>
          <EmptyState
            glyph="✦"
            title="Nothing saved yet"
            hint="Tap the bookmark on any idea to keep it here — or save one from the Idea Studio."
          />
        </View>
      );
    }

    return (
      <View style={styles.discoverBlock}>
        {head}
        {discoverNotice ? <Text style={styles.discoverNotice}>{discoverNotice}</Text> : null}
        {d.error ? <Text style={styles.discoverNotice}>{d.error}</Text> : null}
        {d.ideas.map((idea) => {
          const meta = statusMeta(idea.status);
          const savedOn = new Date(idea.createdAt);
          return (
            <View key={idea.id} style={styles.savedCard}>
              <View style={styles.savedHead}>
                <Badge label={idea.platform} tone="purple" />
                <Badge label={meta.label} tone={meta.tone} />
                <Text style={styles.savedDate}>
                  {Number.isNaN(savedOn.getTime()) ? '' : savedOn.toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.savedTitle}>{idea.title}</Text>
              <Text style={styles.savedSource} numberOfLines={2}>
                {`From ${idea.sourcePublisher ? `${idea.sourcePublisher}: ` : ''}${idea.sourceTitle}`}
              </Text>
              {idea.hook ? (
                <Text style={styles.savedHook} numberOfLines={2}>{`“${idea.hook}”`}</Text>
              ) : null}
              <Text style={styles.savedSnippet} numberOfLines={3}>
                {idea.script || idea.caption || 'No script yet — tap Edit to write one.'}
              </Text>
              <View style={styles.savedActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${idea.title}`}
                  onPress={() => openEdit(idea)}
                  style={({ pressed }) => [styles.savedAction, pressed && { opacity: 0.65 }]}
                >
                  <Text style={styles.savedActionText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${idea.title}`}
                  onPress={() => {
                    setDiscoverNotice(null);
                    setDeleteTarget(idea);
                  }}
                  style={({ pressed }) => [
                    styles.savedAction,
                    styles.savedActionDanger,
                    pressed && { opacity: 0.65 },
                  ]}
                >
                  <Text style={[styles.savedActionText, styles.savedActionTextDanger]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Content Ideas</Text>
            <Text style={styles.subtitle}>AI recommendations based on your DNA</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Content Ideas menu"
            hitSlop={10}
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
          >
            <DotsIcon size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* The Content tab opens with the question the creator actually has,
            plus the two ways to answer it: let CreatorDNA propose a post, or
            bring your own idea and have it scored. */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>What should I post today?</Text>
          <Text style={styles.heroSub}>
            CreatorDNA builds the next post from your own DNA — hook, script, caption, CTA and the
            reason it fits you.
          </Text>
          <View style={styles.heroActions}>
            <GradientButton
              label={ideas.length > 0 ? 'Generate another' : 'Generate ideas'}
              onPress={() => openGenerate('replace')}
              style={{ flex: 1 }}
            />
            <OutlineButton
              label="Analyze my idea"
              onPress={() => setScoreOpen(true)}
              tone="light"
              style={{ flex: 1 }}
            />
          </View>
        </View>

        <PillTabs options={TABS} value={tab} onChange={setTab} />

        {/* The trend → idea jump never opens the generate modal, so the list
            itself reports progress and failure for requests fired without it:
            a card saying what it is building, or the error with a retry that
            re-runs the exact same request. */}
        {generateMode === null && generating ? (
          <Cardish>
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Building ideas…</Text>
                {generateTopic ? (
                  <Text style={styles.statusHint} numberOfLines={2}>
                    {generateTopic}
                  </Text>
                ) : null}
              </View>
            </View>
          </Cardish>
        ) : null}
        {generateMode === null && !generating && generateError ? (
          <Cardish>
            <View style={styles.statusRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Couldn’t build ideas</Text>
                <Text style={styles.statusHint} numberOfLines={3}>
                  {generateError}
                </Text>
              </View>
            </View>
            <OutlineButton
              label="Try again"
              tone="light"
              onPress={onRetryGenerate}
              style={{ marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 22 }}
            />
          </Cardish>
        ) : null}

        {/* While a background request runs — or after it failed and the error
            card above is showing — the "no ideas yet" empty state would
            contradict it, so it steps aside. */}
        {list.length === 0 && generateMode === null && (generating || generateError) ? null : tab === 'Saved' ? (
          <View style={styles.cards}>
            {list.map(renderLocalCard)}
            {renderDiscoverSection()}
          </View>
        ) : list.length === 0 ? (
          <Cardish>
            <EmptyState
              glyph="✦"
              title={tab === 'Trending' ? 'No trending ideas yet' : 'No ideas yet'}
              hint="Generate fresh Reel concepts tailored to your topics, audience, and goals."
              actionLabel={tab === 'Trending' ? 'Generate trending ideas' : 'Generate ideas'}
              onAction={() => openGenerate(tab === 'Trending' ? 'trending' : 'replace')}
            />
          </Cardish>
        ) : (
          <View style={styles.cards}>
            {list.map(renderLocalCard)}
            {tab === 'Next 7 Days' ? (
              <GradientButton
                label="Refresh ideas"
                onPress={() => openGenerate('replace')}
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Header overflow menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
          <View style={styles.menuSheet}>
            <MenuOption
              label="Analyze content"
              hint="Score a post and get improvement tips"
              onPress={() => {
                setMenuOpen(false);
                onAnalyze();
              }}
            />
            <MenuOption
              label="Refresh ideas"
              hint="Generate a fresh set of seven ideas"
              onPress={() => openGenerate('replace')}
            />
            <MenuOption
              label="Analyze my idea"
              hint="Score an idea, hook or caption against your audience"
              onPress={() => {
                setMenuOpen(false);
                setScoreOpen(true);
              }}
            />
          </View>
        </View>
      </Modal>

      <GenerateIdeasModal
        visible={generateMode !== null}
        onClose={() => setGenerateMode(null)}
        onSubmit={(request) => onGenerate(generateMode ?? 'replace', request)}
        loading={generating}
        error={generateError}
        defaults={defaults}
        title={generateMode === 'trending' ? 'Trending ideas' : 'Fresh Reel ideas'}
        submitLabel={generateMode === 'trending' ? 'Find trending ideas' : 'Generate ideas'}
      />

      <IdeaScoreModal
        visible={scoreOpen}
        onClose={() => setScoreOpen(false)}
        defaults={defaults}
        onScore={onScoreIdea}
      />

      <IdeaScriptModal
        visible={scriptIdea !== null}
        idea={scriptIdea}
        saved={scriptIdea ? isIdeaSaved(savedIdeas, scriptIdea) : false}
        onToggleSave={() => {
          if (scriptIdea) {
            onToggleSave(scriptIdea);
          }
        }}
        onClose={() => setScriptIdea(null)}
      />

      {/* Edit one saved-from-Discover idea: its own words and plan status.
          The story it came from is fixed — only what the creator wrote here
          is ever changed. */}
      <Modal
        visible={editTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeEdit}
            accessibilityLabel="Close editor"
          />
          <View style={styles.editSheet}>
            <ScrollView
              contentContainerStyle={styles.editBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.editTitle}>Edit saved idea</Text>
              {editTarget ? (
                <Text style={styles.editSource} numberOfLines={2}>
                  {`From ${editTarget.sourcePublisher ? `${editTarget.sourcePublisher}: ` : ''}${editTarget.sourceTitle}`}
                </Text>
              ) : null}

              <Text style={styles.editLabel}>Title</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                multiline
                style={styles.input}
                placeholder="Idea title"
                placeholderTextColor={colors.textDim}
              />

              <Text style={styles.editLabel}>Script</Text>
              <TextInput
                value={editScript}
                onChangeText={setEditScript}
                multiline
                style={[styles.input, styles.inputTall]}
                placeholder="The full script for this idea"
                placeholderTextColor={colors.textDim}
              />

              <Text style={styles.editLabel}>Caption</Text>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                multiline
                style={styles.input}
                placeholder="The caption to post with it"
                placeholderTextColor={colors.textDim}
              />

              <Text style={styles.editLabel}>Status</Text>
              <View style={styles.statusPills}>
                {PLAN_STATUSES.map((entry) => {
                  const active = editStatus === entry.key;
                  return (
                    <Pressable
                      key={entry.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setEditStatus(entry.key as SavedIdeaStatus)}
                      style={({ pressed }) => [
                        styles.statusPill,
                        active && styles.statusPillOn,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text style={[styles.statusPillText, active && styles.statusPillTextOn]}>
                        {entry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {editError ? <Text style={styles.editError}>{editError}</Text> : null}
            </ScrollView>
            <View style={styles.editActions}>
              <OutlineButton
                label="Cancel"
                tone="light"
                onPress={closeEdit}
                style={{ flex: 1 }}
              />
              <GradientButton
                label="Save changes"
                onPress={() => void saveEdit()}
                loading={editSaving}
                disabled={editSaving}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this saved idea?"
        message={
          deleteTarget
            ? `“${deleteTarget.title}” will be removed from your account for good.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

function Cardish({ children }: { children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.cardish}>
      {children}
    </View>
  );
}

function MenuOption({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuOption, pressed && { backgroundColor: colors.lightCard }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuHint}>{hint}</Text>
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </Pressable>
  );
}

// Built per palette through useStyles: a module-scope StyleSheet bakes in the
// palette that existed at import time, so the Appearance toggle never reaches it.
const makeStyles = (c: typeof colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.white },
    content: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: FAB_CLEARANCE,
      gap: 14,
    },

    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    title: { ...type.h2, color: c.text, fontSize: 25 },
    subtitle: { ...type.small, color: c.textSub, marginTop: 5, fontSize: 13.5 },
    menuButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.lightCard2,
      alignItems: 'center',
      justifyContent: 'center',
    },

    cardish: {
      backgroundColor: c.lightCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.lightBorder,
    },

    hero: {
      gap: 8,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.md + 2,
      padding: 15,
    },
    heroTitle: { ...type.h4, color: c.text, fontSize: 18, letterSpacing: -0.3 },
    heroSub: { ...type.small, color: c.textSub, lineHeight: 18, fontSize: 13.5 },
    heroActions: { flexDirection: 'row', gap: 10, marginTop: 6 },

    cards: { gap: 12 },

    statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 13 },
    statusTitle: { ...type.bodyBold, color: c.text, fontSize: 15 },
    statusHint: { ...type.small, color: c.textSub, marginTop: 3, lineHeight: 18 },

    ideaCard: {
      flexDirection: 'row',
      gap: 13,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.md + 2,
      padding: 13,
      shadowColor: '#1A56AE',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    thumb: {
      width: 88,
      height: 88,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      overflow: 'hidden',
    },
    ideaBody: { flex: 1, minWidth: 0, gap: 6 },
    ideaTitle: { ...type.bodyBold, color: c.text, fontSize: 15.5, lineHeight: 20 },
    ideaMeta: { ...type.small, color: c.textSub, fontSize: 12.5 },
    ideaActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    scriptChip: {
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 6,
    },
    scriptChipText: { fontSize: 12.5, fontWeight: '800', color: c.primary },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(10, 9, 26, 0.5)',
      justifyContent: 'flex-end',
    },
    menuSheet: {
      backgroundColor: c.white,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 28,
    },
    menuOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 66,
      paddingHorizontal: 12,
      borderRadius: radius.md,
    },
    menuLabel: { ...type.bodyBold, color: c.text, fontSize: 15.5 },
    menuHint: { ...type.small, color: c.textSub, marginTop: 2, fontSize: 12.5 },
    menuChevron: { fontSize: 24, color: c.textDim, fontWeight: '600' },

    // ---- Saved from Discover (the Idea Studio's account-backed list) ----
    discoverBlock: { gap: 12 },
    discoverHead: {
      ...type.tiny,
      color: c.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    discoverEmpty: { ...type.small, color: c.textSub, lineHeight: 19 },
    discoverNotice: {
      ...type.small,
      color: c.red,
      backgroundColor: c.redSoft,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.red,
      paddingHorizontal: 12,
      paddingVertical: 9,
      lineHeight: 18,
    },

    savedCard: {
      gap: 8,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.md + 2,
      padding: 14,
      shadowColor: '#1A56AE',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    savedHead: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    savedDate: { ...type.tiny, color: c.textDim, marginLeft: 'auto', letterSpacing: 0 },
    savedTitle: { ...type.bodyBold, color: c.text, fontSize: 15.5, lineHeight: 21 },
    savedSource: { ...type.tiny, color: c.textDim, letterSpacing: 0, lineHeight: 16 },
    savedHook: { ...type.small, color: c.primary, fontStyle: 'italic', lineHeight: 18 },
    savedSnippet: { ...type.small, color: c.textSub, lineHeight: 18 },
    savedActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
      borderTopWidth: 1,
      borderTopColor: c.lightBorder,
      paddingTop: 10,
    },
    savedAction: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: c.primarySoft,
    },
    savedActionDanger: { backgroundColor: c.redSoft },
    savedActionText: { ...type.small, fontWeight: '800', color: c.primary },
    savedActionTextDanger: { color: c.red },

    // ---- Edit sheet ----
    editSheet: {
      backgroundColor: c.white,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 26,
      maxHeight: '86%',
    },
    editBody: { gap: 8, paddingBottom: 14 },
    editTitle: { ...type.h4, color: c.text },
    editSource: { ...type.tiny, color: c.textDim, letterSpacing: 0, lineHeight: 16 },
    editLabel: { ...type.tiny, color: c.textDim, textTransform: 'uppercase', marginTop: 6 },
    input: {
      ...type.small,
      color: c.text,
      backgroundColor: c.lightCard2,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      lineHeight: 20,
      minHeight: 46,
    },
    inputTall: { minHeight: 132, textAlignVertical: 'top', paddingTop: 12 },
    statusPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusPill: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: c.lightCard2,
      borderWidth: 1,
      borderColor: c.lightBorder,
    },
    statusPillOn: { backgroundColor: c.primary, borderColor: c.primary },
    statusPillText: { ...type.small, fontWeight: '700', color: c.textSub },
    statusPillTextOn: { color: '#FFFFFF' },
    editError: { ...type.small, color: c.red, lineHeight: 18 },
    editActions: { flexDirection: 'row', gap: 10 },
  });
