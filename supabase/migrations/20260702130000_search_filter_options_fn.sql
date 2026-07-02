-- Distinct filter options for the university-search hub, computed in the DB.
--
-- The search hub previously ran `programs.select('field,study_level,level,mode')`
-- with no limit from the BROWSER — a full scan of the 119k-row catalogue shipped
-- to the client (or silently truncated at PostgREST's row cap) just to derive
-- ≤60 distinct strings. This function returns only the distinct values; the
-- /api/search/filter-options route caches it for an hour.

create or replace function public.search_filter_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'countries', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select distinct country as v from universities
            where country is not null and country <> '' limit 60) t
    ),
    'fields', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select distinct field as v from programs
            where field is not null and field <> '' limit 60) t
    ),
    'studyLevels', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select distinct study_level as v from programs
            where study_level is not null and study_level <> '' limit 30) t
    ),
    'levels', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select distinct level as v from programs
            where level is not null and level <> '' limit 30) t
    ),
    'modes', (
      select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
      from (select distinct mode as v from programs
            where mode is not null and mode <> '' limit 16) t
    )
  );
$$;

grant execute on function public.search_filter_options() to anon, authenticated;
