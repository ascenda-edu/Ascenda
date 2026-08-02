-- Enable extensions
create extension if not exists "pgcrypto";

-- Custom enums
create type campus_type as enum ('urban', 'suburban', 'rural', 'online');
create type setting_type as enum ('public', 'private', 'international', 'other');
create type size_type as enum ('small', 'medium', 'large', 'mega');
create type delivery_type as enum ('in_person', 'online', 'hybrid');
create type application_task_category as enum ('test', 'essay', 'reference', 'visa', 'finance', 'portal');
create type application_status as enum ('planning', 'in_progress', 'submitted', 'decision', 'enrolled');
create type checklist_status as enum ('todo', 'doing', 'done');
create type source_health as enum ('ok', 'stale', 'error');
-- 'ACT' appended by 20260611120000_act_ap_enum_values.sql (folded into the
-- create list here — ALTER TYPE ... ADD VALUE cannot run in the same
-- transaction as its first use).
create type programme_type as enum ('IB', 'A_LEVEL', 'ACT');
create type intended_cluster as enum (
  'computer_science',
  'maths',
  'engineering',
  'life_sciences_biochem',
  'medicine_dentistry',
  'economics_quant',
  'business_non_quant',
  'law',
  'humanities',
  'creative'
);
create type english_test_type as enum ('IELTS', 'TOEFL', 'DUOLINGO', 'WAIVER', 'NONE');
create type english_status as enum ('met', 'exceeds', 'exceptional', 'booked', 'missing', 'failed');
create type admissions_test_type as enum ('LNAT', 'UCAT', 'TMUA', 'MAT', 'STEP', 'ESAT', 'TSA', 'NONE');
create type admissions_status as enum ('taken', 'booked', 'missing');
create type gender_type as enum ('female', 'male', 'non_binary', 'prefer_not_to_say');
create type school_type as enum ('international_school', 'local_private', 'state_public', 'boarding', 'other');
create type language_of_instruction as enum ('english', 'bilingual', 'non_english');
create type ib_grade as enum ('A', 'B', 'C', 'D', 'E');
create type ib_math_pathway as enum ('AA_HL', 'AA_SL', 'AI_HL', 'AI_SL');
-- 'AP' appended by 20260611120000_act_ap_enum_values.sql (folded in, as above).
create type subject_level as enum ('HL', 'SL', 'A_LEVEL', 'AP');
create type teaching_style as enum ('academic', 'practical', 'mixed');
create type location_type as enum ('london', 'major_city', 'smaller_city', 'suburban', 'no_preference');
create type campus_size_preference as enum ('small', 'medium', 'large', 'no_preference');
create type cost_of_life_enum as enum ('HIGH', 'MEDIUM', 'LOW');

create or replace function safe_int(input text, max_len int default 9) returns int as $$
  select case
    when input is null then null
    when length(input) > max_len then null
    else input::int
  end;
$$ language sql immutable;

-- Profiles
-- role check uses the named constraint + British 'counsellor' spelling from
-- 20260628120000_counsellor_real_data.sql (which reconciled the original
-- American 'counselor' spelling).
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  role text not null default 'student'
    constraint profiles_role_check check (role in ('student', 'counsellor', 'admin')),
  full_name text,
  country text,
  locale text,
  time_zone text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Personal information
