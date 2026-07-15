'use client';

import Image from 'next/image';
import Link from 'next/link';
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
    hideTrackingButton = false
}: UniversityCardProps) {
    const { value: scoreValue, badgeClass: scoreColorClass } = getFitScoreVisuals(fitScore);
    const courseHref = id ? `/course/${encodeURIComponent(id)}?from=search` : null;

    return (
        <article
            className={cn(
                'group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-border bg-card/80 shadow-[0_22px_50px_-28px_rgba(15,23,42,0.38)] backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_70px_-30px_rgba(15,23,42,0.42)] dark:bg-muted/20 dark:border-white/10 dark:shadow-none dark:hover:border-primary/50 dark:hover:bg-muted/30',
                variant === 'compact' ? 'p-4' : 'p-5'
            )}
        >
            <span
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_32%)] opacity-80"
                aria-hidden
            />
            <span
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                aria-hidden
            />
            {/* Header: Score & Location */}
            <div className="relative z-10 flex items-start justify-between">
                <div className={cn('flex items-center justify-center rounded-[18px] border border-white/50 ring-4 shadow-[0_16px_30px_-20px_rgba(15,23,42,0.55)]', scoreColorClass, variant === 'compact' ? 'h-10 w-10' : 'h-12 w-12')}>
                    <span className={cn('font-bold', variant === 'compact' ? 'text-xs' : 'text-sm')}>
                        {scoreValue !== null ? `${scoreValue}%` : 'N/A'}
                    </span>
                </div>
                <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{location}</p>
                    {tier ? (
                        <p className="mt-1 text-xs font-semibold text-foreground/80">{tier} tier</p>
                    ) : null}
                </div>
            </div>

            {/* Content */}
            <div className="relative z-10 mt-4 flex-1">
                <div className="flex items-center gap-3">
                    {logoUrl ? (
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-black shadow-sm">
                            <Image
                                src={logoUrl}
                                alt={`${name} logo`}
                                fill
                                className="object-contain"
                                sizes="48px"
                            />
                        </div>
                    ) : null}
                    <div className="min-w-0">
                        <h3
                            className={cn('font-bold text-foreground line-clamp-1', variant === 'compact' ? 'text-lg' : 'text-xl')}
                            title={name}
                        >
                            {name}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground line-clamp-1" title={program}>
                            {program}
                        </p>
                    </div>
                </div>

                {/* Highlights */}
                {highlights.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {highlights.slice(0, 3).map((highlight) => (
                            <span
                                key={highlight}
                                className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground/80 shadow-sm"
                            >
                                {highlight}
                            </span>
                        ))}
                        {highlights.length > 3 && (
                            <span className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                                +{highlights.length - 3}
                            </span>
                        )}
                    </div>
                )}

                {/* Eligibility Reasons */}
                {reasons.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-1">Eligibility Details</p>
                        <div className="flex flex-col gap-1">
                            {reasons.map((reason, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "text-[11px] px-2 py-1 rounded-lg border",
                                        reason.includes("below requirement") || reason.includes("missing")
                                            ? "bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400"
                                            : "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                    )}
                                >
                                    {reason}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="relative z-10 mt-6 grid grid-cols-2 gap-3">
                {actions ? (
                    actions
                ) : (
                    <>
                        {courseHref ? (
                            <Link
                                href={courseHref}
                                className={cn(
                                    buttonVariants({ size: 'sm', className: 'w-full rounded-full font-semibold shadow-sm' })
                                )}
                                prefetch={false}
                            >
                                {ACTION_TEXT.viewCourse}
                            </Link>
                        ) : (
                            <Button size="sm" className="w-full rounded-full font-semibold shadow-sm" disabled>
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
                            />
                        )}
                    </>
                )}
            </div>
        </article>
    );
}
