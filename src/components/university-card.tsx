'use client';

import { useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { Clock, Coins, GraduationCap, MapPin } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MatchTier } from '@/lib/matching/match-tier';
import { TrackProgramButton, type TrackLabelVariant } from '@/components/programs/track-program-button';
import { ACTION_TEXT } from '@/lib/constants/text';
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

// A single icon+text stat used in the card's payoff row.
function Stat({
    icon: Icon,
    children,
    numeric = false,
}: {
    icon: typeof Clock;
    children: React.ReactNode;
    numeric?: boolean;
}) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/80">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className={cn('truncate', numeric && 'tabular-nums')}>{children}</span>
        </span>
    );
}

export function UniversityCard({
    id,
    name,
    program,
    location,
    logoUrl,
    fitScore,
    tier,
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
    const prefersReducedMotion = useReducedMotion();
    const cardRef = useRef<HTMLElement>(null);
    const { value: scoreValue, badgeClass: scoreColorClass } = getFitScoreVisuals(fitScore);
    const courseHref = id ? `/course/${encodeURIComponent(id)}?from=search` : null;
    const isCompact = variant === 'compact';

    // Pointer-tracked spotlight — writes CSS custom properties straight to the
    // node (no React state per mousemove). Skipped entirely when the user
    // prefers reduced motion; the overlay itself is hidden on touch via a
    // hover-capable media guard.
    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            const el = cardRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
            el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
        },
        []
    );

    const metaLocation = location || country || '';

    const stats = [
        tuitionLabel ? { key: 'tuition', icon: Coins, label: tuitionLabel, numeric: true } : null,
        durationLabel ? { key: 'duration', icon: Clock, label: durationLabel, numeric: false } : null,
        levelLabel ? { key: 'level', icon: GraduationCap, label: levelLabel, numeric: false } : null,
    ].filter((s): s is { key: string; icon: typeof Clock; label: string; numeric: boolean } => s !== null);

    const logo = logoUrl ? (
        <div
            className={cn(
                'relative shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:border-white/10',
                isCompact ? 'h-10 w-10' : 'h-10 w-10'
            )}
        >
            <Image src={logoUrl} alt={`${name} logo`} fill className="object-contain p-1" sizes="40px" />
        </div>
    ) : null;

    const fitBadge =
        scoreValue !== null ? (
            <span
                className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border border-black/5 px-2.5 py-1 text-xs font-semibold ring-1 ring-inset dark:border-white/10',
                    scoreColorClass
                )}
            >
                <span className="tabular-nums">{scoreValue}%</span>
                <span className="font-medium opacity-80">{tier ? tier.toLowerCase() : 'fit'}</span>
            </span>
        ) : null;

    const identity = (
        <div className="flex min-w-0 items-start gap-3">
            {logo}
            <div className="min-w-0">
                <h3
                    className={cn('font-heading font-semibold text-foreground', isCompact ? 'line-clamp-1 text-sm' : 'line-clamp-2 text-base')}
                    title={name}
                >
                    {name}
                </h3>
                <p
                    className={cn('text-sm text-muted-foreground', isCompact ? 'line-clamp-1' : 'line-clamp-2')}
                    title={program}
                >
                    {program}
                </p>
            </div>
        </div>
    );

    const metaLine = metaLocation ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate" title={metaLocation}>
                {metaLocation}
            </span>
        </div>
    ) : null;

    const statsStrip =
        stats.length > 0 ? (
            <div
                className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-1.5',
                    !isCompact && 'border-t border-border/60 pt-3'
                )}
            >
                {stats.map((s) => (
                    <Stat key={s.key} icon={s.icon} numeric={s.numeric}>
                        {s.label}
                    </Stat>
                ))}
            </div>
        ) : null;

    const actionRow = actions ? (
        actions
    ) : (
        <div className="flex items-center gap-2">
            {courseHref ? (
                <Link
                    href={courseHref}
                    className={cn(
                        buttonVariants({ size: 'sm' }),
                        'flex-1 whitespace-nowrap rounded-full font-semibold shadow-sm'
                    )}
                    prefetch={false}
                >
                    {ACTION_TEXT.viewCourse}
                </Link>
            ) : (
                <Button size="sm" className="flex-1 whitespace-nowrap rounded-full font-semibold shadow-sm" disabled>
                    {ACTION_TEXT.viewCourse}
                </Button>
            )}
            {!hideTrackingButton && (
                <TrackProgramButton
                    programId={id}
                    programName={program}
                    universityName={name}
                    location={location}
                    fitScore={fitScore ?? null}
                    labelVariant={trackingLabelVariant}
                    iconOnly
                />
            )}
        </div>
    );

    const spotlight = (
        <span
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(hover:hover)]:block"
            style={{
                background:
                    'radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 0%), hsl(var(--primary) / 0.06), transparent 70%)',
            }}
        />
    );

    if (isCompact) {
        return (
            <article
                ref={cardRef}
                onPointerMove={prefersReducedMotion ? undefined : handlePointerMove}
                className="group relative flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:hover:border-primary/40"
            >
                {spotlight}
                <div className="relative z-10 min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                        {identity}
                        {fitBadge}
                    </div>
                    {metaLine}
                    {statsStrip}
                </div>
                <div className="relative z-10 shrink-0">{actionRow}</div>
            </article>
        );
    }

    return (
        <article
            ref={cardRef}
            onPointerMove={prefersReducedMotion ? undefined : handlePointerMove}
            className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-md dark:border-white/10 dark:hover:border-primary/40"
        >
            {spotlight}
            <div className="relative z-10 flex h-full flex-col">
                {/* Identity + fit badge */}
                <div className="flex items-start justify-between gap-3">
                    {identity}
                    {fitBadge}
                </div>

                {/* Meta line */}
                {metaLine ? <div className="mt-2.5">{metaLine}</div> : null}

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

                {/* Footer: stats strip (the payoff row) + actions, pinned to the bottom */}
                <div className="mt-auto flex flex-col gap-4 pt-4">
                    {statsStrip}
                    {actionRow}
                </div>
            </div>
        </article>
    );
}