create table if not exists student_personal_information (
  profile_id uuid primary key references profiles(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  nationality text,
  age int,
  gender gender_type,
  resident_country text,
  current_location_city text,
  time_zone text,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Academic input
create table if not exists student_academic_input (
  profile_id uuid primary key references profiles(id) on delete cascade,
  programme_type programme_type,
  school_name text,
  school_country text,
  school_city text,
  school_type school_type,
  language_of_instruction language_of_instruction,
  graduation_year int,
  desired_start_date date,
  intended_clusters intended_cluster[],
  secondary_clusters intended_cluster[],
  career_aspiration text,
  ib_total_points int,
  ib_core_points int,
  ib_tok_grade ib_grade,
  ib_ee_grade ib_grade,
  ib_math_pathway ib_math_pathway,
  ee_subject text,
  ee_title text,
  ee_summary text,
  a_level_predicted_grades jsonb,
  english_required boolean,
  english_test_type english_test_type,
  english_status english_status,
  english_score_overall numeric,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Subjects
create table if not exists student_subjects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  subject_name text,
  level subject_level,
  grade_value text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Admissions tests
create table if not exists student_admissions_tests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  test_type admissions_test_type,
  status admissions_status,
  score_numeric numeric,
  percentile numeric,
  created_at timestamptz not null default timezone('utc', now())
);

-- Lifestyle preferences
create table if not exists student_lifestyle_preference (
  profile_id uuid primary key references profiles(id) on delete cascade,
  teaching_style teaching_style,
  desired_location_type location_type,
  campus_size campus_size_preference,
  extracurricular_interests text[],
  other_extracurriculars text,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Structured extracurricular entries.
--
-- Present on the remote database and in the generated types, but missing from
-- this file and from every migration until 2026-08-01 — while
-- src/lib/profile/persist-intake.ts delete-then-inserts it on EVERY profile save
-- and throws on error. So any database built from this repo (a preview branch, a
-- new laptop, the CI `database` job) could not save a student profile at all.
-- Nothing caught it because nothing had ever built a database from these files.
-- Backported from 20260801130000_reconcile_missing_tables.sql.
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

-- Admin-only scoring-simulation output (src/app/admin/simulation/page.tsx).
-- Same story as student_activities: live on the remote database, absent here.
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

-- Student scores
create table if not exists student_scores (
  profile_id uuid primary key references profiles(id) on delete cascade,
  total_score int,
  student_band text,
  eligibility_flags text[],
  readiness_flags text[],
  breakdown jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Sources
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  last_scraped_at timestamptz,
  health source_health not null default 'ok',
  notes text
);

-- Cities
create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  country text not null,
  average_rent_outside_campus_gbp_per_month integer,
  cost_of_life cost_of_life_enum,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (name, region, country)
);

-- Universities
create table if not exists universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  region text,
  city text,
  city_id uuid references cities(id) on delete set null,
  rank_overall int,
  rank_source text,
  -- Present on the remote database and in the generated types, but missing from
  -- this file until 2026-08-01 — while idx_universities_recognition_score below
  -- referenced it. A fresh `psql -f schema.sql` therefore ABORTED at that index,
  -- and everything after it (roughly half the tables, all 93 policies, all 19
  -- functions) silently never ran. Nothing caught it because nothing ever
  -- replayed this file; the CI `database` job now does, on every PR.
  --
  -- DECLARED HERE AND NOWHERE ELSE. No migration adds this column — and
  -- 20250308120000_normalize_course_catalog.sql actively REMOVES it, because it
  -- renames this table to archive_raw_universities and promotes a
  -- `universities_v2` (that file, :32-60) which never declared it. That is why
  -- adding the column here did not, on its own, make the CI `database` job pass:
  -- the replay dropped it again, and 20260723120000:21 then failed with 42703.
  -- That migration is a one-time normalization and is now on the not-replayable
  -- ledger in scripts/ci-db-check.sh. Never re-apply it to a normalized database.
  --
  -- Used by search suggestions to prioritise well-known universities (>= 5).
  recognition_score numeric,
  website text,
  intl_tuition_low numeric,
  intl_tuition_high numeric,
  currency text,
  acceptance_rate numeric,
  requires_test boolean default false,
  qs_uk_rank int,
  times_sunday_rank int,
  guardian_rank int,
  acceptance_rate_pct numeric check (acceptance_rate_pct between 0 and 100),
  nss_score_pct numeric check (nss_score_pct between 0 and 100),
  international_students_ratio_pct numeric check (international_students_ratio_pct between 0 and 100),
  student_to_staff_ratio numeric check (student_to_staff_ratio between 0 and 100),
  student_dorm_cost_gbp_per_year integer check (student_dorm_cost_gbp_per_year >= 0),
  average_rent_outside_campus_gbp_per_month_override integer check (average_rent_outside_campus_gbp_per_month_override >= 0),
  cost_of_life_override cost_of_life_enum,
  graduate_employment_rate_pct numeric check (graduate_employment_rate_pct between 0 and 100),
  average_starting_salary_gbp integer check (average_starting_salary_gbp >= 0),
  university_life text,
  number_of_students integer check (number_of_students >= 0),
  transport_accessibility text,
  cultural_social_environment text,
  city_life text,
  climate text,
  safety_index text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Programs
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  name text,
  course_name text not null,
  field text,
  study_level text,
  level text,
  duration text,
  duration_years numeric,
  start_date text,
  campus text,
  language text,
  mode text,
  intake_months text[],
  tuition numeric,
  currency text,
  course_summary text,
  modules text,
  assessment_methods text,
  provider_course_url text,
  provider_apply_url text,
  ucas_code text,
  min_alevel text,
  min_ib text,
  ucas_points text,
  subject_requirements text,
  entry_requirements_overview text,
  additional_entry_requirements text,
  subsequent_year_entry_requirements text,
  english_requirements text,
  contextual_admissions text,
  tuition_fees_international text,
  tuition_fees_home text,
  additional_fee_info text,
  student_satisfaction text,
  employment_after_course text,
  student_outcomes text,
  average_salary_after_15m text,
  historic_entry_grades text,
  open_days text,
  url text,
  metadata jsonb default '{}'::jsonb,
  min_ib_score smallint check (min_ib_score between 24 and 45),
  min_a_level_score text,
  a_level_min_numeric smallint check (a_level_min_numeric between 30 and 100),
  preferred_subjects text,
  preferred_subjects_json jsonb,
  english_score_requirement text,
  course_online_page text,
  ucas_deadline text,
  admission_test text,
  interview text,
  nss_score_pct_override numeric check (nss_score_pct_override between 0 and 100),
  intake_size integer check (intake_size >= 0),
  gender_ratio_pct numeric check (gender_ratio_pct between 0 and 100),
  international_students_ratio_pct_override numeric check (international_students_ratio_pct_override between 0 and 100),
  student_to_staff_ratio_override numeric check (student_to_staff_ratio_override between 0 and 100),
  yearly_international_tuition_fee_gbp integer check (yearly_international_tuition_fee_gbp >= 0),
  student_dorm_cost_gbp_per_year_override integer check (student_dorm_cost_gbp_per_year_override >= 0),
  average_rent_outside_campus_gbp_per_month_override integer check (average_rent_outside_campus_gbp_per_month_override >= 0),
  cost_of_life_override cost_of_life_enum,
  university_life_override text,
  study_abroad_option text,
  top_industries text,
  placement_year boolean,
  placement_year_detail text,
  average_starting_salary_gbp_override integer check (average_starting_salary_gbp_override >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Program requirements
create table if not exists program_requirements (
  program_id uuid primary key references programs(id) on delete cascade,
  curriculum text,
  min_gpa numeric,
  min_ib_total int,
  min_sat int,
  min_act int,
  required_subjects text[],
  language_tests jsonb,
  other_requirements text
);

-- Deadlines
create table if not exists deadlines (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  deadline_date date,
  intake text,
  is_rolling boolean default false,
  timezone text,
  source_id uuid references sources(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

-- course_scoring_v1: FINAL version from
-- 20250415_update_course_scoring_v1_metadata_scores.sql — prefers pre-computed
-- scores from programs.metadata / universities.metadata (all_countries_programs
-- import), falling back to the ranking-derived calculations for legacy data.
create or replace view course_scoring_v1 as
with base as (
  select
    p.id as course_id,
    p.id as program_id,
    p.university_id,
    u.name as university,
    p.course_name as course,
    coalesce(c.name, u.city) as city,
    p.ucas_code,
    coalesce(p.study_level, p.level) as level,
    p.name as degree_type,
    p.field as field_of_study,
    coalesce(p.duration, case when p.duration_years is not null then p.duration_years::text || ' years' end) as duration,
    coalesce(u.acceptance_rate_pct, u.acceptance_rate) as acceptance_rate_pct,
    coalesce(u.qs_uk_rank, nullif(regexp_replace((u.metadata->>'qs_uk_rank'), '[^0-9]', '', 'g'), '')::int) as qs_uk_rank,
    coalesce(u.times_sunday_rank, nullif(regexp_replace((u.metadata->>'times_sunday_rank'), '[^0-9]', '', 'g'), '')::int) as times_sunday_rank,
    coalesce(u.guardian_rank, nullif(regexp_replace((u.metadata->>'guardian_rank'), '[^0-9]', '', 'g'), '')::int) as guardian_rank,
    coalesce(
      p.nss_score_pct_override,
      u.nss_score_pct,
      nullif(regexp_replace((p.metadata->>'nss_score_pct'), '[^0-9.]', '', 'g'), '')::numeric,
      nullif(regexp_replace((p.student_satisfaction), '[^0-9.]', '', 'g'), '')::numeric,
      nullif(regexp_replace((u.metadata->>'nss_score_pct'), '[^0-9.]', '', 'g'), '')::numeric
    ) as nss_score_pct,
    p.intake_size,
    p.gender_ratio_pct,
    coalesce(
      p.international_students_ratio_pct_override,
      u.international_students_ratio_pct,
      nullif(regexp_replace((p.metadata->>'international_students_ratio_pct'), '[^0-9.]', '', 'g'), '')::numeric
    ) as international_students_ratio_pct,
    coalesce(
      p.student_to_staff_ratio_override,
      u.student_to_staff_ratio,
      nullif(regexp_replace((p.metadata->>'student_to_staff_ratio'), '[^0-9.]', '', 'g'), '')::numeric
    ) as student_to_staff_ratio,
    coalesce(
      p.yearly_international_tuition_fee_gbp,
      safe_int(nullif(regexp_replace((p.tuition_fees_international), '[^0-9]', '', 'g'), '')),
      safe_int(nullif(regexp_replace((p.tuition)::text, '[^0-9]', '', 'g'), ''))
    ) as yearly_international_tuition_fee_gbp,
    coalesce(
      p.student_dorm_cost_gbp_per_year_override,
      u.student_dorm_cost_gbp_per_year,
      safe_int(nullif(regexp_replace((p.metadata->>'student_dorm_cost_gbp_per_year'), '[^0-9]', '', 'g'), ''))
    ) as student_dorm_cost_gbp_per_year,
    coalesce(
      p.average_rent_outside_campus_gbp_per_month_override,
      u.average_rent_outside_campus_gbp_per_month_override,
      c.average_rent_outside_campus_gbp_per_month,
      safe_int(nullif(regexp_replace((p.metadata->>'average_rent_outside_campus_gbp_per_month'), '[^0-9]', '', 'g'), ''))
    ) as average_rent_outside_campus_gbp_per_month,
    coalesce(p.cost_of_life_override, u.cost_of_life_override, c.cost_of_life) as cost_of_life,
    coalesce(
      p.min_ib_score,
      case
        when nullif(regexp_replace(coalesce(p.min_ib, ''), '[^0-9]', '', 'g'), '')::int between 24 and 45
          then nullif(regexp_replace(coalesce(p.min_ib, ''), '[^0-9]', '', 'g'), '')::int
        else null
      end
    ) as min_ib_score,
    coalesce(
      p.min_a_level_score,
      p.min_alevel,
      (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
    ) as min_a_level_score,
    coalesce(
      p.a_level_min_numeric,
      case
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) like '%A*AA%' then 100
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'A*AB' then 95
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'AAA' then 90
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'AAB' then 80
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'ABB' then 70
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'BBB' then 60
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'BBC' then 50
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\s+', '', 'g')) = 'BCC' then 40
        else null
      end
    ) as a_level_min_numeric,
    p.preferred_subjects,
    p.english_score_requirement,
    coalesce(p.course_online_page, p.provider_course_url, p.url) as course_online_page,
    p.start_date as ucas_deadline,
    coalesce(p.admission_test, p.additional_entry_requirements, p.entry_requirements_overview) as admission_test,
    p.interview,
    coalesce(p.university_life_override, u.university_life) as university_life,
    u.number_of_students,
    u.transport_accessibility,
    u.cultural_social_environment,
    u.city_life,
    u.climate,
    u.safety_index,
    p.study_abroad_option,
    u.graduate_employment_rate_pct,
    coalesce(
      p.average_starting_salary_gbp_override,
      u.average_starting_salary_gbp,
      safe_int(nullif(regexp_replace((p.average_salary_after_15m), '[^0-9]', '', 'g'), ''))
    ) as average_starting_salary_gbp,
    p.top_industries,
    p.placement_year,
    p.placement_year_detail,
    p.language as program_language,
    p.mode as program_mode,
    p.tuition as program_tuition,
    p.currency as program_currency,
    coalesce(p.provider_course_url, p.url) as program_url,
    u.country as university_country,
    u.rank_overall as university_rank_overall,
    u.rank_source as university_rank_source,
    u.requires_test as university_requires_test,
    -- Pre-computed scores from metadata (all_countries_programs import)
    nullif(regexp_replace(coalesce(p.metadata->>'total_course_score', ''), '[^0-9.]', '', 'g'), '')::numeric as meta_total_course_score,
    nullif(regexp_replace(coalesce(p.metadata->>'selectivity_score', ''), '[^0-9.]', '', 'g'), '')::numeric as meta_selectivity_score,
    nullif(regexp_replace(coalesce(p.metadata->>'course_tier', ''), '[^0-9]', '', 'g'), '')::int as meta_course_tier,
    nullif(regexp_replace(coalesce(u.metadata->>'university_score', ''), '[^0-9.]', '', 'g'), '')::numeric as meta_university_score
  from programs p
  join universities u on u.id = p.university_id
  left join cities c on c.id = u.city_id
),
ranked as (
  select
    *,
    case
      when qs_uk_rank is null then null
      when qs_uk_rank <= 5 then 100
      when qs_uk_rank <= 10 then 95
      when qs_uk_rank <= 20 then 85
      when qs_uk_rank <= 30 then 75
      when qs_uk_rank <= 40 then 65
      when qs_uk_rank <= 60 then 55
      when qs_uk_rank <= 80 then 45
      when qs_uk_rank <= 100 then 35
      else 25
    end as qs_band,
    case
      when times_sunday_rank is null then null
      when times_sunday_rank <= 5 then 100
      when times_sunday_rank <= 10 then 95
      when times_sunday_rank <= 20 then 85
      when times_sunday_rank <= 30 then 75
      when times_sunday_rank <= 40 then 65
      when times_sunday_rank <= 60 then 55
      when times_sunday_rank <= 80 then 45
      when times_sunday_rank <= 100 then 35
      else 25
    end as times_band,
    case
      when guardian_rank is null then null
      when guardian_rank <= 5 then 100
      when guardian_rank <= 10 then 95
      when guardian_rank <= 20 then 85
      when guardian_rank <= 30 then 75
      when guardian_rank <= 40 then 65
      when guardian_rank <= 60 then 55
      when guardian_rank <= 80 then 45
      when guardian_rank <= 100 then 35
      else 25
    end as guardian_band
  from base
),
scores as (
  select
    *,
    -- University score: prefer metadata, then derive from rankings, else 30
    coalesce(
      meta_university_score,
      case
        when qs_band is null and times_band is null and guardian_band is null then 30
        else round(
          (coalesce(qs_band, 0) + coalesce(times_band, 0) + coalesce(guardian_band, 0))::numeric /
          nullif(
            (case when qs_band is not null then 1 else 0 end) +
            (case when times_band is not null then 1 else 0 end) +
            (case when guardian_band is not null then 1 else 0 end),
            0
          )
        )
      end
    ) as university_score,
    case
      when min_ib_score is null then 40
      when min_ib_score >= 40 then 100
      when min_ib_score >= 38 then 90
      when min_ib_score >= 36 then 80
      when min_ib_score >= 34 then 70
      when min_ib_score >= 32 then 60
      when min_ib_score >= 30 then 50
      when min_ib_score >= 28 then 40
      else 30
    end as ib_score,
    case
      when min_a_level_score is null then 40
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) like '%A*AA%' then 100
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'A*AB' then 95
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'AAA' then 90
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'AAB' then 80
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'ABB' then 70
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'BBB' then 60
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'BBC' then 50
      when upper(regexp_replace(min_a_level_score, '\s+', '', 'g')) = 'BCC' then 40
      else 30
    end as alevel_score
  from ranked
)
select
  course_id,
  program_id,
  university_id,
  university,
  course,
  city,
  ucas_code,
  level,
  degree_type,
  field_of_study,
  duration,
  acceptance_rate_pct,
  nss_score_pct,
  intake_size,
  gender_ratio_pct,
  international_students_ratio_pct,
  student_to_staff_ratio,
  yearly_international_tuition_fee_gbp,
  student_dorm_cost_gbp_per_year,
  average_rent_outside_campus_gbp_per_month,
  cost_of_life,
  min_ib_score,
  min_a_level_score,
  a_level_min_numeric,
  preferred_subjects,
  english_score_requirement,
  course_online_page,
  ucas_deadline,
  admission_test,
  interview,
  university_life,
  number_of_students,
  transport_accessibility,
  cultural_social_environment,
  city_life,
  climate,
  safety_index,
  study_abroad_option,
  graduate_employment_rate_pct,
  average_starting_salary_gbp,
  top_industries,
  placement_year,
  placement_year_detail,
  program_language,
  program_mode,
  program_tuition,
  program_currency,
  program_url,
  university_country,
  university_rank_overall,
  university_rank_source,
  university_requires_test,
  university_score,
  -- Course selectivity: prefer metadata, then derive from IB/A-level
  coalesce(
    meta_selectivity_score,
    case
      when min_ib_score is not null and min_a_level_score is not null then round((ib_score + alevel_score) / 2.0)
      when min_ib_score is not null then ib_score
      when min_a_level_score is not null then alevel_score
      else 40
    end
  ) as course_selectivity_score,
  -- Total course score: prefer metadata, then derive
  coalesce(
    meta_total_course_score,
    round(university_score * 0.6 + (
      case
        when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
        when min_ib_score is not null then ib_score
        when min_a_level_score is not null then alevel_score
        else 40
      end
    ) * 0.4)
  ) as total_course_score,
  -- Course tier: prefer metadata, then derive
  coalesce(
    meta_course_tier,
    case
      when coalesce(
        meta_total_course_score,
        round(university_score * 0.6 + (
          case
            when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
            when min_ib_score is not null then ib_score
            when min_a_level_score is not null then alevel_score
            else 40
          end
        ) * 0.4)
      ) >= 85 then 1
      when coalesce(
        meta_total_course_score,
        round(university_score * 0.6 + (
          case
            when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
            when min_ib_score is not null then ib_score
            when min_a_level_score is not null then alevel_score
            else 40
          end
        ) * 0.4)
      ) >= 75 then 2
      when coalesce(
        meta_total_course_score,
        round(university_score * 0.6 + (
          case
            when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
            when min_ib_score is not null then ib_score
            when min_a_level_score is not null then alevel_score
            else 40
          end
        ) * 0.4)
      ) >= 65 then 3
      when coalesce(
        meta_total_course_score,
        round(university_score * 0.6 + (
          case
            when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
            when min_ib_score is not null then ib_score
            when min_a_level_score is not null then alevel_score
            else 40
          end
        ) * 0.4)
      ) >= 50 then 4
      else 5
    end
  ) as course_tier
from scores;

grant select on course_scoring_v1 to anon, authenticated;

-- Application tasks master data
create table if not exists application_tasks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  description text,
  due_offset_days int,
  category application_task_category not null
);

-- Student matches
create table if not exists student_matches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  score numeric,
  breakdown jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- Applications
-- platform/decision columns from 20260628120000_counsellor_real_data.sql:
-- `decision` is the admissions result (null = pending); `platform` is the
-- submission portal. `country` is intentionally NOT stored — the adapter
-- derives it from programs → universities.country.
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  status application_status not null default 'planning',
  portal_url text,
  notes text,
  platform text,
  decision text,
  decision_at timestamptz,
  decision_conditions text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint applications_decision_check
    check (decision is null or decision in ('accepted', 'rejected', 'waitlisted', 'withdrawn'))
);

-- Checklist items
create table if not exists application_checklist (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  task_name text not null,
  due_date date,
  status checklist_status not null default 'todo'
);

-- Documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  name text not null,
  type text,
  storage_path text not null,
  uploaded_at timestamptz not null default timezone('utc', now())
);

-- Shortlisted programs
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

-- Indexes
create index if not exists idx_cities_name on cities(name);
create index if not exists idx_cities_cost_of_life on cities(cost_of_life);
create index if not exists idx_cities_rent on cities(average_rent_outside_campus_gbp_per_month);
create index if not exists idx_universities_name on universities(name);
create index if not exists idx_universities_city_id on universities(city_id);
create index if not exists idx_universities_ranks on universities(qs_uk_rank, times_sunday_rank, guardian_rank);
create index if not exists idx_universities_nss on universities(nss_score_pct);
create index if not exists idx_universities_student_staff on universities(student_to_staff_ratio);
create index if not exists idx_programs_university_id on programs(university_id);
create index if not exists idx_programs_course_name on programs(course_name);
create index if not exists idx_programs_level on programs(level);
create index if not exists idx_programs_degree_type on programs(name);
-- idx_programs_field_of_study is the final-state name from
-- 20250308120000_normalize_course_catalog.sql (previously idx_programs_field).
create index if not exists idx_programs_field_of_study on programs(field);
-- Composite (field, id) index from 20260713120000_programs_field_id_idx.sql:
-- lets the matching catalogue pager stream pre-sorted index ranges instead of
-- bitmap-scanning + re-sorting every page (was exceeding the 8s statement
-- timeout).
create index if not exists idx_programs_field_id on programs (field, id);
create index if not exists idx_programs_min_ib_score on programs(min_ib_score);
create index if not exists idx_programs_min_a_level_numeric on programs(a_level_min_numeric);
create index if not exists idx_programs_nss_override on programs(nss_score_pct_override);
create index if not exists idx_programs_intake_size on programs(intake_size);
create index if not exists idx_programs_gender_ratio on programs(gender_ratio_pct);
create index if not exists idx_programs_student_staff_override on programs(student_to_staff_ratio_override);
create index if not exists idx_programs_tuition on programs(yearly_international_tuition_fee_gbp);
create index if not exists idx_programs_average_salary_override on programs(average_starting_salary_gbp_override);
create index if not exists idx_programs_university_life_override on programs(university_life_override);
-- Search-facet indexes from 20260723120000_search_facet_indexes.sql: study_level/
-- mode make search_filter_options()'s SELECT DISTINCT index-backed (it was timing
-- out in prod); country/rank_overall/recognition_score back the unified search
-- page's university-side facet lookups.
create index if not exists idx_programs_study_level on programs (study_level);
create index if not exists idx_programs_mode on programs (mode);
create index if not exists idx_universities_country on universities (country);
create index if not exists idx_universities_rank_overall on universities (rank_overall);
create index if not exists idx_universities_recognition_score on universities (recognition_score);
create index if not exists idx_deadlines_date on deadlines(deadline_date);
create index if not exists idx_student_matches_profile_score on student_matches(profile_id, score desc);
create index if not exists idx_applications_profile on applications(profile_id);
create index if not exists idx_documents_application on documents(application_id);
create index if not exists idx_shortlisted_profile on shortlisted_programs(profile_id);
create index if not exists student_subjects_profile_id_idx on student_subjects(profile_id);
create index if not exists student_admissions_tests_profile_id_idx on student_admissions_tests(profile_id);

