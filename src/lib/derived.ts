import type { ChartPoint } from '../components/LineChart';
import type { CreatorAiIdea } from '../services/creatorAi';
import type { InstagramDashboard } from '../services/instagramDashboard';
import type { AnalysisRecord } from './storage';

// Every helper here computes from real inputs only: the user's analyses, the
// real Instagram dashboard, and AI-generated ideas. When inputs are missing,
// functions return null and screens show empty states instead of inventing data.

export type ScoreKey = 'hook' | 'retention' | 'engagement' | 'content_quality' | 'cta';

export const SCORE_LABELS: Array<{ key: ScoreKey; label: string }> = [
  { key: 'hook', label: 'Hook' },
  { key: 'retention', label: 'Retention' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'content_quality', label: 'Content Quality' },
  { key: 'cta', label: 'CTA' },
];

const numberOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function scoreOf(record: AnalysisRecord): number | null {
  const scores = record.analysis.scores;
  if (!scores) {
    return null;
  }
  const values = [scores.hook, scores.retention, scores.engagement, scores.content_quality, scores.cta]
    .map(numberOrNull)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function dnaScore(records: AnalysisRecord[]): number | null {
  const values = records
    .map((record) => scoreOf(record))
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function scoreBreakdown(
  records: AnalysisRecord[],
): Array<{ key: ScoreKey; label: string; value: number | null }> {
  return SCORE_LABELS.map(({ key, label }) => {
    const values = records
      .map((record) => numberOrNull(record.analysis.scores?.[key]))
      .filter((value): value is number => value !== null);
    const value =
      values.length > 0
        ? Math.round((values.reduce((sum, item) => sum + item, 0) / values.length) * 10) / 10
        : null;
    return { key, label, value };
  });
}

// ---------- Humanizers (enum values -> display text) ----------

export function humanizeFormat(format: string): string {
  const map: Record<string, string> = {
    talking_head: 'Talking head',
    tutorial: 'Tutorial',
    story: 'Story',
    list: 'Listicle',
    pov: 'POV',
    demonstration: 'Demo',
    montage: 'Montage',
    commentary: 'Commentary',
    other: 'Other',
    not_assessable: 'Not assessed',
  };
  return map[format] ?? format.replace(/_/g, ' ');
}

export function humanizeHookType(type: string): string {
  const map: Record<string, string> = {
    question: 'Question hooks',
    bold_statement: 'Bold statements',
    curiosity: 'Curiosity hooks',
    problem: 'Problem-first hooks',
    story: 'Story hooks',
    result_first: 'Result-first hooks',
    contrarian: 'Contrarian hooks',
    other: 'Other hooks',
    not_assessable: 'Not assessed',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

export function humanizeMediaType(mediaType: string): string {
  const map: Record<string, string> = {
    VIDEO: 'Reels',
    IMAGE: 'Photos',
    CAROUSEL_ALBUM: 'Carousels',
  };
  return map[mediaType] ?? mediaType;
}

// ---------- Home / dashboard derivations ----------

export type Delta = { pct: number; up: boolean } | null;

export function growthDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null || previous <= 0 || current < 0) {
    return null;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (!Number.isFinite(pct)) {
    return null;
  }
  return { pct, up: pct >= 0 };
}

export function engagementRate(
  stats: InstagramDashboard['stats'] | null | undefined,
): number | null {
  if (!stats) {
    return null;
  }
  const followers = stats.followers;
  const interactions = (stats.likes ?? 0) + (stats.comments ?? 0);
  if (!followers || followers <= 0 || (stats.likes === null && stats.comments === null)) {
    return null;
  }
  const rate = (interactions / followers) * 100;
  if (!Number.isFinite(rate)) {
    return null;
  }
  return Math.round(rate * 10) / 10;
}

export function averageDailyViews(
  dashboard: InstagramDashboard | null,
  days = 30,
): number | null {
  if (!dashboard) {
    return null;
  }
  if (dashboard.daily) {
    const recent = filterDaily(dashboard.daily, days);
    const values = recent
      .map((point) => point.views)
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    }
  }
  if (dashboard.stats.views !== null) {
    return Math.round(dashboard.stats.views / days);
  }
  return null;
}

export function quickInsight(
  dashboard: InstagramDashboard | null,
  records: AnalysisRecord[],
  ideaCount: number,
): string | null {
  const media = (dashboard?.media ?? []).filter(
    (item) => item.likes !== null && item.likes > 0,
  );
  if (media.length >= 2) {
    const byType = new Map<string, number[]>();
    for (const item of media) {
      const bucket = byType.get(item.mediaType) ?? [];
      bucket.push(item.likes ?? 0);
      byType.set(item.mediaType, bucket);
    }
    let bestType: string | null = null;
    let bestAverage = -1;
    for (const [mediaType, likes] of byType) {
      const average = likes.reduce((sum, value) => sum + value, 0) / likes.length;
      if (average > bestAverage) {
        bestAverage = average;
        bestType = mediaType;
      }
    }
    if (bestType) {
      return `Your top performing content is ${humanizeMediaType(bestType)} — averaging ${formatCount(
        Math.round(bestAverage),
      )} likes per post across your latest posts.`;
    }
  }
  const strength = records[0]?.analysis.strengths.find((item) => item.trim().length > 0);
  if (strength) {
    return `From your latest analysis: ${strength}`;
  }
  if (ideaCount > 0) {
    return `You have ${ideaCount} AI idea${ideaCount === 1 ? '' : 's'} ready — open Content to pick your next Reel.`;
  }
  return null;
}

// ---------- DNA derivations ----------

// Trends are only claimed when there is enough evidence to back them: a
// series is split into an older half and a newer half, and anything shorter
// than this stays "no trend" instead of guessing from a couple of posts.
const TREND_MIN_SAMPLES = 4;
// Deltas below this are rounding noise, not a direction, so they read steady.
const TREND_MIN_DELTA = 0.3;

type TrendDirection = 'improving' | 'steady' | 'slipping';

type CategoryStat = {
  key: ScoreKey;
  label: string;
  value: number;
  count: number;
  delta: number | null;
  direction: TrendDirection | null;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function analysesWord(count: number): string {
  return count === 1 ? 'analysis' : 'analyses';
}

// Lowercase for sentence flow without mangling acronyms — "CTA" stays CTA.
function categoryName(label: string): string {
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

// Oldest first, so the trend math never depends on how the caller ordered
// the records. Unparseable dates compare as equal to keep the order stable.
function chronological(records: AnalysisRecord[]): AnalysisRecord[] {
  return [...records].sort((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return 0;
    }
    return left - right;
  });
}

// Newer-half average minus older-half average, rounded to 1 decimal, or null
// when there aren't TREND_MIN_SAMPLES points to split into two halves. An odd
// middle sample sits out of both halves so the comparison stays symmetric.
function halfSplitDelta(values: number[]): number | null {
  if (values.length < TREND_MIN_SAMPLES) {
    return null;
  }
  const half = Math.floor(values.length / 2);
  const older = values.slice(0, half);
  const newer = values.slice(values.length - half);
  return round1(average(newer) - average(older));
}

function directionOf(delta: number): TrendDirection {
  if (delta >= TREND_MIN_DELTA) {
    return 'improving';
  }
  if (delta <= -TREND_MIN_DELTA) {
    return 'slipping';
  }
  return 'steady';
}

function trendText(direction: TrendDirection, delta: number): string {
  if (direction === 'improving') {
    return `improving (+${delta.toFixed(1)})`;
  }
  if (direction === 'slipping') {
    return `slipping (${delta.toFixed(1)})`;
  }
  return 'steady';
}

// The single source for strengths, weaknesses, recommendations, and the
// Overview rows: per-category average, how many analyses feed it, and the
// half-over-half trend when the sample is large enough to have one.
function categoryStats(records: AnalysisRecord[]): CategoryStat[] {
  const ordered = chronological(records);
  const stats: CategoryStat[] = [];
  for (const { key, label } of SCORE_LABELS) {
    const values = ordered
      .map((record) => numberOrNull(record.analysis.scores?.[key]))
      .filter((value): value is number => value !== null);
    if (values.length === 0) {
      continue;
    }
    const delta = halfSplitDelta(values);
    stats.push({
      key,
      label,
      value: round1(average(values)),
      count: values.length,
      delta,
      direction: delta === null ? null : directionOf(delta),
    });
  }
  return stats;
}

function scoreDetail(stat: CategoryStat): string {
  const detail = `Averages ${stat.value}/10 across ${stat.count} ${analysesWord(stat.count)}`;
  if (stat.delta === null || stat.direction === null) {
    return detail;
  }
  return `${detail} · ${trendText(stat.direction, stat.delta)}`;
}

// Overall DNA direction, from every record that has any score at all. Null
// unless there are enough records to split into two comparable halves.
function overallTrend(
  records: AnalysisRecord[],
): { direction: TrendDirection; delta: number } | null {
  const values = chronological(records)
    .map((record) => scoreOf(record))
    .filter((value): value is number => value !== null);
  const delta = halfSplitDelta(values);
  return delta === null ? null : { direction: directionOf(delta), delta };
}

// How many distinct analyses mention each free-text line. Counted once per
// record, deduped case-insensitively, and ranked by how many records repeat it.
function mentionCounts(
  records: AnalysisRecord[],
  pick: (analysis: AnalysisRecord['analysis']) => string[],
): Array<{ text: string; count: number }> {
  const counts = new Map<string, { text: string; count: number }>();
  for (const record of records) {
    const seenInRecord = new Set<string>();
    for (const raw of pick(record.analysis)) {
      const text = raw.trim();
      const key = text.toLowerCase();
      if (!key || seenInRecord.has(key)) {
        continue;
      }
      seenInRecord.add(key);
      const entry = counts.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        counts.set(key, { text, count: 1 });
      }
    }
  }
  // Map order is first appearance, so equal counts keep the analyses' order.
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

// "Noted in 4 of 12 analyses" — the evidence behind a free-text insight.
function evidenceDetail(count: number, total: number, verb = 'Noted'): string {
  return `${verb} in ${count} of ${total} ${analysesWord(total)}`;
}

export type WorksRow = {
  key: string;
  icon: 'hash' | 'quote' | 'timer' | 'grid' | 'clock' | 'check' | 'warning' | 'chart';
  label: string;
  value: string;
};

function topEntry(counts: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) {
      best = entry;
    }
  }
  return best && best[1] > 0 ? best : null;
}

export function whatWorksRows(
  records: AnalysisRecord[],
  dashboard: InstagramDashboard | null,
): WorksRow[] {
  const rows: WorksRow[] = [];

  // Best topics — from the AI analyses' real topic labels.
  const topics = new Map<string, number>();
  for (const record of records) {
    const primary = record.analysis.topics.primary;
    if (primary) {
      topics.set(primary, (topics.get(primary) ?? 0) + 1);
    }
    for (const secondary of record.analysis.topics.secondary) {
      if (secondary) {
        topics.set(secondary, (topics.get(secondary) ?? 0) + 1);
      }
    }
  }
  const topTopics = [...topics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([topic]) => topic);
  if (topTopics.length > 0) {
    rows.push({ key: 'topics', icon: 'hash', label: 'Best Topics', value: topTopics.join(', ') });
  }

  // Best hook style — most common hook type across analyses.
  const hooks = new Map<string, number>();
  for (const record of records) {
    const hookType = record.analysis.hook.type;
    if (hookType && hookType !== 'not_assessable') {
      hooks.set(hookType, (hooks.get(hookType) ?? 0) + 1);
    }
  }
  const bestHook = topEntry(hooks);
  if (bestHook) {
    rows.push({
      key: 'hook',
      icon: 'quote',
      label: 'Best Hook Style',
      value: humanizeHookType(bestHook[0]),
    });
  }

  // Best format — from analyses, falling back to the media type that earns
  // the most likes on the real Instagram feed.
  const formats = new Map<string, number>();
  for (const record of records) {
    const format = record.analysis.format;
    if (format && format !== 'not_assessable') {
      formats.set(format, (formats.get(format) ?? 0) + 1);
    }
  }
  const bestFormat = topEntry(formats);
  if (bestFormat) {
    rows.push({
      key: 'format',
      icon: 'grid',
      label: 'Best Format',
      value: humanizeFormat(bestFormat[0]),
    });
  } else if (dashboard && dashboard.media.length >= 2) {
    const byType = new Map<string, number[]>();
    for (const item of dashboard.media) {
      if (item.likes === null) {
        continue;
      }
      const bucket = byType.get(item.mediaType) ?? [];
      bucket.push(item.likes);
      byType.set(item.mediaType, bucket);
    }
    let bestType: string | null = null;
    let bestAverage = -1;
    for (const [mediaType, likes] of byType) {
      if (likes.length < 2) {
        continue;
      }
      const average = likes.reduce((sum, value) => sum + value, 0) / likes.length;
      if (average > bestAverage) {
        bestAverage = average;
        bestType = mediaType;
      }
    }
    if (bestType) {
      rows.push({
        key: 'format',
        icon: 'grid',
        label: 'Best Format',
        value: `${humanizeMediaType(bestType)} (by likes)`,
      });
    }
  }

  // Best video length — the real durations of analyzed content.
  const durations = records
    .map((record) => record.analysis.duration_seconds)
    .filter((value): value is number => typeof value === 'number' && value > 0)
    .sort((a, b) => a - b);
  if (durations.length > 0) {
    const min = durations[0];
    const max = durations[durations.length - 1];
    rows.push({
      key: 'length',
      icon: 'timer',
      label: 'Analyzed Length',
      value: min === max ? `${min} seconds` : `${min} – ${max} seconds`,
    });
  }

  // Best posting time — hours of the top-liked real posts.
  const dated = (dashboard?.media ?? [])
    .filter((item) => item.likes !== null && item.timestamp)
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 3);
  const hours = dated
    .map((item) => new Date(item.timestamp as string).getHours())
    .filter((hour) => Number.isFinite(hour));
  if (hours.length >= 2) {
    const minHour = Math.min(...hours);
    const maxHour = Math.max(...hours);
    if (minHour !== maxHour) {
      rows.push({
        key: 'posting',
        icon: 'clock',
        label: 'Top Post Time',
        value: `${formatHour(minHour)} – ${formatHour(maxHour)}`,
      });
    }
  }

  // Best and worst scoring categories plus the overall direction — the
  // headline facts the Overview should never hide behind a chart.
  const stats = categoryStats(records);
  if (stats.length > 0) {
    const byValue = [...stats].sort((a, b) => b.value - a.value);
    const strongest = byValue[0];
    rows.push({
      key: 'strongest',
      icon: 'check',
      label: 'Strongest',
      value: `${strongest.label} · ${strongest.value}/10`,
    });
    // Only a second row when there really is a spread to compare against.
    if (byValue.length > 1) {
      const weakest = byValue[byValue.length - 1];
      rows.push({
        key: 'weakest',
        icon: 'warning',
        label: 'Weakest',
        value: `${weakest.label} · ${weakest.value}/10`,
      });
    }
  }
  const trend = overallTrend(records);
  if (trend) {
    const text = trendText(trend.direction, trend.delta);
    rows.push({
      key: 'trend',
      icon: 'chart',
      label: 'Score Trend',
      value: text.charAt(0).toUpperCase() + text.slice(1),
    });
  }

  // Note: audience demographics (age/country) are intentionally absent — the
  // app does not have that data and will not invent it.
  return rows;
}

