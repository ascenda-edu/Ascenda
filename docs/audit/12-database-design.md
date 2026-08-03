# Ascenda — Database Design, RLS Architecture & Schema Refactor Plan

**Date:** 2026-08-01 · **Branch:** `security/phase0-contain`
**Scope:** `supabase/schema.sql` (2,513 lines), 33 migrations, `supabase/patches/`, `supabase/functions/`, `supabase/seed.sql`, and `src/lib/types/database.ts` (generated from the **live remote schema**, so it is evidence of drift).
**Method:** static read of repo SQL only. **No database was contacted; no migration was applied.** Builds on `SYNTHESIS.md`, `11-security-authz.md` and `02-data-layer.md` — findings already established there are cited, not re-derived.

> Companion to `11-security-authz.md`. That report owns the *application* authorisation architecture. This one owns the *schema*: tables, constraints, keys, cascade behaviour, RLS policy text, SECURITY DEFINER functions, indexes, and the reconciliation between `schema.sql`, the migration ledger and the live database.

---

## 0. Verdict

> ### ⛔ Read this first
>
> **Any authenticated user can make themselves a platform administrator with two PostgREST calls from the browser console.** `profiles_self_access` (`schema.sql:872-873`) is a `FOR ALL` policy — it covers INSERT and DELETE — and the role-escalation guard trigger (`:1231-1234`) is `BEFORE UPDATE` only. Delete your own `profiles` row, insert a new one with `role='admin'`, and `auth_role()` returns `'admin'` for every one of the 20 admin policies. This is **not** the `can_act_as_counsellor()` finding and is not mitigated by it; it survives every fix in `11-security-authz.md`. See **F0**. It is a two-line fix (§3.2 steps 4–7) and should ship before anything else in this report.

The schema is **well-commented and badly bounded**. Almost every table carries a comment explaining a past regression, and several designs (the storage path-binding, `guardian_links`, the `help_requests` column-scope guard trigger, the InitPlan migration) are genuinely sophisticated. But the schema has three structural defects that everything else follows from:

1. **`profiles` is not bound to `auth.users`.** No foreign key, and `id` carries `default gen_random_uuid()`. There is **no signup trigger** anywhere in the repo. Identity, the root of every scoping decision in a four-actor product, is held together by application convention.
2. **The counsellor↔student relationship does not exist**, so 24 RLS policies had nothing to scope on and were collapsed into `auth.uid() is not null`. The only containment left is an email-suffix filter over `student_personal_information.email` — **a column the student can write** (`personal_self`, `schema.sql:880`). The containment `SYNTHESIS.md §3.3` correctly tells you not to remove is *also self-editable by the attacker*.
3. **`schema.sql` is not replayable.** Line 809 creates an index on `universities.recognition_score`, a column the `create table` at `:181-218` never declares. A fresh environment provisioned from the file of record fails, and separately lacks `student_activities` (breaking every profile save), `cities` RLS, and two search indexes.

The product has **four actors and three role values** — `role in ('student','counsellor','admin')` (`schema.sql:60`). There is no `'parent'`. The parent portal, the parent chat mode (`chat_conversations.mode` accepts `'parent'`, `:2409`) and `guardian_links` all exist, but a guardian is stored as a student. That is why parent authorisation can only ever be an application-layer filter.

The good news: the fixes are almost entirely additive SQL, and one new table plus one set-returning helper collapses ~24 hand-written policy quals into a single repeated expression.

---

## 1. Current state

### 1.1 Table inventory & verdicts

37 tables in `public` across `schema.sql` + migrations, plus 2 live-only, plus 2 legacy archive tables, plus 1 view.

| Table | Rows (est.) | PK | RLS | Verdict |
|---|---|---|---|---|
| `profiles` | ~30 | `id uuid **default gen_random_uuid()**` | ✅ | 🔴 **no FK to `auth.users`**, no signup trigger, no `email`, no `updated_at`, no `'parent'` role, `FOR ALL` self policy permits self-DELETE |
| `student_personal_information` | ~30 | `profile_id` | ✅ | 🟠 duplicates `auth.users.email` into a **self-writable** column that the counsellor cohort filter trusts; `age int` on a minors platform with no CHECK; every column nullable |
| `student_academic_input` | ~30 | `profile_id` | ✅ | 🟠 `a_level_predicted_grades jsonb` is the input to the scoring table (`SYNTHESIS §4.1`) with zero structure; `graduation_year int` unbounded |
| `student_subjects` | ~150 | `id` | ✅ | 🟠 no `unique(profile_id, subject_name, level)`; delete-then-insert without a transaction (`02-data-layer` HIGH) |
| `student_admissions_tests` | ~60 | `id` | ✅ | 🟠 no unique on `(profile_id, test_type)` |
| `student_lifestyle_preference` | ~30 | `profile_id` | ✅ | 🟢 |
| `student_scores` | ~30 | `profile_id` | ✅ | 🟠 `student_band text` should be an enum; `breakdown jsonb` is a load-bearing untyped blob |
| `student_activities` | ? | `id` | **unknown** | 🔴 **exists only on the remote DB** — in no SQL file. Written on every profile save (`persist-intake.ts:103-117`, throws on error) |
| `simulation_results` | ? | `id` | **unknown** | 🔴 **exists only on the remote DB**; read by `admin/simulation/page.tsx:79` |
| `sources` | small | `id` | ✅ | 🟢 |
| `cities` | small | `id` | **not in `schema.sql`** | 🔴 `alter table cities enable row level security` and both `cities_*` policies exist **only** in migration `20260719120000`. A DB built from `schema.sql` has `cities` anon-writable — the exact hole that migration fixed |
| `universities` | ~2,926 | `id` | ✅ | 🔴 `recognition_score` column **missing from the DDL** but indexed at `:809`; `metadata jsonb` carries 8 scoring keys the `course_scoring_v1` view depends on |
| `programs` | ~119,000 | `id` | ✅ | 🟠 88 columns, ~40 of them free-text duplicates of typed columns (`min_ib` text **and** `min_ib_score smallint`; `preferred_subjects` text **and** `preferred_subjects_json` jsonb); 20 indexes, at least 3 redundant |
| `program_requirements` | ~119k? | `program_id` | ✅ | 🟠 parallel to the free-text requirement columns on `programs`; unclear which is authoritative |
| `deadlines` | ? | `id` | ✅ | 🟠 **no index on `program_id`** (the FK the app queries by) |
| `application_tasks` | ? | `id` | ✅ | 🟠 no index on `program_id` |
| `student_matches` | **unbounded growth** | `id` | ✅ | 🔴 no `unique(profile_id, program_id)`, **no self-DELETE policy** while the app's cache rebuild is a delete-then-insert → duplicates accumulate forever (F5) |
| `applications` | ~100 | `id` | ✅ | 🟠 `decision text` + CHECK should be an enum (5th `application_status` value `enrolled` is coerced away in app code, `SYNTHESIS §4.2`); no index on `program_id` |
| `application_checklist` | ? | `id` | ✅ | 🟠 **no index on `application_id`**; RLS is a correlated `exists` on an unindexed FK |
| `documents` | ? | `id` | ✅ | 🔴 cascade-deleting an `application` deletes this row but **orphans the storage object**, which then becomes permanently unreadable *and* undeletable by its owner (F7) |
| `shortlisted_programs` | small | `id` | ✅ | 🟢 (only table with a full self CRUD policy set); `due_date text` should be `date` |
| `help_requests` | small | `id` | ✅ | 🟠 `application_id **text**` with no FK (`11-security F12`); `status`/`initiated_by` text+CHECK, not enums |
| `notifications` | grows | `id` | ✅ | 🟢 policy set is the best in the schema; 🟠 `kind text` unconstrained, no retention/TTL |
| `help_messages` / `help_notes` / `help_meetings` | small | `id` | ✅ | 🟠 `author_profile_id ... on delete cascade` — deleting a counsellor **erases their replies out of students' threads** |
| `counsellor_notes` | small | `id` | ✅ | 🔴 `select`/`update` are bare-boolean; **no DELETE policy at all** → a note about a minor can never be erased (GDPR Art. 17) |
| `parent_contacts` | small | `id` | ✅ | 🔴 `FOR ALL` bare-boolean incl. DELETE (`11-security F2`) |
| `parent_messages` | small | `id` | ✅ | 🔴 same; plus no `sender_profile_id` — `sender text` is an unattributed label |
| `guardian_links` | tiny | `id` | ✅ | 🟢 best-designed table; 🟠 **the student cannot see their own guardian links**, and there is no write path at all (no invite flow, no admin policy) |
| `student_documents` | small | `id` | ✅ | 🔴 `FOR ALL` bare-boolean incl. DELETE |
| `counsellor_decks` | small | `id` | ✅ | 🟢 |
| `counsellor_deck_programs` | small | `id` | ✅ | 🟢; 🟠 no index on `program_id` |
| `deck_assignments` | small | `id` | ✅ | 🔴 write policy checks **deck** ownership, never the student → notification injection (`11-security F6`) |
| `saved_searches` | small | `id` | ✅ | 🟢 |
| `chat_feedback` | small | `id` | ✅ | 🟢 |
| `chat_conversations` | grows | `id` | ✅ | 🟠 `mode` is client-set (`11-security F3/F4`); accepts `'parent'` — a value `profiles.role` cannot hold |
| `chat_messages` | grows | `id` | ✅ | 🟠 correct for confidentiality, **wrong as an action-provenance store** (`11-security F4`); no retention |
| `archive_raw_courses`, `archive_raw_universities` | legacy | — | **unknown** | 🟠 present in generated types, created by `20250308120000`, absent from `schema.sql`. Contain raw imported catalogue data. RLS status unverifiable from the repo |
| `course_scoring_v1` (view) | — | — | n/a | 🔴 `grant select … to anon` (`:691`) on a view over RLS-protected base tables. Views run with the **view owner's** rights unless `security_invoker` is set — it is not. See F8 |
| `scholarships` | **does not exist** | — | — | 🔴 queried on every render of `/scholarships` (`02-data-layer` LOW) |

**Normalisation notes**

- `student_personal_information.email` duplicates `auth.users.email`. It is self-writable and is the *sole* input to the counsellor cohort filter (`counsellor/data.ts:245, 535, 771`). Two sources of truth for the identifier that gates PII access.
- `programs` holds both parsed and raw forms of the same fact in ~12 places (`min_ib`/`min_ib_score`, `min_alevel`/`min_a_level_score`/`a_level_min_numeric`, `preferred_subjects`/`preferred_subjects_json`, `tuition`/`tuition_fees_international`/`yearly_international_tuition_fee_gbp`). Nothing declares which wins; `course_scoring_v1` and `matching/service.ts` each pick differently.
- `programs.metadata` / `universities.metadata` carry **12 untyped keys** the `course_scoring_v1` view reads through `safe_int()` (`schema.sql:45`), which **returns NULL rather than raising** on bad input: `course_tier`, `total_course_score`, `university_score`, `selectivity_score`, `qs_uk_rank`, `times_sunday_rank`, `guardian_rank`, `nss_score_pct`, `international_students_ratio_pct`, `student_to_staff_ratio`, `student_dorm_cost_gbp_per_year`, `average_rent_outside_campus_gbp_per_month`. A malformed import silently degrades every score with no error anywhere.
- `documents` (storage-backed, per application) and `student_documents` (counsellor tracker, per student) are two unrelated document systems with no link between them (`02-data-layer` LOW).

### 1.2 RLS policy classification

**93 `create policy` statements in `schema.sql`**, plus `cities_read_all`/`cities_admin` (migration-only). Classification: `self` = owner predicate · `rel` = relationship predicate · `role` = role predicate · `admin` · **`BARE`** = collapses to "any authenticated user".

