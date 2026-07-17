// At-risk students widget (get_cohort_overview). Counsellor surface only — rows
// link to /counsellor/students/{id}, built from the item id against a fixed
// route; other modes render static rows (the guard stays even though at_risk
// only ever renders in counsellor mode). All fields are plain JSX text.
//
// The urgency chip reuses PRIORITY_VISUAL, whose tones line up exactly:
// critical→high(rose), high→medium(amber), medium→watch(sky) — same reserved
// status scale + icon+label as the rest of the app, no re-styled colors.

'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { cardFade } from '@/lib/motion';
import { PRIORITY_VISUAL, type CategoryVisual } from '@/lib/theme/categories';
import type { ChatMode } from '@/lib/chat/prompts';
import type { AtRiskHit } from '@/lib/chat/widgets';

const URGENCY_VISUAL: Record<AtRiskHit['urgency'], CategoryVisual> = {
  critical: PRIORITY_VISUAL.high, // rose
  high: PRIORITY_VISUAL.medium, // amber
  medium: PRIORITY_VISUAL.watch, // sky
};

const URGENCY_LABEL: Record<AtRiskHit['urgency'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
};

function AtRiskRow({ item, mode }: { item: AtRiskHit; mode: ChatMode }) {
  const visual = URGENCY_VISUAL[item.urgency];
  const Icon = visual.icon;

  const inner = (
    <>
      <div className="flex items-center gap-2">
        {item.flag ? (
          <span className="shrink-0 text-sm leading-none" aria-hidden>
            {item.flag}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {item.name}
        </span>
        <span className={visual.chip}>
          <Icon className="h-3 w-3" />
          {URGENCY_LABEL[item.urgency]}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.reason}</p>
    </>
  );

  const shared = 'block rounded-[14px] border border-border bg-background p-2.5';

  if (mode === 'counsellor') {
    return (
      <Link
        href={`/counsellor/students/${encodeURIComponent(item.id)}`}
        className={cn(
          shared,
          'transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm'
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={shared}>{inner}</div>;
}

export function AtRiskWidget({ items, mode }: { items: AtRiskHit[]; mode: ChatMode }) {
  return (
    <motion.div variants={cardFade} initial="hidden" animate="show" className="grid gap-1.5">
      {items.map((item) => (
        // One student can carry several alerts — key per row, not per entity.
        <AtRiskRow key={`${item.id}|${item.reason}`} item={item} mode={mode} />
      ))}
    </motion.div>
  );
}
