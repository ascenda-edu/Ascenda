#!/usr/bin/env bash
#
# The `database` gate: prove this repo can still build a database, and that the
# migrations an operator is about to run by hand are safely re-runnable.
#
# Run by `.github/workflows/ci.yml` (job `database`) and, against a throwaway
# local cluster, by `scripts/ci-db-local.sh`. Both call THIS script, so "it
# passes locally" and "it passes in CI" cannot mean two different things.
#
# Connection comes from the standard PG* environment variables
# (PGHOST/PGPORT/PGUSER/PGPASSWORD). Nothing here reads .env, and nothing here
# can reach the production project: it creates and drops its own databases.
#
# What it asserts, in order:
#   1. `supabase/schema.sql` builds a database from scratch, on top of the
#      Supabase stubs in `scripts/ci-db-stub.sql`.
#   2. Every migration NOT in the not-replayable ledger below applies cleanly on
#      top of that schema, and applies again with no error (idempotency —
#      required, because migrations are applied one-off via `npm run db:apply`
#      with no ledger of what has already run).
#   3. Every migration that IS in the ledger still genuinely fails to replay.
#      Without this the ledger would be a place to hide failures; with it, the
#      only way to add an entry is for the file to actually be unreplayable, and
#      fixing a listed file turns the job red until the entry is removed.
#   4. Skipping the ledger files loses nothing: the objects they create are
#      present anyway (§ "post-conditions" below).
#   5. The replay is NON-DESTRUCTIVE — pass 2 does not delete columns or rows
#      that pass 1 created (§ "replay is non-destructive" below).
#
# ⚠️  WHY 5 EXISTS. "Idempotent" was read here as "applies twice with no error",
#     and that is the wrong sense. `drop type … cascade` raises NOTHING and
#     returns 0 — while dropping every COLUMN of that type and all of its data.
#     20250214120000_student_intake_profile.sql opened with 14 of them, and
#     replaying it deleted 17 columns across the five student_* tables (58 → 41),
#     `english_status` among them. This script certified that as idempotent for
#     as long as it only checked exit codes. An exit code is not evidence that a
#     database still contains what it contained.
#
set -euo pipefail

cd "$(dirname "$0")/.."

DB_BASE="${DB_BASE:-ascenda_ci_base}"
DB_MAIN="${DB_MAIN:-ascenda_ci}"

# ── The not-replayable ledger ──────────────────────────────────────────────
#
# Migrations that CANNOT be replayed onto a database that already reflects them.
# All three are PRE-EXISTING and already applied to production; none is part of
# the unapplied set under review. Each entry must be justified here, and step 3
# above proves each one still fails — an entry that stops being true reddens
# this job.
#
# The fix for the two `alter publication` files does NOT belong in the files
# themselves: they are already applied, so editing them would rewrite a
# historical record without changing any database. It belongs in a forward
# migration — and `20260718130000_realtime_publication_and_doc_nudge_limits.sql`
# is already exactly that, publishing every table the client subscribes to
# behind a `pg_publication_tables` guard. Their unguarded lines are superseded,
# not unfixed.
#
NOT_REPLAYABLE=(
  # 20250308120000_normalize_course_catalog.sql USED to be listed here. It is now
  # in supabase/migrations/_applied_archive/ — out of this glob entirely — because
  # it is DESTRUCTIVE on replay, not merely non-idempotent, and a standing
  # exception for a file that must never run is an exception someone eventually
  # mistakes for a place to hide a broken migration. See that directory's README.


  # `:52-53` — bare `alter publication supabase_realtime add table help_requests`
  # / `notifications`, with no `pg_publication_tables` guard. Errors with
  # `relation ... is already member of publication` on any database where those
  # tables are already published, which `schema.sql:1501-1516` makes true. Every
  # other statement in the file is `if not exists`.
  20260512120000_help_requests_and_notifications.sql

  # `:63-65` — the same unguarded `alter publication` for `help_messages`,
  # `help_notes`, `help_meetings`. Same failure, same reason.
  20260513120000_help_thread_tables.sql
)

psql_run() { psql -v ON_ERROR_STOP=1 -q "$@"; }

echo "::group::stub + schema.sql"
dropdb --if-exists "$DB_BASE"
dropdb --if-exists "$DB_MAIN"
createdb "$DB_BASE"
psql_run -d "$DB_BASE" -f scripts/ci-db-stub.sql
psql_run -d "$DB_BASE" -f supabase/schema.sql
echo "schema.sql built a database from scratch."
echo "::endgroup::"

is_ledgered() {
  local name="$1" f
  for f in "${NOT_REPLAYABLE[@]}"; do [ "$f" = "$name" ] && return 0; done
  return 1
}

