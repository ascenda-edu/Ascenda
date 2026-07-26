import {
  AlertTriangle,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Compass,
  FileText,
  Flag,
  GraduationCap,
  Heart,
  ListChecks,
  MapPin,
  Mail,
  MessageSquare,
  PenLine,
  Sparkles,
  Shield,
  Target,
  Timer,
  TrendingUp,
  UserCircle,
  Users,
  type LucideIcon
} from 'lucide-react';
import { parseLocalDate } from '@/lib/utils/dates';

/**
 * Single source of truth for category styling on the student surface.
 *
 * Counsellor patterns we mirror:
 *   rose   = urgent / overdue / reach
 *   amber  = todo / pending / match / warning
 *   emerald = done / submitted / safety / positive
 *   sky    = in-progress / informational / planning
 *   violet = essay / session / counsellor-flavoured
 *   primary = neutral hero / call-to-action accent
 *
 * Each category exposes:
 *   - icon: a lucide icon component
 *   - text / bg / border / ring / accent class strings
 *   - chip: a single-line className for inline pills.
 *           ALL chips are pill-shaped (rounded-full) and pre-include
 *           `inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold`
 *           so call sites should NOT add their own radius / padding.
 *   - swatch: a single-line className for icon-in-box (h-9 w-9 rounded-2xl)
 */

export type CategoryTone =
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'primary'
  | 'neutral';

export interface CategoryVisual {
  tone: CategoryTone;
  icon: LucideIcon;
  /** Foreground text colour (light + dark adjusted). */
  text: string;
  /** Soft background tint. */
  bg: string;
  /** Border colour for cards using this tone. */
  border: string;
  /** Ring colour for icon-in-box. */
  ring: string;
  /** Left-accent stripe colour, e.g. for `border-l-4`. */
  accent: string;
  /** Compact pill: bg + text + border together. */
  chip: string;
  /** Icon-in-box wrapper. Apply to a <div>; size is opinionated to h-9 w-9 rounded-2xl. */
  swatch: string;
  /** Soft progress-bar fill colour. */
  bar: string;
}

/**
 * Tone class bundles, now built from the semantic tone tokens in globals.css
 * rather than raw Tailwind palette literals.
 *
 * Why this matters: every value below used to be a hardcoded `emerald-600` /
 * `rose-200/60` etc. — 1,808 such literals across the app. That made status colour
 * untunable, gave it no dark-mode contrast pass, and let it drift (emerald vs
 * green, rose vs red, sky vs blue were all in play simultaneously).
 *
 * The tokens are solved for WCAG AA in BOTH themes, so no `dark:` variants are
 * needed here at all — the token flips itself. Each tone guarantees:
 *   text-{tone}         >= 4.5:1 on card, background and muted
 *   bg-{tone}-subtle    a tint that text-{tone} stays >= 4.5:1 against
 *   bg-{tone}           a solid fill that text-{tone}-foreground sits on
 *
 * The legacy tone NAMES (rose/amber/emerald/sky/violet) are kept as the public
 * CategoryTone union so ~13 consuming files don't churn, but each now maps to its
 * semantic token. The mapping is the one already documented above:
 *   rose -> danger, amber -> warning, emerald -> success, sky -> info,
 *   violet -> feature.
 */
