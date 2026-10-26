import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GenerateIdeasModal, IdeaScriptModal, IdeaRequest } from '../components/modals';
import { SparkIcon } from '../components/icons';
import {
  Badge,
  EmptyState,
  GradientButton,
  PillTabs,
  priorityBadgeProps,
} from '../components/ui';
import { buildPlan, isIdeaSaved, sortIdeas } from '../lib/derived';
import type { CreatorAiIdea } from '../services/creatorAi';
import { useStyles, useThemeColors } from '../themeContext';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';

const WEEK_STRIP_TABS = ['My Week', 'Upcoming'];

export function PlanScreen({
  ideas,
  savedIdeas,
  generating,
  generateError,
  defaults,
  onGenerate,
  onToggleSave,
}: {
  ideas: CreatorAiIdea[];
  savedIdeas: CreatorAiIdea[];
  generating: boolean;
  generateError: string | null;
  defaults: IdeaRequest;
  onGenerate: (mode: 'replace' | 'append' | 'trending', request: IdeaRequest) => void;
  onToggleSave: (idea: CreatorAiIdea) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles(makeStyles);
  const [view, setView] = useState(WEEK_STRIP_TABS[0]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [scriptIdea, setScriptIdea] = useState<CreatorAiIdea | null>(null);
  const wasGenerating = useRef(false);

  useEffect(() => {
    if (wasGenerating.current && !generating && !generateError) {
      setGenerateOpen(false);
    }
    wasGenerating.current = generating;
  }, [generating, generateError]);

  const plan = buildPlan(ideas);
  const upcoming = sortIdeas(ideas).slice(7);
  const days = plan;
  // Real calendar date, e.g. "Wed, Oct 21" — the plan always builds from today.
  const dateLabel = (date: Date) =>
    date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your Content Plan</Text>
            <Text style={styles.subtitle}>
              {ideas.length > 0
                ? `Built from ${ideas.length} AI idea${ideas.length === 1 ? '' : 's'} for the next 7 days`
                : 'A 7-day schedule built from your generated ideas'}
            </Text>
          </View>
        </View>

        {/* Week strip */}
        <View style={styles.weekStrip}>
          {plan.map((day) => (
            <View key={day.index} style={[styles.weekDay, day.isToday && styles.weekDayActive]}>
              <Text style={[styles.weekLabel, day.isToday && styles.weekLabelActive]}>
                {day.weekday}
              </Text>
              <View style={[styles.weekCircle, day.isToday && styles.weekCircleActive]}>
                <Text style={[styles.weekNumber, day.isToday && styles.weekNumberActive]}>
                  {day.dayNumber}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <PillTabs options={WEEK_STRIP_TABS} value={view} onChange={setView} />

        {view === WEEK_STRIP_TABS[0] ? (
          ideas.length === 0 ? (
            <EmptyState
              glyph="✦"
              title="Your plan is empty"
              hint="Generate ideas and CreatorDNA will spread them across your next 7 days."
              actionLabel="Generate ideas"
              onAction={() => setGenerateOpen(true)}
            />
          ) : (
            <View style={styles.cards}>
              {days.map((day) =>
                day.idea ? (
                  <Pressable
                    key={day.index}
                    accessibilityRole="button"
                    onPress={() => setScriptIdea(day.idea as CreatorAiIdea)}
                    style={({ pressed }) => [
                      styles.dayCard,
                      day.isToday && styles.dayCardToday,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={styles.dayCardHead}>
                      <Text style={styles.dayCardDay}>{dateLabel(day.date)}</Text>
                      {day.isToday ? <Badge label="Today" tone="purple" /> : null}
                    </View>
                    <Text style={styles.dayCardTitle} numberOfLines={2}>
                      {day.idea.title}
                    </Text>
                    <Text style={styles.dayCardMeta} numberOfLines={1}>
                      {/* Same meta line as before, with the target length folded
                          in only when the idea has one. */}
                      {day.idea.target_length
                        ? `${day.idea.format} • ${day.idea.target_length}`
                        : day.idea.format}
                    </Text>
                    <View style={styles.dayCardFoot}>
                      <Badge {...priorityBadgeProps(day.idea.priority)} />
                      <Text style={styles.viewScript}>View Script ›</Text>
                    </View>
                  </Pressable>
                ) : (
                  <View key={day.index} style={[styles.dayCard, styles.dayCardEmpty]}>
                    <Text style={styles.dayCardDay}>{dateLabel(day.date)}</Text>
                    <Text style={styles.dayCardEmptyText}>No idea planned — a rest day</Text>
                  </View>
                ),
              )}
            </View>
          )
        ) : (
          <View style={styles.cards}>
            {upcoming.length === 0 ? (
              <EmptyState
                glyph="✦"
                title="No extra ideas yet"
                hint="Generate ideas to fill this list — the first 7 days feed your plan above."
                actionLabel="Generate ideas"
                onAction={() => setGenerateOpen(true)}
              />
            ) : (
              upcoming.map((idea, index) => (
                <Pressable
                  key={`${idea.title}-${index}`}
                  accessibilityRole="button"
                  onPress={() => setScriptIdea(idea)}
                  style={({ pressed }) => [styles.dayCard, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.dayCardHead}>
                    <Text style={styles.dayCardDay}>Coming up</Text>
                    <Badge {...priorityBadgeProps(idea.priority)} />
                  </View>
                  <Text style={styles.dayCardTitle} numberOfLines={2}>
                    {idea.title}
                  </Text>
                  <Text style={styles.dayCardMeta} numberOfLines={1}>
                    {idea.target_length ? `${idea.format} • ${idea.target_length}` : idea.format}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* Generate more card */}
        <View style={styles.generateCard}>
          <SparkIcon size={20} color="#FFFFFF" />
          <Text style={styles.generateTitle}>Want more ideas?</Text>
          <Text style={styles.generateBody}>
            Let AI suggest more content ideas based on your latest performance and fill the days
            ahead.
          </Text>
          <GradientButton label="Generate Ideas" onPress={() => setGenerateOpen(true)} style={{ marginTop: 14 }} />
        </View>
      </ScrollView>

      <GenerateIdeasModal
        visible={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onSubmit={(request) => onGenerate('append', request)}
        loading={generating}
        error={generateError}
        defaults={defaults}
        title="Add more ideas"
        submitLabel="Generate 5 more"
        appendNote="New ideas are added to your plan instead of replacing the ones you already have."
      />

      <IdeaScriptModal
        visible={scriptIdea !== null}
        idea={scriptIdea}
        saved={scriptIdea ? isIdeaSaved(savedIdeas, scriptIdea) : false}
        onToggleSave={() => {
          if (scriptIdea) onToggleSave(scriptIdea);
        }}
        onClose={() => setScriptIdea(null)}
      />
    </View>
  );
}

const makeStyles = (c: typeof colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.white },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: FAB_CLEARANCE,
    gap: 14,
  },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { ...type.h2, color: c.text, fontSize: 25 },
  subtitle: { ...type.small, color: c.textSub, marginTop: 5, fontSize: 13.5 },

  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: c.lightCard,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: c.lightBorder,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  weekDay: { alignItems: 'center', gap: 6, flex: 1 },
  weekLabel: { fontSize: 10.5, fontWeight: '800', color: c.textDim, textTransform: 'uppercase' },
  weekLabelActive: { color: c.primary },
  weekCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  weekCircleActive: { backgroundColor: c.primary },
  weekNumber: { fontSize: 14, fontWeight: '700', color: c.text },
  weekNumberActive: { color: '#FFFFFF' },
  weekDayActive: {},

  cards: { gap: 11 },
  dayCard: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.lightBorder,
    borderRadius: radius.md + 2,
    padding: 15,
    gap: 6,
    shadowColor: '#1A56AE',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  dayCardToday: { borderColor: c.primary, borderWidth: 1.5 },
  dayCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayCardDay: { ...type.tiny, color: c.textSub, textTransform: 'uppercase' },
  dayCardTitle: { ...type.bodyBold, color: c.text, fontSize: 16, lineHeight: 21 },
  dayCardMeta: { ...type.small, color: c.textSub, fontSize: 12.5 },
  dayCardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  viewScript: { fontSize: 12.5, fontWeight: '800', color: c.primary },
  dayCardEmpty: { backgroundColor: c.lightCard, borderStyle: 'dashed', gap: 4 },
  dayCardEmptyText: { ...type.small, color: c.textDim, fontSize: 13 },

  generateCard: {
    backgroundColor: c.primary,
    borderRadius: radius.md + 4,
    padding: 20,
    alignItems: 'flex-start',
    shadowColor: c.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  generateTitle: { ...type.h4, color: '#FFFFFF', marginTop: 10, fontSize: 18 },
  generateBody: {
    ...type.small,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    lineHeight: 19,
    fontSize: 13.5,
  },
});
