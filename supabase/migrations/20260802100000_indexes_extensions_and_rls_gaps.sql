-- Step 1 (remainder) — schema reconciliation: the extension, the index coverage,
-- and the two tables whose RLS is missing entirely.
--
-- ⚠️  NOT APPLIED. Written for review by the database audit
--     (docs/audit/12-database-design.md §3.5, migration plan step 1). Read it,
--     then apply one-off with `npm run db:apply <file>`. Nothing in this file has
--     been executed against any database — there is no Postgres in the authoring
--     environment, so every statement here is reasoned, not observed.
--
-- ── Class: SAFE ──────────────────────────────────────────────────────────────
-- No policy is loosened, no column is dropped, no data is modified, and after
-- the 2026-08-02 split NOTHING here is destructive: the four `drop index`
-- statements this file used to carry now live in
-- 20260802150000_drop_redundant_indexes.sql, which is optional and is meant to
-- be run separately. See section 5 and the locking note.
--
-- ── App change required: NONE ────────────────────────────────────────────────
-- Every statement is invisible to `src/`. It changes plans, not results.
--
-- ── Why this matters ─────────────────────────────────────────────────────────
-- 1. POSTGRES DOES NOT AUTO-INDEX FOREIGN KEYS. 14 of this schema's FKs have no
--    index. Two costs, both live: the app's own joins seq-scan (applications ↔
--    programs is on 4 hot paths, 02-data-layer HIGH), and every DELETE on the
--    PARENT table seq-scans the child to enforce the cascade — on `programs`,
--    that is a 119k-row table scanned once per referencing table per deleted row.
-- 2. `cities` HAS NO RLS IN schema.sql. `alter table cities enable row level
--    security` exists only in 20260719120000. A database built from the declared
--    file of record — a preview branch, a new laptop, the CI `database` job —
--    comes up with `cities` writable by the anon key that ships in the browser
--    bundle. That is the exact hole 20260719120000 was written to close,
--    reintroduced by anyone who provisions from schema.sql. This file closes it
--    in a migration so the fix survives regardless of which file built the DB.
-- 3. `archive_raw_courses` / `archive_raw_universities` are in the generated
--    types (src/lib/types/database.ts:167,316) and were created by
--    20250308120000, but appear in no schema file and their RLS status is
--    unverifiable from the repo. They hold raw imported catalogue data. If RLS
--    is off there, they are anon-readable and anon-writable.
-- 4. Every free-text search in `src/` is a LEADING-wildcard `ilike '%term%'`.
--    A btree index cannot serve one. `idx_programs_course_name` and
--    `idx_universities_name` are btrees, so the search page seq-scans 119k rows
--    per keystroke-debounced query. pg_trgm is already installed on the remote
--    (the generated types expose show_trgm/show_limit, database.ts:2005) but is
--    declared in NO sql file and used by NO index.
--
-- ── Ordering constraint (files apply in FILENAME order) ──────────────────────
-- Must sort AFTER 20260801115000_admin_helper_and_verb_split.sql, which defines
-- public.is_admin(). (It was 20260801120000 until that file was split on
-- 2026-08-03; the helper moved to the earlier, posture-independent half so it
-- could be applied without closing the counsellor portal.) The policies below call
-- it. Sorting this file earlier would abort the replay with 42883 on a fresh
-- database — the failure mode this repo hit three times on 2026-08-01.
-- It must also sort after 20260716120000 (guardian_links) and 20260801130000
-- (student_activities / simulation_results); the 20260802 prefix satisfies all
-- three.
-- No dependency on 20260801122000's helpers (visible_student_ids et al.) — this
-- file deliberately adds no relationship-scoped policy.
--
-- ── Reversal ─────────────────────────────────────────────────────────────────
--   • Indexes:    `drop index if exists <name>;` for each created below.
--   • cities RLS: `alter table cities disable row level security;` (do not —
--     see 20260719120000).
--   • pg_trgm: `drop extension pg_trgm cascade;` — CASCADE also drops the three
--     gin indexes below. It is already present on the remote; leave it.
--   • The four index DROPS that used to live here have moved to
--     20260802150000_drop_redundant_indexes.sql; their reversal is in that file.
--
-- ── Locking note — MEASURED, and the reason this file was split ──────────────
-- `npm run db:apply` sends the whole file as ONE simple query (scripts/apply-sql
-- .ts:46 → client.query(sql)), which node-pg wraps in an implicit transaction.
-- CREATE INDEX CONCURRENTLY is therefore IMPOSSIBLE through that path, and every
-- lock the file takes is held until COMMIT rather than released per statement —
-- so `programs`, `universities`, `notifications`, `profiles`, `applications`,
-- `student_matches`, `deadlines` and ~8 more are write-locked simultaneously for
-- the whole run.
--
-- Timed on a local Postgres 16.14 loaded to real scale (119,000 programs, 2,900
-- universities, warm cache, NVMe):
--
--     idx_programs_course_name_trgm  (gin trgm, 119k)     2,403 ms
--     idx_universities_name_trgm     (gin, 2.9k)            249 ms
--     idx_universities_country_trgm  (gin, 2.9k)              6 ms
--     idx_programs_university_course_id (btree, 3 cols)     629 ms
--     idx_programs_study_level_id                           281 ms
--     idx_programs_tuition_id        (partial)              274 ms
--     analyze programs                                      131 ms
--     ── whole file, one transaction ──                  11,638 ms
--
-- ⏱  EXPECT 30–60 SECONDS ON SUPABASE. Shared/burstable compute with a cold
--    cache is comfortably 3–5× local NVMe. Budget a minute of blocked catalogue
--    WRITES.
--
-- ⛔ LOCK CLASS, precisely — the earlier blanket "reads are unaffected" was wrong:
--      • programs / universities — SHARE (create index). WRITES block, reads do
--        not. That is the whole point of the split; the read-blocking DROP INDEX
--        statements are in 20260802150000 now.
--      • cities — ACCESS EXCLUSIVE. `alter table … enable row level security` and
--        the policy DDL in section 2 take it, in section 2, i.e. EARLY, and hold
--        it for the whole 30–60 s run. READS OF `cities` BLOCK for that window.
--      • archive_raw_courses / archive_raw_universities — ACCESS EXCLUSIVE, same
--        reason, same window, where those tables exist.
--    The mitigation is that nothing reads them from the app: `grep -r "from('cities')"
--    src/` finds nothing, and neither archive table is read anywhere. A direct
--    psql session or a dashboard query against cities during the run WILL hang.
--
-- The catalogue is written only by the admin import, so a maintenance window is
-- not required. If you want zero write blocking, run the `programs`/
-- `universities` index statements by hand through psql with CONCURRENTLY added,
-- outside any transaction, and then re-run this file — every statement is
-- `if not exists`, so it will skip them.
--
-- Deliberately NO `set lock_timeout` here: a timeout fired late in a 30–60 s
-- transaction throws away every index built so far, because the rollback is
-- all-or-nothing. If you need one, set it in the SESSION before applying, and
-- expect to retry. The file that DOES need one — and has one — is 20260802150000.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pg_trgm
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase installs extensions into the `extensions` schema, not `public`;
-- stock Postgres (the CI `database` job) has no such schema. Branch on it rather
-- than hardcoding either, so this file replays in both environments. The
-- operator class below is then resolved from pg_extension rather than assumed
-- to be on the search_path — `gin_trgm_ops` is unqualified in every example
-- online and silently fails with 42704 when the extension lives elsewhere.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      execute 'create extension pg_trgm with schema extensions';
    else
      execute 'create extension pg_trgm';
    end if;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS gaps: cities, and the two legacy archive tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Restated from 20260719120000 with drop-then-create instead of that file's
