-- Step 4 (part 1 of 2) — RLS policy invariants, asserted against the CATALOGUE.
--
-- ⚠️  NOT RUN. Written for review by the database audit
--     (docs/audit/12-database-design.md migration plan step 4). No database was
--     contacted while writing it.
--
-- ── What this file is ────────────────────────────────────────────────────────
-- The gate that would have caught F0, F1 (11-security), F5, F9 and the whole
-- §1.5 drift ledger. It asserts properties of policy DEFINITIONS — it never
-- executes a policy — so it needs no users, no fixtures and no working
-- auth.uid(). Its companion, rls-negative-cases.sql, asserts the runtime
-- behaviour and DOES need a real Supabase.
--
-- ── RUNS ANYWHERE, INCLUDING THE CI `database` JOB ───────────────────────────
-- .github/workflows/ci.yml:206 stubs auth.uid() as `select null::uuid`. That
-- makes every RUNTIME authorisation test meaningless there — a null actor
-- matches nothing, so every negative test passes vacuously and proves nothing.
-- Nothing in THIS file calls auth.uid(). It reads pg_policies, pg_class,
-- pg_proc, pg_index and pg_constraint, all of which are fully populated by
-- replaying schema.sql plus the migrations. Every assertion below is therefore
-- REAL in the CI job, and it is the assertion set that should gate merges.
--
-- Two caveats for that job, neither this file's to fix:
--   • The stub creates `auth.users (id uuid primary key)` with no `email` and no
--     `raw_user_meta_data`, while schema.sql:1902 and 20260801122000 both read
--     auth.users.email. Those SQL-language function bodies are validated at
--     CREATE time, so they fail with 42703 before this file is ever reached.
--   • The stub creates no `storage` schema, while schema.sql:1104 inserts into
--     storage.buckets and :1117 alters storage.objects.
--   Both need stub columns/schema added to ci.yml before the `database` job can
--   go green, let alone become required.
--
-- ── How to run ───────────────────────────────────────────────────────────────
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f __tests__/db/policy-invariants.sql
--
-- Section B holds assertions for the TARGET posture (plan steps 8-9), which are
-- expected to FAIL until those ship. They report as warnings by default and
-- become hard failures with:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set ascenda.target_posture = 'on'" \
--     -f __tests__/db/policy-invariants.sql
--
-- Flip that on permanently the moment step 9 lands; that is what "un-.failing
-- the suite" means in the migration plan.
--
-- ── Read-only ────────────────────────────────────────────────────────────────
-- No transaction, and it touches nothing in `public`: the only object it creates
-- is a TEMP table used to defer Section A's report until after Section B has
-- run. Safe against any database including production — though nothing here
-- needs production to answer.

\set ON_ERROR_STOP on

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION A — invariants that MUST hold on this branch, today
-- ═════════════════════════════════════════════════════════════════════════════
-- Section A's violations are RECORDED here and re-raised as a hard error at the
-- very END of the file, not at the end of this block. Raising here, under the
-- `\set ON_ERROR_STOP on` above, aborted the script — so for as long as Section A
-- had ANY violation (it has had six since the day it was written) Section B was
-- dead code that nobody had ever executed. MIGRATIONS.md cites B4 as the check
-- that means F4 "cannot be forgotten"; it could not even run. The final error
-- message and the non-zero exit are unchanged; only their position moved.
drop table if exists _pi_section_a_failures;
create temp table _pi_section_a_failures (msg text);

do $$
declare
  -- ⚠️  `failures` is text[]. ALWAYS append a TYPED text value:
  --       failures := failures || format('…', x);        -- format() returns text ✅
  --       failures := failures || 'literal'::text;       -- explicit cast      ✅
  --       failures := failures || 'literal';             -- ✗ unknown-typed
  --     A bare literal is type `unknown`, so `||` resolves to
  --     `anyarray || anyarray` and Postgres tries to PARSE the sentence as an
  --     array literal: `ERROR: malformed array literal`. The branch then dies
  --     with a raw type error instead of reporting its finding — and because
  --     these branches only execute on a database where the invariant is
  --     VIOLATED, the defect is invisible on any database that passes.
  --     Eight sites shipped that way; see docs/audit/verify/C-database.md C3.
  failures text[] := '{}';
  r        record;
  n        integer;

  -- Tables whose contents are meant to be world-readable. A `using (true)` or
  -- an unconditional read policy is CORRECT on these and a finding everywhere
  -- else. Keep this list short and justify every addition.
  catalogue_tables constant text[] := array[
    'cities', 'universities', 'programs', 'program_requirements',
    'deadlines', 'application_tasks', 'sources'
  ];
