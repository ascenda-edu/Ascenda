# Staging Environment — Plan

**Status:** agreed, not started. Written 2026-08-07.

Outcome of a design interview covering Vercel topology, git flow, database sync
semantics, and the manual/automated boundary. Every decision below was taken
deliberately; the *why* is recorded because the reasoning is the part that rots
first.

---

## Shape

### Vercel

**No second project.** The existing `ascenda` project
(`prj_fACg6XIdp30JAW7Qd2oJ0e3vMgOJ`, team `team_utG7J6Fmx957BnVJT9zXg2NS`) gains a
staging environment by scoping staging Supabase credentials to the **Preview**
environment. Production-scoped vars keep pointing at production.

- `main` → production is **unchanged**.
- A long-lived `staging` branch, kept as a fast-forward of `main`, provides a
  stable URL: `ascenda-git-staging-cxz5mw6fk2-6983s-projects.vercel.app`.
- Vercel Authentication stays **on**. Staging holds a full catalogue copy and a
  live service-role key; it must not be world-reachable on a guessable host.
  A `staging.ascendaedu.com` domain is deferred — adding it later also means
  updating the Supabase auth allowlist.

> **Why not a separate `ascenda-staging` project:** the reason to prefer reuse is
> not cost. PR previews on `ascenda` today are backed by whatever Supabase
> credentials the Preview environment resolves to — plausibly production. Scoping
> staging credentials to Preview creates staging *and* closes that hole in one
> move. A separate project creates staging and leaves it open.

> **Why not an integration branch or a promote model:** this repo has no branch
> protection (it needs a paid GitHub plan for a private repo), so an integration
> branch is ceremony nothing enforces — a merge straight to `main` would still
> work. Per-PR staging deploys deliver the isolation; the `staging`
> fast-forward branch delivers the stable URL, with no drift.

### Supabase

The already-created empty project becomes staging, built **from files**, not
cloned from production.

| Layer | Source | Notes |
|---|---|---|
| Schema | `supabase/schema.sql` + 35 migrations | Same path `scripts/ci-db-check.sh` proves green on every CI run. Excludes the 2 ledgered non-replayable files and the archived destructive one. |
| Storage | `schema.sql:1192-1305` | Creates the `application-documents` bucket **and** all five `storage.objects` policies. No manual step. |
| Catalogue | copied prod → staging | `universities`, `cities`, `programs`, `program_requirements`, `deadlines`, `sources`. Data-only, FK order, single transaction, session-mode pooler. |
| User data | seeded, **never copied** | `seed-demo-user.ts`, `seed-students.ts`, `create-admin-users.ts`, `create-e2e-user.ts`. |
| Edge functions | `supabase functions deploy` ×2 | Own `ADMIN_FUNCTION_SECRET`. |
| Auth | dashboard | Staging Site URL + `/auth/callback` in the redirect allowlist. |

**Sync is one-directional, always. Staging is never authoritative.**

> **Why schema from files rather than `pg_dump --schema-only`:** it makes staging
> a standing test of the migration path — the exact thing `supabase/MIGRATIONS.md`
> records that nobody could previously verify.

> **Why the catalogue must be copied:** it cannot be rebuilt from the repo.
> `supabase/imports/universities.csv` and `program_requirements.csv` are 3-line,
> 133-byte stubs, not the source of the 119k programmes, and
> `20250308120000_normalize_course_catalog.sql` is archived as destructive. Copying
> from production is the only path, not a preference.

> **Why user data is never copied:** `auth.users`, `student_*`, `help_*` hold real
> students' PII, academic records and counsellor threads. Cloning them puts that
> data in an environment with weaker access control — a data-protection incident
> waiting for a shared staging password — and yields nothing `seed-students.ts`
> does not already give. `student_matches` and `simulation_results` are excluded
> too: regenerable from the scoring code, and they are inferences about real people.

> **Why one shared staging DB, and not Supabase Branching:** Branching drives off
> `supabase_migrations.schema_migrations`, which this repo documents as diverged
> and unusable, and it would re-introduce `db push`. Adopting it means first
> reconciling the migration history — a much larger project. Two PRs touching
> `student_*` will collide; the fix is re-running the seeders, which is cheap.

---

## Work

### Script changes

- `scripts/apply-sql.ts` + `scripts/db-probe.ts`: add `--target staging|prod`,
  reading a new `SUPABASE_DB_URL_STAGING`. Print the resolved project ref and
  require confirmation when it matches production's `alpkbobbasxvubogkark`.
- New `npm run db:sync-catalogue`.
- New `scripts/bootstrap-staging.sh` — resumable wizard. Automates what it can and
  stops at each manual step with the exact URL and the exact value to paste.

