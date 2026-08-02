-- Step 12 — a deletion path, an audit log, and a retention bound (F12).
--
-- ⚠️  NOT APPLIED. Written for review by the database audit
--     (docs/audit/12-database-design.md F12 + §3.6, migration plan step 12).
--     Read it, then apply one-off with `npm run db:apply <file>`. Nothing here
--     has been executed against any database.
--
-- ── Class: SAFE ──────────────────────────────────────────────────────────────
-- Purely additive: two new tables, three functions, five triggers, one nullable
-- column. No existing policy, constraint or column is changed, and nothing
-- deletes anything (the purge function in section 5 is not scheduled by this
-- file — it only becomes active when a job calls it).
--
-- ── App change required ──────────────────────────────────────────────────────
-- None for this migration to be correct. To make it USEFUL, three follow-ups:
--   1. `/api/profile/delete` calling `rpc('request_account_deletion')`, plus the
--      settings UI. There is currently no delete affordance anywhere.
--   2. A service-role job that executes confirmed requests past `scheduled_for`.
--      See section 2's ⛔ note: that job CANNOT do a complete erasure until the
--      profiles → auth.users FK (plan step 5, not yet written) exists.
--   3. A scheduled call to `purge_expired_notifications()` (section 5).
--
-- ── Why this matters ─────────────────────────────────────────────────────────
-- This platform stores the personal information of MINORS — name, age,
-- nationality, school, predicted grades, counsellor assessments — and today:
--
--   • There is NO deletion path. The only two ways a user's data leaves the
--     database are a service-role seed script, and the student issuing
--     `delete from profiles` themselves through profiles_self_access (FOR ALL)
--     from the browser console. The second is not a feature, is offered in no
--     UI, cannot be undone, and does not remove their auth.users row or their
--     storage objects — so it is simultaneously the platform's only erasure
--     mechanism and an unguarded self-destruct. Export exists
--     (/api/profile/export), so the posture is half-built: portability yes,
--     erasure no (GDPR Art. 17).
--
--   • There is NO audit log. Not one table records who read or wrote a
--     student's record. On a platform whose users are children and whose staff
--     role is "counsellor with access to everything", that is both a compliance
--     gap (GDPR Art. 30, UK Children's code, ordinary safeguarding practice) and
--     an operational one: after the exposure documented in F0/F2 there is no way
--     to determine what was accessed. "We don't know" is the only answer
--     available today.
--
--   • `counsellor_notes` has no DELETE policy at all, so the one category of
--     record most likely to attract an erasure request is the one category
--     nobody can erase.
--
--   • `notifications` and `chat_messages` grow forever with no retention.
--
-- ── Ordering constraint (files apply in FILENAME order) ──────────────────────
-- Must sort AFTER:
--   • 20260801122000_counsellor_assignments.sql — section 1's SELECT policy
--     calls public.visible_student_ids(), and section 3 puts an audit trigger ON
--     counsellor_assignments. Both fail with 42883/42P01 if this runs first.
--   • 20260801120000_close_counsellor_access_and_split_write_policies.sql —
--     section 4's counsellor_notes_delete policy calls public.is_admin().
--   • 20260716120000_guardian_links.sql — section 3 audits that table too.
-- The 20260802 prefix satisfies all three. No dependency on 20260802100000 or
-- 20260802120000.
--
-- ⚠️  INTERACTION WITH 20260802110000_notification_bounds.sql. If that file has
--     been applied, trg_bound_notification_payload is attached BEFORE INSERT OR
--     UPDATE on notifications — so section 5's expires_at backfill fires it once
--     per existing row. Two consequences, both handled:
--       • a pre-existing row with a malformed `kind`, a non-root `href`, or an
--         EMPTY/NULL `title` would ABORT this migration. Section 5 counts all
--         three first and tells you which. (The title case was missed when this
--         file was written and was demonstrated to abort it at :425, after the
--         five audit triggers were already installed — see section 5.)
--       • a pre-existing title/body over the cap is truncated in place by the
--         backfill. That is the intended end state, but it is a data change, so
--         it is stated here rather than discovered later.
--
--     ⚠️  HALF-APPLIED RISK IS PATH-DEPENDENT. Under `npm run db:apply` the file
--     is atomic — scripts/apply-sql.ts:46 is a single client.query(sql), which
--     Postgres wraps in one implicit transaction, so an abort rolls the whole
--     file back. Under `psql -f` WITHOUT `-1` it is not: each statement commits
--     on its own and an abort at :425 leaves the audit triggers and the
--     expires_at column behind. Use `psql -1 -v ON_ERROR_STOP=1` if you run it
--     that way.
--     Neither file depends on the other; this is why the order is documented in
--     both.
--
-- ⛔ THIS FILE MUST NOT BE REORDERED BEFORE plan step 5
--    (20260801140000-or-later profiles_auth_binding). It is safe to apply
--    without it — but see section 2: erasure is INCOMPLETE until the profiles →
--    auth.users foreign key exists, because deleting a profiles row today
--    leaves the login intact.
--
-- ── Reversal ─────────────────────────────────────────────────────────────────
--   do $$ declare t text; begin
--     foreach t in array array['counsellor_assignments','guardian_links',
--                              'counsellor_notes','profiles','deletion_requests']
--     loop execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t); end loop;
--   end $$;
--   drop function if exists public.write_audit_row();
--   drop function if exists public.request_account_deletion(text);
--   drop function if exists public.purge_expired_notifications(integer);
--   drop table if exists audit_log;
--   drop table if exists deletion_requests;
--   alter table notifications drop column if exists expires_at;
-- Dropping audit_log destroys the audit trail. If the reason for reverting is a
-- bug in the trigger, drop the TRIGGERS and keep the table.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. PRE-FLIGHT — refuse before creating anything
-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ THIS BLOCK MUST STAY FIRST, AND IT MUST MIRROR EVERY `raise` IN
--    bound_notification_payload() (20260802110000).
--
-- Section 5's expires_at backfill touches every row of `notifications`, which
-- fires that gate once per row if 20260802110000 is applied. A single offending
-- row aborts the file. It used to be checked immediately before the backfill —
-- i.e. AFTER the five audit triggers and the expires_at column were already
-- installed — so under `psql -f` (no -1) the file half-applied. Checking here
-- means the refusal costs nothing and leaves nothing behind on any apply path.
--
-- It originally counted only `kind` and `href` and missed the THIRD raise: the
-- empty-title check. One planted row with title = '' (no constraint forbids it
-- today) reproduced the abort against Postgres 16.14:
--    20260802130000_...sql:425  ERROR: notifications.title must not be empty
--    CONTEXT: PL/pgSQL function bound_notification_payload() line 52 at RAISE
--
-- `title is null or title = ''`, NOT `coalesce(trim(title),'') = ''`. The gate
-- collapses whitespace with regexp_replace(…, '\s+', ' ', 'g') BEFORE testing,
-- which turns an all-whitespace title into a single space — not empty, does not
-- raise. trim() here would refuse the migration over rows that would have
-- applied fine: a false alarm on a file whose whole job is to not half-apply.
--
-- The gate's FOURTH raise — the recipient relationship — cannot fire here: it is
-- guarded by `auth.uid() is not null`, and a migration carries no JWT. If you
-- ever run this file through a session that DOES carry one, stop.
do $$
declare
  bad_kind  integer;
  bad_href  integer;
  bad_title integer;
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  select count(*) into bad_kind from notifications
   where kind is null or kind !~ '^[a-z][a-z0-9_]{0,48}$';
  select count(*) into bad_href from notifications
   where href is not null and (href !~ '^/' or href like '//%');
  select count(*) into bad_title from notifications
   where title is null or title = '';

  if bad_kind > 0 or bad_href > 0 or bad_title > 0 then
    raise exception
      'refusing to apply: % notification row(s) with a malformed kind, % with a '
      'non-root href and % with an empty title would be rejected by '
      'trg_bound_notification_payload during section 5''s expires_at backfill. '
      'NOTHING HAS BEEN CREATED — fix the rows and re-run. '
      'Inspect: select id, kind, href, title from notifications '
      'where kind is null or kind !~ ''^[a-z][a-z0-9_]{0,48}$'' '
      'or (href is not null and (href !~ ''^/'' or href like ''//%%'')) '
      'or title is null or title = '''';',
      bad_kind, bad_href, bad_title;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. deletion_requests — the erasure REQUEST, not the erasure
-- ─────────────────────────────────────────────────────────────────────────────
-- A request is a durable, reviewable artefact with a grace period. It is
-- deliberately not "delete immediately": a 16-year-old clicking delete two weeks
-- before an application deadline should be recoverable, and a guardian or
-- counsellor should be able to see that it happened.

create table if not exists deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  requested_by  uuid references profiles(id) on delete set null,
  reason        text,
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  requested_at  timestamptz not null default timezone('utc', now()),
  scheduled_for timestamptz not null default timezone('utc', now()) + interval '7 days',
  completed_at  timestamptz
);

-- ⛔ A PARTIAL UNIQUE CONSTRAINT DOES NOT EXIST IN POSTGRES.
--    The audit sketches this as an inline table constraint —
--      unique (profile_id) where status in ('pending', 'confirmed')
--    — which is a SYNTAX ERROR (42601) and would abort the whole file at parse
--    time. `unique … where` is only available on a partial unique INDEX. It also
--    has to be an index rather than a constraint for section 2's ON CONFLICT to
--    infer it.
--
--    One open request per profile; completed and cancelled rows accumulate as
--    history, which is the point.
create unique index if not exists deletion_requests_open_profile_key
  on deletion_requests (profile_id)
  where status in ('pending', 'confirmed');

create index if not exists deletion_requests_due_idx
  on deletion_requests (scheduled_for)
  where status = 'confirmed';

alter table deletion_requests enable row level security;

-- The subject, their counsellor and their guardian can all see that a deletion
-- was requested — visible_student_ids() is exactly that set. Admins see all.
-- No INSERT policy: requests are created only through the definer RPC in
-- section 2, so the row is always attributed to the real caller and can never be
-- filed on someone else's behalf.
-- No UPDATE or DELETE policy: status transitions are the service-role job's, and
-- a request that could be quietly deleted is not a compliance record.
drop policy if exists deletion_requests_self on deletion_requests;
create policy deletion_requests_self on deletion_requests
  for select to authenticated
  using (
    profile_id in (select public.visible_student_ids())
    or (select public.auth_role()) = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. request_account_deletion() — the RPC the app will call
-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ THIS DOES NOT DELETE ANYTHING. It files a request. Execution is a
--    service-role job, and that job cannot perform a COMPLETE erasure until plan
--    step 5 lands, because today:
--      • profiles has no FK to auth.users, so deleting the profile leaves the
--        login — and a login with no profile is the F0 escalation window;
--      • storage objects under applications/<id>/ survive their application row
--        and become unreadable AND undeletable by anyone but the service role
--        (F7).
--    Until then the job must delete auth.users FIRST and reconcile storage by
--    hand. Say so in the runbook; do not let this function's existence imply
--    the problem is solved.

create or replace function public.request_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  -- Without this the FK raises a raw 23503 that surfaces to the user as an
  -- opaque database error. A user with no profiles row is the F1 state, and
  -- there is nothing to erase yet.
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'no profile exists for this account' using errcode = 'no_data_found';
  end if;

  insert into deletion_requests (profile_id, requested_by, reason)
  values (auth.uid(), auth.uid(), nullif(left(coalesce(p_reason, ''), 500), ''))
  -- The WHERE clause must match deletion_requests_open_profile_key's predicate
  -- exactly, or Postgres infers no index and raises 42P10.
  on conflict (profile_id) where status in ('pending', 'confirmed')
  do update set
    requested_at = timezone('utc', now()),
    reason       = excluded.reason
  returning id into req;

  return req;
end;
$$;

grant execute on function public.request_account_deletion(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. audit_log
-- ─────────────────────────────────────────────────────────────────────────────
-- NO FOREIGN KEYS, deliberately. An audit row whose actor cascades away when the
-- actor is deleted is not an audit row. actor_id/subject_id/object_id are bare
-- uuids that outlive everything they point at — which is the entire reason this
-- table can answer "who had access on date X" after the answer has been erased
-- everywhere else.
--
-- `detail` carries ROLE AND STATUS TRANSITIONS ONLY. It must never carry note
-- bodies, message text or contact details: an audit log that accumulates a
-- second copy of the PII it exists to protect is a liability, not a control, and
-- it is read by a policy (admins) that is broader than the one guarding the
-- source table.

create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default timezone('utc', now()),
  actor_id    uuid,
  action      text not null,
  object_type text not null,
  object_id   uuid,
  subject_id  uuid,        -- the student whose record was touched
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_subject_idx on audit_log (subject_id, occurred_at desc);
create index if not exists audit_log_actor_idx   on audit_log (actor_id, occurred_at desc);
create index if not exists audit_log_object_idx  on audit_log (object_type, occurred_at desc);

alter table audit_log enable row level security;

-- Read: admins. Write: nobody, through RLS. The definer trigger below runs as
-- the table owner, and a table owner is exempt from its own RLS unless FORCE ROW
-- LEVEL SECURITY is set — which it deliberately is not. So the trigger writes
-- and no client can, not even to forge an entry.
-- No UPDATE and no DELETE policy, for any role including admin: an append-only
-- log is the only kind worth keeping.
drop policy if exists audit_log_admin on audit_log;
create policy audit_log_admin on audit_log
  for select to authenticated
  using ((select public.auth_role()) = 'admin');

-- ── The generic writer ───────────────────────────────────────────────────────
--
-- ⛔ THREE PL/pgSQL TRAPS THE AUDIT'S SKETCH WALKS INTO, all of which fail at
--    RUNTIME rather than at CREATE FUNCTION time — so a migration containing
--    them applies cleanly and then breaks writes on five tables:
--
--    (a) `new.role` on a table with no `role` column raises 42703 "record new
--        has no field role". The sketch reads new.role/old.role AND
--        new.status/old.status for all five tables, but counsellor_notes has
--        NEITHER, guardian_links and deletion_requests have no `role`, and
--        profiles has no `status`. Four of the five triggers would throw on
--        every write.
--    (b) `new.id` in a DELETE trigger raises "record new is not assigned yet" —
--        NEW is unassigned, not null, so coalesce(new.id, old.id) does not
--        rescue it. Same for OLD in an INSERT trigger.
--    (c) `return coalesce(new, old)` hits (b) for the same reason.
--
--    to_jsonb() behind a tg_op guard sidesteps all three: a missing KEY in jsonb
--    is SQL NULL, not an error, so one function genuinely serves five differently
--    shaped tables. AFTER triggers ignore the return value, so `return null` is
--    both correct and safe.

create or replace function public.write_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j_new jsonb;
  j_old jsonb;
  subj  uuid;
  obj   uuid;
begin
  -- Assigned with IF STATEMENTS, not with a CASE expression in the DECLARE
  -- block. In a DELETE trigger NEW is unassigned (and OLD is, in an INSERT
  -- trigger), and PL/pgSQL raises "record new is not assigned yet — the tuple
  -- structure of a not-yet-assigned record is indeterminate" when it builds the
  -- SPI parameter for an expression that mentions it. A SQL CASE is lazy about
  -- which BRANCH it evaluates, but the record is substituted into the query
  -- before any of that, so `case when tg_op = ... then to_jsonb(new) end` does
  -- NOT save you. PL/pgSQL control flow does: an untaken IF branch is never
  -- compiled into a query at all.
  if tg_op in ('INSERT', 'UPDATE') then
    j_new := to_jsonb(new);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    j_old := to_jsonb(old);
  end if;

  -- A profile UPDATE that does not touch `role` is ordinary profile editing —
  -- the wizard upserts on every save. Logging those buries the role changes,
  -- which are the only authorisation events on this table, under thousands of
  -- rows. An audit log nobody can read is an audit log nobody reads.
  if tg_table_name = 'profiles'
     and tg_op = 'UPDATE'
     and (j_new ->> 'role') is not distinct from (j_old ->> 'role') then
    return null;
  end if;

  subj := nullif(
    case tg_table_name
      when 'profiles'          then coalesce(j_new ->> 'id',         j_old ->> 'id')
      when 'deletion_requests' then coalesce(j_new ->> 'profile_id', j_old ->> 'profile_id')
      else coalesce(j_new ->> 'student_profile_id', j_old ->> 'student_profile_id')
    end, '')::uuid;

  obj := nullif(coalesce(j_new ->> 'id', j_old ->> 'id'), '')::uuid;

  insert into audit_log (actor_id, action, object_type, object_id, subject_id, detail)
  values (
    auth.uid(),           -- null for service-role/migration writes; that is itself information
    lower(tg_op),
    tg_table_name,
    obj,
    subj,
    -- strip_nulls so a table without `role` simply omits the key rather than
    -- storing {"old_role": null} on every row.
    jsonb_strip_nulls(jsonb_build_object(
      'old_role',   j_old -> 'role',
      'new_role',   j_new -> 'role',
      'old_status', j_old -> 'status',
      'new_status', j_new -> 'status',
      'note_type',  coalesce(j_new -> 'note_type', j_old -> 'note_type')
    ))
  );

  return null;   -- AFTER trigger: the return value is discarded
end;
$$;

-- Five tables, chosen as the ones where a change IS an authorisation event:
-- who counsels whom, who guards whom, what was written about a student, who is
-- an admin, and who asked to be erased.
do $$
declare
  t text;
begin
  foreach t in array array[
    'counsellor_assignments', 'guardian_links', 'counsellor_notes',
    'profiles', 'deletion_requests'
  ]
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'audit target %.% does not exist — check the ordering constraint in this file''s header', 'public', t;
    end if;
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I '
      'for each row execute function public.write_audit_row()', t);
  end loop;
  raise notice 'audit triggers installed on 5 tables';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. counsellor_notes: an erasure path
-- ─────────────────────────────────────────────────────────────────────────────
-- The table has select/update policies and NO DELETE POLICY AT ALL, so the
-- safeguarding record most likely to attract an Art. 17 request is the one
-- record nobody can erase. Author or admin — deliberately not "any counsellor",
-- which is what the bare-boolean select/update policies currently amount to.
-- Every deletion is now recorded by section 3's trigger, which is what makes
-- granting it acceptable.

drop policy if exists counsellor_notes_delete on counsellor_notes;
create policy counsellor_notes_delete on counsellor_notes
  for delete to authenticated
  using (author_profile_id = (select auth.uid()) or public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Retention on notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ NOT A GENERATED COLUMN. The audit sketches
--      expires_at timestamptz generated always as (created_at + interval '180 days') stored
--    which FAILS at 42P17 "generation expression is not immutable". The
--    timestamptz + interval operator is STABLE, not IMMUTABLE — adding '1 day'
--    to a timestamptz depends on the session TimeZone across DST boundaries —
--    and a stored generated column requires an immutable expression. This is
--    not a Postgres-version quirk; it has never worked.
--
--    A plain column with a DEFAULT gets the same result (defaults may be
--    stable), stays writable for per-kind retention later, and backfills
--    explicitly below.

alter table notifications add column if not exists expires_at timestamptz;

alter table notifications
  alter column expires_at set default timezone('utc', now()) + interval '180 days';

-- The backfill fires trg_bound_notification_payload once per row if
-- 20260802110000 is already applied (see the header). A single pre-existing row
-- with a malformed kind or href would abort the whole migration at that point,
-- having already created the audit triggers — leaving a half-applied file.
-- Count first, and fail with a message that names the offenders instead.
-- The pre-flight check that protects this backfill is SECTION 0, at the top of
-- the file — deliberately, so a refusal leaves nothing installed. Re-checking
-- here would be redundant: nothing between there and here writes to
-- `notifications`, and the file is applied as one unit on both apply paths.

-- Idempotent: the predicate is empty on the second run.
update notifications
   set expires_at = created_at + interval '180 days'
 where expires_at is null;

create index if not exists notifications_expiry_idx
  on notifications (expires_at)
  where expires_at is not null;

-- Batched so a first run against a large table cannot hold a long transaction or
-- blow out the statement timeout. Call it in a loop until it returns 0.
--
-- No grant to `authenticated`: the default EXECUTE grant is to PUBLIC, so
-- without the revoke below ANY signed-in user could call a SECURITY DEFINER
-- function that deletes rows in bulk. This is the same default-grant hole that
-- makes profile_display_name() an oracle (F10).
create or replace function public.purge_expired_notifications(p_limit integer default 10000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with doomed as (
    select id from notifications
     where expires_at is not null and expires_at < timezone('utc', now())
     order by expires_at
     limit greatest(p_limit, 1)
  )
  delete from notifications x using doomed where x.id = doomed.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.purge_expired_notifications(integer) from public;
revoke execute on function public.purge_expired_notifications(integer) from anon, authenticated;
grant  execute on function public.purge_expired_notifications(integer) to service_role;

-- chat_messages has the same unbounded-growth problem and is deliberately NOT
-- handled here: its retention window is a product decision (how long should a
-- student be able to scroll back through their assistant history?), not a
-- schema one, and it needs the same treatment applied to chat_conversations at
-- the same time or the conversation list fills with empty threads.

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Verify
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  n integer;
begin
  foreach t in array array[
    'counsellor_assignments', 'guardian_links', 'counsellor_notes',
    'profiles', 'deletion_requests'
  ]
  loop
    if not exists (
      select 1 from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relname = t
        and tr.tgname = 'trg_audit_' || t and not tr.tgisinternal
    ) then
      raise exception 'verification failed: audit trigger missing on %', t;
    end if;
  end loop;

  -- audit_log must be readable by admins and writable by NOBODY through RLS.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'audit_log' and cmd <> 'SELECT';
  if n > 0 then
    raise exception 'verification failed: audit_log has % non-SELECT policy(ies) — it must be append-only via the definer trigger', n;
  end if;

  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname in ('audit_log', 'deletion_requests') and c.relrowsecurity;
  if n <> 2 then
    raise exception 'verification failed: RLS is not enabled on both audit_log and deletion_requests (found %)', n;
  end if;

  if to_regclass('public.deletion_requests_open_profile_key') is null then
    raise exception 'verification failed: the partial unique index request_account_deletion''s ON CONFLICT infers is missing';
  end if;

  select count(*) into n from notifications where expires_at is null;
  if n > 0 then
    raise warning 'notifications: % row(s) still have a null expires_at — the backfill did not cover them', n;
  end if;

  raise notice 'erasure/audit/retention verified';
end $$;
