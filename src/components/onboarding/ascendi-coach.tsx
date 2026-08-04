'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { hasSeen, shouldOfferTour, type OnboardingState } from '@/lib/onboarding/state';
import { resolveTourForPath, TOURS } from '@/lib/onboarding/tours';
import { markOnboardingStep, markTourComplete } from '@/lib/onboarding/actions';
import { useCoach } from './coach-context';
import { CoachInvitation } from './coach-invitation';
import { ProductTour } from './product-tour';
import { AscendiFlight } from './ascendi-flight';

/**
 * Ascendi as a guide: decides whether to offer a tour of wherever you are, runs
 * it if you say yes, and flies home to the chat launcher when it is done.
 *
 * This is the only place the four pieces meet — the offer
 * (`coach-invitation.tsx`), the spotlight (`product-tour.tsx`), the flight
 * (`ascendi-flight.tsx`) and the durable breadcrumbs (`lib/onboarding/state.ts`).
 * Keeping the sequencing here rather than spreading it across those four is what
 * makes the flow legible; each of them is deliberately dumb about what comes next.
 *
 * NOTHING HERE EVER ACTS UNINVITED EXCEPT THE OFFER ITSELF
 * -------------------------------------------------------
 * The offer is a small card beside the launcher that covers nothing and blocks
 * nothing. The spotlight — the only piece that dims the page — opens exclusively
 * from a click on "Show me" or from the development chip. There is no code path
 * that starts a tour on its own.
 */

/**
 * Tours already resolved during THIS browser session, by id.
 *
 * Module-level rather than component state, and that is load-bearing: this
 * component remounts on every client-side navigation, so anything held in `useState`
 * is gone by the time the user comes back to a page. It has to outlive the mount
 * to stop a second offer.
 *
 * It also covers the write-then-navigate race. `markTourComplete` is
 * fire-and-forget by design (nobody should wait on a breadcrumb), so a user who
 * finishes the dashboard tour and immediately navigates away and back can re-read
 * a `profiles.onboarding` row that does not have the stamp yet. The server state is
 * the durable answer; this set is the immediate one, and the offer needs both to
 * say no.
 *
 * Not persisted anywhere on purpose — a reload SHOULD fall back to the server's
 * answer, which by then is correct.
 */
const settledThisSession = new Set<string>();

/**
 * Declines so far this session, across every section.
 *
 * Two is the threshold for switching offers off entirely. One "not now" is about
 * this page and this moment; a second is the user telling us the feature is not
 * for them, and continuing to ask after that is the behaviour this whole change
 * exists to remove.
 */
let declinesThisSession = 0;
const OPT_OUT_AFTER_DECLINES = 2;

/**
 * Forget both of the above.
 *
 * Only the development chip calls this, and it has to: clearing
 * `profiles.onboarding` server-side does nothing for the two module-level values
 * here, so "Reset onboarding" would report success and then stay silent — the
 * session set still says every tour is settled. Resetting the durable half without
 * the ephemeral half is the more confusing of the two failures, because it looks
 * like the write did not land.
 */
export const resetCoachSession = () => {
  settledThisSession.clear();
  declinesThisSession = 0;
};

