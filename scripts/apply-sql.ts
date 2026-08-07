/**
 * Apply a single SQL file to a Supabase Postgres database.
 *
 * Deliberately bypasses `supabase db push`: the remote migration-history table is
 * out of sync with supabase/migrations (most were applied via the SQL editor), so
 * `db push` would try to replay already-applied migrations — including the
 * destructive catalogue normalize. This runs exactly one file, nothing else.
 *
 * Usage: tsx scripts/apply-sql.ts [--target prod|staging] [--yes] <path-to.sql>
 *
 * `--target` defaults to `prod`, which then PROMPTS. See scripts/lib/db-target.ts
 * for why the default is the risky one and the safety lives in the prompt.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Client } from 'pg';

import {
  confirmProduction,
  describeTarget,
  DbTargetError,
  parseTargetArgs,
  resolveTarget,
} from './lib/db-target';

// ── Hard refusal: supabase/migrations/_applied_archive/ ──────────────────────
// Those files are APPLIED and DESTRUCTIVE ON REPLAY — 20250308120000 renames the
// live 119k-row catalogue to archive_raw_* and promotes the empty *_v2 tables in
// its place. Moving them out of supabase/migrations/ took them out of every
// glob, but this script takes a FILENAME, so the move did nothing at all to stop
// `npm run db:apply supabase/migrations/_applied_archive/<file>` from running one
// against production. That is the exact command the archive README warns about.
// See docs/audit/verify/C-database.md finding C5.
//
// This runs BEFORE the SUPABASE_DB_URL check on purpose, so the refusal is
// testable with no environment and cannot be reached by way of a connection.
const refuseIfArchived = (candidate: string) => {
  const normalised = resolve(candidate).split(sep);
  if (normalised.includes('_applied_archive')) {
    console.error(
      `✗ Refusing to apply ${candidate}\n` +
        '  It is in supabase/migrations/_applied_archive/ — already applied to production\n' +
        '  and DESTRUCTIVE on replay (it archives the live catalogue and promotes empty\n' +
        '  tables in its place). supabase/schema.sql already reflects its result; a\n' +
        '  database that needs those objects should be built from schema.sql.\n' +
        '  See supabase/migrations/_applied_archive/README.md.',
    );
    process.exit(1);
  }
};

// Load .env.local (tsx does not do this automatically).
(() => {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
})();

const main = async () => {
  const { target, assumeYes, rest } = parseTargetArgs(process.argv.slice(2));

  const file = rest[0];
  if (!file) {
    console.error('Usage: tsx scripts/apply-sql.ts [--target prod|staging] [--yes] <path-to.sql>');
    process.exit(1);
  }

  refuseIfArchived(file);

  const resolved = resolveTarget(target, process.env);
  console.log(describeTarget(resolved));
  await confirmProduction(resolved, { assumeYes, action: `apply ${file}` });

  const sql = readFileSync(file, 'utf8');
  const client = new Client({ connectionString: resolved.connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`✓ Applied ${file} to ${resolved.projectRef ?? 'the configured database'}`);
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  // A refusal is a decision, not a crash — print it without a stack trace.
  if (err instanceof DbTargetError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error('✗ Failed to apply SQL:');
  console.error(err?.message ?? err);
  process.exit(1);
});
