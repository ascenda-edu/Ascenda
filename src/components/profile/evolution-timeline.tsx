'use client';

import { motion } from 'framer-motion';
import {
  Compass,
  Flag,
  MessageSquare,
  Sparkles,
  Target,
  Trophy
} from 'lucide-react';
import type { EvolutionCategory, EvolutionEntry, EvolutionSource } from '@/lib/data/student-demo-data';

// ─── Animation variants ─────────────────────────────────────────────────────

const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};

const itemFade = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' as const } }
};

// ─── Category config ─────────────────────────────────────────────────────────

// No `border` any more: each category used to paint a coloured left rail on its
// card, which spent five hues on a nominal set. The dot glyph beside it already
// names the category.
const CATEGORY_CONFIG: Record<EvolutionCategory, { icon: typeof Compass; color: string }> = {
  interest: { icon: Compass, color: 'text-muted-foreground' },
  goal: { icon: Target, color: 'text-primary-ink' },
  achievement: { icon: Trophy, color: 'text-success' },
  milestone: { icon: Flag, color: 'text-warning' },
  counsellor_note: { icon: MessageSquare, color: 'text-primary-ink' }
};

const SOURCE_LABEL: Record<EvolutionSource, { label: string; className: string }> = {
  student: { label: 'Student', className: 'bg-muted text-muted-foreground' },
  counsellor: { label: 'Counsellor', className: 'bg-primary/10 text-primary-ink' },
  system: { label: 'System', className: 'bg-muted text-muted-foreground' }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface EvolutionTimelineProps {
  entries: EvolutionEntry[];
  studentName?: string;
}

export function EvolutionTimeline({ entries, studentName }: EvolutionTimelineProps) {
  const sorted = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      {studentName && (
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary-ink" />
          <span className="eyebrow">
            {studentName}&apos;s journey
          </span>
        </div>
      )}

      <motion.div
        className="relative"
        variants={listStagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        {/* Timeline spine */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border/60" />

        <div className="space-y-3">
          {sorted.map((entry) => {
            const cfg = CATEGORY_CONFIG[entry.category];
            const src = SOURCE_LABEL[entry.source];
            const Icon = cfg.icon;

            return (
              <motion.div key={entry.id} variants={itemFade} className="relative flex gap-4 pl-1">
                {/* Dot */}
                <div className={`relative z-10 mt-1.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border bg-card ${cfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>

                {/* Card */}
                <div className="flex-1 surface-subcard p-4 rounded-2xl">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="text-sm font-semibold leading-snug">{entry.title}</h4>
                    <time className="shrink-0 text-label uppercase tracking-[0.1em] text-muted-foreground font-medium">
                      {formatDate(entry.date)}
                    </time>
                  </div>
                  <p className="text-[0.8125rem] text-muted-foreground/90 leading-relaxed mb-2">
                    {entry.description}
                  </p>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-semibold ${src.className}`}>
                    {src.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
