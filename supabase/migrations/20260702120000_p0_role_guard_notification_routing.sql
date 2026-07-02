-- P0 security + notification-routing fixes from the 2026-07-02 audit.
--
-- 1. profiles.role escalation guard. profiles_self_access (schema.sql) covers
--    UPDATE with no column restriction, so any student could set their own
--    role='admin' from the browser console and unlock the counsellor/admin
--    read policies. A BEFORE UPDATE trigger rejects role changes unless the
--    caller is an admin or a server-side context (service_role / direct SQL,
--    where auth.uid() is null).
--
-- 2. Student→counsellor notifications move into SECURITY DEFINER triggers.
--    notifications_insert RLS only lets a user insert onto their OWN profile
--    row (or counsellors onto students'), so the client-side inserts in
--    use-help-thread.ts could never reach a real counsellor account — they
--    landed on the student's own row tagged audience='counsellor', readable
--    by nobody but the student. Triggers on help_messages / help_meetings now
--    fan out to every counsellor/admin profile (plus the single-account demo
--    profile, which plays both sides), and the help_requests trigger is fixed
--    the same way. Notification copy uses real profile names instead of the
--    hardcoded demo "Greg"/"Sarah".
--
-- Idempotent and self-contained: the remote migration history is divergent
-- (see scripts/apply-sql.ts), so this file must be safe to apply on its own
-- and to re-apply.

-- ── 1. Role escalation guard ─────────────────────────────────────────────────

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- Server-side contexts (service_role key, seed scripts, SQL editor) carry
    -- no auth.uid(); they stay trusted. End users must already be admins.
    if auth.uid() is not null
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'changing profiles.role requires an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  before update on profiles
  for each row
  execute function public.guard_profile_role_change();

-- ── 2. Notification routing helpers ──────────────────────────────────────────

-- Every profile that should receive counsellor-audience notifications:
-- real counsellor/admin accounts, plus the single-account demo profile
-- (greg@workiflow.com), which holds the counsellor inbox for demo sessions.
create or replace function public.counsellor_notification_targets()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where role in ('counsellor', 'admin')
  union
  select u.id from auth.users u where lower(u.email) = 'greg@workiflow.com';
$$;

create or replace function public.profile_display_name(p_profile_id uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(full_name), ''), p_fallback) from profiles where id = p_profile_id;
$$;

-- ── 3. help_requests insert → notify the right side, with real names ─────────

create or replace function notify_on_help_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
begin
  if new.initiated_by = 'counsellor' then
    -- Counsellor reached out first: notify the student.
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'counsellor_message',
      'Message from your counsellor',
      coalesce(new.subject, new.body),
      '/inbox?help=' || new.id::text,
      'student'
    );
  else
    -- Student raised a help request: fan out to the counsellor side.
    student_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_request',
      'New help request from ' || student_name,
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/counsellor?help=' || new.id::text,
      'counsellor'
    from public.counsellor_notification_targets() as target;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_request_notify on help_requests;
create trigger trg_help_request_notify
  after insert on help_requests
  for each row
  execute function notify_on_help_request_insert();

-- ── 4. help_messages insert → notify the other side ──────────────────────────
-- Replaces the client-side inserts in use-help-thread.ts (removed in the same
-- commit): a student session cannot insert onto a counsellor's profile row
-- under notifications_insert RLS, so this has to happen server-side.

create or replace function public.notify_on_help_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  if new.author_role = 'counsellor' then
    author_name := coalesce(public.profile_display_name(new.author_profile_id, null), 'Your counsellor');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      hr.student_profile_id,
      'help_reply_from_counsellor',
      author_name || ' replied to your help request',
      left(new.body, 120),
      '/applications?help=' || new.request_id::text,
      'student'
    from help_requests hr
    where hr.id = new.request_id;
  else
    author_name := coalesce(public.profile_display_name(new.author_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_reply_from_student',
      author_name || ' replied to a help request',
      left(new.body, 120),
      '/counsellor?help=' || new.request_id::text,
      'counsellor'
    from public.counsellor_notification_targets() as target;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_message_notify on help_messages;
create trigger trg_help_message_notify
  after insert on help_messages
  for each row
  execute function public.notify_on_help_message_insert();

-- ── 5. help_meetings → notify on proposal and status changes ─────────────────

-- The updater records which side acted; auth.uid() cannot distinguish the two
-- sides of the single-account demo.
alter table help_meetings
  add column if not exists status_changed_by text
  check (status_changed_by in ('student', 'counsellor'));

create or replace function public.notify_on_help_meeting_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  counsellor_name text;
begin
  counsellor_name := coalesce(public.profile_display_name(new.counsellor_profile_id, null), 'Your counsellor');
  insert into notifications (profile_id, kind, title, body, href, audience)
  values (
    new.student_profile_id,
    'help_meeting_proposed',
    counsellor_name || ' proposed a meeting',
    new.title || ' · ' || to_char(new.scheduled_for, 'Dy DD Mon, HH24:MI'),
    '/applications?help=' || new.request_id::text,
    'student'
  );
  return new;
end;
$$;

drop trigger if exists trg_help_meeting_insert_notify on help_meetings;
create trigger trg_help_meeting_insert_notify
  after insert on help_meetings
  for each row
  execute function public.notify_on_help_meeting_insert();

create or replace function public.notify_on_help_meeting_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  actor_name text;
  verb text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  actor := coalesce(
    new.status_changed_by,
    case when auth.uid() = new.student_profile_id then 'student' else 'counsellor' end
  );
  verb := case new.status
    when 'confirmed' then 'confirmed'
    when 'cancelled' then 'cancelled'
    when 'completed' then 'marked complete'
    else 'updated'
  end;

  if actor = 'student' then
    actor_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_meeting_' || new.status,
      actor_name || ' ' || verb || ' a meeting',
      new.title || ' · ' || to_char(new.scheduled_for, 'Dy DD Mon, HH24:MI'),
      '/counsellor?help=' || new.request_id::text,
      'counsellor'
    from public.counsellor_notification_targets() as target;
  else
    actor_name := coalesce(public.profile_display_name(new.counsellor_profile_id, null), 'Your counsellor');
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'help_meeting_' || new.status,
      actor_name || ' ' || verb || ' a meeting',
      new.title || ' · ' || to_char(new.scheduled_for, 'Dy DD Mon, HH24:MI'),
      '/applications?help=' || new.request_id::text,
      'student'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_meeting_status_notify on help_meetings;
create trigger trg_help_meeting_status_notify
  after update on help_meetings
  for each row
  execute function public.notify_on_help_meeting_status();
