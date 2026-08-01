-- Phase 0 containment: close the open counsellor surface and remove blanket
-- DELETE from three tables that granted it to every authenticated user.
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
--     here.
--
-- ⚠️  BREAKING — coordinate with an app deploy.
--     After this migration, users whose profiles.role is not 'counsellor' or
--     'admin' (and who are not the demo account) LOSE access to /counsellor and
--     to every counsellor-scoped table. That is the intended security outcome,
--     but it ends the "anyone can walk through both sides of the product" demo
--     posture. The matching application-side change is in the same commit:
--     src/lib/api/guards.ts `canActAsCounsellor` now mirrors this definition.
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
-- returned `auth.uid() is not null`, all of them read "any signed-in user" —
-- and because the service-role client has no importers in src/, RLS is the
-- ENTIRE security model. There was no second layer.

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

-- ── 2. An explicit admin test ────────────────────────────────────────────────
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

-- ── 3. Split the `for all` policies by verb ──────────────────────────────────
-- `for all` includes DELETE. Combined with the open guard above, any signed-in
-- user could issue a single PostgREST .delete() and destroy every parent contact,
-- every parent↔counsellor message, or every student document record in the
-- platform — unaudited and unrecoverable without a restore.
--
-- Counsellors legitimately need select/insert/update on these. None of the
-- product's flows require a counsellor to hard-delete another person's
-- correspondence, so DELETE is narrowed to admins.

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
