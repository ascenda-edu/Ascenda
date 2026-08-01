-- Step 10 — guardian_links parity: a read path for the child, a write path for
-- an administrator (F16b).
--
-- ⚠️  NOT APPLIED. Written for review by the database audit
--     (docs/audit/12-database-design.md F16 + migration plan step 10). Read it,
--     then apply one-off with `npm run db:apply <file>`. Nothing here has been
--     executed against any database.
--
-- ── Class: SAFE (purely additive) ────────────────────────────────────────────
-- The existing guardian_links_self policy is restated verbatim, not changed. All
-- four other policies GRANT access that nobody has today, so nothing that works
-- now can stop working. The only new restriction is a CHECK forbidding a
-- self-link, which no existing row can violate (verified by section 3 before it
-- validates).
--
-- ── App change required ──────────────────────────────────────────────────────
-- None for correctness. To use it:
--   • an admin UI for linking a guardian to a student (the write policy below is
--     what makes that buildable without production DB credentials);
--   • the student-facing "who can see my record" surface the read policy below
--     enables — see the rationale, it is the reason this is worth shipping;
--   • the eventual invite flow (a guardian_invites table with a single-use token
--     ACCEPTED BY THE STUDENT, so consent flows in the right direction). That
--     table is deliberately NOT created here: an unused table is a liability,
--     and its shape depends on product decisions that have not been made.
--
-- ── Why this matters ─────────────────────────────────────────────────────────
-- guardian_links has RLS enabled and EXACTLY ONE policy (schema.sql:1660-1662):
--
--     for select using (parent_profile_id = auth.uid())
--
-- There is no insert, update or delete policy for ANY role, INCLUDING ADMIN.
-- `rg guardian_links src/ scripts/` returns reads only, and
-- src/lib/types/demo-tables.ts:189 states the intent outright: "Insert type on
-- purpose; browser sessions never insert guardian_links."
--
-- The only row-creating code in the entire repository is the hardcoded demo
-- `do $$` block in 20260716120000:58-80, which links one email to one seeded
-- student and which that migration's own header warns is destroyed by the next
-- re-seed. The design comment promises "Phase 2: by the verified parent-invite
-- flow". Phase 2 does not exist.
--
-- ⇒ ONBOARDING ONE REAL FAMILY REQUIRES A DEVELOPER WITH PRODUCTION DATABASE
--   CREDENTIALS. That is the actual state of the parent portal today: six
--   routes, a whole data layer, and no way to create the one row that makes any
--   of it visible.
--
-- And in reverse: because the sole policy scopes to parent_profile_id, A MINOR
-- CANNOT SEE WHICH ADULTS HAVE ACCESS TO THEIR RECORD, and has no way to ask for
-- one to be removed. On a platform for children, "who can see my data" must be
-- answerable by the child. counsellor_assignments (20260801122000) was written
-- with bidirectional visibility for exactly this reason; this file brings the
-- older table up to that standard.
--
-- ── Ordering constraint (files apply in FILENAME order) ──────────────────────
-- Must sort AFTER:
--   • 20260716120000_guardian_links.sql — the table itself;
--   • 20260801120000_close_counsellor_access_and_split_write_policies.sql —
--     public.is_admin(), called by both write policies (42883 otherwise);
--   • 20260801122000_counsellor_assignments.sql — public.writable_student_ids(),
--     called by the counsellor read policy (42883 otherwise).
-- The 20260802140000 prefix satisfies all three.
--
-- The FK index on guardian_links.student_profile_id — which the new read
-- policies make hot, since they filter on that column — is created by
-- 20260802100000_indexes_extensions_and_rls_gaps.sql, which sorts earlier. If
-- this file is applied WITHOUT that one, the two new read policies work but
-- seq-scan.
--
-- ── NOT recursive, despite appearances ───────────────────────────────────────
-- The counsellor read policy below calls public.writable_student_ids(), and a
-- policy on table X that reads X re-enters X's own RLS and recurses (54001 —
-- the failure 20260713130000 and 20260713160000 were both written to fix).
-- Two independent reasons this is safe, and both are required:
--   1. writable_student_ids() reads counsellor_assignments and auth.uid() ONLY.
--      It does not touch guardian_links. (visible_student_ids() DOES read
--      guardian_links — which is why it is deliberately not used here.)
--   2. Every one of those helpers is SECURITY DEFINER with a pinned search_path,
--      so it executes as the table owner, and a table owner is exempt from RLS
--      unless FORCE ROW LEVEL SECURITY is set. It is not set on any table here.
-- If either fact ever changes, this policy recurses. That is why both are
-- written down.
--
-- ── Reversal ─────────────────────────────────────────────────────────────────
--   drop policy if exists guardian_links_student_read    on guardian_links;
--   drop policy if exists guardian_links_counsellor_read on guardian_links;
--   drop policy if exists guardian_links_admin_insert    on guardian_links;
--   drop policy if exists guardian_links_admin_update    on guardian_links;
--   alter table guardian_links drop constraint if exists guardian_links_not_self;
-- guardian_links_self is restated identically, so reverting is subtractive only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Reads
-- ─────────────────────────────────────────────────────────────────────────────