-- Row Level Security
alter table profiles enable row level security;
alter table student_personal_information enable row level security;
alter table student_academic_input enable row level security;
alter table student_subjects enable row level security;
alter table student_admissions_tests enable row level security;
alter table student_lifestyle_preference enable row level security;
-- Both added 2026-08-01. Creating a table WITHOUT enabling RLS leaves it
-- readable and writable by every authenticated session via PostgREST, so the
-- `enable` and the `create table` must never be separated.
alter table student_activities enable row level security;
alter table simulation_results enable row level security;
alter table student_scores enable row level security;
alter table universities enable row level security;
alter table programs enable row level security;
alter table program_requirements enable row level security;
alter table deadlines enable row level security;
alter table application_tasks enable row level security;
alter table student_matches enable row level security;
alter table applications enable row level security;
alter table application_checklist enable row level security;
alter table documents enable row level security;
alter table sources enable row level security;
alter table shortlisted_programs enable row level security;

-- Helper function for role.
--
-- INVARIANT (from 20260713130000_fix_auth_role_recursion.sql): any helper
-- function referenced by profiles RLS policies must be SECURITY DEFINER.
-- An invoker-rights `select ... from profiles` inside a policy re-enters
-- profiles RLS, which re-evaluates the function, which re-enters profiles
-- RLS… → Postgres error 54001 "stack depth limit exceeded". SECURITY DEFINER
-- makes the inner profiles read run as the function owner, bypassing profiles
-- RLS and breaking the cycle (same treatment is_counsellor() got in
-- 20260611130000_tighten_help_rls.sql).
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from profiles where id = auth.uid()),
    'student'
  );
