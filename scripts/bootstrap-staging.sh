#!/usr/bin/env bash
#
# Build the staging Supabase project, from nothing to the point where only Vercel
# is left. Resumable: every step records itself, and re-running skips what is done.
#
# WHY A WIZARD RATHER THAN A RUNBOOK
# ----------------------------------
# The step count is high, the order is load-bearing (schema before migrations
# before seeders before catalogue), and roughly a third of the steps can only be
# done by a human in a dashboard or an authenticated CLI. A markdown runbook for
# that shape is a list people lose their place in — and losing your place here
# means either re-running something destructive or skipping something silently.
#
# It is also the artifact that makes this repeatable. Doing it live in a chat
# window produces a staging project and no way to build a second one.
#
# WHAT IT WILL NOT DO
# -------------------
# Nothing here ever writes to production. Every database call goes through
# `--target staging`, whose guard (scripts/lib/db-target.ts) hard-refuses if the
# staging connection string resolves to the production project ref. The seeders
# have no such flag, so this script passes their target explicitly and checks it
# first — see the `seeders` step, and read the WARNING there before editing it.
#
#   ./scripts/bootstrap-staging.sh            # run / resume
#   ./scripts/bootstrap-staging.sh --status   # what is done, what is next
#   ./scripts/bootstrap-staging.sh --reset    # forget progress (changes no database)
#
set -euo pipefail

cd "$(dirname "$0")/.."

STATE_FILE=".staging-bootstrap.state"
PRODUCTION_PROJECT_REF="alpkbobbasxvubogkark"

bold=$(tput bold 2>/dev/null || echo '')
dim=$(tput dim 2>/dev/null || echo '')
red=$(tput setaf 1 2>/dev/null || echo '')
green=$(tput setaf 2 2>/dev/null || echo '')
yellow=$(tput setaf 3 2>/dev/null || echo '')
reset=$(tput sgr0 2>/dev/null || echo '')

say()  { printf '%s\n' "$*"; }
head2(){ printf '\n%s%s%s\n' "$bold" "$*" "$reset"; }
ok()   { printf '  %s✓%s %s\n' "$green" "$reset" "$*"; }
warn() { printf '  %s!%s %s\n' "$yellow" "$reset" "$*"; }
die()  { printf '\n%s✗ %s%s\n' "$red" "$*" "$reset" >&2; exit 1; }

touch "$STATE_FILE"
is_done()   { grep -qxF "$1" "$STATE_FILE"; }
mark_done() { is_done "$1" || printf '%s\n' "$1" >> "$STATE_FILE"; }

# ── .env.local, read the same way the TS scripts read it ────────────────────
# Existing environment wins, matching `if (!process.env[k])` in apply-sql.ts et al,
# so an inline override on the command line still beats the file.
load_env_local() {
  [ -f .env.local ] || return 0
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    value=${value%\"}; value=${value#\"}
    value=${value%\'}; value=${value#\'}
    [ -z "${!key:-}" ] && export "$key=$value"
  done < .env.local
}

require_var() {
  local name="$1" hint="$2"
  if [ -z "${!name:-}" ]; then
    say ""
    say "  ${bold}$name${reset} is not set."
    say "  $hint"
    say ""
    die "Add it to .env.local, then re-run this script. Progress so far is kept."
  fi
}

# The ref lives in the host for a direct connection and in the username for the
# pooler. Both shapes appear in the Supabase dashboard depending on which tab.
project_ref_of() {
  local url="$1" ref=""
  ref=$(printf '%s' "$url" | sed -n 's#.*://[^@]*@db\.\([a-z0-9]*\)\.supabase\.co.*#\1#p')
  [ -n "$ref" ] || ref=$(printf '%s' "$url" | sed -n 's#.*://postgres\.\([a-z0-9]*\):.*#\1#p')
  printf '%s' "$ref"
}

pause_for_human() {
  say ""
  printf '  %sPress Enter when done, or Ctrl-C to stop (progress is kept).%s ' "$dim" "$reset"
  read -r _ </dev/tty
}

# ── CLI ─────────────────────────────────────────────────────────────────────
case "${1:-}" in
  --status)
    say "Completed steps:"
    if [ -s "$STATE_FILE" ]; then sed 's/^/  ✓ /' "$STATE_FILE"; else say "  (none)"; fi
    exit 0
    ;;
  --reset)
    : > "$STATE_FILE"
    say "Progress forgotten. No database was changed."
    exit 0
    ;;
  '') ;;
  *) die "Unknown argument: $1 (expected --status or --reset)" ;;
esac

load_env_local

say "${bold}Ascenda — staging bootstrap${reset}"
say "${dim}Resumable. Re-run any time; completed steps are skipped.${reset}"

