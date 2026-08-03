import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireIdentity } from '@/lib/auth/identity';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { COMPLETION_COLUMNS, isProfileEssentialComplete } from '@/lib/profile/completion';
import { readOnboardingState, hasSeen } from '@/lib/onboarding/state';
import { resolveWelcomeDestination, safeReturnPath } from '@/lib/onboarding/destination';
import { WelcomeScreen } from './_components/welcome-screen';

export const metadata: Metadata = {
  title: 'Welcome to Ascenda'
};

export const dynamic = 'force-dynamic';

interface WelcomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The first screen a new user sees, and the piece the product was missing
 * entirely: before this, signing in dropped you straight into a five-screen
 * intake form with no explanation of what it was for or how long it would take.
 *
 * This page decides three things and renders one:
 *
 *   - A user who has never seen it gets the welcome.
 *   - A user who HAS seen it is forwarded to wherever they actually need to be —
 *     the wizard if their essentials are still incomplete, their destination
 *     otherwise. `middleware.ts` routes every incomplete student here precisely
 *     so this decision can be made in one place with the onboarding column in
 *     hand, instead of adding a fifth query to middleware's hot path.
 *   - A counsellor gets a different welcome, and is never blocked by it.
 *
 * The forwarding branch is what stops this becoming a screen people have to
 * dismiss on every navigation while they are mid-setup.
 */
export default async function WelcomePage(props: WelcomePageProps) {
  const searchParams = await props.searchParams;
  const identity = await requireIdentity();
  const supabase = await createServerSupabaseClient();

  const returnTo = safeReturnPath(searchParams?.from);
  const onboarding = await readOnboardingState(supabase, identity.userId);
  const alreadyWelcomed = hasSeen(onboarding, 'welcomed_at');

  if (identity.role !== 'student') {
    // Non-blocking by design, and `returnTo` is deliberately NOT honoured.
    //
    // `middleware.ts` DOES redirect these users here — it reads student profile
    // tables and never looks at `profiles.role`, so an account with no student
    // profile fails the gate permanently. Forwarding them to `?from=` therefore
    // sent them straight back into the gate, which sent them back here: an
    // inescapable redirect loop, one click away from `/role-select`'s "Student"
    // card. `resolveWelcomeDestination` returns an exempt path for every
    // non-student, which is what makes the flow terminate.
    const destination = resolveWelcomeDestination({
      role: identity.role,
      essentialsComplete: false,
      returnTo
    });
    if (alreadyWelcomed) redirect(destination);
    return <WelcomeScreen variant="counsellor" firstName={null} returnTo={destination} />;
  }

  const [personalResponse, academicResponse, lifestyleResponse, subjectsResponse] = await Promise.all([
    supabase
      .from('student_personal_information')
      // `COMPLETION_COLUMNS.personal` already leads with `first_name`, which the
      // greeting below reads — no need to name it twice.
      .select(COMPLETION_COLUMNS.personal)
      .eq('profile_id', identity.userId)
      .maybeSingle(),
    supabase
      .from('student_academic_input')
      .select(COMPLETION_COLUMNS.academicInput)
      .eq('profile_id', identity.userId)
      .maybeSingle(),
    supabase
      .from('student_lifestyle_preference')
      .select(COMPLETION_COLUMNS.lifestyle)
      .eq('profile_id', identity.userId)
      .maybeSingle(),
    supabase.from('student_subjects').select('id', { count: 'exact', head: true }).eq('profile_id', identity.userId)
  ]);

  // A failed read is not an empty profile — the same trap middleware documents
  // at length. Here the stakes are lower (a welcome screen, not a redirect
  // loop), so treat an error as "show the welcome": it is the branch that
  // cannot strand anyone, since its CTA leads to the wizard either way.
  const readFailed = Boolean(
    personalResponse.error ?? academicResponse.error ?? lifestyleResponse.error ?? subjectsResponse.error
  );

  const essentialsComplete =
    !readFailed &&
    isProfileEssentialComplete({
      personal: personalResponse.data ?? null,
      academicInput: academicResponse.data ?? null,
      subjectCount: subjectsResponse.count ?? 0,
      lifestyle: lifestyleResponse.data ?? null
    });

  // One decision, resolved once. Both the redirect and the button target read the
  // same value — computing it twice is how the two branches drift apart.
  const destination = resolveWelcomeDestination({
    role: identity.role,
    essentialsComplete,
    returnTo
  });

  if (alreadyWelcomed) redirect(destination);

  const firstName =
    (personalResponse.data as { first_name?: string | null } | null)?.first_name?.trim() ||
    identity.email?.split('@')[0] ||
    null;

  return <WelcomeScreen variant="student" firstName={firstName} returnTo={destination} />;
}
