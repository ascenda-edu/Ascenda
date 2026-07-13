-- Meeting notifications: format the meeting time in the student's timezone.
--
-- The 20260702120000 notification triggers formatted new.scheduled_for with
-- to_char(...) evaluated in the DB session timezone (UTC). The client-side code
-- they replaced used the browser's local timezone, so meeting-time previews in
-- notifications shifted by the user's UTC offset (a 15:00 meeting for a UTC+8
-- student showed as 07:00). The authoritative meeting card in the drawer renders
-- the correct local time, so the notification and the card disagreed.
--
-- Fix: render scheduled_for in the student's stored IANA timezone
-- (student_personal_information.time_zone, captured by the intake form), with a
-- safe fall-back to UTC when it is missing or invalid.
--
-- Idempotent and self-contained: only replaces the two meeting-notification
-- functions in place (the triggers reference them by name and are untouched).

-- Format a timestamptz as local wall-clock in the given IANA timezone. Bad or
-- empty timezone strings must never break a meeting insert/update, so an invalid
-- zone falls back to UTC instead of raising.
create or replace function public.format_meeting_time(p_ts timestamptz, p_tz text)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  return to_char(p_ts at time zone coalesce(nullif(trim(p_tz), ''), 'UTC'), 'Dy DD Mon, HH24:MI');
exception when others then
  return to_char(p_ts at time zone 'UTC', 'Dy DD Mon, HH24:MI');
end;
$$;

-- ── meeting proposed → notify the student in their own timezone ──────────────
create or replace function public.notify_on_help_meeting_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  counsellor_name text;
  student_tz text;
begin
  counsellor_name := coalesce(public.profile_display_name(new.counsellor_profile_id, null), 'Your counsellor');
  select time_zone into student_tz
  from student_personal_information
  where profile_id = new.student_profile_id;

  insert into notifications (profile_id, kind, title, body, href, audience)
  values (
    new.student_profile_id,
    'help_meeting_proposed',
    counsellor_name || ' proposed a meeting',
    new.title || ' · ' || public.format_meeting_time(new.scheduled_for, student_tz),
    '/applications?help=' || new.request_id::text,
    'student'
  );
  return new;
end;
$$;

-- ── meeting status change → notify the other side, times in the student's tz ──
-- The meeting time is anchored to the student's local timezone for both
-- audiences (it is that student's meeting); this is consistent and never shows
-- raw UTC.
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
  student_tz text;
  when_label text;
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

  select time_zone into student_tz
  from student_personal_information
  where profile_id = new.student_profile_id;
  when_label := new.title || ' · ' || public.format_meeting_time(new.scheduled_for, student_tz);

  if actor = 'student' then
    actor_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_meeting_' || new.status,
      actor_name || ' ' || verb || ' a meeting',
      when_label,
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
      when_label,
      '/applications?help=' || new.request_id::text,
      'student'
    );
  end if;
  return new;
end;
$$;
