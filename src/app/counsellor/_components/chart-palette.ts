// Chart colour for the counsellor analytics.
//
// ── The rule ───────────────────────────────────────────────────────────────────
// A BAR CHART USES ONE ACCENT. Identity comes from the row label, which every bar
// in this app already carries. Use `CHART_ACCENT`.
//
// Multi-hue categorical palettes were tried and rejected: five saturated hues
// (indigo/amber/sky/crimson/emerald) read as a circus beside an indigo brand, and
// the eight-hue rotation before that was worse — it put two blues and two greens
// on screen together (indigo↔violet measured ΔE 1.3 under protanopia, emerald↔teal
// 4.9 with normal colour vision), so its 7th and 8th slots carried no information
// at all. Colour was doing decoration, not work.
//
// `CHART_SERIES` is the fallback for STACKED / SEGMENTED bars only, where adjacent
// segments inside one bar genuinely must be told apart. It is a monochrome ramp of
// the brand hue — see globals.css for the step values and why dark mode uses a
// different, compressed range.
//
// ── Two things not to break ────────────────────────────────────────────────────
// 1. Stacked segments need a 2px surface-coloured gap between them. Adjacent ramp
//    steps are only 1.3–1.5:1 apart, which is the ceiling for a single hue across
//    five steps; the GAP is what separates them, not the colour delta.
// 2. Labels wear ink, never the series colour. No label colour clears 4.5:1 across
//    a set of fills — that was already proven when the palette was multi-hue (the
//    sky slot measured 4.10 on white and 4.24 on ink, failing both) — so values sit
//    beside the mark, not on it.

/** The single accent for bar charts. Row labels carry identity. */
export const CHART_ACCENT = {
  bar: 'bg-primary',
  barHover: 'hover:bg-primary/85',
  /** Values and labels wear ink, never the mark colour. */
  text: 'text-foreground',
  card: 'border-primary/25 bg-primary/10',
  cardHover: 'hover:border-primary/45'
} as const;

export interface ChartPaletteEntry {
  /** Solid mark fill. */
  bar: string;
  /** Hover state for an interactive mark. */
  barHover: string;
  /** Text colour for values/labels. An ink token by design — see note above. */
  text: string;
  /** Tinted card surface + border for KPI tiles. */
  card: string;
  cardHover: string;
}

/**
 * Monochrome brand ramp, for STACKED / SEGMENTED bars only.
 * Ordering is meaningful (light→dark reads small→large), so sort unordered
 * categories by value before using this or you imply a ranking that isn't there.
 */
export const CHART_SERIES: ChartPaletteEntry[] = [
  { bar: 'bg-series-1', barHover: 'hover:bg-series-1/85', text: 'text-foreground', card: 'border-series-1/25 bg-series-1/10', cardHover: 'hover:border-series-1/45' },
  { bar: 'bg-series-2', barHover: 'hover:bg-series-2/85', text: 'text-foreground', card: 'border-series-2/25 bg-series-2/10', cardHover: 'hover:border-series-2/45' },
  { bar: 'bg-series-3', barHover: 'hover:bg-series-3/85', text: 'text-foreground', card: 'border-series-3/25 bg-series-3/10', cardHover: 'hover:border-series-3/45' },
  { bar: 'bg-series-4', barHover: 'hover:bg-series-4/85', text: 'text-foreground', card: 'border-series-4/25 bg-series-4/10', cardHover: 'hover:border-series-4/45' },
  { bar: 'bg-series-5', barHover: 'hover:bg-series-5/85', text: 'text-foreground', card: 'border-series-5/25 bg-series-5/10', cardHover: 'hover:border-series-5/45' }
];

/** Kept as an alias so existing imports keep working. */
export const CHART_PALETTE = CHART_SERIES;

/** Number of distinct ramp steps. Past this, fold into "Other". */
export const CHART_PALETTE_SIZE = CHART_SERIES.length;

/**
 * Ramp step for segment `idx` of a stacked bar.
 *
 * NOTE: wraps on overflow, so a 6-segment bar reuses step 1. Kept deliberately
 * narrow — the real fix is an "Other" bucket in the chart components. Every
 * consumer prints a visible label, so a repeated step is cosmetic, not misleading.
 */
export const chartPaletteAt = (idx: number): ChartPaletteEntry => CHART_SERIES[idx % CHART_SERIES.length];
