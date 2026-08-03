# Review 03 — the nine unapplied migrations, `schema.sql`, `MIGRATIONS.md`

Adversarial review of `git diff origin/main...HEAD -- supabase/` on `security/phase0-contain`.

---

## 0. Did I get a real Postgres? YES.

Docker was unavailable (`docker info` fails) and no Postgres server binary was
installed — the `libpq` keg ships `initdb`/`pg_ctl` but **no `postgres` backend**, so
`initdb` alone was useless. I installed `postgresql@16` via Homebrew and ran a
throwaway cluster:

```
PostgreSQL 16.14 (Homebrew) on aarch64-apple-darwin25.6.0
data dir: <scratchpad>/pgdata   socket: /tmp/pgs501   port: 55432
```

Six disposable databases were created and destroyed. **Production was never
contacted; `npm run db:apply` was never run; no tracked file was modified.**

Everything below marked VERIFIED or FALSE was **executed**, not reasoned about.
Two RLS harnesses were used: `auth.uid()` reading `request.jwt.claims->>'sub'`
(the real Supabase shape), `SET ROLE authenticated`, and Supabase's default
`GRANT ALL ON ALL TABLES ... TO authenticated`.

---

## 1. Verdict

**Do not apply the set as it stands.** The nine files are individually
well-built — they replay cleanly and are genuinely idempotent — but **two of
them combine to break a live product flow**, one aborts against a plausible
production state, and the CI job written to catch exactly this class of problem
cannot go green.

Ranked:

| # | Severity | Finding |
|---|---|---|
| **1** | **CRITICAL** | `20260801122000` + `20260802110000` together make **every help request from an unassigned student fail**. Demonstrated. |
| **2** | **HIGH** | `20260802100000` aborts if `shortlisted_programs` is absent from the remote — which the repo itself says is unknown. Demonstrated. |
| **3** | **HIGH** | `20260802130000` aborts on a single notification with an empty title; its pre-check misses that case. Demonstrated. |
| **4** | **HIGH** | Applying `20260801120000` with `policy.ts:145` / `:162` still `true` empties `/counsellor` **and the entire `/parent` portal**, silently. |
| **5** | **MEDIUM** | The CI `database` job **cannot pass**, for three reasons none of which is documented. Demonstrated. |
| **6** | **MEDIUM** | The **F0 hole was not backported into `schema.sql`** — the one fix that most needed backporting is the one that was skipped. |
| **7** | **MEDIUM** | `20260801110000`'s verification aborts if the remote carries any `FOR ALL`/`DELETE` policy on `profiles` that `schema.sql` does not know about. Demonstrated. |
| **8** | **LOW** | Production lock window on `programs`, measured at 11.6 s locally at real row counts. |
| **9** | **LOW** | `MIGRATIONS.md` §5 is stale and its blocker list is wrong. |

The good news is real and worth stating: **the headline security fix works.** I
reproduced the privilege escalation on a pre-migration database, then failed to
reproduce it through five different attack vectors after applying the set.

---

## 2. What actually ran

### 2.1 `schema.sql` from scratch — PASSES

Against the CI stub verbatim: **exit 0**, no errors. The `recognition_score`
addition does fix the abort it was written to fix. Claim VERIFIED.

### 2.2 The CI `database` job, replicated exactly — FAILS

**Exact first failure:**

```
supabase/migrations/20260512120000_help_requests_and_notifications.sql:52
ERROR:  publication "supabase_realtime" does not exist
```

The stub the author just rewrote is still insufficient. It correctly adds
`auth.users.email` and the `storage` schema (the two blockers `MIGRATIONS.md`
§5 lists), but not the `supabase_realtime` publication, which
`20260512120000:52-53` and `20260513120000:63-65` write to **unguarded**.
`schema.sql` guards its own use with `if exists (select 1 from pg_publication ...)`
(`schema.sql:1506`); those two migrations do not.

