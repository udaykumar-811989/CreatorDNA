import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GradientButton, ScreenHeader, EmptyState, Badge, BadgeTone } from '../components/ui';
import { formatDateShort, formatCount, scoreOf } from '../lib/derived';
import type { AnalysisRecord } from '../lib/storage';
import { colors, FAB_CLEARANCE, radius, type } from '../theme';
import { useStyles } from '../themeContext';

function scoreTone(score: number): BadgeTone {
  if (score >= 8) return 'green';
  if (score >= 6.5) return 'amber';
  return 'gray';
}

export function AnalysesListScreen({
  records,
  onBack,
  onOpen,
  onAnalyze,
}: {
  records: AnalysisRecord[];
  onBack: () => void;
  onOpen: (record: AnalysisRecord) => void;
  onAnalyze: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="My analyses" subtitle={`${records.length} analyzed`} onBack={onBack} />

        {records.length === 0 ? (
          <EmptyState
            glyph="◎"
            title="No analyses yet"
            hint="Analyze a post to see craft scores, the main issue, and exact suggested edits."
            actionLabel="Analyze content"
            onAction={onAnalyze}
          />
        ) : (
          <View style={styles.cards}>
            {records.map((record) => {
              const score = scoreOf(record);
              const metrics = Object.entries(record.metrics)
                .filter(([, value]) => typeof value === 'number')
                .map(([key, value]) => `${formatCount(value)} ${key}`)
                .join(' • ');
              return (
                <Pressable
                  key={record.id}
                  onPress={() => onOpen(record)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                >
                  <View style={styles.rowInner}>
                    <View style={styles.rowLeft}>
                      {score !== null ? (
                        <Badge label={`${score}/10`} tone={scoreTone(score)} />
                      ) : (
                        <Badge label="No score" tone="gray" />
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowTitle} numberOfLines={2}>
                          {record.title}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {formatDateShort(record.createdAt)}
                          {metrics ? ` • ${metrics}` : ''}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {records.length > 0 ? (
          <GradientButton label="Analyze new content" onPress={onAnalyze} style={{ marginTop: 6 }} />
        ) : null}
      </ScrollView>
    </View>
  );
}

// Built per palette through useStyles: a module-scope StyleSheet bakes in the
// palette that existed at import time, so the Appearance toggle never reaches it.
const makeStyles = (c: typeof colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.white },
    content: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: FAB_CLEARANCE,
      gap: 14,
    },
    cards: { gap: 10 },
    row: {
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.lightBorder,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
    rowTitle: { ...type.bodyBold, color: c.text, fontSize: 14.5, lineHeight: 19 },
    rowMeta: { ...type.small, color: c.textSub, fontSize: 12, marginTop: 3 },
    chevron: { fontSize: 24, color: c.textDim, fontWeight: '600' },
  });
