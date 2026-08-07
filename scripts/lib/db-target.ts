/**
 * Which database am I about to talk to?
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/apply-sql.ts` and `scripts/db-probe.ts` both auto-load `.env.local`
 * and read `SUPABASE_DB_URL` from it. On every developer machine that variable
 * is PRODUCTION. Bootstrapping the staging project means ~35 sequential
 * `npm run db:apply` runs, and one forgotten inline override in that loop
 * replays migrations against the live database — including the two that
 * `scripts/ci-db-check.sh` ledgers as NOT REPLAYABLE.
 *
 * The existing `_applied_archive` refusal in apply-sql.ts:26 was added for the
 * identical reason, and its comment says it plainly: moving the file out of the
 * glob "did nothing at all to stop" the command, because the command takes a
 * filename. Same shape here. Choosing a target by editing a dotenv file is not a
 * safety mechanism — it is the absence of one.
 *
 * THE RULE, and note which way round it is:
 *
 *   --target staging   no prompt. This is the 35-command bootstrap loop; friction
 *                      here would be friction in the safe direction, which is how
 *                      people learn to type past prompts.
 *   --target prod      confirm, interactively, by typing the project ref. Also the
 *                      DEFAULT when no flag is given, so the old muscle-memory
 *                      command still goes where it always went — but says so first.
 *
 * So the change is not "add a flag". It is: production stops being the silent
 * default and becomes the loud one.
 *
 * PURE vs I/O. Everything above `confirmProduction` is a pure function of its
 * arguments — no env, no network, no stdin. That is what lets
 * `__tests__/db/db-target.test.ts` cover the refusals without a database, which
 * is the standard apply-sql.ts:24 set for itself and never met.
 */

/**
 * The production Supabase project. Hard-coded on purpose: a guard that reads the
 * ref it is guarding against from the environment guards nothing, because the
 * environment is the thing that is wrong in the failure this prevents.
 * (CLAUDE.md > Supabase > Project ref.)
 */
export const PRODUCTION_PROJECT_REF = 'alpkbobbasxvubogkark';

export type DbTarget = 'prod' | 'staging';

/** Where each target's connection string lives. */
export const TARGET_ENV_VAR: Readonly<Record<DbTarget, string>> = {
  prod: 'SUPABASE_DB_URL',
  staging: 'SUPABASE_DB_URL_STAGING',
};

const TARGETS: readonly DbTarget[] = ['prod', 'staging'];

const isDbTarget = (value: string): value is DbTarget => (TARGETS as readonly string[]).includes(value);

export class DbTargetError extends Error {}

export type ParsedTargetArgs = {
  target: DbTarget;
  /** `--yes` — skip the production prompt. For non-interactive callers only. */
  assumeYes: boolean;
  /** argv with the recognised flags removed, so callers keep their positionals. */
  rest: string[];
};

/**
 * Pull `--target <t>` / `--target=<t>` and `--yes` out of argv.
 *
 * Defaults to `prod` when absent. That is deliberately the RISKY default, because
 * the alternative — requiring the flag — breaks `npm run db:apply <file>` as
 * documented in supabase/MIGRATIONS.md and as typed from memory. Safety comes from
 * the confirmation, not from the default.
 */
export const parseTargetArgs = (argv: readonly string[]): ParsedTargetArgs => {
  const rest: string[] = [];
  let target: DbTarget = 'prod';
  let assumeYes = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--yes' || arg === '-y') {
      assumeYes = true;
      continue;
    }

    let value: string | undefined;
    if (arg === '--target') {
      value = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--target=')) {
      value = arg.slice('--target='.length);
    } else {
      rest.push(arg);
      continue;
    }

    if (value === undefined || value === '') {
      throw new DbTargetError(`--target needs a value (${TARGETS.join(' | ')}).`);
    }
    if (!isDbTarget(value)) {
      throw new DbTargetError(`Unknown --target "${value}". Expected one of: ${TARGETS.join(', ')}.`);
    }
    target = value;
  }

  return { target, assumeYes, rest };
};

/**
 * Extract the Supabase project ref from a Postgres connection string.
 *
 * Both shapes carry it, in different places:
 *   direct   postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres
 *   pooler   postgresql://postgres.<ref>:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
 *
 * Returns null for anything else (a local cluster, say) — an unrecognised host is
 * not an error, it just means the ref-based guards below cannot speak to it.
 */
export const projectRefFromConnectionString = (connectionString: string): string | null => {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }

  const direct = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/i.exec(url.hostname);
  if (direct) return direct[1].toLowerCase();

  if (/(^|\.)pooler\.supabase\.com$/i.test(url.hostname)) {
    const user = decodeURIComponent(url.username);
    const dot = user.indexOf('.');
    if (dot > 0) return user.slice(dot + 1).toLowerCase();
  }

  return null;
};

