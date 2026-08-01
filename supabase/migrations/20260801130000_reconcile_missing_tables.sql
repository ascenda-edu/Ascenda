-- Schema reconciliation: two tables that exist on the remote database and in the
-- generated types, but in NO schema file and NO migration.
--
-- NOT APPLIED to production — these tables already exist there. This migration
-- exists so a FRESH database can be provisioned from this repo at all, and so the
-- CI `database` job (which builds from schema.sql and replays every migration)
-- reflects reality. `if not exists` throughout, so applying it to production is a
-- no-op if anyone does.
--
-- ── Why this mattered ───────────────────────────────────────────────────────
-- `student_activities` is read in three places and delete-then-inserted on EVERY
-- profile save (src/lib/profile/persist-intake.ts), throwing on error. So any
-- environment built from this repo — a preview branch, a new laptop, the CI
-- database job — could not save a student profile at all. Nothing caught it
-- because nothing had ever built a database from these files.
--
-- Column definitions are transcribed from src/lib/types/database.ts, which is
-- generated from the live schema, so this matches production rather than guessing.
-- Verify against the real table before trusting the nullability of any column
-- that the generated types infer loosely.
--
-- Ordering note: this file sorts LAST of the 2026-08-01 set, and must. Its
-- simulation_results policy calls public.is_admin(), which is created by
-- 20260801120000. Named 100000 first, which would have failed on replay — caught
-- by reasoning about the CI job's replay order, not by the job itself, since the
-- job has not yet been observed running.

-- ── student_activities ───────────────────────────────────────────────────────
-- Structured extracurricular entries. Written by persist-intake's
-- replaceOwnedRows (delete + insert), read by the scorer and the matching service.

create table if not exists student_activities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  category text not null,
  level text,
  duration text,
  highlight text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists student_activities_profile_idx
  on student_activities (profile_id, sort_order);

alter table student_activities enable row level security;

-- Owner-only. The counsellor read policy is added alongside the other
-- counsellor_read policies rather than here, so all of them stay in one place.
drop policy if exists student_activities_self on student_activities;
create policy student_activities_self on student_activities
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists student_activities_counsellor_read on student_activities;
create policy student_activities_counsellor_read on student_activities
  for select to authenticated
  using (public.can_act_as_counsellor());

-- ── simulation_results ───────────────────────────────────────────────────────
-- Admin-only scoring-simulation output (src/app/admin/simulation/page.tsx).
-- Contains no student PII — `profile_name` is a synthetic fixture label — but it
-- is admin-scoped regardless, since it exposes algorithm internals.

create table if not exists simulation_results (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  batch_label text not null,
  profile_name text not null,
  programme_type text not null,
  profile_snapshot jsonb,
  student_score numeric,
  student_band text,
  student_ib_equivalent numeric,
  actual_university text not null,
  actual_program text not null,
  actual_country text not null,
  chance_percent numeric,
  algorithm_result text,
  algorithm_notes text,
  score_breakdown jsonb,
  validation_pass boolean,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists simulation_results_run_idx
  on simulation_results (run_id, created_at);

alter table simulation_results enable row level security;

drop policy if exists simulation_results_admin on simulation_results;
create policy simulation_results_admin on simulation_results
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
