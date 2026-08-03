'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Uniform staged-disclosure wrapper for sections imported verbatim from the
 * live landing page. Gives every non-scrubbed section the same entrance as
 * the rest of the preview (one quiet rise per section), so the page reads as
 * one motion system. Inner sections keep their own whileInView details.
 */
export function SectionReveal({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}
