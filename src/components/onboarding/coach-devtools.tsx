'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, RotateCcw, Play, ChevronUp } from 'lucide-react';
import { resolveTourForPath, TOURS } from '@/lib/onboarding/tours';
import { resetOnboardingForTesting } from '@/lib/onboarding/actions';
import { cn } from '@/lib/utils';
import { useCoach } from './coach-context';
import { resetCoachSession } from './ascendi-coach';

/**
 * The development-only coach chip: run this page's tour on demand, or wipe every
 * onboarding breadcrumb and start over.
 *
 * WHY IT IS DEV-ONLY, AND WHERE THAT IS ACTUALLY ENFORCED
 * ------------------------------------------------------
 * The early return below keeps it out of production renders, and that is the
 * *cosmetic* half. The real control is the `process.env.NODE_ENV` check at the top
 * of `resetOnboardingForTesting` in `lib/onboarding/actions.ts`: every export of a
 * `'use server'` module is a live POST endpoint that ships in the production
 * bundle whether or not any component renders a button for it. A destructive action
 * guarded only by a hidden button is not guarded.
 *
 * `NODE_ENV` is inlined by the bundler at build time, so this component and its
 * icon imports are dead code that tree-shakes out of the production client bundle
 * entirely — it is not merely hidden at runtime.
 *
 * WHY THERE IS NO USER-FACING REPLAY BUTTON YET
 * --------------------------------------------
 * Decided deliberately: a permanent "show me around" control on every page is
 * standing chrome, and the point of this change was to take weight OFF the
 * interface. The consequence is real and worth knowing — a user who declines a
 * tour cannot currently get it back. `CoachProvider` exposes `start()` for exactly
 * this, so wiring it into the command palette or the chat panel header is a
 * one-line change when that trade is worth making.
 */
export function CoachDevTools() {
  const pathname = usePathname();
  const router = useRouter();
  const coach = useCoach();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (process.env.NODE_ENV === 'production') return null;
  if (!coach) return null;

  const tourId = resolveTourForPath(pathname);

  const handleReset = () => {
    startTransition(async () => {
      await resetOnboardingForTesting();
      // Both halves, or the reset only half works — see `resetCoachSession`.
      resetCoachSession();
      // `refresh()`, not a full reload: the coach reads its state from a server
      // component, so re-running the render is what actually feeds it the cleared
      // breadcrumbs. Without this the chip reports success and nothing changes
      // until the next hard navigation, which reads as the reset having failed.
      router.refresh();
    });
  };

  return (
    // Bottom-LEFT, so it never overlaps the launcher this feature is about — the
    // one piece of UI a coach bug most needs to be visible. Above the mobile nav on
    // small screens, mirroring the launcher's own offset.
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] left-4 z-docked md:bottom-6">
      {open ? (
        <div className="mb-2 w-56 rounded-2xl border border-dashed border-warning/50 bg-card p-3 shadow-e-3">
          <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">Coach · dev only</p>
          <p className="mt-1.5 text-xs text-foreground">
            {tourId ? (
              <>
                <span className="font-medium">{tourId}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {TOURS[tourId].steps.length} steps
                </span>
              </>
            ) : (
              'no tour for this route'
            )}
          </p>
          {tourId ? (
            // The label the offer would actually use. Reading it here is how a copy
            // change gets checked without clearing breadcrumbs to trigger the offer.
            <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground" title={TOURS[tourId].label}>
              “…show you around {TOURS[tourId].label}”
            </p>
          ) : null}

          <div className="mt-3 space-y-1.5">
            <button
              type="button"
              disabled={!tourId}
              onClick={() => tourId && coach.start(tourId)}
              className="flex w-full items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              <Play className="h-3 w-3" aria-hidden />
              Run tour
            </button>
            <button
              type="button"
              disabled={!tourId}
              onClick={() => tourId && coach.invite(tourId)}
              className="flex w-full items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
            >
              <Bot className="h-3 w-3" aria-hidden />
              Show the offer
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={pending}
              className="flex w-full items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              {pending ? 'Resetting…' : 'Reset onboarding'}
            </button>
          </div>

          <p className="mt-2.5 text-[0.65rem] leading-snug text-muted-foreground">
            Reset clears every breadcrumb for your own account only. The sign-off animation replays
            after a reset.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-warning/50 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-e-2 hover:text-foreground"
        aria-expanded={open}
      >
        <Bot className="h-3.5 w-3.5" aria-hidden />
        Coach
        <ChevronUp className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
    </div>
  );
}
