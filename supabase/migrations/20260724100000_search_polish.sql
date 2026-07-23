-- Search-polish supporting objects (feat/search-polish).
--
-- Why each object exists (all timings measured against the live DB, 2026-07-24):
--
--   1. idx_programs_admission_test — the test-optional facet moved from the
--      (inert) universities.requires_test column to programs.admission_test.
--      Counting/filtering by admission_test had NO index and TIMED OUT (57014).
--      Partial index (admission_test is not null) keeps it small — the null
--      rows are the majority and never need index support for the `= 'Required'`
--      exclusion probe.
--
--   2. idx_programs_field_tuition — the subject facet alone measured ~1.7s, and
--      subject + ranking + tuition-sort combined at ~5s. A composite (field,
--      tuition) index lets the subject filter (equality on field) stream rows
--      already ordered by tuition, serving the tuition sort from the same index
--      instead of a bitmap scan + re-sort.
--
--   3. shortlisted_programs — CLAUDE.md notes this table "may not exist on the
--      remote DB"; the 50× 404s on every results-page load prove it does not.
--      The definition below is extracted VERBATIM from supabase/schema.sql
--      (table + index + RLS enable + policies) so the remote finally gets it.
--
-- Idempotent: safe to re-run (create index/table if not exists; policies are
-- dropped-then-created).

-- 1 + 2. Performance indexes ------------------------------------------------
create index if not exists idx_programs_admission_test
  on programs (admission_test)
  where admission_test is not null;

create index if not exists idx_programs_field_tuition
  on programs (field, tuition);

-- 3. shortlisted_programs (verbatim from schema.sql) ------------------------
create table if not exists shortlisted_programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  program_name text,
  university_name text,
  location text,
  stage text,
  fit_score numeric,
  next_action text,
  due_date text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique(profile_id, program_id)
);

create index if not exists idx_shortlisted_profile on shortlisted_programs(profile_id);

alter table shortlisted_programs enable row level security;

drop policy if exists shortlist_self on shortlisted_programs;
drop policy if exists shortlist_self_update on shortlisted_programs;
drop policy if exists shortlist_self_insert on shortlisted_programs;
drop policy if exists shortlist_self_delete on shortlisted_programs;
drop policy if exists shortlist_admin on shortlisted_programs;
create policy shortlist_self on shortlisted_programs
  for select using (auth.uid() = profile_id);
create policy shortlist_self_update on shortlisted_programs
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy shortlist_self_insert on shortlisted_programs
  for insert with check (auth.uid() = profile_id);
create policy shortlist_self_delete on shortlisted_programs
  for delete using (auth.uid() = profile_id);
create policy shortlist_admin on shortlisted_programs using ((select auth_role()) = 'admin');

analyze programs;
