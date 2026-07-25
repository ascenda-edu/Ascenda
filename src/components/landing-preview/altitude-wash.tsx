'use client';

import { motion, useTransform } from 'framer-motion';
import { useMotionReady, usePageProgress } from './ascent-scroll';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The "altitude" garnish: a fixed soft-light wash that warms the page as you
 * climb toward the CTA. Rendered as the LAST child of <main> so it paints
 * uniformly over every section (positioned or not) at ≤0.35 opacity — chrome
 * (nav z-40, hairline z-60, preview ribbon z-50) still sits above it.
 * Pointer-events-none, and it doesn't render at all for static/reduced-motion.
 */
export function AltitudeWash() {
    const ready = useMotionReady();
    const pageProgress = usePageProgress();
    const opacity = useTransform(pageProgress, (v) => clamp01(v) * 0.35);

    if (!ready) return null;

    return (
        <motion.div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[5] mix-blend-soft-light bg-[linear-gradient(180deg,transparent_30%,rgba(255,250,240,1))] dark:bg-[linear-gradient(180deg,transparent_30%,rgba(120,130,235,0.35))]"
            style={{ opacity }}
        />
    );
}
