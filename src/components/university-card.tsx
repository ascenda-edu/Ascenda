'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchTier } from '@/lib/matching/match-tier';
import { TrackProgramButton, type TrackLabelVariant } from '@/components/programs/track-program-button';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';
import { countryFlagEmoji } from '@/lib/utils/flag';

// Define a unified interface that covers both PlaceholderResult and EnrichedMatch
export interface UniversityCardProps {
    id: string;
    name: string;
    program: string;
    location: string;
    logoUrl?: string | null;
    fitScore?: number | null;
    tier?: MatchTier | null;
    reasons?: string[];
    highlights?: string[];
    actions?: React.ReactNode;
    variant?: 'default' | 'compact';
    trackingLabelVariant?: TrackLabelVariant;
    hideTrackingButton?: boolean;
    // Pre-normalized display strings supplied by the search page (never raw
    // duration/level/tuition). Optional so matches/shortlist callers stay valid.
    tuitionLabel?: string | null;
    durationLabel?: string | null;
    levelLabel?: string | null;
    country?: string | null;
}

const RING_STROKE: Record<string, string> = {
    strong: 'stroke-success',
    solid: 'stroke-warning',
    risk: 'stroke-danger',
    unknown: 'stroke-muted-foreground/40',
};

const RING_TEXT: Record<string, string> = {
    strong: 'text-success',
    solid: 'text-warning',
    risk: 'text-danger',
    unknown: 'text-muted-foreground',
};

// Fit score as a small donut gauge — reads at a glance where the old text chip
// disappeared into the surrounding copy. Tone hues match the fit-chip palette.
function FitRing({ value, tone, size = 40 }: { value: number; tone: string; size?: number }) {
    return (
        <div
            className="relative shrink-0"
            style={{ width: size, height: size }}
            role="img"
            aria-label={`Fit score ${value}%`}
            title={`Fit score ${value}%`}
        >
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-border/70" />
                <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={`${value} 100`}
                    className={RING_STROKE[tone] ?? RING_STROKE.unknown}
                />
            </svg>
            <span
                className={cn(
                    'absolute inset-0 flex items-center justify-center text-label font-semibold tabular-nums',
                    RING_TEXT[tone] ?? RING_TEXT.unknown
                )}
            >
                {value}
            </span>
        </div>
    );
}

// Tinted monogram tile for universities without a logo, so no card is ever a
// bare text stack. Tone is a stable hash of the name; hues from the app's
// status palette.
const MONOGRAM_TONES = [
    'bg-info-subtle text-info',
    'bg-feature-subtle text-feature',
    'bg-success-subtle text-success',
    'bg-warning-subtle text-warning',
    'bg-danger-subtle text-danger',
];

const MONOGRAM_STOP_WORDS = new Set(['of', 'the', 'and', 'for', 'at', 'de', 'la']);

const monogramFor = (name: string): string => {
    const words = name.split(/\s+/).filter((w) => w && !MONOGRAM_STOP_WORDS.has(w.toLowerCase()));
    const initials = words
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('');
    return initials || 'U';
};

const monogramToneFor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return MONOGRAM_TONES[hash % MONOGRAM_TONES.length];
};

function Stat({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="min-w-0">
            <dt className="eyebrow">{label}</dt>
            <dd
                className="mt-0.5 truncate text-xs font-semibold tabular-nums text-foreground"
                title={value ?? undefined}
            >
                {value ?? '—'}
            </dd>
        </div>
    );
}

