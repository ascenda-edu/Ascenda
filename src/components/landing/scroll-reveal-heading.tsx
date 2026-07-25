'use client';

import { Fragment, useRef, type ElementType } from 'react';
import { motion, useMotionTemplate, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useLatchedProgress, useMotionReady } from '@/components/landing-preview/ascent-scroll';

/**
 * ReactBits "Scroll Reveal", re-implemented in framer-motion: a section heading
 * whose words sharpen in left-to-right as it enters the viewport (0.15 → 1
 * opacity, 4px → 0 blur). Editorial rather than showy — the whole reveal is done
 * inside 40vh of scroll, so it reads as the heading arriving, not as a scrub.
 *
 * Children must be a plain string: it is both split into words and used verbatim
 * as the heading's aria-label, with the word spans aria-hidden, so assistive tech
 * gets one uninterrupted sentence instead of N fragments.
 */

/**
 * Words in flight at once. Each word's reveal window is SPAN stagger steps wide
 * while consecutive windows are offset by one step, so SPAN words are always
 * mid-reveal — that overlap is what keeps the sweep continuous instead of
 * flicking word by word. Total steps = n + SPAN - 1, which makes word 0 start at
 * progress 0 and the last word finish at exactly 1.
 */
const SPAN = 3;

function Word({
    word,
    progress,
    start,
    end,
    ready,
}: {
    word: string;
    progress: MotionValue<number>;
    start: number;
    end: number;
    ready: boolean;
}) {
    const opacity = useTransform(progress, [start, end], [0.15, 1], { clamp: true });
    const blur = useTransform(progress, [start, end], [4, 0], { clamp: true });
    const filter = useMotionTemplate`blur(${blur}px)`;

    return (
        // inline-block so the transform/filter apply per word; the spaces between
        // words stay plain text nodes in the parent, so wrapping is unaffected.
        <motion.span className="inline-block" style={ready ? { opacity, filter } : undefined} aria-hidden>
            {word}
        </motion.span>
    );
}

export function ScrollRevealHeading({
    as: Tag = 'h2',
    className,
    children,
}: {
    as?: ElementType;
    className?: string;
    children: string;
}) {
    const ref = useRef<HTMLElement>(null);
    // Measured off the heading's own top edge: starts when it crosses 95% of the
    // viewport, done by 55% — fully revealed well before it reaches reading height.
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.95', 'start 0.55'] });
    // Latched: scrolling back up must not un-reveal the words (see ascent-scroll).
    const progress = useLatchedProgress(scrollYProgress);
    // Gate: scrubbed styles never reach the SSR HTML, and reduced-motion visitors
    // keep the static final frame (every word fully opaque and sharp).
    const ready = useMotionReady();

    // Split on runs of whitespace, not a single space: JSX hands a multi-line child
    // string over with its newlines and indentation intact, and a plain `split(' ')`
    // would turn those into empty "words" that each burn a stagger step.
    const words = children.trim().split(/\s+/);
    const steps = words.length + SPAN - 1;

    return (
        <Tag ref={ref} className={className} aria-label={children}>
            {words.map((word, i) => (
                <Fragment key={`${i}-${word}`}>
                    {i > 0 && ' '}
                    <Word word={word} progress={progress} start={i / steps} end={(i + SPAN) / steps} ready={ready} />
                </Fragment>
            ))}
        </Tag>
    );
}
