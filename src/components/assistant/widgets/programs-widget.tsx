'use client';

// Programme results widget — the ORIGINAL search_programs markup, extracted
// verbatim so student search turns render byte-identically to the pre-widget
// thread. Do not restyle: ProgramResultCard owns the card + link security
// (path built only from hit.id; student-mode link, static otherwise).

import { motion } from 'framer-motion';
import { cardFade } from '@/lib/motion';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ProgramHit } from '@/lib/chat/tools';
import { ProgramResultCard } from '../program-result-card';

export function ProgramsWidget({ items, mode }: { items: ProgramHit[]; mode: ChatMode }) {
  return (
    <motion.div
      variants={cardFade}
      initial="hidden"
      animate="show"
      className="grid gap-1.5 sm:grid-cols-2"
    >
      {items.map((hit) => (
        <ProgramResultCard key={hit.id} hit={hit} mode={mode} />
      ))}
    </motion.div>
  );
}
