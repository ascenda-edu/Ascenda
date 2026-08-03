-- The notification gate, executed: can a real student still ask for help?
--
-- ── What this file is and why it exists ──────────────────────────────────────
-- `20260802110000_notification_bounds.sql` puts a BEFORE INSERT OR UPDATE gate
-- on `notifications` that RAISES on an unauthorised recipient. That gate sits
-- underneath a SECURITY DEFINER trigger which fans a help request out to the
-- counsellor side — so if the fan-out ever addresses a recipient the gate
-- rejects, the abort propagates all the way up and THE STUDENT'S HELP REQUEST
-- FAILS. Not the notification: the help request.
--
-- That is not hypothetical. It is what the file shipped with. The fan-out
-- included the single-account demo (resolved by email, because it holds the
-- counsellor inbox while being role='student'); the gate whitelisted staff by
-- `profiles.role` only; and the 20260801122000 backfill creates edges for
-- `%+seed@ascenda.demo` addresses alone. So every REAL student — the one
-- population with no seeded assignment — got:
--
--   ERROR: notifications: <student> may not notify <demo> — no active
--          counsellor_assignments or guardian_links edge, and the recipient is
--          not staff. Create the assignment first.
--
-- Section 2 is that exact scenario. It is the reason this file exists; the rest
-- of the sections are here so that fixing section 2 by widening the gate would
-- be caught rather than celebrated.
--
-- ⛔ NEEDS A REAL auth.uid(). Same constraint as rls-negative-cases.sql: under a
--    stub that hardcodes `select null::uuid`, every actor is the null actor,
--    the gate short-circuits to "trusted" on line 1, and EVERY ASSERTION BELOW
--    PASSES WITHOUT TESTING ANYTHING. Section 0 refuses to run in that case
--    rather than reporting a vacuous green.
--
-- ⛔ NEVER RUN AGAINST PRODUCTION. It writes fixture identities into auth.users
--    and profiles. The whole file is one transaction ending in ROLLBACK and
--    section 0 refuses against anything that looks like a real catalogue —
--    neither is a substitute for checking the connection string first.
--
-- ── How to run ───────────────────────────────────────────────────────────────
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f __tests__/db/notification-routing-cases.sql
--
-- Or against a throwaway local cluster built from supabase/schema.sql plus the
-- 20260801*/20260802* migrations. It requires 20260801122000 and 20260802110000
-- to be applied; it says so and stops if they are not.

\set ON_ERROR_STOP on

begin;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — interlocks
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  n bigint;
begin
  select count(*) into n from programs;
  if n > 5000 then
    raise exception
      'REFUSING TO RUN: this database holds % programme rows, which means it is production '
      'or a full restore of it. This file writes fixture identities into auth.users. Point '
      'it at a local `supabase start` stack or a disposable cluster.', n;
  end if;

  -- Vacuity interlock. If auth.uid() cannot see a JWT claim, every negative case
  -- below passes for the wrong reason.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000ff"}', true);
  if auth.uid() is distinct from '00000000-0000-4000-8000-0000000000ff'::uuid then
    raise exception
      'REFUSING TO RUN: auth.uid() does not read request.jwt.claims (got %). Under a stubbed '
      'auth.uid() the gate treats every actor as the trusted service role and every assertion '
      'in this file passes vacuously. Run it against a real Supabase stack.', auth.uid();
  end if;
  perform set_config('request.jwt.claims', '', true);

  if to_regclass('public.counsellor_assignments') is null then
    raise exception 'REFUSING TO RUN: 20260801122000_counsellor_assignments.sql is not applied.';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'notifications' and t.tgname = 'trg_bound_notification_payload'
      and not t.tgisinternal
  ) then
    raise exception 'REFUSING TO RUN: 20260802110000_notification_bounds.sql is not applied.';
  end if;

  raise notice 'interlocks passed (% programme rows, auth.uid() is live)', n;
