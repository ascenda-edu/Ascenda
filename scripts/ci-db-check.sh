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
done
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
