# Ascenda — DevOps / CI-CD / Environments / Observability Audit

**Scope:** CI/CD, environments, configuration, secrets, observability, release process, testing
infrastructure, database change management, repo hygiene.
**Repo:** `github.com/ascenda-edu/Ascenda` (private), deploys to Vercel `ascenda-ashy.vercel.app`,
Supabase project `alpkbobbasxvubogkark`. (Audited while the repo was still
`github.com/Ascenda123/Ascenda`; transferred to the `ascenda-edu` org 2026-08-03. Command output
quoted below therefore names the old path — the findings are unchanged, and branch protection is
still unavailable because the org is on the Free plan.)
**Audited at:** commit `e5da2dc` (main), 2026-08-01. Read-only; no repo files modified, no
production database contacted.

---

## Executive summary

The application engineering in this repo is careful — the CI workflow has thoughtful comments, the
ESLint flat config is genuinely well reasoned, `jest.environment-node.js` documents a real Node 22
footgun, and 265 tests pass in 5.9 seconds. The **operational** layer around it has not received the
same attention, and two of the gaps are the kind that end companies rather than sprints.

The single most serious finding is that **a live Supabase service-role key is sitting in this
repository's git history and has never been rotated.** I verified by SHA-256 comparison (values never
printed) that the key committed in November 2025 is byte-identical to the key in `.env.local` today,
against the same project URL. Every collaborator who has ever cloned this repo, and every laptop or
CI cache that holds a copy, holds a credential that bypasses every RLS policy in the product.
GitHub secret scanning is disabled, so nothing has ever flagged it.

Second: there is **no environment separation of any kind.** One Supabase project serves local
development, every Vercel preview deployment, and production. Every PR preview writes to the live
student database.

Beyond those, the pattern is consistent: the pipeline verifies that the code *compiles and passes
its own tests*, and verifies nothing else. It cannot catch a broken migration, an env-var drift, a
dependency advisory, a bundle regression, an accessibility regression, or a coverage collapse.
Nothing observes production — 91 `console.*` calls across 47 files are the entire error pipeline,
feeding a Vercel log stream nobody is paged on. And nothing gates a merge: all 20 most recent PRs
merged with `reviewDecision = NONE`, and branch protection is unavailable on the current GitHub plan.

Positives worth preserving: all 61 historical Dependabot alerts are `fixed` and `npm audit` is
clean; `.env.local` is correctly gitignored *today*; the service-role client (`src/lib/supabase/service.ts`)
has a real `typeof window` guard and zero importers inside `src/`; `supabase/schema.sql` has been
diligently backported (all 20 migration functions and all app tables are present); and the
`overlap-guard` CI job is a genuinely clever workaround for the missing "require branches up to date"
setting.

---

## Current state

### CI pipeline — `.github/workflows/ci.yml` (74 lines, the only workflow)

Two jobs, triggered on `pull_request` and `push` to `main`.

