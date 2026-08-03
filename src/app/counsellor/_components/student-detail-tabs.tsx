'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock as ClockIcon, BookOpen, MapPin, GraduationCap, Target, FileText } from 'lucide-react';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import { parseLocalDate } from '@/lib/utils/dates';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import {
  TIER_VISUAL,
  APPLICATION_STATUS_VISUAL,
  type FitTier,
  type ApplicationStatusTone
} from '@/lib/theme/categories';
import { STAGE_LABEL } from '@/lib/counsellor/stage-colors';
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

// Tier + status colours are projections of the tone system of record
// (lib/theme/categories.ts) rather than a fourth private palette. `text` is a
// first-class field so nothing has to recover a colour by string-parsing `pill`.
const tierStyle = (tier: FitTier) => {
  const v = TIER_VISUAL[tier];
  return { pill: cn(v.border, v.bg, v.text), dot: v.bar, text: v.text };
};

const TIER_COLORS: Record<'Reach' | 'Match' | 'Safe', ReturnType<typeof tierStyle>> = {
  Reach: tierStyle('reach'),
  Match: tierStyle('match'),
  Safe: tierStyle('safety')
};

const statusStyle = (status: ApplicationStatusTone) => {
  const v = APPLICATION_STATUS_VISUAL[status];
  return cn(v.text, v.bg, v.border);
};

