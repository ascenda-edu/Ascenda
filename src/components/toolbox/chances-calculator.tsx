'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, GraduationCap, Calendar, ClipboardList, TrendingUp, Target, Shield, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { stagger, cardFade } from '@/lib/motion';
import type { DemoStudentGrades, UniversityChance } from '@/lib/data/student-demo-data';

// Only link to a course page for IDs that actually resolve to a real `programs`
// row. Demo cohort IDs ('ch-1'…) and the legacy '<title>-shortlist' IDs 404 on
// /course/[id], so we omit the link rather than render a dead end.
function isLinkableCourseId(id: string): boolean {
  return !/^ch-\d+$/.test(id) && !id.endsWith('-shortlist');
}

function classify(predicted: number, min: number): 'reach' | 'match' | 'safety' {
  const diff = predicted - min;
  if (diff >= 5) return 'safety';
  if (diff >= 1) return 'match';
  return 'reach';
}

function chancePercent(predicted: number, min: number): number {
  const diff = predicted - min;
  if (diff >= 5) return 90;
  if (diff >= 3) return 75;
  if (diff >= 1) return 55;
  if (diff >= 0) return 35;
  if (diff >= -2) return 20;
  return 10;
}

const CLASS_CONFIG = {
  reach: { label: 'Reach', color: 'text-rose-600', bg: 'bg-rose-500/10 border-rose-200/60', barColor: 'bg-rose-500', icon: TrendingUp, ringColor: 'stroke-rose-500' },
  match: { label: 'Match', color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-200/60', barColor: 'bg-amber-500', icon: Target, ringColor: 'stroke-amber-500' },
  safety: { label: 'Safety', color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-200/60', barColor: 'bg-emerald-500', icon: Shield, ringColor: 'stroke-emerald-500' },
} as const;

interface ChancesCalculatorProps {
  grades: DemoStudentGrades;
  universities: UniversityChance[];
}

export function ChancesCalculator({ grades, universities }: ChancesCalculatorProps) {
  const [sliderScore, setSliderScore] = useState<number>(grades.predicted);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'classification' | 'chance' | 'deadline'>('classification');

  const sorted = useMemo(() => {
    const withData = universities.map((u) => ({
      ...u,
      classification: classify(sliderScore, u.minimumScore),
      chance: chancePercent(sliderScore, u.minimumScore),
    }));

    if (sortBy === 'classification') {
      const order = { reach: 0, match: 1, safety: 2 };
      return withData.sort((a, b) => order[a.classification] - order[b.classification]);
    }
    if (sortBy === 'chance') {
      return withData.sort((a, b) => b.chance - a.chance);
    }
    return withData.sort((a, b) => parseLocalDate(a.deadline).getTime() - parseLocalDate(b.deadline).getTime());
  }, [universities, sliderScore, sortBy]);

  const counts = { reach: 0, match: 0, safety: 0 };
  sorted.forEach((u) => counts[u.classification]++);

  return (
    <div className="space-y-6">
      {/* Score slider card */}
      <div className="surface-subcard p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{grades.system} Predicted Score</p>
            <div className="flex items-baseline gap-2 mt-1">
              <motion.span
                key={sliderScore}
                initial={{ scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-3xl font-semibold text-foreground tabular-nums"
              >
                {sliderScore}
              </motion.span>
              <span className="text-lg text-muted-foreground">/ 45</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Base prediction</p>
            <p className="text-sm text-muted-foreground">{grades.predicted} points</p>
            {sliderScore !== grades.predicted && (
              <button
                onClick={() => setSliderScore(grades.predicted)}
                className="text-xs text-primary hover:underline mt-0.5"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Slider */}
        <div className="space-y-2">
          <p className="text-[0.6875rem] font-semibold text-muted-foreground">What if I score...</p>
          <div className="relative">
            <input
              type="range"
              min={24}
              max={45}
              value={sliderScore}
              onChange={(e) => setSliderScore(Number(e.target.value))}
              aria-label={`${grades.system} predicted score`}
              aria-valuemin={24}
              aria-valuemax={45}
              aria-valuenow={sliderScore}
              aria-valuetext={`${sliderScore} out of 45 points`}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted/50 accent-primary
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:shadow-primary/30 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
                [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between mt-1 px-0.5">
              <span className="text-[0.625rem] text-muted-foreground/50">24</span>
              <span className="text-[0.625rem] text-muted-foreground/50">30</span>
              <span className="text-[0.625rem] text-muted-foreground/50">35</span>
              <span className="text-[0.625rem] text-muted-foreground/50">40</span>
              <span className="text-[0.625rem] text-muted-foreground/50">45</span>
            </div>
          </div>
        </div>

        {/* Subject grades */}
        <div className="flex flex-wrap gap-2">
          {grades.subjects.map((s) => (
            <span key={s.name} className="surface-chip text-xs">
              {s.name} {s.level} · <strong>{s.predicted}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Summary cards with animated counts */}
      <div className="grid grid-cols-3 gap-3">
        {(['reach', 'match', 'safety'] as const).map((tier) => {
          const cfg = CLASS_CONFIG[tier];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={tier}
              className={cn('rounded-2xl border p-4 text-center space-y-1', cfg.bg)}
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <Icon className={cn('h-5 w-5 mx-auto', cfg.color)} />
              <motion.p
                key={`${tier}-${counts[tier]}`}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn('text-2xl font-bold', cfg.color)}
              >
                {counts[tier]}
              </motion.p>
              <p className="text-xs text-muted-foreground font-medium">{cfg.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Sort by</span>
        {([
          { key: 'classification', label: 'Tier' },
          { key: 'chance', label: 'Chance %' },
          { key: 'deadline', label: 'Deadline' },
        ] as const).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              sortBy === opt.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-[0.6875rem] text-muted-foreground/60 italic">
        Chance percentages are illustrative estimates based on score thresholds, not real admissions probabilities. Actual outcomes depend on many factors beyond grades.
      </p>

      {/* University cards */}
      <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="show">
        {sorted.map((uni) => {
          const cfg = CLASS_CONFIG[uni.classification];
          const isExpanded = expandedId === uni.id;
          const circumference = 2 * Math.PI * 18;
          const dashOffset = circumference - (uni.chance / 100) * circumference;

          return (
            <motion.div key={uni.id} variants={cardFade} layout>
              <div
                className={cn('relative w-full text-left rounded-2xl border p-4 transition-shadow hover:shadow-md', cfg.bg)}
              >
                {/* Stretched toggle: a real button covering the card, kept as a
                    SIBLING of the course Link (interactive elements must not nest). */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : uni.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${uni.university} — ${isExpanded ? 'collapse' : 'expand'} details`}
                  className="absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center gap-4">
                  {/* Chance ring */}
                  <div className="relative h-14 w-14 shrink-0">
                    <svg className="h-14 w-14 -rotate-90" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
                      <motion.circle
                        cx="22" cy="22" r="18" fill="none" strokeWidth="3" strokeLinecap="round"
                        className={cfg.ringColor}
                        initial={{ strokeDasharray: `0 ${circumference}` }}
                        animate={{ strokeDasharray: `${circumference - dashOffset} ${circumference}` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </svg>
                    <span className={cn('absolute inset-0 flex items-center justify-center text-xs font-bold', cfg.color)}>
                      {uni.chance}%
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{uni.flagEmoji}</span>
                      <span className="text-[0.9375rem] font-semibold text-foreground truncate">{uni.university}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{uni.programme}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Typical: {uni.typicalOffer}</span>
                      <span>Min: {uni.minimumScore}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    {isLinkableCourseId(uni.id) ? (
                      <Link
                        href={`/course/${uni.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="relative z-10 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[0.6875rem] font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                        aria-label={`View ${uni.university} course details`}
                      >
                        View course
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                  </div>
                </div>

                {/* Score comparison bar */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[0.625rem] text-muted-foreground w-12 shrink-0">Min {uni.minimumScore}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden relative">
                    {/* Minimum score marker */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-foreground/20 z-10"
                      style={{ left: `${(uni.minimumScore / 45) * 100}%` }}
                    />
                    <motion.div
                      className={cn('h-full rounded-full', cfg.barColor)}
                      initial={{ width: 0 }}
                      animate={{ width: `${(sliderScore / 45) * 100}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-[0.625rem] font-semibold text-foreground w-12 text-right shrink-0">You: {sliderScore}</span>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-border/50 pt-4">
                        {uni.hlRequirements && uni.hlRequirements.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <GraduationCap className="h-3.5 w-3.5" /> HL Requirements
                            </div>
                            {uni.hlRequirements.map((req) => (
                              <p key={req} className="text-xs text-foreground">{req}</p>
                            ))}
                          </div>
                        )}
                        {uni.entranceExams && uni.entranceExams.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <ClipboardList className="h-3.5 w-3.5" /> Entrance Exams
                            </div>
                            {uni.entranceExams.map((exam) => (
                              <p key={exam} className="text-xs text-foreground">{exam}</p>
                            ))}
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" /> Deadline
                          </div>
                          <p className="text-xs text-foreground">
                            {parseLocalDate(uni.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                          {uni.interviewRequired && (
                            <p className="text-xs font-medium text-amber-600">Interview required</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
