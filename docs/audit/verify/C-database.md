# Lane C — database: schema, migrations, RLS

## Summary

Everything below was run against a **throwaway local PostgreSQL 16.14** cluster
(`/opt/homebrew/opt/postgresql@16`, socket `/tmp/pgs-lanec`, port 55442, plus the one
`scripts/ci-db-local.sh` boots itself). **The production Supabase project was never
contacted**: no `db:apply`, no Supabase MCP, no `SUPABASE_DB_URL`, no `.env.local` read.

**Executed vs inferred: 38 of 42 claims in this report were executed** (command + output
captured). The 4 inferred are noted in *Not verified*.

**`ci-db-local.sh`: PASS**, exit 0. `40 of 42 migrations replayed twice with no error`;
both ledgered files confirmed still not replayable; post-conditions green. I also broke it
twice (rule 5) and it went red both times — exit 3 on an injected non-idempotent migration,
exit 1 with `::error::… now replays cleanly twice` when I made a ledgered file replayable.
The gate is real.

**Double-replay idempotency: held in the "no error" sense, and that is the wrong sense.**
`20250214120000_student_intake_profile.sql` opens with 14 × `drop type … cascade`. Replayed
onto a database that already has the intake tables, it **silently deletes 17 columns**
(58 → 41 across the five `student_*` tables) and every value in them, then the
`create table if not exists` below skips, so they are never restored. Zero errors, so the
gate certifies it. Nine of the destroyed columns are read by `src/` — including
`english_status`, the onboarding-gate column. **C1, P0.**

**schema.sql ↔ replay catalog diff: 583 diff lines over 1420 vs 1565 catalog entries —
33 A-only, 176 B-only.** All 176 B-only entries are accounted for by the ten unapplied
migrations. Of the 33 A-only: 17 are the destructive replay above; 4 are the indexes
`20260802150000` deliberately drops; 4 are policies `20260801120000` splits; 4 function
bodies differ by whitespace/comment only; 1 is `cities.relrowsecurity`; 3 are the real
divergences (`can_act_as_counsellor`, `counsellor_notification_targets()`,
`guard_profile_role_change`). **Exactly two are unexplained defects: C2 and C6.**

**C2 is the one this lane exists to catch.** `schema.sql:1365` was updated to
`before insert or update on profiles` but `schema.sql:1346` still carries the pre-audit
UPDATE-only function body. On a database built from `schema.sql` alone, an authenticated
user inserting their own `role='student'` profile row gets
`ERROR: changing profiles.role requires an administrator`. Signup is broken. Verified
side-by-side against both databases. Escalation is still blocked, so this is fail-closed,
not a security hole — but `MIGRATIONS.md` §5 claims the opposite state of the same lines
and is stale in both directions (C14).

**RLS is clean.** Every `public` table in the replay database has RLS on and ≥1 policy;
no invisible tables; one bare `using (true)` (`cities_read_all`, intentional public
catalogue read). `schema.sql` alone leaves `cities` with **RLS off** (C6).

**The two behavioural SQL suites both run**, once given a real `auth.uid()`:
`notification-routing-cases.sql` passes all six sections; `rls-negative-cases.sql` passes
every enforced assertion with exactly the 2 documented target-posture warnings — **but only
after I hand-seeded a `programs` row its §3.3 fixture needs and never creates** (C4).
`policy-invariants.sql` reports the documented 6 §A1 violations against the replay DB, but
**crashes with `malformed array literal` against a database in the remote's actual state**
(C3) — 8 of its own failure branches are type-broken.

Severity: **P0 × 1, P1 × 2, P2 × 6, P3 × 6.**

---

## Findings

### C1 — replaying `20250214120000_student_intake_profile.sql` silently destroys 17 columns of student data, and the new CI gate certifies it as idempotent
Severity: **P0** breaks prod
Location: `supabase/migrations/20250214120000_student_intake_profile.sql:7-21`
Regression?: **NO** (the file is pre-existing and unchanged on this branch) — but the gate
that declares the directory replay-safe is **NEW**, and this is the failure it misses.

Evidence:
```
$ psql -d destr -c "select count(*) from information_schema.columns where table_schema='public'
    and table_name in ('student_academic_input','student_subjects','student_personal_information',
                       'student_lifestyle_preference','student_admissions_tests')"
58
$ psql -v ON_ERROR_STOP=1 -d destr -f supabase/migrations/20250214120000_student_intake_profile.sql
NOTICE:  drop cascades to column programme_type of table student_academic_input
NOTICE:  drop cascades to 2 other objects
DETAIL:  drop cascades to column secondary_clusters of table student_academic_input
         drop cascades to column intended_clusters of table student_academic_input
NOTICE:  drop cascades to column english_test_type of table student_academic_input
NOTICE:  drop cascades to column english_status of table student_academic_input
NOTICE:  drop cascades to column test_type of table student_admissions_tests
NOTICE:  drop cascades to column status of table student_admissions_tests
NOTICE:  drop cascades to column gender of table student_personal_information
NOTICE:  drop cascades to column school_type of table student_academic_input
$ psql -d destr -c "select count(*) ... (same query)"
41
```
Exit code 0. `scripts/ci-db-local.sh` replays this file twice and prints
`database gate: PASS`.