| Table | Policy | Cmd | Class | Note |
|---|---|---|---|---|
| profiles | `profiles_self_access` | **ALL** | self | includes DELETE — self-destruct from the browser |
| profiles | `profiles_admin_view` | SELECT | admin | InitPlan ✅ |
| profiles | `profiles_counsellor_read` | SELECT | **BARE** | every profile readable by everyone |
| student_personal_information | `personal_self` | ALL | self | |
| student_personal_information | `personal_admin` | ALL | admin | ✅ |
| student_personal_information | `personal_counsellor_read` | SELECT | **BARE** | all student PII |
| student_academic_input | `academic_input_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | self/admin/**BARE** | |
| student_subjects | `subjects_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | self/admin/**BARE** | |
| student_admissions_tests | `admissions_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | self/admin/**BARE** | |
| student_lifestyle_preference | `lifestyle_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | self/admin/**BARE** | |
| student_scores | `scores_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | self/admin/**BARE** | |
| universities | `universities_read_all` | SELECT | **BARE** | intentional (catalogue) — but see F9 |
| universities | `universities_admin` | ALL | admin | ✅ |
| programs | `programs_read_all` / `programs_admin` | SELECT/ALL | **BARE**/admin | intentional; F9 |
| program_requirements | `requirements_read_all` / `_admin` | SELECT/ALL | **BARE**/admin | intentional |
| deadlines | `deadlines_read_all` / `_admin` | SELECT/ALL | **BARE**/admin | intentional |
| application_tasks | `application_tasks_read_all` / `_admin` | SELECT/ALL | **BARE**/admin | intentional |
| sources | `sources_read_all` / `_admin` | SELECT/ALL | **BARE**/admin | intentional |
| cities | `cities_read_all` / `cities_admin` | SELECT/ALL | public/admin | **migration-only — not in `schema.sql`** |
| student_matches | `matches_self` | SELECT | self | |
| student_matches | `matches_self_write` | INSERT | self | |
| student_matches | `matches_self_update` | UPDATE | self | |
| student_matches | — | **DELETE** | **MISSING** | app performs delete-then-insert → F5 |
| student_matches | `matches_admin` / `matches_counsellor_read` | ALL/SELECT | admin/**BARE** | |
| shortlisted_programs | `shortlist_self{,_update,_insert,_delete}` + `_admin` | split ✅ | self/admin | 🟢 model policy set |
| applications | `applications_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | self/admin/**BARE** | |
| application_checklist | `checklist_self` | ALL | rel (via `applications`) | correlated `exists` on an **unindexed** FK |
| application_checklist | `checklist_admin` / `_counsellor_read` | ALL/SELECT | admin/**BARE** | |
| documents | `documents_self` / `_admin` / `_counsellor_read` | ALL/ALL/SELECT | rel/admin/**BARE** | |
| storage.objects | `application_documents_{read,insert,update,delete}` | split ✅ | rel (path) | strongest policy in the schema; but `a.id::text = split_part(...)` **defeats the PK index** |
| storage.objects | `application_documents_admin` | ALL | admin | `public.auth_role()` **not** wrapped → per-row |
| help_requests | `help_requests_select` | SELECT | rel + **BARE** | |
| help_requests | `help_requests_insert` | INSERT | self + **BARE** | column scope enforced by trigger ✅ |
| help_requests | `help_requests_update` | UPDATE | rel + **BARE** | ✅ has WITH CHECK |
| help_messages | `help_messages_select` | SELECT | **BARE** ∨ rel | |
| help_messages | `help_messages_insert` | INSERT | self ∧ (**BARE** ∨ rel) | |
| help_notes | `help_notes_select` | SELECT | **BARE** | counsellor-private notes readable by all |
| help_notes | `help_notes_insert` | INSERT | **BARE** ∧ self-author | |
| help_meetings | `help_meetings_select` / `_insert` / `_update` | split ✅ | rel + **BARE** | |
| notifications | `notifications_select` / `_insert` / `_update` / `_delete` | split ✅ | self (+ narrowed BARE on insert) | 🟢 **the model to copy** |
| counsellor_notes | `counsellor_notes_select` | SELECT | **BARE** | |
| counsellor_notes | `counsellor_notes_insert` | INSERT | **BARE** ∧ self-author | target student unchecked |
| counsellor_notes | `counsellor_notes_update` | UPDATE | **BARE** | **anyone can rewrite anyone's note** |
| counsellor_notes | — | **DELETE** | **MISSING** | no erasure path (GDPR) |
| parent_contacts | `parent_contacts_all` | **ALL** | **BARE** | incl. DELETE — `11-security F2` |
| parent_messages | `parent_messages_all` | **ALL** | **BARE** | incl. DELETE — `11-security F2` |
| guardian_links | `guardian_links_self` | SELECT | rel (parent only) | 🟢 no write policy — but **student cannot see their own links**, and no write path exists at all |
| student_documents | `student_documents_counsellor_all` | **ALL** | **BARE** | incl. DELETE |
| student_documents | `student_documents_student_read` | SELECT | self ∨ **BARE** | |
| counsellor_decks | `_select` | SELECT | **BARE** ∨ rel | InitPlan-wrapped ✅ |
| counsellor_decks | `_insert` / `_update` / `_delete` | split ✅ | self-owner | 🟢 |
| counsellor_deck_programs | `_select` / `_write` | SELECT/ALL | rel | 🟢 |
| deck_assignments | `_select` | SELECT | self ∨ **BARE** | |
| deck_assignments | `_write` | **ALL** | rel (**deck only**) | 🔴 student never checked — `11-security F6` |
| saved_searches | `saved_searches_self` | ALL | self | 🟢 |
| chat_feedback | `_insert` / `_select` / `_update` | split ✅ | self | 🟢 |
| chat_conversations | `chat_conversations_all_own` | ALL | self | 🟢 |
| chat_messages | `chat_messages_all_own` | ALL | rel | 🟢 confidentiality / 🟠 provenance |

**Totals — 93 policies:** 27 `self` · 12 `relationship` · 20 `admin` · **24 bare-boolean via `can_act_as_counsellor()`** · 8 intentionally-public catalogue reads · 2 hybrid.

**Cross-cutting policy defects**

- **`FOR ALL` where verbs must be split — 14 policies.** `parent_contacts_all`, `parent_messages_all`, `student_documents_counsellor_all`, `deck_assignments_write`, `counsellor_deck_programs_write`, `saved_searches_self`, `chat_conversations_all_own`, `chat_messages_all_own`, `profiles_self_access`, `personal_self`, `academic_input_self`, `subjects_self`, `admissions_self`, `lifestyle_self`, `scores_self`, `applications_self`, `checklist_self`, `documents_self`, and every `*_admin`. The first four are exploitable today; the `*_self` ones grant browser-initiated DELETE of the user's own record graph with no confirmation and no soft delete.
- **Missing DELETE policies where the app deletes.** `student_matches` (F5) and `counsellor_notes` (erasure). Postgres does **not** error on an RLS-filtered DELETE — it reports success with zero rows affected, which is why F5 has gone unnoticed.
- **Missing WITH CHECK:** none strictly missing (`FOR ALL` policies with only `USING` reuse it as the check), but `counsellor_notes_update`'s check is the same bare boolean as its `USING`, so it constrains nothing.
- **Privilege escalation via `profiles.role`: the guard does NOT hold.** `trg_guard_profile_role` (`:1231-1234`) is well written for the path it covers — `BEFORE UPDATE FOR EACH ROW`, `SECURITY DEFINER`, pinned `search_path`, re-reads `profiles` for the actor's role rather than trusting the row. But it is registered **`before update` only**, while `profiles_self_access` is `FOR ALL` and is the *only* policy on `profiles` covering INSERT and DELETE. There is no `profiles_self_insert` policy anywhere in `schema.sql` or in any migration. The UPDATE path is closed; the INSERT path is wide open. See **F0**.
- **Recursion:** the two documented recursion fixes (`20260713130000` for `auth_role()`, `20260713160000` for the deck helpers) **hold**. All four helpers that policies call are `SECURITY DEFINER` with a pinned `search_path`. No policy in `schema.sql` performs an invoker-rights read of a table whose own policies call back. ✅
- **InitPlan:** `20260713140000` wrapped **only** the 18 admin policies. Every one of the 24 `can_act_as_counsellor()` policies calls it **unwrapped** (`:1244`, `:1248`, … `:1689`), as do `application_documents_admin` (`:1149`) and every `auth.uid()` in the `*_self` policies. `can_act_as_counsellor()` is `SECURITY DEFINER` — a per-row invocation of a definer function on `applications`, `student_matches` and the `help_*` tables. The migration's own rationale ("~30k+ profiles lookups per query") applies verbatim and was never generalised.

### 1.3 SECURITY DEFINER function inventory

| Function | `search_path` pinned | Args | Verdict |
|---|---|---|---|
| `auth_role()` | ✅ `public` | none | 🟢 |
| `is_counsellor()` | ✅ | none | 🟢 correct — **and referenced by nothing** |
| `is_demo_account()` | ❌ **not pinned**, and **not** `security definer` | none | 🟠 invoker-rights, hardcodes `greg@workiflow.com`; unused |
| `can_act_as_counsellor()` | ✅ | none | 🔴 body is `auth.uid() is not null` (`11-security F1`) |
| `guard_profile_role_change()` | ✅ | trigger | 🟢 holds; ⚠️ does not cover INSERT |
| `guard_help_request_update()` | ✅ | trigger | 🟢 genuinely good — OLD-snapshot whitelist, `new is distinct from r` |
| `counsellor_notification_targets()` | ✅ | none | 🟠 fans **every** student help request to all counsellors + admins + a hardcoded email. Not relationship-scoped |
| `profile_display_name(uuid, text)` | ✅ | **caller-supplied uuid** | 🟠 **an oracle**: any authenticated user can `select public.profile_display_name('<any uuid>', null)` and read any profile's `full_name`, bypassing `profiles` RLS entirely. Low value alone, high value for enumerating a leaked uuid list |
| `notify_on_help_request_insert()` | ✅ | trigger | 🟠 interpolates `new.subject` / `new.university` / `new.program` (**all caller-controlled, uncapped**) into another user's notification `body`. Same class as F6 |
| `notify_on_help_request_accepted()` | ✅ | trigger | 🟠 same, via `new.university`/`new.program` |
| `notify_on_help_message_insert()` | ✅ | trigger | 🟠 `left(new.body,120)` — **bounded** ✅, but `author_name` comes from the actor's own `full_name`, which is self-writable and uncapped |
| `format_meeting_time(timestamptz, text)` | ✅ (not definer) | user tz | 🟢 exception-safe fallback |
| `notify_on_help_meeting_insert()` | ✅ | trigger | 🟠 interpolates `new.title` (caller-controlled, uncapped) into the student's feed |
| `notify_on_help_meeting_status()` | ✅ | trigger | 🟠 same |
| `notify_on_deck_assignment_insert()` | ✅ | trigger | 🔴 `11-security F6` — `new.message` **and** `deck_name` interpolated, neither bounded, target student unchecked |
| `bump_chat_conversation_last_message()` | ✅ | trigger | 🟠 unconditional `update chat_conversations … where id = new.conversation_id` as definer. RLS already guarantees ownership on the insert, so not exploitable today, but the trigger itself performs an **unscoped** cross-row write |
| `deck_owned_by_me(uuid)` / `deck_assigned_to_me(uuid)` | ✅ | deck id | 🟢 bound to `auth.uid()` internally |
| `search_filter_options()` | ✅ | none | 🟢 |
| `safe_int(text, int)` | n/a (immutable, not definer) | — | 🟠 silently returns NULL on bad input; 12 scoring keys depend on it |

**Generalisation of the F6 class.** Six SECURITY DEFINER triggers write rows into `notifications` for a *different* user, and **five of them interpolate uncapped caller-controlled text**. The `notifications_insert` RLS policy (`:1533-1552`) went to real trouble to bound the direct path — `kind='doc_nudge'`, root-relative `href`, `title like 'Your counsellor is %'`, `char_length(title) <= 160`, `char_length(body) <= 300` — and its own header at `20260715120000:14` concedes the triggers bypass all of it. The fix is not per-trigger patching: it is a **single `BEFORE INSERT` trigger on `notifications`** that enforces the same bounds for every writer, definer or not.

### 1.4 Index coverage

**Postgres does not auto-index foreign keys.** Every FK below was checked against the index list at `schema.sql:772-816` + `20260723120000` + `20260724100000`.

**Missing FK indexes (12):**

| Table.column | References | Cost today |
|---|---|---|
| `deadlines.program_id` | programs | `counsellor/data.ts:306-309` filters by it on 5 counsellor pages; also a seq scan per programme delete |
| `deadlines.source_id` | sources | cascade-set-null seq scan |
| `application_tasks.program_id` | programs | seq scan on the master-task lookup |
| `student_matches.program_id` | programs | seq scan of a growing table per programme delete |
| `applications.program_id` | programs | the applications↔programme join in 4 places (`02-data-layer` HIGH) |
| `application_checklist.application_id` | applications | **the `checklist_self` RLS predicate itself** and the checklist reads |
| `shortlisted_programs.program_id` | programs | "is this shortlisted" probes |
| `help_messages.author_profile_id` | profiles | cascade on profile delete |
| `help_notes.author_profile_id` | profiles | cascade |
| `help_meetings.counsellor_profile_id` | profiles | cascade + counsellor calendar |
| `counsellor_notes.author_profile_id` | profiles | cascade |
| `guardian_links.student_profile_id` | profiles | **the student-side and admin-side lookup direction**, plus cascade |
| `counsellor_deck_programs.program_id` | programs | cascade |
| `deck_assignments.assigned_by` | profiles | cascade-set-null |

**Missing query-shape indexes:**

| Index needed | Query it serves |
|---|---|
| `student_matches (profile_id, created_at desc)` | `service.ts:314-320` (latest cache stamp) and `:342-347` (`eq(profile_id) + gte(created_at) + order(score desc)`). The only index is `(profile_id, score desc)` — the `created_at` window is a filter-after-fetch over an **unboundedly growing** per-profile set (F5) |
| `programs using gin (course_name gin_trgm_ops)` | free-text programme search. `idx_programs_course_name` is a **btree** — useless for `ilike '%…%'` |
| `universities using gin (name gin_trgm_ops)` | free-text university search; same problem |
| `notifications (profile_id, audience, created_at desc) where read_at is null` | the unread-badge poll, which runs on a backoff timer on every page |
| `applications (profile_id, status)` | the priority board and every counsellor status rollup |
| `help_requests (counsellor_profile_id, status, created_at desc)` | `/counsellor/inbox` once threads are claimed |

`pg_trgm` **is already installed on the remote** (the generated types expose `show_trgm` / `show_limit`, `database.ts:2005-2006`) but is declared in no SQL file and used by no index.

**Redundant / suspect indexes (write amplification on a 119k-row table):**

| Index | Why |
|---|---|
| `idx_programs_field_of_study (field)` | **fully covered** by `idx_programs_field_id (field, id)` and `idx_programs_field_tuition (field, tuition)`. Three indexes lead on `field` |
| `idx_programs_degree_type (name)` | `name` is the nullable legacy twin of `course_name`; no query filters it |
| `idx_programs_university_life_override` | btree on a free-text column; never a predicate |
| `idx_programs_{intake_size,gender_ratio,student_staff_override,nss_override,average_salary_override}` | five speculative single-column indexes on low-selectivity numerics |
| `idx_universities_ranks (qs_uk_rank, times_sunday_rank, guardian_rank)` | the app sorts on `rank_overall`; the trailing two columns are unusable independently |

**PostgREST 1000-row cap — where pagination is structurally mandatory:**

- `universities` full read, `use-search-results.ts:103-105`, **~2,926 rows, no `.range()`** → silently truncated; the search page's university matching, country facets and ranking walk all derive from the truncated array (`02-data-layer` HIGH). *This is the single highest-traffic correctness bug in the data layer.*
- `student_matches` cache read — already paged ✅ (`service.ts:336-358`).
- `programs` catalogue walk — already paged via `(field, id)` ✅.
- Unbounded and un-paged: `student_documents` (`counsellor/data.ts:854`, no filter at all), `help_requests` inbox (`help-request-client.ts:39,54`), `counsellor_notes` per student, `parent_messages` per contact, `sources`, `deadlines` by program.

### 1.5 Schema drift ledger

Drift runs in **both** directions.

**A. On the remote DB, in no SQL file (`schema.sql` cannot rebuild prod):**

| Object | Evidence | Impact |
|---|---|---|
| `student_activities` | `database.ts:1400`; FK to `profiles` | `persist-intake.ts:103-117` throws → **every profile save fails** in a fresh env |
| `simulation_results` | `database.ts:1187` | `/admin/simulation` 42P01 |
| `universities.recognition_score` | indexed at `schema.sql:809`, never declared | see B |
| `pg_trgm` extension | `show_trgm`/`show_limit` in `database.ts:2005` | undeclared dependency |
| `archive_raw_courses`, `archive_raw_universities` | `database.ts:167,316`; created by `20250308120000` | present in prod, absent from the file of record; RLS status unknown |
| `cities` RLS + policies | migration `20260719120000` only | a `schema.sql`-built DB is anon-writable on `cities` |

**B. In `schema.sql`, broken or contradicted:**

| Object | Problem |
|---|---|
| `create index idx_universities_recognition_score` (`:809`) | **references a column the `create table` at `:181-218` does not declare.** `schema.sql` fails on a clean database — the file of record is not replayable |
| `programs_read_all` / `universities_read_all` | `schema.sql:928,933` = `for select using (auth.uid() is not null)`; `20260719120000:23-31` intends `for select to public using (true)` but guards with `if not exists (… policyname='programs_read_all')`, which **matches the existing policy and skips**. The two files disagree and the migration silently no-ops. Anonymous catalogue reads do not work |
| `idx_programs_admission_test`, `idx_programs_field_tuition` | in `20260724100000` only — `schema.sql` is one migration behind |
| `is_demo_account()` (`:1176-1182`) | declared `stable` with **no `security definer` and no `set search_path`**, unlike its three siblings |

**C. Application-referenced, nonexistent everywhere:** `scholarships` (`scholarships/page.tsx:60`).

**There is no migration ledger and no CI replay.** `SYNTHESIS §7` proposes exactly the right gate: build a throwaway Postgres from `schema.sql`, replay all 33 migrations **twice**, and diff the resulting table/column set against `database.ts`. That gate would have caught every row of this table.

### 1.6 Auth configuration & signup/login usability

**There is no `supabase/config.toml`.** OTP expiry, email-confirmation policy, password minimum length, session/JWT lifetime and the redirect-URL allowlist are configured **only in the Supabase dashboard** and are versioned nowhere. The repo carries zero evidence of their values, so they cannot be reviewed, diffed, or restored. Prior memory records OTP expiry 900 s and password min 8 set via the Management API; nothing in the tree corroborates that today.

| Surface | State | Evidence |
|---|---|---|
| Signup | **Does not exist.** No `/signup` page in the repo; middleware redirects `/signup → /login` | `middleware.ts:100-109`; `find src -ipath '*signup*'` empty |
| Login | `signInWithPassword` **only** | `components/forms/auth-form.tsx:104` |
| Password reset | **None.** No `resetPasswordForEmail` anywhere in `src/` or `scripts/` | exhaustive grep |
| Magic link / OTP | **None.** No `signInWithOtp`, `verifyOtp` | exhaustive grep |
| OAuth providers | **None.** No `signInWithOAuth` | exhaustive grep |
| `updateUser` (change email/password) | **None** | exhaustive grep |
| Profile row on signup | **No trigger.** Created incidentally by the wizard's upsert | `lib/profile/persist-intake.ts:28-34` |
| Role assignment | service-role scripts only; `/role-select` persists nothing | `scripts/create-admin-users.ts:91`; `role-select/page.tsx:123` |
| Callback | PKCE `exchangeCodeForSession` ✅; `next` **not allowlisted** | `auth/callback/route.ts:10,32` |
| Onboarding cache | `onboarding_complete` cookie, **30 days**, keyed on user id, **never invalidated on data change** | `middleware.ts:126-129,137-142` |
| Password policy in-repo | `z.string().min(8)` on the **login** form — cosmetic, constrains nothing | `lib/validation/auth.ts:5` |

**Judged as a real user journey — a 16-year-old and their parent:**

1. **Neither can sign up.** Accounts are provisioned by an administrator. That is a defensible design-partner posture, but it means `guardian_links` has no invite flow at all (§F16) and the parent's account arrives with no way to prove the relationship.
2. **Neither can recover a forgotten password.** There is no reset link, no magic link, no OTP. A teenager who forgets their password is locked out permanently until a human intervenes. For the demographic and the stakes (application deadlines), this is the single most likely real-world support incident, and there is no path.
3. **A provisioned user with no `profiles` row** hits `.single()` failures on the admin guards (`02-data-layer` LOW), gets `auth_role() = 'student'` by coalesce, and only materialises a profile if they complete the wizard. Meanwhile that same state is the F0 escalation window.
4. **`/role-select` is shown to every user after login** (`middleware.ts:201-208`) and offers exactly two options, `student` and `counsellor` — **`parent` is not offered at all** (`role-select/page.tsx:10-31`), even though `/parent` is a six-route portal. A guardian logging in is routed into the student portal.
5. **The 30-day onboarding cookie** means a student who completes their profile and later has data removed (or is affected by the `english_status` bug, `02-data-layer` CRITICAL) carries the stale verdict for a month.

### 1.7 Storage

**One bucket**, `application-documents` (`schema.sql:1033-1044`): `public = false` ✅, `file_size_limit = 20 MB` ✅, `allowed_mime_types` = pdf/doc/docx ✅. Access is exclusively via 1-hour signed URLs (`document-uploader.tsx:106`, `applications/documents/page.tsx:82`); **no `getPublicUrl` anywhere** ✅.

Path convention (`document-uploader.tsx:79-83`):
```
applications/<applicationId>/[task-<taskId>/]<ts>-<filename>
unassigned/<userId>/[task-<taskId>/]<ts>-<filename>
```
which matches the `split_part(name,'/',1..2)` policy shape exactly. Five policies (`:1054-1150`) plus a cast-fix re-creation of the delete policy in `patches/2024-11-08-fix-programs-and-storage.sql:20-38`.

Defects:

| # | Issue | Evidence |
|---|---|---|
| 1 | The `applications/` branch binds authorisation to a row that cascade-deletes → **orphaned, unreadable, undeletable objects** | F7 |
| 2 | `a.id::text = split_part(...)` casts the indexed side → the `applications` PK index is unusable; every object check seq-scans | `:1062` |
| 3 | MIME validation is bypassable: `allowedMimeTypes.has(file.type) \|\| extension in ['pdf','doc','docx']` — the `\|\|` makes renaming enough, and `contentType` is client-supplied, so the bucket's own MIME check is fed attacker-controlled input. **The 20 MB limit is the only non-bypassable control** | `document-uploader.tsx:47-58, 86` |
| 4 | `unassigned/<uid>/` uploads write **no `documents` row** — storage-only objects with no lifecycle, no listing, no cleanup, no export coverage | `document-uploader.tsx:94-99` |
| 5 | `application_documents_admin` is `FOR ALL` with **no `WITH CHECK`**, no `to authenticated`, and a bare `public.auth_role()` (per-row) | `:1146-1150` |
| 6 | No policy is scoped `to authenticated` — all five are open to `public`, relying on `auth.uid()` being null for anon | `:1054-1150` |

There is **no bucket for anything else** — profile photos, essays and the counsellor document tracker (`student_documents`) are metadata-only.

### 1.8 Realtime

**Publication membership and app subscriptions match exactly — no drift.** Six tables both ways: `notifications`, `help_requests`, `help_messages`, `help_notes`, `help_meetings`, `chat_conversations`.

`20260718130000_realtime_publication_and_doc_nudge_limits.sql:20-39` re-asserts all six idempotently and **ends with a verification block that raises if any is missing** (`:65-79`) — this is the pattern the rest of the schema should adopt (see §3.3 §G). It exists because `chat_conversations` had previously drifted out, leaving the assistant permanently fast-polling.

Every subscription flows through one hook, `use-realtime-poll.ts:146-159`, with a documented poll-fallback on `CHANNEL_ERROR|TIMED_OUT|CLOSED`. Two notes:

- **`chat_messages` is deliberately not published** — the assistant subscribes to the conversation row, whose `last_message_at` is bumped by `trg_chat_message_bump`. That is a sound design (one event instead of N) and should be preserved.
- **The counsellor inbox subscribes to `help_requests` and `help_messages` with no filter** (`counsellor-inbox.tsx:69-70`). Realtime authorisation is *entirely* the table's RLS policy, and those policies are bare-boolean today — so every signed-in user with that page open receives a live feed of every help request and message on the platform. Fixing the policies (§3.3 §E) fixes this too; there are no `realtime.messages`/broadcast policies in the repo to fall back on.

---

## 2. Findings

Numbered in discovery order; read in severity order.

| Sev | # | Title |
|---|---|---|
| 🔴 CRITICAL | F0 | Any authenticated user can become an admin in two PostgREST calls |
| 🔴 CRITICAL | F1 | `profiles` has no FK to `auth.users`, and no row is created on signup |
| 🔴 CRITICAL | F2 | The counsellor cohort is gated on a column the student can write |
| 🔴 CRITICAL | F3 | `schema.sql`, the declared file of record, cannot build a database |
| 🔴 CRITICAL | F4 | `course_scoring_v1` is granted to `anon` and runs with owner rights |
| 🟠 HIGH | F5 | `student_matches` grows without bound — the cache DELETE is a silent no-op |
| 🟠 HIGH | F6 | Six SECURITY DEFINER triggers inject uncapped text into other users' feeds |
| 🟠 HIGH | F7 | Deleting an application orphans storage objects into an unreadable state |
| 🟠 HIGH | F8 | Deleting a counsellor destroys students' history and the audit trail |
| 🟠 HIGH | F9 | `20260719120000`'s public-read policies silently did not apply |
| 🟠 HIGH | F16 | No password recovery; `guardian_links` has no write path at all |
| 🟡 MEDIUM | F10 | `profile_display_name()` is a full-profile-name oracle |
| 🟡 MEDIUM | F11 | Four actors, three role values — `'parent'` does not exist |
| 🟡 MEDIUM | F12 | No account deletion, no soft delete, no audit log |
| 🟡 MEDIUM | F13 | 24 policies re-invoke a SECURITY DEFINER function per row |
| 🟡 MEDIUM | F17 | Bypassable document MIME allowlist; `unassigned/` objects with no lifecycle |
| 🟢 LOW | F14 | 17 text-typed status columns that want enums |
| 🟢 LOW | F15 | Missing uniqueness and range constraints |

---

### [CRITICAL] F0 — Any authenticated user can become an admin in two PostgREST calls

**`supabase/schema.sql:872-873`** × **`:1230-1234`**

```sql
create policy profiles_self_access on profiles          -- :872 — FOR ALL (no `for` clause)
  using (auth.uid() = id) with check (auth.uid() = id);

create trigger trg_guard_profile_role
  before update on profiles                             -- :1232 — UPDATE ONLY
  for each row execute function public.guard_profile_role_change();
```

`profiles_self_access` is the **only** policy on `profiles` covering INSERT, UPDATE and DELETE. Its predicate is identity, not content — it says nothing about which columns may be written. `guard_profile_role_change()` is the control that makes that safe, and its header (`:1206-1211`) reasons correctly about UPDATE. **It is never attached to INSERT.** There is no `profiles_self_insert` policy and no INSERT-side guard anywhere in `schema.sql` or in any of the 33 migrations.

**Attack — from the browser console of any signed-in account, using the anon key already in the bundle:**

```js
// 1. Remove the row the UPDATE guard protects. FOR ALL covers DELETE.
await supabase.from('profiles').delete().eq('id', myId);
// 2. Re-create it. Only WITH CHECK applies to INSERT: auth.uid() = id → passes.
//    No trigger fires. `role` is unconstrained apart from the CHECK, which permits 'admin'.
await supabase.from('profiles').insert({ id: myId, role: 'admin' });
```

`auth_role()` (`:855-859`) now returns `'admin'` for this session, which satisfies **all 20 admin policies** — including `personal_admin`, `academic_input_admin`, `subjects_admin`, `scores_admin`, `matches_admin`, `applications_admin`, `documents_admin`, `programs_admin`, `universities_admin`, every one of which is `FOR ALL`. The attacker now has platform-wide **read, write and DELETE** on every student's personal information, plus the `/admin` route guard (`admin/page.tsx:33`) and all three admin API routes, plus write access to the 119k-row catalogue.

Step 1 is not even necessary for the population most likely to try it: **nothing in the repo creates a `profiles` row on signup** (F1), so any account provisioned through the Supabase dashboard — the only way accounts are created, since signup is disabled — starts with no row and can go straight to step 2 with no data loss at all.

**Cost to the attacker of step 1:** their own profile row and its cascade. They can re-enter it through the wizard. **Detection:** none — there is no audit log (F12).

This is independent of `can_act_as_counsellor()`: fixing every finding in `11-security-authz.md` leaves it fully exploitable, and it is strictly more severe, because `can_act_as_counsellor()` grants reads while this grants `FOR ALL`.

> **F0 defeats the Phase 0 containment fix now in flight.** `supabase/migrations/20260801120000_close_counsellor_access_and_split_write_policies.sql` (another agent's work on this branch, not yet applied) is the correct immediate move — it restores `can_act_as_counsellor()` to `is_counsellor() or is_demo_account()` and splits the three `FOR ALL` policies with admin-only DELETE. But in doing so it makes the **entire** counsellor surface, and the new `is_admin()` DELETE policies, depend on `profiles.role` being trustworthy. F0 is exactly the hole in that assumption: after that migration lands, `insert into profiles (id, role) values (auth.uid(), 'counsellor')` is the one-call way to re-open everything it just closed — and `'admin'` additionally grants the DELETE verbs it was written to remove.
>
> **Ordering matters: the F0 migration (`20260801110000`) must be applied before `20260801120000`, not after.** They are independent and both idempotent, so this costs nothing — but applied in the wrong order there is a window in which the containment migration is trivially reversible by any user.

**Fix (§3.2 steps 4–7), all four parts required:**
1. `create policy profiles_self_insert … with check (id = auth.uid() and role = 'student')` — an explicit INSERT policy that pins the role.
2. Re-register the guard as `before insert or update` and give it a `tg_op = 'INSERT'` branch.
3. Split `profiles_self_access` into `select` + `update` and grant **no** self-DELETE policy.
4. Add the `auth.users` FK (F1) so `id` cannot be minted.

Steps 1–3 are a single small migration and can ship today, ahead of everything else in this report.

---

### [CRITICAL] F1 — `profiles` has no foreign key to `auth.users`, and no row is ever created on signup

**`supabase/schema.sql:57-66`**

```sql
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),   -- ← not `references auth.users(id)`
  role text not null default 'student' …
);
```

`rg 'auth\.users' supabase/` returns **four hits, all read-only lookups of a hardcoded email**. There is no `handle_new_user()` function, no `on_auth_user_created` trigger, and nothing in `src/` or `scripts/` that upserts a profile on first login (`scripts/seed-students.ts:313-328` creates profiles only for seeded accounts, via service role).

**Consequences, all live:**

1. **A newly-provisioned real user has no `profiles` row.** `auth_role()` (`:855`) coalesces to `'student'`, so RLS half-works, but every `.single()` on `profiles` throws `PGRST116` — and `admin/page.tsx:31`, `api/admin/import/route.ts:16`, `api/admin/update-deadlines/route.ts:14`, `api/admin/catalog-health/route.ts:34` **discard that error** (`02-data-layer` LOW) and fall through the null branch. Meanwhile every `profile_id` write into `student_*` fails on the FK. The user is stranded at the profile wizard with an unexplainable error.
2. **Deleting an auth user orphans the entire PII graph.** `auth.admin.deleteUser(id)` removes the login; `profiles` and all 20 cascading child tables — name, email, nationality, age, scores, applications, counsellor notes — **remain forever**, now unreachable by any authenticated session and invisible to the app. On a platform for minors this is an indefinite retention of children's personal data with no controller-visible record of it.
3. **`profiles.id` is not provably an auth identity.** The `default gen_random_uuid()` means any INSERT that omits `id` mints a profile bound to no one. `guard_profile_role_change()` (`:1212`) only fires `before update`, so such a row can be created with `role='admin'` directly.

**Fix:** `alter table profiles alter column id drop default;` + `add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;` after reconciling orphans, plus a `handle_new_user()` `after insert on auth.users` trigger and a `for insert with check (id = auth.uid())` policy. Extend the role guard to INSERT. Full SQL in §3.2.

---

### [CRITICAL] F2 — The counsellor cohort is gated on a column the student can write

**`src/lib/counsellor/data.ts:59-69, 245, 535, 771`** + **`supabase/schema.sql:880-881`**

`SYNTHESIS §3.3` correctly warns not to delete `inDemoCohort()` before fixing `can_act_as_counsellor()`, because it is the only thing keeping the open RLS a demo-data exposure. What that warning does not say is **what the filter reads**:

```ts
const emailById = new Map(personal.map((r) => [r.profile_id, r.email]));   // data.ts:245
ids = ids.filter((id) => inDemoCohort(emailById.get(id)));
```

`student_personal_information.email` — governed by `personal_self` (`schema.sql:880`), `FOR ALL … with check (auth.uid() = profile_id)`. **The student owns that column.**

**Attack:** any authenticated user runs, from the browser console,
```js
await supabase.from('student_personal_information')
  .update({ email: 'x+seed@ascenda.demo' }).eq('profile_id', myId);
```
and joins the counsellor roster. Conversely a *real* student who edits their email out of the pattern silently disappears from their counsellor's dashboard with no error on either side.

The containment is therefore not a containment; it is a client-supplied opt-in. This is the concrete reason the assignment table is a **prerequisite**, not a follow-up: there is no correct place to put the scope until the relationship is data.

**Fix:** §3.1 — `counsellor_assignments`, backfilled from today's cohort, then delete `inDemoCohort` and pass `counsellorId` into `loadCohort`.

---

### [CRITICAL] F3 — `supabase/schema.sql`, the declared file of record, cannot build a database

**`supabase/schema.sql:809`** creates `idx_universities_recognition_score on universities (recognition_score)`. The `create table universities` at **`:181-218`** declares 36 columns; `recognition_score` is not among them. `rg recognition_score supabase/` finds it only in that index and the identical one in `20260723120000:21`.

Running `schema.sql` against a clean database therefore aborts at line 809, before **all 93 RLS policies, all 19 functions, all 14 triggers and every table from line 1293 onward** (the entire help/counsellor/deck/chat half of the schema).

Compounding it, even a patched run produces a database that is missing `student_activities` (so profile saves throw, `02-data-layer` CRITICAL), missing `cities` RLS (so `cities` is anon-writable — reintroducing the exact hole `20260719120000` was written to close), and missing two search indexes.

**Actor:** anyone provisioning a preview, local, CI or DR environment. **Consequence:** the environment either fails to build or builds *insecurely and silently*, and CI has no gate that would notice (`SYNTHESIS §7`).

**Fix:** §3.5 reconciliation migration + the CI replay gate. Treat `schema.sql` as generated output (`supabase db dump`), not a hand-maintained artefact.

---

### [CRITICAL] F4 — `course_scoring_v1` is granted to `anon` and runs with owner rights over RLS-protected tables

**`supabase/schema.sql:323-691`**, grant at **`:691`**

```sql
create or replace view course_scoring_v1 as … ;
grant select on course_scoring_v1 to anon, authenticated;
```

The view is created without `with (security_invoker = on)`. On Postgres 15+/Supabase, a view **without** `security_invoker` executes with the **view owner's** privileges and the owner's RLS exemption — the base-table policies of the *querying* role are not applied. The view reads `programs` and `universities` only, so today the leak is catalogue data that is meant to be public anyway.

The severity is **structural, not current**: this is a `to anon` RLS-bypassing read surface sitting in the schema with no marker saying so. Any future edit that joins a `student_*` table into this 368-line view — for example to expose a personalised score — publishes that data to unauthenticated PostgREST callers, and nothing in review would flag it. `20260719120000` was written precisely because catalogue tables were reachable by `anon`; this view is the same exposure re-created one layer up.

**Fix:** `alter view course_scoring_v1 set (security_invoker = on);` and revoke `anon` unless anonymous catalogue browsing is a product requirement (see F9 — today it does not work anyway).

---

### [HIGH] F5 — `student_matches` grows without bound: the cache rebuild's DELETE is silently a no-op

**`supabase/schema.sql:957-967`** (no DELETE policy) × **`src/lib/matching/service.ts:895-907`**

```ts
const { error: deleteError } = await supabase.from('student_matches').delete().eq('profile_id', profileId);
if (deleteError) { /* skip rebuild */ } else { /* insert 300+ fresh rows */ }
```

The applicable policies for DELETE on `student_matches` are `matches_admin` (`(select auth_role()) = 'admin'` → false for a student) and nothing else — `matches_self` is `FOR SELECT`, `matches_self_write` `FOR INSERT`, `matches_self_update` `FOR UPDATE`. **Postgres does not error on an RLS-filtered DELETE**; it deletes zero rows and reports success. So `deleteError` is `null`, the guard passes, and the insert proceeds.

Migration `20260713130000:11` documents the *previous* incarnation of this — the delete failing with `54001` — and fixing the recursion converted a loud failure into a silent one.

**Consequence:** `FULL_CACHE_LIMIT = 300` (`service.ts:49`), and a rebuild fires on every cache miss: TTL expiry (24 h) **or** any profile edit (`isFreshAgainstProfile`, `:325`). A student who edits their profile ten times in one sitting writes 3,000 rows. There is no `unique (profile_id, program_id)`, so nothing rejects them. Reads survive only because `:327` filters on a 5-minute `created_at` window — over an index, `(profile_id, score desc)`, that **does not include `created_at`**, so every read fetches the whole accumulated per-profile set and filters in memory. Cost grows monotonically, forever, and the failure mode is a gradually slowing `/matches` page.

**Fix:** add `matches_self_delete`, add `unique (profile_id, program_id)`, add `(profile_id, created_at desc)`, and one-off delete the accumulated rows. Also stop discarding the delete result: `.select('id')` returns the deleted rows so zero-row deletes are detectable.

---

### [HIGH] F6 — Six SECURITY DEFINER triggers inject uncapped caller-controlled text into other users' notification feeds

**`schema.sql:1817-1852, 1862-1882, 1894-1948, 1973-1999, 2011-2069, 2327-2354`**

`11-security F6` identified `notify_on_deck_assignment_insert()`. It is not the only one, and patching it alone leaves the class open:

| Trigger | Interpolated, caller-controlled, unbounded |
|---|---|
| `notify_on_deck_assignment_insert` | `new.message`, `deck_name` |
| `notify_on_help_request_insert` | `new.subject`, `new.university`, `new.program` |
| `notify_on_help_request_accepted` | `new.university`, `new.program` |
| `notify_on_help_message_insert` | `author_name` (self-writable `profiles.full_name`) — body itself is `left(…,120)` ✅ |
| `notify_on_help_meeting_insert` | `new.title` |
| `notify_on_help_meeting_status` | `new.title`, `actor_name` |

`help_requests_insert` (`:1443-1447`) permits **any** authenticated user to insert a request with an arbitrary `student_profile_id` (the `can_act_as_counsellor()` branch), and `help_meetings_insert` (`:1515-1517`) the same for meetings. So each of these is a live cross-user content-injection primitive under today's posture, and `notify_on_help_request_insert` additionally fans out to *every* counsellor and admin via `counsellor_notification_targets()`.

Meanwhile the `notifications_insert` policy (`:1533-1552`) bounds the direct path to 160/300 characters, a fixed `kind`, a root-relative `href` and a fixed title prefix. The triggers bypass all of it, as `20260715120000:14` explicitly concedes.

**Fix (one object, not six):** a `BEFORE INSERT ON notifications` trigger applying the same bounds to every writer including definers — `kind` in a known set, `href` root-relative, `title` ≤ 160, `body` ≤ 300 (truncate rather than raise so a legitimate long subject never breaks a help request). §3.4.

---

### [HIGH] F7 — Deleting an application orphans its storage objects into an unreadable, undeletable state

**`schema.sql:745-752`** (`documents.application_id … on delete cascade`) × **`:1054-1144`** (storage policies)

The storage policies bind object access to a live `applications` row:

```sql
split_part(name, '/', 1) = 'applications'
and exists (select 1 from applications a
            where a.id::text = split_part(name, '/', 2) and a.profile_id = auth.uid())