-- `if not exists (… policyname = …)` guard. That guard is the direct cause of
-- F9: it tests a policy's EXISTENCE, not its DEFINITION, so the intended
-- `to public using (true)` policies for programs/universities matched the
-- differently-defined policies schema.sql had already created and were silently
-- skipped. Only the genuinely-new cities policies actually applied.
--
-- Scope note: this file re-asserts CITIES only. programs_read_all /
-- universities_read_all are left exactly as they are — reconciling those two
-- means deciding whether anonymous catalogue browsing is a product requirement
-- (F9), which is a product call, not a schema call, and it belongs in its own
-- migration with its own rollback.

alter table public.cities enable row level security;

drop policy if exists cities_read_all on public.cities;
create policy cities_read_all on public.cities
  for select to public using (true);

drop policy if exists cities_admin on public.cities;
create policy cities_admin on public.cities
  for all to public
  using ((select public.auth_role()) = 'admin')
  with check ((select public.auth_role()) = 'admin');

-- Archive tables: present on the remote per the generated types, absent from
-- every schema file. to_regclass guards mean this block is a no-op wherever they
-- do not exist (a database built from schema.sql), and closes them wherever they
-- do (production).
do $$
declare
  t text;
begin
  foreach t in array array['archive_raw_courses', 'archive_raw_universities']
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_admin', t);
      execute format(
        'create policy %I on public.%I for all to authenticated '
        'using (public.is_admin()) with check (public.is_admin())',
        t || '_admin', t);
      raise notice 'archive table %: RLS enabled, admin-only policy applied', t;
    else
      raise notice 'archive table % not present — skipped', t;
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The 14 unindexed foreign keys
-- ─────────────────────────────────────────────────────────────────────────────
-- Two of the fourteen (deadlines.program_id, application_checklist.application_id)
-- are covered by the leading column of a composite in section 4 — a composite
-- (a, b) serves every query a single-column (a) index would. Do NOT add
-- single-column twins for those two; a redundant index is pure write cost.

