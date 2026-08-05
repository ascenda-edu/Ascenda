import {
  AlertTriangle,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Circle,
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
import { matchTierFromScore, type MatchTier } from '@/lib/matching/match-tier';
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

/**
 * `sky` (info) and `violet` (feature) are gone. Five status hues could all land on
 * one card, and the reader cannot hold five meanings — so the set is now the three
 * that answer "does this need me?": rose (act now), amber (act soon), emerald
 * (done, terminal). `info` was never a state, it was "in progress", which is the
 * absence of a state; `feature` was a *category* wearing a status hue.
 *
 * Anything that used to be `sky` is neutral, and anything that used to be
 * `violet` is the brand. Do not re-add either: the union is the enforcement, and
 * every registry below is indexed without a cast so a missing member is a compile
 * error rather than an `undefined.text` crash.
 */
export type CategoryTone = 'rose' | 'amber' | 'emerald' | 'primary' | 'neutral';

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
    border: 'border-danger/30',
    ring: 'ring-danger/30',
    accent: 'border-l-danger',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-danger-subtle text-danger border border-danger/30',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-danger-subtle text-danger ring-1 ring-danger/30',
    bar: 'bg-danger-fill'
  },
  amber: {
    text: 'text-warning',
    bg: 'bg-warning-subtle',
    border: 'border-warning/30',
    ring: 'ring-warning/30',
    accent: 'border-l-warning',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-warning-subtle text-warning border border-warning/30',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-warning-subtle text-warning ring-1 ring-warning/30',
    bar: 'bg-warning-fill'
  },
  emerald: {
    text: 'text-success',
    bg: 'bg-success-subtle',
    border: 'border-success/30',
    ring: 'ring-success/30',
    accent: 'border-l-success',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-success-subtle text-success border border-success/30',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-success-subtle text-success ring-1 ring-success/30',
    bar: 'bg-success-fill'
  },
  primary: {
    // primary-ink, not primary: --primary is tuned to carry white button text and
    // measures 3.58:1 as text on a dark card.
    text: 'text-primary-ink',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    ring: 'ring-primary/30',
    accent: 'border-l-primary',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary-ink border border-primary/30',
    // No tint and no ring. A 36px filled box behind an icon is the single most
    // repeated piece of category decoration in the app, and `primary`/`neutral`
    // are exactly the tones the NOMINAL registries resolve to — so this swatch
    // was a brand-tinted plate saying "this is a section", which the section's
    // own heading already says. The ordinal tones (rose/amber/emerald) keep
    // their tinted swatch: there the tint is a state, not a label.
    swatch: 'flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground',
    bar: 'bg-primary'
  },
  // Neutral is a TONE, not an absence of one. It used to be `bg-muted` +
  // `border-border`, which put a dead grey pill with a hard edge (near-black in
  // dark mode, where --border sits at 18% lightness) beside five tinted ones.
  // It now carries the same faint brand wash as `.surface-chip` in globals.css —
  // keep the two in step, they are the same pill. Distinct from `primary` above,
  // which carries indigo TEXT and a stronger edge to mean "brand accent".
  neutral: {
    text: 'text-foreground',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    ring: 'ring-primary/30',
    accent: 'border-l-primary/30',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-foreground border border-primary/30',
    // Untinted, for the same reason as `primary` above.
    swatch: 'flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground',
    // The BAR stays hueless, unlike the chip/swatch above. A bar is read by
    // comparison against its neighbours, and `bg-primary/30` differs from the
    // `primary` tone's own `bg-primary` only in alpha — so a neutral bar and a
    // brand bar side by side were the same colour at two lightnesses, which is
    // exactly the confusion the `--series-*` ramp needs a 2px ring to avoid.
    // A pill has no neighbour to be confused with; a bar always does.
    bar: 'bg-muted-foreground/30'
  }
};

const make = (tone: CategoryTone, icon: LucideIcon): CategoryVisual => ({
  tone,
  icon,
  ...TONE[tone]
});

