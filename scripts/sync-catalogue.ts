/**
 * Copy the programme catalogue from production into staging.
 *
 * WHY THIS EXISTS
 * ---------------
 * Staging's schema is built from files (supabase/schema.sql + the migrations), but
 * its DATA cannot be: `supabase/imports/universities.csv` and
 * `program_requirements.csv` are 3-line, 133-byte stubs, not the source of the
 * 119k-programme catalogue, and `20250308120000_normalize_course_catalog.sql` —
 * the migration that shaped it — lives in `_applied_archive/` because it is
 * destructive on replay. There is no path from this repository to a populated
 * catalogue. Copying from production is the only option available, not a
 * preference between several.
 *
 * WHAT IT DOES NOT COPY, EVER
 * ---------------------------
 * Only the six non-personal tables below. No `profiles`, no `auth.users`, no
 * `student_*`, no `help_*`, no `applications`, no `notifications`. Those hold real
 * students' PII, academic records and counsellor correspondence, and staging is by
 * design an environment with weaker access control. `student_matches` and
 * `simulation_results` are excluded too, despite being derived rather than entered:
 * they are inferences ABOUT real people, and they regenerate from the scoring code.
 *
 * DIRECTION IS FIXED. Production is always the source; staging is always the
 * destination. There is no flag to reverse it, because there is no case for
 * reversing it — staging is never authoritative.
 *
 *   npm run db:sync-catalogue           # confirm before truncating staging
 *   npm run db:sync-catalogue -- --yes  # don't
 *
 * Run it after any catalogue import against production. It is deliberately NOT
 * scheduled: a timer would mean an unattended pg_dump of 119k rows out of
 * production for data that may not have moved in a month.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from 'pg';

import {
  DbTargetError,
  isTransactionPooler,
  PRODUCTION_PROJECT_REF,
  resolveTarget,
} from './lib/db-target';

/**
 * Restored in this order, which is FK order: a `programs` row references a
 * `universities` row, and `program_requirements` / `deadlines` reference
 * `programs`. pg_restore replays the dump in dump order inside one transaction, so
 * getting this list right is what makes the restore succeed without deferring
 * constraints or handing out superuser (`--disable-triggers` needs it; we don't
 * have it on Supabase, and shouldn't want it).
 */
const CATALOGUE_TABLES = [
  'universities',
  'cities',
  'programs',
  'program_requirements',
  'deadlines',
  'sources',
] as const;

// Load .env.local, same shape as apply-sql.ts / db-probe.ts (tsx does not).
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

/**
 * Split a connection URI into libpq environment variables.
 *
 * Passing the URI as `-d <uri>` would put the database password in argv, where
 * every other process on the machine can read it out of `ps`. The PG* variables
 * are the documented way to avoid that.
 */
const pgEnvFor = (connectionString: string): NodeJS.ProcessEnv => {
  const url = new URL(connectionString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, '') || 'postgres',
    // Supabase terminates TLS; without this libpq will happily fall back to
    // plaintext and ship the catalogue — and the password — over the open internet.
    PGSSLMODE: 'require',
  };
};

const run = (command: string, args: string[], env: NodeJS.ProcessEnv, label: string): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (err) =>
      reject(
        new DbTargetError(
          `✗ Could not run \`${command}\`: ${err.message}\n` +
            '  Install the Postgres client tools (macOS: `brew install libpq` then add it to PATH).',
        ),
      ),
    );
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new DbTargetError(`✗ ${label} failed (${command} exited ${code}).`));
    });
  });

const capture = (command: string, args: string[]): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.on('error', reject);
    child.on('close', () => resolvePromise(out.trim()));
  });

const confirm = async (question: string): Promise<boolean> => {
  if (!process.stdin.isTTY) {
    throw new DbTargetError(
      '✗ Refusing to truncate staging from a non-interactive shell without --yes.',
    );
  }
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
};