$$;

grant execute on function public.auth_role() to authenticated;

-- NOTE on the admin policies below: per
-- 20260713140000_initplan_admin_policies.sql, every `auth_role() = 'admin'`
-- qual is written `(select auth_role()) = 'admin'` so it is evaluated ONCE per
-- statement (InitPlan) instead of per row — a bare call meant ~30k+ profiles
-- lookups on catalogue-sized scans.

-- Profiles policies.
--
-- Backported from 20260801110000_profiles_insert_guard.sql. This file previously
-- declared `profiles_self_access` with NO `for` clause — which PostgreSQL reads
-- as FOR ALL, i.e. SELECT + INSERT + UPDATE + DELETE — while the role-guard
-- trigger below was registered `before update` ONLY. So from the browser console
-- of any signed-in account, with the anon key that ships in the bundle:
--
--     delete from profiles where id = auth.uid();          -- FOR ALL covers DELETE
--     insert into profiles (id, role) values (auth.uid(), 'admin');  -- no trigger
--
-- auth_role() then returns 'admin', satisfying all 20 admin policies — every one
-- of which is FOR ALL. The trigger's author reasoned about exactly this attack
-- and closed the UPDATE path; FOR ALL quietly granted two more verbs than the
-- trigger covered.
--
-- The fix was written as a migration and NOT backported here for a day, which
-- meant a database built from this file still shipped the escalation. Verbs are
-- split explicitly below, and there is deliberately NO self-DELETE policy:
-- deleting a profile cascades ~20 tables of student PII with no soft delete and
-- no recovery. That is an account closure, not a row write.
drop policy if exists profiles_self_access on profiles;
drop policy if exists profiles_self_select on profiles;
drop policy if exists profiles_self_update on profiles;
drop policy if exists profiles_self_insert on profiles;
drop policy if exists profiles_admin_view on profiles;

create policy profiles_self_select on profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Self-heal path: a user may create their OWN profile row, as a student only.
create policy profiles_self_insert on profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'student');

create policy profiles_admin_view on profiles
  for select using ((select auth_role()) = 'admin');

-- Student personal policies
drop policy if exists personal_self on student_personal_information;
drop policy if exists personal_admin on student_personal_information;
create policy personal_self on student_personal_information
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy personal_admin on student_personal_information
  using ((select auth_role()) = 'admin');

-- Student academic input policies
drop policy if exists academic_input_self on student_academic_input;
drop policy if exists academic_input_admin on student_academic_input;
create policy academic_input_self on student_academic_input
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy academic_input_admin on student_academic_input
  using ((select auth_role()) = 'admin');

-- Student subjects policies
drop policy if exists subjects_self on student_subjects;
drop policy if exists subjects_admin on student_subjects;
create policy subjects_self on student_subjects
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy subjects_admin on student_subjects
  using ((select auth_role()) = 'admin');

-- Admissions tests policies
drop policy if exists admissions_self on student_admissions_tests;
drop policy if exists admissions_admin on student_admissions_tests;
create policy admissions_self on student_admissions_tests
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy admissions_admin on student_admissions_tests
  using ((select auth_role()) = 'admin');

-- Lifestyle preferences policies
-- student_activities owner policy. The counsellor-read and admin policies for
-- these two tables live further down, WITH the other function-dependent policies
-- — they call can_act_as_counsellor()/is_admin(), which are not defined until
-- later in this file, and a policy cannot reference a function that does not yet
-- exist. Mirrors 20260801130000_reconcile_missing_tables.sql.
drop policy if exists student_activities_self on student_activities;
create policy student_activities_self on student_activities
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists lifestyle_self on student_lifestyle_preference;
drop policy if exists lifestyle_admin on student_lifestyle_preference;
create policy lifestyle_self on student_lifestyle_preference
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy lifestyle_admin on student_lifestyle_preference
  using ((select auth_role()) = 'admin');

-- Student scores policies
drop policy if exists scores_self on student_scores;
drop policy if exists scores_admin on student_scores;
create policy scores_self on student_scores
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy scores_admin on student_scores
  using ((select auth_role()) = 'admin');

-- Catalog policies
--
-- cities: transcribed from 20260719120000_catalog_rls.sql. Without it this file
-- leaves `cities` as the ONE table in the database with RLS off, and a table
-- without RLS is readable *and writable* by the anon key that ships in the
-- browser bundle (MIGRATIONS.md §6 rule 6 — that rule exists because of this
-- exact table). The migration closed it on the remote; this file reopened it on
-- every database built from schema.sql alone. See C-database.md finding C6.
alter table cities enable row level security;
drop policy if exists cities_read_all on cities;
drop policy if exists cities_admin on cities;
create policy cities_read_all on cities for select to public using (true);
create policy cities_admin on cities for all to public
  using ((select auth_role()) = 'admin')
  with check ((select auth_role()) = 'admin');

drop policy if exists universities_read_all on universities;
drop policy if exists universities_admin on universities;
create policy universities_read_all on universities for select using (auth.uid() is not null);
create policy universities_admin on universities using ((select auth_role()) = 'admin');

drop policy if exists programs_read_all on programs;
drop policy if exists programs_admin on programs;
create policy programs_read_all on programs for select using (auth.uid() is not null);
create policy programs_admin on programs using ((select auth_role()) = 'admin');

drop policy if exists requirements_read_all on program_requirements;
drop policy if exists requirements_admin on program_requirements;
create policy requirements_read_all on program_requirements for select using (auth.uid() is not null);
create policy requirements_admin on program_requirements using ((select auth_role()) = 'admin');

drop policy if exists deadlines_read_all on deadlines;
drop policy if exists deadlines_admin on deadlines;
create policy deadlines_read_all on deadlines for select using (auth.uid() is not null);
create policy deadlines_admin on deadlines using ((select auth_role()) = 'admin');

drop policy if exists application_tasks_read_all on application_tasks;
drop policy if exists application_tasks_admin on application_tasks;
create policy application_tasks_read_all on application_tasks for select using (auth.uid() is not null);
create policy application_tasks_admin on application_tasks using ((select auth_role()) = 'admin');

drop policy if exists sources_read_all on sources;
drop policy if exists sources_admin on sources;
create policy sources_read_all on sources for select using (auth.uid() is not null);
create policy sources_admin on sources using ((select auth_role()) = 'admin');

-- Matches policies
drop policy if exists matches_self on student_matches;
drop policy if exists matches_self_write on student_matches;
drop policy if exists matches_self_update on student_matches;
drop policy if exists matches_admin on student_matches;
create policy matches_self on student_matches
  for select using (auth.uid() = profile_id);
create policy matches_self_write on student_matches
  for insert with check (auth.uid() = profile_id);
create policy matches_self_update on student_matches
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy matches_admin on student_matches using ((select auth_role()) = 'admin');

-- Shortlist policies
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

-- Applications policies
drop policy if exists applications_self on applications;
drop policy if exists applications_admin on applications;
create policy applications_self on applications
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy applications_admin on applications using ((select auth_role()) = 'admin');

drop policy if exists checklist_self on application_checklist;
drop policy if exists checklist_admin on application_checklist;
create policy checklist_self on application_checklist
  using (
    exists (
      select 1
      from applications a
      where a.id = application_checklist.application_id
        and a.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from applications a
      where a.id = application_checklist.application_id
        and a.profile_id = auth.uid()
    )
  );
create policy checklist_admin on application_checklist using ((select auth_role()) = 'admin');

drop policy if exists documents_self on documents;
drop policy if exists documents_admin on documents;
create policy documents_self on documents
  using (
    exists (
      select 1
      from applications a
      where a.id = documents.application_id
        and a.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from applications a
      where a.id = documents.application_id
        and a.profile_id = auth.uid()
    )
  );
