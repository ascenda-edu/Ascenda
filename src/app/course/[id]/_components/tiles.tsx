'use client';

import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The repeated furniture of the course page, extracted once.
 *
 * Before this, each tab panel hand-assembled the same four shapes — a card with
 * an icon heading, a figure tile, a tinted metric tile, a label/value breakdown
 * row — from raw utilities, with the eyebrow label written out as
 * `text-xs font-bold uppercase tracking-wider text-…` in 40-odd places. The
 * house `eyebrow` class already is that, and `surface-subcard` / `surface-stat`
 * already are those surfaces.
 */

/* ─── Headings ───────────────────────────────────────────────────────────── */

/**
 * The heading ladder on this page, now that the hero is a real `<PageHero>`:
 *
 *   h1  PageHero title      22px → 24px (md)   semibold
 *   h2  PanelHeading        20px  (text-xl)    semibold
 *   h3  SectionCard title   18px  (text-lg)    semibold  — the CardTitle step
 *
 * The panels used to open with `text-2xl font-bold` (24px), i.e. the same size
 * as the page's own h1 at md and *larger* than it below md.
 */
export const PanelHeading = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cn('text-xl font-semibold text-foreground', className)}>{children}</h2>
);

interface SectionCardProps {
  title: ReactNode;
  icon?: ElementType;
  /** Tone for the leading icon. Defaults to the brand ink. */
  iconClassName?: string;
  /** `h2` when this card *is* the panel's top-level section (no PanelHeading above). */
  headingAs?: 'h2' | 'h3';
  /** Extra classes on the card surface. */
  className?: string;
  /** Extra classes on the heading. */
  headingClassName?: string;
  children: ReactNode;
}

export function SectionCard({
  title,
  icon: Icon,
  iconClassName = 'text-primary-ink',
  headingAs: Heading = 'h3',
  className,
  headingClassName,
  children
}: SectionCardProps) {
  return (
    <section className={cn('surface-card', className)}>
      <Heading
        className={cn(
          'mb-4 flex items-center gap-2 font-semibold text-foreground',
          Heading === 'h2' ? 'text-xl' : 'text-lg',
          headingClassName
        )}
      >
        {Icon ? <Icon className={cn('h-5 w-5 shrink-0', iconClassName)} aria-hidden /> : null}
        {title}
      </Heading>
      {children}
    </section>
  );
}

/* ─── Figures ────────────────────────────────────────────────────────────── */

export type MetricTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'feature' | 'neutral';

/**
 * Tone tints. All five semantic tones plus `primary`; no palette literals.
 * The tint is a 5% wash (decorative), so the label carries the tone in ink too
 * — the wash alone does not survive a greyscale read.
 */
const METRIC_TONE: Record<MetricTone, { wash: string; label: string }> = {
  primary: { wash: 'from-primary/5 to-transparent', label: 'text-primary-ink' },
  info: { wash: 'from-info/5 to-transparent', label: 'text-info' },
  success: { wash: 'from-success/5 to-transparent', label: 'text-success' },
  warning: { wash: 'from-warning/5 to-transparent', label: 'text-warning' },
  danger: { wash: 'from-danger/5 to-transparent', label: 'text-danger' },
  feature: { wash: 'from-feature/5 to-transparent', label: 'text-feature' },
  neutral: { wash: 'from-muted/30 to-transparent', label: '' }
};

interface TileProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  valueClassName?: string;
}

/**
 * Top-level figure, on the page background. Was a `<Card>` with a
 * `CardHeader`/`CardTitle`/`CardContent` stack whose only job was to hold a
 * label and a number — and whose `CardTitle` (`text-lg`, a utility) would have
 * beaten `.eyebrow` (`@layer components`) on layer order if the two were
 * combined. `surface-stat` is the primitive for exactly this.
 */
export function MetricTile({ label, value, detail, tone = 'neutral', className, valueClassName }: TileProps & { tone?: MetricTone }) {
  const t = METRIC_TONE[tone];
  return (
    <div className={cn('surface-stat bg-gradient-to-br', t.wash, className)}>
      <p className={cn('eyebrow', t.label)}>{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums text-foreground', valueClassName)}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/** Nested figure, for grids that sit *inside* a `SectionCard`. */
export function FactTile({ label, value, detail, className, valueClassName, labelClassName }: TileProps & { labelClassName?: string }) {
  return (
    <div className={cn('surface-subcard p-4', className)}>
      <p className={cn('eyebrow', labelClassName)}>{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums text-foreground', valueClassName)}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/** Nested label + short prose, for the "at a glance" attribute grids. */
export function AttributeTile({ label, value, labelClassName }: { label: ReactNode; value: ReactNode; labelClassName?: string }) {
  return (
    <div className="surface-subcard p-4">
      <p className={cn('eyebrow', labelClassName)}>{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

/* ─── Breakdown rows ─────────────────────────────────────────────────────── */

/**
 * One line of a label/value breakdown table. `total` renders the summed final
 * row (heavier rule above it, larger figure) instead of a divider below.
 */
export function BreakdownRow({
  label,
  value,
  total = false,
  valueClassName
}: {
  label: ReactNode;
  value: ReactNode;
  total?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        total ? 'border-t-2 border-border/60 pt-4' : 'border-b border-border/40 pb-4'
      )}
    >
      <span className={cn('font-medium text-foreground', total && 'font-semibold')}>{label}</span>
      <span className={cn('font-semibold tabular-nums text-foreground', total ? 'text-xl' : 'text-lg', valueClassName)}>
        {value}
      </span>
    </div>
  );
}

/* ─── Tag lists ──────────────────────────────────────────────────────────── */

/**
 * Splits a delimited DB string into chips. Uses `surface-chip`, the house chip
 * primitive — both tag rows on this page were hand-rolled
 * `rounded-full bg-primary/10 … ring-1 ring-primary/20` pills instead.
 */
export function TagList({ value, separator }: { value: string; separator: RegExp }) {
  const tags = value.split(separator).map((t) => t.trim()).filter(Boolean);
  if (!tags.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag} className="surface-chip">
          {tag}
        </li>
      ))}
    </ul>
  );
}

/* ─── Empty states ───────────────────────────────────────────────────────── */

/** The "coming soon" card each panel falls back to. */
export const PanelEmpty = ({ children }: { children: ReactNode }) => (
  <div className="surface-card">
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);
