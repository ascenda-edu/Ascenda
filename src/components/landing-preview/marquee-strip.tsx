'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMotionReady } from './ascent-scroll';

/**
 * Scroll-linked programme marquee between the hero and the proof band. Both rows
 * are driven by the page's scroll position rather than a keyframe loop, so the
 * strip only ever moves while the reader does — two opposite drifts read as
 * parallax depth instead of decoration.
 *
 * Content is duplicated once per row and the offset wraps at the measured half
 * width, which makes the loop seamless at any viewport. Purely decorative, so
 * the whole strip is aria-hidden.
 */

type Pill = { programme: string; fit: string };

const ROW_ONE: Pill[] = [
    { programme: 'TU Delft · Aerospace Engineering', fit: '92%' },
    { programme: 'ETH Zürich · Mechanical Eng.', fit: '71%' },
    { programme: 'UBC · Environmental Science', fit: '91%' },
    { programme: 'King’s College London · Law', fit: '82%' },
    { programme: 'NUS · Business Analytics', fit: '78%' },
    { programme: 'Imperial · Aeronautics', fit: '85%' },
    { programme: 'Erasmus Rotterdam · Economics', fit: '88%' },
    { programme: 'U. Melbourne · Biomedicine', fit: '80%' },
];

const ROW_TWO: Pill[] = [
    { programme: 'McGill · Cognitive Science', fit: '85%' },
    { programme: 'HKU · Architecture', fit: '77%' },
    { programme: 'Leiden · International Relations', fit: '90%' },
    { programme: 'KTH Stockholm · Eng. Physics', fit: '81%' },
    { programme: 'Utrecht · Psychology', fit: '89%' },
    { programme: 'ANU · Data Science', fit: '83%' },
    { programme: 'Trinity Dublin · English', fit: '92%' },
    { programme: 'TU München · Mechanical Eng.', fit: '69%' },
];

function MarqueeRow({
    items,
    speed,
    reverse = false,
    dim = false,
}: {
    items: Pill[];
    /** Pixels travelled per pixel scrolled. */
    speed: number;
    /** Drift right instead of left. */
    reverse?: boolean;
    dim?: boolean;
}) {
    const ready = useMotionReady();
    const rowRef = useRef<HTMLDivElement>(null);
    const half = useMotionValue(0);
    const { scrollY } = useScroll();

    // Half width lives in a MotionValue so the transform recomputes on resize
    // without re-rendering the (fairly long) pill list.
    const x = useTransform<number, number>([scrollY, half], ([y, h]) => {
        if (!h) return 0;
        const travel = (y * speed) % h;
        return reverse ? travel - h : -travel;
    });

    useEffect(() => {
        const el = rowRef.current;
        if (!el) return;
        const measure = () => half.set(el.scrollWidth / 2);
        measure();
        window.addEventListener('resize', measure, { passive: true });
        return () => window.removeEventListener('resize', measure);
    }, [half]);

    return (
        <motion.div
            ref={rowRef}
            className="flex w-max gap-2.5"
            style={ready ? { x } : undefined}
        >
            {[0, 1].map((copy) =>
                items.map((item) => (
                    <span
                        key={`${copy}-${item.programme}`}
                        className={cn(
                            'flex-none rounded-full border border-border bg-background px-3.5 py-1.5 text-[0.78125rem] tabular-nums dark:border-white/10',
                            dim ? 'text-muted-foreground/70' : 'text-muted-foreground',
                        )}
                    >
                        {item.programme}{' '}
                        <b className={dim ? 'font-semibold text-primary/70' : 'font-semibold text-primary'}>
                            {item.fit}
                        </b>
                    </span>
                )),
            )}
        </motion.div>
    );
}

export function MarqueeStrip() {
    return (
        <div
            aria-hidden
            className="grid w-full gap-2.5 overflow-hidden border-y border-border bg-card py-5 dark:border-white/10"
        >
            <MarqueeRow items={ROW_ONE} speed={0.3} />
            <MarqueeRow items={ROW_TWO} speed={0.22} reverse dim />
        </div>
    );
}