end $$;

create temp table _nb_failures (section text, msg text) on commit drop;
grant insert, select on _nb_failures to public;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — fixtures
-- ═════════════════════════════════════════════════════════════════════════════
--   demo       the single-account demo. Holds the counsellor inbox, role='student'.
--   unassigned a REAL student, no counsellor_assignments row  ← the broken case
--   assigned   a student WITH an active primary counsellor
--   couns      that counsellor, role='counsellor'
--   attacker   an unrelated student
--
-- The demo row is resolved by email if it already exists rather than inserted,
-- so this file does not collide with a real greg@workiflow.com on a stack that
-- has one.

create temp table _nb_ids (name text primary key, id uuid) on commit drop;

do $$
declare
  demo_id uuid;
begin
  select u.id into demo_id from auth.users u where lower(u.email) = 'greg@workiflow.com';
  if demo_id is null then
    demo_id := '00000000-0000-4000-8000-00000000de00'::uuid;
    insert into auth.users (id, email) values (demo_id, 'greg@workiflow.com')
      on conflict (id) do nothing;
  end if;

  insert into _nb_ids (name, id) values
    ('demo',       demo_id),
    ('unassigned', '00000000-0000-4000-8000-0000000000a1'),
    ('assigned',   '00000000-0000-4000-8000-0000000000a2'),
    ('couns',      '00000000-0000-4000-8000-0000000000c1'),
    ('attacker',   '00000000-0000-4000-8000-0000000000b1');

  insert into auth.users (id, email)
  select i.id, i.name || '@notif-fixture.invalid' from _nb_ids i where i.name <> 'demo'
  on conflict (id) do nothing;

  -- The demo profile is role='student'. That is the whole point: it is NOT
  -- staff by role, and a gate that only looks at profiles.role misses it.
  insert into profiles (id, role, full_name)
  select i.id,
         case i.name when 'couns' then 'counsellor' else 'student' end,
         initcap(i.name)
  from _nb_ids i
  on conflict (id) do nothing;

  insert into counsellor_assignments
    (counsellor_profile_id, student_profile_id, role, status, activated_at)
  select (select id from _nb_ids where name = 'couns'),
         (select id from _nb_ids where name = 'assigned'),
         'primary', 'active', now()
  on conflict (counsellor_profile_id, student_profile_id) do nothing;

  raise notice 'fixtures ready (demo = %)', demo_id;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — THE REGRESSION: an unassigned real student asks for help
-- ═════════════════════════════════════════════════════════════════════════════
-- Break the fix to see this go red: put `role in ('counsellor','admin')` back
-- into notification_recipient_allowed() in place of the duty-pool read, and this
-- section fails with 42501 while every other section stays green.

do $$
declare
  student uuid := (select id from _nb_ids where name = 'unassigned');
  demo    uuid := (select id from _nb_ids where name = 'demo');
  couns   uuid := (select id from _nb_ids where name = 'couns');
  req     uuid;
  n       integer;
begin
  if exists (select 1 from counsellor_assignments
              where student_profile_id = student and status = 'active') then
    insert into _nb_failures values ('2.0', 'fixture problem: the unassigned student has an assignment');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', student::text, 'email', 'unassigned@notif-fixture.invalid')::text, true);
  set local role authenticated;

  begin
    insert into help_requests (student_profile_id, subject, body)
    values (student, 'Which UCAS choices should I make?', 'I could use some advice.')
    returning id into req;
  exception when others then
    reset role;
    insert into _nb_failures values ('2.1',
      'an unassigned student CANNOT raise a help request: ' || sqlstate || ' ' || sqlerrm);
    return;
  end;

  reset role;

  -- It must reach the duty pool, and the duty pool must include the demo
  -- account — which is role='student' and therefore invisible to any check that
  -- reads profiles.role alone.
  select count(*) into n from notifications
   where profile_id = demo and kind = 'help_request'
     and href = '/counsellor/inbox?help=' || req::text;
  if n <> 1 then
    insert into _nb_failures values ('2.2',
      'the demo account did not receive the help_request notification (rows: ' || n || ')');
  end if;

  select count(*) into n from notifications
   where profile_id = couns and href = '/counsellor/inbox?help=' || req::text;
  if n <> 1 then
    insert into _nb_failures values ('2.3',
      'a real counsellor did not receive the unassigned student''s request (rows: ' || n || ')');
  end if;

  raise notice '[2] unassigned student raised a help request and it fanned out';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — an ASSIGNED student reaches their counsellor, not the whole pool
