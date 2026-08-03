-- Step 1 (tail) — the four redundant indexes, dropped. Split out of
-- 20260802100000_indexes_extensions_and_rls_gaps.sql on 2026-08-02.
--
-- ⚠️  NOT APPLIED. Written for review by the database audit
--     (docs/audit/12-database-design.md §3.5, migration plan step 1). Nothing
--     here has been executed against any database.
--
-- ── Class: SAFE, but the ONLY read-blocking file in the set ──────────────────
-- Nothing is loosened and no data changes. What makes it different from every
-- other file here is the LOCK CLASS:
--
--   `drop index` needs ACCESS EXCLUSIVE on the PARENT TABLE, which blocks
--   READS as well as writes — unlike `create index`, which takes SHARE and
--   blocks writes only.
--
-- The drops themselves are instant (a catalogue delete and an unlink). The
-- danger is the WAIT. `programs` is queried on every search keystroke; one
-- in-flight SELECT makes the drop queue, the Postgres lock queue is FIFO, and
-- every catalogue query that arrives after it then queues behind the pending
-- ACCESS EXCLUSIVE. A drop that takes 1 ms of work can stall the catalogue for
-- as long as the longest in-flight query — in a codebase whose own migration
-- headers record having hit the 8 s statement timeout (57014) before.
--
-- ⏱  EXPECTED DURATION: milliseconds of work. Worst case is bounded by the
--    `lock_timeout` below, so the true worst case is ~12 s of degraded
--    catalogue latency followed by a clean rollback and nothing dropped.
--
-- ── WHY THIS IS A SEPARATE FILE ──────────────────────────────────────────────
-- `npm run db:apply` sends a file as ONE implicit transaction, so inside
-- 20260802100000 these four statements would have acquired ACCESS EXCLUSIVE late
-- and held it to COMMIT, alongside ~15 tables already locked by that file's
-- index builds — turning a 30–60 s write-blocking window into a 30–60 s
-- catalogue OUTAGE. Split, 20260802100000 can be applied whenever, and this file
-- waits for a quiet moment. It can also simply never be applied: four redundant
-- indexes cost write amplification on catalogue imports, nothing else.
--
-- ── App change required: NONE ────────────────────────────────────────────────
-- No query in src/ can use any of these four. That is the reason each is being
-- dropped, and each claim is restated at the statement.
--
-- ── Ordering constraint (files apply in FILENAME order) ──────────────────────
-- NONE, in the dependency sense — nothing here calls a function, reads a policy,
-- or references a table created by any file in this directory. All four indexes
-- come from supabase/schema.sql (:864-880).
--
-- It is numbered LAST on purpose, which is an OPERATIONAL constraint, not a
-- dependency one:
--   • the covering indexes it checks for come from 20260713120000 and
--     20260724100000 (both earlier, both already on the remote);
--   • it should be the last thing you do, in its own window, after the rest of
--     the set has been applied and observed — not interleaved with them.
-- Applying it earlier, later, or never all produce the same end state.
--
-- ── Reversal ─────────────────────────────────────────────────────────────────
-- Re-create from the definitions quoted above each drop (they are transcribed
-- from supabase/schema.sql). Prefer CONCURRENTLY, outside a transaction:
--   create index concurrently idx_programs_field_of_study on programs(field);
--   create index concurrently idx_programs_degree_type on programs(name);
--   create index concurrently idx_programs_university_life_override
--     on programs(university_life_override);
--   create index concurrently idx_universities_ranks
--     on universities(qs_uk_rank, times_sunday_rank, guardian_rank);

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Back off rather than queue the world behind us
-- ─────────────────────────────────────────────────────────────────────────────
-- If the ACCESS EXCLUSIVE lock is not available within 3 s, fail with 55P03 and
-- roll back — leaving the catalogue untouched — instead of holding a queue
-- position that stalls every query arriving behind it. Retrying later is free.
--
-- Plain `set`, not `set local`: `set local` outside a transaction block only
-- WARNs and does nothing, and this file is run both ways (db:apply wraps it in
-- an implicit transaction; a human may paste it into the SQL editor). Session
-- scope is correct in both, and the connection is discarded afterwards.
--
-- If you see 55P03: the catalogue was busy. Nothing was dropped. Run it again in
-- a quieter minute.
set lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The four drops
-- ─────────────────────────────────────────────────────────────────────────────
-- Standard applied: drop only where another index provably serves every query
-- the dropped one could, or where NO query in src/ uses the column as a
-- predicate at all. Every index costs a write on all 119k rows of `programs` on
-- every catalogue import.
--
-- Each drop is GUARDED on its covering index actually being present. The repo
-- cannot prove what is on the remote (MIGRATIONS.md opens by saying the history
-- diverged), and 20260724100000 — which creates idx_programs_field_tuition — is
-- marked 🟡 "probe this one". Dropping an index because a covering one "exists"
-- when it does not is how a 119k-row seq-scan gets introduced by a migration
-- whose header says SAFE. Where the cover is missing this file SKIPS and says
-- so, loudly, instead of proceeding.

