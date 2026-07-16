// Typed wrapper for the chat_feedback table (migration 20260717120000, which
// postdates the generated database.ts — the `any` cast is confined here, same
// convention as lib/demo/help-request-client.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatFeedbackUpsert } from '@/lib/types/demo-tables';

type AnyClient = SupabaseClient<any, any, any>;

/** One vote per (user, message) — a repeat click flips the stored rating. */
export const upsertChatFeedback = async (
  supabase: AnyClient,
  row: ChatFeedbackUpsert
): Promise<void> => {
  const { error } = await (supabase as any)
    .from('chat_feedback')
    .upsert(row, { onConflict: 'profile_id,message_hash' });
  if (error) throw error;
};