```

`applications_self` is `FOR ALL`, so a student can delete an application from the browser. That cascades away the `documents` metadata row — but the bytes in the `application-documents` bucket are untouched, and the `exists` predicate that granted the owner `select`/`delete` now evaluates false. The object becomes **permanently unreadable and permanently undeletable by anyone except the service role**, while continuing to hold a minor's transcript or reference letter. The same happens on every `profiles` delete (F1) and on every re-seed.

Two secondary defects in the same policy:
- `a.id::text = split_part(name, '/', 2)` casts the **indexed side**, so the `applications` PK index cannot be used. Every storage row check is a seq scan of `applications`.
- The `unassigned/<uid>/` branch is the correct design and needs no join at all — which points at the fix.

**Fix:** move to an owner-first path convention `students/<profile_id>/applications/<application_id>/<file>` so authorisation is `split_part(name,'/',2) = auth.uid()::text` — no join, no index problem, and no dependency on a row that can be deleted. Migrate existing objects, keep the old policies for a deprecation window. Add a reconciliation job for already-orphaned objects.

---

### [HIGH] F8 — Deleting a counsellor destroys students' conversation history and the counsellor's own audit trail

Every FK to `profiles` was checked. **28 of 30 are `on delete cascade`**; the two exceptions are `help_requests.counsellor_profile_id` (`set null` ✅) and `deck_assignments.assigned_by` (`set null` ✅).

The cascades that are wrong are the ones where `profiles` is the **author**, not the **owner**:

| FK | On counsellor delete |
|---|---|
| `help_messages.author_profile_id` → cascade (`:1353`) | the counsellor's replies vanish **out of the student's thread**, leaving a one-sided conversation with no marker |
| `help_notes.author_profile_id` → cascade (`:1365`) | private case notes gone |
| `counsellor_notes.author_profile_id` → cascade (`:1573`) | every written assessment of every student, gone — the safeguarding record on a minors platform |
| `help_meetings.counsellor_profile_id` → cascade (`:1376`) | the **student's** meeting disappears from their calendar |
| `counsellor_decks.counsellor_id` → cascade (`:2164`) | → `deck_assignments` cascade → students silently lose assigned work |

And in the student direction, `profiles_self_access` being `FOR ALL` means a student can trigger the whole 20-table cascade themselves with one browser call, with no confirmation, no soft delete, no export prompt and no recovery. It is simultaneously the platform's only erasure mechanism (F12) and an unguarded self-destruct.

**Fix:** authorship FKs become `on delete set null` with the column made nullable and a `deleted_author_label` snapshot, or `on delete restrict` behind a proper offboarding routine. Ownership FKs stay `cascade` but move behind an explicit deletion procedure (§3.6) rather than a `FOR ALL` policy.

---

### [HIGH] F9 — `20260719120000`'s public-read policies silently did not apply

**`supabase/migrations/20260719120000_enable_rls_catalogue_tables.sql:21-31`**

```sql
if not exists (select 1 from pg_policies where … policyname='programs_read_all') then
  create policy programs_read_all on public.programs for select to public using (true);
