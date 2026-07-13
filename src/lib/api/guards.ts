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

/**
 * In-app mirror of the can_act_as_counsellor() RLS helper. The counsellor side
 * is open to every signed-in user (20260712130000 migration), so any
 * authenticated user passes. Restore the profiles.role lookup here and in the
 * DB function to re-restrict.
 */
export const canActAsCounsellor = async (
  _supabase: SupabaseClient<any, any, any>,
  user: User
): Promise<boolean> => Boolean(user);
