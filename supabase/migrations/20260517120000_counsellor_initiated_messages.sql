-- Phase 1 of in-app counsellor → student messaging.
--
-- Until now help_requests was always student-initiated. The counsellor side
-- only had mailto: links. We're moving those into the same help_messages
-- thread infrastructure so both directions live in one inbox.
--
-- Changes:
--   1. help_requests.initiated_by — 'student' (default, existing rows) or
--      'counsellor'. Drives notification copy + which side opens the thread
--      drawer first.
--   2. The auto-notification trigger now branches on initiated_by so a
--      counsellor-initiated request notifies the student with the right
--      copy and routes them to the student-side thread (not /counsellor).
--   3. application_id is already nullable on this table — no change needed.

alter table help_requests
  add column if not exists initiated_by text not null default 'student'
  check (initiated_by in ('student', 'counsellor'));

create or replace function notify_on_help_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.initiated_by = 'counsellor' then
    -- Counsellor reached out first. Notify the student, route them to
    -- the student-side thread so the bell drop-in opens the right surface.
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
    -- Student raised a help request. Notify the same profile (demo model)
    -- and route to the counsellor surface so the side-switch demo works.
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'help_request',
      'New help request from Greg',
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/counsellor?help=' || new.id::text,
      'counsellor'
    );
  end if;
  return new;
end;
$$;