// Labels come from STAGE_LABEL (the counsellor section's one label table) so this
// panel can't disagree with the kanban column headers or the funnel bars.
const APP_STATUS: Record<ApplicationStatusTone, { label: string; color: string }> = {
  planning: { label: STAGE_LABEL.planning, color: statusStyle('planning') },
  in_progress: { label: STAGE_LABEL.in_progress, color: statusStyle('in_progress') },
  submitted: { label: STAGE_LABEL.submitted, color: statusStyle('submitted') },
  decision: { label: STAGE_LABEL.decision, color: statusStyle('decision') },
  enrolled: { label: STAGE_LABEL.enrolled, color: statusStyle('enrolled') }
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
  const urlTab = resolveTab(tabParam);
  // The URL is a deep-link MIRROR, not the source of truth for the tab.
  //
  // Driving `value` straight off the search param made every tab switch wait for
  // a `router.replace` round-trip — and this page is `force-dynamic`, so that is
  // a real server request. Radix activates on focus, so arrow-keying across the
  // row left the focused tab and the `aria-selected` tab disagreeing for the
  // length of that round-trip (measured 0.5–1s in dev), and a fast sweep dropped
  // every intermediate activation. Every panel's data is already in props, so
  // nothing about the switch actually needs the server.
  const [active, setActive] = useState(urlTab);
  // Re-sync when the URL changes from OUTSIDE this component: a deep link,
  // back/forward, or the document board's `?tab=documents` link. Passing the
  // same string back is a no-op re-render bail in React, not a loop.
  useEffect(() => { setActive(urlTab); }, [urlTab]);

  const selectTab = (next: string) => {
    setActive(resolveTab(next));
    setTabParam(next);
  };

  const matches = student.matches;

  const reachCount = matches.filter((m) => m.tier === 'Reach').length;
  const matchCount = matches.filter((m) => m.tier === 'Match').length;
  const safeCount = matches.filter((m) => m.tier === 'Safe').length;

  return (
    // Radix supplies the tablist/tab/tabpanel wiring, aria-controls and
    // arrow-key handling this row used to declare `role="tablist"` without.
    <Tabs value={active} onValueChange={selectTab}>
      <TabsList aria-label="Student detail sections">
        {TABS.map((tab) => {
          const count = tab.id === 'notes'
            ? student.notes.length
            : tab.id === 'matches'
              ? matches.length
              : 0;
          return (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-label font-bold text-primary-ink">
                  {count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="overview">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Personal info */}
          <div className="surface-card space-y-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary-ink" />
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
          <div className="surface-card space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary-ink" />
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
                  {/* Index in the key: a cohort's matches legitimately repeat a
                      university+programme pair (two catalogue rows for the same
                      course), and the pair alone collided — React warned and was
                      free to drop rows. */}
                  {matches.slice(0, 3).map((m, i) => {
                    const tc = TIER_COLORS[m.tier];
                    return (
                      <div key={`${m.university}-${m.program}-${i}`} className="flex items-center gap-2 text-sm">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', tc.dot)} />
                        <span className="flex-1 truncate text-foreground">{m.university}</span>
                        <span className={cn('shrink-0 text-xs font-semibold', tc.text)}>{m.score}</span>
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
          <div className="surface-card space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-ink" />
              <p className="font-semibold text-foreground">Career Aspiration</p>
            </div>
            <p className="text-sm text-muted-foreground">{student.academic.careerAspiration}</p>
          </div>

          {/* Lifestyle */}
          <div className="surface-card space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary-ink" />
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
      </TabsContent>

      <TabsContent value="academic">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Grades */}
          <div className="surface-card space-y-4">
            <p className="font-semibold text-foreground">Grades & Scores</p>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Programme</dt>
                <dd className="font-semibold text-foreground">{student.academic.programmeType}</dd>
              </div>
              {student.academic.programmeType === 'IB' ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">IB Points</dt>
                  <dd className="font-bold text-primary-ink">{student.academic.ibPoints ?? '—'} / 45</dd>
                </div>
              ) : (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">A-Level Grades</dt>
                  <dd className="font-bold text-primary-ink">{student.academic.aLevelGrades ?? '—'}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">English status</dt>
                <dd className={cn('font-semibold',
                  student.academic.englishStatus === 'met' ? 'text-success'
                    : student.academic.englishStatus === 'booked' ? 'text-warning'
                      : 'text-danger'
                )}>
                  {student.academic.englishStatus === 'met' ? '✓ Met' : student.academic.englishStatus === 'booked' ? '⏳ Booked' : '✗ Missing'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Subjects */}
          <div className="surface-card space-y-3">
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
          <div className="surface-card space-y-3">
            <p className="font-semibold text-foreground">Admissions Tests</p>
            {student.academic.admissionsTests.length > 0 ? (
              <div className="space-y-2">
                {student.academic.admissionsTests.map((t) => (
                  <div key={t.type} className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      {t.status === 'taken' ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : t.status === 'booked' ? (
                        <ClockIcon className="h-4 w-4 text-warning" />
                      ) : (
                        <XCircle className="h-4 w-4 text-danger" />
                      )}
                      <span className="font-semibold text-foreground">{t.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.score != null && <span className="font-bold text-primary-ink">{t.score}</span>}
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                        t.status === 'taken' ? 'bg-success-subtle text-success'
                          : t.status === 'booked' ? 'bg-warning-subtle text-warning'
                            : 'bg-danger-subtle text-danger'
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
          <div className="surface-card space-y-3">
            <p className="font-semibold text-foreground">Fields of Interest</p>
            <div className="flex flex-wrap gap-2">
              {student.academic.clusters.map((c) => (
                <span key={c} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-ink">
                  {c.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="matches">
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
                      {/* Index in the key — see the Match Summary list above. */}
                      {tierMatches.map((m, i) => (
                        <div
                          key={`${m.university}-${m.program}-${i}`}
                          className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 px-5 py-4"
                        >
                          <div className="flex-1 space-y-0.5">
                            <p className="font-semibold text-foreground">{m.university}</p>
                            <p className="text-sm text-muted-foreground">{m.program} · {m.country}</p>
                          </div>
                          <div className="text-right">
                            <p className={cn('text-xl font-bold tabular-nums', tc.text)}>{m.score}</p>
                            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted/60">
                              <div
                                className={cn('h-1 rounded-full bg-current', tc.text)}
                                style={{ width: `${m.score}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-label text-muted-foreground">fit score</p>
                          </div>
                          <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', tc.pill)}>{tier}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {matches.length === 0 && (
                <div className="rounded-4xl border border-dashed border-border bg-muted/40 p-12 text-center">
                  <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground">No matches generated</p>
                  <p className="mt-1 text-sm text-muted-foreground">Complete the student profile to generate matches.</p>
                </div>
              )}
          </>
        </div>
      </TabsContent>

      <TabsContent value="applications">
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
            <div className="rounded-4xl border border-dashed border-border bg-muted/40 p-12 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No applications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">This student hasn&apos;t started any applications.</p>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="notes">
        <NotesPanel notes={student.notes} studentId={student.id} />
      </TabsContent>

      <TabsContent value="timeline">
        <div className="surface-card space-y-4">
          <div>
            <p className="font-semibold text-foreground">Profile Evolution</p>
            <p className="text-sm text-muted-foreground">How this student&apos;s goals and interests have evolved over time.</p>
          </div>
          <EvolutionTimeline
            entries={evolution}
            studentName={`${student.personal.firstName} ${student.personal.lastName}`}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
};
