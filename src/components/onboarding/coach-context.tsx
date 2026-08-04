'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * The seam between Ascendi's tour and Ascendi's chat launcher.
 *
 * WHY A CONTEXT AND NOT AN EVENT EMITTER
 * --------------------------------------
 * These two are siblings under `layout/shell.tsx`, never parent and child, so
 * they need something between them. A `window` event bus was the first instinct
 * and it loses on timing: `ChatbotWidgetLazy` is `next/dynamic` with
 * `ssr: false`, so the launcher mounts an indeterminate number of frames after
 * the page — an emitter fires `celebrate` into a void if the widget's listener is
 * not attached yet, and the finale silently does nothing. Context state is a
 * value, not a moment: the widget reads the current celebration count whenever it
 * happens to mount, so a late subscriber still sees it.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT
 * ---------------------------------
 * This holds the *ephemeral* half of the coach — which tour is running right now,
 * whether an invitation is on screen, how many celebrations have been requested.
 * None of it is persisted and none of it survives a reload; the durable half is
 * `profiles.onboarding`, read on the server and passed in as props.
 *
 * Keeping the split sharp is what stops the two disagreeing. Anything the server
 * already knows (has this user seen this tour?) is a prop. Anything only this
 * moment knows (is the spotlight open?) is state here.
 */

export type CoachPhase =
  /** Nothing on screen. */
  | 'idle'
  /** The launcher-side offer is showing: "want a look around?" */
  | 'inviting'
  /** The spotlight is walking through steps. */
  | 'touring'
  /** Last step done; the avatar is flying home to the launcher. */
  | 'landing';

interface CoachValue {
  phase: CoachPhase;
  /** The tour currently being offered or run, if any. */
  activeTour: string | null;
  /** Offer a tour without starting it. */
  invite: (tourId: string) => void;
  /** Open the spotlight immediately, skipping the offer. */
  start: (tourId: string) => void;
  /** Leave the spotlight without the finale — Escape, Skip, backdrop. */
  stop: () => void;
  /** Begin the flight home. `stop` is what runs when it arrives. */
  land: () => void;
  /**
   * Monotonic counter, incremented when the avatar reaches the launcher.
   *
   * A COUNTER, not a boolean — and that is the whole reason this works. A boolean
   * `celebrating` flag has to be reset by someone, and whoever resets it races
   * the consumer that has not read it yet. A number that only ever goes up lets
   * the widget compare against what it last saw and act exactly once per
   * increment, with no reset and no handshake.
   */
  celebrations: number;
  /**
   * Where the chat launcher currently is, in viewport coordinates, or `null` when
   * there is no launcher to fly to.
   *
   * `null` is a real and frequent answer, not an error: the widget returns `null`
   * on `/assistant` routes, its chunk may still be loading, and the launcher
   * unmounts entirely while the chat panel is open. Every caller must have a
   * no-flight fallback — see `ascendi-flight.tsx`.
   *
   * Measured on demand rather than stored, because a stored rect goes stale on
   * every scroll and resize and there is no cheap way to know it did.
   */
  launcherRect: () => DOMRect | null;
  /** Called by the widget when the avatar has landed, to fire its own pulse. */
  celebrate: () => void;
}

const CoachContext = createContext<CoachValue | null>(null);

/**
 * Attribute the launcher tags itself with so the flight can find it.
 *
 * A `data-` attribute rather than a shared ref, deliberately. The launcher lives
 * inside a lazily-imported chunk and inside an `AnimatePresence` that unmounts it
 * whenever the chat panel opens; a ref threaded through context would have to be
 * attached and detached across that boundary correctly every time, and a missed
 * detach leaves a ref pointing at a removed node whose rect is all zeroes — which
 * reads as a real position and sends the avatar to the top-left corner. A query
 * at flight time either finds a live node or finds nothing.
 */
export const LAUNCHER_ANCHOR = 'data-ascendi-launcher';

export function CoachProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<CoachPhase>('idle');
  const [activeTour, setActiveTour] = useState<string | null>(null);
  const [celebrations, setCelebrations] = useState(0);

  // A ref, not state: nothing renders from it, and putting it in state would
  // re-render every consumer of this context on each measurement.
  const lastRect = useRef<DOMRect | null>(null);

  const invite = useCallback((tourId: string) => {
    setActiveTour(tourId);
    setPhase('inviting');
  }, []);

  const start = useCallback((tourId: string) => {
    setActiveTour(tourId);
    setPhase('touring');
  }, []);

  const stop = useCallback(() => {
    setPhase('idle');
    setActiveTour(null);
  }, []);

  const land = useCallback(() => setPhase('landing'), []);

  const launcherRect = useCallback(() => {
    const node = document.querySelector<HTMLElement>(`[${LAUNCHER_ANCHOR}]`);
    if (!node) return lastRect.current;

    const box = node.getBoundingClientRect();
    // A node that is present but collapsed is mid-exit-animation (framer scales
    // it to 0 on the way out). Treat a zero box as "not there" rather than as a
    // position, or the avatar flies to a point and vanishes into nothing.
    if (box.width === 0 || box.height === 0) return lastRect.current;

    lastRect.current = box;
    return box;
  }, []);

  const celebrate = useCallback(() => setCelebrations((n) => n + 1), []);

  const value = useMemo<CoachValue>(
    () => ({ phase, activeTour, invite, start, stop, land, celebrations, launcherRect, celebrate }),
    [phase, activeTour, invite, start, stop, land, celebrations, launcherRect, celebrate]
  );

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

/**
 * Read the coach.
 *
 * Returns `null` outside a provider instead of throwing. `DashboardShell` is
 * rendered by seven `loading.tsx` files and by one client page
 * (`app/appointment/page.tsx`), and the chat widget is mounted in all of them —
 * so a throwing hook would turn "no coach here" into a blank error boundary on
 * surfaces that have no business caring about onboarding. Consumers guard.
 */
export const useCoach = (): CoachValue | null => useContext(CoachContext);
