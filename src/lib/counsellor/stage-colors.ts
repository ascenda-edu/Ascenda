// Single source of truth for application-stage colours across the counsellor
// section. Aligned to the status palette: amber = todo/warning, sky =
// in-progress, violet = counsellor, emerald = done. Consumed by
// application-overview.tsx (kanban + list) and _analytics-client.tsx (funnel
// drill-down accent) so the two views never drift apart.

import type { ApplicationStatus } from './types';

export interface StageColor {
  label: string;
  /** text-… for headings and status labels */
  text: string;
  /** translucent chip background */
  bg: string;
  /** border-l-… accent for kanban cards */
  borderLeft: string;
  /** solid bg-…-500 for accent bars */
  accent: string;
}

export const STAGE_COLORS: Record<ApplicationStatus, StageColor> = {
  planning: {
    label: 'Planning',
    text: 'text-amber-600',
    bg: 'bg-amber-500/10',
    borderLeft: 'border-l-amber-500',
    accent: 'bg-amber-500',
  },
  in_progress: {
    label: 'In Progress',
    text: 'text-sky-600',
    bg: 'bg-sky-500/10',
    borderLeft: 'border-l-sky-500',
    accent: 'bg-sky-500',
  },
  submitted: {
    label: 'Submitted',
    text: 'text-violet-600',
    bg: 'bg-violet-500/10',
    borderLeft: 'border-l-violet-500',
    accent: 'bg-violet-500',
  },
  decision: {
    label: 'Decision',
    text: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    borderLeft: 'border-l-emerald-500',
    accent: 'bg-emerald-500',
  },
};
