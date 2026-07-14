-- Production-ready counsellor ↔ student communication.
--
-- The help system was built for a single-account demo (one login plays both
-- sides). To support real counsellor↔student chat we need to (1) record which
-- counsellor owns a conversation, and (2) track each side's last-read time so
-- the inbox can show unread badges and "Seen" receipts without parsing
-- notification hrefs.
--
-- Idempotent (safe to re-apply; the remote migration history is divergent —
-- see scripts/apply-sql.ts). NOT dependency-free: the trigger bodies call
-- profile_display_name() / counsellor_notification_targets() from
-- 20260702120000, which must already be applied. Backported verbatim into
-- supabase/schema.sql.

-- ── 1. Participant + read-state columns ──────────────────────────────────────

alter table help_requests
  add column if not exists counsellor_profile_id uuid references profiles(id) on delete set null;
alter table help_requests
  add column if not exists student_last_read_at timestamptz;
alter table help_requests
  add column if not exists counsellor_last_read_at timestamptz;

create index if not exists help_requests_counsellor_idx
  on help_requests (counsellor_profile_id, created_at desc);

-- ── 2. RLS — the owning counsellor is already covered by can_act_as_counsellor()
--        (open to every signed-in user in the current demo posture); the
--        explicit `counsellor_profile_id = auth.uid()` arm keeps an assigned
--        counsellor's row access if that posture is later re-restricted.
--        NOTE: RLS cannot scope WHICH columns an update touches — the guard
--        trigger in §4 below enforces that a plain (non-counsellor-capable)
--        student may only stamp their own read receipt.

drop policy if exists help_requests_select on help_requests;
create policy help_requests_select on help_requests
  for select to authenticated
  using (
    student_profile_id = auth.uid()
    or counsellor_profile_id = auth.uid()
    or public.can_act_as_counsellor()
  );

drop policy if exists help_requests_update on help_requests;
create policy help_requests_update on help_requests
  for update to authenticated
  using (
    student_profile_id = auth.uid()
    or counsellor_profile_id = auth.uid()
    or public.can_act_as_counsellor()
  )
  with check (
    student_profile_id = auth.uid()
    or counsellor_profile_id = auth.uid()
    or public.can_act_as_counsellor()
  );

-- ── 4. Column-scope guard: RLS with-check validates row ownership only, so a
--        student could otherwise rewrite counsellor_profile_id / status /
--        counsellor_last_read_at on their own row (misrouting notifications or
--        forging "Seen"). Under the current open posture every signed-in user
--        is counsellor-capable, so this trigger is a no-op today; it becomes
--        protective the moment can_act_as_counsellor() is re-restricted.

create or replace function public.guard_help_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side contexts (service_role / direct SQL: no auth.uid()) and
  -- counsellor-capable users are trusted.
  if auth.uid() is null or public.can_act_as_counsellor() then
    return new;
  end if;
  -- A plain student may only stamp their own read receipt.
  if new.student_profile_id   is distinct from old.student_profile_id
     or new.counsellor_profile_id   is distinct from old.counsellor_profile_id
     or new.counsellor_last_read_at is distinct from old.counsellor_last_read_at
     or new.status      is distinct from old.status
     or new.accepted_at is distinct from old.accepted_at
     or new.resolved_at is distinct from old.resolved_at
     or new.subject     is distinct from old.subject
     or new.body        is distinct from old.body
  then
    raise exception 'students may only update their own read receipt on a help request';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_help_request_update on help_requests;
create trigger trg_guard_help_request_update
  before update on help_requests
  for each row
  execute function public.guard_help_request_update();

-- ── 5. Notification routing: once a thread is claimed, student replies notify
--        only the owning counsellor; unclaimed threads keep the fan-out to all
--        counsellor targets. Also point counsellor-side hrefs at the new inbox.

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
    -- Student raised a help request: fan out to the counsellor side (unclaimed).
    student_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_request',
      'New help request from ' || student_name,
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/counsellor/inbox?help=' || new.id::text,
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

create or replace function public.notify_on_help_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  owner_id uuid;
begin
  if new.author_role = 'counsellor' then
    author_name := coalesce(public.profile_display_name(new.author_profile_id, null), 'Your counsellor');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      hr.student_profile_id,
      'help_reply_from_counsellor',
      author_name || ' replied to your help request',
      left(new.body, 120),
      '/inbox?help=' || new.request_id::text,
      'student'
    from help_requests hr
    where hr.id = new.request_id;
  else
    author_name := coalesce(public.profile_display_name(new.author_profile_id, null), 'A student');
    select hr.counsellor_profile_id into owner_id
    from help_requests hr
    where hr.id = new.request_id;

    if owner_id is not null then
      -- Claimed thread: notify only the owning counsellor.
      insert into notifications (profile_id, kind, title, body, href, audience)
      values (
        owner_id,
        'help_reply_from_student',
        author_name || ' replied to a help request',
        left(new.body, 120),
        '/counsellor/inbox?help=' || new.request_id::text,
        'counsellor'
      );
    else
      -- Unclaimed thread: fan out to all counsellor targets.
      insert into notifications (profile_id, kind, title, body, href, audience)
      select
        target,
        'help_reply_from_student',
        author_name || ' replied to a help request',
        left(new.body, 120),
        '/counsellor/inbox?help=' || new.request_id::text,
        'counsellor'
      from public.counsellor_notification_targets() as target;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_message_notify on help_messages;
create trigger trg_help_message_notify
  after insert on help_messages
  for each row
  execute function public.notify_on_help_message_insert();
