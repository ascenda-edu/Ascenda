import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

// The demo-user discriminator; override per environment without a code change.
export const DEMO_EMAIL =
  process.env.NEXT_PUBLIC_DEMO_EMAIL?.trim().toLowerCase() || 'greg@workiflow.com';

const normalize = (email?: string | null) => email?.trim().toLowerCase() ?? null;

export const isDemoUser = (email?: string | null): boolean => normalize(email) === DEMO_EMAIL;

export const isDemoProfile = async (
  supabase: SupabaseClient<Database>,
  profileId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('student_personal_information')
    .select('email')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) {
    console.warn('isDemoProfile: failed to load email', error);
    return false;
  }

  return isDemoUser(data?.email);
};
