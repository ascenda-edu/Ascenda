// Application-stage colours for the counsellor section.
//
// This file used to declare its own palette and had drifted from
// lib/theme/categories.ts — the tone system of record — on *every* stage:
//
//              stage-colors (old)   categories.ts (APPLICATION_STATUS_VISUAL)
//   planning   amber                sky
//   in_progress sky                 amber
//   submitted  violet               emerald
//   decision   emerald              violet
//
// So the same application read as a different colour depending on which screen you
// were on. It also had no `dark:` variants at all, so `text-amber-600` sat on dark
// counsellor cards unreadably.
//
// It is now a thin projection of APPLICATION_STATUS_VISUAL. The shape (label / text
// / bg / borderLeft / accent) is preserved so application-overview.tsx and
// _analytics-client.tsx don't need to change, but the colours can no longer drift,
// and they inherit the tone tokens' AA-verified light+dark values.

import { APPLICATION_STATUS_VISUAL } from '@/lib/theme/categories';
import type { ApplicationStatus } from './types';

export interface StageColor {
  label: string;
  /** text-… for headings and status labels */
  text: string;
  /** translucent chip background */
  bg: string;
  /** border-l-… accent for kanban cards — neutral: a stage is not an urgency */
  borderLeft: string;
  /** solid bg-… for accent bars */
  accent: string;
}

export const STAGE_LABEL: Record<ApplicationStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  decision: 'Decision',
  enrolled: 'Enrolled',
};

// No `as ApplicationStatusTone` cast here on purpose. The cast used to hide the
// fact that `ApplicationStatus` had a member (`enrolled`) with no visual entry,
// which would have read `undefined.text` and crashed the whole counsellor route.
// Indexing unguarded makes any future divergence a typecheck failure instead.
const build = (status: ApplicationStatus): StageColor => {
  const v = APPLICATION_STATUS_VISUAL[status];
  return {
    label: STAGE_LABEL[status],
    text: v.text,
    bg: v.bg,
    // NOT `v.accent`. A coloured left rail is reserved for urgency — overdue work,
    // the next thing due. An application stage is a CATEGORY: the card already
    // names it, and the board already groups by it, so a per-stage hue on the rail
    // told the reader nothing and made every card shout. The rail stays (it is
    // load-bearing for the kanban's scannability) but goes neutral.
    borderLeft: 'border-l-border',
    accent: v.bar,
  };
};

export const STAGE_COLORS: Record<ApplicationStatus, StageColor> = {
  planning: build('planning'),
  in_progress: build('in_progress'),
  submitted: build('submitted'),
  decision: build('decision'),
  enrolled: build('enrolled'),
};

/**
 * Pipeline order, left to right — kanban columns, funnel bars, tallies.
 *
 * `assertAllStages` is a compile-time exhaustiveness guard: the array is rejected
 * unless every member of `ApplicationStatus` appears in it, so a new status can't
 * be added to the domain type and then silently omitted from every board.
 */
const assertAllStages = <T extends readonly ApplicationStatus[]>(
  stages: T & (ApplicationStatus extends T[number] ? unknown : never)
): T => stages;

export const STAGE_ORDER = assertAllStages([
  'planning',
  'in_progress',
  'submitted',
  'decision',
  'enrolled',
] as const);

/**
 * The funnel/analytics vocabulary. Stage keys are camelCase there (they key the
 * widget config and the drill-down state), so this is the ONE place that
 * translates them back to snake_case `ApplicationStatus` values. Both sides are
 * exhaustive `Record`s: adding a status forces the funnel to grow with it rather
 * than quietly under-counting.
 *
 * It lives here rather than in `lib/counsellor/data.ts` because the funnel and
 * kanban are client components — importing a runtime value from the data module
 * would drag the Supabase client into the browser bundle.
 */
export type FunnelStage = 'planning' | 'inProgress' | 'submitted' | 'decision' | 'enrolled';
export type AppFunnel = Record<FunnelStage, number>;

export const FUNNEL_STAGE_TO_STATUS: Record<FunnelStage, ApplicationStatus> = {
  planning: 'planning',
  inProgress: 'in_progress',
  submitted: 'submitted',
  decision: 'decision',
  enrolled: 'enrolled',
};

export const FUNNEL_STAGES = Object.keys(FUNNEL_STAGE_TO_STATUS) as FunnelStage[];
