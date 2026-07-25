'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMotionReady } from './ascent-scroll';

/**
 * MagicUI "Border Beam", adapted: a light blob travelling the container's border
 * ring. The upstream version animates `offset-distance` through a tailwind.config
 * keyframe we don't define, so the travel runs on framer-motion instead.
 *
 * The travelling blob is gated three ways, all post-mount — the SSR payload must
 * carry no motion markup, and a perpetual loop has no static "final frame":
 *  1. useMotionReady — mounted, and not reduced-motion.
 *  2. useInView — `offsetDistance` is off the transform fast-path, so each frame
 *     costs a style recalc + repaint of the border ring on the main thread. It
 *     must not run while the host card sits thousands of px off screen.
 *  3. CSS.supports — two independent capabilities, both required:
 *     - `rect()` in `offset-path` (Chrome 116+): without it there is no path to
 *       travel and the gradient square parks in a corner as a static glow.
 *     - unprefixed `mask-composite: intersect` (Chrome 120+): without it the two
 *       mask layers UNION instead of intersecting, so the ring clip is gone and
 *       the full 200px gradient square slides across the card. Chromium 116-119
 *       passes the offset-path test and fails this one, which is exactly the
 *       window this check closes.
 *     Either one missing → render nothing.
 *
 * The masked ring wrapper renders unconditionally (identical on server and
 * client, no motion): useInView attaches its observer on the first commit only,
 * so the observed element cannot be behind a gate.
 *
 * Parent must be `position: relative` and carry the border radius the beam should
 * follow (`rounded-[inherit]`).
 */
export function BorderBeam({
    className,
    size = 200,
    duration = 8,
    borderWidth = 1.5,
    colorFrom = 'hsl(var(--primary))',
    colorTo = 'hsl(var(--primary) / 0.4)',
}: {
    className?: string;
    /** Beam length in px; also the corner radius of its travel path. */
    size?: number;
    /** Seconds for one full lap. */
    duration?: number;
    borderWidth?: number;
    colorFrom?: string;
    colorTo?: string;
}) {
    const ready = useMotionReady();
    const ref = useRef<HTMLDivElement>(null);
    // No `once` — the lap must stop again once the hero scrolls away.
    const inView = useInView(ref, { margin: '200px' });
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        setSupported(
            typeof CSS !== 'undefined' &&
                typeof CSS.supports === 'function' &&
                CSS.supports('offset-path', 'rect(0 auto auto 0)') &&
                CSS.supports('mask-composite', 'intersect'),
        );
    }, []);

    return (
        <div
            ref={ref}
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 rounded-[inherit]', className)}
            style={{
                border: `${borderWidth}px solid transparent`,
                // Two mask layers intersected — transparent over the padding box,
                // opaque over the border box — so only the border ring paints. This
                // is what clips the beam to a hairline instead of a drifting blob.
                maskImage: 'linear-gradient(transparent, transparent), linear-gradient(#fff, #fff)',
                maskClip: 'padding-box, border-box',
                maskComposite: 'intersect',
            }}
        >
            {ready && supported && inView && (
                <motion.div
                    className="absolute aspect-square"
                    style={{
                        width: size,
                        background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
                        offsetAnchor: '90% 50%',
                        offsetPath: `rect(0 auto auto 0 round ${size}px)`,
                    }}
                    animate={{ offsetDistance: ['0%', '100%'] }}
                    transition={{ duration, repeat: Infinity, ease: 'linear' }}
                />
            )}
        </div>
    );
}