# ── 1. Preflight ────────────────────────────────────────────────────────────
head2 "1. Preflight"
if is_done preflight; then ok "already done"; else
  command -v node >/dev/null || die "node is not on PATH."
  command -v npx  >/dev/null || die "npx is not on PATH."
  [ -d node_modules ] || die "Dependencies are not installed. Run: npm ci"

  # pg_dump / pg_restore are only needed by the catalogue step, but finding out
  # here beats finding out after the schema is built.
  if ! command -v pg_dump >/dev/null || ! command -v pg_restore >/dev/null; then
    warn "pg_dump / pg_restore not found — the catalogue step will fail."
    warn "macOS: brew install libpq && brew link --force libpq"
  else
    ok "$(pg_dump --version)"
  fi

  [ -f .env.local ] || die ".env.local does not exist. Copy .env.example and fill it in."
  ok "node $(node -v), dependencies present, .env.local found"
  mark_done preflight
fi

# ── 2. Staging connection string ────────────────────────────────────────────
head2 "2. Staging database URL"
if is_done staging-url; then ok "already done"; else
  require_var SUPABASE_DB_URL_STAGING \
"  Supabase dashboard → staging project → Connect → Session pooler.
  Use the SESSION pooler on port 5432. Port 6543 is transaction mode and
  pg_dump cannot use it (the catalogue step refuses it explicitly)."

  ref=$(project_ref_of "$SUPABASE_DB_URL_STAGING")
  [ -n "$ref" ] || die "Could not read a Supabase project ref out of SUPABASE_DB_URL_STAGING."
  [ "$ref" != "$PRODUCTION_PROJECT_REF" ] || \
    die "SUPABASE_DB_URL_STAGING points at PRODUCTION ($PRODUCTION_PROJECT_REF). Refusing to continue."

  ok "staging project ref: $ref"
  mark_done staging-url
fi

# ── 3. Staging API keys ─────────────────────────────────────────────────────
# The seeders talk to the REST/Auth API, not Postgres, so they need these rather
# than the connection string.
head2 "3. Staging API keys"
if is_done staging-keys; then ok "already done"; else
  require_var STAGING_SUPABASE_URL              "  Dashboard → Project Settings → API → Project URL (https://<ref>.supabase.co)."
  require_var STAGING_SUPABASE_ANON_KEY         "  Dashboard → Project Settings → API → Project API keys → anon/public."
  require_var STAGING_SUPABASE_SERVICE_ROLE_KEY "  Dashboard → Project Settings → API → Project API keys → service_role."

  case "$STAGING_SUPABASE_URL" in
    *"$PRODUCTION_PROJECT_REF"*) die "STAGING_SUPABASE_URL points at PRODUCTION. Refusing to continue." ;;
  esac
  ok "staging API keys present"
  mark_done staging-keys
fi

# ── 4. Auth configuration (manual) ──────────────────────────────────────────
head2 "4. Auth URL configuration ${dim}(manual)${reset}"
if is_done auth-config; then ok "already done"; else
  say "  Dashboard → Authentication → URL Configuration, on the STAGING project:"
  say ""
  say "    Site URL          https://ascenda-git-staging-cxz5mw6fk2-6983s-projects.vercel.app"
  say "    Redirect URLs     https://ascenda-git-staging-cxz5mw6fk2-6983s-projects.vercel.app/auth/callback"
  say "                      http://localhost:3000/auth/callback"
  say ""
  say "  ${dim}Password login is domain-independent, but invites, magic links and password${reset}"
  say "  ${dim}recovery all land on a dead URL if the allowlist is wrong. Same cutover${reset}"
  say "  ${dim}failure CLAUDE.md records for ascendaedu.com.${reset}"
  pause_for_human
  mark_done auth-config
fi

# ── 5. Schema ───────────────────────────────────────────────────────────────
head2 "5. Build the schema"
if is_done schema; then ok "already done"; else
  say "  Applying supabase/schema.sql — the same file scripts/ci-db-check.sh proves"
  say "  ${dim}builds a database from scratch on every CI run. Includes the${reset}"
  say "  ${dim}application-documents storage bucket and its five RLS policies.${reset}"
  say ""
  npm run --silent db:apply -- --target staging supabase/schema.sql
  ok "schema built"
  mark_done schema
fi