end if;
```

`programs_read_all` **already existed** — `schema.sql:933` creates it as `for select using (auth.uid() is not null)`. The guard matched, the branch was skipped, and the intended `to public using (true)` policy was never created. Same for `universities_read_all`. Only `cities_read_all` (genuinely new) and `cities_admin` actually applied.

So the migration's stated goal — *"adds public SELECT policies so the app's catalogue browse/search keeps working"* — was achieved for one of three tables, and `schema.sql` and the migration now assert **different quals for the same policy name**, with the winner decided by application order. Anonymous catalogue reads do not work; any landing-page or SEO surface that assumes they do returns empty.

This is the general hazard of `if not exists (policyname = …)` guards: they test *existence*, not *definition*. Every other security migration in the repo correctly uses `drop policy if exists` + `create policy`.

**Fix:** decide whether anonymous catalogue browsing is a requirement; then express it once, with `drop`+`create`, in both files.

---

### [MEDIUM] F10 — `profile_display_name()` is a full-profile-name oracle

**`schema.sql:1806-1814`** — `security definer`, takes a caller-supplied `uuid`, returns `profiles.full_name`, and is reachable over PostgREST RPC by any authenticated user. It exists to let notification triggers read names past RLS; nothing restricts it to that use.

`select public.profile_display_name('<uuid>', null)` resolves any profile id to a real name, bypassing `profiles` RLS. Under the current posture that adds nothing (`profiles_counsellor_read` already exposes everything), but it is the one leak that **survives** the F1 fix in `11-security` — after `can_act_as_counsellor()` is repaired, this function is still open.

**Fix:** `revoke execute … from authenticated, anon;` — trigger functions run as their own owner and do not need the grant. (Note it is not currently in the `grant execute` list at `:1202-1204`, so it holds only the default `public` execute grant, which is exactly the problem.)

---

### [MEDIUM] F11 — Four actors, three role values: `'parent'` does not exist

**`schema.sql:60`** — `check (role in ('student', 'counsellor', 'admin'))`, against `chat_conversations.mode check (… in ('student','counsellor','parent'))` (`:2409`), `chat_feedback.mode` (`:2376`), a six-route `/parent` portal, and `guardian_links`.

A guardian is stored as `role='student'`. Therefore:
- `auth_role()` can never return `'parent'`, so the `Identity`/`can()` design in `11-security §Target` cannot express parent authorisation at all — it must remain an application-layer `guardian_links` filter forever.
- Every parent account also receives the **full student portal**, including the profile wizard and their own (empty) matches.
- `/role-select` (`role-select/page.tsx:123`) writes `'parent'` into `sessionStorage` because there is nowhere else to put it — which is `11-security F8`'s root cause, not just its symptom.
- Middleware cannot route `/parent` by role.

**Fix:** add `'parent'` to the constraint, backfill from `guardian_links`, and make `role` a real Postgres enum (`user_role`) so the app's `Role` union is derivable rather than hand-written. Note a person can legitimately be both a parent and a counsellor — if that is a real case, `role` becomes a *primary* role plus capability rows; the assignment/guardian tables already provide the capability edges.

---

### [MEDIUM] F12 — No account deletion, no soft delete, no audit log, on a platform holding minors' PII

- **Deletion.** The only paths that remove a user are (a) `scripts/seed-students.ts:481` under service role, and (b) a student issuing `delete from profiles` themselves via `profiles_self_access` (`FOR ALL`) — which is not a product feature, is not offered in the UI, cannot be undone, and does not delete their `auth.users` row (F1) or their storage objects (F7). There is **no `/api/profile/delete`**, no `deleted_at` column on any table, no `deletion_requests` table.
- **Export exists** (`/api/profile/export`), so the GDPR posture is half-built: portability yes, erasure no.
- **Audit log: none.** No table records who read or wrote a student's record. On a platform whose users are children and whose staff role is "counsellor with access to everything", the absence of an audit trail is both a compliance gap (UK Children's code / GDPR Art. 30, and safeguarding practice) and an operational one — after the F2/`11-security F1` exposure there is **no way to determine what was accessed**.
- `counsellor_notes` has no DELETE policy at all, so the one category of record most likely to attract an erasure request is the one category nobody can erase.

**Fix:** §3.6 — `deletion_requests` + a `request_account_deletion()` RPC + a service-role job; `audit_log` written by definer triggers on relationship changes, role changes, counsellor-note writes and deletion requests; retention defaults on `notifications` and `chat_messages`.

### [MEDIUM] F13 — 24 policies re-invoke a SECURITY DEFINER function per row

`20260713140000` fixed exactly 18 admin policies and stopped. Every `*_counsellor_read` policy (`:1244-1284`), every `help_*` policy (`:1434-1523`), `counsellor_notes_*`, `parent_*_all`, `student_documents_*` calls `public.can_act_as_counsellor()` **unwrapped**, and `application_documents_admin` (`:1149`) calls `public.auth_role()` unwrapped. Each is a per-row function invocation on tables the counsellor pipeline reads 40× per page (`02-data-layer` MEDIUM). The migration's own measurement — "~30k+ profiles lookups per query … 8s statement timeout" — is the precedent.

The replacement policies in §3.3 use `col in (select public.visible_student_ids())`: an **uncorrelated** set-returning call, hashed once per statement, then an O(1) probe per row. (Note that wrapping a *correlated* helper such as `(select public.counsels_student(profile_id))` does **not** produce an InitPlan — it stays a per-row SubPlan. This is the trap to avoid when rewriting.)

### [LOW] F14 — Text-typed status columns that want enums

`applications.decision`, `help_requests.status`, `help_requests.initiated_by`, `help_meetings.status`, `help_meetings.status_changed_by`, `guardian_links.status`, `parent_contacts.status`, `parent_messages.sender`, `student_documents.{doc_type,status}`, `counsellor_notes.note_type`, `counsellor_deck_programs.{rarity,fit}`, `chat_*.mode`, `chat_messages.{role,action_state}`, `notifications.{kind,audience}`, `student_scores.student_band`, `shortlisted_programs.stage`. All are `text` + CHECK. CHECKs are honest, but they are invisible to `supabase gen types` (which emits `string`), which is a direct cause of the 40 hand-written label tables and 3 spellings of `decision` in `SYNTHESIS §2`. `notifications.kind` has no constraint at all — 12 distinct values are produced by triggers and app code.

### [LOW] F15 — Missing uniqueness and range constraints

`student_subjects` has no `unique(profile_id, subject_name, level)` (the delete-then-insert at `persist-intake.ts` is the only thing preventing duplicates, and it is untransacted). `student_admissions_tests` likewise on `(profile_id, test_type)`. `student_personal_information.age` has no CHECK on a minors platform (`between 10 and 100`). `student_academic_input.graduation_year` unbounded. `shortlisted_programs.due_date` is `text`. `student_scores.total_score` unbounded. `programs.duration_years` unbounded.

### [HIGH] F16 — No password recovery, and `guardian_links` has no way to create a link

Two separate dead ends that strand real users, both rooted in the DB posture rather than the UI.

**(a) No recovery path.** The only auth verb in the codebase is `signInWithPassword` (`auth-form.tsx:104`) and `signOut`. There is no `resetPasswordForEmail`, no `signInWithOtp`, no `updateUser`, no OAuth. `NEXT_PUBLIC_SITE_URL` is declared in `.env.example:6` and **referenced nowhere**, so even if a reset were added there is no configured redirect target. A student who forgets their password — the most common support event on any consumer product, and more so for a 16-year-old with one login per school term — cannot recover their account. Their applications, deadlines and documents are simply inaccessible until an administrator intervenes manually.

**(b) `guardian_links` cannot be written.** The table has RLS enabled and exactly one policy — `for select … using (parent_profile_id = auth.uid())` (`schema.sql:1660-1662`). **No insert, update or delete policy exists, for any role, including admin.** `rg guardian_links src/ scripts/` returns reads only (`lib/parent/data.ts:64,81`), and `lib/types/demo-tables.ts:189` states the intent outright: *"Insert type on purpose; browser sessions never insert guardian_links."* The only row-creating code in the entire repo is the hardcoded demo `do $$` block in `20260716120000:58-80` — which links one email to one seeded student and which the migration's own header (`:16-19`) warns is silently destroyed by the next re-seed.

The design comment promises *"Phase 2: by the verified parent-invite flow"*. Phase 2 does not exist, and because there is no admin write policy either, **there is no way to link a parent to a child at all short of a service-role SQL statement.** Onboarding one real family requires a developer with production database credentials.

The same is true in reverse for the student: `guardian_links_self` scopes to `parent_profile_id`, so a minor **cannot see which adults have access to their record**, and cannot revoke one. On a platform for children, "who can see my data" must be answerable by the child.

**Fix:** ship password reset (a product decision, but the DB side is only `NEXT_PUBLIC_SITE_URL` + a redirect allowlist). For linking: add the student/guardian read policy and an admin write policy (§4 step 10), then build the invite flow — a `guardian_invites` table with a single-use token, accepted by the *student* (consent flows the right way), writing the link under service role.

### [MEDIUM] F17 — The document MIME allowlist is bypassable, and `unassigned/` uploads have no lifecycle

**`src/components/applications/document-uploader.tsx:47-58, 86, 94-99`**

```ts
return !(allowedMimeTypes.has(file.type) || (extension && ['pdf','doc','docx'].includes(extension)));
```

The `||` makes the extension a full escape hatch — renaming any file to `.pdf` passes. Server-side, the upload sends `contentType: file.type || undefined` (`:86`), which is also client-supplied, so `storage.buckets.allowed_mime_types` is validated against a value the attacker chose. **The 20 MB `file_size_limit` is the only control that cannot be bypassed**, and the bucket is otherwise a general-purpose 20 MB blob store for any authenticated user.

Separately, uploads with no `applicationId` land at `unassigned/<uid>/…` and **write no `documents` row** (`:94-99` is inside the `applicationId` branch). Those objects have no metadata, appear in no listing, are covered by no export, are deleted by no cascade, and are counted by nothing. They accumulate silently.

**Fix:** make the MIME check `&&` not `||`; derive `contentType` from a server-side sniff or from the extension allowlist rather than the client; give `unassigned/` uploads a `documents` row with a null `application_id` (requires making that column nullable) so they have a lifecycle, or drop the branch entirely.


---

## 3. Target schema

All SQL below is **idempotent** (`if not exists`, `drop policy if exists`, `do $$` guards) and matches the existing migration style. **None of it has been applied.**

Two of these are written out as reviewable migration files (again — **not applied**, do not `npm run db:apply` them without reading them first):

- `supabase/migrations/20260801110000_profiles_insert_guard.sql` — the F0 fix (§3.2 steps 4–7), extracted so it can ship alone and immediately. Ends with a self-verifying block that raises if any `ALL`/`DELETE` policy remains on `profiles` or if the trigger does not cover INSERT.
- `supabase/migrations/20260801122000_counsellor_assignments.sql` — §3.1 in full: table, indexes, RLS, the four relationship helpers, the cohort backfill, and a verification block that **warns loudly if the backfill produced zero rows** (which would empty the counsellor roster the moment `inDemoCohort()` is deleted).

> One consequence of the F0 fix worth planning for: `profiles_admin_view` is `for select` only, so after the split there is **no policy permitting an admin to update another user's profile** — there never was one, but the `FOR ALL` self policy made that easy to miss. A role-management UI needs an explicit `profiles_admin_write` policy; the guard trigger already permits admins to change `role`.

### 3.1 The keystone — `counsellor_assignments`

The relationship is the thing every other fix hangs off. Design notes:

- **Bidirectional visibility.** The student *and* their guardian can see who counsels them. `guardian_links` gets this wrong (`schema.sql:1660-1662`: only the parent can read). On a minors platform, "who has access to my child's record" must be answerable by the child and the guardian, not only by the professional.
- **No client writes.** Same posture as `guardian_links` — but with an explicit **admin** write policy, so there is an in-app way to manage assignments. `guardian_links` has *no* write path at all, which is why the parent portal has no invite flow (§4 step 9).
- **`status` not a boolean.** `pending` supports an invite/acceptance flow; `revoked` preserves the historical edge for audit rather than deleting it. Only `active` grants access.
- **One primary counsellor per student**, enforced by a partial unique index, with `secondary`/`observer` for handovers and supervision.
- **`revoked_at`/`activated_at` stamps** so the audit log can answer "who had access on date X".

```sql
-- supabase/migrations/20260801120000_counsellor_assignments.sql

