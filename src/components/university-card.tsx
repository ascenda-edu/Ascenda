'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { MatchTier } from '@/lib/matching/match-tier';
import { TrackProgramButton, type TrackLabelVariant } from '@/components/programs/track-program-button';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';

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

// Soft, quiet fit chip — tone-tinted background + hue-matched text, both with
// dark handling. Replaces the old ring/border badge to match the house style.
const FIT_TONE_CLASS: Record<string, string> = {
    strong: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    solid: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    risk: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    unknown: 'bg-muted text-muted-foreground',
};

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

    const logo = logoUrl ? (
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:border-white/10">
            <Image src={logoUrl} alt={`${name} logo`} fill className="object-contain p-1" sizes="40px" />
        </div>
    ) : null;

    const fitBadge =
        scoreValue !== null ? (
            <span
                className={cn(
                    'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                    FIT_TONE_CLASS[tone] ?? FIT_TONE_CLASS.unknown
                )}
            >
                {scoreValue}%
            </span>
        ) : null;

    const ghostBookmark = !hideTrackingButton ? (
        <TrackProgramButton
            programId={id}
            programName={program}
            universityName={name}
            location={location}
            fitScore={fitScore ?? null}
            labelVariant={trackingLabelVariant}
            variant="ghost"
            className="h-8 w-8 text-muted-foreground shadow-none hover:translate-y-0 hover:text-primary hover:shadow-none"
            iconOnly
        />
    ) : null;

    // Name is the stretched link (its `after:` overlay covers the card) only on
    // the buttonless search path; on the actions path it stays plain text.
    const nameEl =
        isLinkCard && courseHref ? (
            <Link
                href={courseHref}
                prefetch={false}
                title={name}
                className="focus-visible:outline-none after:absolute after:inset-0"
            >
                {name}
            </Link>
        ) : (
            name
        );

    const identity = (
        <div className="flex min-w-0 items-start gap-3">
            {logo}
            <div className="min-w-0">
                <h3
                    className={cn(
                        'font-heading font-semibold text-foreground',
                        isCompact ? 'line-clamp-1 text-sm' : 'line-clamp-2 text-base'
                    )}
                    title={name}
                >
                    {nameEl}
                </h3>
                <p
                    className={cn('text-sm text-muted-foreground', isCompact ? 'line-clamp-1' : 'mt-0.5 line-clamp-2')}
                    title={program}
                >
                    {program}
                </p>
            </div>
        </div>
    );

    // Top-right cluster. Actions path shows the fit badge only (the bookmark is
    // part of the caller's `actions`); link path shows fit badge + ghost bookmark.
    const topRight = actions ? (
        fitBadge
    ) : (
        <div className="relative z-10 flex shrink-0 items-center gap-1">
            {fitBadge}
            {ghostBookmark}
        </div>
    );

    const metaLine = metaText ? (
        <p className="truncate text-xs tabular-nums text-muted-foreground" title={metaText}>
            {metaText}
        </p>
    ) : null;

    if (isCompact) {
        return (
            <article className="group relative flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-[box-shadow,border-color] duration-200 focus-within:ring-2 focus-within:ring-ring hover:border-primary/30 hover:shadow-md dark:border-white/10">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                        {identity}
                        {topRight}
                    </div>
                    {(metaLocation || metaLine) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {metaLocation ? (
                                <span className="truncate" title={metaLocation}>
                                    {metaLocation}
                                </span>
                            ) : null}
                            {metaLocation && metaText ? <span aria-hidden>·</span> : null}
                            {metaLine}
                        </div>
                    )}
                </div>
                {actions ? <div className="relative z-10 shrink-0">{actions}</div> : null}
            </article>
        );
    }

    return (
        <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-[box-shadow,border-color] duration-200 focus-within:ring-2 focus-within:ring-ring hover:border-primary/30 hover:shadow-md dark:border-white/10">
            {/* Identity + top-right cluster */}
            <div className="flex items-start justify-between gap-3">
                {identity}
                {topRight}
            </div>

            {/* Location */}
            {metaLocation ? (
                <p className="mt-2 truncate text-xs text-muted-foreground" title={metaLocation}>
                    {metaLocation}
                </p>
            ) : null}

            {/* Highlights (matches / shortlist path) */}
            {highlights.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {highlights.slice(0, 3).map((highlight) => (
                        <span
                            key={highlight}
                            className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[0.6875rem] font-medium text-foreground/80 dark:bg-muted/30"
                        >
                            {highlight}
                        </span>
                    ))}
                    {highlights.length > 3 && (
                        <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[0.6875rem] font-medium text-muted-foreground dark:bg-muted/30">
                            +{highlights.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* Eligibility reasons (matches path) */}
            {reasons.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                    {reasons.map((reason, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                'rounded-lg border px-2 py-1 text-[0.6875rem]',
                                reason.includes('below requirement') || reason.includes('missing')
                                    ? 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            )}
                        >
                            {reason}
                        </div>
                    ))}
                </div>
            )}

            {/* Footer, pinned to the bottom. The meta line gets the full row —
                the card's link affordance is the cursor + hover border, matching
                the app's other clickable rows (no inline hint). */}
            {actions ? (
                <div className="mt-auto flex flex-col gap-4 pt-4">
                    {metaLine ? <div className="border-t border-border/60 pt-3">{metaLine}</div> : null}
                    {actions}
                </div>
            ) : (
                metaLine && <div className="mt-auto border-t border-border/60 pt-3">{metaLine}</div>
            )}
        </article>
    );
}
