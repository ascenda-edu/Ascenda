-- Step 7 — stop `student_matches` growing without bound (F5).
--
-- ⚠️  NOT APPLIED. Written for review by the database audit
--     (docs/audit/12-database-design.md F5 + §3.3 §B, migration plan step 7).
--     Read it, then apply one-off with `npm run db:apply <file>`. Nothing here
--     has been executed against any database.
--
-- ── Class: BREAKING — ship WITH the app change in section 5 ──────────────────
-- The unique index in section 3 turns the current plain `.insert()` in
-- src/lib/matching/service.ts:905 from "always succeeds" into "raises 23505 if
-- the clear did not happen". That is the point — but until service.ts is
-- changed, a rebuild whose DELETE is blocked for any reason now FAILS LOUDLY
-- instead of silently duplicating. Loud is correct and the app must be ready
-- for it.
--
-- Section 1 (the DELETE policy) is what makes that safe: with it in place the
-- clear succeeds, so the insert never collides. Sections 1-4 are therefore
-- self-consistent if applied together, and MUST be applied together — do not
-- cherry-pick the unique index without the policy.
--
-- ── Why this matters ─────────────────────────────────────────────────────────
-- src/lib/matching/service.ts:894-912:
--
--     const { error: deleteError } = await supabase
--       .from('student_matches').delete().eq('profile_id', profileId);
--     if (deleteError) { /* skip rebuild */ } else { /* insert 300+ rows */ }
--
-- The applicable DELETE policies on student_matches are `matches_admin`
-- ((select auth_role()) = 'admin' → false for a student) and NOTHING ELSE:
-- matches_self is FOR SELECT, matches_self_write FOR INSERT, matches_self_update
-- FOR UPDATE. There has never been a DELETE policy.
--
-- POSTGRES DOES NOT ERROR ON AN RLS-FILTERED DELETE. It deletes zero rows and
-- reports success. So `deleteError` is null, the guard passes, and the insert
-- proceeds — on top of everything that was already there.
--
-- FULL_CACHE_LIMIT is 300 (service.ts:49) and a rebuild fires on every cache
-- miss: 24h TTL expiry OR any profile edit (isFreshAgainstProfile, :325). A
-- student who edits their profile ten times in one sitting writes 3,000 rows.
-- Nothing rejects them — there is no unique constraint. Reads survive only
-- because :328 filters on a 5-minute created_at window, over an index
-- (profile_id, score desc) that DOES NOT INCLUDE created_at, so every read
-- fetches the whole accumulated per-profile set and filters it in memory.
--
-- Cost grows monotonically, forever, and the symptom is a /matches page that
-- gets gradually slower for the students who use the product most.
--
-- Migration 20260713130000:11 documents the PREVIOUS incarnation of this: the
-- delete failing loudly with 54001. Fixing that recursion converted a loud
-- failure into a silent one. This file makes it succeed instead.
--
-- ── Ordering constraint (files apply in FILENAME order) ──────────────────────
-- No cross-file dependency: `student_matches` and its policies come from
-- schema.sql, and nothing here calls a helper added on 2026-08-01/02. It is
-- placed after 20260802100000 only so the FK index on student_matches.program_id
-- (added there) exists before section 2's mass DELETE — the de-duplication does
-- not need it, but a cascade triggered mid-window would.
-- MUST run before any migration that adds a foreign key REFERENCING
-- (profile_id, program_id): the unique index in section 3 is the target such a
-- key would need.
--
-- ── Reversal ─────────────────────────────────────────────────────────────────
--   drop index if exists student_matches_profile_program_key;
--   drop index if exists student_matches_profile_created_idx;
--   drop policy if exists matches_self_delete on student_matches;
-- The de-duplication in section 2 is NOT reversible — it deletes stale cache
-- rows. That is acceptable and is why it is scoped to duplicates only: every
-- row it removes is a superseded copy of a row it keeps, and the cache
-- recomputes from scratch on the next miss regardless.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The missing DELETE policy
-- ─────────────────────────────────────────────────────────────────────────────
-- A student may clear their own cache. Nothing else changes: `matches_admin`
-- (FOR ALL) still covers admins, and no counsellor or guardian gets DELETE —
-- there is no product flow in which a third party clears someone's match cache.