Adding the publication to the stub exposes three more, all in **pre-existing**
migrations rather than the nine under review:

| File:line | Pass | Error |
|---|---|---|
| `20260512120000:52` | 1 & 2 | `relation "help_requests" is already member of publication "supabase_realtime"` — `alter publication ... add table` is not idempotent |
| `20260513120000:63` | 1 & 2 | same, `help_messages` |
| `20260723120000:21` | 1 & 2 | `column "recognition_score" does not exist` |
| `20250308120000:429` | 2 | `relation "programs" already exists` — the catalogue normalize is not idempotent |

**The `recognition_score` one matters for this branch specifically.** The
`schema.sql` edit does *not* make the replay pass, because
`20250308120000:423-427` renames `universities` → `archive_raw_universities`
and `universities_v2` → `universities`, and `universities_v2`
(`20250308120000:32`) has no `recognition_score` column. Whatever `schema.sql`
declares is discarded the moment that migration replays. The CI job's own
header comment — "schema.sql aborts partway (it indexes a column its own CREATE
TABLE never declares)" — describes a fix that is real but insufficient for the
job it was added to.

### 2.3 `schema.sql` → the nine new migrations, three consecutive passes — ALL PASS

```
PASS 1 / PASS 2 / PASS 3   ok × 9 each
```

Every one of the nine applies, and **re-applies twice more with no error**, on a
database that already contains the backported `schema.sql` content. This
directly answers the "realistic path" question: **re-applying a migration whose
content is already in `schema.sql` succeeds.** Claim VERIFIED.

### 2.4 The repo's own gate files

- `__tests__/db/rls-negative-cases.sql` — with all nine applied, **every
  negative case passes**. The only failure is `[3.3] fixture problem: student A
  has no student_matches rows to clear`, an artefact of my empty catalogue.
  This file is well built: when I first ran it under a mis-shaped `auth.uid()`
  stub it refused to report vacuous passes and said so explicitly. Good design.
- `__tests__/db/policy-invariants.sql` — **fails** with 6 §A1 bare-boolean
  violations (`universities_read_all`, `programs_read_all`,
  `requirements_read_all`, `deadlines_read_all`, `application_tasks_read_all`,
  `sources_read_all`) even with all nine applied. This is by design per
  `MIGRATIONS.md:271`, but §4 of that same document instructs the operator to
  "Then run the static gate" as though it should pass. See finding 9.

---

## 3. Claims, marked

| # | Claim | Verdict |
|---|---|---|
| 1 | **Ordering.** Every function/type/table exists by the time it is referenced. | **VERIFIED.** `is_admin()`, `can_act_as_counsellor()`, `visible_student_ids()`, `writable_student_ids()`, `counsellor_assignments`, `student_activities` all resolve. Three passes, zero `42883`/`42P01` among the nine. The headers' ordering constraints are accurate. |
| 2 | **Idempotency.** Every file safely re-runnable. | **VERIFIED for the nine.** No unguarded `create policy`, `add column`, `create index`, or `create type`. The two data backfills are guarded (`on conflict do nothing` in `20260801122000:193,212`; `where expires_at is null` in `20260802130000:425`). **FALSE for the directory as a whole** — three pre-existing files are not idempotent (§2.2), which the ledger's blanket "every migration must be idempotent" does not flag. |
| 3 | **`20260801110000` closes the escalation.** | **VERIFIED, empirically.** See §4. |
| 4 | **`20260801120000` is safe to apply given this branch's app code.** | **FALSE.** See finding 4. |
| 5 | **`schema.sql` edits are consistent and buildable.** | **PARTIALLY FALSE.** Buildable — yes. Consistent — no: the F0 hole was not backported (finding 6), and `recognition_score` is undone by `20250308120000` on replay. |
| 6 | **`MIGRATIONS.md` accurately states applied/unapplied.** | **PARTIALLY FALSE.** Honest about inference, but §5 is stale and its blocker list is wrong. See finding 9. |
| 7 | **Production lock risk.** | **QUANTIFIED.** See finding 8. |