create table if not exists counsellor_assignments (
  id                    uuid primary key default gen_random_uuid(),
  counsellor_profile_id uuid not null references profiles(id) on delete cascade,
  student_profile_id    uuid not null references profiles(id) on delete cascade,
  role                  text not null default 'primary'
                          check (role in ('primary', 'secondary', 'observer')),
  status                text not null default 'active'
                          check (status in ('pending', 'active', 'revoked')),
  assigned_by           uuid references profiles(id) on delete set null,
  note                  text,
  created_at            timestamptz not null default timezone('utc', now()),
  activated_at          timestamptz,
  revoked_at            timestamptz,
  constraint counsellor_assignments_not_self
    check (counsellor_profile_id <> student_profile_id),
  constraint counsellor_assignments_status_stamps
    check ((status <> 'active'  or activated_at is not null)
       and (status <> 'revoked' or revoked_at   is not null)),
  unique (counsellor_profile_id, student_profile_id)
);

-- The direction every RLS check reads: "who counsels this student, right now".
create index if not exists counsellor_assignments_student_idx
  on counsellor_assignments (student_profile_id, status);
-- The direction the counsellor roster reads: "my active caseload".
create index if not exists counsellor_assignments_counsellor_idx
  on counsellor_assignments (counsellor_profile_id, status);
-- Exactly one primary counsellor per student.
create unique index if not exists counsellor_assignments_one_primary_idx
  on counsellor_assignments (student_profile_id)
  where status = 'active' and role = 'primary';

alter table counsellor_assignments enable row level security;