The file's head:
```sql
drop type if exists programme_type cascade;
drop type if exists intended_cluster cascade;
drop type if exists english_test_type cascade;
drop type if exists english_status cascade;
…14 in total…
create type programme_type as enum ('IB', 'A_LEVEL');
…
create table if not exists student_academic_input ( … );   -- SKIPPED: table exists
```
`drop type … cascade` drops every column of that type. The `create table if not exists`
that would re-add them is a no-op because the table survived. `alter table … add column`
never appears.

Repro (data loss, not just schema loss):
```
$ psql -d destr2 -c "insert into student_academic_input(profile_id, programme_type, school_name)
                     values ('2222…','IB','Test School') returning *"
22222222-… | IB | Test School
$ psql -d destr2 -f supabase/migrations/20250214120000_student_intake_profile.sql   # silent
$ psql -tA -d destr2 -c "select count(*) from student_academic_input"          → 1
$ psql -tA -d destr2 -c "select column_name from information_schema.columns
                         where table_name='student_academic_input' and column_name='programme_type'"
(empty)                                                                       ← 'IB' is gone
```

Blast radius in `src/` — I checked all 129 `.from()`/`.select()` pairs against both
catalogs; against the post-replay catalog **15 column references break**:
```
src/app/dashboard/page.tsx:121        student_academic_input.{programme_type,intended_clusters,english_status}
src/components/forms/auth-form.tsx:62 student_academic_input.{programme_type,intended_clusters,english_status}
src/lib/chat/context.ts:101           student_academic_input.{programme_type,intended_clusters,english_status}
src/app/profile/page.tsx:46,48        student_subjects.level, student_admissions_tests.{status,test_type}
src/lib/counsellor/data.ts:308,310    student_subjects.level, student_admissions_tests.{status,test_type}
```
Against the pre-replay catalog: **0 problems**. `english_status` is in the completion set
that drives the onboarding redirect (`src/middleware.ts:170` names it explicitly as the
column whose omission "flipped" that gate). Losing it is the lock-everyone-out bug again,
plus permanent loss of every student's programme type, intended clusters, IB TOK/EE grades,
subject levels, admissions-test rows and gender.

This is the same class as `20250308120000_normalize_course_catalog.sql`, which was archived
for it — "destructive on replay, not merely non-idempotent"
(`supabase/migrations/_applied_archive/README.md:31`). That criterion applies verbatim here
and this file is still in the replay path.

Fix (smallest): move `20250214120000_student_intake_profile.sql` into
`supabase/migrations/_applied_archive/` with a README entry, exactly as `20250308120000`
was handled. `schema.sql` already declares everything it creates, so nothing is lost.
Alternative if it must stay: wrap lines 3-21 in
`do $$ begin if to_regclass('public.student_academic_input') is null then … end if; end $$;`
so the drop block only runs on a virgin database.

Test: add to `scripts/ci-db-check.sh`'s post-condition block, which already asserts
`universities.recognition_score` survives replay for the identical reason:
```sql
foreach t, c in array [ ('student_academic_input','programme_type'),
                        ('student_academic_input','english_status'),
                        ('student_subjects','level'),
                        ('student_admissions_tests','test_type') ] loop
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name=t and column_name=c)
  then missing := missing || ('column ' || t || '.' || c); end if;
end loop;
```
Red today (the columns are gone after pass 1), green once the file is archived.

---

### C2 — `schema.sql` backported the F0 trigger *timing* but not the trigger *function*, so a database built from `schema.sql` alone cannot create a student profile
Severity: **P1** wrong behaviour
Location: `supabase/schema.sql:1346-1362` (function) vs `supabase/schema.sql:1365-1370` (trigger)
Regression?: **NEW** — introduced by commit `95b078e`, "backport the profiles
privilege-escalation fix into schema.sql". Before it, the trigger was `before update` only
and matched its body.

Evidence — `schema.sql:1346`:
```sql
create or replace function public.guard_profile_role_change()
…
begin
  if new.role is distinct from old.role then          -- no tg_op branch
    if auth.uid() is not null
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'changing profiles.role requires an administrator';
    end if;
  end if;
  return new;
end;
```
`schema.sql:1365`:
```sql
create trigger trg_guard_profile_role
  -- INSERT as well as UPDATE. Registered `before update` only, this guard was
  -- walked around by delete-then-insert (see the profiles policy note above).
  before insert or update on profiles
```
`20260801110000_profiles_insert_guard.sql:82-107` has the correct body with the
`if tg_op = 'INSERT' then … new.role is distinct from 'student' …` arm. It was not
transcribed.

On INSERT, `old.role` is NULL, so `new.role is distinct from old.role` is TRUE for *every*
insert — including the legitimate one.

Repro — two databases, identical script, `auth.uid()` wired to a JWT claim in both:
```
===== guard_a  (stub + schema.sql) =====
set test.uid = 'aaaaaaaa-…-0001';
insert into profiles (id, role) values ('aaaaaaaa-…-0001','student');
ERROR:  changing profiles.role requires an administrator
CONTEXT:  PL/pgSQL function guard_profile_role_change() line 7 at RAISE

===== guard_b  (stub + schema.sql + all migrations) =====
insert into profiles (id, role) values ('aaaaaaaa-…-0001','student');
INSERT 0 1                                                    ← signup works

-- escalation, both databases:
guard_a:  ERROR: changing profiles.role requires an administrator     (blocked)
guard_b:  ERROR: new profiles must be created with role=student       (blocked)
```
So the escalation is closed on both — this is **fail-closed, not a security hole** — but
`src/lib/profile/persist-intake.ts:86` `supabase.from('profiles').upsert({ id: userId, … })`
throws on first write for every new user on any database provisioned from `schema.sql`: a
preview branch, a fresh laptop, a restore, or the CI `database` job's first phase.

