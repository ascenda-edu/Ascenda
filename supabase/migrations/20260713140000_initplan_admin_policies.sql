-- Rewrite every `auth_role() = 'admin'` RLS policy to `(select auth_role()) = 'admin'`.
--
-- A bare function call in a policy qual is evaluated PER ROW; wrapped in a
-- scalar subquery it becomes an InitPlan evaluated ONCE per statement
-- (standard Supabase RLS guidance). auth_role() does a profiles lookup, so on
-- catalogue-sized scans this was ~30k+ profiles lookups per query — the
-- programs pager in lib/matching/service.ts kept hitting the 8s statement
-- timeout (57014) even with the (field, id) index in place.
--
-- Semantics are unchanged: same policy names, same commands (FOR ALL unless
-- noted), same expression result. FOR ALL policies created with only USING
-- default WITH CHECK to the same expression, as before.
--
-- Tables are existence-guarded: schema.sql declares some tables (e.g.
-- shortlisted_programs) that were never created on the remote DB.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('profiles',                      'profiles_admin_view',     'select'),
      ('student_personal_information',  'personal_admin',          'all'),
      ('student_academic_input',        'academic_input_admin',    'all'),
      ('student_subjects',              'subjects_admin',          'all'),
      ('student_admissions_tests',      'admissions_admin',        'all'),
      ('student_lifestyle_preference',  'lifestyle_admin',         'all'),
      ('student_scores',                'scores_admin',            'all'),
      ('universities',                  'universities_admin',      'all'),
      ('programs',                      'programs_admin',          'all'),
      ('program_requirements',          'requirements_admin',      'all'),
      ('deadlines',                     'deadlines_admin',         'all'),
      ('application_tasks',             'application_tasks_admin', 'all'),
      ('sources',                       'sources_admin',           'all'),
      ('student_matches',               'matches_admin',           'all'),
      ('shortlisted_programs',          'shortlist_admin',         'all'),
      ('applications',                  'applications_admin',      'all'),
      ('application_checklist',         'checklist_admin',         'all'),
      ('documents',                     'documents_admin',         'all')
    ) as t(tbl, pol, cmd)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'initplan_admin_policies: skipping % — table % does not exist', r.pol, r.tbl;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', r.pol, r.tbl);
    if r.cmd = 'select' then
      execute format(
        'create policy %I on public.%I for select using ((select auth_role()) = ''admin'')',
        r.pol, r.tbl
      );
    else
      execute format(
        'create policy %I on public.%I using ((select auth_role()) = ''admin'')',
        r.pol, r.tbl
      );
    end if;
  end loop;
end $$;
