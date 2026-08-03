-- Remove blanket DELETE from three tables that grant it to every authenticated
-- user, and add the explicit admin test those DELETE policies resolve through.
--
-- ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
-- This was §2 and §3 of 20260801120000_close_counsellor_access.sql. It was split
-- out on 2026-08-03 because that file does two independent things, and only one
-- of them is a posture change:
--
--   §1 (stayed there)  rewrites can_act_as_counsellor() to a real role test.
--                      That CLOSES /counsellor to non-counsellors. It is a
--                      product decision and it is deliberately deferred — the
--                      app is in development and the portal must stay open to
--                      everyone for now.
--   §2/§3 (this file)  are POSTURE-INDEPENDENT. Every policy below calls
--                      can_act_as_counsellor() *by name*, so it inherits
--                      whatever posture is in force. Applied while the open
--                      form is still deployed, counsellors-meaning-everyone
--                      keep select/insert/update exactly as they do today, and
--                      only DELETE narrows to admins.
--
-- Keeping them in one file blocked this fix behind a product decision it does
-- not depend on, and blocked four later migrations behind is_admin(), which is
-- created in §2 and defined nowhere else. 20260801130000 failed in production
-- on 2026-08-02 with `function public.is_admin() does not exist` for exactly
-- that reason.
--
-- ── THE HOLE THIS CLOSES, WHICH IS LIVE ──────────────────────────────────────
-- `for all` includes DELETE. can_act_as_counsellor() is currently
-- `auth.uid() is not null` (20260712130000), so parent_contacts_all,
-- parent_messages_all and student_documents_counsellor_all each read "any
-- signed-in user may do anything, including DELETE". One PostgREST .delete()
-- destroys every parent contact, every parent↔counsellor message, or every
-- student document row in the platform — unaudited, and unrecoverable without
-- a restore.
--
-- The open posture does not create this hole, but it is what makes "counsellor"
-- mean "everyone", so it is what makes it reachable. Closing it does not require
-- closing the portal.
--
-- Counsellors legitimately need select/insert/update on these tables. No product
-- flow requires a counsellor to hard-delete another person's correspondence, so
-- DELETE is narrowed to admins.
--
-- ── PREREQUISITE — SATISFIED ─────────────────────────────────────────────────
-- 20260801110000_profiles_insert_guard.sql must land first, and did (applied
-- 2026-08-02). is_admin() reads profiles.role; until that guard existed any user
-- could delete and re-insert their own profile row with role='admin' and walk
-- straight around every policy below. Assertion 1 re-checks it rather than
-- trusting the ledger.
--
-- Reversal: restore the three `for all` policies from schema.sql and drop the
-- per-verb policies this file creates. is_admin() is additive; leaving it costs
-- nothing.

-- ── 1. An explicit admin test ────────────────────────────────────────────────
-- Destructive verbs are narrowed to admins below, and there was no is_admin()
-- helper — is_counsellor() deliberately spans 'counsellor' and 'admin', so it
-- cannot express "admin only".

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ── 2. Split the `for all` policies by verb ──────────────────────────────────

-- parent_contacts ------------------------------------------------------------
drop policy if exists parent_contacts_all on parent_contacts;

drop policy if exists parent_contacts_counsellor_read on parent_contacts;
create policy parent_contacts_counsellor_read on parent_contacts
  for select to authenticated
  using (public.can_act_as_counsellor());

drop policy if exists parent_contacts_counsellor_insert on parent_contacts;
create policy parent_contacts_counsellor_insert on parent_contacts
  for insert to authenticated
  with check (public.can_act_as_counsellor());

drop policy if exists parent_contacts_counsellor_update on parent_contacts;
create policy parent_contacts_counsellor_update on parent_contacts
  for update to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

drop policy if exists parent_contacts_admin_delete on parent_contacts;
create policy parent_contacts_admin_delete on parent_contacts
  for delete to authenticated
  using (public.is_admin());

-- parent_messages ------------------------------------------------------------
drop policy if exists parent_messages_all on parent_messages;

drop policy if exists parent_messages_counsellor_read on parent_messages;
create policy parent_messages_counsellor_read on parent_messages
  for select to authenticated
  using (public.can_act_as_counsellor());

drop policy if exists parent_messages_counsellor_insert on parent_messages;
create policy parent_messages_counsellor_insert on parent_messages
  for insert to authenticated
  with check (public.can_act_as_counsellor());

-- Update is limited to marking a message read; there is no product flow for a
-- counsellor to rewrite the text of a message after sending.
drop policy if exists parent_messages_counsellor_update on parent_messages;
create policy parent_messages_counsellor_update on parent_messages
  for update to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

