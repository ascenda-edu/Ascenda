-- Fix RLS recursion through auth_role().
--
-- auth_role() (schema.sql) is an invoker-rights `select role from profiles`,
-- and it is referenced by policies on profiles itself (profiles_admin_view)
-- and by FOR ALL policies on other tables (e.g. matches_admin on
-- student_matches). Evaluating those policies re-enters profiles RLS, which
-- re-evaluates auth_role(), which re-enters profiles RLS… → Postgres error
-- 54001 "stack depth limit exceeded".
--
-- Observed in production as:
--   • student_matches DELETE (match-cache rebuild in lib/matching/service.ts)
--     failing with 54001 for non-demo users — so their match cache is never
--     written and every dashboard/matches load recomputes from the catalog.
--   • counsellor data layer profiles reads failing with 54001 / statement
--     timeout for non-demo users.
--
-- SECURITY DEFINER (same treatment is_counsellor() got in
-- 20260611130000_tighten_help_rls.sql) makes the inner profiles read run as
-- the function owner, bypassing profiles RLS and breaking the cycle.

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