| Job | What it does |
|---|---|
| `overlap-guard` | PR-only. Fetches the base branch, computes the merge base, and fails if the PR and the base have both modified the same file since. A free-tier stand-in for "require branches to be up to date". |
| `build` | `checkout@v5` → `setup-node@v5` (Node 22, `cache: npm`) → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test -- --runInBand` → `npm run build` with four placeholder `NEXT_PUBLIC_*` values. |

Everything after `npm ci` runs **serially in one job**. Wall clock is consistently ~3m00s–3m37s
across the last 15 runs. The only caching is `setup-node`'s npm cache; there is no Next.js build
cache (`.next/cache`), no ESLint cache, no Jest cache, no artifact reuse between steps, no matrix,
no job-level parallelism.

`npm test` runs bare Jest. **There is no coverage configuration anywhere** — verified against
`jest.config.ts`, `package.json`, and `ci.yml`. No `collectCoverage`, no `coverageThreshold`, no
reporter, no `--ci` flag, no JUnit output. A test file deleted in a PR produces a green build.

**What CI cannot catch, verified by inspection:**

| Regression class | Caught? | Why not |
|---|---|---|
| Broken migration | No | No SQL is parsed, linted, or applied anywhere in CI |
| Env-var drift | No | Build injects 4 placeholders; `GEMINI_API_KEY` and `ADMIN_API_KEY` are never checked |
| Bundle-size regression | No | No `next build` output assertion, no size budget |
| a11y regression | No | No axe, no Lighthouse, no e2e layer to run them in |
| Security advisory | No | No `npm audit`, no CodeQL, no secret scan, no `dependabot.yml` |
| Coverage collapse | No | No coverage instrumentation at all |
| Runtime/e2e break | No | No browser tests exist |

**GitHub security posture** (queried via `gh api`):

```
branch protection      → 403 "Upgrade to GitHub Pro or make this repository public"
secret scanning        → 404 "Secret scanning is disabled on this repository"
code scanning (CodeQL) → 403 "Code scanning is not enabled for this repository"
vulnerability alerts   → 204 (ENABLED)
dependabot alerts      → 61 total, [{"state":"fixed","n":61}] — 0 open
.github/dependabot.yml → does not exist
npm audit              → {info:0, low:0, moderate:0, high:0, critical:0, total:0}
```

Dependabot *alerting* is on and fully remediated. Dependabot *version updates* are not configured,
so the remediation was manual (PR #30, `fix/dependabot-vulns`).

### The Dockerfile — dead and broken

`Dockerfile` is 34 lines, a standard three-stage `deps`/`builder`/`runner` Next.js image. It has
been touched **once**, in commit `d414015` (2026-05-03), inside an unrelated course-page feature
commit. It is referenced by no workflow, no `docker-compose`, no README section, and no CLAUDE.md
line — `grep -rn docker .github/ README.md CLAUDE.md` returns nothing. Vercel does the deploying.

It does not work:

```
Dockerfile:26   COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
next.config.mjs grep "standalone" → no match (only outputFileTracingRoot on line 7)
ls .next/standalone            → No such file or directory
```

`output: 'standalone'` is absent, so `.next/standalone` is never emitted and the `COPY` fails the
build. Even if it succeeded, `CMD ["node", "server.js"]` would have no `server.js` to run.

Other defects: `node:20-alpine` against CI's Node 22 and a local dev machine on v25.2.0; `npm ci
--legacy-peer-deps` on line 8 (redundant — `.npmrc` already sets it globally, so the flag documents
nothing and the real setting is invisible); no `HEALTHCHECK`; and no build args for `NEXT_PUBLIC_*`,
which Next inlines at build time — so any image built from this would ship whatever
`NEXT_PUBLIC_SUPABASE_URL` happened to be in the build context, baked into client JS.

**There is no `.dockerignore`.** Combined with `COPY . .` on line 14, this is the security problem
described in finding H1.

### Environments & configuration

There is no dev/preview/staging/prod separation. Evidence:

- One Supabase project ref (`alpkbobbasxvubogkark`) appears in `.mcp.json`, `.vscode/mcp.json`,
  `CLAUDE.md`, `docs/demo-script.md`, `docs/demo-guide.md`, `.claude/settings.json`, and
  `scripts/import-rich-content.py:21` — with no sibling ref anywhere.
- `.env.example` has exactly one set of Supabase vars, no per-environment variants.
- No `vercel.json` exists, so there is no `git.deploymentEnabled` config, no environment-scoped
  build commands, and no per-branch overrides.
- The Vercel CLI is installed locally but **not authenticated** (`vercel env ls` → "No existing
  credentials found"), so I could not enumerate the actual per-environment variable sets. **This is
  the single unverified item in this report and the user should confirm it directly.**

`NEXT_PUBLIC_*` vs server-only separation is correct *by construction* — no `'use client'` file
reads `SUPABASE_SERVICE_ROLE_KEY`, verified — but it is enforced by convention and one runtime guard
(`src/lib/supabase/service.ts:11`), not by tooling. The `server-only` package is not a dependency.

**There is no env schema and no boot-time validation.** Ten call sites use the non-null assertion:

```
src/middleware.ts:27-28          process.env.NEXT_PUBLIC_SUPABASE_URL!  / ..._ANON_KEY!
src/app/auth/callback/route.ts:15-16
src/lib/supabase/server.ts:9-10, 33-34, 55-56
```

**Documented env drift**, comparing `.env.example` / `CLAUDE.md` / `ci.yml` against actual reads:

| Variable | In `.env.example`? | Read by code? | Note |
|---|---|---|---|
| `GEMINI_API_KEY` | **No** | Yes — 5 sites, incl. `src/lib/chat/gemini.ts:21` | Undocumented; chat + essay-assist 503 without it |
| `ADMIN_API_KEY` | **No** | Yes — `src/app/api/admin/catalog-health/route.ts:23` | Undocumented auth control |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | No | **Nowhere** | Phantom — set in `ci.yml:73` and listed in `CLAUDE.md:97`, read by nothing |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | No | Yes — `src/lib/analytics.ts:28` | Undocumented |
| `NEXT_PUBLIC_FLAGGED_PROGRAM_IDS`, `NEXT_PUBLIC_DEMO_PROGRAM_IDS`, `DEMO_PROGRAM_IDS`, `MATCH_DEBUG` | No | Yes | Undocumented |
| `DEMO_USER_PASSWORD`, `DEMO_USER_ID` | No | Yes — `scripts/seed-demo-user.ts` | Undocumented |
| `ADMIN_FUNCTION_SECRET`, `SERVICE_ROLE`, `SERVICE_ROLE_KEY`, `SERVICE_ROLE_URL` | No | Yes — `supabase/functions/*` | Edge-function envs, entirely undocumented |
| `NEXT_PUBLIC_DEMO_EMAIL` | Yes | Yes | OK, but defaults to a real address |
| `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY` | No | **Nowhere** | Dead keys sitting in `.env.local` |

`.env.local` currently holds 10 keys; 3 of them (`DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`,
`VERCEL_OIDC_TOKEN`) are read by nothing in this repo.

### Secrets

`.env.local` is correctly listed in `.gitignore` (lines 4–7, a well-written `.env` / `.env.*` /
`!.env.example` triple) and is **not** in `git ls-files`. That is the good news, and it is where the
good news stops. See findings C1 and C2 — this is the most serious area in the audit.

Service-role blast radius, fully enumerated:

- **`src/` — 1 file:** `src/lib/supabase/service.ts:17`. It has a `typeof window !== 'undefined'`
  throw on line 11 and **zero importers anywhere under `src/`** (verified by grep for both
  `supabase/service` and `createServiceRoleSupabaseClient`). Its only consumer is
  `scripts/seed-students.ts:34`. This is genuinely well contained.
- **`scripts/` — 9 files** read the key directly for seeding and catalogue uploads.
- **`supabase/functions/` — 2 files** read it from the Deno env.

No client-reachable path exists. The blast radius problem is not the code; it is the git history.

### Database change management

33 migrations in `supabase/migrations/`, spanning 2025-02-14 to 2026-07-24. Three legacy patches in
`supabase/patches/`. `supabase/schema.sql` is 2,513 lines; `supabase/seed.sql` is 60.

`scripts/apply-sql.ts` (57 lines) is an honest, well-commented tool that opens a `pg` connection over
`SUPABASE_DB_URL` and executes exactly one file. Its header states the problem plainly:

> *"Deliberately bypasses `supabase db push`: the remote migration-history table is out of sync with
> supabase/migrations (most were applied via the SQL editor), so `db push` would try to replay
> already-applied migrations — including the destructive catalogue normalize."*

**There is no ledger.** No `supabase/README.md`, no `APPLIED.md`, no manifest, no checksum file.
Which of the 33 migrations are live on `alpkbobbasxvubogkark` is knowledge held in a person's head
and in scattered project-memory notes. `apply-sql.ts` does not record what it applied, does not wrap
in a transaction (a partially-applied multi-statement file leaves the DB in an undefined state), and
does not check ordering.

The one genuinely reassuring finding: **`schema.sql` has been kept honest.** I diffed the objects:

```
functions created across all migrations : 20
functions present in schema.sql         : 20
in migrations but missing from schema   : (none)

tables created across all migrations    : 27
tables in schema.sql                    : 36   (36 > 27 because schema.sql also
                                                defines the original core tables)
in migrations but missing from schema   : programs_v, universities_v  (import temp tables)
spot check: chat_conversations, guardian_links, counsellor_decks, shortlisted_programs,
            chat_feedback, help_requests, notifications, saved_searches — ALL present
```

So a fresh environment *can* be provisioned from `schema.sql` + `seed.sql`, and CLAUDE.md's tone
undersells this. The real problems are that (a) nothing verifies it — `schema.sql` was last touched
2026-07-23 while the newest migration is `20260724100000_search_polish.sql`, so it is already at
least one migration behind with no signal; and (b) nobody knows what is on the remote.

Migration idempotency is good — most files have as many or more `IF NOT EXISTS` / `OR REPLACE` /
`DROP ... IF EXISTS` guards than DDL statements, and the team clearly follows the CLAUDE.md rule.

**Deploy ordering is unmanaged.** Migrations ship in the same commit as the code that depends on
them, and `main` auto-deploys:

```
20260723120000_search_facet_indexes  → 58e9bf1 "unified live university-search page"  (29 files)
20260718130000_realtime_publication  → fdce4d9 "Harden checklist/tasks surfaces"      (32 files)
20260716120000_guardian_links        → 1266dc8 "parent portal"                        (32 files)
```

### Testing infrastructure

```
27 *.test.ts(x) files (+ 4 helper/fixture modules)
28 suites, 265 tests, all passing, 5.878s
5,288 test LOC  vs  69,899 src LOC   →  7.6% ratio
```

| Area | src LOC | Coverage |
|---|---|---|
| `src/app` (209 files) | 25,644 | 4 of 23 API routes tested; **zero page tests** |
| `src/components` (141 files) | 25,969 | **1 test file** (`assistant/widget-renderer.test.tsx`) |
| `src/lib` (78 files) | 15,826 | Best covered — matching/scoring, chat tools, search params |
| `src/hooks` (11 files) | 2,276 | 1 test (`use-chat-stream`) |

Well covered: the chat/agentic subsystem (14 test files), scoring/matching, checklist logic,
admin import validation, scholarships, profile export.

Zero coverage: **19 of 23 API routes**, `src/middleware.ts` (the entire auth guard), server actions
in `src/app/profile/actions.ts`, all RLS policies, all counsellor data-layer code
(`src/lib/counsellor/data.ts`), the parent portal, and essentially the whole component tree.

**No e2e or integration layer exists.** `playwright` appears in `package-lock.json` only as a
transitive dependency's own devDependency — there is no `@playwright/test` in `package.json`, no
`playwright.config.*`, no `e2e/` or `cypress/` directory. `.claude/skills/verify/SKILL.md:57`
confirms it explicitly: *"No Playwright/puppeteer in the repo — don't download a browser for a
screenshot; SSR HTML captures are the accepted evidence."* The project-memory note about a
"3-engine Playwright matrix" describes an ad-hoc run that was never committed.

### Observability

**There is none.** No monitoring dependency of any kind in `package.json` — no `@sentry/*`,
`@vercel/analytics`, `@vercel/speed-insights`, `pino`, `winston`, OpenTelemetry, PostHog, Datadog,
LogRocket, or Bugsnag. No `src/instrumentation.ts`. No health/readiness endpoint (the closest is
`/api/admin/catalog-health`, which is a data-integrity check behind `ADMIN_API_KEY`, not a liveness
probe). No log drain. No alerting. No uptime check.

What exists instead:

```
console.*  in src:  91 occurrences across 47 files
                    48 × console.warn
                    40 × console.error
                     2 × console.info
                     1 × the string "console.warns" inside a comment (smooth-scroll.tsx:257)
console.log:        0   — the team is disciplined about not shipping debug logs
```

Top emitters: `assistant-workspace.tsx` (8), `lib/matching/service.ts` (6),
`api/chat/actions/execute/route.ts` (5), `lib/applications/server-actions.ts` (4),
`hooks/use-notifications.ts` (4).

The error-boundary infrastructure is actually *excellent* — 11 `error.tsx` boundaries, a
`global-error.tsx`, a `not-found.tsx`, and 42 `loading.tsx` files. But every one of them is a dead
end: `src/app/global-error.tsx:12` is `console.error('Unhandled global error', error)` and then
renders a friendly page. The error digest is shown to the user (line 26) with no way for anyone to
look it up. Users are literally asked to "capture any steps leading to the error and share them with
support" — the boundary is well built and reports to nobody.

`src/lib/analytics.ts` is a 51-line in-memory pub/sub that `console.info`s in development and POSTs
to `NEXT_PUBLIC_ANALYTICS_ENDPOINT` if set. That variable is undocumented and almost certainly unset,
so `trackEvent` is a no-op in production.

### Release process

- **Branching:** short-lived `feat/*`, `fix/*`, `chore/*`, `ci/*` branches off `main`, squash-ish
  merges via `gh`. `main` is the only long-lived branch; `origin` has exactly `main` and `HEAD`.
- **PR checks:** CI runs and is consistently green (~3 minutes). It is **advisory only** — with no
  branch protection, nothing blocks a merge. The `overlap-guard` job's own comment concedes this
  ("Advisory only — without branch protection no check can block a merge").
- **Code review:** none. `gh pr list --state merged --limit 20` returns `reviewDecision = ""` for
  **all 20** most recent PRs, including #41 (the 21-commit UI token-system rewrite merged today) and
  #30 (the Next 15 / React 19 upgrade clearing 61 CVEs).
- **Versioning:** `package.json` has been `"version": "0.1.0"` since inception. One git tag exists,
  `v0.1.0`. No changelog, no release notes, no conventional-commit tooling.
- **Rollback:** undocumented. The practical mechanism is Vercel's instant rollback in the dashboard,
  which reverts code only — a migration applied by hand for the rolled-back release stays applied,
  with nothing recording that it happened.
- **Preview deploys:** Vercel default (every PR gets one) — pointed at the production Supabase project.
- **Deploy ordering:** merge to `main` triggers deploy immediately; migrations are a separate manual
  human step with no enforced ordering relative to it.

### Repo hygiene

Genuinely clean:

- **No** tracked `.DS_Store` (and none ever committed — verified across all history).
- `tsconfig.tsbuildinfo` exists at root but is **not tracked** and is gitignored (line 8). It was
  removed in `9c310ff`.
- `.vercel/` untracked and gitignored. `Interview Transcripts/` (136 KB) and `transcripts/` (112 KB)
  are gitignored and — verified against `--diff-filter=A` across all history — **were never committed**.
- Repo is small: `size-pack 11.49 MiB`, GitHub `diskUsage 12627 KB`.

Not clean:

- `docs/` tracks 208 KB of generated binaries — 4 `.docx` files and a `.docx.html` — committed
  alongside the `generate_demo_docs.py` / `generate_audience_guides.py` scripts that produce them.
- A 26.38 MB raw CSV blob is stranded in history
  (`supabase/imports/backups/backup-20260503-110515-imports/program_requirements.csv`). It predates
  or fell outside the LFS pattern.
- The submodule `Ascenda-Data-Collection` shows `-00f69872…` in `git submodule status` — the leading
  `-` means **uninitialised**. It is referenced by nothing in the build, mentioned in no
  documentation, and its working directory holds only a README, LICENSE, and `.gitignore`.
- `.vercelignore:2` ignores `Ascenda/` — a directory that does not exist.

---

## Findings

### [CRITICAL] Live service-role key is in git history and has never been rotated

**Evidence.** `.env.local` was tracked between 2025-11-12 and 2026-01-09:

```
$ git log --all --full-history --format='%h %ad %an %s' --date=short -- .env.local
ca0b305 2026-04-16 Greg Franck   Merge homepage-animation-refresh into main for Vercel deployment
9c310ff 2026-01-09 Greg Franck   chore: stop tracking local env and tsbuildinfo
43822d1 2025-11-12 Ascenda123    Merge branch 'main' into codex/build-edtech-web-app-...
e1382bf 2025-11-12 Ascenda123    Update .env.local
823b0a7 2025-11-12 Ascenda123    Update and rename .env.example to .env.local

$ # key names only, values never read out
823b0a7 / e1382bf contained:
  NEXT_PUBLIC_SITE_URL  NEXT_PUBLIC_SUPABASE_ANON_KEY  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

$ # every one of those commits is reachable from the remote default branch
823b0a7 ancestor-of-main: YES     e1382bf ancestor-of-main: YES
9c310ff ancestor-of-main: YES     43822d1 ancestor-of-main: YES
ca0b305 ancestor-of-main: YES

$ git rev-list --objects --all | grep -c '\.env\.local'
2                       # both blobs still live in the packfile
```

Rotation check, performed by SHA-256 comparison so no secret value was ever displayed:

```
leaked-key (823b0a7) sha256: f8cad9cee9eda63b…  len=219
leaked-key (e1382bf) sha256: f8cad9cee9eda63b…  len=219
current .env.local   sha256: f8cad9cee9eda63b…  len=219
SAME AS CURRENT?  YES — KEY NEVER ROTATED
leaked SUPABASE_URL == current SUPABASE_URL (same project)?  YES
```

Compounding: `secret scanning → 404 "Secret scanning is disabled on this repository"`, so GitHub has
never scanned for this and never will until it is enabled.

**Operational failure scenario.** The service role key bypasses every RLS policy on
`alpkbobbasxvubogkark`. Anyone who has ever cloned this repository — a contractor, a former
collaborator, the Codex bot account that authored `823b0a7`, an AI coding agent's cached workspace,
a stolen laptop, a CI runner cache, or a backup of any of those — holds full read/write/delete over
every student profile, academic record, guardian link, counsellor note, and help thread in
production. Making the repo public, or granting one read-only collaborator, converts a latent
exposure into an immediate one. Because there is no observability (H4), exfiltration would leave no
trace anyone would see.

**Fix (in this order, today):**
1. **Rotate the service-role key** in the Supabase dashboard → Settings → API → "Reset service role
   key". Update Vercel (all environments) and local `.env.local`. Rotating the JWT secret also
   invalidates the anon key, so plan for both.
2. Enable **Secret scanning + Push protection** (Settings → Code security). On a private repo this
   needs GitHub Advanced Security or making the repo public; if neither, install `gitleaks` as a CI
   job and a `pre-commit` hook (see the proposed `ci.yml`).
3. Purge the blobs with `git filter-repo --path .env.local --invert-paths` and force-push, then have
   every collaborator re-clone. Do this **after** rotation, never instead of it — assume the key is
   already compromised.
4. Audit the Supabase logs for anomalous service-role usage since 2025-11-12.

---

### [CRITICAL] Production login credentials are committed in plaintext across 8 tracked files

**Evidence.**

```
scripts/seed-students.ts:43                const SEED_PASSWORD = '«SEED_STUDENT_PASSWORD»';
scripts/seed-demo-user.ts:58               const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? '«DEMO_USER_PASSWORD»';
.claude/skills/verify/SKILL.md:39-42       seeded students … / password `«SEED_STUDENT_PASSWORD»`
docs/demo-script.md:11                     | **Login** | `greg@workiflow.com` / `«DEMO_USER_PASSWORD»` |
docs/demo-guide.md:11                      | **Login** | `greg@workiflow.com` / `«DEMO_USER_PASSWORD»` |
docs/demo-flow.md:9                        - Password: `«DEMO_USER_PASSWORD»`
docs/demo-script.docx.html:112             greg@workiflow.com / «DEMO_USER_PASSWORD»
docs/generate_demo_docs.py:185             "login": "greg@workiflow.com / «DEMO_USER_PASSWORD»",
docs/generate_audience_guides.py:364,582   "Include: ascenda-ashy.vercel.app / greg@workiflow.com / «DEMO_USER_PASSWORD»"
```

These are credentials for accounts on the **production** Supabase project, and
`generate_audience_guides.py:582` explicitly instructs staff to hand them to students.

The privilege escalation is documented in the repo itself —
`.claude/skills/verify/SKILL.md:54`:

> *"Counsellor APIs work for ANY signed-in user (`can_act_as_counsellor()` is open for the demo) — a
> seeded student can create decks and assign to itself."*

**Operational failure scenario.** `«SEED_STUDENT_PASSWORD»` opens every `first.last.N+seed@ascenda.demo`
account, and `«DEMO_USER_PASSWORD»` opens the demo account. Because counsellor authorisation is open to
any authenticated user, one of these logins reaches counsellor surfaces — the student roster, help
threads, notes, and applications — for the whole cohort. Registration is disabled
(`src/middleware.ts:52`), which means these shared static passwords are effectively the product's
only credential surface. They cannot be rotated without editing seven documents.

**Fix.**
1. Rotate both passwords now; move them to `DEMO_USER_PASSWORD` / `SEED_PASSWORD` env vars with **no
   fallback default** — fail loudly if unset.
2. Strip the literals from all `docs/` files and both generator scripts; replace with a pointer to a
   password manager entry.
3. Move demo/seed accounts off the production project onto a separate `ascenda-demo` Supabase project
   (see H2), so a leaked demo password cannot reach real student data.
4. Close `can_act_as_counsellor()` — this is already flagged in project memory as a launch blocker.

---

### [HIGH] Dockerfile is broken *and* would bake `.env.local` into an image layer

**Evidence.**

```
Dockerfile:14   COPY . .                                   # no .dockerignore exists
Dockerfile:15   RUN npm run build
Dockerfile:26   COPY --from=builder … /app/.next/standalone ./

$ grep -n "standalone" next.config.mjs     → (no match)
$ ls -d .next/standalone                   → No such file or directory
$ ls -la .dockerignore                     → No such file or directory
```

**Operational failure scenario.** Two separate failures. First, the build **cannot succeed** —
`output: 'standalone'` is absent from `next.config.mjs`, so `.next/standalone` is never produced and
line 26 fails. Anyone reaching for this file in an incident (Vercel outage, a move to Fly/Render/ECS)
finds it broken at exactly the moment they need it, and CLAUDE.md/README give no warning.

Second and worse: line 14 `COPY . .` with no `.dockerignore` copies the **entire working directory**
into the builder layer — including `.env.local` with the (unrotated) service-role key, the
gitignored `Interview Transcripts/` and `transcripts/` research, `.git/` with the full leaked
history, and `node_modules`. The failure on line 26 happens *after* that layer is committed, so the
secret-bearing layer exists in the local Docker cache regardless. Push that image anywhere and the
key ships with it.

**Fix.** Either delete the Dockerfile (honest — Vercel is the deploy target and this is dead
infrastructure), or make it correct:
1. Add `output: 'standalone'` to `next.config.mjs`.
2. Add a `.dockerignore`: `.git`, `.env*`, `node_modules`, `.next`, `Interview Transcripts`,
   `transcripts`, `docs`, `__tests__`, `scripts`, `supabase/imports`, `.vercel`.
3. Align to `node:22-alpine`.
4. Drop the redundant `--legacy-peer-deps` (`.npmrc` already sets it).
5. Add `ARG`/`ENV` for each `NEXT_PUBLIC_*` in the builder stage, and a `HEALTHCHECK`.
6. Build it in CI so it can never silently rot again.

*Recommendation: delete it.* A broken artifact that appears usable is worse than no artifact.

---

### [HIGH] No environment separation — one Supabase project for dev, preview, and production

**Evidence.** A single project ref `alpkbobbasxvubogkark` across `.mcp.json:5`, `.vscode/mcp.json:5`,
`CLAUDE.md:72`, `.claude/settings.json:17,19`, `docs/demo-script.md:15`, `docs/demo-guide.md:21`,
`scripts/import-rich-content.py:21`. `.env.example` defines one set of Supabase vars. No
`vercel.json`. No staging branch (`git branch -a` → `main` only).

**Operational failure scenario.** Every Vercel preview deployment — one per PR, publicly reachable by
URL — is wired to production data. Every `npm run dev` session on a developer laptop writes to
production. Every `npm run seed:students` run creates real rows in the real database. A destructive
migration tested "locally" is tested *on production*. There is no environment in which a schema
change, a data backfill, or an RLS policy edit can be rehearsed. This is also why `db push` became
unsafe in the first place (H5) — with no non-prod target, every migration was applied by hand to the
only database that exists.

**Fix.**
1. Create `ascenda-staging` (and ideally `ascenda-dev`) Supabase projects. Free tier is sufficient
   for schema work.
2. In Vercel, scope `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` per
   environment: Production → prod project, Preview → staging, Development → dev.
3. Point `supabase/schema.sql` + `seed.sql` at staging as the canonical provisioning path, and make
   CI prove it works (see the migration workflow below).
4. Move demo and seed accounts to a non-production project.

---

### [HIGH] No env-var validation — a missing variable is a production 500 on every request

**Evidence.**

```
src/middleware.ts:27-28       process.env.NEXT_PUBLIC_SUPABASE_URL!  / ..._ANON_KEY!
src/app/auth/callback/route.ts:15-16
src/lib/supabase/server.ts:9-10, 33-34, 55-56
```

Plus the drift table in "Current state": `GEMINI_API_KEY` and `ADMIN_API_KEY` are load-bearing and
absent from `.env.example`; `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set in `ci.yml:73` and
documented in `CLAUDE.md:97` but read by no code at all.

**Operational failure scenario.** `src/middleware.ts` runs on every route matched by its 14-prefix
matcher (line 113) — effectively the whole authenticated app. A typo'd or unset
`NEXT_PUBLIC_SUPABASE_URL` in Vercel makes `createServerClient(undefined!, …)` throw *inside
middleware*, on every request, with no page-level error boundary to catch it (boundaries live below
middleware). The result is a hard 500 across the entire product, discovered by a user, not by CI —
because the CI build passes four placeholder values that only need to *exist*. A different failure
mode for `GEMINI_API_KEY`: it degrades silently to a 503 on `/api/essay-assist`
(`route.ts:159-160`) while the rest of the app looks healthy.

**Fix.** A zod env module evaluated at module load, imported from `instrumentation.ts` so it fails at
boot rather than at first request. Full code in the "Target setup" section, plus a CI job that diffs
the schema's key list against `.env.example`.

---

### [HIGH] Zero production observability — 91 `console.*` calls are the entire error pipeline

**Evidence.**

```
$ grep -iE '"(@sentry|@vercel/analytics|pino|winston|@opentelemetry|posthog|datadog|bugsnag)' package.json
NONE — no error tracking or analytics dependency

$ ls src/instrumentation*.ts        → no matches
$ health/readiness endpoint         → none
$ grep -ro "console\.[a-z]*" src | wc -l
91          (48 warn, 40 error, 2 info, 0 log — across 47 files)

src/app/global-error.tsx:12    console.error('Unhandled global error', error);
src/app/global-error.tsx:26    {error?.digest ? <p>Error reference: {error.digest}</p> : null}
```

**Operational failure scenario.** A regression in a Server Component throws for 100% of users on
`/matches`. `src/app/matches/error.tsx` catches it and renders a polite message. Vercel's function
log records a stack trace. No alert fires, no dashboard turns red, no error rate is tracked. The
first signal is a student telling a counsellor, who tells Greg — hours or days later. The user is
shown an error digest that nobody can resolve to a stack trace, and asked to "capture any steps
leading to the error and share them with support". Meanwhile the 48 `console.warn` calls that mark
real degradations (shortlist remote-sync disabling itself, notification poll failures, matching
service fallbacks) scroll past unread.

**Fix.** Adopt Sentry — it has first-class Next 15 App Router support, and the instrumentation seams
already exist in this codebase:

| Seam | Status | Action |
|---|---|---|
| `src/instrumentation.ts` | **missing** | Create — `register()` for server/edge init, plus `onRequestError` |
| `src/instrumentation-client.ts` | missing | Create — browser SDK init |
| `src/app/global-error.tsx:12` | exists, console-only | Add `Sentry.captureException(error)` |
| 11 × `error.tsx` boundaries | exist, console-only | Route through one shared reporter |
| 23 API routes | ad-hoc try/catch | Wrap in a `withRouteErrorReporting()` helper |
| `src/middleware.ts` | unmonitored | Add `Sentry.captureException` in a top-level try/catch |
| `src/lib/analytics.ts:11` | in-memory no-op | Attach a real sink (Sentry breadcrumbs, or PostHog) |
| 91 `console.*` sites | unstructured | Replace with a `logger` that emits structured JSON in prod |
| health endpoint | **missing** | Add `src/app/api/health/route.ts` for uptime monitoring |

---

### [HIGH] Database changes have no ledger, no CI verification, and no deploy ordering

**Evidence.**

```
scripts/apply-sql.ts:3-7   "Deliberately bypasses `supabase db push`: the remote migration-history
                            table is out of sync with supabase/migrations (most were applied via the
                            SQL editor), so `db push` would try to replay already-applied migrations
                            — including the destructive catalogue normalize."

$ ls supabase/*.md supabase/README*    → no matches   (no ledger of any kind)
$ grep -n "sql\|migration" .github/workflows/ci.yml   → no matches   (CI never touches SQL)

schema.sql last touched : 2026-07-23
newest migration        : 20260724100000_search_polish.sql   (2026-07-24)   ← already drifted

migrations ship inside feature commits:
  20260723120000_search_facet_indexes  → 58e9bf1 (29 files changed)
  20260718130000_realtime_publication  → fdce4d9 (32 files changed)
  20260716120000_guardian_links        → 1266dc8 (32 files changed)
```

`apply-sql.ts:46` runs `client.query(sql)` with no surrounding transaction and records nothing.

**Operational failure scenario.** Two distinct failures. (1) **Ordering:** a PR containing both a
migration and the code that needs it merges to `main`. Vercel deploys the code within ~60 seconds.
The migration is a manual human step. In the gap — minutes if the developer is at their desk, hours
if they merged and went to lunch — production runs code that queries a table or column that does not
exist. Every affected page 500s, and per H4 nobody is alerted. (2) **Drift:** because there is no
ledger and `apply-sql.ts` runs outside a transaction, a multi-statement file that fails halfway leaves
the database in a state no artifact in the repo describes. The next engineer cannot determine what is
applied without introspecting production by hand.

**Fix.** Concrete forward-only path in the "Target setup" section — reconcile the history table once,
add a ledger, wrap `apply-sql.ts` in a transaction with a `schema_migrations` insert, and add a CI job
that provisions a throwaway Postgres from `schema.sql` and replays every migration on top.

---

### [HIGH] Nothing gates a merge — CI is advisory and zero PRs are reviewed

**Evidence.**

```
$ gh api repos/Ascenda123/Ascenda/branches/main/protection
403 "Upgrade to GitHub Pro or make this repository public to enable this feature."

$ gh pr list --state merged --limit 20 --json reviewDecision
all 20 → reviewDecision = ""   (NONE)

.github/workflows/ci.yml:20    "Advisory only — without branch protection no check can block a merge."
```

Unreviewed merges include #41 (21 commits, app-wide UI token rewrite, merged today) and #30 (the Next
15 / React 19 upgrade that cleared 61 CVEs).

**Operational failure scenario.** A red CI run does not stop a merge, and `main` auto-deploys to
production. A failing typecheck, a failing test, or a deliberately bypassed check reaches users
directly. The `overlap-guard` job exists precisely because #33 and #34 already landed together
untested — the workaround is good, but it is a warning label on an open door.

**Fix.**
1. **GitHub Team is $4/user/month** and unlocks branch protection + rulesets on private repos. Given
   this repo holds production student PII, this is the cheapest risk reduction available. Enable:
   require PR, require `build` + `overlap-guard` + `security` to pass, require branches up to date
   (which retires `overlap-guard` entirely), require 1 approval, block force-push to `main`.
2. Interim, at zero cost: add a `CODEOWNERS` file and enforce "no self-merge with a red check" by
   convention — weak, but better than nothing.

---

### [HIGH] `.vercelignore` does not exclude `.env.local` or the confidential transcripts

**Evidence.**

```
.vercelignore contents: Ascenda/  supabase/imports/  supabase/.temp/  .next/  node_modules/  .DS_Store

NOT ignored: .env.local
NOT ignored: Interview Transcripts/     (136 KB, gitignored as "Confidential research")
NOT ignored: transcripts/               (112 KB, gitignored as "Confidential research")
NOT ignored: .git/                      (contains the leaked service-role key — finding C1)
NOT ignored: docs/ scripts/ __tests__/ Ascenda-Data-Collection/

.vercel/project.json exists → the project was linked with the Vercel CLI at some point
```

**Operational failure scenario.** `.vercelignore` governs **CLI** deploys (`vercel deploy`), which
upload the working directory, not a git tree — `.gitignore` does not apply. A CLI deploy from this
checkout uploads `.env.local`, both confidential interview-transcript directories, and the `.git`
directory containing the leaked key, into Vercel's build environment. `.vercelignore` line 2 ignoring
a non-existent `Ascenda/` directory suggests it was written against a different layout and never
revisited.

**Fix.** Add `.env*`, `Interview Transcripts/`, `transcripts/`, `.git/`, `Ascenda-Data-Collection/`,
`docs/`, `__tests__/`, `scripts/` to `.vercelignore`; drop the stale `Ascenda/` line. Then disable CLI
deploys entirely in the Vercel project settings so git is the only deploy path.

---

### [MEDIUM] CI has no security gate

No `npm audit` step, no CodeQL workflow, no secret scanning, no `.github/dependabot.yml`. Dependabot
*alerting* is on and all 61 historical alerts are `fixed`, but the remediation was manual (PR #30).
`npm audit` is currently clean — this finding is about the absence of a gate, not a present
vulnerability.

**Failure scenario.** A critical advisory lands against a transitive dependency at 02:00. Nothing
opens a PR; nothing fails a build. It is discovered whenever someone next looks at the alerts tab.

**Fix.** `.github/dependabot.yml` for weekly npm + github-actions updates (grouped), a `security` job
running `npm audit --audit-level=high` and `gitleaks`, and CodeQL. See the proposed `ci.yml`.

---

### [MEDIUM] CI is one serial job with no coverage, parallelism, caching, or budgets

`.github/workflows/ci.yml:51-74` — six sequential steps in one job, ~3m20s. Only `setup-node`'s npm
cache. No `.next/cache` restore, so every build is cold. No coverage instrumentation anywhere.

**Failure scenario.** A PR that deletes tests is green. Coverage can only fall. And as the suite
grows, the serial 3-minute cycle becomes a 10-minute cycle that people learn to merge around.

**Fix.** Split into `setup` → parallel `lint` / `typecheck` / `test` / `build` / `security`, add
`.next/cache` and Jest cache, add `--coverage` with a ratcheting threshold and a bundle-size budget.
Full workflow below.

---

### [MEDIUM] Node version drift across five places, and no `.nvmrc`

```
Dockerfile:1                node:20-alpine
.github/workflows/ci.yml:61 node-version: 22
package.json:6              "engines": { "node": ">=20" }
scripts/setup.sh:7          NODE_VERSION="20"
package.json devDeps        "@types/node": "20.11.0"
local dev machine           v25.2.0
.nvmrc                      does not exist
```

`ci.yml:57-60` explains that Node ≥22 is *required* because `jest.environment-node.js` exists to
strip globals Node 22 introduced — "on Node 20 that wrapper is a no-op — so CI never exercised the
path every developer machine actually takes." Yet `engines` still allows 20, `setup.sh` installs 20,
and `@types/node` types the app against 20's stdlib.

**Failure scenario.** A new developer runs `./scripts/setup.sh`, gets Node 20, and the test suite
passes for reasons that differ from CI's. Or Vercel's default Node version drifts from CI's and a
build that was green fails in production.

**Fix.** Add `.nvmrc` with `22`, set `"engines": { "node": ">=22 <23" }`, bump `@types/node` to `^22`,
change `setup.sh` to `NODE_VERSION="22"`, `Dockerfile` to `node:22-alpine`, and pin Vercel's Node
version to 22 in project settings.

---

### [MEDIUM] Test pyramid is a stub — 7.6% test-to-source ratio, no e2e, no coverage floor

5,288 test LOC against 69,899 src LOC. 19 of 23 API routes untested. `src/components` (25,969 LOC,
141 files) has exactly one test file. `src/middleware.ts` — the entire authentication and onboarding
guard, 114 lines of redirect logic with a 14-prefix matcher — has zero tests. No RLS tests. No e2e.

**Failure scenario.** The auth-bypass bug already documented in `CLAUDE.md:122` (middleware at the
repo root, silently ignored by Next, shipped to production) is precisely the class of bug an e2e
smoke test catches in 20 seconds and a unit suite never catches at all. Nothing in the current
pipeline would catch its recurrence.

**Fix.** Target pyramid and CI gates below.

---

### [MEDIUM] Git LFS is undocumented, unfetched by CI, and contradicted by `.gitignore`

```
.gitattributes:1        supabase/imports/*.csv filter=lfs diff=lfs merge=lfs -text
.gitignore:20           supabase/imports/**/*.csv        ← contradicts the above
$ git lfs ls-files      program_requirements.csv (27.6 MB), universities.csv  — both LFS pointers
$ grep -n lfs .github/workflows/ci.yml    → no match  (actions/checkout defaults to lfs: false)
$ grep -rn "lfs\|LFS" README.md CLAUDE.md → NOT DOCUMENTED
```

**Failure scenario.** A new developer clones without `git-lfs` installed and gets 130-byte pointer
files where 27 MB of catalogue data should be; scripts reading them fail with confusing parse errors.
CI likewise checks out pointers. This is harmless today because nothing in the build reads the CSVs —
but the moment a test or build step does, CI breaks in a way that is very hard to diagnose. The
`.gitignore` line also means a regenerated CSV silently will not be committed.

**Fix.** Document the `git lfs install` prerequisite in README; add `lfs: true` to `actions/checkout`
(or explicitly assert CI does not need them); and resolve the `.gitignore` / `.gitattributes`
contradiction in favour of one intent.

---

### [MEDIUM] `.claude/settings.json` is a committed allowlist with a hardcoded key and broad grants

```
.claude/settings.json:19   "Bash(curl … -H 'apikey: eyJhbGciO…')"   ← anon JWT literal
.claude/settings.json:21   "Bash(git push:*)"
.claude/settings.json:52   "Bash(npm i *)"          ← arbitrary package installation
.claude/settings.json:38   "Bash(python3)"          ← arbitrary code execution
.claude/settings.local.json  "Bash(npm run db:apply:*)"   ← unattended production migrations
```

**Failure scenario.** These are repo-wide grants that apply to every agent session any contributor
runs. `Bash(npm i *)` plus `Bash(git push:*)` is a supply-chain path: a prompt-injected agent can
install a package and push. `npm run db:apply:*` in `settings.local.json` permits unattended writes
to the production database. The anon key on line 19 is low-severity on its own but will be
invalidated by the JWT-secret rotation in C1 and should not be a literal.

**Fix.** Remove the key literal; narrow `Bash(npm i *)` to specific packages or drop it; move
`git push` and `db:apply` out of the allowlist so they require confirmation; keep machine-specific
grants in `settings.local.json` (which should be gitignored) rather than the shared file.

---

### [MEDIUM] No versioning, changelog, or documented rollback

`package.json` has been `0.1.0` since inception; one tag `v0.1.0`; no `CHANGELOG.md`; no release
notes; rollback is undocumented.

**Failure scenario.** A bad deploy needs reverting at 22:00. The only lever is Vercel's dashboard
rollback, which reverts code but not the migration that shipped with it — the reverted code now runs
against a schema it does not expect. Nobody can say which release introduced a regression because
there are no releases.

**Fix.** Adopt Changesets or `release-please` on conventional commits (the repo already writes
`feat:`/`fix:`/`chore:` consistently), tag each production deploy, and write a `docs/runbook.md`
covering rollback, migration reversal, and key rotation.

---

### [MEDIUM] `scripts/import-rich-content.py` hardcodes a key and another developer's home directory

```
scripts/import-rich-content.py:21   SUPABASE_URL = "https://alpkbobbasxvubogkark.supabase.co"
scripts/import-rich-content.py:22-26  ANON_KEY = ( "eyJhbGciO…" "eyJpc3MiO…" "Wp12Pb…" )
scripts/import-rich-content.py:27   CSV_PATH = "/Users/rubenkahn/Documents/Claude_Ascenda/all_countries_programs.csv"
```

The key is split across three concatenated string literals, which is exactly the pattern that defeats
naive secret scanners. The script is unrunnable by anyone but its original author.

**Fix.** Read `SUPABASE_URL` / `SUPABASE_ANON_KEY` and the CSV path from env or `argv`; delete the
literals; or delete the script if the import is complete.

---

### [LOW] Repo hygiene odds and ends

| Item | Evidence | Fix |
|---|---|---|
| 26.38 MB raw CSV in history | `supabase/imports/backups/…/program_requirements.csv` — outside the `.gitattributes` LFS glob | Purge during the C1 `filter-repo` pass |
| Stale `.vercelignore` entry | `.vercelignore:2` ignores `Ascenda/`; no such directory | Delete the line |
| Unused dependency | `openai` in `package.json:57`; `grep "from 'openai'" src scripts` → not imported | Remove |
| Generated binaries committed | 4 `.docx` + 1 `.docx.html` in `docs/` (208 KB) alongside their generator scripts | Move to Drive; keep the generators |
| Uninitialised submodule | `git submodule status` → `-00f69872…`; referenced by no build step or doc | Remove or document its purpose |
| README is stale | Says "Next.js 14" (repo is on 15.5.21), cites `@supabase/auth-helpers-nextjs` (uses `@supabase/ssr`), "next-intl scaffolding" (not a dependency), duplicate step "4" in the Database section | Rewrite |
| `npm test` in CI lacks `--ci` | `ci.yml:66` | Add `--ci --coverage` and a JUnit reporter for PR annotations |
| Global `legacy-peer-deps` | `.npmrc:1` | Audit whether it is still needed post-React-19; remove if not |

---

## Target DevOps setup

### 1. Proposed `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