drop policy if exists matches_self_delete on student_matches;
create policy matches_self_delete on student_matches
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. De-duplicate before the unique index can be built
-- ─────────────────────────────────────────────────────────────────────────────
-- ORDER IS LOAD-BEARING: `create unique index` on a table that still holds
-- duplicates fails with 23505 and aborts the whole migration. This must run
-- first, and it must remove EVERY duplicate, not most of them.
--
-- The audit sketches this as `... where sm.created_at < keep.created_at`, which
-- leaves ties in place: a batched rebuild writes rows inside ONE transaction, so
-- `timezone('utc', now())` — transaction start time — is IDENTICAL across every
-- row of a batch. `<` never fires between two rows of the same batch, the index
-- build then fails on them, and the migration aborts having already deleted
-- other rows. A row_number() over a TOTAL order (created_at, then id as the
-- tiebreaker) has no ties by construction.
--
-- Newest wins: the surviving row is the most recent computation of that score.

do $$
declare
  removed integer;
begin
  with ranked as (
    select id,
           row_number() over (
             partition by profile_id, program_id
             order by created_at desc, id desc
           ) as rn
    from student_matches
  )
  delete from student_matches sm
  using ranked
  where sm.id = ranked.id and ranked.rn > 1;

  get diagnostics removed = row_count;
  raise notice 'student_matches de-duplication: % stale row(s) removed', removed;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Uniqueness — the constraint that makes duplication impossible
-- ─────────────────────────────────────────────────────────────────────────────
-- A UNIQUE INDEX rather than a UNIQUE CONSTRAINT, for two reasons: `create
-- unique index if not exists` is idempotent (`alter table ... add constraint`
-- is not, and would abort the second CI replay pass), and PostgREST's upsert
-- infers its conflict target from an index, which is what section 5's app change
-- needs.

create unique index if not exists student_matches_profile_program_key
  on student_matches (profile_id, program_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The index the cache read actually needs
-- ─────────────────────────────────────────────────────────────────────────────
-- service.ts:315-321 reads the latest cache stamp (order by created_at desc
-- limit 1) and :341-347 reads `eq(profile_id) + gte(created_at) + order(score
-- desc)`. The only existing index is (profile_id, score desc) — the created_at
-- predicate is a filter-after-fetch over the whole per-profile set. With the
-- unique index above capping that set at one row per programme this stops being
-- unbounded, but the stamp read is still a sort of the entire set without it.

create index if not exists student_matches_profile_created_idx
  on student_matches (profile_id, created_at desc);

analyze student_matches;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. THE REQUIRED APP CHANGE — src/lib/matching/service.ts
-- ─────────────────────────────────────────────────────────────────────────────
-- Two edits, both in `service.ts:894-912`. Neither is optional.
--
-- (a) Stop discarding the DELETE result. A zero-row delete must be treated as a
--     failed clear, which is exactly what it is:
--
--        - const { error: deleteError } = await supabase
--        -   .from('student_matches').delete().eq('profile_id', profileId);
--        + const { data: cleared, error: deleteError } = await supabase
--        +   .from('student_matches').delete().eq('profile_id', profileId)
--        +   .select('id');
--
--     `.select('id')` makes PostgREST return the deleted rows, so `cleared`
--     distinguishes "nothing was cached" from "the delete was silently filtered
--     away". Without it this whole class of bug is invisible again the next time
--     a policy changes — which is how it survived from 20260713130000 to now.
--
-- (b) The insert becomes an upsert on the new unique key, so a partially-cleared
--     cache converges instead of raising 23505:
--
--        - const { error: insertError } = await supabase
--        -   .from('student_matches').insert(batch);
--        + const { error: insertError } = await supabase
--        +   .from('student_matches')
--        +   .upsert(batch, { onConflict: 'profile_id,program_id' });
--
--     `onConflict` must name the columns in the SAME ORDER as the index in
--     section 3 — PostgREST passes the string through to ON CONFLICT (…), and a
--     mismatched order infers no index and fails at 42P10.
--
-- Note the failure mode this file deliberately does NOT paper over: with (a) in
-- place and the DELETE policy applied, a zero-row clear on a profile that HAS
-- cached rows now means the policy did not apply. Log it loudly rather than
-- proceeding — the whole finding is that the previous code proceeded.

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Verify
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  dupes integer;
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'student_matches'
      and policyname = 'matches_self_delete' and cmd = 'DELETE'
  ) then
    raise exception 'verification failed: matches_self_delete is missing or is not a DELETE policy';
  end if;

  if to_regclass('public.student_matches_profile_program_key') is null then
    raise exception 'verification failed: student_matches_profile_program_key was not created';
  end if;

  select count(*) into dupes from (
    select 1 from student_matches
    group by profile_id, program_id having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception 'verification failed: % duplicate (profile_id, program_id) pair(s) remain', dupes;
  end if;

  raise notice 'student_matches: delete policy present, uniqueness enforced, 0 duplicates';
end $$;
