-- Step 4 (part 2 of 2) — RLS behaviour: the NEGATIVE cases, executed.
--
-- ⚠️  NOT RUN. Written for review by the database audit
--     (docs/audit/12-database-design.md migration plan step 4). No database was
--     contacted while writing it.
--
-- ── What this file is ────────────────────────────────────────────────────────
-- policy-invariants.sql asserts what the policies SAY. This asserts what they
-- DO: it creates four fixture identities, assumes each in turn, and checks that
-- the reads and writes that must fail, fail — and, just as importantly, that the
-- ones that must succeed, succeed.
--
-- ⛔ THIS FILE NEEDS A REAL SUPABASE. IT DOES NOTHING USEFUL IN THE CI JOB.
--    .github/workflows/ci.yml:206 stubs auth.uid() as `select null::uuid`,
--    hardcoded. Every actor is therefore the same null actor, every policy
--    predicate is false, and EVERY NEGATIVE ASSERTION BELOW PASSES VACUOUSLY
--    while proving nothing at all. A suite that passes for the wrong reason is
--    worse than no suite: it is a green check that certifies nothing.
--
--    The positive controls in section 3 exist to make that failure mode
--    IMPOSSIBLE TO MISS. Under the CI stub they fail loudly, because a null
--    actor cannot read their own row either. Do not "fix" that by deleting
--    them — it is the file telling you it is running in the wrong place.
--
--    Run it against `supabase start` (a local stack, where auth.uid() reads
--    request.jwt.claims properly), or against a disposable branch database.
--
-- ⛔ NEVER RUN THIS AGAINST PRODUCTION. It writes fixture rows into auth.users
--    and profiles. Section 0 refuses to proceed against anything that looks like
--    a real catalogue, and the whole file is wrapped in a transaction that ends
--    in ROLLBACK — but neither is a substitute for checking the connection
--    string before you press enter.
--
-- ── How to run ───────────────────────────────────────────────────────────────
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f __tests__/db/rls-negative-cases.sql
--
-- Section 4 holds the assertions for the TARGET posture (plan step 8). They are
-- EXPECTED TO FAIL on this branch — a counsellor can still read every student,
-- which is the finding. Warnings by default; hard failures with:
--   -c "set ascenda.target_posture = 'on'"
--
-- ── Why negative cases, specifically ─────────────────────────────────────────
-- Every RLS bug in this repository's history was a test that would have passed:
-- the counsellor could see the student, so the feature worked. F5 is the purest
-- form — Postgres does not error on an RLS-filtered DELETE, so the code believed
-- it had cleared the cache for a year. Nothing except an assertion that a
-- FORBIDDEN thing is forbidden catches any of it.

\set ON_ERROR_STOP on

begin;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — safety interlock
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  n bigint;
begin
  select count(*) into n from programs;
  if n > 5000 then
    raise exception
      'REFUSING TO RUN: this database holds % programme rows, which means it is production '
      'or a full restore of it. This file writes fixture identities. Point it at a local '
      '`supabase start` stack or a disposable branch database.', n;
  end if;
  raise notice 'safety interlock passed (% programme rows)', n;
end $$;

-- Failures accumulate here rather than aborting at the first, so one run reports
-- everything. Temp, so ROLLBACK is not even needed to clean it up.
create temp table _rls_failures (section text, msg text) on commit drop;
grant insert, select on _rls_failures to public;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — fixtures
-- ═════════════════════════════════════════════════════════════════════════════
-- Four identities:
--   A  student, has an assigned counsellor
--   B  student, unrelated to everyone — the attacker
--   C  counsellor, ASSIGNED to A
--   D  counsellor, assigned to NOBODY

\set student_a '00000000-0000-4000-8000-0000000000a1'
\set student_b '00000000-0000-4000-8000-0000000000b2'
\set couns_c   '00000000-0000-4000-8000-0000000000c3'
\set couns_d   '00000000-0000-4000-8000-0000000000d4'

