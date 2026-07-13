-- Notifications now carry an audience tag (student | counsellor) so that
-- one Supabase auth user (the demo) can hold two distinct inboxes — one
-- for what they see as a student, one for what they see as a counsellor.
--
-- The navbar bell and drawer hooks filter by the audience matching the
-- side the user is currently viewing.

alter table notifications
  add column if not exists audience text not null default 'student'
    check (audience in ('student', 'counsellor'));

create index if not exists notifications_audience_inbox_idx
  on notifications (profile_id, audience, read_at, created_at desc);

-- Trigger: route the help-request notification to the COUNSELLOR side,
-- not back to the student. The notification still lives on the same
-- profile_id (single-user demo) but is tagged audience='counsellor' so
-- only the counsellor bell sees it.
create or replace function notify_on_help_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, audience, kind, title, body, href)
  values (
    new.student_profile_id,
    'counsellor',
    'help_request',
    'New help request from Greg',
    coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
    '/counsellor?help=' || new.id::text
  );
  return new;
end;
$$;
