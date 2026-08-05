import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireIdentity } from '@/lib/auth/identity';
import { DashboardShell } from '@/components/layout/shell';
import { PROFILE_STEPS, type StepCompletionMap, type StepKey } from '@/lib/profile/steps';
import { buildStepCompletion, type ProfileRecordGroup } from '@/lib/profile/completion';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ProfileProgressCard } from './_components/profile-progress-card';
import { Compass, GraduationCap, MapPin, Target } from 'lucide-react';
import { AnimatedSection, AnimatedGrid, AnimatedGridItem } from '@/components/layout/animated-section';
import { PROFILE_SECTION_VISUAL } from '@/lib/theme/categories';
import { cn } from '@/lib/utils';
import { summarisePathwayStatus } from '@/lib/profile/pathway-status';
import { PathwayStatusPill } from '@/components/profile/pathway-status-pill';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';

export const metadata: Metadata = {
  title: 'Profile'
};

export default async function ProfilePage() {
  // One memoised identity lookup for the whole request (@/lib/auth/identity):
  // replaces the copy-pasted getUser()+redirect guard and yields the role the
  // shell needs, so the browser stops re-deriving it.
  const identity = await requireIdentity();
  const supabase = await createServerSupabaseClient();

  // maybeSingle(): new users legitimately have no row yet — .single() turns
  // that into a discarded PGRST116 error that also masks real failures.
  // Promise.all: these are independent; serial awaits were a 7-hop waterfall.
  const [
    { data: profile },
    { data: personal },
    { data: academicInput },
    { data: lifestyle },
    { data: subjects },
    { data: admissionsTests },
    { data: scores }
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', identity.userId).maybeSingle(),
    supabase.from('student_personal_information').select('*').eq('profile_id', identity.userId).maybeSingle(),
    supabase.from('student_academic_input').select('*').eq('profile_id', identity.userId).maybeSingle(),
    supabase.from('student_lifestyle_preference').select('*').eq('profile_id', identity.userId).maybeSingle(),
    supabase.from('student_subjects').select('subject_name,level,grade_value').eq('profile_id', identity.userId),
    supabase
      .from('student_admissions_tests')
      .select('test_type,status,score_numeric,percentile')
      .eq('profile_id', identity.userId),
    supabase.from('student_scores').select('*').eq('profile_id', identity.userId).maybeSingle()
  ]);

  const pathwayInsight = summarisePathwayStatus(
    (scores?.eligibility_flags as string[] | null) ?? null,
    (scores?.readiness_flags as string[] | null) ?? null
  );

  const recordGroup: ProfileRecordGroup = {
    personal: personal ?? null,
    academicInput: academicInput ?? null,
    subjectCount: subjects?.length ?? 0,
    lifestyle: lifestyle ?? null
  };
  const stepCompletion: StepCompletionMap = buildStepCompletion(recordGroup);
  const completedCount = PROFILE_STEPS.filter((step) => stepCompletion[step.key]).length;
  const completionPercent = Math.round((completedCount / PROFILE_STEPS.length) * 100);
  const nextStep = PROFILE_STEPS.find((step) => !stepCompletion[step.key]);
  const nextStepKey: StepKey = nextStep?.key ?? 'personal_information';
  const heroStats = [
    { label: 'Completion', value: `${completionPercent}%`, detail: 'Profile ready' },
    { label: 'Steps done', value: `${completedCount}/${PROFILE_STEPS.length}`, detail: 'Sections' },
    { label: 'Next', value: nextStep?.title ?? 'All set', detail: 'Focus area' }
  ];
  const primaryClusters = Array.isArray(academicInput?.intended_clusters)
    ? academicInput.intended_clusters.filter(Boolean)
    : [];
  const secondaryClusters = Array.isArray(academicInput?.secondary_clusters)
    ? academicInput.secondary_clusters.filter(Boolean)
    : [];
  const profileFullName =
    personal?.first_name || personal?.last_name
      ? `${personal?.first_name ?? ''} ${personal?.last_name ?? ''}`.trim()
      : profile?.full_name;
  const profileEmail = personal?.email ?? identity.email ?? '';
  const formatClusterLabel = (value: string) =>
    value
      .split(',')
      .map((part) =>
        part
          .trim()
          .split('_')
          .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
          .join(' ')
      )
      .join(', ');

  const PROGRAMME_LABEL: Record<string, string> = {
    IB: 'IB',
    A_LEVEL: 'A-Level'
  };
  const ENGLISH_STATUS_LABEL: Record<string, string> = {
    met: 'Meets requirement',
    exceeds: 'Exceeds requirement',
    exceptional: 'Native / exceptional',
    booked: 'Test booked',
    missing: 'Not started',
    failed: 'Below requirement'
  };
  const formatProgramme = (value?: string | null) =>
    value ? PROGRAMME_LABEL[value] ?? value.replace(/_/g, ' ') : null;
  const formatEnglishStatus = (value?: string | null) =>
    value ? ENGLISH_STATUS_LABEL[value] ?? value.replace(/_/g, ' ') : null;

  const academicSignals = [
    academicInput?.programme_type ? `Programme: ${formatProgramme(academicInput.programme_type)}` : null,
    typeof academicInput?.ib_total_points === 'number' ? `IB ${academicInput.ib_total_points}/42` : null,
    typeof subjects?.length === 'number' && subjects.length > 0 ? `Subjects: ${subjects.length}` : null,
    academicInput?.english_status ? `English: ${formatEnglishStatus(academicInput.english_status)}` : null
  ].filter(Boolean) as string[];
  const subjectHighlights = (subjects ?? [])
    .slice(0, 3)
    .map((subject) =>
      subject.subject_name
        ? `${subject.subject_name}${subject.grade_value ? ` (${subject.grade_value})` : ''}`
        : null
    )
    .filter(Boolean) as string[];
  const admissionsSummary = (admissionsTests ?? [])
    .filter((test) => test.test_type && test.test_type !== 'NONE')
    .slice(0, 2)
    .map((test) => `${test.test_type}${test.status ? ` • ${test.status}` : ''}`);
  const admissionsLabel = admissionsSummary.length ? admissionsSummary.join(', ') : 'No tests recorded';
  const outcomeHints = [
    primaryClusters.length === 0
      ? { title: 'Set intended subjects', detail: 'Improves programme relevance and admissions test guidance.' }
      : null,
    (subjects?.length ?? 0) === 0
      ? { title: 'Add subject predictions', detail: 'Enables eligibility checks and grade-fit scoring.' }
      : null,
    academicInput?.english_required === null || academicInput?.english_required === undefined
      ? { title: 'Confirm English requirements', detail: 'Ensures language test reminders are accurate.' }
      : null,
    (lifestyle?.extracurricular_interests ?? []).length === 0
      ? { title: 'Share lifestyle preferences', detail: 'Improves campus fit and experience match signals.' }
      : null
  ]
    .filter(Boolean)
    .slice(0, 3) as { title: string; detail: string }[];

  return (
    <DashboardShell role={identity.role}>
      <PageHero
        tone="student"
        eyebrow="Your profile"
        title="The more we know, the better we can help"
        description="Tell us about you — your grades, what you're into, where you want to be — and we'll tune everything to fit."
        highlight={nextStep ? `Up next · ${nextStep.title}` : 'All done'}
        stats={heroStats}
        breadcrumbs={<Breadcrumbs />}
        actions={
          <>
            <Button asChild size="sm">
              <Link href={`/profile/wizard?step=${nextStepKey}`}>Open profile wizard</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/matches">Preview matches</Link>
            </Button>
            <Button asChild size="sm" variant="soft">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </>
        }
      />
      <AnimatedSection data-tour="profile-progress-card">
        <ProfileProgressCard
          completionPercent={completionPercent}
          completedCount={completedCount}
          totalSteps={PROFILE_STEPS.length}
          nextStepTitle={nextStep?.title}
          stepCompletion={stepCompletion}
        />
      </AnimatedSection>
      <AnimatedGrid data-tour="profile-sections" className="grid gap-8 lg:grid-cols-2">
        <AnimatedGridItem className="surface-card">
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className={cn('eyebrow', PROFILE_SECTION_VISUAL.personal.text)}>Personal</p>
              <h2 className="text-foreground">{profileFullName || 'Add your full name'}</h2>
              <p className="text-sm text-muted-foreground">{profileEmail || 'Add an email'}</p>
            </div>
            <div className={cn(PROFILE_SECTION_VISUAL.personal.swatch, 'h-11 w-11')}>
              <MapPin className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="surface-subcard p-3">
              <p className="eyebrow">Country</p>
              <p className="text-sm font-semibold text-foreground">{personal?.resident_country || 'Add home country'}</p>
            </div>
            <div className="surface-subcard p-3">
              <p className="eyebrow">Time zone</p>
              <p className="text-sm font-semibold text-foreground">{personal?.time_zone || profile?.time_zone || 'Set time zone'}</p>
            </div>
            <div className="surface-subcard p-3">
              <p className="eyebrow">Score</p>
              <p className="text-sm font-semibold text-foreground">
                {typeof scores?.total_score === 'number' ? `${scores.total_score} • ${scores.student_band ?? 'Unbanded'}` : 'Not scored'}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="eyebrow">
              Pathway status
            </p>
            <div className="mt-2">
              <PathwayStatusPill insight={pathwayInsight} />
            </div>
          </div>

          <div className="mt-4">
            <p className="eyebrow">Intended subjects</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {primaryClusters.length ? (
                primaryClusters.map((cluster) => (
                  <span
                    key={cluster}
                    className="surface-chip"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    {formatClusterLabel(cluster)}
                  </span>
                ))
              ) : (
                <span className="surface-chip text-muted-foreground">
                  Add intended subjects
                </span>
              )}
            </div>
          </div>
          <div className="mt-4">
            <p className="eyebrow">Secondary interests</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {secondaryClusters.slice(0, 2).map((cluster) => (
                <span
                  key={cluster}
                  className="surface-chip"
                >
                  <Target className="h-3.5 w-3.5" />
                  {formatClusterLabel(cluster)}
                </span>
              ))}
              {!secondaryClusters.length ? (
                <span className="surface-chip text-muted-foreground">
                  Add secondary interests
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="sm" variant="outline" asChild className="rounded-xl px-6">
              <Link href="/profile/wizard?step=personal_information">Edit personal info</Link>
            </Button>
          </div>
        </AnimatedGridItem>
        <AnimatedGridItem className="space-y-8">
          <div className="surface-card">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <p className={cn('eyebrow', PROFILE_SECTION_VISUAL.lifestyle.text)}>Lifestyle</p>
                <h2 className="text-foreground">Study setup</h2>
                <p className="text-sm text-muted-foreground">Teaching style and campus feel</p>
              </div>
              <div className={cn(PROFILE_SECTION_VISUAL.lifestyle.swatch, 'h-10 w-10')}>
                <Target className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="surface-subcard p-3">
                <p className="eyebrow">Teaching style</p>
                <p className="text-sm font-semibold text-foreground">
                  {lifestyle?.teaching_style ? formatClusterLabel(lifestyle.teaching_style) : 'Add preference'}
                </p>
              </div>
              <div className="surface-subcard p-3">
                <p className="eyebrow">Location type</p>
                <p className="text-sm font-semibold text-foreground">
                  {lifestyle?.desired_location_type ? formatClusterLabel(lifestyle.desired_location_type) : 'Add preference'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(lifestyle?.extracurricular_interests ?? []).slice(0, 3).map((interest) => (
                <span
                  key={interest}
                  className="surface-chip"
                >
                  {interest}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild className="rounded-xl">
                <Link href="/profile/wizard?step=lifestyle_preferences">Edit preferences</Link>
              </Button>
            </div>
          </div>
          <div className="surface-card">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <p className={cn('eyebrow', PROFILE_SECTION_VISUAL.academics.text)}>Academics</p>
                <h2 className="text-foreground">Snapshot</h2>
                <p className="text-sm text-muted-foreground">
                  {academicInput?.programme_type ? formatProgramme(academicInput.programme_type) : 'Add qualification and grades'}
                </p>
              </div>
              <div className={cn(PROFILE_SECTION_VISUAL.academics.swatch, 'h-10 w-10')}>
                <GraduationCap className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {academicSignals.length ? (
                academicSignals.map((signal) => (
                  <span
                    key={signal}
                    className="surface-chip"
                  >
                    {signal}
                  </span>
                ))
              ) : (
                <span className="surface-chip text-muted-foreground">
                  Add scores to sharpen matches
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="surface-subcard p-3">
                <p className="eyebrow">School</p>
                <p className="text-sm font-semibold text-foreground">
                  {academicInput?.school_name ? academicInput.school_name : 'Add school name'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {academicInput?.school_country ? academicInput.school_country : 'Add school country'}
                </p>
              </div>
              <div className="surface-subcard p-3">
                <p className="eyebrow">Graduation</p>
                <p className="text-sm font-semibold text-foreground">
                  {academicInput?.graduation_year ? academicInput.graduation_year : 'Set graduation year'}
                </p>
                <p className="text-xs text-muted-foreground">{academicInput?.desired_start_date ?? 'Start date not set'}</p>
              </div>
              <div className="surface-subcard p-3">
                <p className="eyebrow">Top subjects</p>
                <p className="text-sm font-semibold text-foreground">{subjectHighlights.join(' • ') || 'Add subjects'}</p>
              </div>
              <div className="surface-subcard p-3">
                <p className="eyebrow">Admissions tests</p>
                <p className="text-sm font-semibold text-foreground">{admissionsLabel}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild className="rounded-xl">
                <Link href="/profile/wizard?step=academic_details">Edit academics</Link>
              </Button>
            </div>
          </div>
        </AnimatedGridItem>
      </AnimatedGrid>
      {outcomeHints.length > 0 ? (
        <AnimatedSection delay={0.08}>
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-e-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={PROFILE_SECTION_VISUAL.aspirations.swatch}>
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className={cn('eyebrow', PROFILE_SECTION_VISUAL.aspirations.text)}>
                  Top gains available
                </p>
                <p className="text-sm font-semibold text-foreground">{outcomeHints[0].title}</p>
                <p className="text-xs text-muted-foreground">{outcomeHints[0].detail}</p>
              </div>
            </div>
            <Button size="sm" asChild className="shrink-0">
              <Link href={`/profile/wizard?step=${nextStepKey}`}>Open wizard</Link>
            </Button>
          </div>
        </AnimatedSection>
      ) : null}
      {completionPercent === 100 && (
        <AnimatedSection delay={0.12}>
          <div className="rounded-4xl border border-success/30 bg-success-subtle p-8">
            <p className="text-base font-semibold text-success">Profile complete</p>
            <p className="mt-2 text-sm text-muted-foreground">
              All sections are filled in. You can revisit the wizard anytime from the top of this page to update details.
            </p>
          </div>
        </AnimatedSection>
      )}
      <AscendiCoachMount />
    </DashboardShell>
  );
}
