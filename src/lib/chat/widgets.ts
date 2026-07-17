// Typed rich-widget envelope for the assistant thread. A ReadTool's toWidgets
// turns its execute payload into ChatWidget groups; the tool loop streams them
// (`results` SSE event) and persists them on chat_messages.tool_results; the
// thread renders them through the WidgetRenderer registry.
//
// Isomorphic and JSX-free on purpose (the lib/chat/paths.ts rule): imported by
// the server routes, the browser hook, and jest — react-markdown-adjacent
// modules break node test imports.
//
// SECURITY CONTRACT (mirrors program-result-card.tsx): widget items are
// structured tool output — plain data. Renderers must emit fields as JSX text
// only, never dangerouslySetInnerHTML, and must build every href from an id
// against a fixed route pattern, never from item-supplied strings.

import type { ProgramHit } from './tools';

export interface UniversityHit {
  id: string;
  name: string;
  city: string | null;
  country: string;
  rankOverall?: number | null;
  rankSource?: string | null;
  acceptanceRatePct?: number | null;
  tuitionLow?: number | null;
  tuitionHigh?: number | null;
  currency?: string | null;
  students?: number | null;
  /** ≤3; [0].id keys the student-mode click-through — the university detail
   * route is keyed by PROGRAM id. */
  programs: Array<{ id: string; course: string; level: string | null }>;
}

export interface DeadlineHit {
  label: string;
  university?: string;
  /** Counsellor cohort rows carry the student. */
  studentName?: string;
  studentFlag?: string;
  /** YYYY-MM-DD — render via parseLocalDate (never new Date()). */
  date: string;
  daysUntil: number;
  type?: string;
}

export interface MatchHit {
  id: string;
  course: string;
  university: string;
  score: number;
  /** The STORED engine tier — renderers must not re-classify from score. */
  tier: 'Reach' | 'Match' | 'Safe' | null;
  factors: {
    eligibility: number;
    academicFit: number;
    preferenceFit: number;
    outcomes: number;
  };
}

export interface TaskHit {
  id: string;
  name: string;
  status: 'todo' | 'doing' | 'done';
  dueDate?: string | null;
  application: string;
  applicationId: string;
}

export interface StatHit {
  label: string;
  value: string;
  tone?: 'positive' | 'warning' | 'neutral';
}

export interface AtRiskHit {
  id: string;
  name: string;
  flag?: string;
  urgency: 'critical' | 'high' | 'medium';
  reason: string;
}

export type ChatWidget =
  | { kind: 'programs'; items: ProgramHit[] }
  | { kind: 'universities'; items: UniversityHit[] }
  | { kind: 'deadlines'; items: DeadlineHit[] }
  | { kind: 'matches'; items: MatchHit[] }
  | { kind: 'tasks'; items: TaskHit[] }
  | { kind: 'cohort_stats'; items: StatHit[] }
  | { kind: 'at_risk'; items: AtRiskHit[] };

export type ChatWidgetKind = ChatWidget['kind'];

export const WIDGET_KINDS: readonly ChatWidgetKind[] = [
  'programs',
  'universities',
  'deadlines',
  'matches',
  'tasks',
  'cohort_stats',
  'at_risk',
] as const;

// Per-kind item caps — about thread density more than payload size; applied at
// merge time so the persisted jsonb and the rendered thread always agree.
export const WIDGET_ITEM_CAPS: Record<ChatWidgetKind, number> = {
  programs: 8,
  universities: 3,
  deadlines: 10,
  matches: 10,
  tasks: 12,
  cohort_stats: 8,
  at_risk: 10,
};

const FACTOR_KEYS = ['eligibility', 'academicFit', 'preferenceFit', 'outcomes'] as const;
const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
const URGENCIES = ['critical', 'high', 'medium'] as const;
const TIERS = ['Reach', 'Match', 'Safe'] as const;

