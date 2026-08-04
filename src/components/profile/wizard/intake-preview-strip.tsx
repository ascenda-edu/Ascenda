'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, EASE_POP, DURATION } from '@/lib/motion';
import type { IntakePreview } from '@/lib/profile/use-intake-preview';

/**
 * What the answers add up to, shown while they are still being given.
 *
 * The wizard used to be six steps of typing with no response until submit. This is
 * the form answering back: pick a field and a number of real programmes appears;
 * enter grades and a readiness band appears beside it. It is the difference between
 * filling in a form and watching a shortlist form.
 *
 * ── Honest labelling ────────────────────────────────────────────────────────
 * The count is programmes in the student's FIELDS, from one indexed count — not a
 * match score, which would mean running the whole matcher on a keystroke. It says
 * "programmes in your field" for that reason. Overstating it here would be worse
 * than saying nothing, because the number the student remembers from onboarding
 * would not be the number they meet on /matches.
 *
 * ── Bands are tokens, and deliberately not a traffic light ───────────────────
 * A 17-year-old being told "Weak" by a form they are halfway through filling in is
 * a reason to close the tab. The band is shown in the `info` tone until it is
 * genuinely good news, and the copy under it always describes a next action rather
 * than a verdict.
 */

const ENCOURAGING_BANDS = new Set(['Exceptional', 'Very strong', 'Strong']);

interface IntakePreviewStripProps {
  preview: IntakePreview | null;
  loading: boolean;
  className?: string;
}

export function IntakePreviewStrip({ preview, loading, className }: IntakePreviewStripProps) {
  const reduced = useReducedMotion();

  // Nothing to show until there is a field to count in. The strip appearing at all
  // is itself the feedback, so it must not sit there empty beforehand.
  if (!preview || preview.fieldProgrammeCount === null) {
    if (!loading) return null;
  }

  const count = preview?.fieldProgrammeCount ?? null;
  const band = preview?.band ?? null;
  const strong = band ? ENCOURAGING_BANDS.has(band) : false;

  return (
    <motion.aside
      // `polite`, not `assertive`: this updates while the student is typing and
      // must never interrupt them mid-field.
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE }}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3',
        className
      )}
    >
      <span className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
        <span className="eyebrow-accent">So far</span>
      </span>

      {count !== null ? (
        <span className="flex items-baseline gap-1.5">
          {/* Keyed on the value so the number re-enters when it changes — the
            * point is that it MOVED, not that it is currently N. */}
          <motion.span
            key={count}
            initial={reduced ? false : { opacity: 0, y: -4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: DURATION.fast, ease: EASE_POP }}
            className="font-heading text-lg font-semibold tabular-nums text-foreground"
          >
            {count.toLocaleString()}
          </motion.span>
          <span className="text-xs text-muted-foreground">
            {count === 1 ? 'programme in your field' : 'programmes in your field'}
          </span>
        </span>
      ) : null}

      {band ? (
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted-foreground">Profile strength</span>
          <motion.span
            key={band}
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className={cn('text-body-sm font-semibold', strong ? 'text-success' : 'text-primary-ink')}
          >
            {band}
          </motion.span>
        </span>
      ) : null}

      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Updating" />
      ) : null}

      {/* Always a next action, never a verdict. */}
      {count !== null && !band ? (
        <span className="w-full text-label text-muted-foreground">
          Add your grades to see how you compare.
        </span>
      ) : null}
    </motion.aside>
  );
}