---

## 4. The good news: the F0 fix genuinely works

I built a pre-migration database and ran the exact escalation from the file's
own header:

```
BASELINE (pre-migration), attacker = role 'student':
  delete from profiles where id = <self>          → DELETE 1
  insert into profiles(id,...,role) values(<self>,'admin')  → INSERT 0 1
  select role → admin          ⚠️ ESCALATION SUCCEEDED
```

After applying the nine, the same session:

| Vector | Result |
|---|---|
| A1 `delete from profiles where id = <self>` | `DELETE 0` — filtered, no policy |
| A2 `insert ... role='admin'` | `ERROR: new profiles must be created with role=student` |
| A3 `update profiles set role='admin'` | `ERROR: changing profiles.role requires an administrator` |
| **A4 upsert `ON CONFLICT DO UPDATE SET role=excluded.role`** | `ERROR: new profiles must be created with role=student` |
| A5 upsert without `role` (the `persist-intake` shape) | `INSERT 0 1`, role unchanged ✅ |

**Final state: attacker still `student`.** The `ON CONFLICT DO UPDATE` bypass
the brief asked about is closed — because Postgres evaluates the INSERT
`WITH CHECK` against the *proposed* row even on the conflict path, and the
`BEFORE INSERT` arm of the trigger fires there too. DELETE being merely absent
is sufficient: no policy means no rows match, and the delete is filtered rather
than erroring.

Compatibility, also verified live:

- **counsellor** upserting their own profile in the `persist-intake` shape
  (`persist-intake.ts:86-92`, no `role` in payload, no `onConflict`) → succeeds,
  **role stays `counsellor`**. The header's claim is correct.
- **brand-new dashboard-provisioned account** self-heal insert → succeeds at
  `role='student'`.

One stale comment: `20260801110000:71` says this "Pairs with the signup trigger
added by `20260801130000`". **`20260801130000` contains no trigger and no
`auth.users` reference.** Harmless, but it describes a control that does not
exist.

---

## 5. Finding 1 — CRITICAL: help requests break for unassigned students

**`20260801122000` and `20260802110000` contradict each other.** Neither is
wrong alone; together they abort a core flow.

- `20260802110000:267-303` — `counsellor_notification_targets(uuid)` deliberately
  includes `greg@workiflow.com` **resolved by email from `auth.users`**, because
  (its own comment, line 292-295) "the demo holds the counsellor inbox but is
  `role='student'`".
- `20260802110000:87-125` — `notification_recipient_allowed()` whitelists the
  duty pool **only by `profiles.role in ('counsellor','admin')`** (line 121-124).
  It has no by-email arm.

So the fan-out targets a recipient the gate then rejects, and because the gate
is a `BEFORE INSERT` trigger that `raise`s, **the entire `help_requests` INSERT
aborts.**

Reproduced exactly:

```
student (no counsellor_assignments row) inserts into help_requests
ERROR:  notifications: 1111…1111 may not notify 9999…9999 — no active
        counsellor_assignments or guardian_links edge, and the recipient is
        not staff. Create the assignment first.
CONTEXT: PL/pgSQL function bound_notification_payload() line 36 at RAISE
         SQL statement "insert into notifications ..."
         PL/pgSQL function notify_on_help_request_insert() line 19
```

Control: after inserting an active `counsellor_assignments` edge for that
student, the same INSERT succeeds (`INSERT 0 1`).

**Who is affected.** `20260801122000:184-215` backfills only students whose
`student_personal_information.email` matches `'%+seed@ascenda.demo'`. Every
**real, non-seeded** student therefore has no edge and cannot raise a help
request. And per `20260801122000:174-176`, a re-seed cascades those rows away,
so seeded students break too, at which point the symptom is a help form that
returns a raw 42501 to the user.