create index if not exists idx_deadlines_source
  on deadlines (source_id);                          -- cascade set-null on sources

create index if not exists idx_application_tasks_program
  on application_tasks (program_id);                 -- master-task lookup + cascade

create index if not exists idx_student_matches_program
  on student_matches (program_id);                   -- cascade on a growing table (F5)

create index if not exists idx_applications_program
  on applications (program_id);                      -- the applications↔programme join, 4 sites

-- ⛔ `if not exists` guards the INDEX, not the TABLE. `shortlisted_programs` is
--    the one table in this schema whose existence on the remote is genuinely
--    unknown: CLAUDE.md marks it "may not exist on the remote DB", MIGRATIONS.md
--    row 33 flags its migration 🟡 "probe this one", and BOTH runtime call sites
--    feature-detect it and fall back to localStorage on 42P01
--    (src/lib/shortlist/shortlist-store.ts, src/lib/shortlist/server.ts). An
--    unguarded reference aborts the whole file at 42P01 — reproduced against
--    Postgres 16.14 by dropping the table and replaying:
--      20260802100000_...sql:169  ERROR: relation "shortlisted_programs" does not exist
--    Same to_regclass shape as the archive tables above, for the same reason.
do $$
begin
  if to_regclass('public.shortlisted_programs') is not null then
    execute 'create index if not exists idx_shortlisted_program '
            'on public.shortlisted_programs (program_id)';   -- "is this shortlisted" probes
    raise notice 'idx_shortlisted_program created (shortlisted_programs is present)';
  else
    raise notice 'shortlisted_programs is not present — idx_shortlisted_program skipped. '
                 'If 20260724100000 is later applied, re-run this file to pick the index up.';
  end if;
end $$;

create index if not exists idx_help_messages_author
  on help_messages (author_profile_id);              -- cascade on profile delete

create index if not exists idx_help_notes_author
  on help_notes (author_profile_id);                 -- cascade

create index if not exists idx_help_meetings_counsellor
  on help_meetings (counsellor_profile_id, scheduled_for);  -- cascade + counsellor calendar

create index if not exists idx_counsellor_notes_author
  on counsellor_notes (author_profile_id);           -- cascade

create index if not exists idx_guardian_links_student
  on guardian_links (student_profile_id, status);    -- the student/admin lookup direction

create index if not exists idx_deck_programs_program
  on counsellor_deck_programs (program_id);          -- cascade

create index if not exists idx_deck_assignments_assigned_by
  on deck_assignments (assigned_by);                 -- cascade set-null

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Query-shape indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- Each is named against the query it serves. An index with no query is write
-- amplification (see section 5).

