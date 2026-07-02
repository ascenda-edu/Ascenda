import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

// Shared route-handler guards.

/** Parse a JSON body without letting a malformed payload throw a 500. */
export const parseJsonBody = async <T = Record<string, unknown>>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

const DEMO_COUNSELLOR_EMAIL = 'greg@workiflow.com';

/**
 * In-app mirror of the can_act_as_counsellor() RLS helper — counsellor/admin
 * role, or the single-account demo. RLS remains the real enforcement; this is
 * defense in depth so a dropped policy fails closed at the route too.
 */
export const canActAsCounsellor = async (
  supabase: SupabaseClient<any, any, any>,
  user: User
): Promise<boolean> => {
  if ((user.email ?? '').toLowerCase() === DEMO_COUNSELLOR_EMAIL) return true;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return data?.role === 'counsellor' || data?.role === 'admin';
};
