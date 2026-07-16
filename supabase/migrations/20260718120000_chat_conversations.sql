-- ── Assistant workspace: DB-backed chat history ─────────────────────────────
--
-- chat_conversations + chat_messages back the full-page Assistant section
-- (/assistant, /counsellor/assistant, /parent/assistant). The floating widget
-- keeps localStorage history; only the Assistant surface persists here.
--
-- Scoping: strictly own-only via RLS — conversations by owner_id, messages via
-- ownership of the parent conversation. Deliberately does NOT route through
-- can_act_as_counsellor(): chat history is private even under the open demo
-- posture. `mode` is a display/scoping label, not an authorization boundary.
--
-- last_message_at is bumped by an AFTER INSERT trigger (in-house idiom, see
-- help_requests) rather than a generic updated_at.
--
-- Idempotent — safe to re-apply via `npm run db:apply <file>`. Backported into
-- supabase/schema.sql.

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('student', 'counsellor', 'parent')),
  title text,
  pinned boolean not null default false,
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_conversations_owner_idx
  on chat_conversations (owner_id, pinned desc, last_message_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  action jsonb,
  action_state text check (action_state in ('pending', 'sent', 'cancelled')),
  tool_results jsonb,
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_messages_conversation_idx
  on chat_messages (conversation_id, created_at);

-- CRITICAL: without enabling RLS the policies below are inert.
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

drop policy if exists chat_conversations_all_own on chat_conversations;
create policy chat_conversations_all_own on chat_conversations
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Messages are authorised via ownership of the parent conversation. In the
-- WITH CHECK context the chat_messages reference resolves to the NEW row.
drop policy if exists chat_messages_all_own on chat_messages;
create policy chat_messages_all_own on chat_messages
  for all to authenticated
  using (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.owner_id = auth.uid()
    )
  );

-- Keep the conversation list ordered by activity without a generic updated_at.
create or replace function public.bump_chat_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update chat_conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_message_bump on chat_messages;
create trigger trg_chat_message_bump
  after insert on chat_messages
  for each row execute function public.bump_chat_conversation_last_message();