Note the file header (`20260802110000:165-173`) anticipates a *related* break —
a counsellor acting on an unassigned student — and argues it is "the finding,
not a regression". It does **not** anticipate this one, which runs the other way
(student → staff) and hits the arm the same file deliberately added.

**Fix:** add the demo-by-email arm to `notification_recipient_allowed()` so it
mirrors `counsellor_notification_targets()`:

```sql
or exists (select 1 from auth.users u
           where u.id = p_recipient and lower(u.email) = 'greg@workiflow.com')
```

---

## 6. Finding 2 — HIGH: `20260802100000` aborts if `shortlisted_programs` is absent

`20260802100000:168-169` is **unguarded**:

```sql
create index if not exists idx_shortlisted_program
  on shortlisted_programs (program_id);
```

`if not exists` guards the *index*, not the *table*. Reproduced by dropping the
table and replaying:

```
supabase/migrations/20260802100000_indexes_extensions_and_rls_gaps.sql:169
ERROR:  relation "shortlisted_programs" does not exist
```

The verification block at `:357` then asserts on the same index, so it would
fail twice.

This is not hypothetical. `CLAUDE.md:90` says the table "**may not exist on the
remote DB**"; `MIGRATIONS.md:79` marks its migration `20260724100000` as 🟡 and
says "**Probe this one**"; and both `shortlist-store.ts:25-33` and
`src/lib/shortlist/server.ts:17-19` feature-detect it at runtime
(`error?.code === '42P01'`).

The same file **does** guard `archive_raw_courses`/`archive_raw_universities`
with `to_regclass` (`:128-146`) for precisely this reason — the author applied
the pattern to the tables they were unsure about and missed the one the repo
documents as uncertain.

**Fix:** wrap `:168-169` in the same `to_regclass` guard and make the
verification entry conditional.

---

## 7. Finding 3 — HIGH: `20260802130000` aborts on an empty notification title

`20260802130000:398-420` pre-counts rows that would trip the
`20260802110000` gate: malformed `kind`, non-root `href`. It does **not** count
empty titles — but `bound_notification_payload()` raises on those too
(`20260802110000:190-193`).

Reproduced. One planted row with `title = ''` (no constraint forbids it today):

```
supabase/migrations/20260802130000_erasure_audit_and_retention.sql:425
ERROR:  notifications.title must not be empty
CONTEXT: PL/pgSQL function bound_notification_payload() line 52 at RAISE
```

Line 425 is the `expires_at` backfill. `NULL` titles fail identically
(`coalesce(new.title,'')` → `''`).

**Half-applied risk is real but path-dependent.** Under `psql` (how CI runs it,
and how a human might) the file half-applies — I confirmed all five
`trg_audit_*` triggers and the `expires_at` column survived the abort. Under
`npm run db:apply` it is atomic: `scripts/apply-sql.ts:46` is a single
`client.query(sql)`, which Postgres wraps in one implicit transaction, so it
rolls back cleanly. The header's warning at `:393-397` is therefore right about
`psql` and wrong about the documented apply path — in the safe direction.

**Fix:** add `select count(*) ... where coalesce(trim(title),'') = ''` to the
pre-check block.

---

## 8. Finding 4 — HIGH: `20260801120000` empties `/counsellor` *and* `/parent`

The migration's header says to "coordinate with an app deploy" and that
`src/lib/api/guards.ts canActAsCounsellor` "now mirrors this definition". It
does (`guards.ts:28-49` checks `profiles.role`). **But two other switches on
this same branch are still open:**

- `src/lib/auth/policy.ts:145` — `COUNSELLOR_PORTAL_OPEN_TO_ALL = true`
- `src/lib/auth/policy.ts:162` — `PARENT_PORTAL_OPEN_TO_ALL = true`