/**
 * Supabase's pooler in TRANSACTION mode (6543) cannot serve `pg_dump`: the dump
 * needs a session-scoped snapshot and prepared statements the transaction pooler
 * will not hold. Session mode is 5432. Callers that dump check this; callers that
 * run one-shot SQL do not care.
 */
export const isTransactionPooler = (connectionString: string): boolean => {
  try {
    const url = new URL(connectionString);
    return /(^|\.)pooler\.supabase\.com$/i.test(url.hostname) && url.port === '6543';
  } catch {
    return false;
  }
};

export type ResolvedTarget = {
  target: DbTarget;
  connectionString: string;
  /** null when the host is not a recognised Supabase one. */
  projectRef: string | null;
  isProduction: boolean;
};

/**
 * Turn a target into a connection string, refusing the combinations that mean
 * somebody has mis-wired their environment.
 */
export const resolveTarget = (
  target: DbTarget,
  // Deliberately NOT `NodeJS.ProcessEnv`: this only ever does string lookups, and
  // Next's types make NODE_ENV required on that interface, which would force every
  // caller — tests included — to carry a field the function never reads.
  env: Readonly<Record<string, string | undefined>>,
): ResolvedTarget => {
  const varName = TARGET_ENV_VAR[target];
  const connectionString = env[varName];

  if (!connectionString) {
    throw new DbTargetError(
      target === 'staging'
        ? `${varName} is not set. Add the staging project's session-mode pooler URL to .env.local.\n` +
          '  (Session mode is port 5432. Port 6543 is transaction mode and breaks pg_dump.)'
        : `${varName} is not set (source .env.local first).`,
    );
  }

  const projectRef = projectRefFromConnectionString(connectionString);

  // The guard that catches the copy-paste. Setting SUPABASE_DB_URL_STAGING to the
  // production URL is a single wrong paste, and without this check every downstream
  // safety here evaporates silently: you would be told you are on staging, see no
  // prompt, and write to production. This is a hard refusal, not a prompt.
  if (target === 'staging' && projectRef === PRODUCTION_PROJECT_REF) {
    throw new DbTargetError(
      `✗ ${varName} points at the PRODUCTION project (${PRODUCTION_PROJECT_REF}).\n` +
        '  Refusing to run: --target staging must never resolve to production.\n' +
        '  Fix the value in .env.local — it should be the staging project ref.',
    );
  }

  return {
    target,
    connectionString,
    projectRef,
    isProduction: projectRef === PRODUCTION_PROJECT_REF,
  };
};

/** One line, always printed, so the target is never a thing you inferred. */
export const describeTarget = (resolved: ResolvedTarget): string => {
  const ref = resolved.projectRef ?? 'unrecognised host';
  const label = resolved.isProduction ? 'PRODUCTION' : resolved.target.toUpperCase();
  return `→ target: ${label}  (project ${ref}, from ${TARGET_ENV_VAR[resolved.target]})`;
};

/**
 * Block until a human confirms a production write, by typing the project ref.
 *
 * Typing the ref rather than "y" is the point: the failure this prevents is
 * believing you are on staging, and only reading the ref off the screen breaks
 * that belief. A y/N prompt is answered by reflex before the question is read.
 *
 * No-ops for non-production targets. Refuses outright on a non-TTY unless `--yes`
 * was passed, because a prompt nobody can answer would otherwise hang a script
 * forever — or, worse, read the next line of a heredoc as the answer.
 */
export const confirmProduction = async (
  resolved: ResolvedTarget,
  options: { assumeYes: boolean; action: string },
): Promise<void> => {
  if (!resolved.isProduction) return;
  if (options.assumeYes) {
    console.warn(`⚠ --yes given: proceeding against PRODUCTION without confirmation (${options.action}).`);
    return;
  }

  if (!process.stdin.isTTY) {
    throw new DbTargetError(
      '✗ Refusing to touch PRODUCTION from a non-interactive shell.\n' +
        '  Re-run in a terminal, or pass --yes if this is genuinely automated.',
    );
  }

  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.warn('');
    console.warn(`⚠ This will ${options.action} against PRODUCTION (${PRODUCTION_PROJECT_REF}).`);
    const answer = await rl.question(`  Type the project ref to continue, or anything else to abort: `);
    if (answer.trim() !== PRODUCTION_PROJECT_REF) {
      throw new DbTargetError('Aborted — project ref not confirmed.');
    }
    console.warn('');
  } finally {
    rl.close();
  }
};