Fix: replace the body at `schema.sql:1352-1361` with `20260801110000:87-106` verbatim.

Test: `__tests__/db/policy-invariants.sql` §A currently asserts only that the trigger is
attached (A5). Add an A-section assertion on the body, which is the thing that drifted:
```sql
if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='guard_profile_role_change') not like '%tg_op%'
then failures := failures || 'A11 guard_profile_role_change has no INSERT arm'::text; end if;
```
Red against `schema.sql` today, green after the transcription. Note the same gap exists in
`20260801110000`'s own verification block — see C13.

---

### C3 — `policy-invariants.sql` raises `malformed array literal` on 8 of its own failure branches, and crashes against a database in the remote's current state
Severity: **P1** wrong behaviour (a gate that cannot report the failures it exists to report)
Location: `__tests__/db/policy-invariants.sql:166, 205, 210, 222, 237, 308, 324, 340`
Regression?: **NEW** (file added by this branch)

Evidence — run against `stub + schema.sql`, which is the state the remote is in for the ten
unapplied migrations:
```
$ psql -d cat_schema -v ON_ERROR_STOP=1 -f __tests__/db/policy-invariants.sql
psql:__tests__/db/policy-invariants.sql:270: ERROR:  malformed array literal:
  "A7 student_matches has no non-admin DELETE policy — the cache rebuild is a silent no-op (F5)"
LINE 1: failures := failures || 'A7 student_matches has no non-admin...
DETAIL:  Array value must start with "{" or dimension information.
CONTEXT:  PL/pgSQL function inline_code_block line 149 at assignment
```
`failures` is `text[]`; an unadorned string literal is type `unknown`, so the `||` overload
resolves to `anyarray || anyarray` and Postgres tries to parse the sentence as an array
literal. The branches that use `format(…)` (which returns a typed `text`) work; the eight
bare-literal ones do not. Affected assertions: **A5** (role guard trigger missing),
**A7/A8** (F5 — the `student_matches` DELETE policy and unique index), **A9** (F6 — the
notification bounds trigger), **A10**, **B2**, **B3** (F10), **B4** (F4).

Consequence, in order of cost:
1. `MIGRATIONS.md:290-297` tells the operator "6 is the expected number. More than 6 is a
   finding." On the remote you do not get 7 — you get one raw Postgres type error at A7 and
   no list at all. A8, A9, A10 and all of section B never evaluate.
2. Section B is unreachable **even on a fully migrated database**, because B3 and B4 both
   fire today:
   ```
   $ psql -d cat_replay -f <section B extracted to scratch>
   ERROR:  malformed array literal: "B3 profile_display_name() is EXECUTE-able by
           authenticated/anon — full-name oracle (F10)"
   ```
   `MIGRATIONS.md:427-433` says F4 "is asserted as a target-posture check
   (`policy-invariants.sql` B4) so it cannot be forgotten." B4 can never run.

Against the fully migrated replay database the file does reach its intended report and the
documented count is exact:
```
ERROR:  SECTION A: 6 policy invariant(s) violated:
  A1 bare-boolean policy: sources.sources_read_all (SELECT)
  A1 bare-boolean policy: program_requirements.requirements_read_all (SELECT)
  A1 bare-boolean policy: deadlines.deadlines_read_all (SELECT)
  A1 bare-boolean policy: application_tasks.application_tasks_read_all (SELECT)
  A1 bare-boolean policy: universities.universities_read_all (SELECT)
  A1 bare-boolean policy: programs.programs_read_all (SELECT)
```
— which is why the defect was invisible: the only database anyone tested it on is the only
database on which the broken branches do not execute.

Fix: append `::text` (or wrap in `format('%s', …)`) at all eight sites.

Test: the proof is a run against a database without the migrations. Add to CI or to the
file's own header the instruction to run it against **both** `ascenda_ci_base` (schema.sql
only) and `ascenda_ci` (post-replay); today the first is red with a type error, the second
green-with-6, and only the second is ever exercised.

---

### C4 — `rls-negative-cases.sql` §3.3 needs a `programs` row that its own §0 interlock guarantees will not exist, so the file always aborts
Severity: **P2** latent risk
Location: `__tests__/db/rls-negative-cases.sql:135-137` (fixture) vs `:58-71` (interlock)
Regression?: **NEW**

Evidence — first run, on a disposable cluster exactly as the file's header prescribes:
```
NOTICE:  safety interlock passed (0 programme rows)
WARNING: TARGET POSTURE (plan step 8, expected to fail today) — 2 finding(s):
  [4.1-target] UNASSIGNED counsellor D can read student A's personal information
  [4.5-target] UNASSIGNED counsellor D wrote a counsellor_note about student A
ERROR:   RLS BEHAVIOUR: 1 assertion(s) failed:
  [3.3] fixture problem: student A has no student_matches rows to clear
EXIT=3
```
The fixture:
```sql
-- A cached match belonging to A, used by the DELETE tests.
insert into student_matches (profile_id, program_id, score)
select :'student_a', p.id, 42 from programs p limit 1
on conflict do nothing;
```
It selects from `programs`. §0 refuses to run if `programs` has >5000 rows, i.e. the file is
designed for a near-empty catalogue — and a `supabase start` stack or disposable cluster has
**zero**. `insert … select … from programs limit 1` inserts 0 rows, and §3.3 then fails on
its own fixture.