create policy documents_admin on documents using ((select auth_role()) = 'admin');

-- Storage bucket and policies for application documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  20971520, -- 20 MB
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists application_documents_read on storage.objects;
drop policy if exists application_documents_insert on storage.objects;
drop policy if exists application_documents_update on storage.objects;
drop policy if exists application_documents_delete on storage.objects;
drop policy if exists application_documents_admin on storage.objects;

create policy application_documents_read on storage.objects
  for select using (
    bucket_id = 'application-documents'
    and (
      (
        split_part(name, '/', 1) = 'applications'
        and exists (
          select 1 from applications a
          where a.id::text = split_part(name, '/', 2)
            and a.profile_id = auth.uid()
        )
      )
      or (
        split_part(name, '/', 1) = 'unassigned'
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

create policy application_documents_insert on storage.objects
  for insert with check (
    bucket_id = 'application-documents'
    and (
      (
        split_part(name, '/', 1) = 'applications'
        and exists (
          select 1 from applications a
          where a.id::text = split_part(name, '/', 2)
            and a.profile_id = auth.uid()
        )
      )
      or (
        split_part(name, '/', 1) = 'unassigned'
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

create policy application_documents_update on storage.objects
  for update using (
    bucket_id = 'application-documents'
    and (
      (
        split_part(name, '/', 1) = 'applications'
        and exists (
          select 1 from applications a
          where a.id::text = split_part(name, '/', 2)
            and a.profile_id = auth.uid()
        )
      )
      or (
        split_part(name, '/', 1) = 'unassigned'
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  ) with check (
    bucket_id = 'application-documents'
    and (
      (
        split_part(name, '/', 1) = 'applications'
        and exists (
          select 1 from applications a
          where a.id::text = split_part(name, '/', 2)
            and a.profile_id = auth.uid()
        )
      )
      or (
        split_part(name, '/', 1) = 'unassigned'
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

create policy application_documents_delete on storage.objects
  for delete using (
    bucket_id = 'application-documents'
    and (
      (
        split_part(name, '/', 1) = 'applications'
        and exists (
          select 1 from applications a
          where a.id::text = split_part(name, '/', 2)
            and a.profile_id = auth.uid()
        )
      )
      or (
        split_part(name, '/', 1) = 'unassigned'
        and split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

create policy application_documents_admin on storage.objects
  using (
    bucket_id = 'application-documents'
    and public.auth_role() = 'admin'
  );

-- =============================================================================
-- Counsellor & help system
-- Final state of migrations 20260512120000 … 20260713150000.
-- =============================================================================

-- ── Counsellor helper functions ───────────────────────────────────────────────
-- From 20260611130000_tighten_help_rls.sql / 20260628120000_counsellor_real_data.sql.
--
-- INVARIANT: is_counsellor() must be SECURITY DEFINER — an invoker-rights
-- select from profiles inside a policy is the classic Supabase RLS recursion
-- trap (same treatment auth_role() got above).
create or replace function public.is_counsellor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('counsellor', 'admin')
  );
$$;

create or replace function public.is_demo_account()
returns boolean
language sql
stable
as $$
  select coalesce(lower(coalesce(auth.jwt() ->> 'email', '')) = 'greg@workiflow.com', false);
$$;

-- OPEN ACCESS (final form, from 20260712130000_open_counsellor_access.sql):
-- the counsellor surface is open to EVERY signed-in user. Every RLS policy on
-- the help/counsellor tables routes through this one function, so redefining
-- it opens/closes the whole counsellor surface at once.
--
-- To re-restrict later, restore the body to:
--   select public.is_counsellor() or public.is_demo_account();
-- (both functions are left in place, unchanged).
create or replace function public.can_act_as_counsellor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

-- From 20260801120000. is_counsellor() spans 'counsellor' AND 'admin', so it
-- cannot express "admin only" — which the destructive-verb policies need.
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

grant execute on function public.is_counsellor() to authenticated;
grant execute on function public.is_demo_account() to authenticated;
grant execute on function public.can_act_as_counsellor() to authenticated;

-- ── profiles.role escalation guard ────────────────────────────────────────────
-- From 20260702120000_p0_role_guard_notification_routing.sql: profiles_self_access
-- covers UPDATE with no column restriction, so without this trigger any student
-- could set their own role='admin' from the browser console. Server-side
-- contexts (service_role key, seed scripts, SQL editor) carry no auth.uid()
-- and stay trusted.
--
-- The INSERT arm is from 20260801110000_profiles_insert_guard.sql and MUST stay
-- in step with the trigger registration below. On INSERT `old` is NULL, so
-- `new.role is distinct from old.role` is TRUE for every insert including the
-- legitimate `role='student'` one — a body without the tg_op branch, paired with
-- a `before insert or update` trigger, breaks signup on any database built from
-- this file alone. That exact half-backport shipped once; see
-- docs/audit/verify/C-database.md finding C2.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and new.role is distinct from 'student'
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'new profiles must be created with role=student';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    if auth.uid() is not null
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'changing profiles.role requires an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  -- INSERT as well as UPDATE. Registered `before update` only, this guard was
  -- walked around by delete-then-insert (see the profiles policy note above).
  before insert or update on profiles
  for each row
  execute function public.guard_profile_role_change();

-- ── Counsellor read access on the per-owner student tables ───────────────────
-- From 20260628120000_counsellor_real_data.sql. Additive (permissive →
-- OR-combined with the owner-only policies). deadlines / programs /
-- universities / application_tasks are already authenticated-readable, so they
-- are intentionally omitted.

drop policy if exists profiles_counsellor_read on profiles;
create policy profiles_counsellor_read on profiles
  for select to authenticated using (public.can_act_as_counsellor());

drop policy if exists student_activities_counsellor_read on student_activities;
create policy student_activities_counsellor_read on student_activities
  for select to authenticated
  using (public.can_act_as_counsellor());

drop policy if exists simulation_results_admin on simulation_results;
create policy simulation_results_admin on simulation_results
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

-- ── Help requests + notifications tables ─────────────────────────────────────
-- From 20260512120000 / 20260513120000, with columns added by later migrations
-- folded in: help_requests.initiated_by (20260517120000),
-- notifications.audience (20260514130000),
-- help_meetings.status_changed_by (20260702120000),
-- help_requests.counsellor_profile_id + *_last_read_at (20260713170000).

create table if not exists help_requests (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references profiles(id) on delete cascade,
  application_id text,
  university text,
  program text,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'resolved')),
  -- 'student' (default) or 'counsellor' — drives notification copy + which
  -- side opens the thread drawer first.
  initiated_by text not null default 'student'
    check (initiated_by in ('student', 'counsellor')),
  -- The counsellor who owns this conversation. Nullable: set when a counsellor
  -- claims a student-raised request (on accept) or opens a counsellor-initiated
  -- thread. Folded in: 20260713170000.
  counsellor_profile_id uuid references profiles(id) on delete set null,
  -- Per-side last-read timestamps drive inbox unread badges + "Seen" receipts
  -- (20260713170000).
  student_last_read_at timestamptz,
  counsellor_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  resolved_at timestamptz
);

create index if not exists help_requests_status_created_idx
  on help_requests (status, created_at desc);
create index if not exists help_requests_student_idx
  on help_requests (student_profile_id, created_at desc);
create index if not exists help_requests_counsellor_idx
  on help_requests (counsellor_profile_id, created_at desc);
-- Newest-first inbox scan: loadCounsellorInbox does an unfiltered
-- `order by created_at desc limit 100` (20260714110000).
create index if not exists help_requests_created_idx
  on help_requests (created_at desc);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  -- Audience tag (student | counsellor) so one auth user (the demo) can hold
  -- two distinct inboxes — the bell/drawer hooks filter by side.
  audience text not null default 'student'
    check (audience in ('student', 'counsellor')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_inbox_idx
  on notifications (profile_id, read_at, created_at desc);
create index if not exists notifications_audience_inbox_idx
  on notifications (profile_id, audience, read_at, created_at desc);

create table if not exists help_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references help_requests(id) on delete cascade,
  author_profile_id uuid not null references profiles(id) on delete cascade,
  author_role text not null check (author_role in ('student', 'counsellor')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists help_messages_request_idx
  on help_messages (request_id, created_at);

create table if not exists help_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references help_requests(id) on delete cascade,
  author_profile_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists help_notes_request_idx
  on help_notes (request_id, created_at desc);

create table if not exists help_meetings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references help_requests(id) on delete cascade,
  counsellor_profile_id uuid not null references profiles(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  scheduled_for timestamptz not null,
  duration_minutes int not null default 30,
  location text,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'cancelled', 'completed')),
  -- Which side changed the status; auth.uid() cannot distinguish the two sides
  -- of the single-account demo.
  status_changed_by text
    check (status_changed_by in ('student', 'counsellor')),
  created_at timestamptz not null default now()
);

create index if not exists help_meetings_request_idx
  on help_meetings (request_id, scheduled_for);
create index if not exists help_meetings_student_upcoming_idx
  on help_meetings (student_profile_id, scheduled_for);

alter table help_requests enable row level security;
alter table notifications enable row level security;
alter table help_messages enable row level security;
alter table help_notes enable row level security;
alter table help_meetings enable row level security;

-- Realtime: surface inserts/updates on the help/notification tables
-- (idempotent form of the `alter publication supabase_realtime add table …`
-- statements in 20260512120000 / 20260513120000).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['help_requests', 'notifications', 'help_messages', 'help_notes', 'help_meetings']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ── Help / notification RLS (final participant-scoped form) ───────────────────
-- From 20260611130000_tighten_help_rls.sql, which replaced the demo-permissive
-- `using (true)` policies of 20260512120000 / 20260513120000.
--
-- Access model:
--   • Students see and write only their own help requests, the messages and
--     meetings on those requests, and their own notifications.
--   • Counsellor-capable users (see can_act_as_counsellor() above) see all
--     requests, can reply, write private notes, propose meetings, and notify
--     students.

drop policy if exists help_requests_demo_all on help_requests;

drop policy if exists help_requests_select on help_requests;
create policy help_requests_select on help_requests
  for select to authenticated
  using (
    student_profile_id = auth.uid()
    or counsellor_profile_id = auth.uid()
    or public.can_act_as_counsellor()
  );

drop policy if exists help_requests_insert on help_requests;
create policy help_requests_insert on help_requests
  for insert to authenticated
  -- Students file requests as themselves; counsellors may open
  -- counsellor-initiated threads on behalf of a student.
  with check (student_profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists help_requests_update on help_requests;
-- Row access only — column scope (a plain student may touch nothing but
-- student_last_read_at) is enforced by trg_guard_help_request_update below.
create policy help_requests_update on help_requests
  for update to authenticated
  using (
    student_profile_id = auth.uid()
    or counsellor_profile_id = auth.uid()
    or public.can_act_as_counsellor()
  )
  with check (
    student_profile_id = auth.uid()
    or counsellor_profile_id = auth.uid()
    or public.can_act_as_counsellor()
  );

drop policy if exists help_messages_demo_all on help_messages;

drop policy if exists help_messages_select on help_messages;
create policy help_messages_select on help_messages
  for select to authenticated
  using (
    public.can_act_as_counsellor()
    or exists (
      select 1 from help_requests hr
      where hr.id = help_messages.request_id and hr.student_profile_id = auth.uid()
    )
  );

drop policy if exists help_messages_insert on help_messages;
create policy help_messages_insert on help_messages
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    -- Only counsellor-capable users may speak as 'counsellor'.
    and (author_role = 'student' or public.can_act_as_counsellor())
    and (
      public.can_act_as_counsellor()
      or exists (
        select 1 from help_requests hr
        where hr.id = help_messages.request_id and hr.student_profile_id = auth.uid()
      )
    )
  );

-- help_notes are counsellor-private.
drop policy if exists help_notes_demo_all on help_notes;

drop policy if exists help_notes_select on help_notes;
create policy help_notes_select on help_notes
  for select to authenticated
  using (public.can_act_as_counsellor());

drop policy if exists help_notes_insert on help_notes;
create policy help_notes_insert on help_notes
  for insert to authenticated
  with check (public.can_act_as_counsellor() and author_profile_id = auth.uid());

drop policy if exists help_meetings_demo_all on help_meetings;

drop policy if exists help_meetings_select on help_meetings;
create policy help_meetings_select on help_meetings
  for select to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists help_meetings_insert on help_meetings;
create policy help_meetings_insert on help_meetings
  for insert to authenticated
  with check (public.can_act_as_counsellor() and counsellor_profile_id = auth.uid());

drop policy if exists help_meetings_update on help_meetings;
create policy help_meetings_update on help_meetings
  for update to authenticated
  using (student_profile_id = auth.uid() or public.can_act_as_counsellor())
  with check (student_profile_id = auth.uid() or public.can_act_as_counsellor());

drop policy if exists notifications_demo_all on notifications;

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert to authenticated
  -- Users may notify themselves. The counsellor-capable branch (open to all
  -- signed-in users under the demo posture) is restricted to the one
  -- client-authored cross-user kind ('doc_nudge'), root-relative hrefs, the
  -- app's actual title template, and bounded lengths (20260715120000 +
  -- 20260718130000), so it cannot carry arbitrary text into other feeds. All
  -- other cross-user notifications flow through SECURITY DEFINER triggers,
  -- which this policy does not constrain.
  with check (
    profile_id = auth.uid()
    or (
      public.can_act_as_counsellor()
      and kind = 'doc_nudge'
      and (href is null or (href like '/%' and href not like '//%'))
      and title like 'Your counsellor is %'
      and char_length(title) <= 160
      and (body is null or char_length(body) <= 300)
    )
  );

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications
  for delete to authenticated
  using (profile_id = auth.uid());

-- ── Counsellor workspace tables ───────────────────────────────────────────────
-- From 20260628120000_counsellor_real_data.sql: per-student counsellor notes,
-- parent communications, and a document tracker (distinct from the
-- storage-backed `documents` table).

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

-- From 20260716120000_guardian_links.sql — parent portal linkage primitive.
-- The /parent section scopes every query through this table (a parent only
-- ever sees their linked children). Select-only RLS: links are written by
-- migration/service role, never by browser sessions. The demo seed (greg →
-- one +seed@ascenda.demo student) lives in the migration, not here.
create table if not exists guardian_links (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references profiles(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  relationship text not null default 'Guardian', -- Mother | Father | Guardian
  status text not null default 'active' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (parent_profile_id, student_profile_id)
);
create index if not exists guardian_links_parent_idx
  on guardian_links (parent_profile_id, status);

alter table guardian_links enable row level security;

drop policy if exists guardian_links_self on guardian_links;
create policy guardian_links_self on guardian_links
  for select to authenticated
  using (parent_profile_id = auth.uid());

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

-- ── help_requests write guard: INSERT + UPDATE (20260713170000 →
--    20260714100000) ────────────────────────────────────────────────────────
-- RLS with-check validates row ownership only, not which columns a write
-- touches, so the guard trigger enforces column scope on both paths:
--   • INSERT — a plain student may only file a fresh, unclaimed,
--     student-initiated request (no pre-pinned counsellor, no forged
--     acceptance/resolution or read receipts). Otherwise they could fix
--     reply-notification routing to an arbitrary counsellor.
--   • UPDATE — a plain student may only stamp student_last_read_at. Enforced by
--     a whitelist (copy that one field onto a snapshot of OLD, reject any other
--     drift) so every current and future column is frozen automatically.
--   • The owning counsellor (counsellor_profile_id = auth.uid()) is a trusted
--     participant even if their counsellor capability was later revoked —
--     matching the RLS policy that still grants them row access.
--   • Claim-on-accept: accepting an unclaimed thread sets counsellor_profile_id
--     to the actor and stamps accepted_at, regardless of caller path, so
--     acceptance always implies ownership.
-- Mostly a no-op under the open demo posture (everyone is counsellor-capable);
-- protective once can_act_as_counsellor() is re-restricted.

create or replace function public.guard_help_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r help_requests%rowtype;
begin
  if tg_op = 'INSERT' then
    -- Server-side contexts (service_role / direct SQL: no auth.uid()) and
    -- counsellor-capable users are trusted to set any column.
    if auth.uid() is null or public.can_act_as_counsellor() then
      return new;
    end if;
    -- A plain student may only file a fresh, unclaimed, student-initiated
    -- request. status/initiated_by carry their NOT NULL defaults ('open' /
    -- 'student') applied before this trigger fires.
    if new.counsellor_profile_id   is not null
       or new.counsellor_last_read_at is not null
       or new.accepted_at is not null
       or new.resolved_at is not null
       or coalesce(new.status, 'open')          is distinct from 'open'
       or coalesce(new.initiated_by, 'student') is distinct from 'student'
    then
      raise exception 'students may only file a fresh, unclaimed help request';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE' below.

  -- Claim-on-accept: accepting an unclaimed thread implies ownership, whatever
  -- the caller path. Runs before the trust returns so a counsellor-capable
  -- updater that only flips status still becomes the owner.
  if new.status = 'accepted'
     and old.counsellor_profile_id is null
     and new.counsellor_profile_id is null
     and auth.uid() is not null
     and public.can_act_as_counsellor()
  then
    new.counsellor_profile_id := auth.uid();
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;

  -- Server-side contexts and counsellor-capable users are trusted.
  if auth.uid() is null or public.can_act_as_counsellor() then
    return new;
  end if;
  -- The owning counsellor is a trusted participant on this row (see comment
  -- block above): let them act on the row they own even if their counsellor
  -- capability was later revoked.
  if old.counsellor_profile_id = auth.uid() then
    return new;
  end if;
  -- A plain student may only stamp their own read receipt (whitelist).
  r := old;
  r.student_last_read_at := new.student_last_read_at;
  if new is distinct from r then
    raise exception 'students may only update their own read receipt on a help request';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_help_request_update on help_requests;
create trigger trg_guard_help_request_update
  before insert or update on help_requests
  for each row
  execute function public.guard_help_request_update();

-- ── Notification routing (SECURITY DEFINER triggers) ─────────────────────────
-- Final forms: helpers + help_requests/help_messages triggers from
-- 20260702120000_p0_role_guard_notification_routing.sql (message routing
-- updated by 20260713170000: claimed threads notify the owning counsellor
-- only); the two meeting triggers from
-- 20260712120000_meeting_notification_local_time.sql (render the meeting time
-- in the student's stored IANA timezone instead of UTC).
-- Counsellor notifications fire HERE, via DB trigger, not application code.

-- Every profile that should receive counsellor-audience notifications:
-- real counsellor/admin accounts, plus the single-account demo profile
-- (greg@workiflow.com), which holds the counsellor inbox for demo sessions.
create or replace function public.counsellor_notification_targets()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where role in ('counsellor', 'admin')
  union
  select u.id from auth.users u where lower(u.email) = 'greg@workiflow.com';
$$;

create or replace function public.profile_display_name(p_profile_id uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(full_name), ''), p_fallback) from profiles where id = p_profile_id;
$$;

-- help_requests insert → notify the right side, with real names.
create or replace function notify_on_help_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
begin
  if new.initiated_by = 'counsellor' then
    -- Counsellor reached out first: notify the student.
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'counsellor_message',
      'Message from your counsellor',
      coalesce(new.subject, new.body),
      '/inbox?help=' || new.id::text,
      'student'
    );
  else
    -- Student raised a help request: fan out to the counsellor side.
    student_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_request',
      'New help request from ' || student_name,
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/counsellor/inbox?help=' || new.id::text,
      'counsellor'
    from public.counsellor_notification_targets() as target;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_request_notify on help_requests;
create trigger trg_help_request_notify
  after insert on help_requests
  for each row
  execute function notify_on_help_request_insert();

-- help_requests status → accepted: notify the student (20260715120000).
-- Skips self-notify when the acting user IS the student (single-account demo).
create or replace function notify_on_help_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.student_profile_id is distinct from auth.uid() then
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'help_accepted',
      'Your counsellor accepted your help request',
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/inbox?help=' || new.id::text,
      'student'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_request_accepted_notify on help_requests;
create trigger trg_help_request_accepted_notify
  after update on help_requests
  for each row
  when (old.status is distinct from new.status and new.status = 'accepted')
  execute function notify_on_help_request_accepted();

-- help_messages insert → notify the other side. A student session cannot
-- insert onto a counsellor's profile row under notifications_insert RLS, so
-- this has to happen server-side.
create or replace function public.notify_on_help_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  owner_id uuid;
begin
  if new.author_role = 'counsellor' then
    author_name := coalesce(public.profile_display_name(new.author_profile_id, null), 'Your counsellor');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      hr.student_profile_id,
      'help_reply_from_counsellor',
      author_name || ' replied to your help request',
      left(new.body, 120),
      '/inbox?help=' || new.request_id::text,
      'student'
    from help_requests hr
    where hr.id = new.request_id;
  else
    author_name := coalesce(public.profile_display_name(new.author_profile_id, null), 'A student');
    select hr.counsellor_profile_id into owner_id
    from help_requests hr
    where hr.id = new.request_id;

    if owner_id is not null then
      -- Claimed thread: notify only the owning counsellor.
      insert into notifications (profile_id, kind, title, body, href, audience)
      values (
        owner_id,
        'help_reply_from_student',
        author_name || ' replied to a help request',
        left(new.body, 120),
        '/counsellor/inbox?help=' || new.request_id::text,
        'counsellor'
      );
    else
      -- Unclaimed thread: fan out to all counsellor targets.
      insert into notifications (profile_id, kind, title, body, href, audience)
      select
        target,
        'help_reply_from_student',
        author_name || ' replied to a help request',
        left(new.body, 120),
        '/counsellor/inbox?help=' || new.request_id::text,
        'counsellor'
      from public.counsellor_notification_targets() as target;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_message_notify on help_messages;
create trigger trg_help_message_notify
  after insert on help_messages
  for each row
  execute function public.notify_on_help_message_insert();

-- Format a timestamptz as local wall-clock in the given IANA timezone. Bad or
-- empty timezone strings must never break a meeting insert/update, so an
-- invalid zone falls back to UTC instead of raising.
create or replace function public.format_meeting_time(p_ts timestamptz, p_tz text)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  return to_char(p_ts at time zone coalesce(nullif(trim(p_tz), ''), 'UTC'), 'Dy DD Mon, HH24:MI');
exception when others then
  return to_char(p_ts at time zone 'UTC', 'Dy DD Mon, HH24:MI');
end;
$$;

-- Meeting proposed → notify the student in their own timezone.
create or replace function public.notify_on_help_meeting_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  counsellor_name text;
  student_tz text;
begin
  counsellor_name := coalesce(public.profile_display_name(new.counsellor_profile_id, null), 'Your counsellor');
  select time_zone into student_tz
  from student_personal_information
  where profile_id = new.student_profile_id;

  insert into notifications (profile_id, kind, title, body, href, audience)
  values (
    new.student_profile_id,
    'help_meeting_proposed',
    counsellor_name || ' proposed a meeting',
    new.title || ' · ' || public.format_meeting_time(new.scheduled_for, student_tz),
    '/applications?help=' || new.request_id::text,
    'student'
  );
  return new;
end;
$$;

drop trigger if exists trg_help_meeting_insert_notify on help_meetings;
create trigger trg_help_meeting_insert_notify
  after insert on help_meetings
  for each row
  execute function public.notify_on_help_meeting_insert();

-- Meeting status change → notify the other side, times in the student's tz.
-- The meeting time is anchored to the student's local timezone for both
-- audiences (it is that student's meeting); this is consistent and never shows
-- raw UTC.
create or replace function public.notify_on_help_meeting_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  actor_name text;
  verb text;
  student_tz text;
  when_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  actor := coalesce(
    new.status_changed_by,
    case when auth.uid() = new.student_profile_id then 'student' else 'counsellor' end
  );
  verb := case new.status
    when 'confirmed' then 'confirmed'
    when 'cancelled' then 'cancelled'
    when 'completed' then 'marked complete'
    else 'updated'
  end;

  select time_zone into student_tz
  from student_personal_information
  where profile_id = new.student_profile_id;
  when_label := new.title || ' · ' || public.format_meeting_time(new.scheduled_for, student_tz);

  if actor = 'student' then
    actor_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_meeting_' || new.status,
      actor_name || ' ' || verb || ' a meeting',
      when_label,
      '/counsellor?help=' || new.request_id::text,
      'counsellor'
    from public.counsellor_notification_targets() as target;
  else
    actor_name := coalesce(public.profile_display_name(new.counsellor_profile_id, null), 'Your counsellor');
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'help_meeting_' || new.status,
      actor_name || ' ' || verb || ' a meeting',
      when_label,
      '/applications?help=' || new.request_id::text,
      'student'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_help_meeting_status_notify on help_meetings;
create trigger trg_help_meeting_status_notify
  after update on help_meetings
  for each row
  execute function public.notify_on_help_meeting_status();

-- ── Search filter options ─────────────────────────────────────────────────────
-- From 20260702130000_search_filter_options_fn.sql, rewritten in
-- 20260723130000_search_filter_options_loose_scan.sql: distinct filter options
-- for the university-search page, computed in the DB instead of shipping a full
-- 119k-row scan to the browser. /api/search/filter-options caches it for an hour.
-- Uses recursive-CTE loose index scans (Postgres has no native skip scan) —
-- plain SELECT DISTINCT walked all ~119k index entries and hit the statement
-- timeout. `where col > ''` skips NULLs and empty strings in one indexable
-- predicate.
create or replace function public.search_filter_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recursive
  country_vals as (
    select min(country) as v from universities where country > ''
    union all
    select (select min(country) from universities where country > country_vals.v)
    from country_vals where country_vals.v is not null
  ),
  field_vals as (
    select min(field) as v from programs where field > ''
    union all
    select (select min(field) from programs where field > field_vals.v)
    from field_vals where field_vals.v is not null
  ),
  study_level_vals as (
    select min(study_level) as v from programs where study_level > ''
    union all
    select (select min(study_level) from programs where study_level > study_level_vals.v)
    from study_level_vals where study_level_vals.v is not null
  ),
  level_vals as (
    select min(level) as v from programs where level > ''
    union all
    select (select min(level) from programs where level > level_vals.v)
    from level_vals where level_vals.v is not null
  ),
  mode_vals as (
    select min(mode) as v from programs where mode > ''
    union all
    select (select min(mode) from programs where mode > mode_vals.v)
    from mode_vals where mode_vals.v is not null
  )
  select jsonb_build_object(
    'countries', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select v from country_vals where v is not null limit 60) t
    ),
    'fields', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select v from field_vals where v is not null limit 60) t
    ),
    'studyLevels', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select v from study_level_vals where v is not null limit 30) t
    ),
    'levels', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select v from level_vals where v is not null limit 30) t
    ),
    'modes', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select v from mode_vals where v is not null limit 16) t
    )
  );
$$;

grant execute on function public.search_filter_options() to anon, authenticated;

-- =============================================================================
-- Counsellor university decks + student saved searches
-- From 20260713150000_counsellor_decks_saved_searches.sql.
--
-- Counsellors search the programme catalogue, collect programmes into themed
-- "decks" (video-game framing: decks of cards with a rarity per programme),
-- and assign a deck to one or more students. Assigning fires a student-audience
-- notification via a SECURITY DEFINER trigger (same pattern as the help-system
-- triggers). Students also get a saved_searches table to persist
-- university-search filter state across devices.
-- =============================================================================

create table if not exists counsellor_decks (
  id uuid primary key default gen_random_uuid(),
  counsellor_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  -- Visual theme for the deck card: emoji badge + accent token, kept loose on
  -- purpose so the UI can evolve without migrations.
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists counsellor_decks_owner_idx
  on counsellor_decks (counsellor_id, created_at desc);

create table if not exists counsellor_deck_programs (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references counsellor_decks(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  -- Rarity is the game-facing label; fit is the admissions-facing meaning.
  rarity text not null default 'rare'
    check (rarity in ('legendary', 'epic', 'rare', 'common')),
  fit text not null default 'match'
    check (fit in ('reach', 'match', 'safety')),
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (deck_id, program_id)
);

create index if not exists counsellor_deck_programs_deck_idx
  on counsellor_deck_programs (deck_id, position);

create table if not exists deck_assignments (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references counsellor_decks(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  message text,
  created_at timestamptz not null default now(),
  unique (deck_id, student_profile_id)
);

create index if not exists deck_assignments_student_idx
  on deck_assignments (student_profile_id, created_at desc);

create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  query text not null default '',
  -- Array of { group, value } FilterChip objects (src/lib/university-search/search-params.ts).
  filters jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists saved_searches_owner_idx
  on saved_searches (profile_id, created_at desc);

alter table counsellor_decks enable row level security;
alter table counsellor_deck_programs enable row level security;
alter table deck_assignments enable row level security;
alter table saved_searches enable row level security;

-- Cross-table membership checks used by the deck policies below. SECURITY
-- DEFINER (owned by postgres) so their subqueries bypass RLS — without this
-- the policies re-enter each other's RLS and Postgres raises "infinite
-- recursion detected in policy". See 20260713160000_fix_deck_rls_recursion.sql.
create or replace function public.deck_owned_by_me(p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from counsellor_decks d
    where d.id = p_deck_id and d.counsellor_id = auth.uid()
  );
$$;

create or replace function public.deck_assigned_to_me(p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from deck_assignments da
    where da.deck_id = p_deck_id and da.student_profile_id = auth.uid()
  );
$$;

grant execute on function public.deck_owned_by_me(uuid) to authenticated;
grant execute on function public.deck_assigned_to_me(uuid) to authenticated;

-- Decks: anyone acting as a counsellor can read the deck library; only the
-- owner mutates their decks. Students may read decks assigned to them.
drop policy if exists counsellor_decks_select on counsellor_decks;
create policy counsellor_decks_select on counsellor_decks
  for select to authenticated
  using (
    (select public.can_act_as_counsellor())
    or (select public.deck_assigned_to_me(counsellor_decks.id))
  );

drop policy if exists counsellor_decks_insert on counsellor_decks;
create policy counsellor_decks_insert on counsellor_decks
  for insert to authenticated
  with check (
    (select public.can_act_as_counsellor())
    and counsellor_id = (select auth.uid())
  );

drop policy if exists counsellor_decks_update on counsellor_decks;
create policy counsellor_decks_update on counsellor_decks
  for update to authenticated
  using (counsellor_id = (select auth.uid()))
  with check (counsellor_id = (select auth.uid()));

drop policy if exists counsellor_decks_delete on counsellor_decks;
create policy counsellor_decks_delete on counsellor_decks
  for delete to authenticated
  using (counsellor_id = (select auth.uid()));

-- Deck cards: readable wherever the deck is readable; mutable by the deck owner.
drop policy if exists counsellor_deck_programs_select on counsellor_deck_programs;
create policy counsellor_deck_programs_select on counsellor_deck_programs
  for select to authenticated
  using (
    (select public.can_act_as_counsellor())
    or (select public.deck_assigned_to_me(counsellor_deck_programs.deck_id))
  );

drop policy if exists counsellor_deck_programs_write on counsellor_deck_programs;
create policy counsellor_deck_programs_write on counsellor_deck_programs
  for all to authenticated
  using ((select public.deck_owned_by_me(counsellor_deck_programs.deck_id)))
  with check ((select public.deck_owned_by_me(counsellor_deck_programs.deck_id)));

-- Assignments: counsellors manage; students read their own.
drop policy if exists deck_assignments_select on deck_assignments;
create policy deck_assignments_select on deck_assignments
  for select to authenticated
  using (
    student_profile_id = (select auth.uid())
    or (select public.can_act_as_counsellor())
  );

drop policy if exists deck_assignments_write on deck_assignments;
create policy deck_assignments_write on deck_assignments
  for all to authenticated
  using ((select public.deck_owned_by_me(deck_assignments.deck_id)))
  with check ((select public.deck_owned_by_me(deck_assignments.deck_id)));

-- Saved searches: strictly self-service.
drop policy if exists saved_searches_self on saved_searches;
create policy saved_searches_self on saved_searches
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Assignment → student notification (server-side, like the help triggers).
create or replace function public.notify_on_deck_assignment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deck_name text;
  card_count integer;
begin
  select d.name into deck_name from counsellor_decks d where d.id = new.deck_id;
  select count(*) into card_count
    from counsellor_deck_programs p where p.deck_id = new.deck_id;

  insert into notifications (profile_id, kind, title, body, href, audience)
  values (
    new.student_profile_id,
    'deck_assignment',
    'New quest from your counsellor',
    coalesce(deck_name, 'A university deck')
      || ' · ' || card_count || ' universit' || case when card_count = 1 then 'y' else 'ies' end
      || coalesce(' — ' || nullif(trim(new.message), ''), ''),
    '/university-search/quests',
    'student'
  );
  return new;
end;
$$;

drop trigger if exists trg_deck_assignment_notify on deck_assignments;
create trigger trg_deck_assignment_notify
  after insert on deck_assignments
  for each row
  execute function public.notify_on_deck_assignment_insert();

-- =============================================================================
-- Chatbot feedback + Assistant chat history
-- From 20260717120000_chat_feedback.sql and 20260718120000_chat_conversations.sql.
--
-- chat_feedback: thumbs up/down on Ascendi widget answers (hash-keyed, own-only).
-- chat_conversations/chat_messages: DB-backed history for the full-page
-- Assistant section. Strictly own-only RLS (deliberately NOT routed through
-- can_act_as_counsellor() — chat history stays private under the open demo
-- posture). last_message_at is bumped by an AFTER INSERT trigger.
-- =============================================================================

create table if not exists chat_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('student', 'counsellor', 'parent')),
  message_hash text not null,
  message_excerpt text,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, message_hash)
);

create index if not exists chat_feedback_profile_idx
  on chat_feedback (profile_id, created_at desc);

alter table chat_feedback enable row level security;

drop policy if exists chat_feedback_insert_own on chat_feedback;
create policy chat_feedback_insert_own on chat_feedback
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists chat_feedback_select_own on chat_feedback;
create policy chat_feedback_select_own on chat_feedback
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists chat_feedback_update_own on chat_feedback;
create policy chat_feedback_update_own on chat_feedback
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('student', 'counsellor', 'parent')),
  title text,
  pinned boolean not null default false,
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_conversations_owner_idx
  on chat_conversations (owner_id, pinned desc, last_message_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  action jsonb,
  action_state text check (action_state in ('pending', 'sent', 'cancelled')),
  tool_results jsonb,
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_messages_conversation_idx
  on chat_messages (conversation_id, created_at);

-- CRITICAL: without enabling RLS the policies below are inert.
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

drop policy if exists chat_conversations_all_own on chat_conversations;
create policy chat_conversations_all_own on chat_conversations
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Realtime: the assistant workspace subscribes to chat_conversations; without
-- publication membership its channel never SUBSCRIBEs and the client is stuck
-- on poll fallback (20260718130000).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'chat_conversations'
    ) then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end $$;