-- auth.users rows are inserted ONLY if profiles is actually bound to auth.users.
-- Before plan step 5 there is no FK (F1) and the profiles rows stand alone;
-- after it, they cannot. Detecting the constraint rather than assuming either
-- state means this file keeps working across that migration.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    insert into auth.users (id, email, instance_id, aud, role, created_at, updated_at)
    values
      ('00000000-0000-4000-8000-0000000000a1', 'rls-a@fixture.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
      ('00000000-0000-4000-8000-0000000000b2', 'rls-b@fixture.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
      ('00000000-0000-4000-8000-0000000000c3', 'rls-c@fixture.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
      ('00000000-0000-4000-8000-0000000000d4', 'rls-d@fixture.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
    on conflict (id) do nothing;
    raise notice 'fixtures: auth.users rows created (profiles_id_fkey is present)';
  else
    raise notice 'fixtures: profiles has no FK to auth.users (F1) — skipping auth.users inserts';
  end if;
end $$;

insert into profiles (id, role, full_name) values
  (:'student_a', 'student',    'Fixture A'),
  (:'student_b', 'student',    'Fixture B'),
  (:'couns_c',   'counsellor', 'Fixture C'),
  (:'couns_d',   'counsellor', 'Fixture D')
on conflict (id) do nothing;

-- NB: this table has first_name/last_name, NOT full_name (schema.sql:69-82).
-- `email` here is the column the counsellor cohort filter reads — and the column
-- the student owns (personal_self), which is F2 in one line.
insert into student_personal_information (profile_id, email, first_name, last_name) values
  (:'student_a', 'rls-a@fixture.invalid', 'Fixture', 'A'),
  (:'student_b', 'rls-b@fixture.invalid', 'Fixture', 'B')
on conflict (profile_id) do nothing;

-- C counsels A. D counsels nobody. This is the whole point of the table.
insert into counsellor_assignments
  (counsellor_profile_id, student_profile_id, role, status, activated_at)
values (:'couns_c', :'student_a', 'primary', 'active', now())
on conflict (counsellor_profile_id, student_profile_id) do nothing;

-- A cached match belonging to A, used by the §3.3 DELETE tests.
--
-- This fixture MUST create its own catalogue row. It used to read
-- `select … from programs p limit 1`, which is unsatisfiable by construction:
-- §0 above refuses to run against anything holding more than 5000 programmes,
-- i.e. this file is only ever pointed at a near-empty catalogue, and a
-- `supabase start` stack or a disposable cluster has ZERO. The insert then
-- added no row and §3.3 aborted the whole file with `[3.3] fixture problem`,
-- for a reason that has nothing to do with policy correctness — so
-- matches_self_delete, the policy 20260802120000 exists to add, had never once
-- been exercised. See docs/audit/verify/C-database.md finding C4.
--
-- The whole file ends in ROLLBACK, so inventing a university and a programme
-- costs nothing and leaves nothing behind.
\set fx_uni  '00000000-0000-4000-8000-0000000000f1'
\set fx_prog '00000000-0000-4000-8000-0000000000f2'

insert into universities (id, name, country)
values (:'fx_uni', 'RLS Fixture University', 'United Kingdom')
on conflict (id) do nothing;

insert into programs (id, university_id, course_name)
values (:'fx_prog', :'fx_uni', 'RLS Fixture Course')
on conflict (id) do nothing;

insert into student_matches (profile_id, program_id, score)
values (:'student_a', :'fx_prog', 42)
on conflict do nothing;

-- Fail loudly here rather than 200 lines later as a mystery "[3.3] fixture
-- problem": a fixture that silently does not materialise turns every assertion
-- downstream of it into a false report.
do $$
begin
  if not exists (select 1 from student_matches
                 where profile_id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'fixture failed: student A has no student_matches row — §3.3 cannot run';
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — NEGATIVE: student B must not reach student A
-- ═════════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","email":"rls-b@fixture.invalid"}';
set local role authenticated;

do $$
declare
  n       integer;
  cleared integer;
  a       constant uuid := '00000000-0000-4000-8000-0000000000a1';
begin
  -- Sanity: are we actually somebody? If auth.uid() is null the whole section is
  -- vacuous (see the header) and must say so rather than reporting success.
  if auth.uid() is null then
    insert into _rls_failures values ('2', 'auth.uid() is NULL — running under a stub; every negative case below is vacuous');
    return;
  end if;

  -- 2.1 A's personal information
  select count(*) into n from student_personal_information where profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('2.1', 'student B can read student A''s student_personal_information');
  end if;

  -- 2.2 A's academic input
  select count(*) into n from student_academic_input where profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('2.2', 'student B can read student A''s student_academic_input');
  end if;

  -- 2.3 A's cached matches
  select count(*) into n from student_matches where profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('2.3', 'student B can read student A''s student_matches');
  end if;

  -- 2.4 B must not be able to DELETE A's rows. Postgres reports SUCCESS on an
  --     RLS-filtered delete, so the assertion is on the ROW COUNT, never on the
  --     absence of an error. This is F5 inverted, and it is the single most
  --     important shape in this file.
  delete from student_matches where profile_id = a;
  get diagnostics cleared = row_count;
  if cleared <> 0 then
    insert into _rls_failures values ('2.4', format('student B deleted %s of student A''s student_matches rows', cleared));
  end if;

  -- 2.5 F0: B must not be able to mint a profile row with an elevated role.
  begin
    insert into profiles (id, role)
    values ('00000000-0000-4000-8000-0000000000ff', 'admin');
    insert into _rls_failures values ('2.5', 'F0 OPEN: student B inserted a profiles row with role=admin');
  exception when others then
    null;  -- expected: policy violation or the role guard
  end;

  -- 2.6 F0, second path: B must not be able to promote themselves in place.
  begin
    update profiles set role = 'admin' where id = auth.uid();
    -- The UPDATE may be silently filtered rather than raising; check the result.
    if exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
      insert into _rls_failures values ('2.6', 'F0 OPEN: student B promoted their own profiles.role to admin');
    end if;
  exception when others then
    null;  -- expected: trg_guard_profile_role
  end;

  -- 2.7 F6: B must not be able to write into A's notification feed.
  begin
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (a, 'help_request', 'Injected', 'Injected body', '/dashboard', 'student');
    insert into _rls_failures values ('2.7', 'F6 OPEN: student B inserted a notification into student A''s feed');
  exception when others then
    null;  -- expected: notifications_insert policy, or trg_bound_notification_payload
  end;
end $$;

reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — POSITIVE CONTROLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Without these, a database that denies EVERYTHING to EVERYONE passes section 2
-- perfectly. That is not a hypothetical: an RLS-enabled table with zero policies
-- is exactly that state, and it looks identical to "correctly secured" in every
-- dashboard (see policy-invariants.sql A3).

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"rls-a@fixture.invalid"}';
set local role authenticated;

do $$
declare
  n       integer;
  cleared integer;
  a       constant uuid := '00000000-0000-4000-8000-0000000000a1';
begin
  if auth.uid() is null then
    insert into _rls_failures values ('3', 'auth.uid() is NULL — the positive controls cannot run; this database cannot test RLS');
    return;
  end if;

  -- 3.1 A reads their own record.
  select count(*) into n from student_personal_information where profile_id = a;
  if n <> 1 then
    insert into _rls_failures values ('3.1', format('student A cannot read their OWN student_personal_information (got %s rows)', n));
  end if;

  -- 3.2 A reads their own profile.
  select count(*) into n from profiles where id = a;
  if n <> 1 then
    insert into _rls_failures values ('3.2', format('student A cannot read their OWN profiles row (got %s rows)', n));
  end if;

  -- 3.3 F5: A CAN clear their own match cache. Asserted on the row count, for
  --     the same reason as 2.4 — the delete "succeeded" for a year while
  --     removing nothing.
  select count(*) into n from student_matches where profile_id = a;
  if n = 0 then
    insert into _rls_failures values ('3.3', 'fixture problem: student A has no student_matches rows to clear');
  else
    delete from student_matches where profile_id = a;
    get diagnostics cleared = row_count;
    if cleared = 0 then
      insert into _rls_failures values ('3.3', 'F5 OPEN: student A''s own DELETE on student_matches removed 0 rows and reported success');
    end if;
  end if;

  -- 3.4 A sees who has access to their own record. On a platform for minors,
  --     "who can see my data" must be answerable by the child.
  select count(*) into n from counsellor_assignments where student_profile_id = a;
  if n <> 1 then
    insert into _rls_failures values ('3.4', format('student A cannot see their own counsellor_assignments (got %s rows)', n));
  end if;
end $$;

reset role;

-- Counsellor C is assigned to A and must be able to do their job.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated","email":"rls-c@fixture.invalid"}';
set local role authenticated;

do $$
declare
  n integer;
  a constant uuid := '00000000-0000-4000-8000-0000000000a1';
begin
  if auth.uid() is null then return; end if;

  select count(*) into n from student_personal_information where profile_id = a;
  if n <> 1 then
    insert into _rls_failures values ('3.5', format('ASSIGNED counsellor C cannot read their own student A (got %s rows) — the scoping is too tight, not too loose', n));
  end if;
end $$;

reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — TARGET POSTURE: a counsellor must not reach an UNASSIGNED student
-- ═════════════════════════════════════════════════════════════════════════════
-- EXPECTED TO FAIL on this branch. After 20260801120000, can_act_as_counsellor()
-- is `is_counsellor() or is_demo_account()` — so counsellor D, who counsels
-- nobody, still reads every student on the platform through the ~24
-- *_counsellor_read policies. That is the move from bare-boolean to ROLE. Plan
-- step 8 moves role → RELATIONSHIP, and these assertions are what "done" means.

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated","email":"rls-d@fixture.invalid"}';
set local role authenticated;

do $$
declare
  n integer;
  a constant uuid := '00000000-0000-4000-8000-0000000000a1';
begin
  if auth.uid() is null then return; end if;

  select count(*) into n from student_personal_information where profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('4.1-target', 'UNASSIGNED counsellor D can read student A''s personal information');
  end if;

  select count(*) into n from student_academic_input where profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('4.2-target', 'UNASSIGNED counsellor D can read student A''s academic input');
  end if;

  select count(*) into n from applications where profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('4.3-target', 'UNASSIGNED counsellor D can read student A''s applications');
  end if;

  select count(*) into n from counsellor_notes where student_profile_id = a;
  if n <> 0 then
    insert into _rls_failures values ('4.4-target', 'UNASSIGNED counsellor D can read counsellor notes about student A');
  end if;

  -- D must not be able to author a note about a student they do not counsel.
  begin
    insert into counsellor_notes (student_profile_id, author_profile_id, body)
    values (a, auth.uid(), 'fixture');
    insert into _rls_failures values ('4.5-target', 'UNASSIGNED counsellor D wrote a counsellor_note about student A');
  exception when others then
    null;
  end;
end $$;

reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — report
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  now_failures    text;
  target_failures text;
  n_now           integer;
  n_target        integer;
  strict_mode     boolean := coalesce(current_setting('ascenda.target_posture', true), 'off') = 'on';
begin
  select count(*), string_agg(format('[%s] %s', section, msg), E'\n  ' order by section)
    into n_now, now_failures
  from _rls_failures where section not like '%target%';

  select count(*), string_agg(format('[%s] %s', section, msg), E'\n  ' order by section)
    into n_target, target_failures
  from _rls_failures where section like '%target%';

  if n_target > 0 then
    if strict_mode then
      n_now := n_now + n_target;
      now_failures := coalesce(now_failures || E'\n  ', '') || target_failures;
    else
      raise warning E'TARGET POSTURE (plan step 8, expected to fail today) — % finding(s):\n  %',
        n_target, target_failures;
    end if;
  end if;

  if n_now > 0 then
    raise exception E'RLS BEHAVIOUR: % assertion(s) failed:\n  %', n_now, now_failures;
  end if;

  raise notice 'RLS behaviour: all enforced assertions passed';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Nothing is kept. The fixtures existed only for the duration of this file.
-- ═════════════════════════════════════════════════════════════════════════════
rollback;