-- Covers deadlines.program_id (FK 13/14) AND counsellor/data.ts:306-309, which
-- filters by program_id and orders by deadline_date on five counsellor pages.
create index if not exists idx_deadlines_program_date
  on deadlines (program_id, deadline_date);

-- Covers application_checklist.application_id (FK 14/14) AND the checklist_self
-- RLS predicate itself, which is a correlated `exists` on this column — today an
-- unindexed one, so every checklist row check seq-scans.
create index if not exists idx_checklist_application_due
  on application_checklist (application_id, due_date);

-- The unread-badge poll, which runs on a backoff timer on every page.
-- Partial: the badge only ever asks for unread rows, so the index stays small
-- and does not grow with read history.
create index if not exists idx_notifications_unread
  on notifications (profile_id, audience, created_at desc)
  where read_at is null;

-- The priority board and every counsellor status rollup.
create index if not exists idx_applications_profile_status
  on applications (profile_id, status);

-- /counsellor/inbox once threads are claimed.
create index if not exists idx_help_requests_counsellor_status
  on help_requests (counsellor_profile_id, status, created_at desc);

-- `.eq('role','student')` with no limit on three counsellor paths
-- (counsellor/data.ts:230, :523, :760).
create index if not exists idx_profiles_role
  on profiles (role);

-- middleware.ts:152-155 runs four profile_id lookups per request on a cookie
-- cache miss — the highest-frequency queries in the product. The existing
-- single-column student_subjects_profile_id_idx / student_admissions_tests_
-- profile_id_idx are superseded by these (leading column identical); they are
-- NOT dropped here, because dropping an index the planner may currently be
-- using is a separate, observable change — see section 5's standard.
create index if not exists idx_student_subjects_profile_created
  on student_subjects (profile_id, created_at);
create index if not exists idx_student_admissions_profile_created
  on student_admissions_tests (profile_id, created_at);

create index if not exists idx_documents_application_uploaded
  on documents (application_id, uploaded_at desc);

create index if not exists idx_counsellor_notes_student_type
  on counsellor_notes (student_profile_id, note_type, created_at desc);

create index if not exists idx_help_meetings_student_status
  on help_meetings (student_profile_id, status, scheduled_for);

create index if not exists idx_help_messages_request_role
  on help_messages (request_id, author_role, created_at desc);

-- Programme search pagination. Every programs query in src/ ends `.order('id')`
-- as a unique tiebreaker, so `id` must be the trailing sort key or the planner
-- fetches the range and re-sorts it — the exact shape 20260713120000 added
-- (field, id) to fix after the 8s statement timeout (57014) started firing.
create index if not exists idx_programs_university_course_id
  on programs (university_id, course_name, id);      -- ranking-cohort path, 8 uni ids/page
create index if not exists idx_programs_study_level_id
  on programs (study_level, id);
create index if not exists idx_programs_tuition_id
  on programs (yearly_international_tuition_fee_gbp, id)
  where yearly_international_tuition_fee_gbp is not null;  -- sort uses nullsFirst:false

-- Trigram indexes for the leading-wildcard ilike searches.
--
-- The opclass is resolved from pg_extension rather than written as a bare
-- `gin_trgm_ops`: on Supabase pg_trgm lives in the `extensions` schema, and an
-- unqualified opclass reference resolves against the CURRENT search_path, which
-- for the migration role may not include it. Getting this wrong fails at 42704
-- ("operator class does not exist") on the remote while passing in stock
-- Postgres — a difference no CI job here would catch.
do $$
declare
  ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if ext_schema is null then
    raise exception 'pg_trgm is not installed — section 1 of this migration did not take effect';
  end if;

  execute format(
    'create index if not exists idx_programs_course_name_trgm '
    'on programs using gin (course_name %I.gin_trgm_ops)', ext_schema);
  execute format(
    'create index if not exists idx_universities_name_trgm '
    'on universities using gin (name %I.gin_trgm_ops)', ext_schema);
  -- The assistant's get_university_info tool does an ilike on country through a
  -- !inner embed, which cannot use idx_universities_country (btree, equality).
  execute format(
    'create index if not exists idx_universities_country_trgm '
    'on universities using gin (country %I.gin_trgm_ops)', ext_schema);

  raise notice 'trigram indexes created using opclass schema %', ext_schema;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Redundant indexes — MOVED OUT (see 20260802150000_drop_redundant_indexes)