-- CRITICAL: without `enable row level security` the policies below are inert and
-- default grants let any session insert an edge to any student — forging the
-- exact scoping seam this table exists to provide. (Same note as guardian_links.)

drop policy if exists counsellor_assignments_select on counsellor_assignments;
create policy counsellor_assignments_select on counsellor_assignments
  for select to authenticated
  using (
    counsellor_profile_id = (select auth.uid())
    or student_profile_id  = (select auth.uid())
    or exists (                                   -- the student's guardian
      select 1 from guardian_links g
      where g.student_profile_id = counsellor_assignments.student_profile_id
        and g.parent_profile_id  = (select auth.uid())
        and g.status = 'active'
    )
    or (select public.auth_role()) = 'admin'
  );

-- Writes: admins only. Everything else goes through the service-role invite
-- flow. No DELETE policy — revoke by setting status, never by erasing history.
drop policy if exists counsellor_assignments_admin_write on counsellor_assignments;
create policy counsellor_assignments_admin_write on counsellor_assignments
  for insert to authenticated
  with check ((select public.auth_role()) = 'admin');

drop policy if exists counsellor_assignments_admin_update on counsellor_assignments;
create policy counsellor_assignments_admin_update on counsellor_assignments
  for update to authenticated
  using ((select public.auth_role()) = 'admin')
  with check ((select public.auth_role()) = 'admin');
```

**Backfill from the current seeded cohort** — same shape as the `guardian_links` demo seed (`20260716120000:58-80`), and deliberately reading the *same* email suffix the app filters on today, so the roster is byte-identical the moment `inDemoCohort()` is deleted:

```sql
do $$
declare
  n integer;
begin
  -- Every real counsellor/admin gets the seeded cohort.
  insert into counsellor_assignments
    (counsellor_profile_id, student_profile_id, role, status, activated_at)
  select c.id, spi.profile_id, 'secondary', 'active', now()
  from profiles c
  join student_personal_information spi
    on lower(coalesce(spi.email, '')) like '%+seed@ascenda.demo'
  where c.role in ('counsellor', 'admin')
    and c.id <> spi.profile_id
  on conflict (counsellor_profile_id, student_profile_id) do nothing;

  -- The single-account demo (greg@workiflow.com) holds the counsellor inbox but
  -- is role='student'; resolve via auth.users, exactly as
  -- counsellor_notification_targets() and the guardian_links seed do.
  insert into counsellor_assignments
    (counsellor_profile_id, student_profile_id, role, status, activated_at)
  select u.id, spi.profile_id, 'primary', 'active', now()
  from auth.users u
  join student_personal_information spi
    on lower(coalesce(spi.email, '')) like '%+seed@ascenda.demo'
  where lower(u.email) = 'greg@workiflow.com'
    and u.id <> spi.profile_id
  on conflict (counsellor_profile_id, student_profile_id) do nothing;

  get diagnostics n = row_count;
  raise notice 'counsellor_assignments backfill complete (% new rows this stmt)', n;
end $$;
```

> **Re-seed caveat**, same as `guardian_links`: `scripts/seed-students.ts:481` purges seeded profiles and the `on delete cascade` takes the assignments with them. Re-run this migration after any re-seed.

**Relationship helpers.** `visible_student_ids()` is the important one: it is **uncorrelated**, so `x in (select …)` becomes a single hashed InitPlan (F13), it is `security definer` so it cannot recurse into the policies that call it, and it unifies self + counsellor + guardian in one place so the 24 policies below are textually identical.

```sql
create or replace function public.counsels_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from counsellor_assignments a
    where a.counsellor_profile_id = auth.uid()
      and a.student_profile_id = p_student
      and a.status = 'active'
  );
$$;

create or replace function public.is_guardian_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guardian_links g
    where g.parent_profile_id = auth.uid()
      and g.student_profile_id = p_student
      and g.status = 'active'
  );
$$;

-- Every student id the CURRENT user may READ. Uncorrelated on purpose: used as
-- `col in (select public.visible_student_ids())` so the planner evaluates it
-- ONCE per statement (InitPlan) and hash-probes per row. Wrapping a correlated
-- helper in (select …) does NOT achieve this — it stays a per-row SubPlan.
create or replace function public.visible_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union
  select a.student_profile_id from counsellor_assignments a
   where a.counsellor_profile_id = auth.uid() and a.status = 'active'
  union
  select g.student_profile_id from guardian_links g
   where g.parent_profile_id = auth.uid() and g.status = 'active';
$$;

-- Student ids the CURRENT user may WRITE ABOUT (counsellor-authored records:
-- notes, document tracker, parent comms). Guardians are read-only by design.
create or replace function public.writable_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union
  select a.student_profile_id from counsellor_assignments a
   where a.counsellor_profile_id = auth.uid() and a.status = 'active'
     and a.role in ('primary', 'secondary');
$$;

grant execute on function public.counsels_student(uuid)  to authenticated;
grant execute on function public.is_guardian_of(uuid)    to authenticated;
grant execute on function public.visible_student_ids()   to authenticated;
grant execute on function public.writable_student_ids()  to authenticated;
```

### 3.2 Identity: bind `profiles` to `auth.users` (F1)

```sql
-- supabase/migrations/20260801130000_profiles_auth_binding.sql

-- 1. Report (do not silently delete) any profile with no auth user.
do $$
declare orphans integer;
begin
  select count(*) into orphans
  from profiles p left join auth.users u on u.id = p.id
  where u.id is null;
  if orphans > 0 then
    raise warning 'profiles: % orphan row(s) with no auth.users match — '
                  'reconcile before the FK below can be added', orphans;
  end if;
end $$;

-- 2. Bind identity. `id` must come from auth, never be minted.
alter table profiles alter column id drop default;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- 3. Create the row on signup. Runs as definer so it is unaffected by RLS.
--    role is NEVER read from user_metadata — a client controls that at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'student',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Self-heal: if the trigger ever failed or predates a user, let the app
--    create its OWN row (and only its own). Pairs with an upsert in getIdentity().
drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'student');

-- 5. Close the INSERT hole in the role guard (it was BEFORE UPDATE only).
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.role is distinct from 'student'
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'new profiles must be created with role=student';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role then
    if auth.uid() is not null
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'changing profiles.role requires an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  before insert or update on profiles
  for each row execute function public.guard_profile_role_change();

-- 6. The fourth actor (F11), and an updated_at the app can trust.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('student', 'parent', 'counsellor', 'admin'));
alter table profiles add column if not exists updated_at timestamptz
  not null default timezone('utc', now());

update profiles p set role = 'parent'
where p.role = 'student'
  and exists (select 1 from guardian_links g where g.parent_profile_id = p.id)
  and not exists (select 1 from student_personal_information s where s.profile_id = p.id);

-- 7. Remove the self-DELETE footgun (F8/F12). Split the FOR ALL self policy;
--    deletion goes through request_account_deletion() (§3.6) instead.
drop policy if exists profiles_self_access on profiles;
create policy profiles_self_select on profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- (no DELETE policy — deliberate)
```

### 3.3 The replacement RLS policy set

One expression, repeated. Read scope = `visible_student_ids()`; write scope = the owner, or `writable_student_ids()` for counsellor-authored records.

> *(2026-08-03: this file was split — the posture change below stayed in
> `20260801120000_close_counsellor_access.sql`, while `is_admin()` and the verb
> split moved to `20260801115000_admin_helper_and_verb_split.sql`. The original
> name is kept in this paragraph because it records round 1.)*
>
> **Relationship to the in-flight Phase 0 migration.** `20260801120000_close_counsellor_access_and_split_write_policies.sql` moves the posture from **bare-boolean → role**: `can_act_as_counsellor()` becomes `is_counsellor() or is_demo_account()`, so a counsellor sees every student instead of every user seeing every student. That is the right emergency move and this section does not conflict with it — it is the **next** step, moving role → **relationship**, so a counsellor sees only their own caseload. Ship Phase 0 first; the policies below then replace it table by table, and §G drops the helper once nothing references it. The three `for delete … using (is_admin())` policies Phase 0 adds should be kept as-is; the sections below deliberately grant no DELETE on those tables, so Phase 0's admin-only delete remains the sole path.

```sql
-- supabase/migrations/20260801140000_relationship_scoped_rls.sql

-- ── A. The 8 per-student tables: replace `*_counsellor_read` (bare) ──────────
do $$
declare
  r record;
begin
  for r in select * from (values
    ('student_personal_information', 'profile_id', 'personal'),
    ('student_academic_input',       'profile_id', 'academic_input'),
    ('student_subjects',             'profile_id', 'subjects'),
    ('student_admissions_tests',     'profile_id', 'admissions'),
    ('student_lifestyle_preference', 'profile_id', 'lifestyle'),
    ('student_scores',               'profile_id', 'scores'),
    ('student_matches',              'profile_id', 'matches'),
    ('applications',                 'profile_id', 'applications')
  ) as t(tbl, col, prefix)
  loop
    execute format('drop policy if exists %I on public.%I', r.prefix || '_counsellor_read', r.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (%I in (select public.visible_student_ids())
             or (select public.auth_role()) = 'admin')
    $f$, r.prefix || '_relationship_read', r.tbl, r.col);
  end loop;
end $$;

-- profiles: counsellors/guardians see only their own people.
drop policy if exists profiles_counsellor_read on profiles;
create policy profiles_relationship_read on profiles
  for select to authenticated
  using (id in (select public.visible_student_ids())
         or (select public.auth_role()) = 'admin');

-- application_checklist / documents: scope through the owning application.
drop policy if exists checklist_counsellor_read on application_checklist;
create policy checklist_relationship_read on application_checklist
  for select to authenticated
  using (exists (
    select 1 from applications a
    where a.id = application_checklist.application_id
      and a.profile_id in (select public.visible_student_ids())
  ));

drop policy if exists documents_counsellor_read on documents;
create policy documents_relationship_read on documents
  for select to authenticated
  using (exists (
    select 1 from applications a
    where a.id = documents.application_id
      and a.profile_id in (select public.visible_student_ids())
  ));

-- ── B. F5: student_matches DELETE + de-duplication ──────────────────────────
drop policy if exists matches_self_delete on student_matches;
create policy matches_self_delete on student_matches
  for delete to authenticated using (profile_id = (select auth.uid()));

delete from student_matches sm using student_matches keep
 where sm.profile_id = keep.profile_id
   and sm.program_id = keep.program_id
   and sm.created_at < keep.created_at;
create unique index if not exists student_matches_profile_program_key
  on student_matches (profile_id, program_id);
create index if not exists student_matches_profile_created_idx
  on student_matches (profile_id, created_at desc);

-- ── C. counsellor_notes: relationship-scoped, author-owned, erasable ────────
drop policy if exists counsellor_notes_select on counsellor_notes;
drop policy if exists counsellor_notes_insert on counsellor_notes;
drop policy if exists counsellor_notes_update on counsellor_notes;

create policy counsellor_notes_select on counsellor_notes
  for select to authenticated
  using (student_profile_id in (select public.writable_student_ids())
         or (select public.auth_role()) = 'admin');
create policy counsellor_notes_insert on counsellor_notes
  for insert to authenticated
  with check (author_profile_id = (select auth.uid())
              and student_profile_id in (select public.writable_student_ids()));
create policy counsellor_notes_update on counsellor_notes
  for update to authenticated
  using  (author_profile_id = (select auth.uid()))
  with check (author_profile_id = (select auth.uid())
              and student_profile_id in (select public.writable_student_ids()));
create policy counsellor_notes_delete on counsellor_notes
  for delete to authenticated
  using (author_profile_id = (select auth.uid())
         or (select public.auth_role()) = 'admin');

-- ── D. F2 of 11-security: split the three `FOR ALL` bare policies ───────────
drop policy if exists parent_contacts_all on parent_contacts;
create policy parent_contacts_select on parent_contacts
  for select to authenticated
  using (student_profile_id in (select public.visible_student_ids())
         or (select public.auth_role()) = 'admin');
create policy parent_contacts_insert on parent_contacts
  for insert to authenticated
  with check (student_profile_id in (select public.writable_student_ids()));
create policy parent_contacts_update on parent_contacts
  for update to authenticated
  using  (student_profile_id in (select public.writable_student_ids()))
  with check (student_profile_id in (select public.writable_student_ids()));
-- no DELETE policy (parity with guardian_links)

alter table parent_messages
  add column if not exists sender_profile_id uuid references profiles(id) on delete set null;

drop policy if exists parent_messages_all on parent_messages;
create policy parent_messages_select on parent_messages
  for select to authenticated
  using (exists (
    select 1 from parent_contacts pc
    where pc.id = parent_messages.contact_id
      and pc.student_profile_id in (select public.visible_student_ids())
  ));
create policy parent_messages_insert on parent_messages
  for insert to authenticated
  with check (
    sender_profile_id = (select auth.uid())
    and exists (
      select 1 from parent_contacts pc
      where pc.id = parent_messages.contact_id
        and (pc.student_profile_id in (select public.writable_student_ids())
             or (select public.is_guardian_of(pc.student_profile_id)))
    )
  );
create policy parent_messages_update on parent_messages     -- read receipts only
  for update to authenticated
  using (exists (
    select 1 from parent_contacts pc
    where pc.id = parent_messages.contact_id
      and pc.student_profile_id in (select public.visible_student_ids())
  ))
  with check (exists (
    select 1 from parent_contacts pc
    where pc.id = parent_messages.contact_id
      and pc.student_profile_id in (select public.visible_student_ids())
  ));
-- no DELETE policy

drop policy if exists student_documents_counsellor_all on student_documents;
drop policy if exists student_documents_student_read on student_documents;
create policy student_documents_select on student_documents
  for select to authenticated
  using (student_profile_id in (select public.visible_student_ids())
         or (select public.auth_role()) = 'admin');
create policy student_documents_insert on student_documents
  for insert to authenticated
  with check (student_profile_id in (select public.writable_student_ids()));
create policy student_documents_update on student_documents
  for update to authenticated
  using  (student_profile_id in (select public.writable_student_ids()))
  with check (student_profile_id in (select public.writable_student_ids()));
