import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentIntakeForm } from '../_components/StudentIntakeForm';
import { PROFILE_STEPS, type StepCompletionMap } from '@/lib/profile/steps';
import { WIZARD_SCREENS, indexForScreenKey } from '@/lib/profile/wizard-screens';
import { buildStepCompletion, isProfileComplete, type ProfileRecordGroup } from '@/lib/profile/completion';
import { AnimatedBlobBanner } from '@/components/animated-blob-banner';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { buildStudentProfilePayload } from '@/lib/scoring/student_score_loader';
import { PageHero } from '@/components/layout/page-hero';
import { Download } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Profile setup'
};

interface ProfileWizardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfileWizardPage(props: ProfileWizardPageProps) {
  const searchParams = await props.searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // maybeSingle + Promise.all: new users have no rows yet, and the four
  // queries are independent — no reason to waterfall them.
  const [{ data: personal }, { data: academicInput }, { data: lifestyle }, { data: subjects }, initialPayload] =
    await Promise.all([
      supabase.from('student_personal_information').select('*').eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_academic_input').select('*').eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_lifestyle_preference').select('*').eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_subjects').select('id').eq('profile_id', user.id),
      buildStudentProfilePayload(supabase, user.id).catch((error) => {
        console.error('Failed to preload intake payload', error);
        return null;
      })
    ]);

  const recordGroup: ProfileRecordGroup = {
    personal: personal ?? null,
    academicInput: academicInput ?? null,
    subjectCount: subjects?.length ?? 0,
    lifestyle: lifestyle ?? null
  };
  const stepCompletion: StepCompletionMap = buildStepCompletion(recordGroup);
  const hasCompletedProfile = isProfileComplete(recordGroup);

  /**
   * Where to open, in SCREEN terms.
   *
   * An explicit `?step=` wins. Otherwise land on the first screen the student has not
   * finished — which is now computed per SCREEN rather than per section, because two
   * screens share a section: a student who has picked a subject area but not entered
   * their school has finished neither `academic_input` nor the School screen, and
   * sending them back to Subject area would make them re-answer a question they
   * already answered.
   */
  const stepParamRaw = searchParams?.step;
  const stepParam = Array.isArray(stepParamRaw) ? stepParamRaw[0] : stepParamRaw;
  const requestedScreen = WIZARD_SCREENS.find((screen) => screen.key === stepParam);

  const firstUnfinishedScreen = WIZARD_SCREENS.find((screen) => {
    if (!screen.section) return false;
    return !stepCompletion[screen.section];
  });
  const initialStep = requestedScreen
    ? indexForScreenKey(requestedScreen.key)
    : firstUnfinishedScreen
      ? indexForScreenKey(firstUnfinishedScreen.key)
      : 1;

  // Which screen the student is about to work on. Fed to PageHero's `highlight`
  // rather than a stats row: the rail below already counts screens, so naming
  // the one in front of them is the part the hero can add.
  const currentStepDetail =
    requestedScreen?.railLabel ?? firstUnfinishedScreen?.railLabel ?? 'Review details';

  /**
   * Whether this is a RETURNING student with real saved work.
   *
   * Drives the hero copy. Greeting somebody who is most of the way through with
   * "Let's set you up" is the wrong sentence — they have already been set up, and what
   * they need to know is what is left. `initialPayload` alone is not enough evidence:
   * an all-null row exists for anyone who ever pressed "Skip for now", so this asks
   * whether any SECTION is actually complete.
   */
  const completedSections = PROFILE_STEPS.filter((step) => stepCompletion[step.key]).length;
  const isReturning = completedSections > 0;
  const essentialsLeft = PROFILE_STEPS.filter(
    (step) => step.tier === 'essential' && !stepCompletion[step.key]
  ).length;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-12 sm:px-6 lg:px-10">
        {/* Utility row. The theme toggle lives HERE, not in the form body — it is
          * page chrome, and inside the form it occupied the slot where the step
          * heading belongs. */}
        <div className="relative z-overlay flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
          <Button asChild size="sm" variant="ghost" className="gap-2">
            <a href="/api/profile/export" download>
              <Download className="h-4 w-4" aria-hidden />
              Download CSV
            </a>
          </Button>
          <ThemeToggle compact />
        </div>

        <PageHero
          tone="student"
          eyebrow="Setup"
          /* The hand-rolled Dashboard / Back-to-profile link row is gone: PageHero
           * has had a `breadcrumbs` slot all along, and it puts the escape route
           * where it sits on every other page in the app. */
          breadcrumbs={<Breadcrumbs items={[{ label: 'Profile', href: '/profile' }, { label: 'Setup' }]} />}
          title={
            hasCompletedProfile ? 'Your profile' : isReturning ? 'Welcome back' : "Let's set you up"
          }
          /**
           * THREE audiences, three openings. A first-timer needs to know what the next
           * few minutes buy them. A returning student part-way through needs to know
           * what is LEFT — "everything you saved is already filled in" answers a
           * question they were not asking, while the number of sections between them
           * and their matches is the thing they came back for. Someone finished needs
           * to know nothing is outstanding.
           */
          description={
            hasCompletedProfile
              ? 'Everything is in. Edit any section and we will re-run your matches.'
              : isReturning
                ? essentialsLeft > 0
                  ? `Everything you saved is still here. ${essentialsLeft} ${essentialsLeft === 1 ? 'section' : 'sections'} left before your matches unlock.`
                  : 'Your essentials are done and your matches are live — what is left only sharpens the ranking.'
                : "A few quick questions and we'll personalise your matches, deadlines, and counsellor updates. Nothing here is permanent."
          }
          highlight={hasCompletedProfile ? 'All done' : currentStepDetail}
          /* `stats` deliberately dropped. "Completed 2/5 · Current step 3 ·
           * Status In progress" restated the rail sitting 24px below it, and cost
           * ~90px of the scarcest space on a form: above the fold. */
        />

        {/* The form owns its own surfaces now — the rail is one card and the step
          * body is another, which reads as map + work. A single wrapper card
          * around both made the rail look like part of the form, and since the
          * rail became a `surface-card` it would have nested one card in another. */}
        <StudentIntakeForm
          initialStep={initialStep}
          initialPayload={initialPayload}
          /* The account already knows this. Asking for it again was a free field to
             delete from the most admin-heavy screen in the flow. */
          accountEmail={user.email ?? ''}
        />
      </div>
      <AnimatedBlobBanner className="opacity-60 -z-raised" variant="cool" />
    </div>
  );
}
