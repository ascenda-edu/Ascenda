import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { isDemoUser } from '@/lib/demo/demo-profile';

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
 * In-app mirror of the `can_act_as_counsellor()` RLS helper.
 *
 * Mirrors the SQL definition exactly — `is_counsellor() or is_demo_account()` —
 * so the two layers cannot disagree about who a counsellor is. If you change one,
 * change the other in the same commit.
 *
 * This previously returned `Boolean(user)`: "every signed-in user is a
 * counsellor", to open the counsellor surface for the demo. That made the in-app
 * check a no-op and left RLS as the only control — and the RLS helper had been
 * opened the same way, so in practice nothing was checking anything.
 */
export const canActAsCounsellor = async (
  supabase: SupabaseClient<any, any, any>,
  user: User
): Promise<boolean> => {
  // Mirrors public.is_demo_account(), which matches on the JWT email claim.
  if (isDemoUser(user.email)) {
    return true;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // Fail closed: an unreadable profile is not a counsellor.
  if (error || !data) {
    return false;
  }

  return data.role === 'counsellor' || data.role === 'admin';
};

export type StudentScopeResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'not_found' };

/**
 * Is `studentId` a profile that student-scoped records may be written against?
 *
 * The subject half of counsellor authorisation, shared by the REST routes and
 * the assistant's write tools so both apply the same rule. A tool that takes a
 * `student_id` from model output is exactly as untrusted as a route that takes
 * one from a request body — the model's arguments are influenced by conversation
 * content, which the user controls.
 */
export const isActionableStudent = async (
  supabase: SupabaseClient<any, any, any>,
  studentId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', studentId)
    .maybeSingle();

  if (error || !data) return false;
  return data.role === 'student';
};

/**
 * Authorise a counsellor action that names a specific student.
 *
 * Being a counsellor is necessary but NOT sufficient: a counsellor may only act
 * on students they are responsible for. Routes that took a `studentId` from the
 * request body and checked only "is the caller a counsellor" let any counsellor
 * write to any student's record — and while the counsellor guard was open, that
 * meant any signed-in user at all.
 *
 * The per-student half of this check is currently limited to "the target is a
 * real student profile", because the counsellor↔student relationship does not
 * exist as data yet — cohort membership is inferred from an email suffix, which
 * is not something authorisation can rest on. This function is the single seam
 * where the assignment lookup lands once that table exists; every caller is
 * routed through it, so closing that gap becomes a one-function change rather
 * than a re-audit of every route.
 */
export const assertCounsellorMayActOnStudent = async (
  supabase: SupabaseClient<any, any, any>,
  user: User,
  studentId: string
): Promise<StudentScopeResult> => {
  if (!(await canActAsCounsellor(supabase, user))) {
    return { ok: false, reason: 'forbidden' };
  }

  // Refuses unknown ids and non-student rows alike; both mean "not a subject you
  // may write against".
  if (!(await isActionableStudent(supabase, studentId))) {
    return { ok: false, reason: 'not_found' };
  }

  return { ok: true };
};

/**
 * Batch form of {@link assertCounsellorMayActOnStudent} — returns the subset of
 * `studentIds` the caller may act on, in one round trip.
 *
 * Returns `null` when the caller is not a counsellor at all, so callers can tell
 * "you may act on none of these" (403) apart from "none of these were valid
 * students" (an empty array, which is a 400/no-op rather than an authz failure).
 *
 * Bulk endpoints are where scoping bugs are most expensive: one request that
 * names N students writes N rows and, where a notification trigger is attached,
 * fires N notifications into N different people's feeds.
 */
export const filterActionableStudentIds = async (
  supabase: SupabaseClient<any, any, any>,
  user: User,
  studentIds: string[]
): Promise<string[] | null> => {
  if (!(await canActAsCounsellor(supabase, user))) {
    return null;
  }

  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .in('id', unique);

  // Fail closed: if we cannot confirm the subjects, we act on none of them.
  if (error || !data) return [];

  return (data as Array<{ id: string; role: string | null }>)
    .filter((row) => row.role === 'student')
    .map((row) => row.id);
};
