'use client';

// Match-breakdown widget — one card per ranked MatchHit.
//
// DATAVIZ (skill loaded before authoring): the four factor bars encode
// magnitude across four dimensions of ONE conceptual measure (fit strength,
// 0–100), so per the sequential rule they share ONE hue (primary) — not a
// per-bar rainbow, which would misread as four unrelated categories. The track
// is a lighter step of the same surface (bg-muted); fills carry a 4px rounded
// data-end (rounded-full). Labels/values wear text tokens, never the bar color.
// preferenceFit is engine-hardcoded to 0 today, so its bar + label render muted
// to signal "no signal" rather than a real zero. The tier chip reuses the shared
// TIER_VISUAL scale (status, icon+label) and never re-classifies from the score.
//
// SECURITY: fields are plain JSX text; the card links only in student mode and
// only to /course/{id} built from the item id.

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { cardFade } from '@/lib/motion';
import { TIER_VISUAL, type FitTier } from '@/lib/theme/categories';
import type { ChatMode } from '@/lib/chat/prompts';
import type { MatchHit } from '@/lib/chat/widgets';

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

const tierKeyOf = (tier: MatchHit['tier']): FitTier | null => {
  if (!tier) return null;
  return tier === 'Safe' ? 'safety' : (tier.toLowerCase() as FitTier);
};

function FactorBar({ label, value, muted }: { label: string; value: number; muted: boolean }) {
  const pct = clamp(value);
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'w-[72px] shrink-0 text-label',
          muted ? 'text-muted-foreground/60' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', muted ? 'bg-muted-foreground/30' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'w-7 shrink-0 text-right text-label tabular-nums',
          muted ? 'text-muted-foreground/60' : 'text-muted-foreground'
        )}
      >
        {pct}
      </span>
    </div>
  );
}

function MatchCard({ item, mode }: { item: MatchHit; mode: ChatMode }) {
  const tierKey = tierKeyOf(item.tier);
  const tierVisual = tierKey ? TIER_VISUAL[tierKey] : null;
  const TierIcon = tierVisual?.icon;

  const inner = (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{item.course}</p>
          <p className="truncate text-label text-muted-foreground">{item.university}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
          {clamp(item.score)}%
        </span>
      </div>

      {tierVisual && TierIcon ? (
        <div className="mt-1.5">
          <span className={tierVisual.chip}>
            <TierIcon className="h-3 w-3" />
            {item.tier}
          </span>
        </div>
      ) : null}

      <div className="mt-2 space-y-1">
        <FactorBar label="Eligibility" value={item.factors.eligibility} muted={false} />
        <FactorBar label="Academic fit" value={item.factors.academicFit} muted={false} />
        <FactorBar
          label="Preferences"
          value={item.factors.preferenceFit}
          muted={item.factors.preferenceFit === 0}
        />
        <FactorBar label="Outcomes" value={item.factors.outcomes} muted={false} />
      </div>
    </>
  );

  const shared = 'block rounded-xl border border-border bg-background p-2.5';

  if (mode === 'student') {
    return (
      <Link
        href={`/course/${encodeURIComponent(item.id)}`}
        className={cn(
          shared,
          'transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-e-1'
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={shared}>{inner}</div>;
}

export function MatchesWidget({ items, mode }: { items: MatchHit[]; mode: ChatMode }) {
  return (
    <motion.div variants={cardFade} initial="hidden" animate="show" className="grid gap-1.5">
      {items.map((item) => (
        <MatchCard key={item.id} item={item} mode={mode} />
      ))}
    </motion.div>
  );
}