begin

  -- ── A1. No bare-boolean policy ─────────────────────────────────────────────
  -- The finding this exists for: 24 of 93 policies collapsed to "any signed-in
  -- user" (11-security F1). A bare boolean is not a scope, and because it reads
  -- as a real predicate in the policy list, it hid for months.
  --
  -- Three spellings, all equivalent, all caught:
  --   auth.uid() is not null
  --   (select auth.uid()) is not null          ← the InitPlan-wrapped form
  --   true                                     ← outside the catalogue allowlist
  --
  -- Whitespace is normalised first: the deparsed form Postgres stores in
  -- pg_policies is not byte-identical to what was written.
  for r in
    select
      p.tablename,
      p.policyname,
      p.cmd,
      regexp_replace(coalesce(p.qual, ''), '\s+', ' ', 'g')       as q,
      regexp_replace(coalesce(p.with_check, ''), '\s+', ' ', 'g') as wc
    from pg_policies p
    where p.schemaname = 'public'
  loop
    if r.q ~* '^\(?\s*(\(\s*select\s+)?auth\.uid\(\)( as uid)?\)?\s*is not null\s*\)?$'
       or r.wc ~* '^\(?\s*(\(\s*select\s+)?auth\.uid\(\)( as uid)?\)?\s*is not null\s*\)?$'
    then
      failures := failures || format('A1 bare-boolean policy: %s.%s (%s)', r.tablename, r.policyname, r.cmd);
    end if;

    if (r.q = 'true' or r.wc = 'true') and not (r.tablename = any (catalogue_tables)) then
      failures := failures || format(
        'A1 unconditional policy on a non-catalogue table: %s.%s (%s)', r.tablename, r.policyname, r.cmd);
    end if;
  end loop;

  -- ── A2. Every table in `public` has RLS ENABLED ────────────────────────────
  -- A table created without `enable row level security` is readable AND WRITABLE
  -- by the anon key that ships in the browser bundle, regardless of what
  -- policies are attached — they are inert. That is exactly how `cities` shipped
  -- (schema.sql declares the table and never enables RLS) and how
  -- programs/universities shipped before 20260719120000.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    failures := failures || format('A2 RLS is NOT enabled on public.%s', r.relname);
  end loop;

  -- ── A3. Every table with RLS has at least one policy ───────────────────────
  -- RLS on with zero policies denies everything to everyone but the owner. That
  -- is fail-closed, so it is not a security bug — it is a silent OUTAGE, and it
  -- looks identical to "correctly locked down" in every dashboard.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
  loop
    failures := failures || format('A3 RLS enabled but NO POLICY on public.%s — denies everything', r.relname);
  end loop;

  -- ── A4. `profiles` grants no self-DELETE and no FOR ALL ────────────────────
  -- F0, the worst hole in the database: profiles_self_access was FOR ALL (so it
  -- covered INSERT and DELETE) while trg_guard_profile_role was BEFORE UPDATE
  -- only. Delete your own row, re-insert it with role='admin', and every one of
  -- the 20 admin policies opens. This assertion is the permanent form of
  -- 20260801110000's verification tail.
  for r in
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd in ('ALL', 'DELETE')
  loop
    failures := failures || format(
      'A4 profiles.%s is %s — F0: a FOR ALL or DELETE policy on profiles is self-promotion to admin', r.policyname, r.cmd);
  end loop;

  -- ── A5. The role guard covers INSERT as well as UPDATE ─────────────────────
  -- The other half of F0. tgtype bit 1<<2 = INSERT (4), 1<<4 = UPDATE (16).
  select coalesce(max(t.tgtype), 0) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'profiles'
    and t.tgname = 'trg_guard_profile_role' and not t.tgisinternal;

  if n = 0 then
    failures := failures || 'A5 trg_guard_profile_role is not attached to profiles'::text;
  elsif (n & 4) = 0 then
    failures := failures || format('A5 trg_guard_profile_role does not cover INSERT (tgtype=%s) — F0 is open', n);
  elsif (n & 16) = 0 then
    failures := failures || format('A5 trg_guard_profile_role does not cover UPDATE (tgtype=%s)', n);
  end if;

  -- ── A6. Every SECURITY DEFINER function pins its search_path ───────────────
  -- An unpinned definer function is a privilege-escalation primitive: whoever
  -- calls it controls the search_path, so an attacker-created `public.profiles`
  -- (or a shadowing operator) is resolved with the OWNER's rights. This is the
  -- invariant 20260713130000 established for auth_role() and that
  -- is_demo_account() (schema.sql:1176) still violates.
  for r in
    select p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg like 'search\_path=%'
      )
  loop
    failures := failures || format(
      'A6 SECURITY DEFINER function public.%s() has no pinned search_path', r.proname);
  end loop;

  -- ── A7. student_matches has a DELETE policy ────────────────────────────────
  -- F5. Postgres does NOT error on an RLS-filtered DELETE — it removes zero rows
  -- and reports success, so the cache rebuild's delete-then-insert has been
  -- accumulating 300+ rows per rebuild, forever, believing it succeeded.
  -- Generalised: any table the app DELETEs from needs a policy that permits it.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'student_matches'
      and cmd in ('DELETE', 'ALL')
      and coalesce(qual, '') !~ 'admin'
  ) then
    failures := failures || 'A7 student_matches has no non-admin DELETE policy — the cache rebuild is a silent no-op (F5)'::text;
  end if;

  -- ── A8. student_matches cannot hold duplicates ─────────────────────────────
  if to_regclass('public.student_matches_profile_program_key') is null then
    failures := failures || 'A8 student_matches has no unique index on (profile_id, program_id) — unbounded growth (F5)'::text;
  end if;

  -- ── A9. The notification gate is attached and covers both verbs ────────────
  -- F6. Without the UPDATE arm the gate is a two-step bypass.
  select coalesce(max(t.tgtype), 0) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where c.relname = 'notifications'
    and t.tgname = 'trg_bound_notification_payload' and not t.tgisinternal;

  if n = 0 then
    failures := failures || 'A9 trg_bound_notification_payload is not attached to notifications (F6)'::text;
  elsif (n & 4) = 0 or (n & 16) = 0 then
    failures := failures || format('A9 trg_bound_notification_payload does not cover both INSERT and UPDATE (tgtype=%s)', n);
  end if;

  -- ── A10. counsellor_notification_targets is not ambiguous ──────────────────
  -- Adding a `default` to the one-argument overload makes the existing
  -- zero-argument call site raise 42725 at runtime, breaking every help-request
  -- insert — with nothing having errored at migration time.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'counsellor_notification_targets'
    and p.pronargdefaults > 0;
  if n > 0 then
    failures := failures || 'A10 counsellor_notification_targets has a DEFAULT — the zero-arg call site is ambiguous (42725)'::text;
  end if;

  -- ── A11. audit_log is append-only ──────────────────────────────────────────
  if to_regclass('public.audit_log') is not null then
    select count(*) into n
    from pg_policies
    where schemaname = 'public' and tablename = 'audit_log' and cmd <> 'SELECT';
    if n > 0 then
      failures := failures || format('A11 audit_log has %s non-SELECT policy(ies) — it must be append-only', n);
    end if;
  end if;

  -- ── A12. History tables have no DELETE policy ──────────────────────────────
  -- "Who had access to this child's record on date X" must stay answerable.
  -- Revocation is a status change, never a deletion.
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('guardian_links', 'counsellor_assignments', 'deletion_requests')
      and cmd in ('DELETE', 'ALL')
  loop
    failures := failures || format(
      'A12 %s.%s permits DELETE — revoke by status, never by erasing the edge', r.tablename, r.policyname);
  end loop;

  -- ── A13. The role guard's FUNCTION BODY has an INSERT arm ──────────────────
  -- A5 above asserts the trigger's TIMING. Timing without the matching body is
  -- not a weaker version of the fix, it is a different bug: on INSERT `old` is
  -- NULL, so an UPDATE-only body registered `before insert` rejects the
  -- legitimate role='student' insert and BREAKS SIGNUP. That is exactly what
  -- landed in schema.sql (C2) while A5 stayed green.
  if exists (select 1 from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace ns on ns.oid = c.relnamespace
             where ns.nspname = 'public' and c.relname = 'profiles'
               and t.tgname = 'trg_guard_profile_role' and not t.tgisinternal
               and (t.tgtype & 4) = 4)
     and coalesce((select p.prosrc from pg_proc p
                   join pg_namespace ns on ns.oid = p.pronamespace
                   where ns.nspname = 'public'
                     and p.proname = 'guard_profile_role_change'), '') !~ 'tg_op'
  then
    failures := failures || (
      'A13 trg_guard_profile_role fires on INSERT but guard_profile_role_change() '
      'has no tg_op branch — every profile INSERT, including signup, raises')::text;
  end if;

  -- ── Report ─────────────────────────────────────────────────────────────────
  -- Deferred to the end of the file; see the note above the block.
  if array_length(failures, 1) > 0 then
    insert into _pi_section_a_failures (msg) select unnest(failures);
    raise warning E'SECTION A: % policy invariant(s) violated (re-raised as an ERROR at the end of this file):\n  %',
      array_length(failures, 1), array_to_string(failures, E'\n  ');
  else
    raise notice 'SECTION A: all policy invariants hold';
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION B — the TARGET posture (plan steps 8-9)
-- ═════════════════════════════════════════════════════════════════════════════
-- Expected to FAIL until the relationship-scoped policy set lands. Warnings by
-- default; failures when `ascenda.target_posture` is 'on'.

