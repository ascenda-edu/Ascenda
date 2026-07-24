'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerActionSupabaseClient } from '@/lib/supabase/server';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import { buildStudentProfilePayload } from '@/lib/scoring/student_score_loader';
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
    const { supabase, userId } = await ensureUser();
    await writeStudentIntake(supabase, userId, payload);

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

export const recalculateStudentScore = async () => {
  const { supabase, userId } = await ensureUser();
  const payload = await buildStudentProfilePayload(supabase, userId);
  if (!payload) {
    throw new Error('Profile intake data is incomplete');
  }
  const scoring = scoreStudentProfile(payload);
  const { error } = await supabase.from('student_scores').upsert({
    profile_id: userId,
    total_score: scoring.total_score,
    student_band: scoring.student_band,
    eligibility_flags: scoring.eligibility_flags,
    readiness_flags: scoring.readiness_flags,
    breakdown: scoring.breakdown
  });
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { success: true };
};

export const resubmitStudentProfile = async () => {
  const { supabase, userId } = await ensureUser();
  const payload = await buildStudentProfilePayload(supabase, userId);
  if (!payload) {
    return { success: false, message: 'Profile intake data is incomplete.' };
  }
  return saveStudentIntake(payload);
};
