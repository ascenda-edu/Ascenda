'use client';

import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { CalendarDays, LayoutGrid, SlidersHorizontal, Target, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchCard, monogramToneFor, ProgressRing } from './product-widgets';
import {
    ChanceMeter,
    chanceTierFor,
    FactorBars,
    HeatmapGrid,
    IB_MAX,
    IB_MIN,
    MiniCalendar,
    SpotlightPanel,
    TierTiles,
    ringToneClass,
} from './mock-viz';

/**
 * The hero's rotating app tour: one glass panel, four tabs, each a faithful
 * mini-recreation of a real data visualization from the product (matches
 * breakdown, chances calculator, deadline calendar, requirements checker).
 * Auto-advances every 6s; any interaction (tab click, arrow keys, slider) pins
 * the current tab for the session. Rotation pauses while hovered, focused,
 * offscreen, or in a hidden browser tab, and never runs under reduced motion —
 * same convention as RotatingHeadlineWord.
 */

const ROTATE_MS = 6000;

interface TourTab {
    id: string;
    label: string;
    route: string;
    icon: LucideIcon;
    Panel: ComponentType<{ onInteract: () => void }>;
}

/* ------------------------------- Tab 1: Matches ------------------------------ */

function MatchesPanel() {
    return (
        <div className="flex flex-col gap-2.5">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Top match</p>
            <MatchCard
                name="TU Delft"
                sub="MSc Aerospace Engineering"
                location="Delft, Netherlands"
                tier="Safe"
                score={92}
                meta="€18,750/yr · 2 yrs · Master's"
            />
            <FactorBars
                factors={[
                    { label: 'Eligibility', value: 100 },
                    { label: 'Academic fit', value: 88 },
                    { label: 'Preferences', value: 91 },
                    { label: 'Outcomes', value: 84 },
                ]}
            />
            <div className="flex items-center gap-4 px-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <ProgressRing value={85} size={26} stroke={3} colorClass={ringToneClass(85)} label="85% fit at Imperial" />
                    Imperial
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <ProgressRing value={71} size={26} stroke={3} colorClass={ringToneClass(71)} label="71% fit at ETH Zürich" />
                    ETH Zürich
                </span>
                <span className="ml-auto tabular-nums">18 matches ranked for you</span>
            </div>
        </div>
    );
}

/* ------------------------------- Tab 2: Chances ------------------------------ */

const CHANCE_PROGRAMMES = [
    { name: 'TU Delft', monogram: 'TD', sub: 'MSc Aerospace', minScore: 36 },
    { name: 'Imperial', monogram: 'IC', sub: 'MEng Aeronautics', minScore: 39 },
    { name: 'ETH Zürich', monogram: 'EZ', sub: 'MSc Mechanical', minScore: 41 },
] as const;

