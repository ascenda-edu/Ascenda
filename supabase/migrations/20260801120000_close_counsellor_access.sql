-- Phase 0 containment: close the open counsellor surface.
--
-- ⛔ NOT APPLIED, AND DELIBERATELY SO. This is a PRODUCT decision, not an
--    engineering one, and the owner deferred it on 2026-08-03: the app is still
--    in development and /counsellor must stay visible to everyone until it
--    ships. Do not apply this file to make a gate green.
--
-- ── WHAT THIS FILE USED TO ALSO DO ───────────────────────────────────────────
-- Until 2026-08-03 this file was 20260801120000_close_counsellor_access_and_
-- split_write_policies.sql and also created is_admin() and split three `for all`
-- policies by verb. Those parts are POSTURE-INDEPENDENT — they inherit whatever
-- can_act_as_counsellor() returns — so bundling them here blocked a live
-- destructive-DELETE fix behind a product decision it did not depend on, and
-- blocked four later migrations behind is_admin(), which nothing else defines.
-- They now live in 20260801115000_admin_helper_and_verb_split.sql, which sorts
-- first and is safe to apply while the portal stays open. Assertion 1 below
-- enforces that ordering.
--
-- ⛔ HARD PREREQUISITE — APPLY 20260801110000_profiles_insert_guard.sql FIRST.
--
--     Everything below routes authorisation through profiles.role. Until that
--     migration lands, ANY authenticated user can make themselves an admin:
--     profiles_self_access (schema.sql:872) has no `for` clause, so it is FOR
--     ALL — including INSERT and DELETE — while trg_guard_profile_role
--     (schema.sql:1231) is registered `before update` only. Deleting your own
--     profile row and re-inserting it with role='admin' walks straight around
--     the guard.
--
--     Applied on its own, this migration would therefore CLOSE THE FRONT DOOR
--     AND LEAVE THE BACK DOOR OPEN, while reading as though the counsellor
--     surface had been secured. is_counsellor() accepts role in
--     ('counsellor','admin'), so a self-promoted admin passes every check added
--     here. (That guard was applied 2026-08-02; 20260801115000 re-checks it.)
--
-- ⚠️  BREAKING — coordinate with an app deploy.
--     After this migration, users whose profiles.role is not 'counsellor' or
--     'admin' (and who are not the demo account) LOSE access to /counsellor and
--     to every counsellor-scoped table. That is the intended security outcome,
--     but it ends the "anyone can walk through both sides of the product" demo
--     posture.
--
--     SET COUNSELLOR_PORTAL_OPEN_TO_ALL AND PARENT_PORTAL_OPEN_TO_ALL TO false
--     IN src/lib/auth/policy.ts IN THE SAME COMMIT. Applying this without
--     flipping them does not error: the pages still render, RLS returns nothing,
--     and every counsellor dashboard and the whole parent portal go SILENTLY
--     EMPTY on real data. __tests__/db/portal-flag-agreement.test.ts enforces
--     the pairing — it reads schema.sql, so backport the body below at the same
--     time.
--
--     Before applying: confirm every account that must retain counsellor access
--     has profiles.role = 'counsellor'. A student-role account will be locked
--     out of /counsellor the moment this lands.
--
-- Reversal: re-run the body of 20260712130000 (restores `auth.uid() is not null`).
--
-- ── Why this matters ────────────────────────────────────────────────────────
-- can_act_as_counsellor() is referenced 48 times in schema.sql. Every policy on
-- help_requests, help_messages, help_notes, help_meetings, notifications,
-- counsellor_notes, parent_contacts, parent_messages, student_documents and the
-- counsellor read policies on the student_* tables routes through it. While it
-- returns `auth.uid() is not null`, all of them read "any signed-in user" —
-- and because the service-role client has no importers in src/, RLS is the
-- ENTIRE security model. There is no second layer.

-- ── 1. Restore the real counsellor test ──────────────────────────────────────
-- Exactly the rollback documented in 20260712130000. is_counsellor() already
-- covers role in ('counsellor','admin'); is_demo_account() keeps the single
-- demo login working so the sales demo does not break on deploy.

create or replace function public.can_act_as_counsellor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_counsellor() or public.is_demo_account();
$$;

grant execute on function public.can_act_as_counsellor() to authenticated;

-- ── 2. Verify it took effect ─────────────────────────────────────────────────
-- MIGRATIONS.md §6 rule 3: end with a verification block that raises. This file
-- needs one more than most: its only change is a `create or replace function`
-- body, which leaves NO distinguishable catalogue object behind
-- (MIGRATIONS.md:246-251) — there is no index to look for, no policy name that
-- appears. Only an in-file assertion can tell an operator whether the open form
-- is really gone.
--
-- Deliberately catalogue-only: no auth.uid(), no fixtures, so it is REAL in the
-- CI `database` job too, where auth.uid() is stubbed to `select null::uuid` and
-- every behavioural authorisation test passes vacuously.
--
-- Idempotent: re-running the file re-runs this and it stays green.

do $$
declare
  src text;
  survivors text;
begin
  -- 1. The verb split landed first. Closing the posture while the three `for
  --    all` policies survive would narrow DELETE from "every signed-in user" to
  --    "every counsellor" and stop there — still a single PostgREST .delete()
  --    from wiping the table, and now wearing the appearance of a completed
  --    security migration. 20260801115000 sorts before this file precisely so
  --    this assertion can be made.
  select string_agg(format('%s.%s', tablename, policyname), ', ' order by tablename, policyname)
    into survivors
  from pg_policies
  where schemaname = 'public'
    and tablename in ('parent_contacts', 'parent_messages', 'student_documents')
    and cmd = 'ALL';
  if survivors is not null then
    raise exception
      'verification failed: FOR ALL policy(ies) still present: % — apply '
      '20260801115000_admin_helper_and_verb_split.sql FIRST. Closing the counsellor '
      'posture without it leaves blanket DELETE in place for every counsellor.',
      survivors;
  end if;

  -- 2. can_act_as_counsellor() is no longer the open form.
  select p.prosrc into src
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'can_act_as_counsellor';

  if src is null then
    raise exception 'verification failed: can_act_as_counsellor() does not exist';
  end if;
  if src ~ 'auth\.uid\(\)\s+is\s+not\s+null' then
    raise exception
      'verification failed: can_act_as_counsellor() is STILL the open form '
      '(`auth.uid() is not null`) — every one of the ~24 policies that call it '
      'still reads "any signed-in user". Body: %', src;
  end if;
  if src !~ 'is_counsellor' then
    raise exception
      'verification failed: can_act_as_counsellor() does not call is_counsellor() — '
      'body is neither the open form nor the intended one: %', src;
  end if;

  raise notice 'counsellor access closed: applied and verified';
end $$;
