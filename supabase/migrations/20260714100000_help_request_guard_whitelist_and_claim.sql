-- Harden the help_requests write path.
--
-- 20260713170000 added a BEFORE UPDATE column-scope guard, but review found
-- four gaps. This migration amends the deployed objects in place (idempotent,
-- safe to re-apply; the remote migration history is divergent — see
-- scripts/apply-sql.ts). Backported verbatim into supabase/schema.sql.
--
--   1. The UPDATE guard used a column *blacklist*, so a plain student could
--      still rewrite application_id / university / program / initiated_by /
--      created_at / id on their own row. Switch to a *whitelist*: only
--      student_last_read_at may move; every other column — present or future —
--      is frozen automatically.
--   2. INSERT was unguarded. Once can_act_as_counsellor() is re-restricted a
--      plain student could INSERT a request with counsellor_profile_id already
--      pinned to an arbitrary counsellor (pinning reply-notification routing).
--      Add a BEFORE INSERT arm: a plain student may only file a fresh,
--      unclaimed, student-initiated request.
--   3. The owning counsellor (counsellor_profile_id = auth.uid()) keeps RLS row
--      access if their counsellor capability is later revoked, but the guard
--      then blocked their own read-receipt stamp. Trust the row owner.
--   4. Thread "claiming" lived only in a client-side conditional; a dormant
--      bypassing caller (useHelpRequests.accept) flips status to 'accepted'
--      without claiming. Enforce at the data layer: accepting an unclaimed
--      thread now implies ownership regardless of caller.
--
-- Depends on can_act_as_counsellor() (20260628 / open-access migrations).

-- ── help_requests write guard (INSERT + UPDATE) ──────────────────────────────

create or replace function public.guard_help_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r help_requests%rowtype;
begin
  if tg_op = 'INSERT' then
    -- Server-side contexts (service_role / direct SQL: no auth.uid()) and
    -- counsellor-capable users are trusted to set any column.
    if auth.uid() is null or public.can_act_as_counsellor() then
      return new;
    end if;
    -- A plain student may only file a fresh, unclaimed, student-initiated
    -- request: no pre-pinned counsellor (which would fix reply routing), no
    -- forged acceptance/resolution or read receipts. status/initiated_by carry
    -- their NOT NULL defaults ('open' / 'student') applied before this trigger.
    if new.counsellor_profile_id   is not null
       or new.counsellor_last_read_at is not null
       or new.accepted_at is not null
       or new.resolved_at is not null
       or coalesce(new.status, 'open')          is distinct from 'open'
       or coalesce(new.initiated_by, 'student') is distinct from 'student'
    then
      raise exception 'students may only file a fresh, unclaimed help request';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE' below.

  -- Claim-on-accept: accepting an unclaimed thread implies ownership, whatever
  -- the caller path (finding 4). Runs before the trust returns so a
  -- counsellor-capable updater that only flips status still becomes the owner.
  if new.status = 'accepted'
     and old.counsellor_profile_id is null
     and new.counsellor_profile_id is null
     and auth.uid() is not null
     and public.can_act_as_counsellor()
  then
    new.counsellor_profile_id := auth.uid();
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;

  -- Server-side contexts and counsellor-capable users are trusted.
  if auth.uid() is null or public.can_act_as_counsellor() then
    return new;
  end if;
  -- The owning counsellor is a trusted participant on this row: RLS still
  -- grants them access via counsellor_profile_id = auth.uid() even if their
  -- counsellor capability was later revoked, so let them stamp their own read
  -- receipt (and, matching the RLS policy's intent, act on the row they own).
  if old.counsellor_profile_id = auth.uid() then
    return new;
  end if;
  -- A plain student may only stamp their own read receipt. Whitelist: copy the
  -- one permitted change onto a snapshot of OLD and reject any other drift —
  -- this covers every current and future column automatically.
  r := old;
  r.student_last_read_at := new.student_last_read_at;
  if new is distinct from r then
    raise exception 'students may only update their own read receipt on a help request';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_help_request_update on help_requests;
create trigger trg_guard_help_request_update
  before insert or update on help_requests
  for each row
  execute function public.guard_help_request_update();
