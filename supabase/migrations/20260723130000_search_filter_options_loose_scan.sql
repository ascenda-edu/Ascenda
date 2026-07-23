-- Rewrite search_filter_options() with loose index scans.
--
-- Why: the original SELECT DISTINCT subqueries still timed out (57014) even
-- after 20260723120000 added the study_level/mode indexes — a DISTINCT over a
-- low-cardinality column walks all ~119k index entries, and cold visibility
-- maps degrade that into heap fetches. Postgres has no native skip scan, so
-- this emulates one with the standard recursive-CTE loose scan: each distinct
-- value costs one index boundary lookup (O(distinct_values × log n) — single-
-- digit milliseconds for these columns).
--
-- `where col > ''` skips both NULLs and empty strings in one indexable
-- predicate. Result shape and grants are unchanged from 20260702130000.
--
-- Idempotent: create or replace.

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