do $$
declare
  dropped text[] := '{}';
  skipped text[] := '{}';
begin
  -- ── idx_programs_field_of_study ──
  -- schema.sql: create index idx_programs_field_of_study on programs(field);
  -- Covered by idx_programs_field_id (field, id) from 20260713120000 and
  -- idx_programs_field_tuition (field, tuition) from 20260724100000 — a
  -- composite leading on `field` serves every query a single-column (field)
  -- index could. Three indexes lead on one column today.
  if to_regclass('public.idx_programs_field_of_study') is null then
    skipped := skipped || 'idx_programs_field_of_study (already absent)'::text;
  elsif to_regclass('public.idx_programs_field_id') is null
    and to_regclass('public.idx_programs_field_tuition') is null then
    skipped := skipped || 'idx_programs_field_of_study (NO covering index on programs(field) — kept)'::text;
  else
    execute 'drop index public.idx_programs_field_of_study';
    dropped := dropped || 'idx_programs_field_of_study'::text;
  end if;

  -- ── idx_programs_degree_type ──
  -- schema.sql: create index idx_programs_degree_type on programs(name);
  -- `programs.name` is the nullable legacy twin of course_name. No query in src/
  -- filters or sorts on it, so there is nothing to cover — no guard applies.
  if to_regclass('public.idx_programs_degree_type') is null then
    skipped := skipped || 'idx_programs_degree_type (already absent)'::text;
  else
    execute 'drop index public.idx_programs_degree_type';
    dropped := dropped || 'idx_programs_degree_type'::text;
  end if;

  -- ── idx_programs_university_life_override ──
  -- schema.sql: create index idx_programs_university_life_override
  --               on programs(university_life_override);
  -- btree on a free-text column, never used as a predicate. Nothing to cover.
  if to_regclass('public.idx_programs_university_life_override') is null then
    skipped := skipped || 'idx_programs_university_life_override (already absent)'::text;
  else
    execute 'drop index public.idx_programs_university_life_override';
    dropped := dropped || 'idx_programs_university_life_override'::text;
  end if;

  -- ── idx_universities_ranks ──
  -- schema.sql: create index idx_universities_ranks
  --               on universities(qs_uk_rank, times_sunday_rank, guardian_rank);
  -- The app sorts on rank_overall. The two trailing columns of this composite
  -- are unusable independently and nothing filters on qs_uk_rank alone — but the
  -- LEADING column is still indexable, so require the rank_overall index the app
  -- actually uses to exist before removing this one.
  if to_regclass('public.idx_universities_ranks') is null then
    skipped := skipped || 'idx_universities_ranks (already absent)'::text;
  elsif to_regclass('public.idx_universities_rank_overall') is null then
    skipped := skipped || 'idx_universities_ranks (idx_universities_rank_overall missing — kept)'::text;
  else
    execute 'drop index public.idx_universities_ranks';
    dropped := dropped || 'idx_universities_ranks'::text;
  end if;

  if array_length(dropped, 1) > 0 then
    raise notice 'dropped: %', array_to_string(dropped, ', ');
  end if;
  if array_length(skipped, 1) > 0 then
    raise notice 'skipped: %', array_to_string(skipped, ', ');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Verify
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent by construction: every drop is guarded on presence, so a second
-- run reports four "already absent" skips and changes nothing.
--
-- This block asserts the SAFETY property, not the drops — a skip is a legitimate
-- outcome and must not fail the migration. What must never be true is that
-- programs(field) ended up with no index at all.

do $$
begin
  if to_regclass('public.idx_programs_field_of_study') is null
     and to_regclass('public.idx_programs_field_id') is null
     and to_regclass('public.idx_programs_field_tuition') is null then
    raise exception
      'verification failed: programs(field) now has NO index. Restore with '
      'create index concurrently idx_programs_field_of_study on programs(field);';
  end if;

  raise notice 'redundant index drops verified: programs(field) is still indexed';
end $$;