/* ─── WHICH REGISTRIES GET A HUE, AND WHY ────────────────────────────────────
 * The five status hues are a scarce resource. Spending one on a registry that
 * doesn't need it doesn't just waste it — it actively lies, because the reader
 * has already learned that rose means urgent.
 *
 * The test is ORDINAL vs NOMINAL:
 *
 *   ORDINAL — the values are ranked, and the rank is the point. reach/match/
 *     safety, overdue/pending/received, the completion bands. Hue is doing real
 *     work here: it says "this one is worse than that one" pre-attentively, and
 *     it keeps its hue.
 *
 *   NOMINAL — the values are just names with no order. Profile sections, task
 *     types, scholarship categories, toolbox tools. Hue encodes nothing; it is
 *     an arbitrary ID. These get ONE tone (`primary`, or `neutral` for an
 *     explicit "unspecified" bucket).
 *
 * Nominal registries lose nothing by going monochrome, because every entry
 * already carries its own lucide `icon` — the icon is the type signal, the hue
 * was never carrying that load. What they gain is that a page stops showing
 * four unrelated colours to say "these are four sections of a form", and the
 * hues that ARE left mean something when they appear.
 *
 * This is the same argument that already sent the chart palette monochrome (see
 * --series-* in globals.css): a multi-hue categorical palette was rejected as
 * too loud beside an indigo brand. Icon swatches simply hadn't had it applied.
 *
 * So: before giving a new registry five colours, ask whether its values are
 * RANKED. If they aren't, it gets one.
 * ────────────────────────────────────────────────────────────────────────── */

/* ─── Application priority / status ─────────────────────────────────── */

export type ApplicationPriority = 'high' | 'medium' | 'watch';
export const PRIORITY_VISUAL: Record<ApplicationPriority, CategoryVisual> = {
  high: make('rose', AlertTriangle),
  medium: make('amber', Target),
  // `watch` is the LOWEST priority — "keep an eye on". A hue here competed with
  // the two above it for attention while asking for nothing.
  watch: make('neutral', Compass)
};
export const PRIORITY_LABEL: Record<ApplicationPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  watch: 'Keep an eye on'
};

/**
 * One key per value of the `application_status` Postgres enum — no more, no fewer.
 * Consumers (`lib/counsellor/stage-colors.ts`, the funnel, the kanban) index this
 * table WITHOUT a cast so that adding a status to the enum is a compile error here
 * rather than an `undefined.text` crash at runtime.
 *
 * `enrolled` is `primary`, not a sixth hue: it is the terminal state of the whole
 * product, so it gets the brand accent rather than another status colour. It also
 * stays unambiguous against the two states nearest it — `submitted` (emerald /
 * success) and `decision` (violet / feature).
 */
export type ApplicationStatusTone =
  | 'planning'
  | 'in_progress'
  | 'submitted'
  | 'decision'
  | 'enrolled';
/* The five stages are ordinal, but only two of them ask anything of the student,
   and those are the only two that keep a hue:

     planning     nothing to do yet          → neutral
     in_progress  being worked on now        → amber, act soon
     submitted    your part is done          → emerald, terminal
     decision     waiting on the university  → neutral (waiting is not a task)
     enrolled     terminal state of the app  → the brand

   `decision` was violet and `planning` was sky. Both were marking a *position in
   a sequence*, which the stage label already does, so the hue was spent telling
   the reader something they could already read. */
export const APPLICATION_STATUS_VISUAL: Record<ApplicationStatusTone, CategoryVisual> = {
  planning: make('neutral', Compass),
  in_progress: make('amber', Timer),
  submitted: make('emerald', CheckCircle2),
  decision: make('neutral', Award),
  enrolled: make('primary', GraduationCap)
};

/* ─── Reach / Match / Safety tier ───────────────────────────────────── */

/**
 * Presentation vocabulary for a match tier. The RULE lives in
 * `lib/matching/match-tier.ts` — this file only decides how each tier LOOKS, and
 * `classifyFitTier` below derives from the domain rather than restating it.
 *
 * Two names for one concept (`safety`/`Safe`) is itself a drift seam; the map
 * below is the single place they are reconciled.
 */
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

