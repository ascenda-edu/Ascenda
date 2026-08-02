#!/usr/bin/env bash
#
# Run the `database` CI gate locally, against a THROWAWAY Postgres cluster.
#
#   ./scripts/ci-db-local.sh
#
# It boots a disposable cluster in a temp directory, runs scripts/ci-db-check.sh
# — the exact script `.github/workflows/ci.yml` runs — and tears the cluster
# down again. Nothing here can reach the production Supabase project: it never
# reads .env, never uses SUPABASE_DB_URL, and connects over a Unix socket in its
# own temp directory.
#
# Requires a Postgres 16 server. On macOS: `brew install postgresql@16`.
# Note that the `libpq` keg ships psql/initdb but NO `postgres` backend, so
# `initdb` alone is not enough.
#
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PGPORT:-55441}"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ascenda-ci-db.XXXXXX")"
# The socket directory must be SHORT: Postgres caps the socket path at 107 bytes
# and a path under a long TMPDIR silently fails to bind.
SOCKDIR="$(mktemp -d /tmp/pgs.XXXXXX)"

for d in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin \
         /usr/lib/postgresql/16/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH

if ! command -v postgres >/dev/null 2>&1; then
  echo "error: no 'postgres' server binary on PATH. Install one (brew install postgresql@16)." >&2
  exit 1
fi

cleanup() {
  pg_ctl -D "$WORKDIR/pgdata" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR" "$SOCKDIR"
}
trap cleanup EXIT

echo "throwaway cluster: $WORKDIR (socket $SOCKDIR, port $PORT)"
initdb -D "$WORKDIR/pgdata" -U postgres --auth=trust >"$WORKDIR/initdb.log" 2>&1 \
  || { cat "$WORKDIR/initdb.log" >&2; exit 1; }
pg_ctl -D "$WORKDIR/pgdata" \
  -o "-k $SOCKDIR -p $PORT -c listen_addresses=''" \
  -l "$WORKDIR/pg.log" -w start >/dev/null \
  || { cat "$WORKDIR/pg.log" >&2; exit 1; }

export PGHOST="$SOCKDIR" PGPORT="$PORT" PGUSER=postgres
unset PGDATABASE PGPASSWORD SUPABASE_DB_URL DATABASE_URL

psql -tAc 'select version()'
exec ./scripts/ci-db-check.sh
