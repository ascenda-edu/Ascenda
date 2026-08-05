'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Rocket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ChecklistSummary } from '@/lib/onboarding/checklist';
import { markOnboardingStep } from '@/lib/onboarding/actions';

/**
 * The getting-started card.
 *
 * Collapsed by default to its next action, because a seven-row checklist
 * permanently pinned to the top of the dashboard stops reading as help and
 * starts reading as clutter. Expanded, it is the full path.
 *
 * DISMISSAL IS OPTIMISTIC, AND HAS TO BE
 * --------------------------------------
 * The card hides itself the moment it is dismissed and only then writes the
 * breadcrumb. Awaiting the write first would leave a card the user has already
 * clicked "hide" on sitting there for a round trip — the single most irritating
 * possible response to that particular click. A failed write means it comes
 * back on the next load, which is recoverable; a laggy dismissal is just bad.
 */
export function GettingStartedCard({
  summary,
  initiallyDismissed
}: {
  summary: ChecklistSummary;
  initiallyDismissed: boolean;
}) {
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  const handleDismiss = () => {
    setDismissed(true);
    startTransition(async () => {
      await markOnboardingStep('checklist_dismissed_at');
    });
  };

  // Never render for someone with nothing left to do, even if they never
  // dismissed it — "you have finished onboarding" is not worth a permanent card.
  if (dismissed || summary.next === null) return null;

  const { items, completed, total, percent, next } = summary;

  return (
    // `data-tour` lives HERE, not on a wrapper in dashboard/page.tsx. A wrapper
    // survives this component returning null, and an empty div is still a
    // `space-y-6` sibling — so dismissing the card left 24px of dead space above
    // the priority spine on every subsequent visit. On the card root the anchor
    // disappears exactly when the card does, which is also what lets the tour
    // correctly drop its first step for anyone who has already dismissed this.
    <div
      data-tour="getting-started"
      className="surface-card surface-card--static rounded-4xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted-foreground">
            <Rocket className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="eyebrow">Getting started</p>
            <p className="font-heading text-lg font-semibold leading-tight text-foreground">
              {completed} of {total} done
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Hide the getting started checklist"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Native progress semantics, so this announces as a progress bar rather
          than as a decorative div with a width. */}
      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Getting started progress"
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* The next action, promoted out of the list. This is what the card is
          for: one thing to do, not seven things to read. */}
      <div className="mt-5 rounded-2xl border border-border/60 bg-muted/30 p-4">
        <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">Next up</p>
        <p className="mt-1.5 text-sm font-semibold text-foreground">{next.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{next.body}</p>
        <Button asChild size="sm" className="mt-3 gap-1.5">
          <Link href={next.href}>
            {next.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expanded ? 'Hide the full list' : `Show all ${total} steps`}
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.ul
            key="checklist"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {items.map((item) => (
              <li key={item.id} className="border-t border-border/50 first:mt-2">
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/50',
                    item.done && 'opacity-60'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1',
                      item.done
                        ? 'bg-success-subtle text-success ring-success/25'
                        : 'bg-muted text-muted-foreground ring-border'
                    )}
                    aria-hidden
                  >
                    {item.done ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium text-foreground',
                          item.done && 'line-through decoration-muted-foreground/50'
                        )}
                      >
                        {item.title}
                      </span>
                      {item.optional ? (
                        <span className="text-label font-medium uppercase tracking-wide text-muted-foreground/70">
                          Optional
                        </span>
                      ) : null}
                    </span>
                    {!item.done ? (
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.body}</span>
                    ) : null}
                  </span>
                  {/* Screen readers get the state that the icon conveys visually. */}
                  <span className="sr-only">{item.done ? 'Completed' : 'Not started'}</span>
                </Link>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
