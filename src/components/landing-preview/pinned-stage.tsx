'use client';

import {
    type ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { MotionValue, useMotionValue, useMotionValueEvent, useScroll, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SCENE_SPRING, useMotionReady, usePageScroll } from './ascent-scroll';
import { useSmoothScroll } from './smooth-scroll';

/**
 * Fired whenever a pinned stage changes the document's height — arming its pin
 * (growth) or settling it (shrink). Neither emits a `resize` event, so anything
 * caching a document offset (the nav's T-minus countdown maps scroll offsets onto
 * `#cta`'s position) has to re-measure.
 */
export const LAYOUT_SHIFT_EVENT = 'ascenda:layout-shift';

/**
 * The settle compensation has to land before paint or the page visibly jumps, but
 * React warns when a component calls useLayoutEffect during SSR — so alias it on
 * the server, exactly as framer-motion does internally. Nothing in this effect
 * runs outside the browser anyway.
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * How still the scroll has to be before an inbound trip counts as landed and the
 * arming condition is re-measured. A Lenis glide emits scroll events for its whole
 * ~1.2s, so anything in flight comfortably keeps resetting this.
 */
const SCROLL_QUIET_MS = 150;
/**
 * The earliest an arming decision is made. Scroll restoration can land after mount,
 * and it must be measured rather than grown underneath.
 */
const ARM_MIN_DELAY_MS = 300;

export interface PinnedStageCtx {
    /** Latched + sprung 0→1 across the pin travel. Never runs backwards. */
    p: MotionValue<number>;
    /** True only while the pin is live — gate every scrubbed `style` on it. */
    scrub: boolean;
}

/**
 * A section that pins itself for one pass and then gets out of the way.
 *
 * The tree it renders is a one-shot excursion between two identical resting
 * states: the `settled` presentation is what SSR, no-JS, reduced-motion, small
 * viewports AND everyone who has already scrolled through it see. In between —
 * once, for visitors who reach it from above on a big enough screen — the section
 * grows to `pinVh` and its stage sticks, so `children` can scrub against `p`.
 *
 * Two rules govern the excursion:
 *  1. **It never arms on a section the visitor has already reached.** Growing the
 *     document under someone, or swapping the presentation in front of them, are
 *     both visible jumps; requiring the section to still be below the fold makes
 *     the growth unobservable and needs no compensation at all. Deep links and
 *     restored scroll positions therefore keep the settled tree for the session.
 *  2. **It settles only once the section is entirely above the viewport**, and
 *     compensates the lost height before paint, so the shrink is unobservable too.
 *     The visitor only ever sees its result: a normal-length section on the way
 *     back up instead of a rewind through dead pin travel.
 */
export function PinnedStage({
    id,
    className,
    stageClassName,
    pinVh = 190,
    pinQuery,
    settled,
    children,
}: {
    id?: string;
    className?: string;
    stageClassName?: string;
    pinVh?: number;
    /**
     * Media query the viewport must satisfy for the pin to arm, sampled ONCE at
     * mount. Deliberately not a live subscription: arming is what changes document
     * height, so a mid-session resize must never re-grow the page under a reader.
     */
    pinQuery?: string;
    /**
     * The resting presentation. Omit it and the pinned tree is re-rendered with
     * `scrub: false` in a non-sticky wrapper — right for a stage whose settled
     * frame IS its final scrubbed frame, wrong for anything (a stepper, a swapper)
     * whose last frame hides earlier content.
     *
     * `afterPin` distinguishes the two times this renders. On the second one it
     * mounts entirely above the viewport, so any `whileInView` entrance inside it
     * would still be in its hidden state when the visitor scrolls back up — a hole
     * where finished content should be. Skip those entrances when it is true.
     */
    settled?: (ctx: { afterPin: boolean }) => ReactNode;
    /**
     * Render prop for the pinned stage. Invoked inside a conditional branch, so it
     * MUST NOT call hooks — return a single component and let that own them.
     */
    children: (ctx: PinnedStageCtx) => ReactNode;
}) {
    const ref = useRef<HTMLElement>(null);
    const { scrollYProgress: raw } = useScroll({ target: ref, offset: ['start start', 'end end'] });
    // One-way, like every other scrub on this page: the stage plays forward as you
    // scroll down and then HOLDS. Scrolling back up must never re-run the animation
    // in reverse — the whole point of the pass is that what has played stays played.
    // The step list is permanently mounted, so a held frame still shows all three
    // steps; only the visual stops changing.
    //
    // Latched locally rather than with useLatchedProgress because this one has to be
    // resettable: a visitor who turns back before finishing has not seen the stage,
    // and the next downward pass should play from the start rather than resume from
    // a high-water mark they never reached.
    const latched = useMotionValue(0);
    useMotionValueEvent(raw, 'change', (v) => {
        if (v > latched.get()) latched.set(v);
    });
    const p = useSpring(latched, SCENE_SPRING);
    const ready = useMotionReady();
    const { shiftBy, canShiftSmoothly, isGliding } = useSmoothScroll();
    const { scrollY: pageScrollY } = usePageScroll();

    const [pinned, setPinned] = useState(false);
    const armedRef = useRef(false);
    const completedRef = useRef(false);
    const settledRef = useRef(false);
    const compensatedRef = useRef(false);
    /** Whether this settle needs a scroll correction — see trySettle. */
    const compensateRef = useRef(false);
    /** Where the section's bottom edge sat the frame before the swap... */
    const bottomRef = useRef(0);
    /** ...and the scroll position it was measured at, so real scrolling that happens
     * between the measurement and the swap can be subtracted back out. */
    const bottomAtScrollRef = useRef(0);

    // `ready` is false on the server and on the first client render, so the settled
    // tree is the SSR HTML and hydration cannot mismatch. Reduced-motion users
    // never arm at all.
    useEffect(() => {
        if (!ready || armedRef.current) return;
        const node = ref.current;
        if (!node) return;
        if (pinQuery && !window.matchMedia(pinQuery).matches) {
            armedRef.current = true;
            return;
        }
        // Rule 1 needs a standing start. Arming swaps the presentation AND grows the
        // section to `pinVh`, and both are unobservable only while the section is
        // below the fold — so the measurement has to happen when the page is at rest,
        // not while something is still carrying the visitor somewhere. Two things can
        // be in flight at mount: a fragment's trip (globals.css sets
        // `scroll-behavior: smooth`, so it is ANIMATED and has not started yet at
        // mount) and scroll restoration. Growing the document under either lands it
        // short of a target computed before the growth.
        //
        // So the condition is WATCHED rather than sampled once. Every time the scroll
        // comes to rest, re-measure; arm the first time the section is safely below
        // the fold. An in-flight trip simply never satisfies "at rest", which is the
        // property the old blanket `location.hash` bail was standing in for — at the
        // cost of refusing the stage for the whole session, so a stale
        // `#how-it-works` left in the address bar by the nav killed it on every
        // reload, permanently, with no way back but hand-editing the URL. Now a
        // deep-linked or restored visitor just has to reach somewhere the swap cannot
        // be seen, which scrolling back above the section does.
        let quiet: ReturnType<typeof setTimeout> | null = null;

        const evaluate = () => {
            quiet = null;
            // Never re-arm a stage that has already played: the settle is what makes
            // the second pass an ordinary short section, and re-growing it would
            // rewind exactly the travel the visitor just finished.
            if (armedRef.current || settledRef.current) return;
            // Rule 1: still below the fold. A position inside or past the section
            // keeps the settled tree — for now, not for the session.
            if (node.getBoundingClientRect().top < window.innerHeight * 0.9) return;
            armedRef.current = true;
            // A visitor who was already past this section drove `raw` to 1 on the way
            // in — while unpinned it is a short static block, and scrolling clear of
            // it reads as full progress. That leaves the latch at its maximum and the
            // stage marked complete, so arming without clearing both mounts the pin on
            // its FINAL frame and lets the very next scroll event settle a pass that
            // never played. This pass has not played: start it from zero.
            latched.set(0);
            completedRef.current = false;
            window.removeEventListener('scroll', onScroll);
            setPinned(true);
        };

        const schedule = (delay: number) => {
            if (quiet) clearTimeout(quiet);
            quiet = setTimeout(evaluate, delay);
        };

        const onScroll = () => schedule(SCROLL_QUIET_MS);

        window.addEventListener('scroll', onScroll, { passive: true });
        // The first look still waits out the beat that scroll restoration can land
        // in, so a restore arriving after mount is measured rather than grown under.
        schedule(ARM_MIN_DELAY_MS);

        return () => {
            if (quiet) clearTimeout(quiet);
            window.removeEventListener('scroll', onScroll);
        };
        // `latched` is a stable MotionValue — listed for exhaustiveness, not because
        // this effect should ever re-run for it.
    }, [ready, pinQuery, latched]);

    // `useMotionReady` tracks the OS preference for the session's whole life, so it
    // can go false while a pin is live. Arming is one-shot, but it has to be
    // undoable: leaving someone who just asked for reduced motion inside a 300svh
    // scroll-driven pin is the one thing that switch is meant to prevent. No
    // compensation — this is a deliberate user action, and the alternative is
    // holding the scroll position of a stage that should no longer exist.
    useEffect(() => {
        if (!ready && pinned) setPinned(false);
    }, [ready, pinned]);

    useMotionValueEvent(raw, 'change', (v) => {
        // 0.999, not 1: the closing frame of a scrub routinely lands a hair short.
        if (v >= 0.999) completedRef.current = true;
    });

    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trySettle = useCallback(() => {
        if (!pinned || settledRef.current) return;
        const node = ref.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        // Off-screen in EITHER direction, with a margin. Downward is the usual exit;
        // upward matters just as much, because a visitor who turns back mid-stage
        // would otherwise leave the pin armed and have to scroll its whole travel
        // again on the next way down — the forced-scroll-once rule cuts both ways.
        // The margin means a small nudge back the way they came doesn't immediately
        // reveal the swapped-in tree.
        const margin = window.innerHeight * 0.25;
        const goneAbove = rect.bottom <= -margin;
        const goneBelow = rect.top >= window.innerHeight + margin;
        if (!goneAbove && !goneBelow) return;

        if (!completedRef.current) {
            // Turned back before reaching the end: they never saw the stage, so drop
            // the high-water mark and let the next pass play it from the start rather
            // than resume at a frame they scrolled past on the way out.
            if (goneBelow) latched.set(0);
            return;
        }
        // Only a concern on the fallback path. `shiftBy` moves a glide's endpoints
        // along with everything else, so the glide still lands where it was aimed;
        // `jumpBy` replaces it outright and strands the nav click short of its anchor.
        if (isGliding() && !canShiftSmoothly()) {
            // A timer, not just "wait for the next scroll event". A wheel can abandon
            // a Lenis glide without completing it, and if the page then comes to rest
            // no further scroll event ever arrives — leaving the pin armed and two
            // screens of document in place until the visitor happens to scroll again,
            // at which point the settle fires at an arbitrary moment.
            if (!retryRef.current) {
                retryRef.current = setTimeout(() => {
                    retryRef.current = null;
                    trySettle();
                }, 200);
            }
            return;
        }
        settledRef.current = true;
        bottomRef.current = rect.bottom;
        bottomAtScrollRef.current = window.scrollY;
        // Only an exit above the viewport moves anything the visitor can see: the
        // shrink happens over their head, so the page beneath slides up and has to be
        // corrected. Exiting below, everything that moves is already off-screen under
        // them, so compensating would itself be the jump.
        compensateRef.current = goneAbove;
        setPinned(false);
    }, [pinned, isGliding, canShiftSmoothly, latched]);

    // Settle the moment the section is out of the way — the pin's whole extra height
    // goes with it, so the second time anyone passes this section it is an ordinary
    // short one. Waiting is what made it feel endless: the height stays in the
    // document until the swap happens, so any delay is scrolling the visitor has to
    // do through a section they have already watched.
    //
    // Doing it mid-scroll is only safe because `shiftBy` moves Lenis's whole frame of
    // reference instead of commanding a new scroll — position, target and in-flight
    // animation all by the same delta — so the fling keeps its momentum and a glide
    // keeps its destination. On the fallback path (no Lenis, or internals this build
    // cannot reach) the correction still resets the animation, so there the settle
    // waits for the scroll to stop rather than snatching it away mid-fling.
    //
    // It rides page scrollY rather than `raw`: MotionValue only notifies on change,
    // and once the visitor is past the section its progress sits clamped at 1, so the
    // stretch where the section finally clears the viewport is silent.
    const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useMotionValueEvent(pageScrollY, 'change', () => {
        if (settledRef.current) return;
        if (canShiftSmoothly()) {
            trySettle();
            return;
        }
        if (idleRef.current) clearTimeout(idleRef.current);
        idleRef.current = setTimeout(trySettle, 180);
    });
    useEffect(
        () => () => {
            if (retryRef.current) clearTimeout(retryRef.current);
            if (idleRef.current) clearTimeout(idleRef.current);
        },
        [],
    );

    useBeforePaint(() => {
        const node = ref.current;
        if (!node) return;

        // Arming only ever grows the section, and rule 1 guarantees that growth is
        // below the fold — nothing to compensate, only to announce.
        if (pinned) {
            window.dispatchEvent(new Event(LAYOUT_SHIFT_EVENT));
            return;
        }
        // The initial settled render, not a settle: nothing has changed yet.
        if (!settledRef.current) return;
        // Compensate exactly once. The effect's deps include `jumpBy`, and a changed
        // context identity would otherwise re-enter this branch and jump twice.
        if (compensatedRef.current) return;
        compensatedRef.current = true;

        // Correct by what actually moved, not by the height that was removed. The two
        // are the same only in the easy case. If the visitor is at the bottom of the
        // page the browser has already clamped the scroll position to the shorter
        // document — subtracting the removed height on top of that double-counts it
        // and throws the page a screen and a half. Browser scroll anchoring can do the
        // same on the native path. Measuring the section's own edge against where it
        // sat a frame ago covers every one of those cases with one number.
        if (compensateRef.current) {
            // Where the edge WOULD be now if only the visitor's own scrolling had
            // moved it. React commits a frame or two after the scroll event that
            // triggered the settle, and mid-glide that gap is ~100px of real
            // scrolling — charging it to the layout change dragged every nav click
            // that crossed this section about that far short of its anchor.
            const scrolled = window.scrollY - bottomAtScrollRef.current;
            const expected = bottomRef.current - scrolled;
            const residual = node.getBoundingClientRect().bottom - expected;
            // shiftBy, not jumpBy: this now runs mid-scroll, and the whole point is
            // that the visitor's fling survives the correction. It falls back to a
            // plain jump on its own where it has to.
            if (Math.abs(residual) > 0.5) shiftBy(residual);
        }
        window.dispatchEvent(new Event(LAYOUT_SHIFT_EVENT));
    }, [pinned, shiftBy]);

    return (
        <section
            ref={ref}
            id={id}
            className={cn('relative', className)}
            // svh: toolbar-invariant on mobile, identical to vh on desktop.
            style={pinned ? { height: `${pinVh}svh` } : undefined}
        >
            {pinned ? (
                <div className={cn('sticky top-0 flex min-h-[100svh] items-center overflow-hidden', stageClassName)}>
                    {children({ p, scrub: true })}
                </div>
            ) : settled ? (
                settled({ afterPin: settledRef.current })
            ) : (
                <div className={cn('relative overflow-hidden py-20', stageClassName)}>
                    {children({ p, scrub: false })}
                </div>
            )}
        </section>
    );
}
