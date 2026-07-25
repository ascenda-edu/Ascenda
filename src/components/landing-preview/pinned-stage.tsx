'use client';

import {
    ReactNode,
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
    const { jumpBy, isGliding } = useSmoothScroll();
    const { scrollY: pageScrollY } = usePageScroll();

    const [pinned, setPinned] = useState(false);
    const armedRef = useRef(false);
    const completedRef = useRef(false);
    const settledRef = useRef(false);
    const compensatedRef = useRef(false);
    /** Whether this settle needs a scroll correction — see trySettle. */
    const compensateRef = useRef(false);
    /** Where the section's bottom edge sat the frame before the swap. */
    const bottomRef = useRef(0);

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
        // A fragment in the URL means the page is on its way somewhere specific, and
        // globals.css sets `scroll-behavior: smooth`, so that trip is ANIMATED and
        // has not started yet at mount: the guard below would still measure the
        // section as far below the fold, arm, and grow the document by two screens
        // underneath a scroll whose target was computed before the growth. Every
        // deep link past this section then lands ~2 screens short. Deep-linked
        // sessions keep the settled tree.
        if (window.location.hash) {
            armedRef.current = true;
            return;
        }
        // Same reasoning for scroll restoration, which can also land after mount:
        // decide a beat later, once any inbound scroll has settled, and measure then.
        // Arming is invisible either way — the growth is all below the fold — so the
        // only cost of waiting is that a visitor who reaches the section within
        // ~300ms of hydration keeps the grid.
        const timer = setTimeout(() => {
            if (armedRef.current) return;
            armedRef.current = true;
            // Rule 1: still below the fold. Anything else — a restored position
            // inside or past the section, a fast scroller — keeps the settled tree.
            if (node.getBoundingClientRect().top < window.innerHeight * 0.9) return;
            setPinned(true);
        }, 300);
        return () => clearTimeout(timer);
    }, [ready, pinQuery]);

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
        // Off-screen in EITHER direction, with half a screen of margin. Downward is
        // the usual exit; upward matters just as much, because a visitor who turns
        // back mid-stage would otherwise leave the pin armed and have to scroll its
        // whole travel again on the next way down — the forced-scroll-once rule cuts
        // both ways. The margin means a small nudge back the way they came doesn't
        // immediately reveal the swapped-in tree.
        const margin = window.innerHeight * 0.5;
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
        // Never mid-glide: the compensation below goes through `jumpBy`, which
        // replaces an in-flight Lenis animation and would strand a nav click short
        // of its anchor.
        if (isGliding()) {
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
        // Only an exit above the viewport moves anything the visitor can see: the
        // shrink happens over their head, so the page beneath slides up and has to be
        // corrected. Exiting below, everything that moves is already off-screen under
        // them, so compensating would itself be the jump.
        compensateRef.current = goneAbove;
        setPinned(false);
    }, [pinned, isGliding, latched]);

    // Debounced, and this is the whole difference between a settle you never notice
    // and one that feels like the page hitting a wall. The swap removes ~1.5 screens
    // of document and corrects the scroll position to match; that correction goes
    // through Lenis's `immediate` mode, which resets its animation state and throws
    // away whatever momentum a fling still had. Doing that mid-scroll reads as a hard
    // stop and a stutter back up to speed, even though the content never moves.
    //
    // So: only settle once scrolling has actually stopped. Nothing is waiting on it —
    // the section is half a screen off-screen by then — and at rest there is no
    // momentum to destroy and no velocity to interrupt.
    //
    // It also rides page scrollY rather than `raw`: MotionValue only notifies on
    // change, and once the visitor is past the section its progress sits clamped at
    // 1, so the stretch where the section finally clears the viewport is silent.
    const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useMotionValueEvent(pageScrollY, 'change', () => {
        if (settledRef.current) return;
        if (idleRef.current) clearTimeout(idleRef.current);
        idleRef.current = setTimeout(trySettle, 180);
    });
    useEffect(
        () => () => {
            if (retryRef.current) clearTimeout(retryRef.current);
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
            const residual = node.getBoundingClientRect().bottom - bottomRef.current;
            if (Math.abs(residual) > 0.5) jumpBy(residual);
        }
        window.dispatchEvent(new Event(LAYOUT_SHIFT_EVENT));
    }, [pinned, jumpBy]);

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