function ChancesPanel({ onInteract }: { onInteract: () => void }) {
    const [score, setScore] = useState(38);
    const pct = ((score - IB_MIN) / (IB_MAX - IB_MIN)) * 100;

    const counts = { safety: 0, match: 0, reach: 0 };
    for (const p of CHANCE_PROGRAMMES) counts[chanceTierFor(score, p.minScore)]++;

    return (
        <div className="flex flex-col gap-2">
            <div className="rounded-xl border border-border bg-card p-3 dark:border-white/10">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                    <label htmlFor="hero-ib-slider" className="text-[0.8125rem] font-semibold text-foreground">
                        What if I score…
                    </label>
                    <p className="font-heading text-xl font-bold leading-none text-primary tabular-nums">
                        {score} <span className="text-[0.625rem] font-semibold text-muted-foreground">IB pts</span>
                    </p>
                </div>
                <input
                    id="hero-ib-slider"
                    type="range"
                    min={IB_MIN}
                    max={IB_MAX}
                    step={1}
                    value={score}
                    onChange={(e) => {
                        setScore(Number(e.target.value));
                        onInteract();
                    }}
                    className={cn(
                        'h-1.5 w-full cursor-pointer appearance-none rounded-full',
                        '[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
                        '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-card [&::-moz-range-thumb]:shadow-md',
                    )}
                    style={{
                        // The unfilled half is muted-foreground at 25%, not --muted: on dark
                        // --muted is ~4% lightness, i.e. invisible against the card behind it,
                        // so the track looked like it simply ended at the thumb.
                        background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--muted-foreground) / 0.25) ${pct}%)`,
                    }}
                />
                <div className="mt-1 flex justify-between text-[0.625rem] tabular-nums text-muted-foreground" aria-hidden>
                    <span>{IB_MIN}</span>
                    <span>32</span>
                    <span>38</span>
                    <span>{IB_MAX}</span>
                </div>
            </div>
            <div aria-live="polite">
                <TierTiles counts={counts} />
            </div>
            {CHANCE_PROGRAMMES.map((p) => (
                <ChanceMeter
                    key={p.name}
                    monogram={p.monogram}
                    monogramClass={monogramToneFor(p.name)}
                    name={p.name}
                    sub={p.sub}
                    minScore={p.minScore}
                    score={score}
                />
            ))}
        </div>
    );
}

/* ------------------------------ Tab 3: Deadlines ------------------------------ */

function DeadlinesPanel() {
    return (
        <div className="flex flex-col gap-2.5">
            <MiniCalendar
                month="October"
                startPad={3}
                daysInMonth={31}
                today={6}
                chips={{
                    9: [{ tone: 'rose', label: 'Essay' }],
                    13: [{ tone: 'amber', label: 'UCAS' }],
                    16: [
                        { tone: 'sky', label: 'Docs' },
                        { tone: 'more', label: '+2' },
                    ],
                    27: [{ tone: 'amber', label: 'ETH app' }],
                }}
                legend={[
                    { tone: 'rose', label: 'Essays' },
                    { tone: 'amber', label: 'Applications' },
                    { tone: 'sky', label: 'Documents' },
                ]}
            />
            <div className="flex items-center gap-3 rounded-xl border border-l-[3px] border-border border-l-rose-500 bg-card p-3 dark:border-white/10 dark:border-l-rose-500">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-foreground">Scholarship essay — final draft</p>
                    <p className="truncate text-xs text-muted-foreground">Imperial College London</p>
                </div>
                <span className="shrink-0 rounded-full bg-rose-500/10 px-2.5 py-1 text-[0.6875rem] font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    Due Friday · 3d
                </span>
            </div>
        </div>
    );
}

/* ---------------------------- Tab 4: Requirements ---------------------------- */

function RequirementsPanel() {
    return (
        <div className="grid gap-2.5 sm:grid-cols-[auto_1fr]">
            <div className="flex min-w-[128px] flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-card p-3.5 dark:border-white/10">
                <ProgressRing value={78} size={76} stroke={7} colorClass="stroke-emerald-500" label="78% ready to apply" />
                <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Ready to apply</p>
                <div className="w-full space-y-2">
                    {[
                        { label: 'Documents', done: 3, total: 4, colorClass: 'bg-sky-500' },
                        { label: 'Essays', done: 1, total: 2, colorClass: 'bg-amber-500' },
                    ].map((bar) => (
                        <div key={bar.label}>
                            <div className="mb-0.5 flex justify-between text-[0.625rem] tabular-nums text-muted-foreground">
                                <span>{bar.label}</span>
                                <span>
                                    {bar.done}/{bar.total}
                                </span>
                            </div>
                            {/* dark:bg-white/10 — same as the mock-viz meters: a --muted
                                track on bg-card is ~4% lightness apart in dark. */}
                            <div className="h-1 overflow-hidden rounded-full bg-muted dark:bg-white/10">
                                <span
                                    className={cn('block h-full rounded-full', bar.colorClass)}
                                    style={{ width: `${(bar.done / bar.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <HeatmapGrid
                columns={['Subjects', 'Exams', 'Docs', 'Essays']}
                rows={[
                    { label: '🇳🇱 TU Delft', cells: ['ok', 'ok', 'ok', 'wip'] },
                    { label: '🇬🇧 Imperial', cells: ['ok', 'wip', 'ok', 'warn'] },
                    { label: '🇨🇭 ETH Zürich', cells: ['ok', 'ok', 'wip', 'warn'] },
                ]}
            />
        </div>
    );
}

/* --------------------------------- The tour ---------------------------------- */

const TOUR_TABS: TourTab[] = [
    { id: 'matches', label: 'Matches', route: '/matches', icon: Target, Panel: MatchesPanel },
    { id: 'chances', label: 'Chances', route: '/toolbox#chances', icon: SlidersHorizontal, Panel: ChancesPanel },
    { id: 'deadlines', label: 'Deadlines', route: '/toolbox#deadlines', icon: CalendarDays, Panel: DeadlinesPanel },
    { id: 'requirements', label: 'Requirements', route: '/toolbox#requirements', icon: LayoutGrid, Panel: RequirementsPanel },
];

export function HeroAppTour({ className }: { className?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    // No `once` — rotation must pause offscreen and resume when scrolled back.
    const inViewNow = useInView(containerRef, { amount: 0.4 });
    const shouldReduceMotion = useReducedMotion();

    const [active, setActive] = useState(0);
    const [pinned, setPinned] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    // Progress hairline restarts per activation; keyed by a counter so the same
    // tab re-triggers its CSS animation after a full rotation cycle.
    const [cycle, setCycle] = useState(0);
    // useReducedMotion() resolves the real preference on the FIRST client render
    // while the server rendered it as false, so it must never feed anything that
    // reaches the DOM (text, style props) without a mount gate. `paused` is the
    // one exempt consumer: !inViewNow already makes it true on both sides.
    const paused = pinned || hovered || focused || !inViewNow || !!shouldReduceMotion;

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            setActive((i) => (i + 1) % TOUR_TABS.length);
            setCycle((c) => c + 1);
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [paused]);

    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
    // null until the first measurement lands. Nothing depends on it for *layout*
    // correctness — only the active panel is in flow, so `height: auto` is already
    // the right height at SSR and on the first paint. The measured px value exists
    // solely so the height can TRANSITION: CSS cannot interpolate from `auto`.
    const [stackHeight, setStackHeight] = useState<number | null>(null);

    // The stack's height tracks the ACTIVE panel only. ResizeObserver rather than
    // a one-shot measure because content changes size *within* a tab too: dragging
    // the chances slider re-tiers programmes and reflows the rows.
    // offsetHeight, not getBoundingClientRect(): the incoming panel is still at
    // scale-[0.985] on the frame we measure (its transform transition has only just
    // started), and a transformed rect would read ~1.5% short — and ResizeObserver
    // never fires again for a transform, so that error would stick.
    useEffect(() => {
        const el = panelRefs.current[active];
        if (!el) return;
        const measure = () => setStackHeight(el.offsetHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [active]);

    const pin = (index?: number) => {
        if (index !== undefined) setActive(index);
        setPinned(true);
    };

    const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
        let next: number | null = null;
        if (e.key === 'ArrowRight') next = (index + 1) % TOUR_TABS.length;
        if (e.key === 'ArrowLeft') next = (index - 1 + TOUR_TABS.length) % TOUR_TABS.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = TOUR_TABS.length - 1;
        if (next !== null) {
            e.preventDefault();
            pin(next);
            tabRefs.current[next]?.focus();
        }
    };

    return (
        <SpotlightPanel className={className}>
            <div
                ref={containerRef}
                className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-3 text-card-foreground shadow-xl backdrop-blur-xl sm:p-5"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocusCapture={() => setFocused(true)}
                onBlurCapture={() => setFocused(false)}
            >
                {/* Ambient blobs matching the real dashboard */}
                <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl" aria-hidden />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary/3 blur-2xl" aria-hidden />

                {/* Browser chrome */}
                <div className="relative mb-3 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-400/70" aria-hidden />
                    <span className="h-2 w-2 rounded-full bg-amber-400/70" aria-hidden />
                    <span className="h-2 w-2 rounded-full bg-emerald-400/70" aria-hidden />
                    <span className="ml-1 min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-muted/40 px-3 py-1 text-center font-mono text-[0.6875rem] text-muted-foreground">
                        ascendaedu.com{TOUR_TABS[active].route}
                    </span>
                </div>

                {/* Tab pills */}
                <div
                    role="tablist"
                    aria-label="Ascenda app tour"
                    className="relative mb-3.5 flex gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {TOUR_TABS.map((tab, i) => {
                        const selected = i === active;
                        return (
                            <button
                                key={tab.id}
                                ref={(el) => {
                                    tabRefs.current[i] = el;
                                }}
                                type="button"
                                role="tab"
                                id={`tour-tab-${tab.id}`}
                                aria-selected={selected}
                                aria-controls={`tour-panel-${tab.id}`}
                                tabIndex={selected ? 0 : -1}
                                onClick={() => pin(i)}
                                onKeyDown={(e) => onTabKeyDown(e, i)}
                                className={cn(
                                    'relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                                    selected
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                                )}
                            >
                                <tab.icon className="h-3.5 w-3.5" aria-hidden />
                                {tab.label}
                                {/* Countdown hairline to the next auto-advance */}
                                {/* CSS keyframe, not framer: a 100%-duty-cycle JS
                                    animation ran for as long as the hero was visible.
                                    key={cycle} remounts the node, which restarts the
                                    animation — same restart-per-activation as before.
                                    Only mounted while !paused, so reduced-motion users
                                    (paused === true) never see it, exactly as today. */}
                                {selected && !paused && (
                                    <span
                                        key={cycle}
                                        className="absolute inset-x-3 bottom-[3px] h-0.5 origin-left rounded-full bg-primary-foreground/50"
                                        style={{
                                            animation: `grow-x ${ROTATE_MS}ms linear`,
                                            transformOrigin: 'left',
                                        }}
                                        aria-hidden
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* The card is content-fitted per tab and animates between heights.
                    Previously all four panels sat in one grid cell, so the TALLEST tab set
                    the height for all of them — layout never shifted, but the short tabs
                    showed a slab of dead space between their content and the caption. The
                    trade is now inverted: content always fills the card, and the card
                    resizes. Only the ACTIVE panel is in flow (self-start, content-sized),
                    so `height: auto` is already correct at SSR and on the first paint —
                    that's why there's no measured height in the server markup and no snap
                    after hydration. The inactive panels are absolutely stacked into the same
                    col-start-1/row-start-1 grid area (still the fade's overlap; browsers
                    without abspos-grid-area support fall back to the padding box, which is
                    the identical rect for a single full-width column) and contribute no
                    height. Pure CSS transitions (not framer) so the hidden state is in the
                    SSR HTML — no flash of four overlapping panels before hydration.
                    Incoming-only fade: the panel background is translucent, so a true
                    cross-fade would show both panels' text mid-transition. overflow-hidden
                    is what stops the outgoing (taller) panel bleeding over the caption
                    while the height shrinks — every focusable control sits well inside a
                    padded card, so no focus ring lands on the clipped edge. */}
                {/* minmax(0,1fr): an implicit `auto` track would size to the widest
                    panel's max-content and blow out the hero on narrow viewports. */}
                <div
                    className="relative grid grid-cols-[minmax(0,1fr)] overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
                    style={stackHeight !== null ? { height: stackHeight } : undefined}
                >
                    {TOUR_TABS.map((tab, i) => {
                        const selected = i === active;
                        return (
                            <div
                                key={tab.id}
                                ref={(el) => {
                                    panelRefs.current[i] = el;
                                }}
                                role="tabpanel"
                                id={`tour-panel-${tab.id}`}
                                aria-labelledby={`tour-tab-${tab.id}`}
                                aria-hidden={!selected}
                                className={cn(
                                    'col-start-1 row-start-1 min-w-0 self-start transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
                                    selected
                                        ? 'relative translate-y-0 scale-100 opacity-100'
                                        : 'pointer-events-none invisible absolute inset-x-0 top-0 translate-y-2 scale-[0.985] opacity-0',
                                )}
                            >
                                <tab.Panel onInteract={() => pin()} />
                            </div>
                        );
                    })}
                </div>

                <p className="relative mt-3 text-center text-[0.6875rem] text-muted-foreground">
                    Pinned. Nothing moves without you.
                </p>
            </div>
        </SpotlightPanel>
    );
}