-- no DELETE policy

-- ── E. help_* — participant-scoped, no bare boolean ─────────────────────────
drop policy if exists help_requests_select on help_requests;
create policy help_requests_select on help_requests
  for select to authenticated
  using (
    student_profile_id in (select public.visible_student_ids())
    or counsellor_profile_id = (select auth.uid())
    -- unclaimed threads remain visible to the student's assigned counsellors
    or (counsellor_profile_id is null
        and student_profile_id in (select public.writable_student_ids()))
    or (select public.auth_role()) = 'admin'
  );

drop policy if exists help_requests_insert on help_requests;
create policy help_requests_insert on help_requests
  for insert to authenticated
  with check (
    student_profile_id = (select auth.uid())
    or student_profile_id in (select public.writable_student_ids())
  );  -- column scope still enforced by trg_guard_help_request_update

drop policy if exists help_requests_update on help_requests;
create policy help_requests_update on help_requests
  for update to authenticated
  using (student_profile_id = (select auth.uid())
         or counsellor_profile_id = (select auth.uid())
         or student_profile_id in (select public.writable_student_ids()))
  with check (student_profile_id = (select auth.uid())
         or counsellor_profile_id = (select auth.uid())
         or student_profile_id in (select public.writable_student_ids()));

drop policy if exists help_messages_select on help_messages;
create policy help_messages_select on help_messages
  for select to authenticated
  using (exists (
    select 1 from help_requests hr
    where hr.id = help_messages.request_id
      and (hr.student_profile_id in (select public.visible_student_ids())
           or hr.counsellor_profile_id = (select auth.uid()))
  ));

drop policy if exists help_messages_insert on help_messages;
create policy help_messages_insert on help_messages
  for insert to authenticated
  with check (
    author_profile_id = (select auth.uid())
    and exists (
      select 1 from help_requests hr
      where hr.id = help_messages.request_id
        and (
          (author_role = 'student'    and hr.student_profile_id = (select auth.uid()))
          or (author_role = 'counsellor'
              and (hr.counsellor_profile_id = (select auth.uid())
                   or hr.student_profile_id in (select public.writable_student_ids())))
        )
    )
  );

drop policy if exists help_notes_select on help_notes;
create policy help_notes_select on help_notes
  for select to authenticated
  using (exists (
    select 1 from help_requests hr
    where hr.id = help_notes.request_id
      and hr.student_profile_id in (select public.writable_student_ids())
  ));

drop policy if exists help_notes_insert on help_notes;
create policy help_notes_insert on help_notes
  for insert to authenticated
  with check (author_profile_id = (select auth.uid())
    and exists (
      select 1 from help_requests hr
      where hr.id = help_notes.request_id
        and hr.student_profile_id in (select public.writable_student_ids())
    ));

drop policy if exists help_meetings_select on help_meetings;
create policy help_meetings_select on help_meetings
  for select to authenticated
  using (student_profile_id in (select public.visible_student_ids())
         or counsellor_profile_id = (select auth.uid()));

drop policy if exists help_meetings_insert on help_meetings;
create policy help_meetings_insert on help_meetings
  for insert to authenticated
  with check (counsellor_profile_id = (select auth.uid())
              and student_profile_id in (select public.writable_student_ids()));

drop policy if exists help_meetings_update on help_meetings;
create policy help_meetings_update on help_meetings
  for update to authenticated
  using (student_profile_id = (select auth.uid())
         or counsellor_profile_id = (select auth.uid()))
  with check (student_profile_id = (select auth.uid())
         or counsellor_profile_id = (select auth.uid()));

-- ── F. decks: check the STUDENT, not just the deck (11-security F6) ─────────
drop policy if exists deck_assignments_write on deck_assignments;
create policy deck_assignments_insert on deck_assignments
  for insert to authenticated
  with check ((select public.deck_owned_by_me(deck_assignments.deck_id))
              and student_profile_id in (select public.writable_student_ids()));
create policy deck_assignments_delete on deck_assignments
  for delete to authenticated
  using ((select public.deck_owned_by_me(deck_assignments.deck_id)));

drop policy if exists deck_assignments_select on deck_assignments;
create policy deck_assignments_select on deck_assignments
  for select to authenticated
  using (student_profile_id in (select public.visible_student_ids())
         or (select public.deck_owned_by_me(deck_assignments.deck_id)));

drop policy if exists counsellor_decks_select on counsellor_decks;
create policy counsellor_decks_select on counsellor_decks
  for select to authenticated
  using (counsellor_id = (select auth.uid())
         or (select public.deck_assigned_to_me(counsellor_decks.id))
         or (select public.auth_role()) = 'admin');

drop policy if exists counsellor_decks_insert on counsellor_decks;
create policy counsellor_decks_insert on counsellor_decks
  for insert to authenticated
  with check (counsellor_id = (select auth.uid())
              and (select public.auth_role()) in ('counsellor', 'admin'));

-- ── G. Retire the bare helper ───────────────────────────────────────────────
do $$
declare bare integer;
begin
  select count(*) into bare
  from pg_policies
  where schemaname = 'public' and qual like '%can_act_as_counsellor%';
  if bare > 0 then
    raise exception 'still % policies referencing can_act_as_counsellor() — '
                    'do not drop the function yet', bare;
  end if;
  drop function if exists public.can_act_as_counsellor();
end $$;

-- Restore is_counsellor() to service and pin is_demo_account()'s search_path.
create or replace function public.is_demo_account()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(lower(coalesce(auth.jwt() ->> 'email', '')) = 'greg@workiflow.com', false);
$$;

-- Close the name oracle (F10).
revoke execute on function public.profile_display_name(uuid, text) from public, anon, authenticated;
```

> **Self-verifying tail**, the pattern `20260715120000:70-91` already establishes and this report generalises: every security migration ends with a `do $$ … raise exception` block that aborts if it did not take effect. Section G is that block for this one.

### 3.4 One gate for every notification writer (F6)

```sql
-- supabase/migrations/20260801150000_notification_bounds.sql

