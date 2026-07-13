-- Wire the counsellor dashboard to real student data.
--
-- Access model: a counsellor (profiles.role in 'counsellor'/'admin', or the
-- single-account demo via is_demo_account()) may READ every student's profile
-- data so the cohort views (roster, analytics, deadlines, applications,
-- outcomes) can render. Students keep their existing owner-only access; the new
-- policies are additive (permissive → OR-combined). Reuses
-- public.can_act_as_counsellor() (SECURITY DEFINER) from
-- 20260611130000_tighten_help_rls.sql, so no RLS recursion on the profiles read.
--
-- Also adds the schema the counsellor UI needs but the DB lacked: application
-- outcomes + platform, per-student counsellor notes, parent communications, and
-- a document tracker.

-- Self-contained helper definitions. can_act_as_counsellor() is also created by
-- 20260611130000_tighten_help_rls.sql, but that migration was never applied to
-- this remote (it got divergent 20260531* migrations instead), so we define the
-- functions here idempotently. `create or replace` makes re-application safe if
-- the help-RLS migration is applied later — the definitions are identical.
create or replace function public.is_counsellor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('counsellor', 'admin'));
$$;

create or replace function public.is_demo_account()
returns boolean language sql stable as $$
  select coalesce(lower(coalesce(auth.jwt() ->> 'email', '')) = 'greg@workiflow.com', false);
$$;

create or replace function public.can_act_as_counsellor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_counsellor() or public.is_demo_account();
$$;

grant execute on function public.is_counsellor() to authenticated;
grant execute on function public.is_demo_account() to authenticated;
grant execute on function public.can_act_as_counsellor() to authenticated;

begin;

-- ── Phase 0: reconcile the counsellor role spelling ──────────────────────────
-- schema.sql constrained role to American 'counselor' while every app code path
-- and is_counsellor() use British 'counsellor'. Drop whatever role CHECK exists
-- (the original is an inline, unpredictably-named constraint), migrate any data,
-- and re-add a named British-spelling constraint.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

update public.profiles set role = 'counsellor' where role = 'counselor';

alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'counsellor', 'admin'));

-- ── A1: counsellor read access on the per-owner student tables ───────────────
-- (deadlines / programs / universities / application_tasks are already
-- authenticated-readable, so they are intentionally omitted here.)

drop policy if exists profiles_counsellor_read on profiles;
create policy profiles_counsellor_read on profiles
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists personal_counsellor_read on student_personal_information;
create policy personal_counsellor_read on student_personal_information
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists academic_input_counsellor_read on student_academic_input;
create policy academic_input_counsellor_read on student_academic_input
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists subjects_counsellor_read on student_subjects;
create policy subjects_counsellor_read on student_subjects
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists admissions_counsellor_read on student_admissions_tests;
create policy admissions_counsellor_read on student_admissions_tests
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists lifestyle_counsellor_read on student_lifestyle_preference;
create policy lifestyle_counsellor_read on student_lifestyle_preference
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists scores_counsellor_read on student_scores;
create policy scores_counsellor_read on student_scores
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists matches_counsellor_read on student_matches;
create policy matches_counsellor_read on student_matches
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists applications_counsellor_read on applications;
create policy applications_counsellor_read on applications
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists checklist_counsellor_read on application_checklist;
create policy checklist_counsellor_read on application_checklist
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists documents_counsellor_read on documents;
create policy documents_counsellor_read on documents
  for select to authenticated using (public.can_act_as_counsellor());

-- ── A2: application outcomes + platform ──────────────────────────────────────
-- `decision` is the admissions result (null = pending); `platform` is the
-- submission portal. `country` is intentionally NOT stored — the adapter derives
-- it from programs → universities.country.
alter table applications add column if not exists platform text;
alter table applications add column if not exists decision text;
alter table applications add column if not exists decision_at timestamptz;
alter table applications add column if not exists decision_conditions text;

alter table applications drop constraint if exists applications_decision_check;
alter table applications add constraint applications_decision_check
  check (decision is null or decision in ('accepted', 'rejected', 'waitlisted', 'withdrawn'));

-- ── A3: per-student counsellor notes (Notes tab + activity feed) ─────────────
create table if not exists counsellor_notes (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references profiles(id) on delete cascade,
  author_profile_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  note_type text not null default 'session' check (note_type in ('session', 'flag', 'update')),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists counsellor_notes_student_idx
  on counsellor_notes (student_profile_id, created_at desc);

alter table counsellor_notes enable row level security;

drop policy if exists counsellor_notes_select on counsellor_notes;
create policy counsellor_notes_select on counsellor_notes
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists counsellor_notes_insert on counsellor_notes;
create policy counsellor_notes_insert on counsellor_notes
  for insert to authenticated
  with check (public.can_act_as_counsellor() and author_profile_id = auth.uid());

drop policy if exists counsellor_notes_update on counsellor_notes;
create policy counsellor_notes_update on counsellor_notes
  for update to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

-- ── A4: parent communications ────────────────────────────────────────────────
create table if not exists parent_contacts (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references profiles(id) on delete cascade,
  parent_name text not null,
  relationship text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'needs-response', 'resolved')),
  last_contacted timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists parent_contacts_student_idx
  on parent_contacts (student_profile_id);

alter table parent_contacts enable row level security;

drop policy if exists parent_contacts_all on parent_contacts;
create policy parent_contacts_all on parent_contacts
  for all to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

create table if not exists parent_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references parent_contacts(id) on delete cascade,
  sender text not null check (sender in ('counsellor', 'parent')),
  body text not null,
  template text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists parent_messages_contact_idx
  on parent_messages (contact_id, created_at);

alter table parent_messages enable row level security;

drop policy if exists parent_messages_all on parent_messages;
create policy parent_messages_all on parent_messages
  for all to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

-- ── A5: document tracker (distinct from storage-backed `documents`) ──────────
create table if not exists student_documents (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references profiles(id) on delete cascade,
  document_name text not null,
  doc_type text not null check (doc_type in ('transcript', 'recommendation', 'essay', 'certificate', 'other')),
  status text not null default 'pending' check (status in ('received', 'pending', 'overdue')),
  uploaded_at timestamptz,
  due_date date,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists student_documents_student_idx
  on student_documents (student_profile_id);

alter table student_documents enable row level security;

drop policy if exists student_documents_counsellor_all on student_documents;
create policy student_documents_counsellor_all on student_documents
  for all to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());

drop policy if exists student_documents_student_read on student_documents;
create policy student_documents_student_read on student_documents
  for select to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor());

commit;
