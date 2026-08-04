'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { type ScreenTier } from '@/lib/profile/wizard-screens';

/**
 * The wizard's step map: a completion ring, a vertical stepper, and the tier
 * boundary made visible.
 *
 * PURELY PRESENTATIONAL. It owns no state and imports no server action, so it can
 * be rendered from the form, from a mobile sheet, or from a test with a literal
 * prop bag. Everything it shows is derived by the caller.
 *
 * ── Why the ring measures the ESSENTIAL steps only ──────────────────────────
 * The bar this replaces measured `(currentStep - 1) / (TOTAL_STEPS - 1)` — where
 * the student was STANDING, not what they had filled in. Two consequences, both
 * user-visible: a returning student with a complete profile opened on step 1 and
 * was told 0%, and an empty form on the Review step was told 100%. Neither number
 * was about the student's data at all.
 *
 * It measures the three essential steps and not all five because that is the
 * threshold that means something: `runMatching` needs exactly those three, and
 * `middleware.ts` gates entry on them. Folding the two boosters into the same
 * percentage would put a student who deliberately deferred them at a permanent
 * 60% — turning "Skip for now" into a decision to walk away from 40% of their
 * profile, which is the friction the 2026-08-03 re-tiering existed to remove.
 * So the boosters are pips beside the ring: present, countable, not a debt.
 */

export interface RailStep {
  /**
   * A SCREEN key from `wizard-screens.ts`, not a `StepKey`. Several screens share a
   * section (the subject area and the school are both `academic_input`), so the rail
   * cannot be keyed by section without collapsing rows that need to tick
   * independently.
   */
  key: string;
  title: string;
  /** `essential` gates matching; `booster` only sharpens it. `review` is neither. */
  tier: ScreenTier;
  done: boolean;
  current: boolean;
}

interface IntakeRailProps {
  steps: RailStep[];
  /** 0-100 across the ESSENTIAL steps only — see the note above. */
  essentialPct: number;
  onStepSelect: (key: string) => void;
  /** Rendered inside the sheet on mobile, where `sticky` would fight the scroll container. */
  sticky?: boolean;
  /**
   * Drop this component's own card chrome. Set inside the mobile sheet, which is
   * already a `bg-card` surface — a card nested in a card reads as a mistake.
   */
  bare?: boolean;
  className?: string;
  /** Slot for "Restore last save" — the caller owns that behaviour. */
  footer?: React.ReactNode;
}

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Same geometry, stroke width and timing as the dashboard's
 * `ProfileProgressCard`. Deliberately not a shared component yet: that one is
 * wrapped in a `HubCard` and animates on `whileInView`, which is wrong for a
 * value that changes while the student is looking at it. This one animates on
 * `animate` so it re-sweeps whenever the number moves.
 *
 * `useReducedMotion` is read explicitly because `strokeDashoffset` is NOT a
 * transform, so the app-wide `<MotionConfig reducedMotion="user">` does not
 * cover it — without this the ring sweeps for users who asked it not to.
 */
export function CompletionRing({
  percent,
  size = 'lg',
  decorative = false
}: {
  percent: number;
  /** `sm` is the 40px variant the mobile step meter uses; the SVG scales, the label steps down. */
  size?: 'sm' | 'lg';
  /**
   * Drop the `role="img"` and its label. Set by the mobile step meter, which
   * already exposes its own `role="progressbar"` — two labelled elements in one
   * 56px-tall bar means a screen reader reads the same progress twice. The
   * labelled ring is still reachable there via the Steps sheet.
   */
  decorative?: boolean;
}) {
  const reduced = useReducedMotion();
  const complete = percent >= 100;
  const dashTarget = CIRCUMFERENCE * (1 - Math.min(Math.max(percent, 0), 100) / 100);

  return (
    <div
      className={cn('relative shrink-0', size === 'lg' ? 'h-16 w-16' : 'h-10 w-10')}
      {...(decorative
        ? { 'aria-hidden': true as const }
        : { role: 'img', 'aria-label': `Essentials ${percent}% complete` })}
    >
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        {/* The unfilled track. `stroke-primary/15` rather than `stroke-muted/60`: at
          * this stroke width the muted token read as a grey washer around an indigo
          * arc, which is the single most prominent grey in the rail. A brand tint
          * makes the track and the fill read as one instrument. */}
        <circle cx="40" cy="40" r={RADIUS} fill="none" strokeWidth="7" className="stroke-primary/15" />
        <motion.circle
          cx="40"
          cy="40"
          r={RADIUS}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          className={complete ? 'stroke-success' : 'stroke-primary'}
          initial={{ strokeDashoffset: reduced ? dashTarget : CIRCUMFERENCE }}
          animate={{ strokeDashoffset: dashTarget }}
          transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE }}
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-foreground',
          size === 'lg' ? 'text-sm' : 'text-label'
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

