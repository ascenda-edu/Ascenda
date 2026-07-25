'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMotionReady } from './ascent-scroll';

/**
 * MagicUI "Border Beam", adapted: a light blob travelling the container's border
 * ring. The upstream version animates `offset-distance` through a tailwind.config
 * keyframe we don't define, so the travel runs on framer-motion instead.
 *
 * Renders nothing until mounted, and nothing at all for reduced-motion users
 * (useMotionReady) — a perpetual loop has no static "final frame" to fall back to,
 * and the SSR payload must not contain motion markup.
 *
 * Parent must be `position: relative` and carry the border radius the beam should
 * follow (`rounded-[inherit]`).
 */
export function BorderBeam({
    className,
    size = 200,
    duration = 8,
    borderWidth = 1.5,
    colorFrom = '#6366f1',
    colorTo = '#a5b4fc',
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
    if (!ready) return null;

    return (
        <div
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
        </div>
    );
}
