import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentIntakeForm } from '../_components/StudentIntakeForm';
import { PROFILE_STEPS, type StepCompletionMap } from '@/lib/profile/steps';
import { buildStepCompletion, isProfileComplete, type ProfileRecordGroup } from '@/lib/profile/completion';
import { AnimatedBlobBanner } from '@/components/animated-blob-banner';
import { Button } from '@/components/ui/button';
import { buildStudentProfilePayload } from '@/lib/scoring/student_score_loader';
import { PageHero } from '@/components/layout/page-hero';
import Link from 'next/link';
import { Download, Home, User } from 'lucide-react';

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

  const completedCount = Object.values(stepCompletion).filter(Boolean).length;
  const currentStepDetail = requestedStep?.title ?? nextStep?.title ?? 'Review details';

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-20 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-[100] pointer-events-auto">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </Link>
            <div className="w-px h-4 bg-border/50" />
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
            >
              <User className="w-4 h-4" />
              Back to profile
            </Link>
          </div>
          <Button asChild size="sm" variant="secondary" className="gap-2 rounded-xl shadow-sm">
            <a href="/api/profile/export" download>
              <Download className="w-4 h-4" />
              Download CSV
            </a>
          </Button>
        </div>
        <PageHero
          tone="student"
          eyebrow="Setup"
          title="Let's set you up"
          description="A few quick questions and we'll personalize your matches, deadlines, and counsellor updates. You can always come back and edit."
          highlight={hasCompletedProfile ? 'All done' : 'Step ' + initialStep + ' of ' + PROFILE_STEPS.length}
          stats={[
            { label: 'Completed', value: completedCount + '/' + PROFILE_STEPS.length, detail: 'Sections finished' },
            { label: 'Current step', value: String(initialStep), detail: currentStepDetail },
            { label: 'Status', value: hasCompletedProfile ? 'Ready' : 'In progress', detail: hasCompletedProfile ? 'Update anytime' : 'More detail improves matches' }
          ]}
        />

        <div className="surface-card surface-card--static rounded-[28px] p-6">
          <StudentIntakeForm initialStep={initialStep} initialPayload={initialPayload} />
        </div>
      </div>
      <AnimatedBlobBanner className="opacity-60 -z-10" variant="cool" />
    </div>
  );
}
