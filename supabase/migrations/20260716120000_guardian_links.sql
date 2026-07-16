-- Parent portal: guardian_links — the parent → child linkage primitive.
--
-- The /parent section scopes every query through resolveLinkedChildIds()
-- (src/lib/parent/data.ts), which reads this table. A parent must only ever
-- see the students they are explicitly linked to — an empty link set renders
-- an empty state, never the cohort.
--
-- Launch posture (demo mode): scoping is enforced at the APPLICATION layer via
-- this table; the DB-level counsellor-open policies (20260712130000) still
-- grant broad reads to any signed-in user. Phase 2 adds can_act_as_parent()
-- RLS keyed on this table and unwinds the open policy — this table is that
-- future seam, created now so the scoping is explicit rather than hardcoded.
--
-- Applied one-off via `npm run db:apply <file>` — must be idempotent and
-- self-contained (safe to apply alone and to re-apply).
--
-- Reseed caveat: scripts/seed-students.ts purges seeded student profiles
-- before reseeding, and the on delete cascade FK below silently deletes the
-- demo guardian link with them. Re-running this migration restores it.

-- ── 1. table ──────────────────────────────────────────────────────────────────

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

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
-- CRITICAL: without enable row level security the policy below is inert and
-- default grants would let ANY authenticated session insert a link to any
-- student — forging the exact scoping seam this table exists to provide.

alter table guardian_links enable row level security;

-- A parent reads only their own link rows. Deliberately NO insert/update/
-- delete policy — links are written only by migration/service role (Phase 2:
-- by the verified parent-invite flow).
drop policy if exists guardian_links_self on guardian_links;
create policy guardian_links_self on guardian_links
  for select to authenticated
  using (parent_profile_id = auth.uid());

-- ── 3. demo seed ──────────────────────────────────────────────────────────────
-- Link the demo account (greg@workiflow.com) to one seeded student so the
-- parent portal shows a believable "your child". profiles has no email column:
-- greg resolves via auth.users (same pattern as counsellor_notification_targets,
-- schema.sql), the child via student_personal_information's seed-email suffix.
-- Deterministic (order by email limit 1); no-ops when either side is absent.

do $$
declare
  demo_parent_id uuid;
  seed_child_id uuid;
begin
  select u.id into demo_parent_id
  from auth.users u
  where lower(u.email) = 'greg@workiflow.com'
  limit 1;

  select spi.profile_id into seed_child_id
  from student_personal_information spi
  where lower(coalesce(spi.email, '')) like '%+seed@ascenda.demo'
  order by spi.email
  limit 1;

  if demo_parent_id is not null and seed_child_id is not null then
    insert into guardian_links (parent_profile_id, student_profile_id, relationship, status)
    values (demo_parent_id, seed_child_id, 'Guardian', 'active')
    on conflict (parent_profile_id, student_profile_id) do nothing;
  end if;
end;
$$;