const TONE: Record<CategoryTone, Omit<CategoryVisual, 'icon' | 'tone'>> = {
  rose: {
    text: 'text-danger',
    bg: 'bg-danger-subtle',
    border: 'border-danger/25',
    ring: 'ring-danger/25',
    accent: 'border-l-danger',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-danger-subtle text-danger border border-danger/25',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-danger-subtle text-danger ring-1 ring-danger/25',
    bar: 'bg-danger-fill'
  },
  amber: {
    text: 'text-warning',
    bg: 'bg-warning-subtle',
    border: 'border-warning/25',
    ring: 'ring-warning/25',
    accent: 'border-l-warning',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-warning-subtle text-warning border border-warning/25',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-warning-subtle text-warning ring-1 ring-warning/25',
    bar: 'bg-warning-fill'
  },
  emerald: {
    text: 'text-success',
    bg: 'bg-success-subtle',
    border: 'border-success/25',
    ring: 'ring-success/25',
    accent: 'border-l-success',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-success-subtle text-success border border-success/25',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-success-subtle text-success ring-1 ring-success/25',
    bar: 'bg-success-fill'
  },
  sky: {
    text: 'text-info',
    bg: 'bg-info-subtle',
    border: 'border-info/25',
    ring: 'ring-info/25',
    accent: 'border-l-info',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-info-subtle text-info border border-info/25',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-info-subtle text-info ring-1 ring-info/25',
    bar: 'bg-info-fill'
  },
  violet: {
    text: 'text-feature',
    bg: 'bg-feature-subtle',
    border: 'border-feature/25',
    ring: 'ring-feature/25',
    accent: 'border-l-feature',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-feature-subtle text-feature border border-feature/25',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-feature-subtle text-feature ring-1 ring-feature/25',
    bar: 'bg-feature-fill'
  },
  primary: {
    // primary-ink, not primary: --primary is tuned to carry white button text and
    // measures 3.58:1 as text on a dark card.
    text: 'text-primary-ink',
    bg: 'bg-primary/10',
    border: 'border-primary/25',
    ring: 'ring-primary/25',
    accent: 'border-l-primary',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary-ink border border-primary/25',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink ring-1 ring-primary/25',
    bar: 'bg-primary'
  },
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-muted/40',
    border: 'border-border',
    ring: 'ring-border',
    accent: 'border-l-border',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted/60 text-foreground border border-border',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-muted/60 text-foreground ring-1 ring-border',
    bar: 'bg-muted-foreground/30'
  }
};

const make = (tone: CategoryTone, icon: LucideIcon): CategoryVisual => ({
  tone,
  icon,
  ...TONE[tone]
});

/* ─── Application priority / status ─────────────────────────────────── */

export type ApplicationPriority = 'high' | 'medium' | 'watch';
export const PRIORITY_VISUAL: Record<ApplicationPriority, CategoryVisual> = {
  high: make('rose', AlertTriangle),
  medium: make('amber', Target),
  watch: make('sky', Compass)
};
export const PRIORITY_LABEL: Record<ApplicationPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  watch: 'Keep an eye on'
};

export type ApplicationStatusTone = 'planning' | 'in_progress' | 'submitted' | 'decision';
export const APPLICATION_STATUS_VISUAL: Record<ApplicationStatusTone, CategoryVisual> = {
  planning: make('sky', Compass),
  in_progress: make('amber', Timer),
  submitted: make('emerald', CheckCircle2),
  decision: make('violet', Award)
};

/* ─── Reach / Match / Safety tier ───────────────────────────────────── */

export type FitTier = 'reach' | 'match' | 'safety';
export const TIER_VISUAL: Record<FitTier, CategoryVisual> = {
  reach: make('rose', TrendingUp),
  match: make('amber', Target),
  safety: make('emerald', Shield)
};
export const TIER_LABEL: Record<FitTier, string> = {
  reach: 'Reach',
  match: 'Match',
  safety: 'Safety'
};

export const classifyFitTier = (fitScore: number | null | undefined): FitTier | null => {
  if (typeof fitScore !== 'number' || Number.isNaN(fitScore)) return null;
  if (fitScore >= 80) return 'safety';
  if (fitScore >= 60) return 'match';
  return 'reach';
};

/* ─── Document / requirement status ─────────────────────────────────── */

export type DocStatus = 'received' | 'pending' | 'overdue';
export const DOC_STATUS_VISUAL: Record<DocStatus, CategoryVisual> = {
  received: make('emerald', CheckCircle2),
  pending: make('amber', Clock),
  overdue: make('rose', AlertTriangle)
};

/* ─── Task / requirement type ───────────────────────────────────────── */

export type TaskType = 'essay' | 'reference' | 'test' | 'interview' | 'document' | 'general';
export const TASK_VISUAL: Record<TaskType, CategoryVisual> = {
  essay: make('violet', PenLine),
  reference: make('sky', Mail),
  test: make('amber', ClipboardCheck),
  interview: make('rose', Calendar),
  document: make('primary', FileText),
  general: make('neutral', ListChecks)
};

