/**
 * Apply a single SQL file to the Supabase Postgres database over SUPABASE_DB_URL.
 *
 * Deliberately bypasses `supabase db push`: the remote migration-history table is
 * out of sync with supabase/migrations (most were applied via the SQL editor), so
 * `db push` would try to replay already-applied migrations — including the
 * destructive catalogue normalize. This runs exactly one file, nothing else.
 *
 * Usage: SUPABASE_DB_URL=... tsx scripts/apply-sql.ts <path-to.sql>
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

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

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/apply-sql.ts <path-to.sql>');
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL is not set (source .env.local first).');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');

const main = async () => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`✓ Applied ${file}`);
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error('✗ Failed to apply SQL:');
  console.error(err?.message ?? err);
  process.exit(1);
});
