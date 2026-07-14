-- Fix infinite recursion in the counsellor_decks RLS policies.
--
-- The original policies (20260713150000) formed a cycle:
--   • counsellor_decks_select referenced deck_assignments in a subquery
--   • deck_assignments_write was declared FOR ALL, so it also applied to
--     SELECT, and its USING clause referenced counsellor_decks
--   → evaluating either table's RLS re-entered the other's, so Postgres
--     aborted every query (including the INSERT ... RETURNING behind
--     "create deck") with "infinite recursion detected in policy".
--
-- Fix: route every cross-table check through SECURITY DEFINER helper
-- functions. Owned by postgres, their internal subqueries bypass RLS, so the
-- policies no longer re-enter each other. Same pattern as can_act_as_counsellor().
--
-- Applied one-off via `npm run db:apply <file>` — idempotent and self-contained.

-- ── 1. SECURITY DEFINER membership helpers (RLS-bypassing) ──────────────────────

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

-- ── 2. counsellor_decks — no longer inlines the deck_assignments subquery ───────

drop policy if exists counsellor_decks_select on counsellor_decks;
create policy counsellor_decks_select on counsellor_decks
  for select to authenticated
  using (
    (select public.can_act_as_counsellor())
    or (select public.deck_assigned_to_me(counsellor_decks.id))
  );

-- insert/update/delete policies from 20260713150000 are self-contained
-- (they only touch counsellor_decks columns) and don't recurse — left as is.

-- ── 3. counsellor_deck_programs — check ownership/assignment via helpers ────────

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

-- ── 4. deck_assignments — check ownership via helper (was the recursion source) ─

-- select policy from 20260713150000 is self-contained; recreate for clarity.
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
