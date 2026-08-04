import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentIntakeForm } from '../_components/StudentIntakeForm';
import { PROFILE_STEPS, type StepCompletionMap } from '@/lib/profile/steps';
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
  const nextStep = PROFILE_STEPS.find((step) => !stepCompletion[step.key]);

  const stepParamRaw = searchParams?.step;
  const stepParam = Array.isArray(stepParamRaw) ? stepParamRaw[0] : stepParamRaw;
  const requestedStep = PROFILE_STEPS.find((step) => step.key === stepParam);
  const initialStep = requestedStep ? PROFILE_STEPS.indexOf(requestedStep) + 1 : nextStep ? PROFILE_STEPS.indexOf(nextStep) + 1 : 1;

  // Which section the student is about to work on. Fed to PageHero's `highlight`
  // rather than a stats row: the rail below already counts sections, so naming
  // the one in front of them is the part the hero can add.
  const currentStepDetail = requestedStep?.title ?? nextStep?.title ?? 'Review details';

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
          title={hasCompletedProfile ? 'Your profile' : "Let's set you up"}
          /* Two audiences, two openings. A first-timer needs to know what they
           * get for the next four minutes; a returning student needs to know
           * their work is still there. */
          description={
            initialPayload
              ? 'Pick up where you left off — everything you saved is already filled in, and you can edit any section.'
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
        <StudentIntakeForm initialStep={initialStep} initialPayload={initialPayload} />
      </div>
      <AnimatedBlobBanner className="opacity-60 -z-raised" variant="cool" />
    </div>
  );
}
