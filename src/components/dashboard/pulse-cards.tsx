'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Compass, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger, cardFade as cardVariant } from '@/lib/motion';

const ICON_MAP = {
  CheckCircle2,
  Compass,
  Target,
  Zap,
} as const;

export type PulseCardIcon = keyof typeof ICON_MAP;

interface PulseCard {
  label: string;
  value: string;
  detail: string;
  icon: PulseCardIcon;
  accentClass: string;
}

interface PulseCardsProps {
  cards: PulseCard[];
}

export function PulseCards({ cards }: PulseCardsProps) {
  return (
    <motion.div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {cards.map((card) => {
        const Icon = ICON_MAP[card.icon];
        return (
          <motion.div
            key={card.label}
            className="group relative overflow-hidden surface-stat flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            variants={cardVariant}
            whileHover={{ scale: 1.02 }}
          >
            {/* Hover gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />

            <div className={cn(
              'relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110',
              card.accentClass
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="relative z-10 min-w-0">
              <motion.p
                className="text-2xl font-bold text-foreground"
                key={card.value}
                initial={{ scale: 1.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {card.value}
              </motion.p>
              <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground font-semibold">{card.label}</p>
              <p className="text-xs text-muted-foreground truncate">{card.detail}</p>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
