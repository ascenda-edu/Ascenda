// Typed wrapper for chat_conversations / chat_messages (migration
// 20260718120000, postdates the generated database.ts — the `any` casts are
// confined here, per the help-request-client convention). Isomorphic: used
// browser-side by the Assistant workspace (rail CRUD, action/rating updates,
// handoff) and server-side by /api/chat (message persistence + auto-title).
// RLS enforces own-only access on every call.
//
// NOTE: action_state is client-writable, so "action history" derived from
// action_state='sent' is advisory — a convenience log, not proof-of-send.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChatConversationRow,
  ChatMessageActionState,
  ChatMessageInsert,
  ChatMessageRow,
} from '@/lib/types/demo-tables';
import type { ChatMode } from './prompts';

type AnyClient = SupabaseClient<any, any, any>;

const tbl = (supabase: AnyClient, name: string) => (supabase as any).from(name);

// Caps follow the help-request-client convention: bounded queries with DESC
// ordering so the cap drops the oldest rows.
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 200;

export const listConversations = async (
  supabase: AnyClient,
  ownerId: string,
  mode: ChatMode
): Promise<ChatConversationRow[]> => {
  const { data, error } = await tbl(supabase, 'chat_conversations')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('mode', mode)
    .order('pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(MAX_CONVERSATIONS);
  if (error) throw error;
  return (data ?? []) as ChatConversationRow[];
};

export const createConversation = async (
  supabase: AnyClient,
  row: { ownerId: string; mode: ChatMode; title?: string | null }
): Promise<{ id: string }> => {
  const { data, error } = await tbl(supabase, 'chat_conversations')
    .insert({ owner_id: row.ownerId, mode: row.mode, title: row.title ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
};

export const getConversation = async (
  supabase: AnyClient,
  id: string
): Promise<ChatConversationRow | null> => {
  const { data, error } = await tbl(supabase, 'chat_conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatConversationRow) ?? null;
};

export const renameConversation = async (
  supabase: AnyClient,
  id: string,
  title: string
): Promise<void> => {
  const { error } = await tbl(supabase, 'chat_conversations')
    .update({ title: title.trim().slice(0, 120) })
    .eq('id', id);
  if (error) throw error;
};

export const deleteConversation = async (supabase: AnyClient, id: string): Promise<void> => {
  const { error } = await tbl(supabase, 'chat_conversations').delete().eq('id', id);
  if (error) throw error;
};

export const togglePin = async (
  supabase: AnyClient,
  id: string,
  pinned: boolean
): Promise<void> => {
  const { error } = await tbl(supabase, 'chat_conversations').update({ pinned }).eq('id', id);
  if (error) throw error;
};

/** Last MAX_MESSAGES messages in chronological order (fetch desc, reverse). */
export const listMessages = async (
  supabase: AnyClient,
  conversationId: string
): Promise<ChatMessageRow[]> => {
  const { data, error } = await tbl(supabase, 'chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_MESSAGES);
  if (error) throw error;
  return ((data ?? []) as ChatMessageRow[]).reverse();
};

/** Most recent message in a conversation, or null. Used by the route to
 * detect a retry (same user text re-sent after an error) and skip the
 * duplicate insert. */
export const getLatestMessage = async (
  supabase: AnyClient,
  conversationId: string
): Promise<ChatMessageRow | null> => {
  const { data, error } = await tbl(supabase, 'chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatMessageRow) ?? null;
};

export const appendMessage = async (
  supabase: AnyClient,
  row: ChatMessageInsert
): Promise<{ id: string }> => {
  const { data, error } = await tbl(supabase, 'chat_messages')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
};

/** Bulk insert (widget → assistant handoff). */
export const appendMessages = async (
  supabase: AnyClient,
  rows: ChatMessageInsert[]
): Promise<void> => {
  if (rows.length === 0) return;
  const { error } = await tbl(supabase, 'chat_messages').insert(rows);
  if (error) throw error;
};

export const updateMessageAction = async (
  supabase: AnyClient,
  id: string,
  actionState: ChatMessageActionState,
  action?: Record<string, unknown>
): Promise<void> => {
  const { error } = await tbl(supabase, 'chat_messages')
    .update({ action_state: actionState, ...(action ? { action } : {}) })
    .eq('id', id);
  if (error) throw error;
};

export const setMessageRating = async (
  supabase: AnyClient,
  id: string,
  rating: 1 | -1
): Promise<void> => {
  const { error } = await tbl(supabase, 'chat_messages').update({ rating }).eq('id', id);
  if (error) throw error;
};

/** Sent actions across the owner's conversations of this mode, newest first.
 * Two-step on purpose: resolve conversation ids first, then filter messages
 * with .in() — no PostgREST embedded cross-table filter. */
export const listActionHistory = async (
  supabase: AnyClient,
  ownerId: string,
  mode: ChatMode
): Promise<ChatMessageRow[]> => {
  const conversations = await listConversations(supabase, ownerId, mode);
  if (conversations.length === 0) return [];
  const { data, error } = await tbl(supabase, 'chat_messages')
    .select('*')
    .in('conversation_id', conversations.map((c) => c.id))
    .eq('action_state', 'sent')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
};
