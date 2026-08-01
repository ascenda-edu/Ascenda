'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerActionSupabaseClient } from '@/lib/supabase/server';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { formatIntakeIssues, studentProfilePayloadSchema } from '@/lib/profile/intake-schema';
import { writeStudentIntake } from '@/lib/profile/persist-intake';

const ensureUser = async () => {
  const supabase = await createServerActionSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }
  return { supabase, userId: user.id };
};

const clearOnboardingCache = async () => {
  const cookieStore = await cookies();
  cookieStore.set('onboarding_complete', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  });
  cookieStore.set('onboarding_status', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  });
};

export const saveStudentIntake = async (payload: StudentProfilePayload) => {
  try {
    // Authenticate FIRST. This is a public POST endpoint, so an anonymous caller
    // must not be able to probe the payload schema by submitting shapes and
    // reading back which fields were rejected.
    const { supabase, userId } = await ensureUser();

    // Only now is the body worth parsing. The `StudentProfilePayload` annotation
    // is erased at runtime, so this parse is the only thing standing between
    // caller-controlled JSON and a six-table write. `parsed.data` is used below
    // rather than `payload` so unknown keys are stripped before that write.
    const parsed = studentProfilePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.error('Profile intake validation failed', formatIntakeIssues(parsed.error));
      return {
        success: false,
        message: 'Some of your answers could not be saved. Please review the form and try again.'
      };
    }

    await writeStudentIntake(supabase, userId, parsed.data);

    await clearOnboardingCache();
    revalidatePath('/profile');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save profile.';
    console.error('Profile intake save failed', error);
    return { success: false, message };
  }
};

// `recalculateStudentScore` and `resubmitStudentProfile` were removed here.
//
// Both had zero callers, but every export of a `'use server'` module is
// registered as a live POST endpoint — so they were reachable surface that no
// code path exercised and no test covered. `recalculateStudentScore` also
// duplicated `POST /api/profile/recalculate-score` line for line, which is the
// version the app actually calls; two copies of a scoring write is exactly the
// drift this refactor is removing.