# Fail loudly on a stale ledger entry rather than silently skipping nothing.
for f in "${NOT_REPLAYABLE[@]}"; do
  if [ ! -f "supabase/migrations/$f" ]; then
    echo "::error::not-replayable ledger names a migration that does not exist: $f"
    exit 1
  fi
done

total=0
for f in supabase/migrations/*.sql; do total=$((total + 1)); done

echo "::group::replay, twice (idempotency)"
createdb -T "$DB_BASE" "$DB_MAIN"
replayed=0
for pass in 1 2; do
  echo "── pass $pass ──"
  replayed=0
  for f in supabase/migrations/*.sql; do
    name=$(basename "$f")
    if is_ledgered "$name"; then
      echo "  skip (ledger) $name"
      continue
    fi
    echo "  $name"
    psql_run -d "$DB_MAIN" -f "$f"
    replayed=$((replayed + 1))
  done

  # Between the passes, plant a row in every table whose columns a replay has
  # historically destroyed. Pass 2 then runs over a database that HAS data —
  # which is the only state in which the destructive case is visible, and the
  # state a real operator's database is always in.
  if [ "$pass" = 1 ]; then
    echo "── planting replay probe rows ──"
    # The base database is built from schema.sql, which already declares the
    # student_* tables — so a `drop type … cascade` in the migration set takes
    # its columns out on pass ONE, before there is anything to plant. Say so
    # here, with the diagnosis, rather than letting the INSERT below fail with a
    # bare 42703 that reads like a broken probe.
    psql_run -d "$DB_MAIN" <<'SQL'
do $$
declare
  gone text[] := '{}';
  r    record;
begin
  for r in
    select * from (values
      ('student_academic_input', 'programme_type'), ('student_academic_input', 'english_status'),
      ('student_subjects', 'level'), ('student_admissions_tests', 'test_type'),
      ('student_personal_information', 'gender'), ('student_lifestyle_preference', 'campus_size')
    ) as v(tbl, col)
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.tbl and column_name = r.col)
    then gone := gone || format('%s.%s', r.tbl, r.col); end if;
  end loop;
  if cardinality(gone) > 0 then
    raise exception
      'a migration DESTROYED columns that schema.sql declares, with no error: %. '
      'Look for `drop type … cascade` — it drops every column of that type, and a '
      '`create table if not exists` below does NOT put them back.',
      array_to_string(gone, ', ');
  end if;
end $$;
SQL
    psql_run -d "$DB_MAIN" <<'SQL'
insert into profiles (id, role, full_name)
  values ('00000000-0000-4000-8000-00000000d0d0', 'student', 'replay probe')
  on conflict (id) do nothing;
insert into student_academic_input (profile_id, programme_type, school_name, school_type,
    language_of_instruction, intended_clusters, secondary_clusters,
    english_test_type, english_status, ib_tok_grade, ib_ee_grade, ib_math_pathway)
  values ('00000000-0000-4000-8000-00000000d0d0', 'IB', 'Replay Probe School', 'boarding',
    'english', '{maths}', '{law}', 'IELTS', 'met', 'A', 'B', 'AA_HL')
  on conflict (profile_id) do nothing;
insert into student_personal_information (profile_id, first_name, gender)
  values ('00000000-0000-4000-8000-00000000d0d0', 'Replay', 'female')
  on conflict (profile_id) do nothing;
insert into student_subjects (profile_id, subject_name, level, grade_value)
  values ('00000000-0000-4000-8000-00000000d0d0', 'Mathematics', 'HL', '7');
insert into student_admissions_tests (profile_id, test_type, status, score_numeric)
  values ('00000000-0000-4000-8000-00000000d0d0', 'MAT', 'taken', 88);
insert into student_lifestyle_preference (profile_id, teaching_style, desired_location_type, campus_size)
  values ('00000000-0000-4000-8000-00000000d0d0', 'academic', 'london', 'large')
  on conflict (profile_id) do nothing;
SQL
  fi
done
echo "::endgroup::"

echo "::group::replay is non-destructive (columns AND data survive pass 2)"
# The assertion the exit-code-only idempotency check cannot make. Every value
# below is an ENUM-typed column, i.e. exactly what `drop type … cascade` takes
# with it. Reading the value back — not just the column's existence — is
# deliberate: a column could be re-added empty and look fine to a catalogue
# query while every student's data was gone.
psql_run -d "$DB_MAIN" <<'SQL'
do $$
declare
  probe constant uuid := '00000000-0000-4000-8000-00000000d0d0';
  lost  text[] := '{}';
  r     record;
begin
  for r in
    select * from (values
      ('student_academic_input',       'programme_type'),
      ('student_academic_input',       'english_status'),
      ('student_academic_input',       'english_test_type'),
      ('student_academic_input',       'intended_clusters'),
      ('student_academic_input',       'secondary_clusters'),
      ('student_academic_input',       'school_type'),
      ('student_academic_input',       'language_of_instruction'),
      ('student_academic_input',       'ib_tok_grade'),
      ('student_academic_input',       'ib_ee_grade'),
      ('student_academic_input',       'ib_math_pathway'),
      ('student_subjects',             'level'),
      ('student_admissions_tests',     'test_type'),
      ('student_admissions_tests',     'status'),
      ('student_personal_information', 'gender'),
      ('student_lifestyle_preference', 'teaching_style'),
      ('student_lifestyle_preference', 'desired_location_type'),
      ('student_lifestyle_preference', 'campus_size')
    ) as v(tbl, col)
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.tbl and column_name = r.col)
    then
      lost := lost || format('column %s.%s DROPPED by the replay', r.tbl, r.col);
    else
      declare
        val text;
      begin
        execute format('select %I::text from public.%I where profile_id = $1', r.col, r.tbl)
          into val using probe;
        if val is null then
          lost := lost || format('value %s.%s LOST by the replay', r.tbl, r.col);
        end if;
      end;
    end if;
  end loop;

  if cardinality(lost) > 0 then
    raise exception
      E'the migration replay is DESTRUCTIVE — it applied twice with no error and still lost %:\n  %',
      cardinality(lost), array_to_string(lost, E'\n  ');
  end if;
end $$;
SQL
echo "  every probed column and value survived a second full replay."
echo "::endgroup::"

# A glob that matched nothing, or a ledger that swallowed the whole directory,
# would make every assertion above vacuously true. This branch has already
# shipped one ratchet that reported a number 32 short of reality.
expected=$((total - ${#NOT_REPLAYABLE[@]}))
if [ "$replayed" -ne "$expected" ] || [ "$replayed" -lt 30 ]; then
  echo "::error::replayed $replayed migrations; expected $expected (of $total on disk). Refusing to report success."
  exit 1
fi
echo "$replayed of $total migrations replayed twice with no error."

echo "::group::not-replayable ledger is still accurate"
# Each ledgered file gets its own database, cloned from the post-schema.sql
# baseline, so one file's damage cannot mask another's. "Not replayable" means:
# applying it twice from that baseline does not both times succeed.
i=0
for f in "${NOT_REPLAYABLE[@]}"; do
  i=$((i + 1))
  probe="${DB_MAIN}_probe_$i"
  dropdb --if-exists "$probe"
  createdb -T "$DB_BASE" "$probe"
  if psql_run -d "$probe" -f "supabase/migrations/$f" >/dev/null 2>&1 \
     && psql_run -d "$probe" -f "supabase/migrations/$f" >/dev/null 2>&1; then
    echo "::error::$f now replays cleanly twice. Remove it from NOT_REPLAYABLE in scripts/ci-db-check.sh so the replay covers it."
    dropdb --if-exists "$probe"
    exit 1
  fi
  echo "  confirmed not replayable: $f"
  dropdb --if-exists "$probe"
done
echo "::endgroup::"

echo "::group::post-conditions (skipping the ledger loses nothing)"
# The ledger is a narrowing of the idempotency claim, so it needs a floor: the
# objects those three files create must be present ANYWAY, from schema.sql and
# the forward migrations. If that ever stops being true the narrowing has become
# a hole, and this block reddens.
psql_run -d "$DB_MAIN" <<'SQL'
do $$
declare
  missing text[] := '{}';
  t text;
begin
  -- created by 20260512120000 / 20260513120000, and by schema.sql
  foreach t in array array['help_requests','notifications','help_messages','help_notes','help_meetings'] loop
    if to_regclass('public.' || t) is null then missing := missing || ('table ' || t); end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      missing := missing || ('publication membership ' || t);
    end if;
  end loop;

  -- created by 20250308120000, and by schema.sql
  foreach t in array array['cities','universities','programs','program_requirements'] loop
    if to_regclass('public.' || t) is null then missing := missing || ('table ' || t); end if;
  end loop;
  if to_regclass('public.course_scoring_v1') is null then missing := missing || 'view course_scoring_v1'; end if;
  if not exists (select 1 from pg_proc where proname = 'safe_int') then missing := missing || 'function safe_int'; end if;
  if not exists (select 1 from pg_type where typname = 'cost_of_life_enum') then missing := missing || 'type cost_of_life_enum'; end if;

  -- The recognition_score regression itself: search suggestions read this column
  -- and 20260723120000:21 indexes it. Replaying 20250308120000 removes it.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'universities'
                   and column_name = 'recognition_score') then
    missing := missing || 'column universities.recognition_score';
  end if;

  if cardinality(missing) > 0 then
    raise exception 'post-condition failed — skipping the not-replayable ledger lost: %',
      array_to_string(missing, ', ');
  end if;
end $$;
SQL
echo "  all objects the ledgered files create are present anyway."
echo "::endgroup::"

echo
echo "database gate: PASS"