/** Domain tier → presentation tier. The only place the two vocabularies meet. */
const MATCH_TIER_TO_FIT_TIER: Record<MatchTier, FitTier> = {
  Safe: 'safety',
  Match: 'match',
  Reach: 'reach'
};

/**
 * Classify a fit score for display.
 *
 * Delegates to `matchTierFromScore` rather than repeating the thresholds. The
 * numbers used to be written out here AND, differently, in two lib/ modules —
 * see the note in lib/matching/match-tier.ts.
 */
export const classifyFitTier = (fitScore: number | null | undefined): FitTier | null => {
  const tier = matchTierFromScore(fitScore);
  return tier ? MATCH_TIER_TO_FIT_TIER[tier] : null;
};

/* ─── Document / requirement status ─────────────────────────────────── */

export type DocStatus = 'received' | 'pending' | 'overdue';
export const DOC_STATUS_VISUAL: Record<DocStatus, CategoryVisual> = {
  received: make('emerald', CheckCircle2),
  pending: make('amber', Clock),
  overdue: make('rose', AlertTriangle)
};

/* ─── Task / requirement type ───────────────────────────────────────── */

/**
 * NOMINAL — what KIND of task, not how urgent it is. Urgency is a separate axis
 * and is carried by DEADLINE_VISUAL, which is why `interview: rose` was actively
 * misleading: it painted every interview task in the overdue colour regardless
 * of when it was due, and sat next to a genuinely-overdue rose chip driven by
 * the deadline. Type is the icon's job.
 */