# ── 6. Migrations ───────────────────────────────────────────────────────────
head2 "6. Replay the migrations"
if is_done migrations; then ok "already done"; else
  # The not-replayable ledger is READ OUT OF ci-db-check.sh rather than copied.
  # Two copies of a safety list is one copy and one lie: the CI gate proves each
  # entry still genuinely fails, and that proof only covers the list it owns.
  ledger=$(awk '/^NOT_REPLAYABLE=\(/{f=1;next} f&&/^\)/{exit} f&&/^ *[0-9]{8}.*\.sql$/{gsub(/^ +| +$/,"");print}' \
    scripts/ci-db-check.sh)
  [ -n "$ledger" ] || die "Could not read NOT_REPLAYABLE out of scripts/ci-db-check.sh — refusing to guess."

  say "  Skipping the not-replayable ledger (from scripts/ci-db-check.sh):"
  printf '    %s\n' $ledger
  say ""

  applied=0; skipped=0
  for file in supabase/migrations/*.sql; do
    name=$(basename "$file")
    if printf '%s\n' "$ledger" | grep -qxF "$name"; then
      say "  ${dim}skip (ledger)  $name${reset}"
      skipped=$((skipped + 1))
      continue
    fi
    say "  apply         $name"
    npm run --silent db:apply -- --target staging "$file" >/dev/null
    applied=$((applied + 1))
  done

  ok "$applied migrations applied, $skipped skipped"
  mark_done migrations
fi

# ── 7. Verify the schema ────────────────────────────────────────────────────
head2 "7. Verify — acceptance criterion 1"
if is_done probe; then ok "already done"; else
  say "  ${dim}35 markers across 44 migration files: nine migrations create no${reset}"
  say "  ${dim}distinguishable catalogue object to probe for. 35/35 means those 35${reset}"
  say "  ${dim}landed, not that all 44 did. It is still the only evidence there is.${reset}"
  say ""
  npm run --silent db:probe -- --target staging | tail -20
  say ""
  say "  Expected: APPLIED 35 / 35    MISSING 0"
  pause_for_human
  mark_done probe
fi

# ── 8. Catalogue ────────────────────────────────────────────────────────────
head2 "8. Copy the catalogue from production"
if is_done catalogue; then ok "already done"; else
  say "  ${dim}Six non-personal tables. Never profiles, auth.users, student_*, help_*,${reset}"
  say "  ${dim}applications or notifications — see scripts/sync-catalogue.ts.${reset}"
  say ""
  npm run --silent db:sync-catalogue
  ok "catalogue synced"
  mark_done catalogue
fi

# ── 9. Seed accounts ────────────────────────────────────────────────────────
head2 "9. Seed the accounts"
if is_done seeders; then ok "already done"; else
  # ── WARNING — READ BEFORE EDITING ─────────────────────────────────────────
  # These four scripts have NO --target flag. They read NEXT_PUBLIC_SUPABASE_URL
  # and SUPABASE_SERVICE_ROLE_KEY, which in .env.local are PRODUCTION. Running
  # any of them without the overrides below creates fake student accounts in the
  # live product. The overrides are not tidiness; they are the only thing
  # pointing these at staging.
  require_var DEMO_USER_PASSWORD   "  A staging-only password. Must differ from production's."
  require_var SEED_STUDENT_PASSWORD "  A staging-only password. Must differ from production's."

  staging_env=(
    "NEXT_PUBLIC_SUPABASE_URL=$STAGING_SUPABASE_URL"
    "SUPABASE_URL=$STAGING_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=$STAGING_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY=$STAGING_SUPABASE_SERVICE_ROLE_KEY"
  )

  say "  → demo student (Greg)"
  env "${staging_env[@]}" npx tsx --tsconfig tsconfig.json scripts/seed-demo-user.ts
  say "  → seeded students"
  env "${staging_env[@]}" npx tsx --tsconfig tsconfig.json scripts/seed-students.ts
  say "  → admin + counsellor"
  env "${staging_env[@]}" npx tsx --tsconfig tsconfig.json scripts/create-admin-users.ts
  say "  → e2e throwaway"
  env "${staging_env[@]}" npx tsx --tsconfig tsconfig.json scripts/create-e2e-user.ts

  ok "accounts seeded on staging"
  mark_done seeders
fi

# ── 10. Edge functions (manual) ─────────────────────────────────────────────
head2 "10. Deploy the edge functions ${dim}(manual)${reset}"
if is_done functions; then ok "already done"; else
  ref=$(project_ref_of "$SUPABASE_DB_URL_STAGING")
  say "  Both are on-demand, admin-gated HTTP handlers. Neither is scheduled, so"
  say "  ${dim}deploying them costs nothing and runs nothing until invoked.${reset}"
  say ""
  say "    supabase login"
  say "    supabase functions deploy import_ucas       --project-ref $ref"
  say "    supabase functions deploy update_deadlines  --project-ref $ref"
  say ""
  say "  Then set their shared secret on the STAGING project:"
  say ""
  say "    supabase secrets set ADMIN_FUNCTION_SECRET=<staging-only value> --project-ref $ref"
  pause_for_human
  mark_done functions
fi

# ── Done ────────────────────────────────────────────────────────────────────
head2 "Staging database is built"
say ""
say "  Acceptance criteria 1-4 are now checkable:"
say "    1. npm run db:probe -- --target staging   → 35/35, 0 missing"
say "    2. catalogue row counts match production"
say "    3. all four seeded accounts log in"
say "    4. a document upload round-trips through the bucket"
say ""
say "  ${bold}What is left needs Vercel, and is blocked on permissions:${reset}"
say "    • ~20 Preview-scoped env vars      (needs Owner/Admin on the Vercel team)"
say "    • the staging branch + first deploy"
say "    • four GitHub secrets: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY,"
say "      E2E_EMAIL, E2E_PASSWORD  → satisfies the e2e ADMISSION CONDITION part 2"
say "    • acceptance criterion 5 (Playwright against the staging URL)"
say ""
say "  See docs/staging.md and docs/planning/staging-environment.md."