Repro / proof that this is the *only* blocker — I inserted one university + one programme
and re-ran, unchanged:
```
NOTICE:  safety interlock passed (1 programme rows)
WARNING: TARGET POSTURE (plan step 8, expected to fail today) — 2 finding(s): …
NOTICE:  RLS behaviour: all enforced assertions passed
EXIT=0
```
So the RLS posture is correct; the harness is not. The practical cost is that §3.3 — the
only behavioural test of `matches_self_delete`, the policy `20260802120000` adds — has never
executed, and the file exits 3 for a reason unrelated to policy correctness, which trains the
reader to ignore its exit code.

Fix: have the fixture create its own catalogue row rather than borrow one (the whole file
ends in `ROLLBACK`, so it costs nothing):
```sql
insert into universities (id, name, country) values (:'fx_uni','Fixture U','UK') on conflict do nothing;
insert into programs (id, university_id, course_name) values (:'fx_prog', :'fx_uni','Fixture Course') on conflict do nothing;
insert into student_matches (profile_id, program_id, score) values (:'student_a', :'fx_prog', 42) on conflict do nothing;
```
Test: the file's own §3.3 assertion, which passes once the fixture materialises (shown above).

---

### C5 — the archived destructive migration is out of the glob but not out of `db:apply`'s reach, and `README.md` still tells you to run it
Severity: **P2** latent risk
Location: `scripts/apply-sql.ts:28-40`; `README.md:66`
Regression?: **NEW** (the containment claim is new on this branch; the README line is pre-existing)

Evidence — `supabase/migrations/_applied_archive/README.md:22-24` claims:
> Because `npm run db:apply <file>` takes a filename, and the moment somebody decides to
> "replay the migrations to rebuild an environment" they will type one of these.

and `docs/audit/HANDOFF.md:92` claims the file is "out of every glob and **out of the CI
replay path**, so it can no longer be reached by `db:apply`".

`scripts/apply-sql.ts` in full, on the path question:
```ts
const file = process.argv[2];
if (!file) { … }
const sql = readFileSync(file, 'utf8');
await client.query(sql);
```
There is no path check of any kind. `npm run db:apply
supabase/migrations/_applied_archive/20250308120000_normalize_course_catalog.sql` runs it
against production and archives the live 119k-row catalogue. Moving the file changed which
directory a `for f in supabase/migrations/*.sql` loop sees; it did not change what
`db:apply` will execute.

`README.md:66`, still live and still naming the pre-move path:
> 3. If you are normalizing the UK course catalog, apply the migration in
>    `supabase/migrations/20250308120000_normalize_course_catalog.sql` to add `cities`,
>    enhanced catalog columns, and the `course_scoring_v1` view.

The stale path means the command as written fails with ENOENT — which is luck, not
containment, since the file is one `find` away.

Fix, two lines in `scripts/apply-sql.ts` after the `file` check:
```ts
if (resolve(file).includes('/_applied_archive/')) {
  console.error(`Refusing: ${file} is in _applied_archive/ — applied and destructive on replay.`);
  process.exit(1);
}
```
and delete or rewrite `README.md:66` to point at `schema.sql`.

Test: `scripts/apply-sql.ts` has no test today; the assertion is that invoking it with any
`_applied_archive/` path exits non-zero **before** it reads `SUPABASE_DB_URL`. Put the guard
above the `SUPABASE_DB_URL` check so the test needs no environment.

---

### C6 — `schema.sql` never enables RLS on `cities`
Severity: **P2** latent risk
Location: `supabase/schema.sql:215-232` (table), no `enable row level security` anywhere for it
Regression?: **NO** (pre-existing `schema.sql` gap; `20260719120000` fixes it on the remote)

Evidence:
```
$ psql -tA -d cat_schema -c "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"
cities
$ psql -tA -d cat_replay -c "<same>"
(empty)
```
`cities` is the **only** table in either database without RLS. `MIGRATIONS.md` §6 rule 6
exists because of this exact table: "A table created without `enable row level security` is
readable *and writable* by the anon key that ships in the browser bundle … That is how
`cities` shipped." The rule was written; `schema.sql` was not updated. Any database built
from `schema.sql` alone reopens it.

Repro: build from `schema.sql`, connect with the anon key, `insert into cities …` succeeds.
(Not executed against a live PostgREST — asserted from `relrowsecurity = false`, which is
the whole mechanism.)

Fix: add to `schema.sql` next to the other tables' RLS blocks, transcribing
`20260719120000`:
```sql
alter table cities enable row level security;
drop policy if exists cities_read_all on cities;
create policy cities_read_all on cities for select using (true);
drop policy if exists cities_admin on cities;
create policy cities_admin on cities for all
  using ((select auth_role()) = 'admin') with check ((select auth_role()) = 'admin');
```

Test: `policy-invariants.sql` §A, which has no such assertion today:
```sql
for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
loop failures := failures || format('A12 %s has RLS disabled', r.relname); end loop;
```
Red against `schema.sql` today, green against the replay database, and it generalises — it
catches the *next* table that ships without RLS, which is the actual invariant.