`/counsellor/layout.tsx:35-40` gates on `can(identity,'portal:counsellor')`,
which `policy.ts:145` short-circuits. So a `role='student'` user still **reaches**
every counsellor page, and every RLS-gated read returns **empty rather than
erroring** — RLS filtering is not a PostgREST error. The result is
`/counsellor`, `/counsellor/students`, `/analytics`, `/deadlines`,
`/applications`, `/outcomes`, `/universities`, `/documents` all rendering
convincingly as "0 students, all clear".

**The non-obvious one: the entire `/parent` portal breaks.** `guardian_links`
gets a parent the link row and nothing else — there is no `is_guardian_of()`
policy on any `student_*` table in `schema.sql`. Every read of the child's data
in `src/features/parent/api/data.ts:156-183,380,397` and
`src/app/api/parent/messages/route.ts:36,51,64` is authorised by
`can_act_as_counsellor()` alone. `'parent'` is not a role value
(`schema.sql:60`), so every real parent account is `role='student'`.
`/parent`, `/parent/progress`, `/parent/messages`, `/parent/deadlines`,
`/parent/finances` become a named shell with no data, and sending a message
fails the `with check`.

**`20260802140000` does not fix this** — it adds child→link visibility and admin
writes, not a guardian read path to the student tables. The migration set has no
step that restores the parent portal.

**Before applying `20260801120000`:** flip both `policy.ts` constants in the same
deploy (so students get redirected rather than shown empty pages), and accept
that `/parent` is dark until the guardian read policies (plan step 8) land — or
write them first.

---

## 9. Finding 5 — the CI `database` job cannot pass

Covered in §2.2. Three undocumented blockers: the missing `supabase_realtime`
publication stub, two non-idempotent `alter publication` statements, and the
`recognition_score` column being undone by `20250308120000`'s table rename.
Plus `20250308120000` itself failing on pass 2.

This matters beyond CI hygiene: **the job was added specifically to catch the
class of defect this review found by hand.** It cannot do that job yet, and it
is correctly kept out of `ci-ok`'s `needs`.

---

## 10. Finding 6 — the F0 hole was not backported into `schema.sql`

The `schema.sql` diff backports `recognition_score`, `student_activities`,
`simulation_results`, and `is_admin()`. It does **not** backport the F0 fix.
Still present, unchanged:

- `schema.sql:932-933` — `create policy profiles_self_access on profiles using (auth.uid() = id) with check (auth.uid() = id);` — **no `for` clause, therefore `FOR ALL`, therefore INSERT and DELETE**
- `schema.sql:1319-1320` — `create trigger trg_guard_profile_role before update on profiles`

So **any database provisioned from `schema.sql` alone ships the privilege
escalation** — a preview branch, a new laptop, a restore. The migration repairs
it on replay, so the CI path is covered, but the file the repo calls its "file of
record" still declares the hole. Of the four things backported, three were
cosmetic-to-moderate and the one that was skipped is the critical one.

---

## 11. Finding 7 — `20260801110000` aborts on an unknown `FOR ALL` policy

`20260801110000:124-133` fails the migration if **any** policy on `profiles` has
`cmd in ('ALL','DELETE')`. Against `schema.sql` this passes. Against a remote
carrying one extra `FOR ALL` admin policy it does not:

```
supabase/migrations/20260801110000_profiles_insert_guard.sql:155
ERROR:  verification failed: 1 ALL/DELETE policy(ies) remain on profiles
```

This is **fail-safe and I would keep it** — but given `MIGRATIONS.md:3` opens by
saying the remote history diverged and most migrations were applied by hand
through the SQL editor, the operator should expect this and run
`select policyname, cmd from pg_policies where tablename='profiles'` on the
remote **before** applying. Worth adding to the file's header.

Related, weaker: `20260802140000:219-224` asserts zero `DELETE` policies on
`guardian_links`, but a `FOR ALL` policy registers as `cmd='ALL'` and would slip
past while granting delete.

---

## 12. Finding 8 — production lock risk, measured

I loaded a real-scale catalogue (**119,000 `programs`, 2,900 `universities`**)
and timed the work.