create or replace function public.bound_notification_payload()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind is null or new.kind !~ '^[a-z][a-z0-9_]{0,48}$' then
    raise exception 'notifications.kind must be a short snake_case token, got %', new.kind;
  end if;
  if new.href is not null and (new.href !~ '^/' or new.href like '//%') then
    raise exception 'notifications.href must be root-relative, got %', new.href;
  end if;
  -- Truncate rather than raise: a long help-request subject must never break
  -- the insert that triggered it.
  new.title := left(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'), 160);
  new.body  := left(regexp_replace(new.body, '\s+', ' ', 'g'), 300);
  if new.title = '' then
    raise exception 'notifications.title must not be empty';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bound_notification_payload on notifications;
create trigger trg_bound_notification_payload
  before insert or update on notifications
  for each row execute function public.bound_notification_payload();

-- Bound the deck-assignment message at source too (belt and braces).
alter table deck_assignments
  add constraint deck_assignments_message_len
  check (message is null or char_length(message) <= 280) not valid;
alter table deck_assignments validate constraint deck_assignments_message_len;

-- Relationship-scope the notification fan-out: a student's help request should
-- reach THEIR counsellors, not all of them.
create or replace function public.counsellor_notification_targets(p_student uuid default null)
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.counsellor_profile_id
    from counsellor_assignments a
   where p_student is not null
     and a.student_profile_id = p_student
     and a.status = 'active'
  union
  -- Fallback for unassigned students: the duty pool.
  select p.id from profiles p
   where p.role in ('counsellor', 'admin')
     and (p_student is null
          or not exists (select 1 from counsellor_assignments a2
                          where a2.student_profile_id = p_student and a2.status = 'active'));
$$;
```

### 3.5 Reconciliation, indexes, and the drift fixes

```sql
-- supabase/migrations/20260801160000_schema_reconciliation.sql

-- F3 — the column schema.sql indexes but never declares.
alter table universities add column if not exists recognition_score smallint
  check (recognition_score between 0 and 10);

-- pg_trgm is already installed on the remote but declared nowhere.
create extension if not exists pg_trgm;

-- 02-data-layer CRITICAL — the two live-only tables.
create table if not exists student_activities (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  category    text not null,
  level       text,
  duration    text,
  highlight   text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists student_activities_profile_idx
  on student_activities (profile_id, sort_order);
alter table student_activities enable row level security;
drop policy if exists student_activities_self on student_activities;
create policy student_activities_self on student_activities
  for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
drop policy if exists student_activities_relationship_read on student_activities;
create policy student_activities_relationship_read on student_activities
  for select to authenticated
  using (profile_id in (select public.visible_student_ids())
         or (select public.auth_role()) = 'admin');

create table if not exists simulation_results (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null default gen_random_uuid(),
  batch_label           text not null,
  profile_name          text not null,
  programme_type        text not null,
  actual_university     text not null,
  actual_program        text not null,
  actual_country        text not null,
  student_score         numeric,
  student_band          text,
  student_ib_equivalent numeric,
  chance_percent        numeric,
  algorithm_result      text,
  algorithm_notes       text,
  validation_pass       boolean,
  score_breakdown       jsonb,
  profile_snapshot      jsonb,
  created_at            timestamptz default timezone('utc', now())
);
create index if not exists simulation_results_run_idx on simulation_results (run_id, created_at desc);
alter table simulation_results enable row level security;
drop policy if exists simulation_results_admin on simulation_results;
create policy simulation_results_admin on simulation_results
  for all to authenticated
  using ((select public.auth_role()) = 'admin')
  with check ((select public.auth_role()) = 'admin');

-- F4 — the view must not run with owner rights.
alter view course_scoring_v1 set (security_invoker = on);
revoke select on course_scoring_v1 from anon;

-- Legacy archive tables (present in prod per database.ts, absent from schema.sql).
do $$
begin
  if to_regclass('public.archive_raw_courses') is not null then
    execute 'alter table public.archive_raw_courses enable row level security';
    execute 'drop policy if exists archive_raw_courses_admin on public.archive_raw_courses';
    execute 'create policy archive_raw_courses_admin on public.archive_raw_courses
             for all to authenticated using ((select public.auth_role()) = ''admin'')
             with check ((select public.auth_role()) = ''admin'')';
  end if;
  if to_regclass('public.archive_raw_universities') is not null then
    execute 'alter table public.archive_raw_universities enable row level security';
    execute 'drop policy if exists archive_raw_universities_admin on public.archive_raw_universities';
    execute 'create policy archive_raw_universities_admin on public.archive_raw_universities
             for all to authenticated using ((select public.auth_role()) = ''admin'')
             with check ((select public.auth_role()) = ''admin'')';
  end if;
end $$;

-- ── Missing FK indexes (Postgres does not create these) ─────────────────────
-- (deadlines.program_id and application_checklist.application_id are covered by
--  the composite query-shape indexes below — do not add single-column twins.)
create index if not exists idx_deadlines_source             on deadlines (source_id);
create index if not exists idx_application_tasks_program    on application_tasks (program_id);
create index if not exists idx_student_matches_program      on student_matches (program_id);
create index if not exists idx_applications_program         on applications (program_id);
create index if not exists idx_shortlisted_program          on shortlisted_programs (program_id);
create index if not exists idx_help_messages_author         on help_messages (author_profile_id);
create index if not exists idx_help_notes_author            on help_notes (author_profile_id);
create index if not exists idx_help_meetings_counsellor     on help_meetings (counsellor_profile_id, scheduled_for);
create index if not exists idx_counsellor_notes_author      on counsellor_notes (author_profile_id);
create index if not exists idx_guardian_links_student       on guardian_links (student_profile_id, status);
create index if not exists idx_deck_programs_program        on counsellor_deck_programs (program_id);
create index if not exists idx_deck_assignments_assigned_by on deck_assignments (assigned_by);

-- ── Query-shape indexes ─────────────────────────────────────────────────────
-- Every text predicate in the app is a LEADING-wildcard `%term%` (verified: no
-- prefix-only ilike exists anywhere in src/), so the existing btree
-- idx_programs_course_name / idx_universities_name cannot serve any of them.
create index if not exists idx_programs_course_name_trgm
  on programs using gin (course_name gin_trgm_ops);
create index if not exists idx_universities_name_trgm
  on universities using gin (name gin_trgm_ops);
create index if not exists idx_universities_country_trgm      -- chat tool: ilike on the !inner embed
  on universities using gin (country gin_trgm_ops);

-- Search hot path: every programs query ends `.order('id')` as a unique
-- tiebreaker, so the sort key must carry `id` to stream instead of re-sorting.
create index if not exists idx_programs_university_course_id
  on programs (university_id, course_name, id);          -- ranking-cohort path (8 uni ids/page)
create index if not exists idx_programs_study_level_id
  on programs (study_level, id);
create index if not exists idx_programs_tuition_id
  on programs (yearly_international_tuition_fee_gbp, id)
  where yearly_international_tuition_fee_gbp is not null; -- tuition sort uses nullsFirst:false

create index if not exists idx_notifications_unread
  on notifications (profile_id, audience, created_at desc) where read_at is null;
create index if not exists idx_applications_profile_status
  on applications (profile_id, status);
create index if not exists idx_help_requests_counsellor_status
  on help_requests (counsellor_profile_id, status, created_at desc);

-- profiles is scanned by `.eq('role','student')` with no limit on 3 counsellor
-- paths (counsellor/data.ts:230, :523, :760).
create index if not exists idx_profiles_role on profiles (role);

-- Highest-frequency queries in the app: middleware.ts:152-155 runs four
-- profile_id lookups per request on a cookie-cache miss.
create index if not exists idx_student_subjects_profile_created
  on student_subjects (profile_id, created_at);
create index if not exists idx_student_admissions_profile_created
  on student_admissions_tests (profile_id, created_at);
create index if not exists idx_deadlines_program_date
  on deadlines (program_id, deadline_date);
create index if not exists idx_checklist_application_due
  on application_checklist (application_id, due_date);
create index if not exists idx_documents_application_uploaded
  on documents (application_id, uploaded_at desc);
create index if not exists idx_counsellor_notes_student_type
  on counsellor_notes (student_profile_id, note_type, created_at desc);
create index if not exists idx_help_meetings_student_status
  on help_meetings (student_profile_id, status, scheduled_for);
create index if not exists idx_help_messages_request_role
  on help_messages (request_id, author_role, created_at desc);

-- ── Redundant indexes (write amplification on 119k rows) ────────────────────
drop index if exists idx_programs_field_of_study;      -- covered by (field, id) and (field, tuition)
drop index if exists idx_programs_degree_type;         -- programs.name is the legacy twin of course_name
drop index if exists idx_programs_university_life_override;  -- btree on free text
drop index if exists idx_universities_ranks;           -- app sorts on rank_overall

analyze programs;
analyze universities;
analyze student_matches;
```

### 3.6 Deletion, retention and audit (F12)

```sql
-- supabase/migrations/20260801170000_erasure_and_audit.sql

create table if not exists deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  requested_by    uuid references profiles(id) on delete set null,
  reason          text,
  status          text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  requested_at    timestamptz not null default timezone('utc', now()),
  scheduled_for   timestamptz not null default timezone('utc', now()) + interval '7 days',
  completed_at    timestamptz,
  unique (profile_id) where status in ('pending', 'confirmed')
);
alter table deletion_requests enable row level security;
create policy deletion_requests_self on deletion_requests
  for select to authenticated
  using (profile_id in (select public.visible_student_ids())
         or (select public.auth_role()) = 'admin');

-- The student (or their guardian) asks; a service-role job executes after the
-- grace period. Erasure must delete auth.users — the profiles FK (§3.2)
-- cascades everything else, which is exactly why that FK comes first.
create or replace function public.request_account_deletion(p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare req uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  insert into deletion_requests (profile_id, requested_by, reason)
  values (auth.uid(), auth.uid(), left(coalesce(p_reason, ''), 500))
  on conflict (profile_id) where status in ('pending', 'confirmed')
  do update set requested_at = now(), reason = excluded.reason
  returning id into req;
  return req;
end;
$$;
grant execute on function public.request_account_deletion(text) to authenticated;

create table if not exists audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default timezone('utc', now()),
  actor_id     uuid,
  action       text not null,
  object_type  text not null,
  object_id    uuid,
  subject_id   uuid,          -- the student whose data was touched
  detail       jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_subject_idx on audit_log (subject_id, occurred_at desc);
create index if not exists audit_log_actor_idx   on audit_log (actor_id, occurred_at desc);
alter table audit_log enable row level security;
create policy audit_log_admin on audit_log
  for select to authenticated using ((select public.auth_role()) = 'admin');
-- No INSERT policy: only the definer trigger below writes here.

create or replace function public.write_audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare subj uuid;
begin
  subj := case tg_table_name
    when 'counsellor_assignments' then coalesce(new.student_profile_id, old.student_profile_id)
    when 'guardian_links'         then coalesce(new.student_profile_id, old.student_profile_id)
    when 'counsellor_notes'       then coalesce(new.student_profile_id, old.student_profile_id)
    when 'profiles'               then coalesce(new.id, old.id)
    else null end;
  insert into audit_log (actor_id, action, object_type, object_id, subject_id, detail)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(new.id, old.id), subj,
          jsonb_build_object('old_role', old.role, 'new_role', new.role,
                             'old_status', old.status, 'new_status', new.status));
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['counsellor_assignments','guardian_links','counsellor_notes','profiles','deletion_requests']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
       for each row execute function public.write_audit_row()', t);
  end loop;
end $$;

-- Retention: notifications and chat history are unbounded today.
alter table notifications  add column if not exists expires_at timestamptz
  generated always as (created_at + interval '180 days') stored;
create index if not exists notifications_expiry_idx on notifications (expires_at);
```

*(Storage path migration for F7 is deliberately separated — it requires moving objects via the storage API, not SQL, and is sequenced as step 11 in §4.)*

---

## 4. Migration plan

Each step is independently shippable and reversible. **SAFE** = no behaviour change with today's app; **BREAKING** = requires a coordinated app deploy.

| # | Step | Class | App change required |
|---|---|---|---|
| **0** | **`20260801110000_profiles_insert_guard.sql`** — the F0 fix, extracted from §3.2 so it can ship alone and today: split `profiles_self_access` into `select` + `update`, add `profiles_self_insert` pinning `role = 'student'`, re-register `trg_guard_profile_role` as `before insert or update` with the INSERT branch, grant no self-DELETE. **Ship this before everything else in this report and before the `11-security` P0 block.** | **SAFE** | none — nothing in `src/` inserts or deletes `profiles` (verified); `persist-intake.ts:28-34` upserts, which will now take the UPDATE path for existing rows and the new INSERT policy for new ones |
| 1 | **`20260801160000_schema_reconciliation.sql`** — `recognition_score`, `pg_trgm`, `student_activities`, `simulation_results`, archive-table RLS, all FK + query-shape indexes, drop 4 redundant indexes. *(Split the `security_invoker`/`revoke anon` lines out if anonymous catalogue reads turn out to be used.)* | **SAFE** | none. Unblocks preview/CI/local environments immediately |
| 2 | Backport steps 1's DDL into `schema.sql`; add the **CI migration-replay gate** (`SYNTHESIS §7`): build from `schema.sql`, replay all migrations twice, diff tables/columns against `database.ts` | **SAFE** | CI only |
| 3 | **`20260801120000_counsellor_assignments.sql`** — table, indexes, RLS, helpers, backfill. Nothing reads it yet | **SAFE** | none |
| 4 | **Policy test suite**, written against the target posture and marked `.failing` (`11-security §Principle 4`), plus the `no bare auth.uid() boolean` assertion | **SAFE** | test harness |
| 5 | **`20260801130000_profiles_auth_binding.sql`** — orphan report, FK to `auth.users`, `handle_new_user`, self-insert policy, INSERT role guard, `'parent'` role, `updated_at`, split the `FOR ALL` self policy | **BREAKING** | `getIdentity()` must upsert-then-read `profiles`; any code relying on browser-side `delete from profiles` (none found) must move to `request_account_deletion()`; `/role-select` and `useUserRole` must accept `'parent'` |
| 6 | **`20260801150000_notification_bounds.sql`** — the single BEFORE INSERT gate, `deck_assignments.message` length, relationship-scoped `counsellor_notification_targets(uuid)` | **SAFE** (truncates rather than raises) | update the three call sites of `counsellor_notification_targets()` inside the trigger bodies to pass `new.student_profile_id` |
| 7 | **F5 fix** — `matches_self_delete`, de-duplicate, `unique (profile_id, program_id)`, `(profile_id, created_at desc)` | **BREAKING** | `service.ts:895-907` must `.select('id')` on the delete and treat zero rows as a failed clear; the insert must become an upsert on the new unique key |
| 8 | **`20260801140000_relationship_scoped_rls.sql` §A–F** — replace all 24 bare policies. Ship **behind the backfill**, so an assigned counsellor sees exactly what they see today | **BREAKING** | delete `inDemoCohort()` (`counsellor/data.ts:59-69`) and pass `counsellorId` into `loadCohort`/`loadRoster`/`loadOutcomes`; `canActAsCounsellor` → real role check; chat `mode` from `profiles.role`; `loadCohort` scoped |
| 9 | **§3.3 §G** — assert zero remaining references, then `drop function can_act_as_counsellor()`; revoke `profile_display_name`; un-`.failing` the test suite | **BREAKING** | delete `src/lib/api/guards.ts:21-24` |
| 10 | **`guardian_links` parity** — add the student/admin read policy and an admin write policy; build the parent-invite flow it has never had | **SAFE** (additive) | new admin UI + invite route |
| 11 | **F7 storage** — new `students/<uid>/…` path convention + policies, dual-read window, move existing objects via the storage API, then drop the `applications`-join policies; reconcile already-orphaned objects | **BREAKING** | upload path builder + download URL resolution |
| 12 | **`20260801170000_erasure_and_audit.sql`** — `deletion_requests`, `request_account_deletion()`, `audit_log` + triggers, `notifications.expires_at` | **SAFE** | then build `/api/profile/delete` + the settings UI; a scheduled job to execute confirmed requests |
| 13 | **Enum hardening (F14)** — `create type user_role`, `application_decision`, `help_request_status`, … and `alter table … type`; regenerate `database.ts` | **BREAKING** | `npm run supabase:types` + remove the ~40 hand-written label tables (`SYNTHESIS §2`) |
| 14 | **Authorship FK repair (F8)** — `author_profile_id` FKs to `on delete set null` + `author_label` snapshot columns | **BREAKING** | render "Former counsellor" when the author is null |
| 15 | **F15 constraints** — uniqueness on `student_subjects`/`student_admissions_tests`, `age`/`graduation_year` ranges, `shortlisted_programs.due_date → date` | **BREAKING** | `persist-intake.ts` becomes an upsert (and gets its transaction, `02-data-layer` HIGH) |

**Rollback.** Steps 1, 3, 6, 10, 12 are additive — reverse with `drop`. Steps 8, 9 revert by re-creating `can_act_as_counsellor()` with the old body: **that single function restores the old posture for all 24 policies at once**, which is precisely why it was written that way and is worth preserving as the rollback lever until step 9. Step 5 reverses with `alter table profiles drop constraint profiles_id_fkey` + restoring the default. Step 7 reverses by dropping the unique index. Step 11 needs the dual-read window to remain open until the object move is verified.

**Sequencing constraints (hard):**
- 3 before 8 — the policies read the table.
- The **backfill inside 3** before 8 — otherwise every counsellor loses their roster on deploy.
- 5 before 12 — erasure cascades through the `auth.users` FK.
- 8 before 9 — the assertion in §G fails otherwise (by design).
- 1 before everything — nothing else can be tested in a preview environment until `schema.sql` builds.

---

## 5. Effort

| # | Finding | Effort | Risk if unfixed |
|---|---|---|---|
| **F0** | **Self-promotion to admin via the un-guarded `profiles` INSERT** | **S** | 🔴 **Any authenticated user gains platform-wide read/write/DELETE on every student's PII in two browser calls.** Survives every fix in `11-security-authz.md`. Undetectable — no audit log. **Fix first.** |
| — | **Prereq:** `counsellor_assignments` + helpers + backfill | **M** | blocks F2 and `11-security` F1/F3/F6 |
| F3 | `schema.sql` cannot build a database | **S** | 🔴 no preview/CI/DR environment is trustworthy; new envs come up insecure and silent |
| F1 | `profiles` unbound to `auth.users`; no signup trigger | **M** | 🔴 real signups strand at the wizard; deleted users' PII (minors') retained indefinitely and unreachably |
| F2 | Cohort gated on a self-writable column | **S** (given the prereq) | 🔴 the containment `SYNTHESIS §3.3` relies on is opt-in by the attacker |
| F4 | `course_scoring_v1` owner-rights + `to anon` | **S** | 🔴 an RLS-bypassing anon read surface, one join away from publishing student data |
| F5 | `student_matches` unbounded growth | **S** | 🟠 monotonic slowdown of the app's core page; a silent no-op the code believes succeeded |
| F6 | 6 definer triggers inject uncapped text | **S** | 🟠 cross-user content injection under a trusted heading; reopens a fixed class |
| F7 | Orphaned, unreadable, undeletable storage objects | **M** | 🟠 minors' documents retained with no access path and no deletion path |
| F8 | Authorship cascades destroy students' history | **S** | 🟠 offboarding one counsellor silently rewrites students' threads and erases safeguarding notes |
| F9 | `20260719120000` silently no-opped | **S** | 🟠 `schema.sql` and the migration assert different quals for the same policy name |
| F13 | 24 per-row SECURITY DEFINER policy calls | **S** (folded into step 8) | 🟠 the 57014 statement timeouts the InitPlan migration was written to fix, on counsellor pages |
| F10 | `profile_display_name()` name oracle | **S** | 🟡 survives the `11-security` F1 fix |
| F11 | No `'parent'` role | **M** | 🟡 parent authorisation can never leave the app layer; `/role-select` stays theatre |
| F16 | No password recovery; `guardian_links` has no write path at all | **M** | 🔴 a locked-out student is locked out permanently; onboarding one real family needs production DB credentials |
| F17 | Bypassable document MIME allowlist; `unassigned/` objects with no lifecycle | **S** | 🟡 the bucket is a general 20 MB blob store for any authenticated user; orphan objects accumulate uncounted |
| F12 | No deletion, no audit log, no retention | **L** | 🟠 GDPR Art. 17 unmet, Art. 30 unmet; after F0 or an exposure there is no way to say what was accessed |
| F14 | 17 text-typed status columns | **M** | 🟡 root cause of ~40 duplicated label tables (`SYNTHESIS §2`) |
| F15 | Missing uniqueness/range constraints | **S** | 🟡 duplicate subjects survive a failed profile save |
| — | CI migration-replay + schema-drift gate | **M** | prevents recurrence of F3 and the whole §1.5 ledger |
| — | Policy test suite (negative cases) | **M** | prevents recurrence of F2, F5 and `11-security` F1/F2 |

**Suggested cut.** **Step 0 (F0) ships today, alone, ahead of everything** — including the `SYNTHESIS §Phase 0` block, because F0 is a live vertical privilege escalation that none of the Phase 0 items touch. Then steps 1 → 3 → 4 → 6 → 5 (all S/M, roughly a week) make environments buildable, create the relationship, close the notification-injection class and fix identity. Steps 7 → 8 → 9 are the gate on onboarding any real student and must ship with their app changes. **Do not delete `inDemoCohort()` before step 8 lands** — and note per F2 that it was never as strong a containment as it appears.

**Two things this report would ask for above all others:** the F0 migration, and the CI migration-replay + schema-drift gate. The first closes the worst hole in the database; the second is the only reason this report's §1.5 drift ledger is 11 rows long instead of zero.
