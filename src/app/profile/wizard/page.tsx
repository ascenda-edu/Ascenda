import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentIntakeForm } from '../_components/StudentIntakeForm';
import { type StepCompletionMap } from '@/lib/profile/steps';
import { WIZARD_SCREENS, indexForScreenKey } from '@/lib/profile/wizard-screens';
import { buildStepCompletion, type ProfileRecordGroup } from '@/lib/profile/completion';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { buildStudentProfilePayload } from '@/lib/scoring/student_score_loader';
import { ArrowLeft, Download } from 'lucide-react';

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

  /**
   * Which screen the student is about to work on — the one piece of orienting
   * information the top bar adds that the rail does not already carry.
   *
   * This is all that survives of the old `PageHero`. The three-audience title and
   * description that used to sit here (first-timer / returning / finished) are gone
   * along with it: the returning-student payload — how many sections stand between
   * them and their matches — now lives in the rail, derived from live form state
   * rather than a server snapshot that went stale the moment they answered anything,
   * and `/welcome` already frames the flow for a first-timer. What the hero cost was
   * roughly 250px of the scarcest space on a form, above the fold.
   */
  const currentStepDetail =
    requestedScreen?.railLabel ?? firstUnfinishedScreen?.railLabel ?? 'Review details';

  return (
    /**
     * A full-height FRAME, not a document column.
     *
     * `min-h-screen`, deliberately not `min-h-dvh` — Tailwind is pinned at 3.3.5 and
     * `dvh` units landed in 3.4, so `min-h-dvh` would typecheck, lint and build
     * cleanly while emitting no CSS at all.
     *
     * This route renders no `DashboardShell` and that stays true: middleware routes
     * new students straight here, and a sidebar full of exits is the wrong thing to
     * offer somebody mid-intake. But skipping the shell had also meant skipping the
     * shell's GEOMETRY — this was the only student page that stopped growing at
     * `max-w-5xl` (~1024px) while every other one runs to `max-w-[120rem]`, which is
     * why it alone left a wide monitor half empty. The two inner rows below now use
     * the same `shell-gutter mx-auto max-w-[120rem]` pair as `shell.tsx`, so the
     * wizard's edges line up with the rest of the app and grow at the same rate.
     */
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      {/* One soft brand wash, top-left — the same declaration as `(auth)/layout.tsx`
        * and `role-select`, the app's two other chrome-free pages. It replaces an
        * `AnimatedBlobBanner`: two 120px-blur animated blobs read as muddy
        * decoration behind a full-bleed frame, and dropping it takes an animated
        * component off this route's first-paint path. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_55%)]"
      />

      {/* ── The only chrome ──
        * This replaces four stacked layers: a utility row, a breadcrumb trail, a
        * PageHero and its highlight pill. `sticky` because on a form this long the
        * way out should not require scrolling back to the top — and because the
        * rail's `lg:top-20` and the mobile meter's `top-14` are both measured from
        * a bar that stays put. */}
      <header className="sticky top-0 z-nav shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="shell-gutter mx-auto flex h-14 w-full max-w-[120rem] items-center gap-3">
          {/* The breadcrumb's actual job, said plainly. Saving is per-step and
            * already flushed on blur, so leaving is safe and the label can promise
            * it without hedging. */}
          <Link
            href="/profile"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Exit setup
          </Link>

          <span aria-hidden className="h-4 w-px shrink-0 bg-primary/20" />

          <p className="flex min-w-0 items-center gap-2">
            <span className="eyebrow hidden shrink-0 sm:inline">Setup</span>
            <span className="truncate text-sm font-semibold text-foreground">{currentStepDetail}</span>
          </p>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button asChild size="sm" variant="ghost" className="gap-2">
              <a href="/api/profile/export" download>
                <Download className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Download CSV</span>
                <span className="sr-only sm:hidden">Download CSV</span>
              </a>
            </Button>
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      {/* `flex-1` so the form's two-column row can stretch to the floor — that is
        * what lets the rail's dividing rule run the full height of the frame
        * instead of ending with a short card. */}
      <div className="shell-gutter relative z-raised mx-auto flex w-full max-w-[120rem] flex-1 flex-col pb-16 pt-6">
        <StudentIntakeForm
          initialStep={initialStep}
          initialPayload={initialPayload}
          /* The account already knows this. Asking for it again was a free field to
             delete from the most admin-heavy screen in the flow. */
          accountEmail={user.email ?? ''}
        />
      </div>
    </div>
  );
}