-- Messages are authorised via ownership of the parent conversation. In the
-- WITH CHECK context the chat_messages reference resolves to the NEW row.
drop policy if exists chat_messages_all_own on chat_messages;
create policy chat_messages_all_own on chat_messages
  for all to authenticated
  using (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from chat_conversations c
      where c.id = chat_messages.conversation_id and c.owner_id = auth.uid()
    )
  );

-- Keep the conversation list ordered by activity without a generic updated_at.
create or replace function public.bump_chat_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update chat_conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_message_bump on chat_messages;
create trigger trg_chat_message_bump
  after insert on chat_messages
  for each row execute function public.bump_chat_conversation_last_message();

-- =============================================================================
-- Not included (one-off backfills / data repairs from migrations):
--   • 20250214120000_student_intake_profile.sql — drops of the legacy
--     student_academics / student_preferences / student_aspirations tables and
--     enum re-creates; a fresh DB starts from the final enums/tables above.
--   • 20250308120000_normalize_course_catalog.sql — the universities_v2 /
--     programs_v2 copy-and-rename dance, the cities/universities/programs
--     INSERT…SELECT backfills from legacy metadata, the FK re-pointing, and the
--     archive_raw_courses / archive_raw_universities legacy archive tables.
--     The tables above are already in their final (v2) shape.
--   • 20260628120000_counsellor_real_data.sql — the `update profiles set
--     role='counsellor' where role='counselor'` data fix and the dynamic
--     constraint-drop loop; profiles here uses the named British-spelling
--     constraint from the start.
--   • 20260713120000_programs_field_id_idx.sql — the `analyze programs;`
--     maintenance statement (run it after bulk-loading the catalogue).
-- =============================================================================