export type TaskType = 'essay' | 'reference' | 'test' | 'interview' | 'document' | 'general';
export const TASK_VISUAL: Record<TaskType, CategoryVisual> = {
  essay: make('primary', PenLine),
  reference: make('primary', Mail),
  test: make('primary', ClipboardCheck),
  interview: make('primary', Calendar),
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
  // A month out is not something to do today. It was sky; the DATE carries the
  // distance, so the hue was duplicating the text beside it.
  'this-month': make('neutral', Calendar),
  later: make('neutral', Calendar),
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

/**
 * NOMINAL — four sections of one form. These were sky/violet/amber/emerald,
 * which put four unrelated colours on /profile to convey nothing except "there
 * are four of these"; `lifestyle` was amber, i.e. the todo/pending colour, on a
 * section that has no pending state. The icons (UserCircle / GraduationCap /
 * Heart / Target) already distinguish them.
 */
export type ProfileSection = 'personal' | 'academics' | 'lifestyle' | 'aspirations';
export const PROFILE_SECTION_VISUAL: Record<ProfileSection, CategoryVisual> = {
  personal: make('primary', UserCircle),
  academics: make('primary', GraduationCap),
  lifestyle: make('primary', Heart),
  aspirations: make('primary', Target)
};

/* ─── Profile completion banding ────────────────────────────────────── */

export type CompletionBand = 'none' | 'low' | 'mid' | 'high' | 'full';
export const COMPLETION_VISUAL: Record<CompletionBand, CategoryVisual> = {
  // "Nothing started" is not "failing". Only reachable via `classifyProgress`,
  // never via `classifyCompletion` — see both below.
  none: make('neutral', Circle),
  low: make('rose', AlertTriangle),
  // `mid` and `high` are both "unfinished, keep going" — they differ in DEGREE,
  // and the percentage beside them already carries the degree. `high` was sky,
  // which read as a third meaning rather than as more of the second.
  mid: make('amber', Target),
  high: make('amber', TrendingUp),
  full: make('emerald', CheckCircle2)
};

/**
 * Band a COMPLETION percentage — how much of a fixed, known set of work is done.
 *
 * 0% lands in `low` (rose) deliberately, and that is not an oversight: every
 * caller of this function measures something the user is expected to finish, so
 * "0% of your profile" and "0% of this student's profile" are genuinely the
 * worst state, not a neutral one. The counsellor roster
 * (`_components/student-card.tsx`) and the cohort chart (`_analytics-client.tsx`,
 * whose lowest bucket is literally labelled `<50%`) both depend on that.
 *
 * If you are banding a counter that can legitimately be empty — a task list with
 * no tasks, a quest deck nobody has opened — you want `classifyProgress`.
 */
export const classifyCompletion = (percent: number): CompletionBand => {
  if (percent >= 100) return 'full';
  if (percent >= 75) return 'high';
  if (percent >= 50) return 'mid';
  return 'low';
};

/**
 * Band a PROGRESS counter — `completed` of `total`, where not having started is a
 * legitimate resting state rather than a failure.
 *
 * The distinction this draws against `classifyCompletion` is the whole reason it
 * exists. Feeding a not-yet-started counter through the completion bands paints
 * it rose, which produced a red "0% ready" chip directly above the task list's
 * own "Quiet for now ✨" empty state, and a red "0/5 cleared" on a quest deck a
 * counsellor had only just assigned. Both told a brand-new student they were
 * failing at something they had not been asked to do yet.
 *
 * `total === 0` means there is nothing to be behind on; `completed === 0` means
 * they have not begun. Neither is danger. Anything past the first item bands
 * normally, so a student who has done 1 of 8 still reads rose — which is correct,
 * because by then there IS outstanding work.
 */
export const classifyProgress = (completed: number, total: number): CompletionBand => {
  if (total <= 0 || completed <= 0) return 'none';
  return classifyCompletion((completed / total) * 100);
};

/* ─── Scholarship category ──────────────────────────────────────────── */

/**
 * NOMINAL — six unranked categories, and the worst offender of the set: a grid
 * of scholarship cards rendered as six different colours, one of them rose, on a
 * page where nothing is urgent. Icons carry the category.
 */
export type ScholarshipCategory = 'Merit' | 'Regional' | 'STEM' | 'Need' | 'Sports' | 'General';
export const SCHOLARSHIP_VISUAL: Record<ScholarshipCategory, CategoryVisual> = {
  Merit: make('primary', Award),
  Regional: make('primary', MapPin),
  STEM: make('primary', Briefcase),
  Need: make('primary', Heart),
  Sports: make('primary', Target),
  General: make('neutral', Sparkles)
};

/* ─── Toolbox tools ─────────────────────────────────────────────────── */

/** NOMINAL — five tools, no ranking. `hub` was already `primary`; the rest join it. */
export type ToolboxTool = 'essay' | 'chances' | 'requirements' | 'timeline' | 'hub';
export const TOOL_VISUAL: Record<ToolboxTool, CategoryVisual> = {
  essay: make('primary', PenLine),
  chances: make('primary', Target),
  requirements: make('primary', ClipboardList),
  timeline: make('primary', CalendarClock),
  hub: make('primary', Sparkles)
};

/* ─── Update / signal types (Updates feed on applications) ─────────── */

/** NOMINAL — where an update came from, not how bad it is. */
export type SignalType = 'deadline' | 'scholarship' | 'portal' | 'task';
export const SIGNAL_VISUAL: Record<SignalType, CategoryVisual> = {
  deadline: make('primary', CalendarClock),
  scholarship: make('primary', Award),
  portal: make('primary', BookOpen),
  task: make('primary', ListChecks)
};

/* ─── Note types (faculty parity) ───────────────────────────────────── */

/**
 * MIXED, and deliberately so — this is what the ordinal/nominal split buys you.
 * `flag` genuinely means "a human marked this for attention", so it keeps amber.
 * `session` and `update` are just note kinds and go quiet. The result is that a
 * flag now actually stands out in the activity feed, which it could not do when
 * all three rows were equally coloured.
 */
export type NoteType = 'session' | 'flag' | 'update';
export const NOTE_VISUAL: Record<NoteType, CategoryVisual> = {
  session: make('primary', MessageSquare),
  flag: make('amber', Flag),
  update: make('neutral', TrendingUp)
};

/* ─── Re-export icons used as default fallbacks ─────────────────────── */
export { Users };
