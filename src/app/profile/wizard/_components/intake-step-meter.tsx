'use client';

import { useState } from 'react';
import { List, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { IntakeRail, CompletionRing, type RailStep } from './intake-rail';


/**
 * The wizard's step navigation below `lg`, where the rail does not fit.
 *
 * ── What this replaces, and why not just stack the rail ─────────────────────
 * The old sidebar stacked ABOVE the form on small screens: five step buttons, a
 * four-line paragraph and a Review button — roughly a screen and a half of
 * chrome before the student reached the first field. So the first thing a phone
 * user met was the table of contents, every single time they changed step.
 *
 * This is the compact form of the same information: where you are, how far the
 * essentials have got, and one button to the rest. The FULL rail — every step,
 * its completion, the tier divider — is a tap away in a sheet, and it is
 * literally the same `IntakeRail` component the desktop renders. One
 * implementation in two containers, because two step lists drift.
 *
 * The bar is `sticky`, so the student can jump steps from anywhere in a long
 * form without scrolling back up. That is also why it carries a background and a
 * blur: it passes over the fields beneath it.
 */

interface IntakeStepMeterProps {
  steps: RailStep[];
  essentialPct: number;
  onStepSelect: (key: string) => void;
  /** 1-based, for the "Step 3 of 6" readout. */
  currentIndex: number;
  currentTitle: string;
}

export function IntakeStepMeter({
  steps,
  essentialPct,
  onStepSelect,
  currentIndex,
  currentTitle
}: IntakeStepMeterProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const select = (key: string) => {
    onStepSelect(key);
    setSheetOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          // `top-14`, not `top-0`: the page's own utility bar is `sticky top-0` and
          // 56px tall, so pinning at 0 would park this underneath it. `z-sticky` sits
          // below the bar's `z-nav`, so this slides beneath rather than over it.
          'sticky top-14 z-sticky mb-5 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-e-1 backdrop-blur lg:hidden'
        )}
      >
        <div className="flex items-center gap-3">
          <CompletionRing percent={essentialPct} size="sm" decorative />

          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              Step {currentIndex} of {steps.length}
            </p>
            {/* The ring beside this is `decorative`, so without this line the
              * essentials percentage — the number that actually gates matching —
              * would be available to a screen reader only by opening the sheet. */}
            <span className="sr-only">Essentials {essentialPct}% complete.</span>
            <p className="truncate text-body-sm font-semibold text-foreground">{currentTitle}</p>
          </div>

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 text-xs font-semibold text-foreground transition-colors hover:border-primary/60 hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <List className="h-3.5 w-3.5" aria-hidden />
            Steps
          </button>
        </div>

        {/* Segmented track — a PROGRESS INDICATOR, not navigation.
          *
          * It was tappable per segment at first, and that was wrong twice over.
          * Ergonomically, a 4px-tall bar sliced into six is the "don't require
          * pixel-perfect taps on thin edges" anti-pattern; padding out the hit
          * area helps but still leaves six ~57px-wide targets doing a job the
          * "Steps" button beside it does properly. And semantically it produced
          * a SECOND set of buttons named after the same six steps as the rail —
          * so a screen-reader user met the whole step list twice.
          *
          * One navigation surface (the sheet), one progress readout (this).
          * `role="progressbar"` with real aria-value* means the readout is
          * announced as what it is; the segments themselves are decoration. */}
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={currentIndex}
          aria-valuetext={`Step ${currentIndex} of ${steps.length}: ${currentTitle}`}
          className="mt-2.5 flex items-center gap-1"
        >
          {steps.map((step) => {
            return (
              <span
                key={step.key}
                aria-hidden
                className={cn(
                  // One hue in three lightness steps — the same logic as
                  // `--series-1..5`. The outstanding segments were `bg-muted`, so on
                  // screen 2 of 8 the bar read three-quarters grey and the progress it
                  // was drawing looked like absence rather than a track.
                  'h-1 flex-1 rounded-full transition-colors duration-150',
                  step.current
                    ? 'bg-primary'
                    : step.done
                      ? 'bg-primary/60'
                      : 'bg-primary/10'
                )}
              />
            );
          })}
        </div>
      </div>

      {/* The full rail, in a slide-over. Same component as the desktop rail, so
        * the dots, the tier divider and the ring cannot diverge between the two. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen} align="left">
        <DialogContent className="flex flex-col bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 dark:border-white/10">
            <DialogTitle className="font-heading text-base font-semibold text-foreground">
              Your setup steps
            </DialogTitle>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close steps"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {/* `sticky={false}`: inside a scrolling sheet body a sticky rail
              * would pin against the sheet rather than the page and stop
              * scrolling with its own content. */}
            <IntakeRail
              steps={steps}
              essentialPct={essentialPct}
              onStepSelect={select}
              bare
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
