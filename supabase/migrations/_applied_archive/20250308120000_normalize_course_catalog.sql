-- Normalize course catalog into cities/universities/programs and add scoring view

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cost_of_life_enum') then
    create type cost_of_life_enum as enum ('HIGH', 'MEDIUM', 'LOW');
  end if;
end $$;

create or replace function safe_int(input text, max_len int default 9) returns int as $$
  select case
    when input is null then null
    when length(input) > max_len then null
    else input::int
  end;
$$ language sql immutable;

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

create table if not exists universities_v2 (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  region text,
  city text,
  city_id uuid references cities(id) on delete set null,
  rank_overall int,
  rank_source text,
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

create table if not exists programs_v2 (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities_v2(id) on delete cascade,
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

insert into cities (name, region, country, average_rent_outside_campus_gbp_per_month, cost_of_life)
select distinct
  nullif(trim(u.city), '') as name,
  nullif(trim(u.region), '') as region,
  nullif(trim(u.country), '') as country,
  safe_int(nullif(regexp_replace((u.metadata->>'average_rent_outside_campus_gbp_per_month'), '[^0-9-]', '', 'g'), '')),
  case upper(coalesce(u.metadata->>'cost_of_life', ''))
    when 'HIGH' then 'HIGH'::cost_of_life_enum
    when 'MEDIUM' then 'MEDIUM'::cost_of_life_enum
    when 'LOW' then 'LOW'::cost_of_life_enum
    else null
  end
from universities u
where nullif(trim(u.city), '') is not null
  and nullif(trim(u.country), '') is not null
on conflict (name, region, country) do nothing;

insert into universities_v2 (
  id,
  name,
  country,
  region,
  city,
  city_id,
  rank_overall,
  rank_source,
  website,
  intl_tuition_low,
  intl_tuition_high,
  currency,
  acceptance_rate,
  requires_test,
  qs_uk_rank,
  times_sunday_rank,
  guardian_rank,
  acceptance_rate_pct,
  nss_score_pct,
  international_students_ratio_pct,
  student_to_staff_ratio,
  student_dorm_cost_gbp_per_year,
  average_rent_outside_campus_gbp_per_month_override,
  cost_of_life_override,
  graduate_employment_rate_pct,
  average_starting_salary_gbp,
  university_life,
  number_of_students,
  transport_accessibility,
  cultural_social_environment,
  city_life,
  climate,
  safety_index,
  metadata,
  created_at,
  updated_at
)
select
  u.id,
  u.name,
  u.country,
  u.region,
  u.city,
  c.id as city_id,
  u.rank_overall,
  u.rank_source,
  u.website,
  u.intl_tuition_low,
  u.intl_tuition_high,
  u.currency,
  u.acceptance_rate,
  u.requires_test,
  nullif(regexp_replace((u.metadata->>'qs_uk_rank'), '[^0-9]', '', 'g'), '')::int,
  nullif(regexp_replace((u.metadata->>'times_sunday_rank'), '[^0-9]', '', 'g'), '')::int,
  nullif(regexp_replace((u.metadata->>'guardian_rank'), '[^0-9]', '', 'g'), '')::int,
  case
    when u.acceptance_rate between 0 and 100 then u.acceptance_rate
    else null
  end,
  nullif(regexp_replace((u.metadata->>'nss_score_pct'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((u.metadata->>'international_students_ratio_pct'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((u.metadata->>'student_to_staff_ratio'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((u.metadata->>'student_dorm_cost_gbp_per_year'), '[^0-9]', '', 'g'), '')::int,
  nullif(regexp_replace((u.metadata->>'average_rent_outside_campus_gbp_per_month'), '[^0-9]', '', 'g'), '')::int,
  case upper(coalesce(u.metadata->>'cost_of_life', ''))
    when 'HIGH' then 'HIGH'::cost_of_life_enum
    when 'MEDIUM' then 'MEDIUM'::cost_of_life_enum
    when 'LOW' then 'LOW'::cost_of_life_enum
    else null
  end,
  nullif(regexp_replace((u.metadata->>'graduate_employment_rate_pct'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((u.metadata->>'average_starting_salary_gbp'), '[^0-9]', '', 'g'), '')::int,
  nullif(u.metadata->>'university_life', ''),
  nullif(regexp_replace((u.metadata->>'number_of_students'), '[^0-9]', '', 'g'), '')::int,
  nullif(u.metadata->>'transport_accessibility', ''),
  nullif(u.metadata->>'cultural_social_environment', ''),
  nullif(u.metadata->>'city_life', ''),
  nullif(u.metadata->>'climate', ''),
  nullif(u.metadata->>'safety_index', ''),
  u.metadata,
  u.created_at,
  timezone('utc', now())
from universities u
left join cities c
  on c.name = u.city
  and c.country = u.country
  and (c.region is not distinct from u.region);

insert into programs_v2 (
  id,
  university_id,
  name,
  course_name,
  field,
  study_level,
  level,
  duration,
  duration_years,
  start_date,
  campus,
  language,
  mode,
  intake_months,
  tuition,
  currency,
  course_summary,
  modules,
  assessment_methods,
  provider_course_url,
  provider_apply_url,
  ucas_code,
  min_alevel,
  min_ib,
  ucas_points,
  subject_requirements,
  entry_requirements_overview,
  additional_entry_requirements,
  subsequent_year_entry_requirements,
  english_requirements,
  contextual_admissions,
  tuition_fees_international,
  tuition_fees_home,
  additional_fee_info,
  student_satisfaction,
  employment_after_course,
  student_outcomes,
  average_salary_after_15m,
  historic_entry_grades,
  open_days,
  url,
  metadata,
  min_ib_score,
  min_a_level_score,
  a_level_min_numeric,
  preferred_subjects,
  english_score_requirement,
  course_online_page,
  ucas_deadline,
  admission_test,
  interview,
  nss_score_pct_override,
  intake_size,
  gender_ratio_pct,
  international_students_ratio_pct_override,
  student_to_staff_ratio_override,
  yearly_international_tuition_fee_gbp,
  student_dorm_cost_gbp_per_year_override,
  average_rent_outside_campus_gbp_per_month_override,
  cost_of_life_override,
  university_life_override,
  study_abroad_option,
  top_industries,
  placement_year,
  placement_year_detail,
  average_starting_salary_gbp_override,
  created_at,
  updated_at
)
select
  p.id,
  p.university_id,
  p.name,
  p.course_name,
  p.field,
  p.study_level,
  p.level,
  p.duration,
  p.duration_years,
  p.start_date,
  p.campus,
  p.language,
  p.mode,
  p.intake_months,
  p.tuition,
  p.currency,
  p.course_summary,
  p.modules,
  p.assessment_methods,
  p.provider_course_url,
  p.provider_apply_url,
  p.ucas_code,
  p.min_alevel,
  p.min_ib,
  p.ucas_points,
  p.subject_requirements,
  p.entry_requirements_overview,
  p.additional_entry_requirements,
  p.subsequent_year_entry_requirements,
  p.english_requirements,
  p.contextual_admissions,
  p.tuition_fees_international,
  p.tuition_fees_home,
  p.additional_fee_info,
  p.student_satisfaction,
  p.employment_after_course,
  p.student_outcomes,
  p.average_salary_after_15m,
  p.historic_entry_grades,
  p.open_days,
  p.url,
  p.metadata,
  case
    when coalesce(pr.min_ib_total, nullif(regexp_replace((p.min_ib), '[^0-9]', '', 'g'), '')::int) between 24 and 45
      then coalesce(pr.min_ib_total, nullif(regexp_replace((p.min_ib), '[^0-9]', '', 'g'), '')::int)
    else null
  end,
  nullif(p.min_alevel, ''),
  case
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) like '%A*AA%' then 100
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'A*AB' then 95
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'AAA' then 90
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'AAB' then 80
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'ABB' then 70
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'BBB' then 60
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'BBC' then 50
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'BCC' then 40
    when upper(regexp_replace(coalesce(p.min_alevel, ''), '\\s+', '', 'g')) = 'CCC' then 30
    else null
  end,
  p.subject_requirements,
  p.english_requirements,
  coalesce(p.provider_course_url, p.url),
  p.start_date,
  coalesce(p.additional_entry_requirements, p.entry_requirements_overview),
  nullif((p.metadata->>'interview'), ''),
  nullif(regexp_replace((p.metadata->>'nss_score_pct'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((p.metadata->>'intake_size'), '[^0-9]', '', 'g'), '')::int,
  nullif(regexp_replace((p.metadata->>'gender_ratio_pct'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((p.metadata->>'international_students_ratio_pct'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((p.metadata->>'student_to_staff_ratio'), '[^0-9.]', '', 'g'), '')::numeric,
  nullif(regexp_replace((p.tuition_fees_international), '[^0-9]', '', 'g'), '')::int,
  nullif(regexp_replace((p.metadata->>'student_dorm_cost_gbp_per_year'), '[^0-9]', '', 'g'), '')::int,
  nullif(regexp_replace((p.metadata->>'average_rent_outside_campus_gbp_per_month'), '[^0-9]', '', 'g'), '')::int,
  case upper(coalesce(p.metadata->>'cost_of_life', ''))
    when 'HIGH' then 'HIGH'::cost_of_life_enum
    when 'MEDIUM' then 'MEDIUM'::cost_of_life_enum
    when 'LOW' then 'LOW'::cost_of_life_enum
    else null
  end,
  nullif((p.metadata->>'university_life'), ''),
  nullif((p.metadata->>'study_abroad_option'), ''),
  nullif((p.metadata->>'top_industries'), ''),
  case
    when lower(coalesce(p.metadata->>'placement_year', '')) in ('yes','true','1') then true
    when lower(coalesce(p.metadata->>'placement_year', '')) in ('no','false','0') then false
    else null
  end,
  nullif((p.metadata->>'placement_year'), ''),
  nullif(regexp_replace((p.average_salary_after_15m), '[^0-9]', '', 'g'), '')::int,
  p.created_at,
  timezone('utc', now())
from programs p
left join program_requirements pr on pr.program_id = p.id;

do $$
begin
  if to_regclass('public.programs') is not null and to_regclass('public.archive_raw_courses') is null then
    execute 'alter table programs rename to archive_raw_courses';
  end if;
  if to_regclass('public.programs_v2') is not null then
    execute 'alter table programs_v2 rename to programs';
  end if;
  if to_regclass('public.universities') is not null and to_regclass('public.archive_raw_universities') is null then
    execute 'alter table universities rename to archive_raw_universities';
  end if;
  if to_regclass('public.universities_v2') is not null then
    execute 'alter table universities_v2 rename to universities';
  end if;
end $$;

alter table if exists program_requirements drop constraint if exists program_requirements_program_id_fkey;
alter table if exists program_requirements
  add constraint program_requirements_program_id_fkey foreign key (program_id) references programs(id) on delete cascade;
alter table if exists deadlines drop constraint if exists deadlines_program_id_fkey;
alter table if exists deadlines
  add constraint deadlines_program_id_fkey foreign key (program_id) references programs(id) on delete cascade;
alter table if exists application_tasks drop constraint if exists application_tasks_program_id_fkey;
alter table if exists application_tasks
  add constraint application_tasks_program_id_fkey foreign key (program_id) references programs(id) on delete cascade;
alter table if exists student_matches drop constraint if exists student_matches_program_id_fkey;
alter table if exists student_matches
  add constraint student_matches_program_id_fkey foreign key (program_id) references programs(id) on delete cascade;
alter table if exists applications drop constraint if exists applications_program_id_fkey;
alter table if exists applications
  add constraint applications_program_id_fkey foreign key (program_id) references programs(id) on delete cascade;
alter table if exists shortlisted_programs drop constraint if exists shortlisted_programs_program_id_fkey;
alter table if exists shortlisted_programs
  add constraint shortlisted_programs_program_id_fkey foreign key (program_id) references programs(id) on delete cascade;

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
create index if not exists idx_programs_field_of_study on programs(field);
create index if not exists idx_programs_min_ib_score on programs(min_ib_score);
create index if not exists idx_programs_min_a_level_numeric on programs(a_level_min_numeric);
create index if not exists idx_programs_nss_override on programs(nss_score_pct_override);
create index if not exists idx_programs_intake_size on programs(intake_size);
create index if not exists idx_programs_gender_ratio on programs(gender_ratio_pct);
create index if not exists idx_programs_student_staff_override on programs(student_to_staff_ratio_override);
create index if not exists idx_programs_tuition on programs(yearly_international_tuition_fee_gbp);
create index if not exists idx_programs_average_salary_override on programs(average_starting_salary_gbp_override);
create index if not exists idx_programs_university_life_override on programs(university_life_override);

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
        ), '\\s+', '', 'g')) like '%A*AA%' then 100
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'A*AB' then 95
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'AAA' then 90
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'AAB' then 80
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'ABB' then 70
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'BBB' then 60
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'BBC' then 50
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'BCC' then 40
        when upper(regexp_replace(coalesce(
          p.min_a_level_score,
          p.min_alevel,
          (regexp_match(upper(coalesce(p.entry_requirements_overview, '')), '(A\*AA|A\*AB|AAA|AAB|ABB|BBB|BBC|BCC|CCC)'))[1]
        ), '\\s+', '', 'g')) = 'CCC' then 30
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
    u.requires_test as university_requires_test
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
    end as university_score,
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
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) like '%A*AA%' then 100
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'A*AB' then 95
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'AAA' then 90
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'AAB' then 80
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'ABB' then 70
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'BBB' then 60
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'BBC' then 50
      when upper(regexp_replace(min_a_level_score, '\\s+', '', 'g')) = 'BCC' then 40
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
  case
    when min_ib_score is not null and min_a_level_score is not null then round((ib_score + alevel_score) / 2.0)
    when min_ib_score is not null then ib_score
    when min_a_level_score is not null then alevel_score
    else 40
  end as course_selectivity_score,
  round(university_score * 0.6 + (
    case
      when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
      when min_ib_score is not null then ib_score
      when min_a_level_score is not null then alevel_score
      else 40
    end
  ) * 0.4) as total_course_score,
  case
    when round(university_score * 0.6 + (
      case
        when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
        when min_ib_score is not null then ib_score
        when min_a_level_score is not null then alevel_score
        else 40
      end
    ) * 0.4) >= 85 then 1
    when round(university_score * 0.6 + (
      case
        when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
        when min_ib_score is not null then ib_score
        when min_a_level_score is not null then alevel_score
        else 40
      end
    ) * 0.4) >= 75 then 2
    when round(university_score * 0.6 + (
      case
        when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
        when min_ib_score is not null then ib_score
        when min_a_level_score is not null then alevel_score
        else 40
      end
    ) * 0.4) >= 65 then 3
    when round(university_score * 0.6 + (
      case
        when min_ib_score is not null and min_a_level_score is not null then (ib_score + alevel_score) / 2.0
        when min_ib_score is not null then ib_score
        when min_a_level_score is not null then alevel_score
        else 40
      end
    ) * 0.4) >= 50 then 4
    else 5
  end as course_tier
from scores;

grant select on course_scoring_v1 to anon, authenticated;

-- Validation queries (run manually)
-- select count(*) as legacy_programs from archive_raw_courses;
-- select count(*) as new_programs from programs;
-- select count(*) as universities_new from universities;
-- select count(*) as programs_missing_university
-- from programs p
-- left join universities u on u.id = p.university_id
-- where u.id is null;
-- select min(university_score) as min_uni_score,
--   max(university_score) as max_uni_score,
--   min(course_selectivity_score) as min_selectivity,
--   max(course_selectivity_score) as max_selectivity,
--   min(total_course_score) as min_total,
--   max(total_course_score) as max_total
-- from course_scoring_v1;
