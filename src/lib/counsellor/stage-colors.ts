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

import { APPLICATION_STATUS_VISUAL, type ApplicationStatusTone } from '@/lib/theme/categories';
import type { ApplicationStatus } from './types';

export interface StageColor {
  label: string;
  /** text-… for headings and status labels */
  text: string;
  /** translucent chip background */
  bg: string;
  /** border-l-… accent for kanban cards */
  borderLeft: string;
  /** solid bg-… for accent bars */
  accent: string;
}

const STAGE_LABEL: Record<ApplicationStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  decision: 'Decision',
};

const build = (status: ApplicationStatus): StageColor => {
  const v = APPLICATION_STATUS_VISUAL[status as ApplicationStatusTone];
  return {
    label: STAGE_LABEL[status],
    text: v.text,
    bg: v.bg,
    borderLeft: v.accent,
    accent: v.bar,
  };
};

export const STAGE_COLORS: Record<ApplicationStatus, StageColor> = {
  planning: build('planning'),
  in_progress: build('in_progress'),
  submitted: build('submitted'),
  decision: build('decision'),
};