// Field checks per kind — cover every field a renderer dereferences without
// its own guard (tier.toLowerCase(), URGENCY_VISUAL[urgency], factors.*), so a
// crafted row degrades to "widget not rendered", never a component throw.
const ITEM_CHECKS: Record<ChatWidgetKind, (item: Record<string, unknown>) => boolean> = {
  programs: (i) => typeof i.id === 'string' && typeof i.course === 'string',
  universities: (i) => typeof i.id === 'string' && typeof i.name === 'string' && Array.isArray(i.programs),
  deadlines: (i) => typeof i.label === 'string' && typeof i.date === 'string' && typeof i.daysUntil === 'number',
  matches: (i) => {
    if (typeof i.id !== 'string' || typeof i.score !== 'number') return false;
    if (i.tier !== null && i.tier !== undefined && !(TIERS as readonly unknown[]).includes(i.tier)) {
      return false;
    }
    const factors = i.factors as Record<string, unknown> | null | undefined;
    if (!factors || typeof factors !== 'object') return false;
    return FACTOR_KEYS.every((k) => typeof factors[k] === 'number');
  },
  tasks: (i) =>
    typeof i.id === 'string' &&
    typeof i.name === 'string' &&
    (TASK_STATUSES as readonly unknown[]).includes(i.status),
  cohort_stats: (i) => typeof i.label === 'string' && typeof i.value === 'string',
  at_risk: (i) =>
    typeof i.id === 'string' &&
    typeof i.name === 'string' &&
    (URGENCIES as readonly unknown[]).includes(i.urgency),
};

/** Runtime guard for widget groups arriving over the wire or restored from
 * chat_messages.tool_results — never trust the shape (like isChatAction).
 * EVERY item is checked: one junk item at index ≥1 would otherwise throw
 * inside a renderer, and with no error boundary above the thread that used to
 * mean a white-screened workspace on every reload of the poisoned row. */
export function isChatWidget(value: unknown): value is ChatWidget {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  if (typeof w.kind !== 'string' || !(WIDGET_KINDS as readonly string[]).includes(w.kind)) {
    return false;
  }
  if (!Array.isArray(w.items)) return false;
  const check = ITEM_CHECKS[w.kind as ChatWidgetKind];
  return w.items.every(
    (item) => !!item && typeof item === 'object' && check(item as Record<string, unknown>)
  );
}

/** chat_messages.tool_results rows persisted before the widget envelope are a
 * bare ProgramHit[] — detect (no `kind` on the first element) and wrap.
 * Restored groups are re-merged so a crafted row with two groups of the same
 * kind collapses to one — the renderer keys on kind, which must stay unique. */
export function wrapLegacyToolResults(rows: Record<string, unknown>[]): ChatWidget[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (typeof rows[0]?.kind === 'string') {
    return mergeWidgets([], rows.filter(isChatWidget) as unknown as ChatWidget[]);
  }
  const items = rows.filter(
    (r) => r && typeof r.id === 'string' && typeof r.course === 'string'
  );
  return items.length > 0
    ? [{ kind: 'programs', items: items as unknown as ProgramHit[] }]
    : [];
}

// Identity key per kind — what makes two items "the same ROW" when a tool runs
// twice in one turn (also the React key downstream, so it must be unique per
// rendered row, not per entity): two programmes can share the canonical UCAS
// date (disambiguate by university), and one at-risk student carries several
// alerts (disambiguate by reason).
export const widgetItemKey = (
  kind: ChatWidgetKind,
  item: Record<string, unknown>
): string => {
  if (kind === 'deadlines') {
    return `${item.label}|${item.date}|${item.university ?? ''}|${item.studentName ?? ''}`;
  }
  if (kind === 'cohort_stats') return String(item.label);
  if (kind === 'at_risk') return `${item.id}|${item.reason ?? ''}`;
  return String(item.id);
};

/** Merge incoming widget groups into the accumulated set: same-kind groups
 * combine (items deduped by identity, capped per kind), first-appearance kind
 * order is preserved. Used by the tool loop's accumulator, the stream hook,
 * and the workspace message patches — one merge semantics everywhere. */
export function mergeWidgets(existing: ChatWidget[], incoming: ChatWidget[]): ChatWidget[] {
  const merged: ChatWidget[] = existing.map((w) => ({ ...w, items: [...w.items] })) as ChatWidget[];
  for (const widget of incoming) {
    const target = merged.find((w) => w.kind === widget.kind);
    if (!target) {
      merged.push({
        ...widget,
        items: widget.items.slice(0, WIDGET_ITEM_CAPS[widget.kind]),
      } as ChatWidget);
      continue;
    }
    const targetItems = target.items as unknown as Record<string, unknown>[];
    const seen = new Set(targetItems.map((i) => widgetItemKey(target.kind, i)));
    for (const item of widget.items as unknown as Record<string, unknown>[]) {
      if (targetItems.length >= WIDGET_ITEM_CAPS[target.kind]) break;
      const key = widgetItemKey(target.kind, item);
      if (seen.has(key)) continue;
      seen.add(key);
      targetItems.push(item);
    }
  }
  return merged;
}