do $$
declare
  failures text[] := '{}';
  r        record;
  n        integer;
  strict_mode boolean := coalesce(current_setting('ascenda.target_posture', true), 'off') = 'on';
begin

  -- ── B1. No policy calls can_act_as_counsellor() ────────────────────────────
  -- The single lever that opens 24 policies at once. It is worth PRESERVING as
  -- the rollback lever right up until step 9 — and worth asserting gone after.
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') like '%can_act_as_counsellor%'
      or coalesce(with_check, '') like '%can_act_as_counsellor%');
  if n > 0 then
    failures := failures || format('B1 %s policy(ies) still call can_act_as_counsellor() — step 8 incomplete', n);
  end if;

  -- ── B2. can_act_as_counsellor(), if it still exists, is not a bare boolean ─
  -- A policy can look perfectly scoped and still be bare, because the boolean is
  -- one function call away. Checking the policy text alone would have missed the
  -- entire 11-security F1 finding.
  for r in
    select p.proname, regexp_replace(p.prosrc, '\s+', ' ', 'g') as src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'can_act_as_counsellor'
  loop
    if r.src ~* 'select\s+auth\.uid\(\)\s+is not null' then
      failures := failures || 'B2 can_act_as_counsellor() body is `auth.uid() is not null` — every policy calling it is bare'::text;
    end if;
  end loop;

  -- ── B3. profile_display_name() is not executable by clients ────────────────
  -- F10: a SECURITY DEFINER function taking a caller-supplied uuid and returning
  -- profiles.full_name, reachable over PostgREST RPC. It resolves any profile id
  -- to a real name past RLS. It holds only the DEFAULT grant to PUBLIC, which is
  -- precisely the problem — nothing granted it, so nothing thinks to revoke it.
  for r in
    select p.proname
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'profile_display_name'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE'))
  loop
    failures := failures || 'B3 profile_display_name() is EXECUTE-able by authenticated/anon — full-name oracle (F10)'::text;
  end loop;

  -- ── B4. The scoring view does not run with owner rights ────────────────────
  -- F4: a view without security_invoker executes with the VIEW OWNER's rights
  -- and their RLS exemption, and this one is granted to `anon`. Today it reads
  -- only catalogue tables, so the leak is public data — but it is an
  -- RLS-bypassing anonymous read surface with no marker saying so, and the first
  -- join to a student_* table publishes that data to unauthenticated callers
  -- with nothing in review to flag it.
  if to_regclass('public.course_scoring_v1') is not null then
    select count(*) into n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'course_scoring_v1'
      and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=on%';
    if n = 0 then
      failures := failures || 'B4 course_scoring_v1 has no security_invoker=on — owner-rights view granted to anon (F4)'::text;
    end if;
  end if;

  -- ── B5. ADVISORY — foreign keys with no index ──────────────────────────────
  -- Postgres does not auto-index foreign keys. Two costs: the app's own joins
  -- seq-scan, and every DELETE on the PARENT seq-scans the child to enforce the
  -- cascade. Advisory rather than fatal — a genuinely cold FK on a small table
  -- does not need an index — but the list should be short and every entry should
  -- be a decision, not an oversight.
  for r in
    select
      cl.relname as tbl,
      con.conname,
      (select string_agg(a.attname, ', ' order by k.ord)
         from unnest(con.conkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    where con.contype = 'f'
      and ns.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and i.indpred is null          -- a partial index cannot serve a cascade check
          -- the index's LEADING columns must cover exactly the FK's columns
          and (i.indkey::int2[])[1:array_length(con.conkey, 1)] @> con.conkey
      )
    order by cl.relname, con.conname
  loop
    raise warning 'B5 advisory: unindexed foreign key %.(%) [%]', r.tbl, r.cols, r.conname;
  end loop;

  -- ── Report ─────────────────────────────────────────────────────────────────
  if array_length(failures, 1) > 0 then
    if strict_mode then
      raise exception E'SECTION B: % target-posture invariant(s) violated:\n  %',
        array_length(failures, 1), array_to_string(failures, E'\n  ');
    else
      raise warning E'SECTION B (advisory — set ascenda.target_posture=''on'' to enforce): % violation(s):\n  %',
        array_length(failures, 1), array_to_string(failures, E'\n  ');
    end if;
  else
    raise notice 'SECTION B: target posture reached — turn ascenda.target_posture on permanently';
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- FINAL — re-raise Section A
-- ═════════════════════════════════════════════════════════════════════════════
-- Section A is the set that must hold TODAY, so it is still a hard failure and a
-- non-zero exit; it is only reported here so that Section B gets to run first.
do $$
declare
  n    integer;
  msgs text;
begin
  select count(*), string_agg(msg, E'\n  ') into n, msgs from _pi_section_a_failures;
  drop table if exists _pi_section_a_failures;
  if n > 0 then
    raise exception E'SECTION A: % policy invariant(s) violated:\n  %', n, msgs;
  end if;
end $$;