> **Why the target guard is not optional.** Bootstrapping staging is ~35 sequential
> `npm run db:apply` runs, and both scripts **auto-load `.env.local`**, whose
> `SUPABASE_DB_URL` is production. One forgotten inline override in a 35-command
> loop replays migrations — including two ledgered as not replayable — against the
> live database. The `_applied_archive` refusal at `apply-sql.ts:26` already
> establishes the pattern, and for the same stated reason: moving the file "did
> nothing at all to stop" the command. Selecting a target by editing a dotenv file
> is not a safety mechanism.

### Environment variables

Full Preview mirror of Production. Seven take staging-specific values:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_ID`,
`NEXT_PUBLIC_SITE_URL`, `ADMIN_API_KEY`

Plus a **separate** `GEMINI_API_KEY` — a shared key means a staging load test
degrades production chat, with no way to attribute spend.

Two cleanups while in there:

- **Delete** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `.env.example` documents it as
  a phantom: set in CI, listed in CLAUDE.md, read by no code anywhere. Copying a
  variable no code reads into a second environment is how it becomes permanent.
- **Fix `NEXT_PUBLIC_SITE_URL` in both environments** — it still says
  `ascenda-ashy.vercel.app`, a host that now 404s.

Entry is via the Vercel CLI (`vercel env add … preview`), not the dashboard: the
Vercel MCP server exposes no environment-variable tool, twenty dashboard forms is
where a typo lives, and `vercel env pull` afterwards allows a diff against
`.env.example` that proves nothing was missed.

### CI

Set four GitHub secrets against staging: `E2E_SUPABASE_URL`,
`E2E_SUPABASE_ANON_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`.

This satisfies the `e2e` job's ADMISSION CONDITION part 2 in
`.github/workflows/ci.yml` verbatim. `e2e` is **already** in `ci-ok`'s `needs`, so
`profile-wizard.e2e.ts` starts running for real and can go red — that is the
feature. Its documented side effect (it "completes the wizard and saves,
overwriting that account's `student_*` rows") is precisely why it needed a
non-production project.

### Documentation

`docs/staging.md` (runbook), `README.md`, `supabase/MIGRATIONS.md` (the
staging-first rule), CLAUDE.md Deployment section.

---

## Standing rules after this lands

1. **Every new migration applies to staging first**, verified with `db:probe`,
   before production. Without this staging drifts within two migrations and
   becomes a thing people stop trusting — worse than not having one.
2. **Catalogue refresh is manual** (`npm run db:sync-catalogue`), run after any
   production catalogue import. A schedule would mean an unattended `pg_dump` of
   119k rows out of production on a timer, for data that may not have changed in
   a month.

---

## Acceptance

1. `db:probe --target staging` reports **35/35 markers present, 0 missing** — the
   same evidence standard `MIGRATIONS.md` sets for production ("belief is not
   evidence"). Staging launches with a proven schema, not an assumed one.

   Be precise about what this proves: the probe carries **35 markers against 44
   migration files**, because nine migrations create no distinguishable catalogue
   object to look for (the file documents one such case, `20260801120000`, whose
   only change is a `create or replace function` body). 35/35 means those 35
   landed — not that all 44 did. It remains the only instrument there is, and the
   one production is already judged by.
2. Catalogue row counts match production.
3. All four seeded accounts log in.
4. A document upload round-trips through the bucket.
5. The credentialed Playwright spec passes against the staging URL.

---

## Sequence

Script guards → bootstrap wizard → *(owner: Supabase keys + auth config)* →
schema + migrations → catalogue → seeders → *(owner: `supabase functions deploy`)*
→ Vercel Preview env vars → `staging` branch + deploy → GitHub secrets →
acceptance → docs.

## Owner-only prerequisites

- **BLOCKED — Vercel role.** Writing Preview-scoped environment variables needs
  Owner (or Admin) on team `cxz5mw6fk2-6983's projects`. The account driving this
  work has a lower role, and no CLI install fixes that — `vercel env add` fails on
  the same permission. Either the role is raised, or an Owner enters the ~20
  Preview variables. **This blocks steps 8–10 of the sequence only** (Vercel env
  vars, the `staging` branch deploy, and the Playwright acceptance criterion that
  needs a deployed URL). Steps 1–7 — every database step, and acceptance criteria
  1 through 4 — are unaffected and can complete first.
- Supabase staging project ref, anon key, service-role key, DB URL (session-mode
  pooler, port 5432 — `pg_dump` breaks under transaction pooling)
- `supabase login`, for the edge-function deploy
- A new Gemini API key for staging
- Staging seed passwords (`DEMO_USER_PASSWORD`, `SEED_STUDENT_PASSWORD`), different
  from production's, stored in a password manager. If the two environments shared
  seed passwords, a staging password handed to a tester would be a production
  credential — and the account names are in the repo.
