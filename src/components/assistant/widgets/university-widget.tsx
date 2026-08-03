'use client';

// University lookup widget — one wide card per UniversityHit (get_university_info).
// SECURITY: every field is plain JSX text — never dangerouslySetInnerHTML.
// Programme rows link ONLY in student mode, and the href is built from the
// programme id against a fixed route pattern (/university-search/university/{id});
// the university detail route is deliberately keyed by PROGRAM id. Counsellor
// mode renders static rows (no student-app links out of that portal).

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { cardFade } from '@/lib/motion';
import { flagEmoji } from '@/lib/utils/flag';
import type { ChatMode } from '@/lib/chat/prompts';
import type { UniversityHit } from '@/lib/chat/widgets';

// Borderless on purpose — these sit several-to-a-row inside a chat card, where the
// neutral pill's edge would add more noise than structure. The faint brand wash is
// the same one `.surface-chip` carries, so it still reads as part of the set.
const StatChip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full bg-primary/8 px-2 py-0.5 text-label font-medium text-foreground">
    {children}
  </span>
);

function UniversityCard({ item, mode }: { item: UniversityHit; mode: ChatMode }) {
  const meta = [item.city, item.country].filter(Boolean).join(' · ');

  const stats: React.ReactNode[] = [];
  if (typeof item.rankOverall === 'number') {
    stats.push(
      <StatChip key="rank">
        #{item.rankOverall}
        {item.rankSource ? ` (${item.rankSource})` : ''}
      </StatChip>
    );
  }
  if (typeof item.acceptanceRatePct === 'number') {
    stats.push(<StatChip key="acc">{item.acceptanceRatePct}% acceptance</StatChip>);
  }
  if (typeof item.tuitionLow === 'number' && typeof item.tuitionHigh === 'number') {
    const cur = item.currency ? `${item.currency} ` : '';
    stats.push(
      <StatChip key="tuition">
        {cur}
        {item.tuitionLow.toLocaleString()}–{item.tuitionHigh.toLocaleString()}
      </StatChip>
    );
  }
  if (typeof item.students === 'number') {
    stats.push(<StatChip key="students">{item.students.toLocaleString()} students</StatChip>);
  }

  const programs = item.programs.slice(0, 3);
  const rowShared =
    'flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5';

  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {flagEmoji(null, item.country)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{item.name}</p>
          {meta ? <p className="truncate text-label text-muted-foreground">{meta}</p> : null}
        </div>
      </div>

      {stats.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">{stats}</div> : null}

      {programs.length > 0 ? (
        <div className="mt-2 space-y-1">
          {programs.map((p) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1 truncate text-label font-medium text-foreground">
                  {p.course}
                </span>
                {p.level ? (
                  <span className="shrink-0 text-label text-muted-foreground">{p.level}</span>
                ) : null}
              </>
            );
            if (mode === 'student') {
              return (
                <Link
                  key={p.id}
                  href={`/university-search/university/${encodeURIComponent(p.id)}`}
                  className={cn(
                    rowShared,
                    'transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-e-1'
                  )}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div key={p.id} className={rowShared}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function UniversityWidget({ items, mode }: { items: UniversityHit[]; mode: ChatMode }) {
  return (
    <motion.div variants={cardFade} initial="hidden" animate="show" className="grid gap-1.5">
      {items.map((item) => (
        <UniversityCard key={item.id} item={item} mode={mode} />
      ))}
    </motion.div>
  );
}