-- Unchanged in effect. Restated so every rule for this table is visible in one
-- place rather than split across two files three months apart.
drop policy if exists guardian_links_self on guardian_links;
create policy guardian_links_self on guardian_links
  for select to authenticated
  using (parent_profile_id = (select auth.uid()));

-- NEW: the student sees who has access to their own record.
drop policy if exists guardian_links_student_read on guardian_links;
create policy guardian_links_student_read on guardian_links
  for select to authenticated
  using (student_profile_id = (select auth.uid()));

-- NEW: the student's own counsellor sees the family structure — necessary to
-- know who may be contacted about a minor, and who may not.
-- writable_student_ids() and NOT visible_student_ids(): see the recursion note
-- in the header. It is also the tighter set (assigned counsellors, not
-- guardians), which is the correct scope here — one guardian has no business
-- enumerating another guardian's link to the same child.
drop policy if exists guardian_links_counsellor_read on guardian_links;
create policy guardian_links_counsellor_read on guardian_links
  for select to authenticated
  using (
    student_profile_id in (select public.writable_student_ids())
    or public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Writes — admin only
-- ─────────────────────────────────────────────────────────────────────────────
-- Same posture as counsellor_assignments (20260801122000 §2): an in-app write
-- path for administrators, and nothing for anyone else. A guardian must never be
-- able to assert their own link — that is the whole attack — and a student must
-- never be able to grant an adult access to their own record without an adult in
-- the loop.
--
-- NO DELETE POLICY, deliberately. Revoke by setting status = 'revoked', never by
-- erasing the row: "who had access to this child's record in March" must remain
-- answerable. Section 3 of 20260802130000 audits every write to this table for
-- the same reason.

drop policy if exists guardian_links_admin_insert on guardian_links;
create policy guardian_links_admin_insert on guardian_links
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists guardian_links_admin_update on guardian_links;
create policy guardian_links_admin_update on guardian_links
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A guardian is not their own child
-- ─────────────────────────────────────────────────────────────────────────────
-- Parity with counsellor_assignments_not_self. Cheap, and it forecloses a
-- self-link being used to satisfy is_guardian_of() against yourself — which,
-- once the relationship-scoped policies of plan step 8 land, would be a
-- self-granted read of your own record via a second path. Harmless today,
-- load-bearing later; add it while the table is small.
--
-- NOT VALID then validated, so an existing violating row reports rather than
-- aborting the migration. Future writes are enforced either way.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guardian_links_not_self'
      and conrelid = 'public.guardian_links'::regclass
  ) then
    alter table guardian_links
      add constraint guardian_links_not_self
      check (parent_profile_id <> student_profile_id) not valid;
  end if;
end $$;

do $$
declare
  violations integer;
begin
  select count(*) into violations
  from guardian_links where parent_profile_id = student_profile_id;

  if violations = 0 then
    alter table guardian_links validate constraint guardian_links_not_self;
    raise notice 'guardian_links_not_self validated';
  else
    raise warning 'guardian_links_not_self left NOT VALID — % self-link row(s) exist. '
                  'Inspect them (select * from guardian_links where parent_profile_id = student_profile_id), '
                  'then delete or repair and re-run: alter table guardian_links validate constraint guardian_links_not_self;',
                  violations;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verify
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  -- A write path must now exist. This is the finding: before this file, this
  -- count was ZERO, for every role including admin.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'guardian_links'
    and cmd in ('INSERT', 'UPDATE');
  if n < 2 then
    raise exception 'verification failed: guardian_links still has no admin write path (% write policies)', n;
  end if;

  -- The child must be able to see their own links.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'guardian_links'
      and policyname = 'guardian_links_student_read'
  ) then
    raise exception 'verification failed: guardian_links_student_read is missing';
  end if;

  -- And nobody may erase the history of who had access.
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'guardian_links' and cmd = 'DELETE';
  if n > 0 then
    raise exception 'verification failed: guardian_links has % DELETE policy(ies) — revoke by status, never by deletion', n;
  end if;

  raise notice 'guardian_links parity verified: 3 read policies, 2 admin write policies, 0 delete policies';
end $$;
