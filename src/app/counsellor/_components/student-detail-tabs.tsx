'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock as ClockIcon, BookOpen, MapPin, GraduationCap, Target, FileText } from 'lucide-react';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import { parseLocalDate } from '@/lib/utils/dates';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { NotesPanel } from './notes-panel';
import { PortfolioBalance } from './portfolio-balance';
import { EvolutionTimeline } from '@/components/profile/evolution-timeline';
import type { EvolutionEntry } from '@/lib/data/student-demo-data';

interface StudentDetailTabsProps {
  student: CounsellorStudent;
  evolution: EvolutionEntry[];
}

type Tab = 'overview' | 'academic' | 'matches' | 'applications' | 'notes' | 'timeline';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'academic', label: 'Academic' },
  { id: 'matches', label: 'Matches' },
  { id: 'applications', label: 'Applications' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Timeline' }
];

const TIER_COLORS = {
  Reach: { pill: 'border-rose-200/60 bg-rose-500/10 text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  Match: { pill: 'border-amber-200/60 bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  Safe: { pill: 'border-emerald-200/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' }
};

const APP_STATUS = {
  planning: { label: 'Planning', color: 'text-muted-foreground bg-muted/60 border-border' },
  in_progress: { label: 'In Progress', color: 'text-sky-600 bg-sky-500/10 border-sky-200/60 dark:border-sky-500/20' },
  submitted: { label: 'Submitted', color: 'text-violet-600 bg-violet-500/10 border-violet-200/60 dark:border-violet-500/20' },
  decision: { label: 'Decision', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20' }
};

function formatDate(iso: string) {
  if (!iso) return 'No deadline';
  return parseLocalDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The counsellor document board deep-links here with ?tab=documents; there is no
// standalone documents tab, so it lands on Applications (the closest doc-bearing view).
const resolveTab = (id: string): Tab => {
  if (TABS.some((t) => t.id === id)) return id as Tab;
  if (id === 'documents') return 'applications';
  return 'overview';
};

export const StudentDetailTabs = ({ student, evolution }: StudentDetailTabsProps) => {
  const [tabParam, setTabParam] = useSearchParamState('tab', 'overview');
  const active = resolveTab(tabParam);
  const matches = student.matches;

  const reachCount = matches.filter((m) => m.tier === 'Reach').length;
  const matchCount = matches.filter((m) => m.tier === 'Match').length;
  const safeCount = matches.filter((m) => m.tier === 'Safe').length;

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <nav role="tablist" aria-label="Student detail sections" className="flex items-center gap-2 overflow-x-auto scrollbar-none rounded-[28px] border border-border bg-card px-3 sm:px-4 py-2.5 sm:py-3 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setTabParam(tab.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition hover:bg-muted/80',
              active === tab.id
                ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(15,23,42,0.25)]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.id === 'notes' && student.notes.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6875rem] font-bold text-primary">
                {student.notes.length}
              </span>
            )}
            {tab.id === 'matches' && matches.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6875rem] font-bold text-primary">
                {matches.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Overview tab */}
      {active === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Personal info */}
          <div className="surface-card surface-card--static space-y-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Personal Info</p>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                { label: 'Full name', value: `${student.personal.firstName} ${student.personal.lastName}` },
                { label: 'Nationality', value: `${student.personal.flagEmoji} ${student.personal.nationality}` },
                { label: 'School', value: student.personal.school },
                { label: 'Location', value: `${student.personal.schoolCity}, ${student.personal.schoolCountry}` },
                { label: 'Email', value: student.personal.email },
                { label: 'Graduation', value: String(student.academic.graduationYear) }
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Match summary */}
          <div className="surface-card surface-card--static space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Match Summary</p>
            </div>
            {matches.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Reach', count: reachCount, ...TIER_COLORS.Reach },
                    { label: 'Match', count: matchCount, ...TIER_COLORS.Match },
                    { label: 'Safe', count: safeCount, ...TIER_COLORS.Safe }
                  ].map(({ label, count, pill }) => (
                    <div key={label} className={cn('rounded-2xl border px-3 py-3 text-center', pill)}>
                      <p className="text-xl font-bold tabular-nums">{count}</p>
                      <p className="text-xs font-semibold opacity-80">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {matches.slice(0, 3).map((m) => {
                    const tc = TIER_COLORS[m.tier];
                    return (
                      <div key={`${m.university}-${m.program}`} className="flex items-center gap-2 text-sm">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', tc.dot)} />
                        <span className="flex-1 truncate text-foreground">{m.university}</span>
                        <span className={cn('shrink-0 text-xs font-semibold', tc.pill.split(' ').find(c => c.startsWith('text')))}>{m.score}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-6 text-center text-sm text-muted-foreground">
                <BookOpen className="mb-2 h-6 w-6 opacity-40" />
                No matches generated yet — profile incomplete
              </div>
            )}
          </div>

          {/* Career aspiration */}
          <div className="surface-card surface-card--static space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Career Aspiration</p>
            </div>
            <p className="text-sm text-muted-foreground">{student.academic.careerAspiration}</p>
          </div>

          {/* Lifestyle */}
          <div className="surface-card surface-card--static space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Preferences</p>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                { label: 'Teaching style', value: student.lifestyle.teachingStyle },
                { label: 'Location', value: student.lifestyle.locationPreference.replace(/_/g, ' ') },
                { label: 'Campus size', value: student.lifestyle.campusSize.replace(/_/g, ' ') }
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium capitalize text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            {student.lifestyle.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {student.lifestyle.interests.map((i) => (
                  <span key={i} className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {i}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Academic tab */}
      {active === 'academic' && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Grades */}
          <div className="surface-card surface-card--static space-y-4">
            <p className="font-semibold text-foreground">Grades & Scores</p>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Programme</dt>
                <dd className="font-semibold text-foreground">{student.academic.programmeType}</dd>
              </div>
              {student.academic.programmeType === 'IB' ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">IB Points</dt>
                  <dd className="font-bold text-primary">{student.academic.ibPoints ?? '—'} / 45</dd>
                </div>
              ) : (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">A-Level Grades</dt>
                  <dd className="font-bold text-primary">{student.academic.aLevelGrades ?? '—'}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">English status</dt>
                <dd className={cn('font-semibold',
                  student.academic.englishStatus === 'met' ? 'text-emerald-600'
                    : student.academic.englishStatus === 'booked' ? 'text-amber-600'
                      : 'text-red-500'
                )}>
                  {student.academic.englishStatus === 'met' ? '✓ Met' : student.academic.englishStatus === 'booked' ? '⏳ Booked' : '✗ Missing'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Subjects */}
          <div className="surface-card surface-card--static space-y-3">
            <p className="font-semibold text-foreground">Subjects</p>
            <div className="flex flex-wrap gap-1.5">
              {student.academic.subjects.map((s) => (
                <span key={s} className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Admissions tests */}
          <div className="surface-card surface-card--static space-y-3">
            <p className="font-semibold text-foreground">Admissions Tests</p>
            {student.academic.admissionsTests.length > 0 ? (
              <div className="space-y-2">
                {student.academic.admissionsTests.map((t) => (
                  <div key={t.type} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      {t.status === 'taken' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : t.status === 'booked' ? (
                        <ClockIcon className="h-4 w-4 text-amber-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-semibold text-foreground">{t.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.score != null && <span className="font-bold text-primary">{t.score}</span>}
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                        t.status === 'taken' ? 'bg-emerald-500/10 text-emerald-600'
                          : t.status === 'booked' ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-red-500/10 text-red-500'
                      )}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No admissions tests recorded.</p>
            )}
          </div>

          {/* Fields */}
          <div className="surface-card surface-card--static space-y-3">
            <p className="font-semibold text-foreground">Fields of Interest</p>
            <div className="flex flex-wrap gap-2">
              {student.academic.clusters.map((c) => (
                <span key={c} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {c.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Matches tab */}
      {active === 'matches' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {matches.length > 0
                ? `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`
                : 'No matches yet'}
            </p>
          </div>

          {/* Match list */}
          <>
              {(['Reach', 'Match', 'Safe'] as const).map((tier) => {
                const tierMatches = matches.filter((m) => m.tier === tier);
                if (tierMatches.length === 0) return null;
                const tc = TIER_COLORS[tier];
                return (
                  <div key={tier} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', tc.dot)} />
                      <p className="text-sm font-semibold text-foreground">{tier} — {tierMatches.length} program{tierMatches.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="space-y-2">
                      {tierMatches.map((m) => (
                        <div
                          key={`${m.university}-${m.program}`}
                          className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 px-5 py-4"
                        >
                          <div className="flex-1 space-y-0.5">
                            <p className="font-semibold text-foreground">{m.university}</p>
                            <p className="text-sm text-muted-foreground">{m.program} · {m.country}</p>
                          </div>
                          <div className="text-right">
                            <p className={cn('text-xl font-bold tabular-nums', tc.pill.split(' ').find(c => c.startsWith('text')))}>{m.score}</p>
                            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted/60">
                              <div
                                className={cn('h-1 rounded-full bg-current', tc.pill.split(' ').find(c => c.startsWith('text')))}
                                style={{ width: `${m.score}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">fit score</p>
                          </div>
                          <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', tc.pill)}>{tier}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {matches.length === 0 && (
                <div className="rounded-[28px] border border-dashed border-border bg-muted/40 p-12 text-center">
                  <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground">No matches generated</p>
                  <p className="mt-1 text-sm text-muted-foreground">Complete the student profile to generate matches.</p>
                </div>
              )}
          </>
        </div>
      )}

      {/* Applications tab */}
      {active === 'applications' && (
        <div className="space-y-4">
          <PortfolioBalance student={student} />
          {student.applications.length > 0 ? (
            <div className="space-y-3">
              {student.applications.map((app, i) => {
                const statusCfg = APP_STATUS[app.status];
                return (
                  <div
                    key={i}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/60 px-5 py-4 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex-1 space-y-0.5">
                      <p className="font-semibold text-foreground">{app.university}</p>
                      <p className="text-sm text-muted-foreground">{app.program}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {formatDate(app.deadline)}
                      </div>
                      <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-border bg-muted/40 p-12 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No applications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">This student hasn&apos;t started any applications.</p>
            </div>
          )}
        </div>
      )}

      {/* Notes tab */}
      {active === 'notes' && <NotesPanel notes={student.notes} studentId={student.id} />}

      {/* Timeline tab */}
      {active === 'timeline' && (
        <div className="surface-card surface-card--static space-y-4">
          <div>
            <p className="font-semibold text-foreground">Profile Evolution</p>
            <p className="text-sm text-muted-foreground">How this student&apos;s goals and interests have evolved over time.</p>
          </div>
          <EvolutionTimeline
            entries={evolution}
            studentName={`${student.personal.firstName} ${student.personal.lastName}`}
          />
        </div>
      )}
    </div>
  );
};