drop policy if exists parent_messages_admin_delete on parent_messages;
create policy parent_messages_admin_delete on parent_messages
  for delete to authenticated
  using (public.is_admin());

-- student_documents ----------------------------------------------------------
drop policy if exists student_documents_counsellor_all on student_documents;

drop policy if exists student_documents_counsellor_write on student_documents;
create policy student_documents_counsellor_write on student_documents
  for insert to authenticated
  with check (public.can_act_as_counsellor());

drop policy if exists student_documents_counsellor_update on student_documents;
create policy student_documents_counsellor_update on student_documents
  for update to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

drop policy if exists student_documents_admin_delete on student_documents;
create policy student_documents_admin_delete on student_documents
  for delete to authenticated
  using (public.is_admin());

-- Unchanged in effect, restated so the SELECT rule for this table lives beside
-- the others: a student sees their own document rows, a counsellor sees all.
drop policy if exists student_documents_student_read on student_documents;
create policy student_documents_student_read on student_documents
  for select to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor());

-- ── 3. Verify it took effect ─────────────────────────────────────────────────
-- MIGRATIONS.md §6 rule 3: end with a verification block that raises. A security
-- migration that can silently no-op is worse than one that fails, because it
-- reads as though it worked.
--
-- Deliberately catalogue-only: no auth.uid(), no fixtures, so it is REAL in the
-- CI `database` job too, where auth.uid() is stubbed to `select null::uuid` and
-- every behavioural authorisation test passes vacuously.
--
-- Deliberately says NOTHING about can_act_as_counsellor()'s body. This file is
-- posture-independent and must stay green under both postures; asserting the
-- posture here is what would re-couple it to the product decision. That
-- assertion lives in 20260801120000, where the posture change itself lives.
--
-- Idempotent: re-running the file re-runs this and it stays green.

do $$
declare
  n   integer;
  survivors text;
begin
  -- 1. The prerequisite actually landed. is_admin() reads profiles.role, so a
  --    self-promotion route defeats every admin_delete policy below. Cheap to
  --    check, and the ledger has been wrong before.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'profiles_self_insert';
  if n <> 1 then
    raise exception
      'verification failed: profiles_self_insert is missing — '
      '20260801110000_profiles_insert_guard.sql has not been applied. Until it is, '
      'any user can delete and re-insert their own profile row with role=''admin'' '
      'and pass every is_admin() check this file adds.';
  end if;

  -- 2. is_admin() exists and pins its search_path (it is SECURITY DEFINER).
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'is_admin' and p.prosecdef
    and exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                where cfg like 'search\_path=%');
  if n <> 1 then
    raise exception
      'verification failed: public.is_admin() is missing, not SECURITY DEFINER, or does '
      'not pin search_path — the *_admin_delete policies above all resolve through it';
  end if;

  -- 3. No FOR ALL policy survived the split. These are the three the file drops;
  --    a `for all` here is a single PostgREST .delete() away from wiping the table.
  select string_agg(format('%s.%s', tablename, policyname), ', ' order by tablename, policyname)
    into survivors
  from pg_policies
  where schemaname = 'public'
    and tablename in ('parent_contacts', 'parent_messages', 'student_documents')
    and cmd = 'ALL';
  if survivors is not null then
    raise exception
      'verification failed: FOR ALL policy(ies) survived the verb split: %', survivors;
  end if;

  -- 4. The split actually produced the per-verb policies. A drop with no create
  --    would satisfy assertion 3 while leaving counsellors unable to work at all.
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and policyname in ('parent_contacts_counsellor_read',   'parent_contacts_counsellor_insert',
                       'parent_contacts_counsellor_update', 'parent_contacts_admin_delete',
                       'parent_messages_counsellor_read',   'parent_messages_counsellor_insert',
                       'parent_messages_counsellor_update', 'parent_messages_admin_delete',
                       'student_documents_counsellor_write','student_documents_counsellor_update',
                       'student_documents_admin_delete',    'student_documents_student_read');
  if n <> 12 then
    raise exception
      'verification failed: expected 12 split policies, found % — the split half-applied', n;
  end if;

  -- 5. Every DELETE on those three tables is admin-only.
  select string_agg(format('%s.%s', tablename, policyname), ', ' order by tablename, policyname)
    into survivors
  from pg_policies
  where schemaname = 'public'
    and tablename in ('parent_contacts', 'parent_messages', 'student_documents')
    and cmd = 'DELETE'
    and coalesce(qual, '') !~ 'is_admin';
  if survivors is not null then
    raise exception
      'verification failed: non-admin DELETE policy(ies) on the parent/document tables: %',
      survivors;
  end if;

  raise notice 'admin helper created and write policies split: applied and verified';
end $$;