export function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve} ${suffix}`;
}

export type InsightItem = { title: string; detail?: string };

export function dnaStrengths(records: AnalysisRecord[]): InsightItem[] {
  const items: InsightItem[] = [];
  // Score-based entries first: the category itself, its average, how many
  // analyses that average rests on, and the trend when it is computable.
  for (const stat of categoryStats(records)) {
    if (stat.value >= 7.5) {
      items.push({ title: `Strong ${categoryName(stat.label)}`, detail: scoreDetail(stat) });
    }
  }
  const total = records.length;
  for (const mention of mentionCounts(records, (analysis) => analysis.strengths)) {
    if (items.length >= 6) {
      break;
    }
    items.push({ title: mention.text, detail: evidenceDetail(mention.count, total) });
  }
  return items.slice(0, 6);
}

export function dnaWeaknesses(records: AnalysisRecord[]): InsightItem[] {
  const items: InsightItem[] = [];
  // Flag anything below 7.0, plus the 7.0–7.5 band when it is actually
  // slipping — a near-threshold category on the way down used to vanish from
  // both lists because it cleared neither cutoff.
  const flagged = categoryStats(records)
    .filter((stat) => stat.value < 7 || (stat.value < 7.5 && stat.direction === 'slipping'))
    .sort((a, b) => a.value - b.value);
  const total = records.length;
  for (const stat of flagged) {
    const below = stat.value < 7;
    const name = categoryName(stat.label);
    items.push({
      title: below ? `Weak ${name}` : `Slipping ${name}`,
      detail: `${below ? 'Below 7.0 · ' : ''}${scoreDetail(stat)}`,
    });
    if (items.length >= 6) {
      return items;
    }
  }
  for (const mention of mentionCounts(records, (analysis) => analysis.improvement_opportunities)) {
    if (items.length >= 6) {
      break;
    }
    items.push({ title: mention.text, detail: evidenceDetail(mention.count, total) });
  }
  return items;
}

// ---------- Ideas / plan ----------

const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function sortIdeas(ideas: CreatorAiIdea[]): CreatorAiIdea[] {
  return ideas
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => {
      const rankA = priorityRank[a.idea.priority ?? ''] ?? 3;
      const rankB = priorityRank[b.idea.priority ?? ''] ?? 3;
      return rankA === rankB ? a.index - b.index : rankA - rankB;
    })
    .map((entry) => entry.idea);
}

export type PlanDay = {
  index: number;
  date: Date;
  weekday: string;
  dayNumber: number;
  isToday: boolean;
  idea: CreatorAiIdea | null;
};

export function buildPlan(ideas: CreatorAiIdea[], now = new Date()): PlanDay[] {
  const ordered = sortIdeas(ideas);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    return {
      index,
      date,
      weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNumber: date.getDate(),
      isToday: index === 0,
      idea: ordered[index] ?? null,
    };
  });
}

export function isIdeaSaved(saved: CreatorAiIdea[], idea: CreatorAiIdea): boolean {
  const title = idea.title.trim().toLowerCase();
  return saved.some((item) => item.title.trim().toLowerCase() === title);
}

export function toggleSavedIdea(
  saved: CreatorAiIdea[],
  idea: CreatorAiIdea,
): CreatorAiIdea[] {
  const title = idea.title.trim().toLowerCase();
  if (isIdeaSaved(saved, idea)) {
    return saved.filter((item) => item.title.trim().toLowerCase() !== title);
  }
  return [...saved, idea];
}

export function priorityTone(
  priority: CreatorAiIdea['priority'],
): 'green' | 'amber' | 'gray' {
  if (priority === 'high') return 'green';
  if (priority === 'medium') return 'amber';
  return 'gray';
}

export function priorityLabel(priority: CreatorAiIdea['priority']): string {
  if (priority === 'high') return 'High Potential';
  if (priority === 'medium') return 'Medium Potential';
  if (priority === 'low') return 'Low Potential';
  return 'AI Pick';
}

// ---------- Performance derivations ----------

type DailyPoint = NonNullable<InstagramDashboard['daily']>[number];

export function filterDaily(daily: DailyPoint[], days: number, now = new Date()): DailyPoint[] {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const cutoffKey = toDateKey(cutoff);
  return daily.filter((point) => point.date >= cutoffKey);
}

export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export type PeriodTotals = {
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export function periodTotals(
  dashboard: InstagramDashboard | null,
  days: number,
  now = new Date(),
): PeriodTotals {
  if (!dashboard) {
    return { views: null, likes: null, comments: null };
  }
  if (dashboard.daily) {
    const points = filterDaily(dashboard.daily, days, now);
    const sum = (pick: (point: DailyPoint) => number | null): number | null => {
      const values = points
        .map(pick)
        .filter((value): value is number => value !== null);
      if (values.length === 0) {
        return null;
      }
      return values.reduce((total, value) => total + value, 0);
    };
    const views = sum((point) => point.views);
    const likes = sum((point) => point.likes);
    const comments = sum((point) => point.comments);
    if (views === null && likes === null && comments === null) {
      return { views: null, likes: null, comments: null };
    }
    return { views, likes, comments };
  }
  // No usable daily series for this window: fall back to the real window
  // totals the API did share (7-day; 90-day backs the 90-day and 1-year
  // filters), and finally to the 30-day headline totals so every period
  // shows live numbers instead of dead "—" tiles.
  const headline = {
    views: dashboard.stats.views,
    likes: dashboard.stats.likes,
    comments: dashboard.stats.comments,
  };
  if (days === 7) {
    const week = dashboard.stats.week;
    if (week.views !== null || week.likes !== null || week.comments !== null) {
      return { views: week.views, likes: week.likes, comments: week.comments };
    }
    return headline;
  }
  if (days === 90 || days === 365) {
    const ninety = dashboard.stats.ninety;
    if (ninety.views !== null || ninety.likes !== null || ninety.comments !== null) {
      return { views: ninety.views, likes: ninety.likes, comments: ninety.comments };
    }
    return headline;
  }
  return headline;
}

// Totals for the window immediately before the selected one, computed from
// the daily series so 7/90/365-day views get real growth deltas too.
// Returns null when there isn't enough day-by-day history to compare.
export function previousPeriodTotals(
  dashboard: InstagramDashboard | null,
  days: number,
  now = new Date(),
): PeriodTotals | null {
  if (!dashboard?.daily) {
    return null;
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (2 * days - 1));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const points = dashboard.daily.filter(
    (point) => point.date >= startKey && point.date <= endKey,
  );
  const sum = (pick: (point: DailyPoint) => number | null): number | null => {
    const values = points
      .map(pick)
      .filter((value): value is number => value !== null);
    if (values.length === 0) {
      return null;
    }
    return values.reduce((total, value) => total + value, 0);
  };
  const views = sum((point) => point.views);
  const likes = sum((point) => point.likes);
  const comments = sum((point) => point.comments);
  if (views === null && likes === null && comments === null) {
    return null;
  }
  return { views, likes, comments };
}

export function chartPoints(
  dashboard: InstagramDashboard | null,
  days: number,
  metric: 'views' | 'likes' | 'comments' | 'engagement' | 'reach',
  now = new Date(),
): ChartPoint[] {
  if (!dashboard?.daily) {
    if (metric === 'reach' && days === 30 && dashboard?.stats.reach !== null && dashboard?.stats.reach !== undefined) {
      return [];
    }
    return [];
  }
  const points = filterDaily(dashboard.daily, days, now);
  return points
    .map((point) => {
      let value: number | null;
      if (metric === 'engagement') {
        const likes = point.likes ?? 0;
        const comments = point.comments ?? 0;
        value = point.likes === null && point.comments === null ? null : likes + comments;
      } else if (metric === 'reach') {
        value = null;
      } else {
        value = point[metric];
      }
      if (value === null) {
        return null;
      }
      const date = new Date(`${point.date}T00:00:00`);
      const label = Number.isNaN(date.getTime())
        ? point.date
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return { label, value };
    })
    .filter((point): point is ChartPoint => point !== null);
}

export function topicsBreakdown(records: AnalysisRecord[]): Array<{ topic: string; share: number }> | null {
  const counts = new Map<string, number>();
  for (const record of records) {
    const primary = record.analysis.topics.primary;
    if (primary) {
      counts.set(primary, (counts.get(primary) ?? 0) + 1);
    }
    for (const secondary of record.analysis.topics.secondary) {
      if (secondary) {
        counts.set(secondary, (counts.get(secondary) ?? 0) + 1);
      }
    }
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return null;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({
      topic,
      share: Math.round((count / total) * 100),
    }));
}

// ---------- Analysis helpers ----------

export function praiseForScore(
  record: AnalysisRecord,
): string | null {
  const overall = scoreOf(record);
  if (overall === null) {
    return null;
  }
  const breakdown = scoreBreakdown([record]).filter(
    (item): item is { key: ScoreKey; label: string; value: number } => item.value !== null,
  );
  if (breakdown.length >= 2) {
    const sorted = [...breakdown].sort((a, b) => b.value - a.value);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.key !== worst.key) {
      return `Strongest: ${best.label} (${best.value}). Room to grow: ${worst.label} (${worst.value}).`;
    }
  }
  if (overall >= 8) {
    return 'Great performance — this content scores high across the board.';
  }
  if (overall >= 6.5) {
    return 'Solid content with a few clear ways to improve.';
  }
  return 'This one has clear room to grow — start with the lowest scores below.';
}

export function futureTips(records: AnalysisRecord[]): InsightItem[] {
  const total = records.length;

  // Score-driven tips are always included (never only as a fallback), limited
  // to the categories that are actually low or slipping, worst first.
  const scoreTips: InsightItem[] = categoryStats(records)
    .filter((stat) => stat.value < 7 || (stat.value < 7.5 && stat.direction === 'slipping'))
    .sort((a, b) => a.value - b.value)
    .map((stat) => {
      const name = categoryName(stat.label);
      const detail = `Your ${name} averages ${stat.value}/10 across ${stat.count} ${analysesWord(
        stat.count,
      )}`;
      return {
        title: `Strengthen your ${name}`,
        detail:
          stat.delta !== null && stat.direction !== null
            ? `${detail} · ${trendText(stat.direction, stat.delta)}`
            : detail,
      };
    });

  // The user's own repeated improvement notes, most frequently repeated first.
  const ranked = mentionCounts(records, (analysis) => analysis.improvement_opportunities).map(
    (mention) => ({
      title: mention.text,
      detail: evidenceDetail(mention.count, total, 'Seen'),
    }),
  );

  // Reserve a slot for every score tip so the concrete numbers always show up,
  // then fill what is left with the ranked notes and drop exact duplicates.
  const scoreTitles = new Set(scoreTips.map((tip) => tip.title.trim().toLowerCase()));
  const budget = Math.max(0, 5 - scoreTips.length);
  const picks = [
    ...ranked.filter((tip) => !scoreTitles.has(tip.title.trim().toLowerCase())).slice(0, budget),
    ...scoreTips,
  ];
  const tips: InsightItem[] = [];
  const seen = new Set<string>();
  for (const tip of picks) {
    const key = tip.title.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tips.push(tip);
    if (tips.length >= 5) {
      break;
    }
  }
  return tips;
}

// ---------- Formatting ----------

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${trimZero(value / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `${trimZero(value / 1_000)}K`;
  }
  return String(Math.round(value));
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value * 10) / 10}%`;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function metricsLabel(metrics: Record<string, number>): string | null {
  const parts: string[] = [];
  if (typeof metrics.views === 'number') parts.push(`${formatCount(metrics.views)} views`);
  if (typeof metrics.likes === 'number') parts.push(`${formatCount(metrics.likes)} likes`);
  if (typeof metrics.comments === 'number') parts.push(`${formatCount(metrics.comments)} comments`);
  return parts.length > 0 ? parts.join(' • ') : null;
}