const main = async () => {
  const assumeYes = process.argv.includes('--yes') || process.argv.includes('-y');

  // ── Source: production. Destination: staging. resolveTarget already hard-refuses
  //    a staging variable that resolves to the production ref, which is the
  //    single-wrong-paste failure this whole script is exposed to.
  const source = resolveTarget('prod', process.env);
  const destination = resolveTarget('staging', process.env);

  // Belt and braces on top of that refusal. If these two ever resolve to the same
  // database, the truncate below is a production outage rather than a staging reset.
  if (destination.projectRef === PRODUCTION_PROJECT_REF || destination.projectRef === source.projectRef) {
    throw new DbTargetError(
      '✗ Source and destination are the same database. Refusing to truncate.\n' +
        `  SUPABASE_DB_URL → ${source.projectRef}\n` +
        `  SUPABASE_DB_URL_STAGING → ${destination.projectRef}`,
    );
  }

  // pg_dump needs a session-scoped snapshot and prepared statements that Supabase's
  // transaction pooler (6543) will not hold. This fails deep inside the dump with a
  // confusing error, so catch it here where the fix is one digit.
  for (const [label, resolved] of [
    ['SUPABASE_DB_URL', source],
    ['SUPABASE_DB_URL_STAGING', destination],
  ] as const) {
    if (isTransactionPooler(resolved.connectionString)) {
      throw new DbTargetError(
        `✗ ${label} uses the pooler in TRANSACTION mode (port 6543), which pg_dump cannot use.\n` +
          '  Use the SESSION-mode pooler on port 5432 instead.',
      );
    }
  }

  // pg_dump refuses to dump from a server newer than itself, and Supabase upgrades
  // its Postgres without asking. Surfacing both versions turns a cryptic
  // "server version mismatch" into an instruction.
  const clientVersion = await capture('pg_dump', ['--version']);
  console.log(`  ${clientVersion || 'pg_dump (version unknown)'}`);

  console.log('');
  console.log(`  source      ${source.projectRef ?? 'unrecognised host'}  (read-only)`);
  console.log(`  destination ${destination.projectRef ?? 'unrecognised host'}`);
  console.log(`  tables      ${CATALOGUE_TABLES.join(', ')}`);
  console.log('');

  // TRUNCATE ... CASCADE is what makes this re-runnable — without it the second run
  // dies on primary-key conflicts. But CASCADE reaches further than the six tables:
  // anything referencing them (student_matches, shortlisted_programs,
  // counsellor_deck_programs) is emptied too. On staging that is fine and the
  // seeders regenerate it. Saying so is not optional.
  console.log('  This TRUNCATEs those tables on staging, CASCADE — so rows in');
  console.log('  student_matches / shortlisted_programs / counsellor_deck_programs');
  console.log('  that reference them are emptied too. Re-run the seeders afterwards.');
  console.log('');

  if (!assumeYes && !(await confirm('  Type "yes" to continue: '))) {
    console.log('Aborted.');
    process.exit(1);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'ascenda-catalogue-'));
  const dumpFile = join(workDir, 'catalogue.dump');

  try {
    console.log('\n→ Dumping catalogue from production…');
    await run(
      'pg_dump',
      [
        '--format=custom',
        '--data-only',
        // Owners and grants are the staging project's own; carrying production's
        // role names across would fail the restore for no benefit.
        '--no-owner',
        '--no-privileges',
        ...CATALOGUE_TABLES.flatMap((table) => ['--table', `public.${table}`]),
        `--file=${dumpFile}`,
      ],
      pgEnvFor(source.connectionString),
      'catalogue dump',
    );
    console.log(`  dump written (${(statSync(dumpFile).size / 1024 / 1024).toFixed(1)} MB)`);

    // Truncate explicitly, over a normal connection.
    //
    // NOT via `pg_restore --clean`: that drops and recreates OBJECTS, and a
    // `--data-only` archive contains no object definitions for it to act on. It
    // would silently do nothing and the restore would then fail on primary-key
    // conflicts the second time this script is ever run.
    //
    // One statement, so the six tables' FKs to each other are irrelevant, and
    // CASCADE for the references from outside the set.
    console.log('\n→ Truncating catalogue tables on staging…');
    const client = new Client({
      connectionString: destination.connectionString,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(
        `truncate table ${CATALOGUE_TABLES.map((t) => `public.${t}`).join(', ')} restart identity cascade`,
      );
    } finally {
      await client.end();
    }

    console.log('\n→ Restoring into staging…');
    await run(
      'pg_restore',
      [
        // One transaction, so a restore that dies halfway rolls back rather than
        // leaving a partial catalogue that LOOKS populated. Note the truncate above
        // is a separate transaction and is NOT rolled back with it — a failed
        // restore therefore leaves staging's catalogue EMPTY, which is the right
        // way round: obviously broken, and fixed by running this again.
        '--single-transaction',
        '--no-owner',
        '--no-privileges',
        '--dbname=' + (new URL(destination.connectionString).pathname.replace(/^\//, '') || 'postgres'),
        dumpFile,
      ],
      pgEnvFor(destination.connectionString),
      'catalogue restore',
    );

    console.log('\n✓ Catalogue synced.');
    console.log('  Verify with the row counts in docs/staging.md, then re-run the seeders.');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

main().catch((err) => {
  if (err instanceof DbTargetError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error('✗ Catalogue sync failed:');
  console.error(err?.message ?? err);
  process.exit(1);
});