export function IntakeRail({
  steps,
  essentialPct,
  onStepSelect,
  sticky = false,
  bare = false,
  className,
  footer
}: IntakeRailProps) {
  /**
   * `layoutId` must be unique per live instance. The desktop rail stays MOUNTED on
   * mobile (`hidden lg:block` is display:none, not unmount), so opening the Steps
   * sheet puts two rails in the tree — and a shared `layoutId` makes Framer treat
   * them as one element and project between their boxes, one of which measures
   * 0×0. The pill then animates from nothing or fails to paint.
   *
   * This file used to carry a second guard for the same two-copies hazard: a
   * `tourAnchor` prop gating a product-tour anchor attribute, so the tour's
   * `querySelector` could not resolve the hidden copy. It has been removed because NO
   * tour step ever pointed at that anchor. `tours.ts` requires every anchor it names
   * to exist, but nothing checked the reverse, so an orphan attribute and eight lines
   * of comment guarded a spotlight that was never aimed here. The reverse assertion
   * now lives in `__tests__/onboarding/tours.test.ts`.
   */
  const instanceId = useId();
  const complete = essentialPct >= 100;
  const boosters = steps.filter((step) => step.tier === 'booster');
  const firstBoosterKey = boosters[0]?.key;
  /**
   * How many essential screens are still outstanding.
   *
   * This is the one genuinely motivating sentence in the flow, and it used to live in
   * the page's `PageHero` — which cost ~250px above the fold to say something the rail
   * was already the natural home for. Derived from `steps`, which this component
   * already receives, so it needs no new prop AND it updates live as the student
   * fills things in; the hero's version was computed on the server and went stale the
   * moment they answered anything.
   */
  const essentialsLeft = steps.filter((step) => step.tier === 'essential' && !step.done).length;

  return (
    /**
     * `lg:top-20` (80px), not `top-24`. The old 96px was calibrated for the app
     * navbar's `pt-28` — but this route deliberately renders no shell, so the rail was
     * pinning 96px below the top of the viewport for no reason. 80px clears the
     * wizard's own 56px utility bar with 24px of breathing room.
     */
    <aside className={cn('w-full shrink-0', sticky && 'lg:sticky lg:top-20 lg:h-fit', className)}>
      <div className={bare ? '' : 'surface-card rounded-3xl !p-5'}>
        {/* ── Ring + the one line of copy that carries the tier model ── */}
        <div className="flex items-center gap-4">
          <CompletionRing percent={essentialPct} />
          <div className="min-w-0">
            <p className="eyebrow">{complete ? 'Essentials done' : 'Essentials'}</p>
            <p className="mt-0.5 text-body-sm font-medium text-foreground">
              {complete ? (
                <span className="inline-flex items-center gap-1 text-success">
                  Matches unlocked
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : (
                // Naming the remaining COUNT rather than the threshold. "Matches
                // unlock at 100%" restated the number in the ring beside it; this
                // answers the question the student actually has, which is how much
                // further they have to go.
                //
                // "steps", not "sections" — this counts SCREENS, and two of them share
                // the `academic_input` section, so an empty form has five essential
                // screens across three sections. "Steps" is also the vocabulary the
                // list below already uses (`aria-label="Setup steps"`).
                `${essentialsLeft} ${essentialsLeft === 1 ? 'step' : 'steps'} left before your matches unlock`
              )}
            </p>
            {boosters.length > 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-label text-muted-foreground">
                {boosters.map((booster) => (
                  <span
                    key={booster.key}
                    aria-hidden
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      booster.done ? 'bg-primary' : 'bg-primary/20'
                    )}
                  />
                ))}
                <span>
                  {boosters.filter((booster) => booster.done).length}/{boosters.length} extras
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {/* ── The stepper ──
          * `relative` so the connector can be absolutely positioned behind the
          * dots, and the whole list is one <ol> because it is an ordered
          * sequence — a screen reader should say "3 of 6", which a div cannot. */}
        <ol aria-label="Setup steps" className="relative mt-5 space-y-0.5">
          {/* The trail behind the dots. `left-6` is the dot's axis, not a magic
            * number: the button's px-3 (12px) plus half of the 24px dot lands at
            * exactly 24px = 1.5rem, and `-translate-x-1/2` centres the 1px line
            * on it. Inset top and bottom so it does not overshoot the first and
            * last dots. Kept on the spacing scale rather than an arbitrary
            * `left-[1.4375rem]`, which tripped the arbitrary-geometry ratchet. */}
          <span
            aria-hidden
            className="absolute bottom-5 left-6 top-5 w-px -translate-x-1/2 bg-primary/20"
          />
          {steps.map((step) => {
            const isBoundary = step.key === firstBoosterKey;
            return (
              <li key={step.key}>
                {/* The tier boundary, stated where the student is already looking
                  * to judge how much is left. It replaces a four-line paragraph
                  * at the bottom of the rail — the least-read position on the
                  * page — with a labelled divider at the actual boundary. */}
                {isBoundary ? (
                  <div className="flex items-center gap-2 py-2 pl-1">
                    <span className="eyebrow shrink-0">Optional extras</span>
                    <span aria-hidden className="h-px flex-1 bg-primary/20" />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => onStepSelect(step.key)}
                  aria-current={step.current ? 'step' : undefined}
                  className={cn(
                    // py-3, not py-2.5: 12 + 12 + the 20px text-sm line box is
                    // exactly the 44px tap floor the rest of the app enforces
                    // (TierPills, SegmentedControl), and this rail is the primary
                    // step navigation on mobile. Expressed as padding on the
                    // spacing scale rather than `min-h-[44px]`, which would add
                    // to the arbitrary-geometry ratchet for the same result.
                    'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    step.current
                      ? 'font-semibold text-primary-ink'
                      : step.done
                        ? 'text-foreground hover:bg-muted/50'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {/* The travelling indicator. One `layoutId` means the active
                    * pill SLIDES between rows instead of blinking off and on —
                    * the difference between a list of steps and a place you are
                    * moving through. Same spring as SegmentedControl so the two
                    * read as one system. */}
                  {step.current ? (
                    <motion.span
                      layoutId={`intake-rail-active-${instanceId}`}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      // `/15` + a ring, up from a bare `/8`. At 8% the travelling
                      // pill was doing all this work — the layoutId spring, the
                      // sliding — behind a fill you could not actually see, which is
                      // also the wash an unselected chip now carries.
                      className="absolute inset-0 rounded-xl bg-primary/15 ring-1 ring-inset ring-primary/25"
                      aria-hidden
                    />
                  ) : null}

                  {/* A dot, not a numeral. The ring two inches above already
                    * owns the numbers; a second set competes with it. */}
                  <span
                    aria-hidden
                    className={cn(
                      'relative z-raised flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-card transition-colors duration-150',
                      step.current
                        ? 'border-primary'
                        : step.done
                          ? 'border-success bg-success-subtle'
                          : 'border-primary/25 group-hover:border-primary/40'
                    )}
                  >
                    {step.done && !step.current ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full transition-colors',
                          step.current ? 'bg-primary' : 'bg-transparent'
                        )}
                      />
                    )}
                  </span>

                  <span className="relative z-raised truncate">{step.title}</span>

                  {/* The dot carries done-ness visually (colour AND a Check, so
                    * not by colour alone). Screen readers get it as text.
                    * Position is NOT repeated here: the <ol>/<li> structure
                    * conveys "n of 6" already, and `aria-current="step"` marks
                    * where you are — adding a third announcement per row just
                    * makes every step verbose to listen through. */}
                  {step.done ? <span className="sr-only">(complete)</span> : null}

                  {/* The tier, in the accessible name — NOT only in the visual
                    * "Optional extras" divider above. A student deciding whether
                    * to keep going needs the "you can stop here" signal at the
                    * step itself, and a divider is a spatial cue a screen reader
                    * user tabbing between buttons never receives. The old rail
                    * had this as a visible badge on every booster row; the
                    * divider is the better visual treatment, but dropping the
                    * name outright would have been an a11y regression. */}
                  {step.tier === 'booster' ? <span className="sr-only">(optional)</span> : null}
                </button>
              </li>
            );
          })}
        </ol>

        {footer ? <div className="mt-3 border-t border-border/60 pt-3">{footer}</div> : null}
      </div>
    </aside>
  );
}