---

### C7 — `20260802120000` declares itself BREAKING and names a mandatory `service.ts` edit that is not on this branch
Severity: **P2** latent risk
Location: `supabase/migrations/20260802120000_student_matches_delete_policy_and_uniqueness.sql:150`
vs `src/lib/matching/service.ts:912, 919`
Regression?: **NEW**

Evidence — the migration header:
> Two edits, both in `service.ts:894-912`. **Neither is optional.**

The code as it stands:
```ts
// src/lib/matching/service.ts:912
const { error: deleteError } = await supabase.from('student_matches').delete().eq('profile_id', profileId);
// src/lib/matching/service.ts:919
const { error: insertError } = await supabase.from('student_matches').insert(batch);
```
No `.select('id')` on the delete (so an RLS-blocked delete still reports `error === null`
and zero rows), and `.insert`, not `.upsert`. With the migration's new unique index
`student_matches_profile_program_key` in place and the delete silently affecting nothing,
the insert now raises 23505 where it previously duplicated — the code catches it, wipes the
cache and warns, so the visible symptom is "matches recomputed on every request" rather
than an error. Fail-soft, but the file's own safety argument is not satisfied by this
commit.

Fix: land the two edits the header specifies (`.delete().eq(…).select('id')` and
`.upsert(batch, { onConflict: 'profile_id,program_id' })`) in the same change as the
migration, or downgrade the header's claim.

Test: a `service.ts` unit test asserting the delete call includes `.select(` and that a
duplicate `(profile_id, program_id)` in one batch does not wipe the cache.

---

### C8 — `20260801120000`, the BREAKING security migration, has no verification block
Severity: **P2** latent risk
Location: `supabase/migrations/20260801120000_close_counsellor_access_and_split_write_policies.sql` (whole file)
Regression?: **NEW**

Evidence: it is the only one of the ten with no terminal `do $$ … raise exception … end $$;`.
`MIGRATIONS.md` §6 rule 3: "End with a verification block that raises… A security migration
that can silently no-op is worse than one that fails, because it reads as though it worked."
`MIGRATIONS.md:246-251` separately concedes that this migration's central change —
`can_act_as_counsellor()`'s body — "leaves no distinguishable object", i.e. it is precisely
the case where only an in-file assertion can tell you whether it took.

Nothing asserts that `can_act_as_counsellor()`'s body changed, nor that
`parent_contacts_all` / `parent_messages_all` / `student_documents_counsellor_all` are gone.
(`20260801130000_reconcile_missing_tables.sql` also has none; lower stakes.)

Fix: append
```sql
do $$ begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='can_act_as_counsellor') like '%auth.uid() is not null%'
  then raise exception 'verification failed: can_act_as_counsellor() is still the open form'; end if;
  if exists (select 1 from pg_policies where schemaname='public'
             and policyname in ('parent_contacts_all','parent_messages_all','student_documents_counsellor_all'))
  then raise exception 'verification failed: a FOR ALL policy survived the split'; end if;
end $$;
```
Test: run the migration against a database where the open form is already installed, confirm
green; then re-install the open form and re-run only the block, confirm it raises.

---

### C9 — `20260802110000` installs a `before insert or update` gate over `notifications` with no pre-flight over the rows already there
Severity: **P2** latent risk
Location: `supabase/migrations/20260802110000_notification_bounds.sql:312` (trigger), `:10-13` (the safety argument)
Regression?: **NEW**

Evidence — the header argues safety from writers only:
> every kind in the schema and in `src/` is already snake_case

which says nothing about stored rows. The trigger is `before insert **or update**`. After
this file applies, any pre-existing row with a malformed `kind`, a non-root `href`, or an
empty/NULL `title` becomes permanently un-updatable: marking it read aborts with
`check_violation`.

The identical three-condition count already exists — in the *next* file,
`20260802130000:144-149`, where it protects that file's backfill. `MIGRATIONS.md:277-280`
publishes the probe but frames it as protecting `130000`.

`MIGRATIONS.md` §6 rule 8 was written for exactly this: "A pre-flight check must mirror EVERY
`raise` in what it is protecting, and it must run FIRST." `20260802130000` was fixed; the
file that installs the gate was not.

Fix: copy `20260802130000:134-163` to the top of `20260802110000`, changing the message from
"the backfill would abort" to "these rows will become un-updatable".

Test: insert a row with `title = ''` into `notifications` on a pre-migration database, apply
`20260802110000`, then `update notifications set read_at = now() where …` — currently
succeeds in creating the trap and then fails; with the pre-flight, the migration refuses at
statement one and leaves nothing behind.

---

### C10 — `20260801122000`'s backfill can raise 23505 on the partial unique index its own file creates, despite claiming "Safe to re-apply"
Severity: **P3** quality
Location: `supabase/migrations/20260801122000_counsellor_assignments.sql:212` vs `:69-71`, header `:37`
Regression?: **NEW**

Evidence:
```sql
-- :69-71
create unique index if not exists counsellor_assignments_one_primary_idx
  on counsellor_assignments (student_profile_id)
  where status = 'active' and role = 'primary';
-- :212
on conflict (counsellor_profile_id, student_profile_id) do nothing
```
`on conflict` arbitrates on one index. The demo block inserts `role='primary', status='active'`.
If between runs an admin makes a *different* counsellor primary+active for a seeded student,
re-running raises 23505 on the other index and aborts the whole file. The header says
"Idempotent … Safe to re-apply".

