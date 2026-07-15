// Single source of truth for the counsellor analytics colour rotation.
// FieldChart (analytics-charts.tsx) uses the bar/barHover columns; the custom
// widget charts also need text/card tints for their stacked and kpi layouts.
// Keep every class literal spelled out so Tailwind's scanner picks them up.
export interface ChartPaletteEntry {
  bar: string;
  barHover: string;
  text: string;
  card: string;
  cardHover: string;
}

export const CHART_PALETTE: ChartPaletteEntry[] = [
  { bar: 'bg-violet-500/70', barHover: 'hover:bg-violet-500/90', text: 'text-violet-700 dark:text-violet-300', card: 'border-violet-200/60 bg-violet-500/10 dark:border-violet-500/20', cardHover: 'hover:border-violet-300/80 dark:hover:border-violet-400/40' },
  { bar: 'bg-sky-500/70', barHover: 'hover:bg-sky-500/90', text: 'text-sky-700 dark:text-sky-300', card: 'border-sky-200/60 bg-sky-500/10 dark:border-sky-500/20', cardHover: 'hover:border-sky-300/80 dark:hover:border-sky-400/40' },
  { bar: 'bg-emerald-500/70', barHover: 'hover:bg-emerald-500/90', text: 'text-emerald-700 dark:text-emerald-300', card: 'border-emerald-200/60 bg-emerald-500/10 dark:border-emerald-500/20', cardHover: 'hover:border-emerald-300/80 dark:hover:border-emerald-400/40' },
  { bar: 'bg-amber-500/70', barHover: 'hover:bg-amber-500/90', text: 'text-amber-700 dark:text-amber-300', card: 'border-amber-200/60 bg-amber-500/10 dark:border-amber-500/20', cardHover: 'hover:border-amber-300/80 dark:hover:border-amber-400/40' },
  { bar: 'bg-rose-500/70', barHover: 'hover:bg-rose-500/90', text: 'text-rose-700 dark:text-rose-300', card: 'border-rose-200/60 bg-rose-500/10 dark:border-rose-500/20', cardHover: 'hover:border-rose-300/80 dark:hover:border-rose-400/40' },
  { bar: 'bg-indigo-500/70', barHover: 'hover:bg-indigo-500/90', text: 'text-indigo-700 dark:text-indigo-300', card: 'border-indigo-200/60 bg-indigo-500/10 dark:border-indigo-500/20', cardHover: 'hover:border-indigo-300/80 dark:hover:border-indigo-400/40' },
  { bar: 'bg-teal-500/70', barHover: 'hover:bg-teal-500/90', text: 'text-teal-700 dark:text-teal-300', card: 'border-teal-200/60 bg-teal-500/10 dark:border-teal-500/20', cardHover: 'hover:border-teal-300/80 dark:hover:border-teal-400/40' },
  { bar: 'bg-orange-500/70', barHover: 'hover:bg-orange-500/90', text: 'text-orange-700 dark:text-orange-300', card: 'border-orange-200/60 bg-orange-500/10 dark:border-orange-500/20', cardHover: 'hover:border-orange-300/80 dark:hover:border-orange-400/40' }
];

export const chartPaletteAt = (idx: number): ChartPaletteEntry => CHART_PALETTE[idx % CHART_PALETTE.length];
