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

export type WorksRow = {
  key: string;
  icon: 'hash' | 'quote' | 'timer' | 'grid' | 'clock';
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
  for (const { label, value } of scoreBreakdown(records)) {
    if (value !== null && value >= 7.5) {
      items.push({ title: `Strong ${label.toLowerCase()}`, detail: `Averages ${value}/10` });
    }
  }
  const seen = new Set<string>();
  for (const record of records) {
    for (const strength of record.analysis.strengths) {
      const key = strength.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({ title: strength.trim() });
      if (items.length >= 6) {
        return items;
      }
    }
  }
  return items;
}

export function dnaWeaknesses(records: AnalysisRecord[]): InsightItem[] {
  const items: InsightItem[] = [];
  for (const { label, value } of scoreBreakdown(records)) {
    if (value !== null && value < 7) {
      items.push({ title: `Weak ${label.toLowerCase()}`, detail: `Averages ${value}/10` });
    }
  }
  const seen = new Set<string>();
  for (const record of records) {
    for (const opportunity of record.analysis.improvement_opportunities) {
      const key = opportunity.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({ title: opportunity.trim() });
      if (items.length >= 6) {
        return items;
      }
    }
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
  // No usable daily series: fall back to the real window totals the API
  // did share (7-day and 30-day windows; the 90-day window backs both the
  // 90-day filter and the 1-year filter, which honestly covers the ~90 days
  // Instagram retains — the UI says so).
  if (days === 7) {
    return {
      views: dashboard.stats.week.views,
      likes: dashboard.stats.week.likes,
      comments: dashboard.stats.week.comments,
    };
  }
  if (days === 90 || days === 365) {
    return {
      views: dashboard.stats.ninety.views,
      likes: dashboard.stats.ninety.likes,
      comments: dashboard.stats.ninety.comments,
    };
  }
  if (days === 30) {
    return {
      views: dashboard.stats.views,
      likes: dashboard.stats.likes,
      comments: dashboard.stats.comments,
    };
  }
  return { views: null, likes: null, comments: null };
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
  const tips: InsightItem[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const opportunity of record.analysis.improvement_opportunities) {
      const key = opportunity.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      tips.push({ title: opportunity.trim() });
      if (tips.length >= 5) {
        return tips;
      }
    }
  }
  if (tips.length === 0) {
    for (const { label, value } of scoreBreakdown(records)) {
      if (value !== null && value < 7) {
        tips.push({
          title: `Strengthen your ${label.toLowerCase()}`,
          detail: `Your ${label.toLowerCase()} scores average ${value}/10 across ${records.length} analysis${records.length === 1 ? '' : 'es'}.`,
        });
      }
    }
  }
  return tips.slice(0, 5);
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
