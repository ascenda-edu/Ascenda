# Staging environment

The staging environment is a **separate Supabase project** plus the existing
Vercel project's **Preview** environment. There is no second Vercel project.

For why it is shaped this way — and the alternatives that were rejected — see
[`docs/planning/staging-environment.md`](planning/staging-environment.md). This
file is the operating manual.

| | Production | Staging |
|---|---|---|
| Vercel | `ascenda`, Production env | `ascenda`, **Preview** env |
| URL | `ascendaedu.com` | `ascenda-git-staging-cxz5mw6fk2-6983s-projects.vercel.app` |
| Reachable by | anyone | Vercel team members (Vercel Authentication) |
| Supabase | `alpkbobbasxvubogkark` | its own project |
| Deploys from | `main` | every PR preview, plus the `staging` branch |

Two consequences of the Preview arrangement worth knowing before you debug
something confusing:

- **Every PR preview runs against the staging database.** They all share it. Two
  PRs writing `student_*` at once will collide; the fix is re-running the seeders.
- **Nothing is per-PR isolated.** Supabase Branching would give that, and is
  deliberately not used: it drives off `supabase_migrations.schema_migrations`,
  which this repo's history has diverged from, and it would re-introduce
  `supabase db push`.

---

## Building it

```bash
./scripts/bootstrap-staging.sh            # run, or resume
./scripts/bootstrap-staging.sh --status   # which steps are done
./scripts/bootstrap-staging.sh --reset    # forget progress (changes no database)
```

Resumable — it records each completed step and skips it next time. It stops at
each step only a human can do, prints the exact values, and waits.

It needs these in `.env.local` (it will tell you which one is missing, one at a
time, and keep your progress):

| Variable | Where from |
|---|---|
| `SUPABASE_DB_URL_STAGING` | Dashboard → Connect → **Session pooler, port 5432** |
| `STAGING_SUPABASE_URL` | Project Settings → API → Project URL |
| `STAGING_SUPABASE_ANON_KEY` | Project Settings → API → anon/public |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role |
| `DEMO_USER_PASSWORD`, `SEED_STUDENT_PASSWORD` | you pick — **staging-only, not production's** |

Port 5432 is not a detail. The pooler on **6543** is transaction mode, which
`pg_dump` cannot use; `db:sync-catalogue` refuses it by name rather than failing
halfway through a dump.

You also need the Postgres client tools on PATH (`pg_dump`, `pg_restore`). On
macOS: `brew install libpq && brew link --force libpq`.

---

## What lives in staging, and what never will

**Built from files:** the schema (`supabase/schema.sql` + the migrations) and the
`application-documents` storage bucket with all five of its RLS policies — the
bucket is created by `schema.sql:1192-1305`, so it needs no dashboard step.

**Copied from production** (`npm run db:sync-catalogue`): `universities`, `cities`,
`programs`, `program_requirements`, `deadlines`, `sources`.

It has to be copied — it cannot be rebuilt. `supabase/imports/*.csv` are 3-line
stubs, not the source of the 119k-programme catalogue, and the migration that
shaped it is archived as destructive on replay.

**Never copied, in either direction:** `profiles`, `auth.users`, `student_*`,
`help_*`, `applications`, `notifications`, `chat_*`. Real students' PII, academic
records and counsellor correspondence do not belong in an environment with weaker
access control. `student_matches` and `simulation_results` are excluded too —
inferences *about* real people, and regenerable from the scoring code.

**Seeded, not copied:** the demo student (Greg), seeded students, an admin, a
counsellor, and the E2E throwaway account.

Sync is one-directional. Staging is never authoritative, and there is no flag to
reverse the direction.

---

## Day-to-day

### Applying a migration

Staging first, always — see
[`supabase/MIGRATIONS.md`](../supabase/MIGRATIONS.md).

```bash
npm run db:apply -- --target staging supabase/migrations/<file>.sql
npm run db:probe -- --target staging
npm run db:apply supabase/migrations/<file>.sql     # production; prompts
```

`--target` defaults to `prod`. The bare command therefore still works, but prints
the project ref and makes you type it back first. `--target staging` never
prompts.

### Refreshing the catalogue

```bash
npm run db:sync-catalogue
```

Run it after any catalogue import against production. Deliberately not scheduled:
a timer would mean an unattended `pg_dump` of 119k rows out of production for data
that may not have moved in a month.

It **truncates the six tables CASCADE** on staging first, which also empties rows
referencing them (`student_matches`, `shortlisted_programs`,
`counsellor_deck_programs`). Re-run the seeders afterwards.

### Re-seeding accounts

⚠️ **The seeders have no `--target` flag.** They read `NEXT_PUBLIC_SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY`, which in `.env.local` are **production**. Running
`npm run seed:students` with no override creates accounts in the live product.

Always override explicitly:

```bash
NEXT_PUBLIC_SUPABASE_URL="$STAGING_SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$STAGING_SUPABASE_SERVICE_ROLE_KEY" \
npm run seed:students
```

Or just re-run `./scripts/bootstrap-staging.sh --reset` and let the wizard do it —
it passes the overrides for you.

---

## Acceptance

Staging is working when all five hold:

1. `npm run db:probe -- --target staging` → **35 / 35, 0 missing**
2. Catalogue row counts match production
3. All four seeded accounts log in
4. A document upload round-trips through the bucket
5. The credentialed Playwright spec passes against the staging URL

On (1): the probe carries 35 markers against 44 migration files — nine migrations
create no distinguishable catalogue object. 35/35 proves those 35 landed, not that
all 44 did. It is still the only evidence that exists, and it is the same
instrument `MIGRATIONS.md` already relies on for production.

---

## Safety rails, and why each exists

**`--target staging` can never resolve to production.** `scripts/lib/db-target.ts`
hard-refuses if `SUPABASE_DB_URL_STAGING` carries the production project ref. One
wrong paste into `.env.local` would otherwise report "staging" while writing to
production, defeating every other check here.

**Production is no longer a silent default.** It is still the default — the
documented `npm run db:apply <file>` had to keep working — but it now prints the
ref and requires you to type it back. `apply-sql.ts` and `db-probe.ts` auto-load
`.env.local`, where `SUPABASE_DB_URL` is production on every developer machine;
before this, selecting a target meant editing a dotenv file, which is not a
safety mechanism.

**`db:sync-catalogue` refuses to run if source and destination resolve to the
same database**, because the truncate it performs would then be a production
outage rather than a staging reset.

**The not-replayable ledger has one copy.** `bootstrap-staging.sh` parses
`NOT_REPLAYABLE` out of `scripts/ci-db-check.sh` rather than duplicating it. The
CI `database` job proves each entry still genuinely fails; that proof only covers
the list it owns, so a second copy would be one list and one lie.

**The seeders are the remaining gap.** They have no target concept at all, and the
only thing pointing them at staging is an explicit override. Giving them the same
`--target` treatment is worthwhile follow-up work.
