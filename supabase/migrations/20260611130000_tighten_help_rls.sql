-- Replace the demo-permissive `using (true)` policies on the help/notification
-- tables with participant-scoped policies.
--
-- Access model:
--   • Students see and write only their own help requests, the messages and
--     meetings on those requests, and their own notifications.
--   • Counsellors (profiles.role in 'counsellor'/'admin') see all requests,
--     can reply, write private notes, propose meetings, and notify students.
--   • The single-account demo (greg@workiflow.com) plays both sides with one
--     login, so it is treated as counsellor-capable. Remove is_demo_account()
--     from can_act_as_counsellor() when the demo account is retired.
--
-- SECURITY DEFINER is required on is_counsellor(): an invoker-rights select
-- from profiles inside a policy is the classic Supabase RLS recursion trap.

create or replace function public.is_counsellor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('counsellor', 'admin')
  );
$$;

create or replace function public.is_demo_account()
returns boolean
language sql
stable
as $$
  select coalesce(lower(coalesce(auth.jwt() ->> 'email', '')) = 'greg@workiflow.com', false);
$$;

create or replace function public.can_act_as_counsellor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_counsellor() or public.is_demo_account();
$$;

grant execute on function public.is_counsellor() to authenticated;
grant execute on function public.is_demo_account() to authenticated;
grant execute on function public.can_act_as_counsellor() to authenticated;

-- ── help_requests ────────────────────────────────────────────────────────────

drop policy if exists help_requests_demo_all on help_requests;

drop policy if exists help_requests_select on help_requests;
create policy help_requests_select on help_requests
  for select to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists help_requests_insert on help_requests;
create policy help_requests_insert on help_requests
  for insert to authenticated
  -- Students file requests as themselves; counsellors may open
  -- counsellor-initiated threads on behalf of a student.
  with check (student_profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists help_requests_update on help_requests;
create policy help_requests_update on help_requests
  for update to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor())
  with check (student_profile_id = auth.uid() or public.can_act_as_counsellor());

-- ── help_messages ────────────────────────────────────────────────────────────

drop policy if exists help_messages_demo_all on help_messages;

drop policy if exists help_messages_select on help_messages;
create policy help_messages_select on help_messages
  for select to authenticated
  using (
    public.can_act_as_counsellor()
    or exists (
      select 1 from help_requests hr
      where hr.id = help_messages.request_id and hr.student_profile_id = auth.uid()
    )
  );

drop policy if exists help_messages_insert on help_messages;
create policy help_messages_insert on help_messages
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    -- Only counsellor-capable users may speak as 'counsellor'.
    and (author_role = 'student' or public.can_act_as_counsellor())
    and (
      public.can_act_as_counsellor()
      or exists (
        select 1 from help_requests hr
        where hr.id = help_messages.request_id and hr.student_profile_id = auth.uid()
      )
    )
  );

-- ── help_notes (counsellor-private) ─────────────────────────────────────────

drop policy if exists help_notes_demo_all on help_notes;

drop policy if exists help_notes_select on help_notes;
create policy help_notes_select on help_notes
  for select to authenticated
  using (public.can_act_as_counsellor());

drop policy if exists help_notes_insert on help_notes;
create policy help_notes_insert on help_notes
  for insert to authenticated
  with check (public.can_act_as_counsellor() and author_profile_id = auth.uid());

-- ── help_meetings ────────────────────────────────────────────────────────────

drop policy if exists help_meetings_demo_all on help_meetings;

drop policy if exists help_meetings_select on help_meetings;
create policy help_meetings_select on help_meetings
  for select to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists help_meetings_insert on help_meetings;
create policy help_meetings_insert on help_meetings
  for insert to authenticated
  with check (public.can_act_as_counsellor() and counsellor_profile_id = auth.uid());

drop policy if exists help_meetings_update on help_meetings;
create policy help_meetings_update on help_meetings
  for update to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor())
  with check (student_profile_id = auth.uid() or public.can_act_as_counsellor());

-- ── notifications ────────────────────────────────────────────────────────────

drop policy if exists notifications_demo_all on notifications;

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert to authenticated
  -- Students may only notify themselves; counsellors may notify their
  -- students (e.g. reply pings, meeting proposals, document nudges).
  -- DB triggers that fan out notifications run SECURITY DEFINER and are
  -- unaffected by this policy.
  with check (profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications
  for delete to authenticated
  using (profile_id = auth.uid());