-- ═════════════════════════════════════════════════════════════════════════════
-- The scoping half of the same change. If this goes green while section 2 is
-- red, the fan-out was fixed by deleting the relationship scope.

do $$
declare
  student uuid := (select id from _nb_ids where name = 'assigned');
  couns   uuid := (select id from _nb_ids where name = 'couns');
  demo    uuid := (select id from _nb_ids where name = 'demo');
  req     uuid;
  n       integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', student::text, 'email', 'assigned@notif-fixture.invalid')::text, true);
  set local role authenticated;

  begin
    insert into help_requests (student_profile_id, subject, body)
    values (student, 'A question about my offer', 'Thanks in advance.')
    returning id into req;
  exception when others then
    reset role;
    insert into _nb_failures values ('3.1',
      'an ASSIGNED student cannot raise a help request: ' || sqlstate || ' ' || sqlerrm);
    return;
  end;

  reset role;

  select count(*) into n from notifications
   where profile_id = couns and href = '/counsellor/inbox?help=' || req::text;
  if n <> 1 then
    insert into _nb_failures values ('3.2',
      'the assigned counsellor did not receive the request (rows: ' || n || ')');
  end if;

  select count(*) into n from notifications
   where profile_id = demo and href = '/counsellor/inbox?help=' || req::text;
  if n <> 0 then
    insert into _nb_failures values ('3.3',
      'an ASSIGNED student''s request also fanned out to the duty pool — the relationship '
      'scope is not being applied (rows: ' || n || ')');
  end if;

  raise notice '[3] assigned student reached their counsellor only';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — the gate predicate itself, from a student session
-- ═════════════════════════════════════════════════════════════════════════════
-- Asserted directly, because the widening that fixes section 2 must not widen
-- past the duty pool. Cross-STUDENT injection is the finding the file exists to
-- close; if 4.1 goes green the gate has been turned into `true`.

do $$
declare
  attacker uuid := (select id from _nb_ids where name = 'attacker');
  victim   uuid := (select id from _nb_ids where name = 'assigned');
  couns    uuid := (select id from _nb_ids where name = 'couns');
  demo     uuid := (select id from _nb_ids where name = 'demo');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', attacker::text, 'email', 'attacker@notif-fixture.invalid')::text, true);
  set local role authenticated;

  if public.notification_recipient_allowed(victim) then
    insert into _nb_failures values ('4.1',
      'a student may notify an UNRELATED STUDENT — cross-student injection is open');
  end if;
  if not public.notification_recipient_allowed(attacker) then
    insert into _nb_failures values ('4.2', 'a user may not notify THEMSELVES');
  end if;
  if not public.notification_recipient_allowed(couns) then
    insert into _nb_failures values ('4.3', 'a student may not notify a role=counsellor account');
  end if;
  if not public.notification_recipient_allowed(demo) then
    insert into _nb_failures values ('4.4',
      'a student may not notify the demo account — this is the exact gap that broke '
      'every unassigned student''s help request');
  end if;

  reset role;
  raise notice '[4] gate predicate: staff + demo reachable, unrelated students are not';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — payload bounds: truncate, do not reject
-- ═════════════════════════════════════════════════════════════════════════════
-- A legitimate over-long subject must never fail the write that produced it.
-- A malformed kind or an off-site href must.

