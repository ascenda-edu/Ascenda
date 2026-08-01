import { type ReactNode, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
    CalendarDays,
    Clock,
    GraduationCap,
    Languages,
    LayoutGrid,
    MapPin,
    ScrollText,
    Sparkles,
    Target,
    Wallet,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgramSearchResult } from './types';
import { cn } from '@/lib/utils';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';

type MetricRow = {
    id: string;
    label: string;
    icon: typeof MapPin;
    hint?: string;
    valueForCompare: (uni: ProgramSearchResult) => string | number | null | undefined;
    render: (uni: ProgramSearchResult) => ReactNode;
    numeric?: (uni: ProgramSearchResult) => number | null | undefined;
    direction?: 'higher' | 'lower';
};

interface ComparisonModalProps {
    isOpen: boolean;
    onClose: () => void;
    universities: ProgramSearchResult[];
    onRemove: (id: string) => void;
    maxItems?: number;
}

const formatScore = (score?: number | null) => (typeof score === 'number' ? `${Math.round(score)}%` : 'N/A');

const formatPercentage = (value?: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    const normalized = value > 1 ? value : value * 100;
    return `${Math.round(normalized)}%`;
};

const formatCurrencyRange = (value?: { low?: number | null; high?: number | null; fallback?: number | null; currency?: string | null }) => {
    if (!value) return 'N/A';
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: value.currency ?? 'USD',
        maximumFractionDigits: 0
    });
    if (value.low !== null && value.low !== undefined && value.high !== null && value.high !== undefined) {
        return `${formatter.format(value.low)} – ${formatter.format(value.high)}`;
    }
    if (value.fallback !== null && value.fallback !== undefined) {
        return formatter.format(value.fallback);
    }
    return 'N/A';
};

const formatPlain = (value?: string | null) => (value && value.trim().length > 0 ? value : 'N/A');