env:
  NODE_VERSION: '22'

jobs:
  # Retire this job once GitHub Team + "require branches to be up to date" is on.
  overlap-guard:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
      - name: Fail if base moved under this PR in shared files
        env:
          BASE: ${{ github.base_ref }}
        run: |
          git fetch --no-tags origin "+refs/heads/${BASE}:refs/remotes/origin/${BASE}"
          merge_base=$(git merge-base HEAD "origin/${BASE}")
          git diff --name-only "$merge_base" HEAD            | sort > /tmp/pr-files
          git diff --name-only "$merge_base" "origin/${BASE}" | sort > /tmp/base-files
          comm -12 /tmp/pr-files /tmp/base-files > /tmp/overlap
          if [ -s /tmp/overlap ]; then
            echo "::error::${BASE} moved under this PR in files it also changes."
            sed 's/^/  /' /tmp/overlap
            exit 1
          fi

  # One install, cached and shared by every downstream job.
  setup:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    outputs:
      cache-key: ${{ steps.key.outputs.value }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - id: key
        run: echo "value=node-modules-${{ runner.os }}-${{ env.NODE_VERSION }}-${{ hashFiles('package-lock.json') }}" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v4
        id: modules
        with:
          path: node_modules
          key: ${{ steps.key.outputs.value }}
      - if: steps.modules.outputs.cache-hit != 'true'
        run: npm ci

  lint:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      - run: npm run lint -- --max-warnings=0

  typecheck:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      - run: npm run typecheck

  test:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 12
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      - run: npm test -- --ci --coverage --shard=${{ matrix.shard }}/2 --reporters=default --reporters=jest-junit
        env:
          JEST_JUNIT_OUTPUT_NAME: junit-${{ matrix.shard }}.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-${{ matrix.shard }}
          path: |
            coverage/
            junit-*.xml

  coverage-gate:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
      - uses: actions/download-artifact@v4
        with: { pattern: coverage-*, merge-multiple: true, path: coverage }
      # Ratchet: raise these numbers, never lower them.
      - name: Enforce coverage floor
        run: npx nyc report --reporter=text-summary --check-coverage
             --lines 40 --statements 40 --functions 35 --branches 30

  build:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      # Warm Next's incremental build cache — this is the single biggest CI win.
      - uses: actions/cache@v4
        with:
          path: .next/cache
          key: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ hashFiles('src/**/*.[jt]s', 'src/**/*.[jt]sx') }}
          restore-keys: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
          NEXT_PUBLIC_SITE_URL: http://localhost:3000
          GEMINI_API_KEY: placeholder-gemini-key
      - uses: actions/upload-artifact@v4
        with: { name: next-build, path: .next, retention-days: 3 }

  bundle-budget:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
      - uses: actions/download-artifact@v4
        with: { name: next-build, path: .next }
      # First-load JS budget. Start at today's number + 10%, then ratchet down.
      - name: Assert first-load JS budget
        run: |
          MAX_KB=300
          TOTAL=$(node -e "
            const m=require('./.next/build-manifest.json');
            const s=new Set(Object.values(m.pages).flat().concat(m.rootMainFiles||[]));
            const fs=require('fs');
            let b=0; for (const f of s) { try { b+=fs.statSync('.next/'+f).size } catch {} }
            console.log(Math.round(b/1024));
          ")
          echo "Shared first-load JS: ${TOTAL} KB (budget ${MAX_KB} KB)"
          [ "$TOTAL" -le "$MAX_KB" ] || { echo '::error::Bundle budget exceeded'; exit 1; }

  # Fails on env drift: any key the zod schema requires must exist in .env.example.
  env-schema:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      - run: npx tsx scripts/check-env-example.ts

  # Provisions a throwaway Postgres, applies schema.sql, then replays every
  # migration on top. Catches broken SQL and schema.sql drift before merge.
  migrations:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 12
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ascenda_ci
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v5
      - name: Apply schema.sql, then replay all migrations
        env:
          PGPASSWORD: postgres
          DB: postgresql://postgres:postgres@localhost:5432/ascenda_ci
        run: |
          psql "$DB" -v ON_ERROR_STOP=1 -f supabase/schema.sql
          for f in supabase/migrations/*.sql; do
            echo "→ $f"
            psql "$DB" -v ON_ERROR_STOP=1 -1 -f "$f"   # -1 = single transaction
          done
      - name: Assert schema.sql is not behind the migrations
        env:
          PGPASSWORD: postgres
          DB: postgresql://postgres:postgres@localhost:5432/ascenda_ci
        run: |
          # Every migration is idempotent by house rule; a second pass that
          # changes anything means schema.sql did not already contain it.
          pg_dump --schema-only --no-owner --no-privileges "$DB" > /tmp/after-migrations.sql
          psql "$DB" -v ON_ERROR_STOP=1 -f supabase/schema.sql
          for f in supabase/migrations/*.sql; do psql "$DB" -v ON_ERROR_STOP=1 -1 -f "$f"; done
          pg_dump --schema-only --no-owner --no-privileges "$DB" > /tmp/after-replay.sql
          diff -u /tmp/after-migrations.sql /tmp/after-replay.sql \
            || { echo '::error::Migrations are not idempotent'; exit 1; }

  security:
    needs: setup
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      - name: Dependency advisories
        run: npm audit --audit-level=high
      - name: Secret scan (full history)
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Fail on committed .env files
        run: |
          if git ls-files | grep -E '^\.env' | grep -v '^\.env\.example$'; then
            echo '::error::A .env file is tracked'; exit 1
          fi

  e2e:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22', cache: npm }
      - uses: actions/cache@v4
        with: { path: node_modules, key: '${{ needs.setup.outputs.cache-key }}' }
      - uses: actions/download-artifact@v4
        with: { name: next-build, path: .next }
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          # Staging project — NEVER production. See finding H2.
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }

  # Single required status check — point branch protection at this one job.
  ci-ok:
    if: always()
    needs: [lint, typecheck, test, coverage-gate, build, bundle-budget, env-schema, migrations, security, e2e]
    runs-on: ubuntu-latest
    steps:
      - name: Fail if any needed job failed
        run: |
          echo '${{ toJSON(needs) }}' | node -e "
            let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
              const n=JSON.parse(s);
              const bad=Object.entries(n).filter(([,v])=>v.result!=='success'&&v.result!=='skipped');
              if (bad.length) { console.error('Failed:', bad.map(([k])=>k).join(', ')); process.exit(1); }
              console.log('All checks passed.');
            });"
```

And `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly, day: monday }
    open-pull-requests-limit: 5
    groups:
      react:     { patterns: ['react', 'react-dom', '@types/react', '@types/react-dom'] }
      radix:     { patterns: ['@radix-ui/*'] }
      tiptap:    { patterns: ['@tiptap/*'] }
      dev-minor: { dependency-type: development, update-types: [minor, patch] }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

### 2. Env validation module

Create `src/lib/env.ts`. `zod@3.22.4` is already a dependency — no new install.

```ts
// src/lib/env.ts
//
// Single source of truth for environment configuration. Evaluated at module
// load, so a missing or malformed variable fails at BOOT with a readable list
// of exactly what is wrong — not at first request inside middleware, where the
// failure is a 500 on every page with no error boundary above it.
//
// Import `serverEnv` only from server code. `clientEnv` is safe anywhere:
// Next inlines NEXT_PUBLIC_* at build time, so it must reference each variable
// by its full literal name (process.env[key] is NOT statically replaced).

import { z } from 'zod';

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: z.string().min(1).default('application-documents'),
  NEXT_PUBLIC_DEMO_EMAIL: z.string().email().optional(),
  NEXT_PUBLIC_ANALYTICS_ENDPOINT: z.string().url().optional(),
  NEXT_PUBLIC_DEMO_PROGRAM_IDS: z.string().optional(),
  NEXT_PUBLIC_FLAGGED_PROGRAM_IDS: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Deployment target, so code can refuse to do destructive things in prod.
  APP_ENV: z.enum(['development', 'preview', 'staging', 'production']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_DB_URL: z.string().url().optional(),   // scripts only
  SUPABASE_PROJECT_ID: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1),              // chat + essay-assist hard-depend on this
  ADMIN_API_KEY: z.string().min(16).optional(),
  MATCH_DEBUG: z.enum(['0', '1']).optional(),
});

// NEXT_PUBLIC_* must be referenced literally for Next's build-time inlining.
const rawClient = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  NEXT_PUBLIC_DEMO_EMAIL: process.env.NEXT_PUBLIC_DEMO_EMAIL,
  NEXT_PUBLIC_ANALYTICS_ENDPOINT: process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT,
  NEXT_PUBLIC_DEMO_PROGRAM_IDS: process.env.NEXT_PUBLIC_DEMO_PROGRAM_IDS,
  NEXT_PUBLIC_FLAGGED_PROGRAM_IDS: process.env.NEXT_PUBLIC_FLAGGED_PROGRAM_IDS,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

const fail = (scope: string, error: z.ZodError): never => {
  const lines = error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(
    `Invalid ${scope} environment configuration:\n${lines.join('\n')}\n\n` +
      `Copy .env.example to .env.local and fill these in, or set them in the Vercel ` +
      `project settings for this environment.`
  );
};

const clientParsed = clientSchema.safeParse(rawClient);
if (!clientParsed.success) fail('client', clientParsed.error);
export const clientEnv = clientParsed.data;

// The build step lints and compiles without server secrets, so skip the server
// half during `next build` and validate it at runtime boot instead.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

let _serverEnv: z.infer<typeof serverSchema> | null = null;
export const serverEnv = (): z.infer<typeof serverSchema> => {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must never be called in the browser');
  }
  if (_serverEnv) return _serverEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    if (isBuildPhase) return (_serverEnv = {} as never);  // tolerated at build time only
    fail('server', parsed.error);
  }
  return (_serverEnv = parsed.data!);
};

// The list CI diffs against .env.example.
export const REQUIRED_KEYS = [
  ...Object.keys(clientSchema.shape),
  ...Object.keys(serverSchema.shape),
] as const;
```

Wire it up at boot — create `src/instrumentation.ts` (Next calls `register()` once per runtime,
before any request is served):

```ts
// src/instrumentation.ts
export async function register() {
  // Importing the module runs the schema. A bad config crashes the server on
  // start, which Vercel surfaces as a failed deploy — not a 500 on every page.
  const { clientEnv, serverEnv } = await import('@/lib/env');
  void clientEnv;
  if (process.env.NEXT_RUNTIME === 'nodejs') void serverEnv();

  if (process.env.NEXT_RUNTIME === 'nodejs')      await import('../sentry.server.config');
  else if (process.env.NEXT_RUNTIME === 'edge')   await import('../sentry.edge.config');
}

export { onRequestError } from '@sentry/nextjs';
```

Then replace the 10 non-null assertions. `src/middleware.ts:27-28` becomes:

```ts
import { clientEnv } from '@/lib/env';
const supabase = createServerClient<Database>(
  clientEnv.NEXT_PUBLIC_SUPABASE_URL,
  clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { cookies: { /* unchanged */ } }
);
```

Finally `scripts/check-env-example.ts`, the CI drift guard:

```ts
// scripts/check-env-example.ts — fails CI when .env.example drifts from the schema.
import { readFileSync } from 'node:fs';
import { REQUIRED_KEYS } from '../src/lib/env';

