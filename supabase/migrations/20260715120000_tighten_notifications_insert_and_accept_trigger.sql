-- 20260715120000_tighten_notifications_insert_and_accept_trigger.sql
--
-- Closes the cross-user notification-injection hole found in the 2026-07-14
-- audit while keeping the open-counsellor demo posture intact.
--
-- 1) help_accepted moves into a DB trigger (AFTER UPDATE on help_requests),
--    matching how every other notification is routed. The client-side insert
--    in use-help-thread.ts is removed in the same commit.
-- 2) notifications_insert previously allowed ANY signed-in user (via the
--    permissive can_act_as_counsellor()) to insert arbitrary title/body/href
--    into ANY profile's feed — a phishing primitive reachable with plain
--    PostgREST calls. The counsellor branch is now narrowed to the single
--    client-authored cross-user kind ('doc_nudge') and root-relative hrefs.
--    SECURITY DEFINER triggers bypass this policy and are unaffected.
--
-- Idempotent: safe to re-run.

-- 1) Notify the student when their help request is accepted.
create or replace function notify_on_help_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip self-notify: in the single-account demo the acting counsellor can
  -- also be the requesting student (auth.uid() null — e.g. service role —
  -- still notifies, which is correct).
  if new.student_profile_id is distinct from auth.uid() then
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'help_accepted',
      'Your counsellor accepted your help request',
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/inbox?help=' || new.id::text,
      'student'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_request_accepted_notify on help_requests;
create trigger trg_help_request_accepted_notify
  after update on help_requests
  for each row
  when (old.status is distinct from new.status and new.status = 'accepted')
  execute function notify_on_help_request_accepted();

-- 2) Narrow the client-facing insert policy.
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert to authenticated
  -- Users may notify themselves. The counsellor-capable branch (open to all
  -- signed-in users under the demo posture) is restricted to the one
  -- client-authored cross-user kind and root-relative hrefs, so it can no
  -- longer inject arbitrary titles/links into other feeds. All other
  -- cross-user notifications flow through SECURITY DEFINER triggers, which
  -- this policy does not constrain.
  with check (
    profile_id = auth.uid()
    or (
      public.can_act_as_counsellor()
      and kind = 'doc_nudge'
      and (href is null or (href like '/%' and href not like '//%'))
    )
  );

-- Verification guard: abort (and roll back) if anything is missing.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_help_request_accepted_notify'
      and tgrelid = 'public.help_requests'::regclass
  ) then
    raise exception 'verification failed: trg_help_request_accepted_notify missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_insert'
      and with_check like '%doc_nudge%'
  ) then
    raise exception 'verification failed: notifications_insert not narrowed';
  end if;
end;
$$;