| Statement | Measured |
|---|---|
| `idx_programs_course_name_trgm` (gin trgm, 119k) | **2,403 ms** |
| `idx_universities_name_trgm` (gin, 2.9k) | 249 ms |
| `idx_universities_country_trgm` (gin, 2.9k) | 6 ms |
| `idx_programs_university_course_id` (btree, 3 cols) | 629 ms |
| `idx_programs_study_level_id` | 281 ms |
| `idx_programs_tuition_id` (partial) | 274 ms |
| `analyze programs` | 131 ms |
| **Whole `20260802100000` as one transaction** | **11,638 ms** |

11.6 s on local NVMe with a warm cache. On Supabase's shared/burstable compute,
**30–60 s is a fair expectation.** The file's "tens of seconds" estimate is
about right.

**The lock shape is worse than the header describes.** `20260802100000:63-73`
says `CREATE INDEX` takes a SHARE lock blocking writes — true — but because
`db:apply` sends the whole file as one implicit transaction, **every lock is
held until COMMIT**, not released per statement. So `programs`, `universities`,
`notifications`, `profiles`, `applications`, `student_matches`, `deadlines` and
~8 more are all write-locked simultaneously for the full 30–60 s.

**And section 5 escalates `programs` to ACCESS EXCLUSIVE, which blocks reads.**
`:313,318,322` are `drop index` on `programs`; `:328` on `universities`. Those
need ACCESS EXCLUSIVE on the parent table, acquired late in the transaction and
held to commit. The classic failure: one in-flight `SELECT` on `programs` makes
`DROP INDEX` wait, and because the Postgres lock queue is FIFO, **every
subsequent catalogue query queues behind the pending ACCESS EXCLUSIVE** — a full
catalogue stall, in a codebase whose own migration headers record having hit the
8 s statement timeout (57014) before.

**Recommendation:** split `20260802100000`. Run the `CREATE INDEX` statements by
hand through `psql` with `CONCURRENTLY`, outside any transaction (the file
already suggests this at `:70-73` and every statement is `if not exists`, so
re-running is a no-op). Run the four `drop index` statements separately, in a
quiet window, each in its own transaction with a short `lock_timeout` so a
blocked drop backs off instead of queueing the world behind it.

The other files' lock profiles are fine: `20260802110000`'s `CHECK ... NOT VALID`
and `20260802140000`'s are correctly `NOT VALID`-then-`VALIDATE`, which is the
right pattern. `20260802120000`'s de-dup DELETE plus unique-index build is
bounded by `student_matches` size — small today, but if F5 has been accumulating
for months, size it first with
`select count(*) from student_matches` before applying.

---

## 13. Finding 9 — `MIGRATIONS.md` accuracy

**To its credit**, the "Belief is not evidence" framing (`:24-28`) is exactly
right, the ✅/🟡/❌ legend is honest, and the §4 probe is genuinely read-only and
correct. The ❌ marks on rows 34–42 are accurate — none of the nine has been
applied anywhere.

**Overstated / stale:**

1. **§5 "The CI `database` job cannot pass yet"** (`:246-261`) lists exactly two
   blockers — `auth.users.email` and the missing `storage` schema — and says
   "Both need stub columns/schema added to `ci.yml` (out of scope for the audit
   branch, which does not own `.github/`)". **Both are already fixed in
   `ci.yml` on this same branch** (the file is modified, +321 lines). The
   section describes a state the branch has already moved past, and its list of
   blockers was never complete (§2.2 above).
2. **§4** instructs "Then run the static gate:
   `psql -f __tests__/db/policy-invariants.sql`" with no caveat, but that file
   **fails with 6 violations even with all nine migrations applied**. §5 `:271`
   explains why elsewhere; §4 does not, so an operator following §4 in order
   will read a by-design failure as a broken migration.
