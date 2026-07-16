-- Chat feedback: thumbs up/down on Ascendi chatbot answers, per user per
-- message (message identified by content hash; excerpt kept for triage).
--
-- Idempotent — safe to re-run via `npm run db:apply`. RLS: users insert /
-- read / update only their own rows; no delete (matches guardian_links
-- posture). The API route additionally server-sets profile_id.

create table if not exists chat_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('student', 'counsellor', 'parent')),
  message_hash text not null,
  message_excerpt text,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, message_hash)
);

create index if not exists chat_feedback_profile_idx
  on chat_feedback (profile_id, created_at desc);

alter table chat_feedback enable row level security;

drop policy if exists chat_feedback_insert_own on chat_feedback;
create policy chat_feedback_insert_own on chat_feedback
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists chat_feedback_select_own on chat_feedback;
create policy chat_feedback_select_own on chat_feedback
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists chat_feedback_update_own on chat_feedback;
create policy chat_feedback_update_own on chat_feedback
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