const documented = new Set(
  readFileSync('.env.example', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1])
    .filter((k): k is string => Boolean(k))
);

const missing = REQUIRED_KEYS.filter((k) => !documented.has(k));
const extra = [...documented].filter((k) => !REQUIRED_KEYS.includes(k as never));

if (missing.length) console.error(`Missing from .env.example: ${missing.join(', ')}`);
if (extra.length)   console.error(`In .env.example but not in the schema: ${extra.join(', ')}`);
if (missing.length || extra.length) process.exit(1);
console.log(`.env.example is in sync (${REQUIRED_KEYS.length} keys).`);
```

Running this today would immediately fail on `GEMINI_API_KEY` and `ADMIN_API_KEY` (missing) and
`SUPABASE_URL` (documented but superseded) — which is the point.

### 3. Migration workflow — getting back to forward-only

**Phase 1 — reconcile once (one afternoon, done by a human with the dashboard open).**

1. Snapshot production: `pg_dump --schema-only` from the pooler host. Commit it as
   `supabase/baseline/2026-08-01-production-schema.sql`. This is the ground truth nobody currently has.
2. Diff that dump against `supabase/schema.sql`. Reconcile until they match, and fix `schema.sql`
   (which is already only ~1 migration behind, so this should be small).
3. Create `supabase/MIGRATIONS.md` — the missing ledger:

   ```markdown
   # Migration ledger

   Baseline: `supabase/baseline/2026-08-01-production-schema.sql`
   Everything below the baseline line is folded into the baseline; do not re-apply.

   | Migration | Applied to prod | Applied to staging | By | Notes |
   |---|---|---|---|---|
   | 20260724100000_search_polish | 2026-07-24 | — | greg | last pre-baseline |
   | ——— BASELINE 2026-08-01 ——— | | | | |
   | 20260802120000_example | pending | 2026-08-02 | | |
   ```

4. Seed the remote `supabase_migrations.schema_migrations` table with every version at or below the
   baseline, so `supabase db push` stops wanting to replay them. Verify with
   `supabase migration list` (it prints local vs remote side by side). Once that is clean,
   **`db push` is safe again** and `apply-sql.ts` becomes the exception, not the rule.

**Phase 2 — harden the tool.** Wrap `scripts/apply-sql.ts:46` in a transaction and record the
application:

```ts
await client.query('BEGIN');
try {
  await client.query(sql);
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name)
     VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
    [version, basename(file)]
  );
  await client.query('COMMIT');
} catch (e) { await client.query('ROLLBACK'); throw e; }
```

**Phase 3 — CI verification.** The `migrations` job in the proposed workflow spins up
`postgres:15`, applies `schema.sql`, replays all 33 migrations with `-v ON_ERROR_STOP=1 -1`, then
replays them a second time and diffs `pg_dump --schema-only`. That single job would catch: broken
SQL, non-idempotent migrations (violating the house rule in `CLAUDE.md:117`), and `schema.sql` drift
— none of which anything catches today.

**Phase 4 — deploy ordering.** Adopt expand/contract and make it a rule in `CLAUDE.md`:

1. **Expand** — additive migration (new nullable column, new table, new function). Apply to staging,
   then production. Ship alone, in its own PR, with no application code.
2. **Migrate** — application code that writes both old and new, or tolerates both. Merge and deploy.
3. **Contract** — a follow-up migration that drops the old shape, only after the new code is live and
   stable.

This removes the window entirely: production code never depends on a migration that has not already
been applied. Add a PR-template checkbox: *"Contains a migration? Applied to staging ☐ / production ☐
BEFORE merge."*

### 4. Observability stack

| Layer | Tool | Insertion point |
|---|---|---|
| Error tracking | `@sentry/nextjs` | `src/instrumentation.ts` (`register` + `onRequestError`), `src/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` |
| Boundary reporting | Sentry | `src/app/global-error.tsx:12` — replace `console.error` with `Sentry.captureException(error)`; same in the 11 route `error.tsx` files via one shared `<ErrorState>` reporter |
| API errors | Sentry + structured log | A `withRouteErrorReporting()` wrapper applied to all 23 `route.ts` handlers |
| Auth-layer errors | Sentry | Top-level try/catch in `src/middleware.ts` |
| Structured logs | `pino` (or plain JSON `console`) | Replace the 91 `console.*` sites with `logger.warn({ scope, ...ctx }, msg)`; add a Vercel log drain |
| Performance | `@vercel/speed-insights` + `@vercel/analytics` | `src/app/layout.tsx` |
| Product analytics | PostHog | `src/lib/analytics.ts:11` — attach a real sink to the existing `trackEvent` seam, which is already called throughout the app |
| Uptime | `src/app/api/health/route.ts` + BetterStack/Vercel monitor | New route: returns `{ ok, version, supabase: 'up'|'down' }` after a 1-row `select` |
| Release tracking | Sentry releases | CI sets `SENTRY_RELEASE` to the commit SHA; upload sourcemaps so digests resolve to real stack traces |

Minimum viable version, in priority order: (1) Sentry with `instrumentation.ts` + `global-error.tsx`;
(2) `/api/health` + an external uptime monitor; (3) a Vercel log drain; (4) alert rules on error rate
and 5xx.

### 5. Branch and release policy

```
main ────────●────────●────────●────────●──────▶  auto-deploys to production
              ╲      ╱ ╲      ╱
               ●────●   ●────●        feat/*, fix/*, chore/*  (short-lived, ≤3 days)
                                       └─ Vercel preview → STAGING Supabase
```

- `main` is protected: no direct pushes, no force-push, linear history.
- Required check: the single `ci-ok` job. Require branches up to date (retires `overlap-guard`).
- Require 1 approving review. For a solo maintainer, require the CI check plus a self-review pass
  documented in the PR body — and revisit once there is a second engineer.
- `CODEOWNERS` covering `supabase/`, `.github/`, `src/middleware.ts`, and `src/lib/supabase/`.
- Conventional commits (already the de facto standard here) → `release-please` opens a release PR
  that bumps `package.json`, writes `CHANGELOG.md`, and tags on merge.
- Tag every production deploy; record the SHA in Sentry as the release.
- `docs/runbook.md`: rollback (Vercel instant rollback + the migration caveat), key rotation, incident
  triage, and on-call contact.

### 6. Test pyramid and gates

```
            ▲
      e2e   │  8–12 Playwright specs                      target ~2 min
            │  login → dashboard → search → shortlist → application
            │  role guards: student cannot reach /admin, parent scoping
            │  a11y: axe scan on the 6 highest-traffic routes
            ├──────────────────────────────────────────────
integration │  23 API route tests (currently 4)           target ~30 s
            │  middleware redirect matrix (currently 0)
            │  RLS policy tests against ephemeral Postgres (currently 0)
            │  server actions (currently 0)
            ├──────────────────────────────────────────────
    unit    │  265 tests today — keep, and extend to        target <10 s
            │  counsellor/data.ts, parent scoping,
            │  and the ~140 untested components
            ▼
```

Gates, ratcheting quarterly:

| Gate | Now | Q1 target | Enforcement |
|---|---|---|---|
| Line coverage | unmeasured | 40% → 60% | `coverage-gate` job |
| API routes with a test | 4 / 23 | 23 / 23 | `migrations`-style enumeration check |
| e2e smoke suite | 0 | 8 critical paths | `e2e` job, blocking |
| a11y violations on key routes | unmeasured | 0 serious/critical | `@axe-core/playwright` in `e2e` |
| First-load JS | unmeasured | budget + 0% growth | `bundle-budget` job |
| Middleware auth tests | 0 | full redirect matrix | unit + e2e |

---

## Effort

| # | Finding | Effort | Risk if not done |
|---|---|---|---|
| C1 | Rotate service-role key; enable secret scanning; purge history | **S** (rotate: 30 min) / **M** (purge + re-clone) | **Critical** — total production data compromise, silent |
| C2 | Rotate demo/seed passwords; strip from 8 tracked files | **S** | **Critical** — anyone with repo access reaches counsellor surfaces on live data |
| H1 | Delete the Dockerfile (or fix `standalone` + add `.dockerignore`) | **S** delete / **M** fix | **High** — secrets baked into image layers; broken fallback deploy path |
| H2 | Staging + dev Supabase projects; scope Vercel env per environment | **L** | **High** — every PR preview and every `npm run dev` writes to production |
| H3 | `src/lib/env.ts` + `instrumentation.ts` + `check-env-example.ts` | **M** | **High** — a missing var is a 500 on every authenticated page |
| H4 | Sentry + health endpoint + log drain + structured logger | **M** (Sentry: half a day) / **L** (91 log sites) | **High** — production failures discovered by users, not engineers |
| H5 | Reconcile migration history, add ledger, transactional `apply-sql`, CI replay job | **L** | **High** — deploy-ordering outages; nobody knows what is applied |
| H6 | GitHub Team + branch protection + required `ci-ok` + review policy | **S** ($4/user/mo) | **High** — red builds and unreviewed code reach production |
| H7 | Fix `.vercelignore`; disable CLI deploys | **S** | **High** — secrets and confidential research uploaded on CLI deploy |
| M1 | `dependabot.yml` + `security` job (`npm audit`, gitleaks, CodeQL) | **S** | Medium — advisories found manually, or not at all |
| M2 | Rewrite `ci.yml`: parallel jobs, caching, coverage, budgets | **M** | Medium — no coverage floor; CI slows as suite grows |
| M3 | Pin Node 22 everywhere; add `.nvmrc`; bump `@types/node` | **S** | Medium — CI and local diverge; Vercel drift |
| M4 | Playwright e2e + route/middleware/RLS integration tests | **XL** | Medium — auth-bypass-class bugs reach production |
| M5 | Document LFS; add `lfs: true` to checkout; fix gitignore conflict | **S** | Medium — confusing clone failures; regenerated CSVs silently dropped |
| M6 | Clean `.claude/settings.json`; gitignore `settings.local.json` | **S** | Medium — broad agent grants incl. `git push` and `db:apply` |
| M7 | `release-please` + `CHANGELOG.md` + `docs/runbook.md` | **M** | Medium — no rollback story, no release traceability |
| M8 | Parameterise `scripts/import-rich-content.py` | **S** | Medium — hardcoded key; unrunnable by anyone else |
| L1–L8 | Repo hygiene: purge 26 MB blob, stale `.vercelignore` line, `openai` dep, docx artifacts, submodule, README rewrite, `--ci` flag, `.npmrc` audit | **S** each | Low — friction and confusion |

**Suggested sequencing.** Day 1: C1, C2, H7 (all `S`, all security). Week 1: H6, M1, M3, M6, H1.
Week 2–3: H3, H4. Month 1: H5, M2, M7. Quarter: H2, M4.

---

## Unverified

One item I could not confirm and the user should check directly: **the actual Vercel environment
variable configuration.** The Vercel CLI is installed (v50.32.5) but not authenticated on this
machine (`vercel env ls` → "No existing credentials found"). Everything in this report about Vercel
env vars is inferred from `.env.example`, `ci.yml`, `.vercel/project.json`, and code reads. Worth
running `vercel login && vercel env ls` to confirm which variables exist in Production vs Preview vs
Development — and in particular whether `GEMINI_API_KEY` and `ADMIN_API_KEY` are set in Production,
since neither is documented anywhere.
