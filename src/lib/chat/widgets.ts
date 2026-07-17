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

// Minimal per-kind field checks for the first item — enough to reject junk
// from the wire or old/corrupt rows without exhaustively validating every field.
const ITEM_CHECKS: Record<ChatWidgetKind, (item: Record<string, unknown>) => boolean> = {
  programs: (i) => typeof i.id === 'string' && typeof i.course === 'string',
  universities: (i) => typeof i.id === 'string' && typeof i.name === 'string' && Array.isArray(i.programs),
  deadlines: (i) => typeof i.label === 'string' && typeof i.date === 'string' && typeof i.daysUntil === 'number',
  matches: (i) =>
    typeof i.id === 'string' &&
    typeof i.score === 'number' &&
    !!i.factors &&
    typeof i.factors === 'object',
  tasks: (i) => typeof i.id === 'string' && typeof i.name === 'string' && typeof i.status === 'string',
  cohort_stats: (i) => typeof i.label === 'string' && typeof i.value === 'string',
  at_risk: (i) => typeof i.id === 'string' && typeof i.name === 'string' && typeof i.urgency === 'string',
};

/** Runtime guard for widget groups arriving over the wire or restored from
 * chat_messages.tool_results — never trust the shape (like isChatAction). */
export function isChatWidget(value: unknown): value is ChatWidget {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  if (typeof w.kind !== 'string' || !(WIDGET_KINDS as readonly string[]).includes(w.kind)) {
    return false;
  }
  if (!Array.isArray(w.items)) return false;
  if (w.items.length === 0) return true;
  const first = w.items[0];
  if (!first || typeof first !== 'object') return false;
  return ITEM_CHECKS[w.kind as ChatWidgetKind](first as Record<string, unknown>);
}

/** chat_messages.tool_results rows persisted before the widget envelope are a
 * bare ProgramHit[] — detect (no `kind` on the first element) and wrap. */
export function wrapLegacyToolResults(rows: Record<string, unknown>[]): ChatWidget[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (typeof rows[0]?.kind === 'string') {
    return rows.filter(isChatWidget) as unknown as ChatWidget[];
  }
  const items = rows.filter(
    (r) => r && typeof r.id === 'string' && typeof r.course === 'string'
  );
  return items.length > 0
    ? [{ kind: 'programs', items: items as unknown as ProgramHit[] }]
    : [];
}

// Identity key per kind — what makes two items "the same row" when a tool runs
// twice in one turn (also prevents duplicate React keys downstream).
const identityKey = (kind: ChatWidgetKind, item: Record<string, unknown>): string => {
  if (kind === 'deadlines') {
    return `${item.label}|${item.date}|${item.studentName ?? ''}`;
  }
  if (kind === 'cohort_stats') return String(item.label);
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
    const seen = new Set(targetItems.map((i) => identityKey(target.kind, i)));
    for (const item of widget.items as unknown as Record<string, unknown>[]) {
      if (targetItems.length >= WIDGET_ITEM_CAPS[target.kind]) break;
      const key = identityKey(target.kind, item);
      if (seen.has(key)) continue;
      seen.add(key);
      targetItems.push(item);
    }
  }
  return merged;
}