-- ─────────────────────────────────────────────────────────────────────────────
-- This section used to hold four `drop index` statements. They have been split
-- into their own file, deliberately, because they have a different LOCK CLASS
-- from everything above:
--
--   • `create index` takes SHARE on the table. It blocks WRITES. The catalogue
--     is written only by the admin import, so that is tolerable.
--   • `drop index` takes ACCESS EXCLUSIVE on the PARENT table. It blocks READS.
--     And because db:apply sends the whole file as ONE implicit transaction,
--     that lock would be acquired late and held to COMMIT — while ~15 other
--     tables are already locked by the statements above. One in-flight SELECT on
--     `programs` makes the drop wait, the Postgres lock queue is FIFO, and every
--     subsequent catalogue query then queues behind the pending ACCESS
--     EXCLUSIVE. That is a full catalogue stall in a codebase whose own
--     migration headers record hitting the 8 s statement timeout (57014) before.
--
-- Keeping them here would mean this file could not be applied at all without a
-- CATALOGUE read-outage window. Split, this file blocks only catalogue WRITES —
-- see the lock-class note in the header for the one exception, `cities` and the
-- archive tables, which section 2 does take ACCESS EXCLUSIVE on — and the drops
-- can wait for a quiet moment, or never happen, at no correctness cost.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Refresh planner statistics
-- ─────────────────────────────────────────────────────────────────────────────
-- New indexes are useless until the planner has stats that make it choose them.
-- ANALYZE is transaction-safe (unlike VACUUM), so it is fine inside the implicit
-- transaction db:apply creates.

analyze programs;
analyze universities;
analyze student_matches;
analyze applications;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Verify
-- ─────────────────────────────────────────────────────────────────────────────
-- The pattern 20260718130000:65-79 establishes: a security migration that can
-- silently no-op is worse than one that fails, because it reads as though it
-- worked. F9 is what a missing verification block costs.

do $$
declare
  missing text[] := '{}';
  ix      text;
  n       integer;
begin
  -- idx_shortlisted_program is NOT in this list: its table may legitimately be
  -- absent (see section 3). It is asserted conditionally below instead, so this
  -- block cannot fail for the one reason that is not a defect.
  foreach ix in array array[
    'idx_deadlines_source', 'idx_application_tasks_program', 'idx_student_matches_program',
    'idx_applications_program', 'idx_help_messages_author',
    'idx_help_notes_author', 'idx_help_meetings_counsellor', 'idx_counsellor_notes_author',
    'idx_guardian_links_student', 'idx_deck_programs_program', 'idx_deck_assignments_assigned_by',
    'idx_deadlines_program_date', 'idx_checklist_application_due',
    'idx_programs_course_name_trgm', 'idx_universities_name_trgm', 'idx_universities_country_trgm'
  ]
  loop
    if to_regclass(format('public.%I', ix)) is null then
      missing := missing || ix;
    end if;
  end loop;

  -- Conditional, and it still ASSERTS: if the table is there, the index must be.
  -- Skipping the assertion outright would let a genuine failure pass as "absent".
  if to_regclass('public.shortlisted_programs') is not null
     and to_regclass('public.idx_shortlisted_program') is null then
    -- ::text is load-bearing: `text[] || 'literal'` with an unknown-typed literal
    -- resolves to the array||array operator and fails at 22P02.
    missing := missing || 'idx_shortlisted_program'::text;
  end if;

  if array_length(missing, 1) > 0 then
    raise exception 'verification failed: index(es) not created: %', array_to_string(missing, ', ');
  end if;

  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'cities' and c.relrowsecurity;
  if n <> 1 then
    raise exception 'verification failed: RLS is not enabled on cities';
  end if;

  raise notice 'step 1 remainder verified: 16 required indexes present (+ idx_shortlisted_program '
               'if its table exists), cities RLS on';
end $$;
