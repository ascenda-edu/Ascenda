'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, RotateCcw, Play, ChevronUp } from 'lucide-react';
import type { Role } from '@/lib/auth/identity';
import { resolveTourForPath, TOURS } from '@/lib/onboarding/tours';
import { resetOnboardingForTesting } from '@/lib/onboarding/actions';
import { cn } from '@/lib/utils';
import { useCoach } from './coach-context';
import { resetCoachSession } from './ascendi-coach';

/**
 * The coach panel: run this page's tour on demand, preview the offer, or — in
 * development only — wipe every onboarding breadcrumb and start over.
 *
 * WHO SEES IT, AND WHERE THAT IS DECIDED
 * --------------------------------------
 * It used to early-return on `process.env.NODE_ENV === 'production'`, which made
 * it dead code the bundler dropped from the production client bundle entirely.
 * It now also ships to production ADMINS, because the alternative was worse: no
 * replay control existed at all, so a tour declined once was gone, and there was
 * no way to demo the flow on the live site without a local dev server.
 *
 * The decision is NOT made here. `resolveCoachPanelScope` below runs in
 * `ascendi-coach-mount.tsx`, a server component that already holds the verified
 * `profiles.role` — so a student's HTML never contains this markup at all, rather
 * than containing it behind a client-side `role !== 'admin'` check that anyone
 * can flip in a devtools console. A client component cannot import
 * `@/lib/auth/identity` (it throws in a browser bundle by design), which is why
 * only the `Role` *type* is imported here — erased at compile, no runtime edge.
 *
 * Server-side gating keeps the MARKUP away from students; it does not keep the
 * CHUNK away. `ascendi-coach-mount.tsx` imports this module unconditionally, so it
 * joins the client manifest of every route that mounts a coach and a student's
 * browser downloads code it will never render. Measured cost of exactly that:
 * +1 kB gzip First Load JS on the ten coach-mounting routes (dashboard 262 -> 263,
 * matches 260 -> 261, scholarships 287 -> 288), every budget in
 * `scripts/check-bundle-budget.mjs` still met with headroom. It is 1 kB and not
 * more because the four Lucide glyphs, `TOURS` and `cn` were already on these
 * routes. If it ever stops being ~1 kB, the fix is a `next/dynamic` import behind
 * the scope check rather than a client-side role test — the latter would trade a
 * real security property for bundle size.
 *
 * WHY `scope` IS ONE PROP AND NOT TWO BOOLEANS
 * -------------------------------------------
 * The panel varies on two axes — its label and whether the reset button renders —
 * and both follow from the same fact. Passing `allowReset` separately from a label
 * is how the two drift into an admin-labelled panel with a dev-only button on it.
 * One discriminant, derived once.
 *
 * THE RESET GUARD IS STILL THE SERVER ACTION, NOT THIS COMPONENT
 * -------------------------------------------------------------
 * `scope === 'admin'` hides the reset button, and that remains the *cosmetic*
 * half. The real control is the `NODE_ENV` check at the top of
 * `resetOnboardingForTesting` in `lib/onboarding/actions.ts`: every export of a
 * `'use server'` module is a live POST endpoint in the production bundle whether
 * or not anything renders a button for it. That guard was deliberately NOT relaxed
 * for admins — replaying a tour never needed it, because `coach.start()` is
 * ephemeral client state and ignores breadcrumbs entirely. Clearing breadcrumbs is
 * only needed to re-test the *automatic* offer, which is a development concern.
 */

export type CoachPanelScope =
  /** Local dev: everyone, and the reset button is live. */
  | 'development'
  /** Production admin: run and preview only. */
  | 'admin';

/**
 * Whether this user gets the panel, and in which mode. `null` means no panel.
 *
 * Called from a server component so the answer is settled before render. Kept pure
 * — it is the unit under test in `__tests__/onboarding/coach-panel.test.tsx`, which
 * pins the case that matters: a production student gets `null`.
 */
export const resolveCoachPanelScope = (role: Role): CoachPanelScope | null => {
  if (process.env.NODE_ENV !== 'production') return 'development';
  return role === 'admin' ? 'admin' : null;
};

export function CoachPanel({ scope }: { scope: CoachPanelScope }) {
  const pathname = usePathname();
  const router = useRouter();
  const coach = useCoach();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!coach) return null;

  const tourId = resolveTourForPath(pathname);
  const allowReset = scope === 'development';

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
        <div
          className={cn(
            'mb-2 w-56 rounded-2xl border bg-card p-3 shadow-e-3',
            allowReset ? 'border-dashed border-warning/50' : 'border-feature/40'
          )}
        >
          <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">
            {allowReset ? 'Coach · dev only' : 'Coach · admin'}
          </p>
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
            {allowReset ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={pending}
                className="flex w-full items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                {pending ? 'Resetting…' : 'Reset onboarding'}
              </button>
            ) : null}
          </div>

          <p className="mt-2.5 text-[0.65rem] leading-snug text-muted-foreground">
            {allowReset
              ? 'Reset clears every breadcrumb for your own account only. The sign-off animation replays after a reset.'
              : 'Replays this page’s tour as often as you like. Nothing here changes what other users see.'}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-e-2 hover:text-foreground',
          allowReset ? 'border-dashed border-warning/50' : 'border-feature/40'
        )}
        aria-expanded={open}
      >
        <Bot className="h-3.5 w-3.5" aria-hidden />
        Coach
        <ChevronUp className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
    </div>
  );
}