export function UniversityCard({
    id,
    name,
    program,
    location,
    logoUrl,
    fitScore,
    reasons = [],
    highlights = [],
    actions,
    variant = 'default',
    trackingLabelVariant = 'shortlist',
    hideTrackingButton = false,
    tuitionLabel,
    durationLabel,
    levelLabel,
    country,
}: UniversityCardProps) {
    const { value: scoreValue, tone } = getFitScoreVisuals(fitScore);
    const courseHref = id ? `/course/${encodeURIComponent(id)}?from=search` : null;
    const isCompact = variant === 'compact';

    // The default (search) card has no per-card button — the whole card is the
    // link. Callers that pass `actions` (matches / shortlist) keep their own
    // buttons, so the card is NOT a stretched-link there.
    const isLinkCard = !actions && Boolean(courseHref);

    const metaLocation = location || country || '';
    const metaText = [tuitionLabel, durationLabel, levelLabel].filter(Boolean).join(' · ');
    // Flag from the explicit country when supplied; otherwise the location's
    // last comma-segment is the country by construction ("City, Region, Country").
    const flag = countryFlagEmoji(country ?? metaLocation.split(',').pop()?.trim() ?? null);

    const logoTile = (size: 'default' | 'sm') => {
        const sizeClass = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11';
        return logoUrl ? (
            <div
                className={cn(
                    sizeClass,
                    'relative shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-e-1 dark:border-white/10'
                )}
            >
                <Image src={logoUrl} alt={`${name} logo`} fill className="object-contain p-1" sizes="44px" />
            </div>
        ) : (
            <div
                aria-hidden
                className={cn(
                    sizeClass,
                    'flex shrink-0 items-center justify-center rounded-xl font-heading text-sm font-semibold',
                    monogramToneFor(name)
                )}
            >
                {monogramFor(name)}
            </div>
        );
    };

    const fitRing = (size: number) =>
        scoreValue !== null ? <FitRing value={scoreValue} tone={tone} size={size} /> : null;

    const ghostBookmark = !hideTrackingButton ? (
        <TrackProgramButton
            programId={id}
            programName={program}
            universityName={name}
            location={location}
            fitScore={fitScore ?? null}
            labelVariant={trackingLabelVariant}
            variant="ghost"
            className="h-8 w-8 text-muted-foreground shadow-none hover:translate-y-0 hover:text-primary-ink hover:shadow-none"
            iconOnly
        />
    ) : null;

    // Programme is the heading AND the stretched link (its `after:` overlay
    // covers the card) — the card navigates to the programme page, so the
    // programme carries the affordance. On the actions path it stays plain text.
    const programEl =
        isLinkCard && courseHref ? (
            <Link
                href={courseHref}
                prefetch={false}
                title={program}
                className="focus-visible:outline-none after:absolute after:inset-0"
            >
                {program}
            </Link>
        ) : (
            program
        );

    const locationLine = metaLocation ? (
        <span className="flex min-w-0 items-center gap-1.5">
            {flag ? (
                <span aria-hidden className="text-sm leading-none">
                    {flag}
                </span>
            ) : null}
            <span className="truncate" title={metaLocation}>
                {metaLocation}
            </span>
        </span>
    ) : null;

    if (isCompact) {
        return (
            <article className="group relative flex h-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-e-1 transition-[box-shadow,border-color] duration-200 focus-within:ring-2 focus-within:ring-ring hover:border-primary/30 hover:shadow-e-2 dark:border-white/10">
                {logoTile('sm')}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                        <h3
                            className="min-w-0 flex-1 truncate font-heading text-sm font-semibold text-foreground"
                            title={program}
                        >
                            {programEl}
                        </h3>
                        <div className="relative z-10 flex shrink-0 items-center gap-1">
                            {fitRing(32)}
                            {!actions ? ghostBookmark : null}
                        </div>
                    </div>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate font-medium text-foreground/75" title={name}>
                            {name}
                        </span>
                        {locationLine ? (
                            <>
                                <span aria-hidden>·</span>
                                {locationLine}
                            </>
                        ) : null}
                    </p>
                    {metaText ? (
                        <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground" title={metaText}>
                            {metaText}
                        </p>
                    ) : null}
                </div>
                {actions ? <div className="relative z-10 shrink-0">{actions}</div> : null}
            </article>
        );
    }

    const hasStats = Boolean(tuitionLabel || durationLabel || levelLabel);

    return (
        <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-e-1 transition-[box-shadow,border-color] duration-200 focus-within:ring-2 focus-within:ring-ring hover:border-primary/30 hover:shadow-e-2 dark:border-white/10">
            {/* Visual anchors: logo/monogram left, fit ring + bookmark right */}
            <div className="flex items-start justify-between gap-3">
                {logoTile('default')}
                <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                    {fitRing(40)}
                    {!actions ? ghostBookmark : null}
                </div>
            </div>

            {/* Programme-first identity */}
            <h3
                className="mt-3 line-clamp-2 font-heading text-base font-semibold leading-snug text-foreground"
                title={program}
            >
                {programEl}
            </h3>
            <p className="mt-1 line-clamp-1 text-sm font-medium text-foreground/75" title={name}>
                {name}
            </p>
            {locationLine ? (
                <p className="mt-1 flex items-center text-xs text-muted-foreground">{locationLine}</p>
            ) : null}

            {/* Highlights (matches / shortlist path) */}
            {highlights.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {highlights.slice(0, 3).map((highlight) => (
                        <span
                            key={highlight}
                            className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-label font-medium text-foreground/80 dark:bg-muted/30"
                        >
                            {highlight}
                        </span>
                    ))}
                    {highlights.length > 3 && (
                        <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-label font-medium text-muted-foreground dark:bg-muted/30">
                            +{highlights.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* Eligibility reasons (matches path) — icon rows, not boxes */}
            {reasons.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {reasons.map((reason, idx) => {
                        const isBlocking = reason.includes('below requirement') || reason.includes('missing');
                        return (
                            <li key={idx} className="flex items-start gap-1.5 text-label leading-snug">
                                {isBlocking ? (
                                    <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-danger" aria-hidden />
                                ) : (
                                    <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-success" aria-hidden />
                                )}
                                <span className={isBlocking ? 'text-danger' : 'text-success'}>
                                    {reason}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Footer, pinned to the bottom: labelled stat strip (scannable
                columns instead of a dot-separated text run) + caller actions. */}
            {hasStats || actions ? (
                <div className="mt-auto flex flex-col gap-4 pt-4">
                    {hasStats ? (
                        <dl className="grid grid-cols-[auto_auto_auto] justify-between gap-x-5 border-t border-border/60 pt-3">
                            <Stat label="Tuition" value={tuitionLabel} />
                            <Stat label="Length" value={durationLabel} />
                            <Stat label="Level" value={levelLabel} />
                        </dl>
                    ) : null}
                    {actions ? <div className="relative z-10">{actions}</div> : null}
                </div>
            ) : null}
        </article>
    );
}