export const inferTaskType = (label?: string | null): TaskType => {
  const l = (label ?? '').toLowerCase();
  if (l.includes('essay') || l.includes('personal statement') || l.includes('writing')) return 'essay';
  if (l.includes('reference') || l.includes('recommend') || l.includes('letter')) return 'reference';
  if (l.includes('test') || l.includes('exam') || l.includes('sat') || l.includes('ielts') || l.includes('toefl'))
    return 'test';
  if (l.includes('interview')) return 'interview';
  if (l.includes('document') || l.includes('transcript') || l.includes('upload')) return 'document';
  return 'general';
};

/* ─── Deadline urgency ──────────────────────────────────────────────── */

export type DeadlineUrgency = 'overdue' | 'this-week' | 'this-month' | 'later' | 'unknown';
export const DEADLINE_VISUAL: Record<DeadlineUrgency, CategoryVisual> = {
  overdue: make('rose', AlertTriangle),
  'this-week': make('amber', CalendarClock),
  'this-month': make('sky', Calendar),
  later: make('emerald', Calendar),
  unknown: make('neutral', Calendar)
};

export const classifyDeadlineUrgency = (
  isoDate?: string | null,
  now: Date = new Date()
): DeadlineUrgency => {
  if (!isoDate) return 'unknown';
  // Date-only strings must parse as LOCAL dates — new Date('YYYY-MM-DD') is UTC
  // midnight, which shifts the deadline by the user's UTC offset (see lib/utils/dates).
  const target = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? parseLocalDate(isoDate) : new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 'unknown';
  const days = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'overdue';
  if (days <= 7) return 'this-week';
  if (days <= 30) return 'this-month';
  return 'later';
};

/* ─── Profile section ───────────────────────────────────────────────── */

export type ProfileSection = 'personal' | 'academics' | 'lifestyle' | 'aspirations';
export const PROFILE_SECTION_VISUAL: Record<ProfileSection, CategoryVisual> = {
  personal: make('sky', UserCircle),
  academics: make('violet', GraduationCap),
  lifestyle: make('amber', Heart),
  aspirations: make('emerald', Target)
};

/* ─── Profile completion banding ────────────────────────────────────── */

export type CompletionBand = 'low' | 'mid' | 'high' | 'full';
export const COMPLETION_VISUAL: Record<CompletionBand, CategoryVisual> = {
  low: make('rose', AlertTriangle),
  mid: make('amber', Target),
  high: make('sky', TrendingUp),
  full: make('emerald', CheckCircle2)
};

export const classifyCompletion = (percent: number): CompletionBand => {
  if (percent >= 100) return 'full';
  if (percent >= 75) return 'high';
  if (percent >= 50) return 'mid';
  return 'low';
};

/* ─── Scholarship category ──────────────────────────────────────────── */

export type ScholarshipCategory = 'Merit' | 'Regional' | 'STEM' | 'Need' | 'Sports' | 'General';
export const SCHOLARSHIP_VISUAL: Record<ScholarshipCategory, CategoryVisual> = {
  Merit: make('violet', Award),
  Regional: make('sky', MapPin),
  STEM: make('emerald', Briefcase),
  Need: make('amber', Heart),
  Sports: make('rose', Target),
  General: make('neutral', Sparkles)
};

/* ─── Toolbox tools ─────────────────────────────────────────────────── */

export type ToolboxTool = 'essay' | 'chances' | 'requirements' | 'timeline' | 'hub';
export const TOOL_VISUAL: Record<ToolboxTool, CategoryVisual> = {
  essay: make('violet', PenLine),
  chances: make('amber', Target),
  requirements: make('sky', ClipboardList),
  timeline: make('rose', CalendarClock),
  hub: make('primary', Sparkles)
};

/* ─── Update / signal types (Updates feed on applications) ─────────── */

export type SignalType = 'deadline' | 'scholarship' | 'portal' | 'task';
export const SIGNAL_VISUAL: Record<SignalType, CategoryVisual> = {
  deadline: make('rose', CalendarClock),
  scholarship: make('emerald', Award),
  portal: make('sky', BookOpen),
  task: make('amber', ListChecks)
};

/* ─── Note types (faculty parity) ───────────────────────────────────── */

export type NoteType = 'session' | 'flag' | 'update';
export const NOTE_VISUAL: Record<NoteType, CategoryVisual> = {
  session: make('violet', MessageSquare),
  flag: make('amber', Flag),
  update: make('sky', TrendingUp)
};

/* ─── Re-export icons used as default fallbacks ─────────────────────── */
export { Users };
