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
| 2 | `20250308120000_normalize_course_catalog.sql` | `cities`, `safe_int()`, `archive_raw_*` | ✅ | catalogue is live; table `cities` |
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
| 38 | `20260802100000_indexes_extensions_and_rls_gaps.sql` | `pg_trgm`, 14 FK indexes, query-shape indexes, `cities`/archive RLS, drops 4 redundant indexes | ❌ | index `idx_programs_course_name_trgm` |
| 39 | `20260802110000_notification_bounds.sql` | `trg_bound_notification_payload`, `counsellor_notification_targets(uuid)`, deck message cap | ❌ | trigger `trg_bound_notification_payload` |
| 40 | `20260802120000_student_matches_delete_policy_and_uniqueness.sql` | `matches_self_delete`, de-dup, unique index | ❌ | index `student_matches_profile_program_key` |
| 41 | `20260802130000_erasure_audit_and_retention.sql` | `deletion_requests`, `request_account_deletion()`, `audit_log`, notification retention | ❌ | table `audit_log` |
| 42 | `20260802140000_guardian_links_parity.sql` | student/counsellor read + admin write on `guardian_links` | ❌ | policy `guardian_links_student_read` |

Files 34–42 were written by the security/database audit and **none of them has
been executed against any database.** Each carries its own header stating what it
does, why, SAFE or BREAKING, the app change it needs, and how to reverse it.

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
 5. 20260802100000_indexes_extensions_and_rls_gaps.sql             SAFE
 6. 20260802110000_notification_bounds.sql                         SAFE
 7. 20260802120000_student_matches_delete_policy_and_...           BREAKING  ← needs service.ts
 8. 20260802140000_guardian_links_parity.sql                       SAFE
 9. 20260802130000_erasure_audit_and_retention.sql                 SAFE      ← see note
```

**Hard constraints, each of which will fail the replay if violated:**

| Constraint | Why |
|---|---|
| `20260801110000` **before** `20260801120000` | Everything `120000` adds routes authorisation through `profiles.role`. Until F0 is closed, `insert into profiles (id, role) values (auth.uid(), 'admin')` reopens all of it in one call — and `120000` reads as though the counsellor surface had been secured. |
| `20260801120000` **before** `20260801130000` | `simulation_results_admin` calls `is_admin()`, created by `120000`. This file was originally named `…100000` and would have aborted the replay. |
| `20260801120000` **before** `20260802100000` | the archive-table policies call `is_admin()`. |
| `20260801122000` **before** `20260802110000` | `notification_recipient_allowed()` and `counsellor_notification_targets(uuid)` both read `counsellor_assignments` (42P01 otherwise). |
| `20260801120000` **and** `20260801122000` **before** `20260802140000` | uses `is_admin()` **and** `writable_student_ids()`. |
| `20260801122000` **before** `20260802130000` | `deletion_requests_self` calls `visible_student_ids()`; the audit trigger attaches to `counsellor_assignments`. |
| `20260802100000` **before** `20260802140000` | not a hard failure — but the new `guardian_links` read policies filter on `student_profile_id`, whose index is created in `20260802100000`. Without it they work and seq-scan. |
| **The backfill inside `20260801122000`** before the relationship-scoped policies (plan step 8, unwritten) | otherwise every counsellor loses their entire roster the moment `inDemoCohort()` is deleted. |

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

-- Did 20260719120000's public-read branches actually apply? (F9)
select tablename, policyname, roles, qual from pg_policies
where schemaname = 'public' and policyname in ('programs_read_all','universities_read_all','cities_read_all');
--   qual = 'true'                  → the migration applied
--   qual = '(auth.uid() IS NOT NULL)' → it silently skipped; anonymous catalogue reads do not work
```

Then run the static gate, which asserts the invariants rather than listing
objects:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f __tests__/db/policy-invariants.sql
```

---

## 5. Known drift and open items

Everything here is a live gap, not a to-do list someone wrote optimistically.

**`schema.sql` is not the file of record it claims to be.** It has diverged in
both directions (`docs/audit/12-database-design.md` §1.5). Still outstanding:

- `programs_read_all` / `universities_read_all` are defined **differently** in
  `schema.sql` (`auth.uid() is not null`) and in `20260719120000`
  (`to public using (true)`), and which one wins depends on application order.
  Neither file is authoritative. **F9 is unresolved and deliberately not touched
  by `20260802100000`** — it needs a product decision on anonymous catalogue
  browsing first.
- `20260724100000`'s two indexes are in the migration only.
- `20260802100000` **drops** four indexes that `schema.sql` still creates. Until
  `schema.sql` is backported (plan step 2), a fresh database gets them back.
- The long-term fix is to treat `schema.sql` as **generated output**
  (`supabase db dump`), not a hand-maintained artefact.

**The CI `database` job cannot pass yet, and not because of the migrations.**
`.github/workflows/ci.yml:193-211` stubs the Supabase-only objects, and the stub
is incomplete in two ways that abort `schema.sql` long before any migration runs:

1. `create table auth.users (id uuid primary key)` has no `email` and no
   `raw_user_meta_data` columns — but `schema.sql:1902`
   (`counsellor_notification_targets`) and `20260801122000` both read
   `auth.users.email`, and SQL-language function bodies are validated at CREATE
   time. Expect `42703`.
2. There is no `storage` schema — but `schema.sql:1104` inserts into
   `storage.buckets` and `:1117` alters `storage.objects`.

Both need stub columns/schema added to `ci.yml` (out of scope for the audit
branch, which does not own `.github/`). Until then the job is red for reasons
unrelated to correctness, and it must not be added to the `ci-ok` gate — a
required check that fails on arrival is a check someone deletes.

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
   inert. That is how `cities` shipped.
7. **Update this file in the same commit.**