export function AscendiCoach({ state }: { state: OnboardingState }) {
  const pathname = usePathname();
  const coach = useCoach();
  const tourId = resolveTourForPath(pathname);

  const [flight, setFlight] = useState<{ from: DOMRect; to: DOMRect | null } | null>(null);

  /**
   * Whether this completion should play the "ask me anything" sign-off.
   *
   * Latched in a ref at the moment the tour completes rather than read from
   * `state` during the flight. `state` is a server snapshot that a navigation can
   * replace mid-flight, and if it flips to "intro seen" while the avatar is still
   * in the air the sign-off unmounts halfway through — the one visual moment this
   * whole feature is built around, cut off by an unrelated re-render.
   */
  const playedIntro = useRef(false);

  const settle = useCallback(
    (id: string) => {
      settledThisSession.add(id);
      coach?.stop();
    },
    [coach]
  );

  // Offer, once, when the user lands somewhere with a tour they have not settled.
  useEffect(() => {
    if (!coach || !tourId) return;
    if (coach.phase !== 'idle') return;
    if (settledThisSession.has(tourId)) return;
    if (!shouldOfferTour(state, tourId)) return;

    coach.invite(tourId);
    // `coach.phase` is deliberately absent from the deps. Including it re-runs this
    // the instant the phase leaves `idle` — and again when it returns — which
    // re-offers a tour the moment the user dismisses it. The guard above reads the
    // current phase; this effect only needs to fire on arrival at a new path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, tourId, state, coach?.invite]);

  const handleDecline = useCallback(() => {
    if (!tourId) return;
    settle(tourId);

    // Do not ask about this section again, on any future visit. Being asked twice
    // about the same page is the difference between an offer and a nag. This shares
    // the `tours` map with completions because "settled" is the only question
    // anything asks of it — see `hasSeenTour`.
    void markTourComplete(tourId);

    declinesThisSession += 1;
    if (declinesThisSession >= OPT_OUT_AFTER_DECLINES && !hasSeen(state, 'coach_opted_out_at')) {
      void markOnboardingStep('coach_opted_out_at');
    }
  }, [tourId, settle, state]);

  const handleComplete = useCallback(
    (avatarRect: DOMRect | null) => {
      if (!coach || !tourId) return;

      void markTourComplete(tourId);
      settledThisSession.add(tourId);

      // No avatar rect means there is nowhere to fly FROM, which is a different
      // failure from having nowhere to fly TO — the flight component handles the
      // latter, but it cannot invent an origin. End cleanly instead.
      if (!avatarRect) {
        coach.stop();
        return;
      }

      coach.land();
      setFlight({ from: avatarRect, to: coach.launcherRect() });
    },
    [coach, tourId]
  );

  const handleArrive = useCallback(() => {
    setFlight(null);
    // Fire the launcher's pulse and its one-time tooltip. The widget is a sibling,
    // not a child, so this goes through the context — see `coach-context.tsx` for
    // why a counter and not an event.
    coach?.celebrate();
    if (playedIntro.current) void markOnboardingStep('ascendi_intro_seen_at');
    coach?.stop();
  }, [coach]);

  /**
   * Outside a `CoachProvider` there is nothing to coordinate with, so render nothing.
   *
   * The warning is the point. Every mount of `<AscendiCoachMount />` needs to sit
   * inside `DashboardShell` (which owns the provider), and a mount that does not is
   * completely silent — no error, no tour, no offer, just a feature that appears not
   * to have been built. That is a very easy mistake to make when adding the coach to a
   * new page, and a very hard one to notice. Development-only, because in production
   * the null case is legitimate: the shell is rendered by seven `loading.tsx` files
   * and by one client page, none of which mount a coach.
   */
  if (!coach) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[coach] AscendiCoach is outside a CoachProvider, so it will do nothing. ' +
          'Render <AscendiCoachMount /> inside <DashboardShell>.'
      );
    }
    return null;
  }

  if (!tourId) return null;

  const tour = TOURS[tourId];
  const introPending = !hasSeen(state, 'ascendi_intro_seen_at');

  return (
    <>
      {coach.phase === 'inviting' && coach.activeTour === tourId ? (
        <CoachInvitation
          label={tour.label}
          launcherRect={coach.launcherRect}
          onAccept={() => coach.start(tourId)}
          onDecline={handleDecline}
        />
      ) : null}

      {coach.phase === 'touring' && coach.activeTour === tourId ? (
        <ProductTour
          steps={tour.steps}
          onDismiss={() => {
            // A mid-tour exit still settles the section. Someone who opened the
            // tour and left it has seen enough to have decided; re-offering it next
            // visit would be arguing with them.
            settle(tourId);
            void markTourComplete(tourId);
          }}
          onComplete={(rect) => {
            playedIntro.current = introPending;
            handleComplete(rect);
          }}
          signOff={
            introPending
              ? 'I’ll be down here in the corner from now on. Ask me anything — a programme, a deadline, or what to do next.'
              : null
          }
        />
      ) : null}

      {flight ? <AscendiFlight from={flight.from} to={flight.to} onArrive={handleArrive} /> : null}
    </>
  );
}
