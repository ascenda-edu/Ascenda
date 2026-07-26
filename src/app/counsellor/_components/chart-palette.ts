// Single source of truth for the counsellor analytics colour rotation.
// FieldChart (analytics-charts.tsx) uses the bar/barHover columns; the custom
// widget charts also need text/card tints for their stacked and kpi layouts.
// Keep every class literal spelled out so Tailwind's scanner picks them up.
//
// ── What changed and why ───────────────────────────────────────────────────────
// This used to be eight hardcoded Tailwind hues (violet, sky, emerald, amber,
// rose, indigo, teal, orange). Two problems, both measured with the dataviz
// skill's validator rather than eyeballed:
//
//  1. Eight hues put two blues and two greens on screen together.
//     indigo↔violet measured ΔE 1.3 under protanopia and 7.5 with normal colour
//     vision; emerald↔teal 4.9. Below ~15 normal-vision ΔE a pair is hard to tell
//     apart even with full colour vision — so slots 7 and 8 carried no
//     information. There are now FIVE slots. Slot 6+ should fold into "Other" or
//     facet into small multiples; never generate a 9th hue.
//
//  2. The hues were used at /70 opacity with `text-white` labels on top. White on
//     amber-500 is 2.13:1 and on emerald-500 1.95:1 — nowhere near AA's 4.5:1.
//     The series colour now stays on the mark and labels wear ink.
//
// The palette lives in globals.css as --series-1..5, with separately SELECTED dark
// steps (the dark OKLCH lightness band is narrower, so four of the five move).
// Validated on the adjacent pairlist, the correct contract for the bar /
// stacked-bar / funnel forms drawn here: worst adjacent CVD ΔE 17.0 deutan in
// light, and dark passes with no warnings.
//
// `text` is deliberately an ink token rather than the series colour: values,
// labels and legends wear text tokens while the coloured mark beside them carries
// identity. That is what keeps these charts legible at every series count.

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

export const CHART_PALETTE: ChartPaletteEntry[] = [
  { bar: 'bg-series-1', barHover: 'hover:bg-series-1/85', text: 'text-foreground', card: 'border-series-1/25 bg-series-1/10', cardHover: 'hover:border-series-1/45' },
  { bar: 'bg-series-2', barHover: 'hover:bg-series-2/85', text: 'text-foreground', card: 'border-series-2/25 bg-series-2/10', cardHover: 'hover:border-series-2/45' },
  { bar: 'bg-series-3', barHover: 'hover:bg-series-3/85', text: 'text-foreground', card: 'border-series-3/25 bg-series-3/10', cardHover: 'hover:border-series-3/45' },
  { bar: 'bg-series-4', barHover: 'hover:bg-series-4/85', text: 'text-foreground', card: 'border-series-4/25 bg-series-4/10', cardHover: 'hover:border-series-4/45' },
  { bar: 'bg-series-5', barHover: 'hover:bg-series-5/85', text: 'text-foreground', card: 'border-series-5/25 bg-series-5/10', cardHover: 'hover:border-series-5/45' }
];

/** Number of distinct categorical slots. Past this, fold into "Other". */
export const CHART_PALETTE_SIZE = CHART_PALETTE.length;

/**
 * Colour for categorical slot `idx`.
 *
 * NOTE: this still wraps on overflow, so a 6-bucket chart reuses slot 1. That
 * limitation is kept deliberately — the real fix is an "Other" bucket inside the
 * chart components, which is Phase 4 work. Until then every consumer prints a
 * visible label per row, so a repeated hue is cosmetic rather than misleading.
 */
export const chartPaletteAt = (idx: number): ChartPaletteEntry => CHART_PALETTE[idx % CHART_PALETTE.length];