export function ComparisonModal({ isOpen, onClose, universities, onRemove, maxItems = 5 }: ComparisonModalProps) {
    const [highlightDiffs, setHighlightDiffs] = useState(true);

    // Memoized: this array feeds a useMemo below — rebuilding it per render
    // invalidated that memo every time (react-hooks/exhaustive-deps warning).
    const metricRows: MetricRow[] = useMemo(() => [
        {
            id: 'fitScore',
            label: 'Fit score',
            icon: Target,
            hint: 'How well this program maps to your signals.',
            valueForCompare: (uni) => formatScore(uni.fitScore),
            render: (uni) => {
                const { value, badgeClass } = getFitScoreVisuals(uni.fitScore);
                return (
                    <div className="flex items-center gap-2">
                        <span className={cn('inline-flex h-9 min-w-[3rem] items-center justify-center rounded-xl px-2 text-sm font-bold tabular-nums ring-1', badgeClass)}>
                            {value !== null ? `${value}%` : 'N/A'}
                        </span>
                        {uni.tier ? (
                            <span className="eyebrow">{uni.tier}</span>
                        ) : null}
                    </div>
                );
            },
            numeric: (uni) => uni.fitScore,
            direction: 'higher'
        },
        {
            id: 'acceptanceRate',
            label: 'Acceptance rate',
            icon: Sparkles,
            hint: 'Lower means more competitive.',
            valueForCompare: (uni) => formatPercentage(uni.acceptanceRate),
            render: (uni) => <span className="text-sm font-semibold tabular-nums text-foreground">{formatPercentage(uni.acceptanceRate)}</span>,
            numeric: (uni) => uni.acceptanceRate,
            direction: 'lower'
        },
        {
            id: 'tuition',
            label: 'Tuition (annual)',
            icon: Wallet,
            hint: 'International rate. Housing not included.',
            valueForCompare: (uni) =>
                formatCurrencyRange({
                    low: uni.intlTuitionLow,
                    high: uni.intlTuitionHigh,
                    fallback: uni.tuition,
                    currency: uni.currency
                }),
            render: (uni) => (
                <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrencyRange({
                        low: uni.intlTuitionLow,
                        high: uni.intlTuitionHigh,
                        fallback: uni.tuition,
                        currency: uni.currency
                    })}
                </span>
            ),
            numeric: (uni) => uni.intlTuitionLow ?? uni.tuition ?? null,
            direction: 'lower'
        },
        {
            id: 'duration',
            label: 'Duration',
            icon: Clock,
            valueForCompare: (uni) => uni.duration ?? (uni.durationYears ? `${uni.durationYears} years` : 'N/A'),
            render: (uni) => (
                <span className="text-sm text-foreground">
                    {uni.duration ?? (uni.durationYears ? `${uni.durationYears} years` : 'N/A')}
                </span>
            ),
            numeric: (uni) => uni.durationYears ?? null,
            direction: 'lower'
        },
        {
            id: 'startMonth',
            label: 'Intake',
            icon: CalendarDays,
            valueForCompare: (uni) => uni.startMonth,
            render: (uni) => <span className="text-sm text-foreground">{formatPlain(uni.startMonth)}</span>
        },
        {
            id: 'studyLevel',
            label: 'Study level',
            icon: GraduationCap,
            valueForCompare: (uni) => uni.studyLevel,
            render: (uni) => <span className="text-sm text-foreground">{formatPlain(uni.studyLevel)}</span>
        },
        {
            id: 'location',
            label: 'Location',
            icon: MapPin,
            valueForCompare: (uni) => uni.location,
            render: (uni) => <span className="text-sm text-foreground">{uni.location}</span>
        },
        {
            id: 'language',
            label: 'Language',
            icon: Languages,
            valueForCompare: (uni) => uni.language,
            render: (uni) => <span className="text-sm text-foreground">{formatPlain(uni.language)}</span>
        },
        {
            id: 'ucasCode',
            label: 'UCAS code',
            icon: ScrollText,
            valueForCompare: (uni) => uni.ucasCode,
            render: (uni) => <span className="text-sm font-mono text-foreground">{formatPlain(uni.ucasCode)}</span>
        }
    ], []);

    const isEmpty = universities.length === 0;
    const isMultiple = universities.length > 1;

    const metricStats = useMemo(() => {
        return metricRows.reduce<Record<string, { min: number; max: number }>>((acc, row) => {
            if (!row.numeric) return acc;
            const values = universities.map((u) => row.numeric?.(u)).filter((v): v is number => typeof v === 'number');
            if (values.length === 0) return acc;
            acc[row.id] = { min: Math.min(...values), max: Math.max(...values) };
            return acc;
        }, {});
    }, [metricRows, universities]);

    const isRowIdentical = (row: MetricRow) => {
        if (!isMultiple) return false;
        const values = universities.map((uni) => row.valueForCompare(uni));
        return values.every((val) => val === values[0]);
    };

    const isBestCell = (row: MetricRow, uni: ProgramSearchResult) => {
        if (!highlightDiffs || !isMultiple || !row.numeric) return false;
        const stats = metricStats[row.id];
        if (!stats || stats.min === stats.max) return false;
        const value = row.numeric(uni);
        if (typeof value !== 'number') return false;
        return row.direction === 'lower' ? value === stats.min : value === stats.max;
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl overflow-hidden p-0 sm:rounded-4xl">
                <div className="flex h-[85vh] flex-col bg-background">
                    {/* Header */}
                    <div className="relative border-b border-border/60 bg-card/80 px-6 py-5 backdrop-blur-xl">
                        <span
                            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                            aria-hidden
                        />
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <DialogTitle className="font-heading text-2xl font-bold tracking-tight">
                                    Compare programs
                                </DialogTitle>
                                <p className="text-sm text-muted-foreground">
                                    {isEmpty
                                        ? 'Select up to ' + maxItems + ' programs from results to see them side by side.'
                                        : isMultiple
                                            ? `${universities.length} programs side by side` + (universities.length >= maxItems ? ' · remove one to add another' : '')
                                            : 'Add another program to compare.'}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {isMultiple && (
                                    <button
                                        onClick={() => setHighlightDiffs((v) => !v)}
                                        className="flex items-center gap-2.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        role="switch"
                                        aria-checked={highlightDiffs}
                                    >
                                        <span className="eyebrow">Highlight best</span>
                                        <span
                                            className={cn(
                                                'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200',
                                                highlightDiffs ? 'bg-primary' : 'bg-muted'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-e-1 transition-transform duration-200',
                                                    highlightDiffs ? 'translate-x-3' : 'translate-x-0'
                                                )}
                                            />
                                        </span>
                                    </button>
                                )}
                                <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-auto">
                        {isEmpty ? (
                            <div className="flex h-full items-center justify-center p-8">
                                <div className="flex max-w-md flex-col items-center gap-4 rounded-4xl border border-dashed border-border/70 bg-card/60 p-10 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink ring-1 ring-primary/20">
                                        <LayoutGrid className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-heading text-lg font-semibold text-foreground">No programs selected</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Choose up to {maxItems} programs from search results, then open Compare.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto px-6 py-6">
                                <div
                                    className="grid gap-4"
                                    style={{
                                        gridTemplateColumns: `minmax(180px, 200px) repeat(${universities.length}, minmax(280px, 1fr))`
                                    }}
                                >
                                    {/* Spacer + program cards */}
                                    <div aria-hidden />
                                    {universities.map((uni) => (
                                        <ProgramHeaderCard
                                            key={`head-${uni.id}`}
                                            uni={uni}
                                            onRemove={() => onRemove(uni.id)}
                                        />
                                    ))}

                                    {/* Metric rows */}
                                    {metricRows.map((row) => {
                                        const identical = isRowIdentical(row);
                                        const Icon = row.icon;
                                        return (
                                            <div key={`row-${row.id}`} style={{ display: 'contents' }}>
                                                <div
                                                    className={cn(
                                                        'flex flex-col justify-center gap-0.5 px-2 py-3',
                                                        identical && 'opacity-50'
                                                    )}
                                                >
                                                    <div className="eyebrow flex items-center gap-2">
                                                        <Icon className="h-3.5 w-3.5" />
                                                        {row.label}
                                                    </div>
                                                    {row.hint && (
                                                        <span className="pl-5 text-label font-normal text-muted-foreground/70">
                                                            {row.hint}
                                                        </span>
                                                    )}
                                                </div>
                                                {universities.map((uni) => {
                                                    const isBest = isBestCell(row, uni);
                                                    return (
                                                        <div
                                                            key={`${uni.id}-${row.id}`}
                                                            className={cn(
                                                                'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors',
                                                                isBest
                                                                    ? 'border-success/25 bg-success-subtle'
                                                                    : 'border-border/60 bg-card/60',
                                                                identical && !isBest && 'opacity-60'
                                                            )}
                                                        >
                                                            <div className="min-w-0 flex-1">{row.render(uni)}</div>
                                                            {isBest && (
                                                                <span className="shrink-0 rounded-full bg-success-subtle px-2 py-0.5 text-label font-bold uppercase tracking-wider text-success">
                                                                    Best
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}

                                    {/* Highlights row — full-width chip cluster per column */}
                                    <div className="eyebrow flex items-start gap-2 px-2 py-3">
                                        <Sparkles className="mt-0.5 h-3.5 w-3.5" />
                                        Highlights
                                    </div>
                                    {universities.map((uni) => (
                                        <div
                                            key={`highlights-${uni.id}`}
                                            className="rounded-2xl border border-border/60 bg-card/60 p-3"
                                        >
                                            {uni.highlights.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {uni.highlights.slice(0, 4).map((h) => (
                                                        <span
                                                            key={h}
                                                            className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-0.5 text-label font-medium text-foreground/80"
                                                        >
                                                            {h}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-sm text-muted-foreground">No highlights</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {!isEmpty && (
                        <div className="border-t border-border/60 bg-card/80 px-6 py-4 backdrop-blur-xl">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-muted-foreground">
                                    Open a course page to dig into requirements and outcomes.
                                </p>
                                <Button size="sm" onClick={onClose} className="rounded-full">
                                    Close & continue browsing
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ProgramHeaderCard({ uni, onRemove }: { uni: ProgramSearchResult; onRemove: () => void }) {
    const { value: scoreValue, badgeClass } = getFitScoreVisuals(uni.fitScore);
    return (
        <article className="group relative flex flex-col overflow-hidden rounded-4xl border border-border bg-card/80 p-5 shadow-e-1 backdrop-blur-xl hover-lift dark:bg-muted/20 dark:border-white/10 dark:shadow-none">
            <span
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_32%)] opacity-80"
                aria-hidden
            />
            <span
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                aria-hidden
            />
            <button
                onClick={onRemove}
                className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground opacity-0 backdrop-blur-sm transition-[opacity,color,background-color,border-color] hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:opacity-100"
                aria-label={`Remove ${uni.universityName}`}
            >
                <X className="h-3.5 w-3.5" />
            </button>

            <div className="relative z-10 flex items-start justify-between gap-3">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl border border-white/50 shadow-e-2 ring-4', badgeClass)}>
                    <span className="text-sm font-bold">{scoreValue !== null ? `${scoreValue}%` : 'N/A'}</span>
                </div>
                <div className="text-right">
                    <p className="eyebrow">{uni.location}</p>
                    {uni.tier ? (
                        <p className="mt-1 text-xs font-semibold text-foreground/80">{uni.tier} tier</p>
                    ) : null}
                </div>
            </div>

            <div className="relative z-10 mt-4 flex items-center gap-3">
                {uni.logoUrl ? (
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-border bg-black shadow-e-1">
                        <Image
                            src={uni.logoUrl}
                            alt={`${uni.universityName} logo`}
                            fill
                            className="object-contain"
                            sizes="44px"
                        />
                    </div>
                ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-base font-bold text-muted-foreground ring-1 ring-border">
                        {uni.universityName.charAt(0)}
                    </div>
                )}
                <div className="min-w-0">
                    <h3 className="font-heading text-base font-bold leading-tight text-foreground line-clamp-2" title={uni.universityName}>
                        {uni.universityName}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground line-clamp-2" title={uni.programName}>
                        {uni.programName}
                    </p>
                </div>
            </div>

            <div className="relative z-10 mt-4">
                <Button asChild size="sm" variant="secondary" className="w-full rounded-full">
                    <Link href={`/course/${uni.id}`}>Open course page</Link>
                </Button>
            </div>
        </article>
    );
}
