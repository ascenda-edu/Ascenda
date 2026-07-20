// Shared chat mode resolution + authorization for the Ascendi endpoints.
//
// DEMO POSTURE: `mode` is client-supplied and only enum-validated, NOT bound to
// profiles.role — so any signed-in user can request counsellor/parent context,
// exactly as they can open /counsellor and /parent today. Binding counsellor
// mode to canActAsCounsellor() is a no-op under the demo posture (the guard is
// open to every authenticated user), but tightening that RLS at real onboarding
// automatically closes this chat privilege-escalation path — no change needed
// at the call sites. When restoring the profiles.role check (see the matching
// markers in counsellor/layout.tsx and parent/layout.tsx), bind `mode` to the
// user's role here too.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { canActAsCounsellor } from '@/lib/api/guards';
import type { ChatMode } from '@/lib/chat/prompts';

const VALID_MODES: ChatMode[] = ['student', 'counsellor', 'parent'];

export type ResolveChatModeResult =
  | { ok: true; mode: ChatMode }
  | { ok: false; reason: 'forbidden' };

/**
 * Resolve the client-supplied mode to a valid ChatMode (falling back to
 * 'student') and authorize counsellor mode against the counsellor seam. Returns
 * a discriminated result so each route can map a failure to its own 403 body.
 */
export const resolveChatMode = async (
  supabase: SupabaseClient<any, any, any>,
  user: User,
  rawMode: unknown
): Promise<ResolveChatModeResult> => {
  const mode: ChatMode = VALID_MODES.includes(rawMode as ChatMode)
    ? (rawMode as ChatMode)
    : 'student';

  if (mode === 'counsellor' && !(await canActAsCounsellor(supabase, user))) {
    return { ok: false, reason: 'forbidden' };
  }

  return { ok: true, mode };
};
