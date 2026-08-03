/**
 * Read-only: report which migrations are actually present on the remote.
 *
 * WHY THIS EXISTS
 * ---------------
 * `supabase/MIGRATIONS.md` §4 carries this query as SQL to paste into the
 * dashboard, with the warning that its "Applied?" column is *inference from PR
 * history and session notes, not from the database*. That warning has been true
 * for months, and the database audit's top operational finding was precisely
 * that nobody could say what was applied.
 *
 * `scripts/apply-sql.ts` cannot answer it: it runs `client.query(sql)` and prints
 * only "✓ Applied", so a SELECT executes and its rows are discarded. Hence a
 * script that prints.
 *
 * CREATES NOTHING, CHANGES NOTHING. Safe on production, safe to re-run, and it
 * is the thing to run BEFORE any migration session and again after.
 *
 *   npm run db:probe
 */

import * as fs from 'fs';
import * as path from 'path';

import { Client } from 'pg';

const loadEnvFile = (filename: string): void => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadEnvFile('.env.local');

/**
 * One probe marker per migration: an object it creates that nothing else does.
 * Kept in step with `supabase/MIGRATIONS.md` §4 — when a migration is added,
 * add its marker here in the same commit, or this reports a false negative.
 */
const EXPECTED: ReadonlyArray<readonly [file: string, kind: string, obj: string]> = [
  ['20250214120000_student_intake_profile', 'type', 'programme_type'],
  ['20250308120000_normalize_course_catalog', 'table', 'cities'],
  ['20260512120000_help_requests_and_notifications', 'table', 'notifications'],
  ['20260513120000_help_thread_tables', 'table', 'help_notes'],
  ['20260514120000_help_request_notification_trigger', 'function', 'notify_on_help_request_insert'],
  ['20260514130000_notifications_audience', 'index', 'notifications_audience_inbox_idx'],
  ['20260611130000_tighten_help_rls', 'function', 'is_counsellor'],
  ['20260628120000_counsellor_real_data', 'policy', 'profiles_counsellor_read'],
  ['20260702120000_p0_role_guard_notification_routing', 'trigger', 'trg_guard_profile_role'],
  ['20260702130000_search_filter_options_fn', 'function', 'search_filter_options'],
  ['20260712120000_meeting_notification_local_time', 'function', 'format_meeting_time'],
  ['20260713120000_programs_field_id_idx', 'index', 'idx_programs_field_id'],
  ['20260713130000_fix_auth_role_recursion', 'function', 'auth_role'],
  ['20260713150000_counsellor_decks_saved_searches', 'table', 'counsellor_decks'],
  ['20260713160000_fix_deck_rls_recursion', 'function', 'deck_owned_by_me'],
  ['20260713170000_help_requests_participants_and_reads', 'index', 'help_requests_counsellor_idx'],
  ['20260714090000_deck_notification_href_quests', 'function', 'notify_on_deck_assignment_insert'],
  ['20260714100000_help_request_guard_whitelist', 'trigger', 'trg_guard_help_request_update'],
  ['20260714110000_purge_seed_help_messages', 'index', 'help_requests_created_idx'],
  ['20260715120000_tighten_notifications_insert', 'function', 'notify_on_help_request_accepted'],
  ['20260716120000_guardian_links', 'table', 'guardian_links'],
  ['20260717120000_chat_feedback', 'table', 'chat_feedback'],
  ['20260718120000_chat_conversations', 'table', 'chat_conversations'],
  ['20260719120000_enable_rls_catalogue_tables', 'policy', 'cities_read_all'],
  ['20260723120000_search_facet_indexes', 'index', 'idx_programs_study_level'],
  ['20260724100000_search_polish', 'index', 'idx_programs_admission_test'],
  ['20260801110000_profiles_insert_guard', 'policy', 'profiles_self_insert'],
  ['20260801115000_admin_helper_and_verb_split', 'policy', 'parent_contacts_admin_delete'],
  // 20260801120000_close_counsellor_access has NO marker and cannot get one: its
  // only change is a `create or replace function` body, which leaves no
  // distinguishable catalogue object (MIGRATIONS.md §1 legend, "—"). Probe it by
  // reading the body — `select prosrc from pg_proc where proname =
  // 'can_act_as_counsellor'`; the open form matches `auth.uid() is not null`.
  // is_admin() moved to 20260801115000, which is why this row no longer claims it.
  ['20260801122000_counsellor_assignments', 'table', 'counsellor_assignments'],
  ['20260801130000_reconcile_missing_tables', 'table', 'student_activities'],
  ['20260802100000_indexes_extensions_and_rls_gaps', 'index', 'idx_programs_course_name_trgm'],
  ['20260802110000_notification_bounds', 'trigger', 'trg_bound_notification_payload'],
  ['20260802120000_student_matches_delete_policy', 'index', 'student_matches_profile_program_key'],
  ['20260802130000_erasure_audit_and_retention', 'table', 'audit_log'],
  ['20260802140000_guardian_links_parity', 'policy', 'guardian_links_student_read']
];

const PRESENCE_SQL = `
select case $2
  when 'table'    then to_regclass('public.' || quote_ident($1)) is not null
  when 'index'    then to_regclass('public.' || quote_ident($1)) is not null
  when 'type'     then to_regtype('public.' || quote_ident($1))  is not null
  when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname = $1)
  when 'trigger'  then exists (select 1 from pg_trigger t where t.tgname = $1 and not t.tgisinternal)
  when 'policy'   then exists (select 1 from pg_policies where schemaname = 'public' and policyname = $1)
end as present`;

const main = async () => {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('SUPABASE_DB_URL is not set (source .env.local first).');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const missing: string[] = [];
    let applied = 0;

    for (const [file, kind, obj] of EXPECTED) {
      const { rows } = await client.query(PRESENCE_SQL, [obj, kind]);
      const present = rows[0]?.present === true;
      if (present) applied += 1;
      else missing.push(`${file}  (${kind} ${obj})`);
      console.log(`${present ? '  APPLIED ' : '  MISSING '} ${file}`);
    }

    console.log('');
    console.log(`APPLIED ${applied} / ${EXPECTED.length}    MISSING ${missing.length}`);
    if (missing.length > 0) {
      console.log('');
      console.log('Not present on this database:');
      for (const line of missing) console.log(`  - ${line}`);
    }
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error('✗ probe failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