3. **§2 row 33** (`20260724100000`, 🟡, "Probe this one") is correctly flagged —
   but `20260802100000` then depends on that table unguarded (finding 2). The
   ledger identifies the uncertainty and the migration ignores it.
4. **§3 apply-order table** is accurate and matches what I observed. The claim
   that violating any listed constraint "will fail the replay" is correct. The
   note that ordering `130000` after `140000` is operational rather than
   dependency-driven is also correct — I verified both orders apply cleanly.

---

## 14. Defect list with file:line

| File:line | Class | Defect |
|---|---|---|
| `20260802110000:121-124` | **CRITICAL** | Duty-pool arm whitelists by `profiles.role` only; missing the `greg@workiflow.com`-by-email arm that `:296-302` of the same file relies on. Breaks all help requests from unassigned students. |
| `20260802100000:168-169` | **HIGH** | `create index ... on shortlisted_programs` unguarded; no `to_regclass` check, unlike `:128-146`. Aborts if the table is absent. |
| `20260802100000:357` | HIGH | Verification asserts `idx_shortlisted_program` unconditionally; same root cause. |
| `20260802130000:407-419` | **HIGH** | Backfill pre-check counts bad `kind` + bad `href`, misses empty/NULL `title`, which `20260802110000:190-193` also raises on. |
| `schema.sql:932-933` | **MEDIUM** | F0 `FOR ALL` `profiles_self_access` not backported — schema-built DBs still ship the escalation. |
| `schema.sql:1319-1320` | MEDIUM | `trg_guard_profile_role` still `before update` only in `schema.sql`. |
| `20260801110000:124-133` | MEDIUM | Verification aborts on any unknown `FOR ALL`/`DELETE` policy on `profiles`; fail-safe, but the remote diverged — probe first. |
| `20260801110000:71` | LOW | Stale comment: references a "signup trigger added by `20260801130000`" that does not exist. |
| `20260802140000:219-224` | LOW | `cmd = 'DELETE'` assertion misses a `FOR ALL` policy, which grants delete as `cmd='ALL'`. |
| `20260802100000:313,318,322,328` | LOW | `drop index` inside the file-wide implicit transaction → ACCESS EXCLUSIVE on `programs`/`universities` held to commit. |
| `ci.yml:209-252` | MEDIUM | Stub omits `create publication supabase_realtime` → replay step fails immediately. |
| `MIGRATIONS.md:246-261` | LOW | Stale: both listed CI blockers already fixed on this branch; list incomplete. |
| `MIGRATIONS.md:218-223` | LOW | Instructs running `policy-invariants.sql` without noting it fails by design. |

**Pre-existing (not introduced here, but they block the CI gate):**
`20260512120000:52-53`, `20260513120000:63-65` (non-idempotent `alter
publication`); `20250308120000:423-429` (non-idempotent rename, and it discards
`recognition_score`).

---

## 15. Recommended apply sequence

Do not apply anything until findings 1, 2 and 3 are fixed — all three are
one-to-five-line changes.

1. Patch `20260802110000` (demo-by-email arm), `20260802100000` (`to_regclass`
   guard), `20260802130000` (empty-title pre-check).
2. Probe the remote with `MIGRATIONS.md` §4, plus
   `select policyname, cmd from pg_policies where tablename='profiles'` and
   `select to_regclass('public.shortlisted_programs')`.
3. Apply `20260801110000` alone. Re-run the escalation check.
4. Apply `20260801120000` **in the same deploy** as flipping
   `policy.ts:145` and `:162`. Accept `/parent` going dark, or write the
   guardian read policies first.
5. `20260801122000`, then `20260801130000`.
6. `20260802100000` — **split it**: `CREATE INDEX CONCURRENTLY` by hand, drops
   separately with a short `lock_timeout`.
7. `20260802110000`, `20260802120000` (with the `service.ts` change from its
   §5), `20260802140000`, `20260802130000`.
8. Backport F0 into `schema.sql`, and fix the three pre-existing migrations so
   the CI gate can actually go green.