Fix: a second `on conflict` clause cannot cover two indexes — guard the demo insert with
`where not exists (select 1 from counsellor_assignments where student_profile_id = … and role='primary' and status='active')`.

Test: pre-seed a conflicting primary assignment, re-run the file, expect success (currently 23505).

---

### C11 — `20260802130000` claims "purely additive" and states no lock class, while rewriting every row of `notifications`
Severity: **P3** quality
Location: `supabase/migrations/20260802130000_erasure_audit_and_retention.sql:9-12` vs `:458` and `:474-476`
Regression?: **NEW**

Evidence — header `:9-12`: "Purely additive: … one nullable column. No existing policy,
constraint or column is changed." Body:
```sql
:458  alter table notifications add column if not exists expires_at timestamptz;   -- ACCESS EXCLUSIVE
:474  update notifications set expires_at = created_at + interval '180 days' where expires_at is null;
```
A full-table rewrite that fires the per-row `bound_notification_payload()` gate, all held to
COMMIT because `db:apply` sends the file as one transaction. `notifications` is one of the
large tables. `:71-73` partially self-corrects but the lock class and expected duration that
§6 rule 9 requires are both absent.

Fix: state `ACCESS EXCLUSIVE on notifications, held for the duration of the backfill` in the
header with a measured or estimated duration, and consider batching the update.

Test: none needed beyond header accuracy; this is a documentation defect with an operational
cost.

---

### C12 — `20260802100000`'s "Reads are unaffected" is inaccurate
Severity: **P3** quality
Location: `supabase/migrations/20260802100000_indexes_extensions_and_rls_gaps.sql:88-89`, restated `:366`
Regression?: **NEW**

Evidence — header: "Budget a minute of blocked catalogue **WRITES**. Reads are unaffected —
that is the whole point of the split"; `:366` "this file is write-blocking only". But
`:139` `alter table public.cities enable row level security;` and the policy DDL at
`:141-149` / `:162-167` take **ACCESS EXCLUSIVE**, acquired in section 2 (early) and held for
the whole 30-60 s run.

Mitigant, which is why this is P3 and not higher: `grep` finds no `from('cities')` and no
`archive_raw_*` read in `src/`, so no application read path is blocked.

Fix: scope the claim — "reads of `programs`/`universities` are unaffected; `cities` and the
archive tables take ACCESS EXCLUSIVE for the duration."

---

### C13 — `20260801110000`'s verification block asserts the trigger's timing but not the function's body, so it would pass against the half-backport in C2
Severity: **P3** quality
Location: `supabase/migrations/20260801110000_profiles_insert_guard.sql:143-151`
Regression?: **NEW**

Evidence:
```sql
select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'profiles' and t.tgname = 'trg_guard_profile_role'
  and (t.tgtype & 4) = 4;   -- TRIGGER_TYPE_INSERT
if n <> 1 then raise exception 'verification failed: trg_guard_profile_role does not cover INSERT'; end if;
```
`schema.sql` satisfies this assertion exactly — `tgtype & 4 = 4` — while the function it
calls has no INSERT arm. This is the shape §2 of the audit prompt warns about: an assertion
that stays green when the value is wrong, because it checks the wrapper rather than the
behaviour.

Fix: add `and (select prosrc from pg_proc …) like '%tg_op = ''INSERT''%'`, or better, assert
behaviourally by attempting a `role='admin'` insert under a transaction-local JWT claim and
requiring it to raise — the pattern `20260802110000:568-572` already uses in this repo.

---

### C14 — `MIGRATIONS.md` §5's headline open item is stale in both directions
Severity: **P3** quality
Location: `supabase/MIGRATIONS.md:324-359`
Regression?: **NEW**

Evidence — §5 states, as "the highest-severity open item on this page":
> `schema.sql` does not carry the fix … `:932-933` `create policy profiles_self_access on
> profiles using (auth.uid() = id) with check (auth.uid() = id);` … `:1319-1320`
> `create trigger trg_guard_profile_role before update on profiles`

Neither line exists. `schema.sql:963-978` now has the split
`profiles_self_select` / `_update` / `_insert` policies, and `:1365-1370` is
`before insert or update`. Confirmed in both catalogs — the `profiles` policy set is
byte-identical between `cat_schema` and `cat_replay`.

The section's own instruction — "do not let it be closed by inference" — is what makes
leaving it stale actively harmful: a reader following it will conclude the escalation is
open when it is closed, and will not look for C2, which is the part that genuinely did not
land.

Fix: rewrite §5's first block to record that the policy split and the trigger timing were
backported in `95b078e`, and that the **function body** was not (C2).

---

### C15 — two small correctness nits in `20260802110000` / `20260802130000`
Severity: **P3** quality
Location: `20260802110000:561` and `:594`; `20260802130000:134-163`
Regression?: **NEW**