do $$
declare
  actor uuid := (select id from _nb_ids where name = 'attacker');
  got   text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', actor::text, 'email', 'attacker@notif-fixture.invalid')::text, true);
  set local role authenticated;

  -- 5.1 over-long title: truncated to 160, whitespace collapsed, no error
  begin
    insert into notifications (profile_id, kind, title, body, href)
    values (actor, 'doc_nudge', repeat('a b ', 200), repeat('c d ', 200), '/x')
    returning title into got;
    if char_length(got) <> 160 then
      insert into _nb_failures values ('5.1',
        'a 800-char title was stored at length ' || char_length(got) || ', expected 160');
    end if;
  exception when others then
    insert into _nb_failures values ('5.1',
      'an over-long title RAISED instead of truncating: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 5.2 protocol-relative href must be rejected (it navigates off-site)
  begin
    insert into notifications (profile_id, kind, title, body, href)
    values (actor, 'doc_nudge', 'hi', null, '//evil.example');
    insert into _nb_failures values ('5.2', 'a protocol-relative href // was ACCEPTED');
  exception when others then null;
  end;

  -- 5.3 malformed kind must be rejected
  begin
    insert into notifications (profile_id, kind, title, body, href)
    values (actor, 'Not A Kind', 'hi', null, '/x');
    insert into _nb_failures values ('5.3', 'a malformed kind was ACCEPTED');
  exception when others then null;
  end;

  -- 5.4 empty title must be rejected — this is the raise 20260802130000's
  --     pre-flight check has to mirror. If it stops raising, that check is
  --     over-strict and will refuse migrations for no reason.
  begin
    insert into notifications (profile_id, kind, title, body, href)
    values (actor, 'doc_nudge', '', null, '/x');
    insert into _nb_failures values ('5.4',
      'an empty title was ACCEPTED — 20260802130000 section 0 now over-counts');
  exception when others then null;
  end;

  reset role;
  raise notice '[5] payload bounds: truncate long, reject malformed';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — the two definitions of "staff" must be the same set
-- ═════════════════════════════════════════════════════════════════════════════
-- Runs as the superuser: notification_duty_pool() is deliberately not granted to
-- `authenticated` (it enumerates staff ids). This is the same assertion the
-- migration's own verification block makes; it is repeated here because the
-- migration only runs once and this file runs whenever anyone changes the
-- routing.

do $$
declare
  orphan uuid := '00000000-0000-0000-0000-000000000000';
  n integer;
begin
  select count(*) into n from (
    (select t from public.counsellor_notification_targets(orphan) t
     except select d from public.notification_duty_pool() d)
    union all
    (select d from public.notification_duty_pool() d
     except select t from public.counsellor_notification_targets(orphan) t)
  ) s;
  if n <> 0 then
    insert into _nb_failures values ('6.1',
      'the fan-out and the duty pool disagree on ' || n || ' id(s) — an unassigned student''s '
      'help request will abort at 42501 or silently skip an inbox');
  end if;

  select count(*) into n from (
    (select t from public.counsellor_notification_targets() t
     except select d from public.notification_duty_pool() d)
    union all
    (select d from public.notification_duty_pool() d
     except select t from public.counsellor_notification_targets() t)
  ) s;
  if n <> 0 then
    insert into _nb_failures values ('6.2',
      'the ZERO-ARGUMENT fan-out disagrees with the duty pool on ' || n || ' id(s)');
  end if;

  raise notice '[6] fan-out ≡ duty pool';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- REPORT
-- ═════════════════════════════════════════════════════════════════════════════

select section, msg from _nb_failures order by section;

do $$
declare
  n integer;
begin
  select count(*) into n from _nb_failures;
  if n > 0 then
    raise exception '% notification-routing case(s) FAILED — see the table above', n;
  end if;
  raise notice 'ALL NOTIFICATION-ROUTING CASES PASSED';
end $$;

rollback;
