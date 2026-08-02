-- The counsellor ↔ student relationship, as data.
--
-- NOT APPLIED. Written by the database audit (docs/audit/12-database-design.md
-- §3.1). Review, then apply one-off via `npm run db:apply <file>`.
--
-- ── Why this table is the prerequisite for everything else ───────────────────
-- There is no counsellor↔student edge anywhere in the schema. "Cohort" is an
-- email-suffix filter in application code (src/lib/counsellor/data.ts:59), so
-- RLS has nothing to scope a counsellor on — which is precisely WHY
-- can_act_as_counsellor() degenerated to `auth.uid() is not null` and took ~24
-- policies with it (docs/audit/11-security-authz.md F1).
--
-- Worse, that email lives in student_personal_information.email, a column the
-- STUDENT owns (personal_self, schema.sql:880). The containment the audit
-- correctly says not to remove is opt-in by the attacker:
--   await supabase.from('student_personal_information')
--     .update({ email: 'x+seed@ascenda.demo' }).eq('profile_id', myId);
--
-- Applying this migration changes NO behaviour. It creates the edge and
-- backfills it so that the roster is byte-identical the moment the app-side
-- filter is deleted. The policy rewrite is a separate, later migration.
--
-- ── Design notes ─────────────────────────────────────────────────────────────
--   • Bidirectional visibility. The student AND their guardian can read their
--     own edges. guardian_links gets this wrong (schema.sql:1660 — parent only).
--     On a platform for minors, "who can see my record" must be answerable by
--     the minor.
--   • No client writes, but an ADMIN write path. guardian_links has no write
--     policy for anyone, which is why linking a real family today requires
--     production DB credentials. Don't repeat that.
--   • status, not a boolean: 'pending' supports an invite/acceptance flow;
--     'revoked' preserves the historical edge for audit rather than erasing it.
--     Only 'active' grants access.
--   • One primary counsellor per student, enforced by a partial unique index;
--     'secondary'/'observer' cover handovers and supervision.
--
-- Idempotent: create if not exists / drop-then-create. Safe to re-apply.

-- ── 1. table ─────────────────────────────────────────────────────────────────

create table if not exists counsellor_assignments (
  id                    uuid primary key default gen_random_uuid(),
  counsellor_profile_id uuid not null references profiles(id) on delete cascade,
  student_profile_id    uuid not null references profiles(id) on delete cascade,
  role                  text not null default 'primary'
                          check (role in ('primary', 'secondary', 'observer')),
  status                text not null default 'active'
                          check (status in ('pending', 'active', 'revoked')),
  assigned_by           uuid references profiles(id) on delete set null,
  note                  text,
  created_at            timestamptz not null default timezone('utc', now()),
  activated_at          timestamptz,
  revoked_at            timestamptz,
  constraint counsellor_assignments_not_self
    check (counsellor_profile_id <> student_profile_id),
  constraint counsellor_assignments_status_stamps
    check ((status <> 'active'  or activated_at is not null)
       and (status <> 'revoked' or revoked_at   is not null)),
  unique (counsellor_profile_id, student_profile_id)
);

-- The direction every RLS check reads: "who counsels this student, right now".
create index if not exists counsellor_assignments_student_idx
  on counsellor_assignments (student_profile_id, status);
-- The direction the counsellor roster reads: "my active caseload".
create index if not exists counsellor_assignments_counsellor_idx
  on counsellor_assignments (counsellor_profile_id, status);
-- Exactly one primary counsellor per student.
create unique index if not exists counsellor_assignments_one_primary_idx
  on counsellor_assignments (student_profile_id)
  where status = 'active' and role = 'primary';

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- CRITICAL: without `enable row level security` the policies below are inert and
-- the default grants let ANY authenticated session insert an edge to any
-- student — forging the exact scoping seam this table exists to provide.
-- (Same warning as 20260716120000_guardian_links.sql:37-39.)

alter table counsellor_assignments enable row level security;

drop policy if exists counsellor_assignments_select on counsellor_assignments;
create policy counsellor_assignments_select on counsellor_assignments
  for select to authenticated
  using (
    counsellor_profile_id = (select auth.uid())
    or student_profile_id  = (select auth.uid())
    or exists (                                    -- the student's guardian
      select 1 from guardian_links g
      where g.student_profile_id = counsellor_assignments.student_profile_id
        and g.parent_profile_id  = (select auth.uid())
        and g.status = 'active'
    )
    or (select public.auth_role()) = 'admin'
  );

-- Writes: admins only. Everything else goes through the service-role invite
-- flow. Deliberately NO delete policy — revoke by setting status, never by
-- erasing the history of who had access.
drop policy if exists counsellor_assignments_admin_insert on counsellor_assignments;
create policy counsellor_assignments_admin_insert on counsellor_assignments
  for insert to authenticated
  with check ((select public.auth_role()) = 'admin');

drop policy if exists counsellor_assignments_admin_update on counsellor_assignments;
create policy counsellor_assignments_admin_update on counsellor_assignments
  for update to authenticated
  using ((select public.auth_role()) = 'admin')
  with check ((select public.auth_role()) = 'admin');

-- ── 3. relationship helpers ──────────────────────────────────────────────────
-- SECURITY DEFINER for the same reason auth_role() and is_counsellor() are
-- (schema.sql:840-847): an invoker-rights read inside a policy re-enters that
-- table's RLS and recurses.

create or replace function public.counsels_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from counsellor_assignments a
    where a.counsellor_profile_id = auth.uid()
      and a.student_profile_id = p_student
      and a.status = 'active'
  );
