import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GenerateIdeasModal, IdeaScriptModal, IdeaRequest } from '../components/modals';
import { DotsIcon, PlayIcon, SparkIcon, BookmarkIcon } from '../components/icons';
import {
  Badge,
  EmptyState,
  GradientButton,
  PillTabs,
  priorityBadgeProps,
} from '../components/ui';
import { isIdeaSaved, sortIdeas } from '../lib/derived';
import type { CreatorAiIdea } from '../services/creatorAi';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useThemeColors, useStyles } from '../themeContext';

const TABS = ['Next 7 Days', 'Trending', 'Saved'];

export function IdeasScreen({
  ideas,
  trendingIdeas,
  savedIdeas,
  generating,
  generateError,
  defaults,
  onGenerate,
  onToggleSave,
  onAnalyze,
}: {
  ideas: CreatorAiIdea[];
  trendingIdeas: CreatorAiIdea[];
  savedIdeas: CreatorAiIdea[];
  generating: boolean;
  generateError: string | null;
  defaults: IdeaRequest;
  onGenerate: (mode: 'replace' | 'append' | 'trending', request: IdeaRequest) => void;
  onToggleSave: (idea: CreatorAiIdea) => void;
  onAnalyze: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const [tab, setTab] = useState(TABS[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [generateMode, setGenerateMode] = useState<'replace' | 'trending' | null>(null);
  const [scriptIdea, setScriptIdea] = useState<CreatorAiIdea | null>(null);
  const wasGenerating = useRef(false);

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

        <PillTabs options={TABS} value={tab} onChange={setTab} />

        {list.length === 0 ? (
          <Cardish>
            <EmptyState
              glyph="✦"
              title={
                tab === 'Trending'
                  ? 'No trending ideas yet'
                  : tab === 'Saved'
                    ? 'Nothing saved yet'
                    : 'No ideas yet'
              }
              hint={
                tab === 'Saved'
                  ? 'Tap the bookmark on any idea to keep it here.'
                  : 'Generate fresh Reel concepts tailored to your topics, audience, and goals.'
              }
              actionLabel={
                tab === 'Saved'
                  ? undefined
                  : tab === 'Trending'
                    ? 'Generate trending ideas'
                    : 'Generate ideas'
              }
              onAction={
                tab === 'Saved'
                  ? undefined
                  : () => openGenerate(tab === 'Trending' ? 'trending' : 'replace')
              }
            />
          </Cardish>
        ) : (
          <View style={styles.cards}>
            {list.map((idea, index) => (
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
            ))}
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
              hint="Generate a fresh set of five ideas"
              onPress={() => openGenerate('replace')}
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

    cards: { gap: 12 },
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
  });
