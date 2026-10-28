import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PillTabs } from '../components/ui';
import { IdeasScreen } from './IdeasScreen';
import { PlanScreen } from './PlanScreen';
import { useStyles, useThemeColors } from '../themeContext';
import type { CreatorAiIdea, IdeaScoreResult } from '../services/creatorAi';
import type { IdeaRequest } from '../components/modals';
import type { PlanStatus } from '../lib/derived';

/**
 * The single "Content" tab: your schedule and the ideas behind it, one screen.
 *
 * It used to be two bottom-bar tabs — "Content" and "Plan" — which split one
 * workflow in half: you planned a week on one tab and generated the posts for
 * it on another. Both halves are the screens they always were, unchanged; this
 * wrapper only adds the switch between them, so neither list's scroll position
 * or internal state is lost when you flip.
 *
 * The old `plan` route still resolves here with the Plan half pre-selected, so
 * a notification or a deep link that says "Open Plan" keeps working.
 */
const VIEWS = ['Plan', 'Ideas'] as const;
type ContentHalf = (typeof VIEWS)[number];

export type ContentView = ContentHalf;

export function ContentScreen({
  initialView = 'Ideas',
  ideas,
  trendingIdeas,
  savedIdeas,
  generating,
  generateError,
  defaults,
  planStatuses,
  onGenerate,
  onToggleSave,
  onAnalyze,
  onScoreIdea,
  onSetStatus,
  onAddIdea,
}: {
  /** Which half opens first — the `plan` route passes "Plan". */
  initialView?: ContentView;
  ideas: CreatorAiIdea[];
  trendingIdeas: CreatorAiIdea[];
  savedIdeas: CreatorAiIdea[];
  generating: boolean;
  generateError: string | null;
  defaults: IdeaRequest;
  planStatuses: Record<string, PlanStatus>;
  onGenerate: (mode: 'replace' | 'append' | 'trending', request: IdeaRequest) => void;
  onToggleSave: (idea: CreatorAiIdea) => void;
  onAnalyze: () => void;
  onScoreIdea: (input: {
    idea: string;
    audience: string;
    goal: string;
  }) => Promise<IdeaScoreResult>;
  onSetStatus: (key: string, status: PlanStatus) => void;
  onAddIdea: (input: { title: string; hook: string; format: string }) => void;
}) {
  const c = useThemeColors();
  const s = useStyles(makeStyles);
  const [view, setView] = useState<ContentView>(initialView);

  // Arriving from a deep link or a notification has to move the switch, even
  // when the tab is already mounted and showing the other half.
  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  return (
    <View style={s.screen}>
      {/* The switch sits above both halves; each half keeps its own header,
          sub-filters and scroll position from there. */}
      <View style={s.head}>
        <PillTabs
          options={[...VIEWS]}
          value={view}
          onChange={(next) => setView(next as ContentView)}
          style={s.switcher}
        />
      </View>

      {view === 'Plan' ? (
        <PlanScreen
          ideas={ideas}
          savedIdeas={savedIdeas}
          generating={generating}
          generateError={generateError}
          defaults={defaults}
          planStatuses={planStatuses}
          onGenerate={onGenerate}
          onToggleSave={onToggleSave}
          onSetStatus={onSetStatus}
          onAddIdea={onAddIdea}
        />
      ) : (
        <IdeasScreen
          ideas={ideas}
          trendingIdeas={trendingIdeas}
          savedIdeas={savedIdeas}
          generating={generating}
          generateError={generateError}
          defaults={defaults}
          onGenerate={onGenerate}
          onToggleSave={onToggleSave}
          onAnalyze={onAnalyze}
          onScoreIdea={onScoreIdea}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.darkBg },
    head: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: c.darkBg,
    },
    switcher: { alignSelf: 'flex-start' },
  });
