// Shared chat mode resolution + authorization for the Ascendi endpoints.
//
// `mode` arrives from the client, so it is a REQUEST, not a fact. Each
// privileged mode is authorised against what the caller actually is before it is
// granted; an unauthorised request is refused rather than downgraded, so the
// caller cannot silently receive a different assistant than the UI is showing.
//
// This previously enum-validated `mode` and nothing else, on the reasoning that
// binding counsellor mode to canActAsCounsellor() was a no-op while that guard
// was open to everyone. It was — which meant any signed-in user could ask for
// counsellor mode and receive whole-cohort context in the prompt.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { canActAsCounsellor } from '@/lib/api/guards';
import type { ChatMode } from '@/lib/chat/prompts';
import { PARENT_PORTAL_OPEN_TO_ALL } from '@/lib/auth/policy';

const VALID_MODES: ChatMode[] = ['student', 'counsellor', 'parent'];

export type ResolveChatModeResult =
  | { ok: true; mode: ChatMode }
  | { ok: false; reason: 'forbidden' };

/**
 * A parent is someone with at least one active guardian_link — the same seam the
 * /parent portal scopes on. Without this, parent mode was reachable by any
 * signed-in user, and the parent prompt is built around another person's child.
 */
const hasActiveGuardianLink = async (
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<boolean> => {
  const { count, error } = await supabase
    .from('guardian_links')
    .select('id', { count: 'exact', head: true })
    .eq('parent_profile_id', userId)
    .eq('status', 'active');

  // Fail closed.
  if (error) return false;
  return (count ?? 0) > 0;
};

/**
 * Resolve the client-supplied mode to a ChatMode the caller is entitled to.
 *
 * An unrecognised mode falls back to 'student' (the least-privileged mode); a
 * recognised but unauthorised mode is refused, so each route can map the failure
 * to its own 403 body.
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

  // The parent limb tracks PARENT_PORTAL_OPEN_TO_ALL, for the same reason the
  // counsellor limb tracks can_act_as_counsellor(): the assistant must not be
  // stricter than the portal it lives in. While the portal is open, all six
  // /parent/* routes render for everyone, so refusing parent mode here 403'd
  // the assistant on every message for any account without a link — which is
  // most of them during development. That worked on origin/main (audit A1).
  //
  // This grants NO additional access, which is why it is safe to key off a
  // display flag. Parent mode is self-scoping downstream:
  //   - `buildParentContext` calls `loadLinkedChildren(supabase, userId)` and,
  //     with no link, returns the "no linked children — general guidance only"
  //     prompt carrying no child data at all;
  //   - its only tool is `counsellorMessageDeclaration`, gated on
  //     `hasParentContact`, which derives from that same context and is
  //     undefined without a link;
  //   - the tool registry grants parent mode nothing.
  // The real boundary is `loadLinkedChildren`, and it is untouched.
  //
  // When PARENT_PORTAL_OPEN_TO_ALL flips to false the link check returns
  // automatically, so the two cannot drift apart.
  if (mode === 'parent' && !PARENT_PORTAL_OPEN_TO_ALL && !(await hasActiveGuardianLink(supabase, user.id))) {
    return { ok: false, reason: 'forbidden' };
  }

  return { ok: true, mode };
};