$$;

create or replace function public.is_guardian_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guardian_links g
    where g.parent_profile_id = auth.uid()
      and g.student_profile_id = p_student
      and g.status = 'active'
  );
$$;

-- Every student id the CURRENT user may READ.
--
-- UNCORRELATED on purpose. Used as `col in (select public.visible_student_ids())`
-- so the planner evaluates it ONCE per statement (InitPlan) and hash-probes per
-- row. Wrapping a CORRELATED helper — `(select public.counsels_student(col))` —
-- does NOT achieve this: it stays a per-row SubPlan. That distinction is the
-- whole point of 20260713140000_initplan_admin_policies.sql, which exists
-- because per-row helper calls were hitting the 8s statement timeout (57014).
create or replace function public.visible_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union
  select a.student_profile_id from counsellor_assignments a
   where a.counsellor_profile_id = auth.uid() and a.status = 'active'
  union
  select g.student_profile_id from guardian_links g
   where g.parent_profile_id = auth.uid() and g.status = 'active';
$$;

-- Student ids the CURRENT user may WRITE ABOUT (counsellor-authored records:
-- notes, the document tracker, parent comms). Guardians are read-only by design.
create or replace function public.writable_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union
  select a.student_profile_id from counsellor_assignments a
   where a.counsellor_profile_id = auth.uid() and a.status = 'active'
     and a.role in ('primary', 'secondary');
$$;

grant execute on function public.counsels_student(uuid) to authenticated;
grant execute on function public.is_guardian_of(uuid)   to authenticated;
grant execute on function public.visible_student_ids()  to authenticated;
grant execute on function public.writable_student_ids() to authenticated;

-- ── 4. backfill from the current cohort ──────────────────────────────────────
-- Reads the SAME email suffix src/lib/counsellor/data.ts:59 filters on today,
-- so the roster is unchanged the moment inDemoCohort() is deleted.
--
-- Reseed caveat (as guardian_links): scripts/seed-students.ts purges seeded
-- profiles and the on-delete-cascade takes these rows with them. Re-run this
-- migration after any reseed.

do $$
declare
  n_counsellor integer := 0;
  n_demo       integer := 0;
begin
  -- Real counsellor/admin accounts get the seeded cohort as secondary.
  with ins as (
    insert into counsellor_assignments
      (counsellor_profile_id, student_profile_id, role, status, activated_at)
    select c.id, spi.profile_id, 'secondary', 'active', now()
    from profiles c
    join student_personal_information spi
      on lower(coalesce(spi.email, '')) like '%+seed@ascenda.demo'
    where c.role in ('counsellor', 'admin')
      and c.id <> spi.profile_id
    on conflict (counsellor_profile_id, student_profile_id) do nothing
    returning 1
  )
  select count(*) into n_counsellor from ins;

  -- The single-account demo (greg@workiflow.com) holds the counsellor inbox but
  -- is role='student'; resolve via auth.users, exactly as
  -- counsellor_notification_targets() (schema.sql:1803) and the guardian_links
  -- seed (20260716120000:63-66) already do. Primary, so the partial unique
  -- index gives the demo a single deterministic owner per student.
  --
  -- ⚠️  TWO unique indexes can reject this insert, and `on conflict` arbitrates
  -- on exactly ONE. The clause below covers
  -- counsellor_assignments_pair_key (counsellor_profile_id, student_profile_id);
  -- it does NOT cover counsellor_assignments_one_primary_idx, the partial unique
  -- on (student_profile_id) where status='active' and role='primary' that this
  -- same file creates at :69-71. If an admin has since made a DIFFERENT
  -- counsellor the primary for a seeded student — which the product explicitly
  -- supports — re-running this file raised 23505 on that second index and
  -- aborted the whole migration, while the header promised "Idempotent … Safe to
  -- re-apply". The `not exists` below is what makes that promise true: a student
  -- who already has an active primary is skipped, whoever that primary is.
  -- See docs/audit/verify/C-database.md finding C10.
  with ins as (
    insert into counsellor_assignments
      (counsellor_profile_id, student_profile_id, role, status, activated_at)
    select u.id, spi.profile_id, 'primary', 'active', now()
    from auth.users u
    join student_personal_information spi
      on lower(coalesce(spi.email, '')) like '%+seed@ascenda.demo'
    where lower(u.email) = 'greg@workiflow.com'
      and u.id <> spi.profile_id
      and not exists (
        select 1 from counsellor_assignments ca
        where ca.student_profile_id = spi.profile_id
          and ca.role = 'primary'
          and ca.status = 'active'
      )
    on conflict (counsellor_profile_id, student_profile_id) do nothing
    returning 1
  )
  select count(*) into n_demo from ins;

  raise notice 'counsellor_assignments backfill: % counsellor row(s), % demo row(s)',
    n_counsellor, n_demo;
end $$;

-- ── 5. verify ────────────────────────────────────────────────────────────────

do $$
declare n integer;
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'counsellor_assignments'
  ) then
    raise exception 'verification failed: counsellor_assignments was not created';
  end if;

  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'counsellor_assignments' and c.relrowsecurity;
  if n <> 1 then
    raise exception 'verification failed: RLS is not enabled on counsellor_assignments';
  end if;

  select count(*) into n from counsellor_assignments where status = 'active';
  if n = 0 then
    raise warning 'counsellor_assignments is empty — the counsellor roster will be '
                  'EMPTY once inDemoCohort() is removed. Seed the cohort first.';
  else
    raise notice 'counsellor_assignments: % active edge(s)', n;
  end if;
end $$;
