# Migration ledger

**The remote migration history diverged from this directory.** Most migrations
were applied by hand through the Supabase SQL editor, so
`supabase_migrations.schema_migrations` on the remote does **not** reflect
`supabase/migrations/`, and `supabase db push` is unsafe — it would replay
already-applied files including the destructive catalogue normalize
(`scripts/apply-sql.ts` header). Files are applied one at a time:

```bash
npm run db:apply supabase/migrations/<file>.sql     # needs SUPABASE_DB_URL
```

Because no tool tracks what has run, **every migration must be idempotent**
(`if not exists`, `drop policy if exists`, `create or replace`) and every one
must be safe to apply twice. The CI `database` job replays the whole directory
twice against a throwaway Postgres to prove exactly that.

This file exists because the database audit's top *operational* finding was that
no such record existed — 11 rows of schema drift in
`docs/audit/12-database-design.md` §1.5 are all downstream of nobody being able
to say what was applied.

> **Belief is not evidence.** The "Applied?" column below is inference from PR
> history and session notes, not from the database. Run the probe in
> [§4](#4-find-out-what-is-actually-applied) to turn it into fact — that query
> is the point of this document, and it should be re-run before any migration
> session.

---

## 0. APPLIED 2026-08-02 — fact, not inference

Two migrations were applied to the remote today via `npm run db:apply`, in this order.
Both reported `✓ Applied`, which for these files means their `RAISE EXCEPTION` verification
blocks passed.

| # | File | Result |
|---|---|---|
| 1 | `20260801110000_profiles_insert_guard.sql` | ✅ applied — **closes the privilege escalation.** Until now any user could self-promote to admin, which defeated every other policy |
| 2 | `20260801122000_counsellor_assignments.sql` | ✅ applied — additive (assignment table + backfill) |

### STOPPED HERE, and why — a dependency this ledger did not record

`20260801130000_reconcile_missing_tables` **failed**:

```
✗ Failed to apply SQL: function public.is_admin() does not exist
```

It rolled back cleanly — `apply-sql.ts` sends the file as one multi-statement simple query
and the file declares no explicit `begin`/`commit`, so Postgres's implicit transaction
covered the whole file. **Nothing was partially applied.** (Verified, not assumed.)

`is_admin()` is defined in exactly one place: `20260801120000_close_counsellor_access`.
**Four** of the remaining migrations depend on it —
`20260801130000`, `20260802100000`, `20260802130000`, `20260802140000`.

And `20260801120000` **cannot be applied while the portals stay open.** Its §1 rewrites
`can_act_as_counsellor()` to a real role test; its own header requires
`COUNSELLOR_PORTAL_OPEN_TO_ALL` and `PARENT_PORTAL_OPEN_TO_ALL` be set to `false` in the
same commit, and `__tests__/db/portal-flag-agreement.test.ts` enforces that pairing. Applying
it against the current app would close counsellor access at the database while the app still
renders the portal to everyone — **every counsellor page would render empty, on real data,
with no error.**

So the rest of the chain is gated on a PRODUCT decision, not on database access:

> **The remaining migrations land at the same moment the portals close** — one commit that
> applies `20260801120000`, flips both flags to `false`, and deploys. Until then they are
> correctly unapplied.

Also still held, for an unrelated reason: **`20260802120000_student_matches_…`** requires
C7 part (b) (the `upsert` on `onConflict: 'profile_id,program_id'`) to be deployed in the
same release. Ship it earlier and every match-cache rebuild fails at `42P10`, breaking
`/matches` for every student.

---

## 1. Legend

| Mark | Meaning |
|---|---|
| ✅ | Applied to the remote. Corroborated by a PR, a session record, or a feature that demonstrably works in production. |
| 🟡 | **Believed** applied — inferred, never confirmed. Treat as unknown until probed. |
| ❌ | **Not applied.** Written for review on branch `security/phase0-contain`. |
| — | Nothing to probe (replaces a function body or adds enum values; leaves no distinguishable object). |

---

## 2. The ledger

| # | File | Introduces | Applied? | Evidence / probe marker |
|---|---|---|---|---|
| 1 | `20250214120000_student_intake_profile.sql` | student intake enums + `student_*` tables | ✅ | product depends on it; type `programme_type` |
| 2 | `_applied_archive/20250308120000_normalize_course_catalog.sql` ⛔ **ARCHIVED — never replay** | `cities`, `safe_int()`, `archive_raw_*` | ✅ | catalogue is live; table `cities` |
| 3 | `20250415_update_course_scoring_v1_metadata_scores.sql` | `course_scoring_v1` metadata-preferring rewrite | ✅ | scoring reads metadata keys in prod; — |
| 4 | `20260512120000_help_requests_and_notifications.sql` | `help_requests`, `notifications` | ✅ | table `notifications` |
| 5 | `20260513120000_help_thread_tables.sql` | `help_messages`, `help_notes`, `help_meetings` | ✅ | table `help_notes` |
| 6 | `20260514120000_help_request_notification_trigger.sql` | `notify_on_help_request_insert()` | ✅ | function `notify_on_help_request_insert` |
| 7 | `20260514130000_notifications_audience.sql` | `notifications.audience` | ✅ | index `notifications_audience_inbox_idx` |
| 8 | `20260517120000_counsellor_initiated_messages.sql` | counsellor-initiated thread copy | ✅ | — |
| 9 | `20260611120000_act_ap_enum_values.sql` | ACT/AP enum values | ✅ | — |
| 10 | `20260611130000_tighten_help_rls.sql` | `is_counsellor()`, `is_demo_account()`, `can_act_as_counsellor()` | ✅ | function `is_counsellor` |
| 11 | `20260628120000_counsellor_real_data.sql` | `counsellor_notes`, `parent_*`, `student_documents`, counsellor read policies | ✅ | policy `profiles_counsellor_read` |
| 12 | `20260702120000_p0_role_guard_notification_routing.sql` | `trg_guard_profile_role` (UPDATE only — see F0), `profile_display_name()` | ✅ | trigger `trg_guard_profile_role` |
| 13 | `20260702130000_search_filter_options_fn.sql` | `search_filter_options()` | ✅ | function `search_filter_options` |
| 14 | `20260712120000_meeting_notification_local_time.sql` | `format_meeting_time()` + meeting notify triggers | ✅ | function `format_meeting_time` |
| 15 | `20260712130000_open_counsellor_access.sql` | ⚠️ `can_act_as_counsellor()` → `auth.uid() is not null` | ✅ | **this is 11-security F1.** Probe: function body |
| 16 | `20260713120000_programs_field_id_idx.sql` | `idx_programs_field_id` | ✅ | memory: "all through 20260713150000 applied" |
| 17 | `20260713130000_fix_auth_role_recursion.sql` | `auth_role()` recursion fix | ✅ | same |
| 18 | `20260713140000_initplan_admin_policies.sql` | InitPlan-wrapped **admin** policies (18 of them; the other 24 were never wrapped — F13) | ✅ | same |
| 19 | `20260713150000_counsellor_decks_saved_searches.sql` | `counsellor_decks`, `deck_assignments`, `saved_searches` | ✅ | table `counsellor_decks` |
| 20 | `20260713160000_fix_deck_rls_recursion.sql` | `deck_owned_by_me()`, `deck_assigned_to_me()` | ✅ | function `deck_owned_by_me` |
| 21 | `20260713170000_help_requests_participants_and_reads.sql` | `counsellor_profile_id`, read receipts | ✅ | applied + verified 2026-07-14 (help-comms note) |
| 22 | `20260714090000_deck_notification_href_quests.sql` | `notify_on_deck_assignment_insert()` | ✅ | function exists |
| 23 | `20260714100000_help_request_guard_whitelist_and_claim.sql` | `guard_help_request_update()` column whitelist | ✅ | trigger `trg_guard_help_request_update` |
| 24 | `20260714110000_purge_seed_help_messages_and_inbox_index.sql` | `help_requests_created_idx` | 🟡 | index `help_requests_created_idx` |
| 25 | `20260715120000_tighten_notifications_insert_and_accept_trigger.sql` | bounded `notifications_insert`, accept trigger | ✅ | function `notify_on_help_request_accepted` |
| 26 | `20260716120000_guardian_links.sql` | `guardian_links` | ✅ | applied 2026-07-16 (parent portal note) |
| 27 | `20260717120000_chat_feedback.sql` | `chat_feedback` | ✅ | applied 2026-07-17 (chatbot note) |
| 28 | `20260718120000_chat_conversations.sql` | `chat_conversations`, `chat_messages` | ✅ | applied 2026-07-17/18 |
| 29 | `20260718130000_realtime_publication_and_doc_nudge_limits.sql` | realtime publication membership, doc-nudge limits | ✅ | APPLIED 2026-07-18 (network/security audit) |
| 30 | `20260719120000_enable_rls_catalogue_tables.sql` | RLS on `cities`/`programs`/`universities` | ✅ *(partially no-op — F9)* | policy `cities_read_all`. **Its `programs_read_all`/`universities_read_all` branches silently did not apply**: the `if not exists (policyname = …)` guard matched the differently-defined policies `schema.sql` already had. |
| 31 | `20260723120000_search_facet_indexes.sql` | search facet indexes | ✅ | applied 2026-07-23 (search redesign) |
| 32 | `20260723130000_search_filter_options_loose_scan.sql` | `search_filter_options()` loose scan | ✅ | same |
| 33 | `20260724100000_search_polish.sql` | `idx_programs_admission_test`, `idx_programs_field_tuition`, `shortlisted_programs` | 🟡 | index `idx_programs_admission_test`. `schema.sql` is one migration behind here (§1.5B). `shortlisted_programs` may or may not exist remotely — `shortlist-store.ts` feature-detects and falls back to `localStorage`, so the app cannot tell you either. **Probe this one.** |
| 34 | `20260801110000_profiles_insert_guard.sql` | **F0 fix** — split `profiles_self_access`, `profiles_self_insert`, INSERT-side role guard | ❌ | policy `profiles_self_insert` |
| 35 | `20260801120000_close_counsellor_access_and_split_write_policies.sql` | restores the real counsellor test, `is_admin()`, splits 3 `FOR ALL` policies | ❌ | function `is_admin` |
| 36 | `20260801122000_counsellor_assignments.sql` | `counsellor_assignments` + relationship helpers + backfill | ❌ | table `counsellor_assignments` |
| 37 | `20260801130000_reconcile_missing_tables.sql` | `student_activities`, `simulation_results` | ❌ *(no-op on remote — they already exist there)* | table `student_activities` |
| 38 | `20260802100000_indexes_extensions_and_rls_gaps.sql` | `pg_trgm`, 14 FK indexes, query-shape indexes, `cities`/archive RLS | ❌ | index `idx_programs_course_name_trgm` |
| 39 | `20260802110000_notification_bounds.sql` | `trg_bound_notification_payload`, `counsellor_notification_targets(uuid)`, deck message cap | ❌ | trigger `trg_bound_notification_payload` |
| 40 | `20260802120000_student_matches_delete_policy_and_uniqueness.sql` | `matches_self_delete`, de-dup, unique index | ❌ | index `student_matches_profile_program_key` |
| 41 | `20260802130000_erasure_audit_and_retention.sql` | `deletion_requests`, `request_account_deletion()`, `audit_log`, notification retention | ❌ | table `audit_log` |
| 42 | `20260802140000_guardian_links_parity.sql` | student/counsellor read + admin write on `guardian_links` | ❌ | policy `guardian_links_student_read` |
| 43 | `20260802150000_drop_redundant_indexes.sql` | drops 4 redundant indexes (split out of #38 on 2026-08-02) | ❌ | **absence** of `idx_programs_degree_type` — see note |

Files 34–43 were written by the security/database audit and **none of them has
been executed against any database.** Each carries its own header stating what it
does, why, SAFE or BREAKING, the app change it needs, and how to reverse it.

**Row 43 has no positive probe marker.** It only DROPS objects, so "applied" and
"never written" look identical from the catalogue — `idx_programs_degree_type`
being absent could also mean `schema.sql` never ran. It is the one row in this
table you cannot turn into fact with a query, and it is also the one row where
that does not matter: applying it twice, or never, produces the same database.

### 2026-08-02 — the three defects a reviewer reproduced, and what changed

A reviewer replayed this set against a real Postgres 16.14 cluster and found
three defects that the authoring environment (no Postgres) could not have
caught. All three are fixed **in the files listed above**; the fixes were
reproduced red, then green, against the same kind of throwaway cluster.

| Was | Now |
|---|---|
| **CRITICAL** — `20260802110000`'s gate whitelisted staff by `profiles.role` while its own fan-out also addressed the demo account **by email**. The demo is `role='student'`, so the fan-out targeted a recipient the gate rejected, and the `BEFORE INSERT` raise aborted the whole `help_requests` INSERT with 42501. Since `20260801122000`'s backfill only covers `%+seed@ascenda.demo`, the affected population was **every real student**. | One `notification_duty_pool()` function defines "counsellor-side staff"; the gate, the fan-out overload and the legacy zero-argument fan-out all read it. The migration's verification block now asserts, in both directions, that the fan-out and the gate agree — and that the gate actually *accepts* each pool member, by borrowing a transaction-local JWT claim so the assertion is not vacuous. |
| **HIGH** — `20260802100000` indexed `shortlisted_programs` unguarded. `if not exists` guards the index, not the table, and this repo says in three places that the table may not exist remotely (row 33 below, `CLAUDE.md`, and two runtime feature-detects). Replay aborted at 42P01. | `to_regclass`-guarded, same shape as the archive tables in the same file. The verification entry is conditional but **still asserts**: if the table is present, the index must be. |
| **HIGH** — `20260802130000`'s pre-flight counted malformed `kind` and `href` but not empty/NULL `title`, which the same gate also raises on. One such row aborted the file *after* the five audit triggers were installed. | The check counts all three, mirrors the gate exactly (`title is null or title = ''` — **not** `trim()`, see the file), and has moved to **section 0, the top of the file**, so a refusal leaves nothing behind on any apply path. |

A fourth change is operational rather than a defect: `20260802100000`'s four
`drop index` statements are now `20260802150000_drop_redundant_indexes.sql`. See
§3 and §5.

Two rules were added to §6 as a result. Both describe the shape of the bug, not
the instance.

---

## 3. Apply order for the unapplied set

Files apply in **filename order**, and the constraints below are the reason the
names are what they are. Applying out of order does not produce a warning — it
produces a `42883` (function does not exist) partway through, on a database that
is now half-migrated.

```
 1. 20260801110000_profiles_insert_guard.sql                       SAFE      ← FIRST, ALONE
 2. 20260801120000_close_counsellor_access_and_split_write_...     BREAKING  ← needs an app deploy
 3. 20260801122000_counsellor_assignments.sql                      SAFE
 4. 20260801130000_reconcile_missing_tables.sql                    SAFE      (no-op on remote)
 5. 20260802100000_indexes_extensions_and_rls_gaps.sql             SAFE      ← 30–60 s of blocked WRITES
 6. 20260802110000_notification_bounds.sql                         SAFE
 7. 20260802120000_student_matches_delete_policy_and_...           BREAKING  ← needs service.ts
 8. 20260802140000_guardian_links_parity.sql                       SAFE
 9. 20260802130000_erasure_audit_and_retention.sql                 SAFE      ← see note
10. 20260802150000_drop_redundant_indexes.sql                      OPTIONAL  ← blocks READS. Quiet window.
```

**Hard constraints, each of which will fail the replay if violated:**

| Constraint | Why |
|---|---|
| `20260801110000` **before** `20260801120000` | Everything `120000` adds routes authorisation through `profiles.role`. Until F0 is closed, `insert into profiles (id, role) values (auth.uid(), 'admin')` reopens all of it in one call — and `120000` reads as though the counsellor surface had been secured. |
| `20260801120000` **before** `20260801130000` | `simulation_results_admin` calls `is_admin()`, created by `120000`. This file was originally named `…100000` and would have aborted the replay. |
| `20260801120000` **before** `20260802100000` | the archive-table policies call `is_admin()`. |
| `20260801122000` **before** `20260802110000` | `notification_recipient_allowed()` and `counsellor_notification_targets(uuid)` both read `counsellor_assignments` (42P01 otherwise). |
| `20260702120000` **before** `20260802110000` | **New on 2026-08-02.** `20260802110000` now `create or replace`s the ZERO-ARGUMENT `counsellor_notification_targets()` — previously it only added a one-argument overload and touched nothing that already existed. `create or replace` on a function that does not exist yet is a plain create, so this does not *fail*; it would instead leave the demo account out of the duty pool on a database built without `20260702120000`. Already applied on the remote and present in `schema.sql`, so this constrains a from-scratch build, not the remote. |
| `auth.users.email` must exist **before** `20260802110000` | `notification_duty_pool()` is a SQL-language function and its body is validated at CREATE time (`check_function_bodies`). Against a bare `auth.users(id uuid)` stub the whole file aborts at 42703, not at call time. Real on Supabase; the CI job's problem otherwise. |
| `20260801120000` **and** `20260801122000` **before** `20260802140000` | uses `is_admin()` **and** `writable_student_ids()`. |
| `20260801122000` **before** `20260802130000` | `deletion_requests_self` calls `visible_student_ids()`; the audit trigger attaches to `counsellor_assignments`. |
| `20260802100000` **before** `20260802140000` | not a hard failure — but the new `guardian_links` read policies filter on `student_profile_id`, whose index is created in `20260802100000`. Without it they work and seq-scan. |
| **The backfill inside `20260801122000`** before the relationship-scoped policies (plan step 8, unwritten) | otherwise every counsellor loses their entire roster the moment `inDemoCohort()` is deleted. |

**Note on 10 being optional and last.** `20260802150000` has **no dependency
ordering constraint at all** — nothing in it calls a function, reads a policy or
references a table created by any file here; all four indexes come from
`schema.sql`. It is last for an operational reason: it is the only file in the
set that takes **ACCESS EXCLUSIVE**, which blocks *reads* on `programs` and
`universities`, so it wants a quiet window of its own rather than to be
interleaved. It sets `lock_timeout = '3s'` and rolls back cleanly rather than
holding a queue position that stalls the catalogue behind it. Applying it early,
late, or never all produce the same database — four redundant indexes cost write
amplification on catalogue imports and nothing else. If it fails with **55P03**,
nothing was dropped; retry later.

**Note on ordering 9 last:** `20260802130000` is listed after `140000` for
operational reasons, not dependency ones — it installs five audit triggers, and
you want them installed *after* the migrations that would otherwise fill the log
with their own DDL-driven row changes. Either order applies cleanly.

**Note on erasure completeness:** `20260802130000` creates the deletion
*request* path. Erasure is not complete until the `profiles` → `auth.users`
foreign key (plan step 5, **unwritten**) exists — today, deleting a profile
leaves the login, and a login with no profile row is the F0 window.

---

## 4. Find out what is actually applied

Run this against the remote. It reports one line per migration and is
**read-only** — it creates nothing, changes nothing, and can be run at any time.

```sql
-- Which migrations are present on THIS database?
-- Read-only. Safe on production.
with expected(file, kind, obj) as (values
  ('20250214120000_student_intake_profile',              'type',     'programme_type'),
  ('20250308120000_normalize_course_catalog',            'table',    'cities'),
  ('20260512120000_help_requests_and_notifications',     'table',    'notifications'),
  ('20260513120000_help_thread_tables',                  'table',    'help_notes'),
  ('20260514120000_help_request_notification_trigger',   'function', 'notify_on_help_request_insert'),
  ('20260514130000_notifications_audience',              'index',    'notifications_audience_inbox_idx'),
  ('20260611130000_tighten_help_rls',                    'function', 'is_counsellor'),
  ('20260628120000_counsellor_real_data',                'policy',   'profiles_counsellor_read'),
  ('20260702120000_p0_role_guard_notification_routing',  'trigger',  'trg_guard_profile_role'),
  ('20260702130000_search_filter_options_fn',            'function', 'search_filter_options'),
  ('20260712120000_meeting_notification_local_time',     'function', 'format_meeting_time'),
  ('20260713120000_programs_field_id_idx',               'index',    'idx_programs_field_id'),
  ('20260713130000_fix_auth_role_recursion',             'function', 'auth_role'),
  ('20260713150000_counsellor_decks_saved_searches',     'table',    'counsellor_decks'),
  ('20260713160000_fix_deck_rls_recursion',              'function', 'deck_owned_by_me'),
  ('20260713170000_help_requests_participants_and_reads','index',    'help_requests_counsellor_idx'),
  ('20260714090000_deck_notification_href_quests',       'function', 'notify_on_deck_assignment_insert'),
  ('20260714100000_help_request_guard_whitelist',        'trigger',  'trg_guard_help_request_update'),
  ('20260714110000_purge_seed_help_messages',            'index',    'help_requests_created_idx'),
  ('20260715120000_tighten_notifications_insert',        'function', 'notify_on_help_request_accepted'),
  ('20260716120000_guardian_links',                      'table',    'guardian_links'),
  ('20260717120000_chat_feedback',                       'table',    'chat_feedback'),
  ('20260718120000_chat_conversations',                  'table',    'chat_conversations'),
  ('20260719120000_enable_rls_catalogue_tables',         'policy',   'cities_read_all'),
  ('20260723120000_search_facet_indexes',                'index',    'idx_programs_study_level'),
  ('20260724100000_search_polish',                       'index',    'idx_programs_admission_test'),
  ('20260801110000_profiles_insert_guard',               'policy',   'profiles_self_insert'),
  ('20260801120000_close_counsellor_access',             'function', 'is_admin'),
  ('20260801122000_counsellor_assignments',              'table',    'counsellor_assignments'),
  ('20260801130000_reconcile_missing_tables',            'table',    'student_activities'),
  ('20260802100000_indexes_extensions_and_rls_gaps',     'index',    'idx_programs_course_name_trgm'),
  ('20260802110000_notification_bounds',                 'trigger',  'trg_bound_notification_payload'),
  ('20260802120000_student_matches_delete_policy',       'index',    'student_matches_profile_program_key'),
  ('20260802130000_erasure_audit_and_retention',         'table',    'audit_log'),
  ('20260802140000_guardian_links_parity',               'policy',   'guardian_links_student_read')
)
select
  e.file,
  e.kind || ' ' || e.obj as marker,
  case when case e.kind
    when 'table'    then to_regclass('public.' || quote_ident(e.obj)) is not null
    when 'index'    then to_regclass('public.' || quote_ident(e.obj)) is not null
    when 'type'     then to_regtype('public.' || quote_ident(e.obj))  is not null
    when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and p.proname = e.obj)
    when 'trigger'  then exists (select 1 from pg_trigger t where t.tgname = e.obj and not t.tgisinternal)
    when 'policy'   then exists (select 1 from pg_policies where schemaname = 'public' and policyname = e.obj)
  end then 'APPLIED' else '-- MISSING' end as status
from expected e
order by e.file;
```

**Two things the probe cannot tell you**, because both are function-body
replacements that leave no new object:

```sql
-- Is the counsellor surface still wide open? (11-security F1 / migration 15)
select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_act_as_counsellor';
--   'select auth.uid() is not null'                  → 20260712130000 is live: OPEN
--   'select public.is_counsellor() or public...'     → 20260801120000 is applied: CLOSED
-- (20260801120000 now also asserts this itself, in a terminal verification block.
--  It was the only one of the ten without one — §6 rule 3 — and the only one
--  whose central change leaves no distinguishable object, i.e. the one case where
--  the in-file assertion is the ONLY way to know it took.)

-- Did 20260719120000's public-read branches actually apply? (F9)
select tablename, policyname, roles, qual from pg_policies
where schemaname = 'public' and policyname in ('programs_read_all','universities_read_all','cities_read_all');
--   qual = 'true'                  → the migration applied
--   qual = '(auth.uid() IS NOT NULL)' → it silently skipped; anonymous catalogue reads do not work
```

**Three more probes to run BEFORE applying anything.** Each corresponds to a
migration that will abort, or silently do the wrong thing, against a remote state
this repo cannot see. All three are read-only.

```sql
-- 1. Does shortlisted_programs exist? (row 33 is 🟡; 20260802100000 now skips
--    its index if the answer is null, but you want to KNOW.)
select to_regclass('public.shortlisted_programs');

-- 2. Any FOR ALL / DELETE policy on profiles that schema.sql does not know
--    about? 20260801110000's verification block ABORTS if one remains, which is
--    fail-safe and worth keeping — but you should not discover it mid-apply.
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'profiles' order by cmd, policyname;

-- 3. Would 20260802130000's section 0 refuse? It counts notification rows the
--    20260802110000 gate would reject during the expires_at backfill.
select count(*) filter (where kind is null or kind !~ '^[a-z][a-z0-9_]{0,48}$') as bad_kind,
       count(*) filter (where href is not null and (href !~ '^/' or href like '//%')) as bad_href,
       count(*) filter (where title is null or title = '')                        as bad_title
from notifications;
```

Then run the static gate, which asserts the invariants rather than listing
objects:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f __tests__/db/policy-invariants.sql
```

> ⚠️ **`policy-invariants.sql` FAILS BY DESIGN on this branch**, with 6 §A1
> bare-boolean violations (`universities_read_all`, `programs_read_all`,
> `requirements_read_all`, `deadlines_read_all`, `application_tasks_read_all`,
> `sources_read_all`). Those are the TARGET-posture assertions for plan step 8,
> which is unwritten — see §5. A reviewer confirmed the count is exactly 6 with
> all nine migrations applied. **6 is the expected number. More than 6 is a
> finding.** Do not read this failure as a broken migration, and do not "fix" it
> by deleting the assertions.
>
> Against a database WITHOUT the ten unapplied migrations — which is the remote's
> state — the count is **9**: the same 6 plus A7, A8 and A9, which are what
> `20260802120000` and `20260802110000` close. Both counts re-verified locally on
> 2026-08-02 after the C3 fix.
>
> ⚠️  Until that fix, the file **crashed** against the remote's state rather than
> reporting: 8 of its failure branches appended a bare string literal to a
> `text[]`, which Postgres resolves as `anyarray || anyarray` and dies on with
> `malformed array literal` at the first one (A7). Those branches only run on a
> database that VIOLATES the invariant, so the defect was invisible on the only
> database anyone had run it against. Section A's report is also deferred to the
> end of the file now — raising it in place aborted the script under
> `ON_ERROR_STOP`, so Section B (including **B4**, the F4 check this document
> calls the reason F4 "cannot be forgotten") had never executed even once.

### Behaviour, not just shape

Two executable files sit next to the static gate. Neither can run in the CI
`database` job — both need a real `auth.uid()` that reads `request.jwt.claims`,
and the job stubs it as `select null::uuid`, under which every assertion passes
vacuously. Run them against `supabase start` or a disposable cluster:

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f __tests__/db/rls-negative-cases.sql
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f __tests__/db/notification-routing-cases.sql
```

`notification-routing-cases.sql` was added on 2026-08-02 for the CRITICAL defect
above. Its section 2 is the exact scenario that broke — an unassigned real
student raising a help request — and it goes red if the gate is ever narrowed
back to `profiles.role`. Sections 3–5 exist so that fixing section 2 by widening
the gate to `true` would be caught rather than celebrated. Both files refuse to
run rather than report a vacuous pass.

---

## 5. Known drift and open items

Everything here is a live gap, not a to-do list someone wrote optimistically.

### ✅ CLOSED — F0 in `schema.sql` (backported `95b078e` + `fix/audit-database`)

This section used to read "the F0 privilege escalation is STILL DECLARED IN
`schema.sql`" and to name two lines, `:932-933` and `:1319-1320`, as the
evidence. **Neither line exists any more, and leaving the section standing was
actively harmful**: it told a reader the escalation was open when it was closed,
and it pointed away from the part that genuinely had not landed. Recorded here
with dates rather than deleted, because the section's own instruction was "do
not let it be closed by inference".

`20260801110000_profiles_insert_guard.sql` closes the escalation on any database
it is applied to. A reviewer verified that empirically: they reproduced the
escalation on a pre-migration database, then failed to reproduce it through five
attack vectors afterwards, including the `ON CONFLICT DO UPDATE SET role=…`
upsert bypass. **The migration works.**

What landed in `schema.sql`, and when:

| Part of the fix | State | Where |
|---|---|---|
| `profiles_self_access` split into `profiles_self_select` / `_update` / `_insert`, with `role = 'student'` pinned on insert and **no** DELETE policy | ✅ backported | `95b078e`, `schema.sql:963-978` |
| `trg_guard_profile_role` re-registered `before insert or update` | ✅ backported | `95b078e`, `schema.sql:1365-1370` |
| `guard_profile_role_change()`'s **function body**, with the `tg_op = 'INSERT'` arm | ✅ backported — **but not until the C2 fix; `95b078e` transcribed the trigger and not the function** | `schema.sql:1346` |

⚠️  **The half-backport is the failure mode to remember.** Between `95b078e` and
the C2 fix, `schema.sql` carried the new trigger timing over the old UPDATE-only
body. On INSERT `old` is NULL, so `new.role is distinct from old.role` is true
for *every* insert including the legitimate `role='student'` one — so a database
built from `schema.sql` alone did not ship the escalation, it **could not create
a profile at all**. `insert into profiles (id, role) values (<self>,'student')`
raised `changing profiles.role requires an administrator` and
`src/lib/profile/persist-intake.ts`'s upsert threw on first write for every new
user. Fail-closed, but signup was broken on any preview branch, fresh laptop,
restore, or the CI `database` job's first phase.

`20260801110000`'s own verification block did not catch it: it asserted
`tgtype & 4 = 4`, i.e. the trigger's TIMING, which the half-backport satisfies
exactly. Both that block and `__tests__/db/policy-invariants.sql` (§A13) now
assert the function BODY, and the migration additionally runs a behavioural
probe wherever `auth.uid()` is real.

**To re-confirm on any database:** build it from `schema.sql` alone, wire
`auth.uid()` to `request.jwt.claims`, and run all three of —
`insert into profiles (id, role) values (<self>,'student')` → must SUCCEED;
`insert into profiles (id, role) values (<other>,'admin')` → must raise
`new profiles must be created with role=student`;
`update profiles set role='admin' where id = <self>` → must raise
`changing profiles.role requires an administrator`.

**`schema.sql` is not the file of record it claims to be.** It has diverged in
both directions (`docs/audit/12-database-design.md` §1.5). Still outstanding:

- `programs_read_all` / `universities_read_all` are defined **differently** in
  `schema.sql` (`auth.uid() is not null`) and in `20260719120000`
  (`to public using (true)`), and which one wins depends on application order.
  Neither file is authoritative. **F9 is unresolved and deliberately not touched
  by `20260802100000`** — it needs a product decision on anonymous catalogue
  browsing first.
- `20260724100000`'s two indexes are in the migration only.
- `20260802150000` **drops** four indexes that `schema.sql` still creates (it was
  `20260802100000` until the 2026-08-02 split). Until `schema.sql` is backported
  (plan step 2), a fresh database gets them back. That is harmless — they are
  redundant, not wrong — and the file is guarded so re-running it just skips.
- The long-term fix is to treat `schema.sql` as **generated output**
  (`supabase db dump`), not a hand-maintained artefact.

**The CI `database` job cannot pass yet, and not because of the nine
migrations.** This section previously listed two blockers (`auth.users.email`,
the missing `storage` schema) and said fixing them was out of scope. Both have
since been addressed in `.github/workflows/ci.yml` on this branch — and the list
was never complete. A reviewer ran the job's exact steps against Postgres 16.14
and found the real set:

1. **The stub has no `create publication supabase_realtime`.** The job dies on
   the FIRST migration:
   `20260512120000_help_requests_and_notifications.sql:52 — ERROR: publication
   "supabase_realtime" does not exist`. So the nine files under review are never
   reached. `schema.sql:1506` guards its own use with
   `if exists (select 1 from pg_publication …)`; those migrations do not.
2. **`alter publication … add table` is not idempotent** —
   `20260512120000:52` and `20260513120000:63` fail on pass 2 with
   "relation … is already member of publication".
3. **`recognition_score` is undone on replay.** `schema.sql` declares it, then
   `20250308120000:423-427` renames `universities` → `archive_raw_universities`
   and promotes `universities_v2`, which has no such column — so
   `20260723120000:21` fails. Fixing this in `schema.sql` does not fix the
   replay.
4. **`20250308120000:429` fails on pass 2** (`relation "programs" already
   exists`) — the catalogue normalize is not idempotent.

**All four are PRE-EXISTING files, not the nine.** The nine replay cleanly three
times over (verified again on 2026-08-02 after the fixes above, in both the
`shortlisted_programs`-present and `-absent` states). The ledger's blanket
"every migration must be idempotent" at the top of this page is a rule for NEW
files; it is not currently true of the directory, and the job's assertion should
either guard those three files or say honestly which files it covers.

Until then the job is red for reasons unrelated to the correctness of anything
under review, and it must not be added to the `ci-ok` gate — a required check
that fails on arrival is a check someone deletes.

**The migration plan steps that are still unwritten** (numbering follows
`docs/audit/12-database-design.md` §4):

| Step | What | Why it is still open |
|---|---|---|
| 2 | Backport into `schema.sql` + the CI replay gate | needs `.github/` and `schema.sql`, neither owned by the audit branch |
| 5 | `profiles` → `auth.users` FK, `handle_new_user()`, `'parent'` role | **BREAKING**; needs an orphan reconciliation on the real database first, and `getIdentity()` must upsert-then-read |
| 8 | The relationship-scoped RLS set (§3.3 §A–F) — replaces all 24 bare policies | **BREAKING**; must ship with the `inDemoCohort()` deletion and `counsellorId` threading in `src/lib/counsellor/data.ts` |
| 9 | Drop `can_act_as_counsellor()`, revoke `profile_display_name()` | gated on 8; the assertion in §3.3 §G fails by design until then |
| 11 | F7 storage path migration | needs object moves through the storage API, not SQL |
| 13 | Enum hardening (F14) | **BREAKING**; needs `npm run supabase:types` and removal of ~40 hand-written label tables |
| 14 | Authorship FK repair (F8) | **BREAKING**; UI must render "Former counsellor" for a null author |
| 15 | F15 uniqueness/range constraints | **BREAKING**; `persist-intake.ts` must become a transactional upsert |

**F4 (`course_scoring_v1` runs with owner rights and is granted to `anon`) is
not fixed by any migration in this directory.** The two-line fix
(`alter view … set (security_invoker = on)` + `revoke select … from anon`) was
deliberately left out of `20260802100000`, because revoking `anon` changes what
an unauthenticated visitor can read and that is a product decision. It is
asserted as a target-posture check (`policy-invariants.sql` B4) so it cannot be
forgotten.

---

## 6. Rules for adding a migration

1. **Idempotent, always.** `create table if not exists`, `drop policy if
   exists` + `create policy`, `create or replace function`. It will be replayed.
2. **Never guard a policy with `if not exists (… policyname = …)`.** That tests
   existence, not definition. It is how F9 happened: the guard matched a
   *differently defined* policy of the same name and skipped the fix, silently.
   Use `drop policy if exists` + `create policy`.
3. **End with a verification block that raises.** The pattern is
   `20260718130000:65-79`. A security migration that can silently no-op is worse
   than one that fails, because it reads as though it worked.
4. **Reason about filename order explicitly**, and write the constraint into the
   header. A policy cannot reference a function created by a later file, and
   nothing here will catch it for you before it hits the database.
5. **State SAFE or BREAKING in the header**, plus the app change required and how
   to reverse it. "BREAKING" means an app deploy must land in the same change.
6. **Enabling RLS and creating the table must never be separated.** A table
   created without `enable row level security` is readable *and writable* by the
   anon key that ships in the browser bundle, and any policies attached to it are
   inert. That is how `cities` shipped — and `schema.sql` went on REOPENING it
   for another two weeks after `20260719120000` closed it on the remote, because
   the rule was written down and the schema file was not updated. It is now
   transcribed there too, and `policy-invariants.sql` §A2 asserts it generally,
   for every table, so the next one is caught rather than the last one.
7. **One definition per concept, read from one place — and assert they agree.**
   If a gate decides who may receive something and a fan-out decides who is
   addressed, those are the SAME SET and must be the same function. Two
   hand-written copies of "who is staff" that disagreed by a single account
   aborted every real student's help request (2026-08-02). Copies do not stay in
   sync; they stay in sync until someone edits one. When a migration cannot
   avoid two definitions, its verification block must compare them **as sets, in
   both directions**, and fail.
8. **A pre-flight check must mirror EVERY `raise` in what it is protecting, and
   it must run FIRST — and the file that INSTALLS a gate needs one at least as
   much as the file that trips over it.** `20260802110000` installs
   `trg_bound_notification_payload` as `before insert OR UPDATE` and shipped with
   no pre-flight at all: its safety argument was about writers, and said nothing
   about the rows already stored. Any pre-existing row failing the gate became
   permanently un-updatable the moment it committed — marking it read aborts.
   It now carries the same probe. `20260802130000` counted two of the three conditions its
   trigger raises on, and it counted them halfway down the file — so the missed
   case aborted after five triggers were already installed. Put the check at the
   top: a refusal should cost nothing and leave nothing behind. And write the
   predicate against the trigger's *actual* test, not a tidier one — `trim()`
   where the trigger collapses whitespace is a false alarm, and a false alarm on
   a migration is how the next person learns to ignore it.
9. **Know your lock class, and state the expected duration in the header.**
   `create index` takes SHARE and blocks writes; `drop index` takes ACCESS
   EXCLUSIVE **on the parent table** and blocks reads. `npm run db:apply` sends a
   file as ONE implicit transaction, so every lock is held until COMMIT — a
   read-blocking statement anywhere in a long file makes the whole file a read
   outage, and the FIFO lock queue means one waiting drop stalls every query
   behind it. Put read-blocking statements in their own file with a short
   `lock_timeout` so they back off instead of queueing the world.
10. **Update this file in the same commit.**