Evidence (a) `20260802110000` borrows a transaction-local JWT claim for its verification and
restores it as `''`:
```sql
prev text := coalesce(current_setting('request.jwt.claims', true), '');
…
perform set_config('request.jwt.claims', prev, true);
```
A previously-unset GUC comes back as the empty string rather than unset. Harmless here
(transaction-local, and Supabase's `auth.uid()` `nullif`s `''`) but it does not restore the
prior state faithfully — and I hit the same distinction myself: a naive `auth.uid()` written
as `current_setting(…)::json->>'sub'` throws `invalid input syntax for type json` on `''`,
which is exactly the shape of accident this leaves lying around.

Evidence (b) `20260802130000`'s §0 pre-flight refuses unconditionally, including when the
gate it protects is not installed. Applied without `20260802110000`, one malformed
pre-existing row blocks the erasure/audit migration for no reason. A
`to_regclass`/`pg_trigger` guard would make the refusal conditional on the hazard.

Fix: (a) `perform set_config('request.jwt.claims', nullif(prev, ''), true);`
(b) wrap §0's raise in `if exists (select 1 from pg_trigger where tgname = 'trg_bound_notification_payload' …)`.

---

## What I checked and found clean

**The database gate (item 1).** `./scripts/ci-db-local.sh` → exit 0,
`database gate: PASS`, `40 of 42 migrations replayed twice with no error`. Both
`NOT_REPLAYABLE` entries re-confirmed genuinely unreplayable by the job's own probe
databases. Post-conditions green. Full log:
`scratchpad/logs/ci-db-local.log`.

**The gate is not a rubber stamp (rule 5).** Two deliberate breaks against a *copy* of the
repo in the scratchpad (the working tree was not modified):
- injected `create table zz_break (id int primary key);` as a new migration →
  `EXIT=3`, `ERROR: relation "zz_break" already exists` on pass 2.
- commented out the unguarded `alter publication` in
  `20260512120000_help_requests_and_notifications.sql` → `EXIT=1`,
  `::error::20260512120000_… now replays cleanly twice. Remove it from NOT_REPLAYABLE`.
Both mechanisms work. I did not manage to construct a break that the `replayed -ne expected`
floor catches specifically, so that one branch remains untested.

**Catalog parity (item 2), programmatically.** Two databases —
`cat_schema` = `ci-db-stub.sql` + `schema.sql`, `cat_replay` = `cat_schema` + every
non-ledgered migration in filename order — dumped through a single deterministic query
covering extensions, schemas, enum types and labels, relations with `relrowsecurity` /
`relforcerowsecurity`, columns with type/nullability/default/identity/generated,
constraints via `pg_get_constraintdef`, indexes via `indexdef`, policies with
permissive/roles/cmd/using/check, functions with full body plus `prosecdef`/`provolatile`/
`proconfig`, triggers via `pg_get_triggerdef`, table grants, function ACLs, schema ACLs,
publication membership, view definitions and view reloptions. 1420 vs 1565 entries, 583
diff lines. Every one of the 176 B-only entries traces to one of the ten unapplied
migrations. Of the 33 A-only entries, 31 are explained (17 = C1, 4 = `20260802150000`'s
deliberate drops, 4 = `20260801120000`'s policy splits, 1 = `guardian_links_self` rewritten
into InitPlan form, 1 = `cities` RLS = C6, 3 = `can_act_as_counsellor` /
`counsellor_notification_targets()` / `notify_on_help_request_insert`, all from unapplied
migrations, 1 = `guard_profile_role_change` = C2). I diffed the four
apparently-differing function bodies character by character after whitespace normalisation:
`is_counsellor`, `guard_help_request_update` and `notify_on_help_request_accepted` differ
only in comments and spacing; `notify_on_help_request_insert` differs really, and correctly
(`counsellor_notification_targets()` → `counsellor_notification_targets(new.student_profile_id)`,
from `20260802110000`). Artefacts: `scratchpad/cat-A-schema.txt`,
`cat-B-replay.txt`, `cat-diff.txt`, `catalog.sql`.

**A from-scratch replay without `schema.sql` was not attempted as a parity baseline**, and
should not be: the catalogue tables come from the archived `20250308120000`, so
`migrations/` alone cannot build the database. `schema.sql` + replay is the only meaningful
comparison and is what `ci-db-check.sh` itself does.

**Migration order.** Filename order applies cleanly (the gate proves it twice).
`20260801110000_profiles_insert_guard` sorts first among the ten and its policies/trigger do
not reference anything from later files. Every hard constraint in `MIGRATIONS.md` §3 was
checked helper-by-helper against the file bodies: no file references a function, table or
policy created by a later-named file. The `20260702120000` → `20260802110000` constraint
(the zero-argument `counsellor_notification_targets()` being `create or replace`d) holds in
the replay because `schema.sql` already declares it.

**RLS coverage (item 4), on the post-replay database.**
- Tables with RLS **disabled**: none.
- Tables with RLS enabled and **zero policies** (the invisible-table bug): none.
- Bare `using (true)` / `with check (true)`: exactly one — `cities.cities_read_all (SELECT,
  to public)`, which is the intended anonymous catalogue read.
- Per-operation gaps, all reviewed and all deliberate: `audit_log` (SELECT only — append-only
  log written by SECURITY DEFINER triggers), `deletion_requests` (SELECT only — writes go
  through `request_account_deletion()`), `profiles` (no DELETE — `20260801110000:51` documents
  the choice), `chat_feedback`/`counsellor_assignments`/`guardian_links`/`help_meetings`/
  `help_requests` (no DELETE), `help_messages`/`help_notes` (no DELETE/UPDATE — immutable
  thread content).
- `anon` holds exactly one table grant: `SELECT` on `course_scoring_v1`. That is **F4**,
  explicitly known-open and a product decision (`MIGRATIONS.md:427-433`); I confirmed the
  view has `reloptions = <none>`, i.e. no `security_invoker`, so the finding is unchanged,
  not regressed. Not re-litigated here.

**The two behavioural SQL suites, executed** against a clone with `auth.uid()` wired to
`request.jwt.claims` exactly as Supabase defines it:
- `__tests__/db/notification-routing-cases.sql` → **exit 0**, all six sections:
  `[2] unassigned student raised a help request and it fanned out`,
  `[3] assigned student reached their counsellor only`,
  `[4] gate predicate: staff + demo reachable, unrelated students are not`,
  `[5] payload bounds: truncate long, reject malformed`, `[6] fan-out ≡ duty pool`,
  `ALL NOTIFICATION-ROUTING CASES PASSED`. Its vacuity interlock fired correctly when my
  first `auth.uid()` stub was wrong, which is the interlock doing its job.
- `__tests__/db/rls-negative-cases.sql` → after the C4 fixture seed, **exit 0**,
  `RLS behaviour: all enforced assertions passed`, with exactly the 2 documented
  target-posture warnings (`[4.1-target]`, `[4.5-target]`).
- `__tests__/db/policy-invariants.sql` against the replay database → the documented **6**
  §A1 violations, no more and no fewer, exactly as `MIGRATIONS.md:290-297` predicts.

**App ↔ schema agreement (item 6), programmatically.**
- Every `.from('<table>')` literal in `src/` resolves to a real relation in both catalogs
  (the two apparent misses, `scholarships` and `counsellor_assignments`, are a route path
  and a JSDoc code sample respectively, not queries).
- The single `.rpc()` target, `search_filter_options`, exists.
- All 129 `.from()` → `.select()` pairs expanded (including embedded-relation blocks and
  aliases) and checked column by column: **0 problems against `schema.sql`**, 15 against the
  post-replay catalog — which is C1, not a schema drift.
- 122 filter/order column literals (`.eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.is/.in/
  .contains/.order/.overlaps`) checked against the owning table: **0 problems in both
  catalogs.**
- Scripts: `scratchpad/colcheck.mjs`, `scratchpad/filtercheck.mjs`.

**The archive itself (item 5), partially clean.** `20250308120000` is out of
`supabase/migrations/*.sql`, so `ci-db-check.sh`'s three globs and its `total` count never
see it; the ledger comment at `ci-db-check.sh:52-56` correctly records why. The archive
README is accurate about *why* the file is dangerous. The two containment gaps are C5.

**Static properties of the ten migrations, all verified and clean:** no
`if not exists (select 1 from pg_policies where policyname = …)` guard anywhere (§6 rule 2);
every policy is `drop policy if exists` + `create policy`; no `drop type … cascade`, no
`drop column`, no `alter column type`, no table rename; the only row-deleting statement is
`20260802120000:112-114` (duplicates only, disclosed at `:66-69`); both `not valid` CHECK
constraints (`20260802110000:335-337`, `20260802140000:167-169`) count violations first and
downgrade to a warning; every `create index` is `if not exists` and none uses
`concurrently`, which is correct given `db:apply`'s single-transaction path;
`20260802150000` sets `lock_timeout = '3s'` and guards each drop on both the target's
presence and its covering index; `20260802140000` is purely additive and its verification
block is non-vacuous; `20260802100000`'s `to_regclass` guards on `shortlisted_programs` and
the archive tables are present and its 16-index verification is non-vacuous;
`20260802110000`'s verification is the strongest in the set and declares itself skipped
rather than passing vacuously.

---

## Not verified

1. **The production database's actual state.** By ground rule §2.1. Everything here is
   about what these files *do*, proven locally. Which of the ten is applied to the remote,
   and whether the remote's `notifications` rows would trip C9's missing pre-flight, can
   only be answered by the read-only probes in `MIGRATIONS.md` §4, which the owner must run.
2. **RLS as PostgREST actually enforces it for the `anon` role.** My clone grants
   `authenticated` and runs `set local role authenticated`, which is what the two suites
   need, but I did not stand up PostgREST or GoTrue. C6's anon-write claim is derived from
   `relrowsecurity = false`, not from an executed anonymous `INSERT`.
3. **Lock durations under load.** C11 and C12 concern which lock class a statement takes,
   which is a property of the statement and is certain. How long it is held on a 119k-row
   `programs` or a production-sized `notifications` was not measured — my cluster has one
   programme row.
4. **The `replayed -ne expected` floor in `ci-db-check.sh:121-125`.** I broke two of the
   gate's three failure paths and watched both go red. I did not construct a case that trips
   this third one specifically, so per rule 5 it is not known to work.
5. **Whether `20250214120000` has ever been replayed against production.** C1 is a property
   of the file, proven locally. Whether the damage has already happened is a question for
   the owner: `select column_name from information_schema.columns where table_name =
   'student_academic_input' and column_name = 'programme_type'` — read-only, safe, and it
   should return one row.

**Cluster teardown:** the scratch cluster at `scratchpad/pgdata` (port 55442) was stopped
after the run; `ci-db-local.sh` tears down its own. No repo file was modified. The only
file this lane wrote is this report.
