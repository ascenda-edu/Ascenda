'use client';

// Cohort stat tiles (get_cohort_overview). Counsellor surface only in practice.
//
// DATAVIZ (skill loaded before authoring): these are figures, not a plotted
// chart — the stat-tile contract is value (Sans semibold) over label (muted,
// sentence case, no trailing colon). Tone is a reserved STATUS accent on the
// value only (positive=success, warning=warning), never a decorative series
// color and never applied to the label. tabular-nums keeps the value column of
// this 2-up grid vertically aligned. All fields are plain JSX text.

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { cardFade } from '@/lib/motion';
import type { StatHit } from '@/lib/chat/widgets';

const toneClass = (tone: StatHit['tone']): string => {
  if (tone === 'positive') return 'text-success';
  if (tone === 'warning') return 'text-warning';
  return 'text-foreground';
};

export function CohortStatsWidget({ items }: { items: StatHit[] }) {
  return (
    <motion.div
      variants={cardFade}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-1.5"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-background p-2.5"
        >
          <p className={cn('text-sm font-semibold tabular-nums', toneClass(item.tone))}>
            {item.value}
          </p>
          <p className="text-label text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </motion.div>
  );
}
