/**
 * The database-target guards, tested with no database and no environment.
 *
 * `scripts/apply-sql.ts:24` set exactly this standard for its `_applied_archive`
 * refusal — "so the refusal is testable with no environment and cannot be reached
 * by way of a connection" — and then no test was ever written. These guards exist
 * for the same class of accident (running against production while believing you
 * are on staging), so they get the test the standard implies.
 */
import {
  confirmProduction,
  DbTargetError,
  describeTarget,
  isTransactionPooler,
  parseTargetArgs,
  PRODUCTION_PROJECT_REF,
  projectRefFromConnectionString,
  resolveTarget,
  TARGET_ENV_VAR,
} from '../../scripts/lib/db-target';

const PROD_URL = `postgresql://postgres:pw@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;
const STAGING_REF = 'stagingrefabcdefghij';
const STAGING_URL = `postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`;
const STAGING_POOLER = `postgresql://postgres.${STAGING_REF}:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`;

describe('parseTargetArgs', () => {
  it('defaults to prod when no flag is given, keeping the documented command working', () => {
    const parsed = parseTargetArgs(['supabase/migrations/foo.sql']);
    expect(parsed.target).toBe('prod');
    expect(parsed.rest).toEqual(['supabase/migrations/foo.sql']);
    expect(parsed.assumeYes).toBe(false);
  });

  it.each([
    [['--target', 'staging', 'file.sql']],
    [['--target=staging', 'file.sql']],
    [['file.sql', '--target', 'staging']],
  ])('accepts %j and leaves positionals alone', (argv) => {
    const parsed = parseTargetArgs(argv);
    expect(parsed.target).toBe('staging');
    expect(parsed.rest).toEqual(['file.sql']);
  });

  it('recognises --yes and -y without swallowing them into positionals', () => {
    expect(parseTargetArgs(['--yes', 'file.sql']).assumeYes).toBe(true);
    expect(parseTargetArgs(['-y', 'file.sql']).rest).toEqual(['file.sql']);
  });

  it.each(['production', 'prd', 'PROD', ''])('rejects the unknown target %j rather than falling back', (value) => {
    expect(() => parseTargetArgs(['--target', value])).toThrow(DbTargetError);
  });

  it('rejects a trailing --target with no value', () => {
    expect(() => parseTargetArgs(['file.sql', '--target'])).toThrow(/needs a value/);
  });
});

describe('projectRefFromConnectionString', () => {
  it('reads the ref out of a direct connection host', () => {
    expect(projectRefFromConnectionString(PROD_URL)).toBe(PRODUCTION_PROJECT_REF);
  });

  it('reads the ref out of a pooler username, where it lives instead of the host', () => {
    expect(projectRefFromConnectionString(STAGING_POOLER)).toBe(STAGING_REF);
  });

  it('returns null for hosts it does not recognise, rather than guessing', () => {
    expect(projectRefFromConnectionString('postgresql://postgres@localhost:5432/postgres')).toBeNull();
    expect(projectRefFromConnectionString('not a url at all')).toBeNull();
  });
});

describe('isTransactionPooler', () => {
  it('flags port 6543, which pg_dump cannot use', () => {
    expect(isTransactionPooler(STAGING_POOLER.replace(':5432', ':6543'))).toBe(true);
  });

  it('passes session mode and direct connections', () => {
    expect(isTransactionPooler(STAGING_POOLER)).toBe(false);
    expect(isTransactionPooler(PROD_URL)).toBe(false);
  });
});

describe('resolveTarget', () => {
  it('reads each target from its own variable', () => {
    const env = { SUPABASE_DB_URL: PROD_URL, SUPABASE_DB_URL_STAGING: STAGING_URL };
    expect(resolveTarget('prod', env).connectionString).toBe(PROD_URL);
    expect(resolveTarget('staging', env).connectionString).toBe(STAGING_URL);
  });

  it('marks the production project, and only it, as production', () => {
    const env = { SUPABASE_DB_URL: PROD_URL, SUPABASE_DB_URL_STAGING: STAGING_URL };
    expect(resolveTarget('prod', env).isProduction).toBe(true);
    expect(resolveTarget('staging', env).isProduction).toBe(false);
  });

  // The whole point of the module. One wrong paste into .env.local and every other
  // safety here reports "staging" while writing to production.
  it('HARD-REFUSES --target staging when the staging variable points at production', () => {
    const env = { SUPABASE_DB_URL: PROD_URL, SUPABASE_DB_URL_STAGING: PROD_URL };
    expect(() => resolveTarget('staging', env)).toThrow(DbTargetError);
    expect(() => resolveTarget('staging', env)).toThrow(/PRODUCTION project/);
  });

  it('refuses the staging pooler URL too, not just the direct one', () => {
    const env = {
      SUPABASE_DB_URL_STAGING: `postgresql://postgres.${PRODUCTION_PROJECT_REF}:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
    };
    expect(() => resolveTarget('staging', env)).toThrow(/PRODUCTION project/);
  });

  it.each([
    ['prod', 'SUPABASE_DB_URL'],
    ['staging', 'SUPABASE_DB_URL_STAGING'],
  ] as const)('names the variable that is missing for %s', (target, varName) => {
    expect(() => resolveTarget(target, {})).toThrow(new RegExp(varName));
    expect(TARGET_ENV_VAR[target]).toBe(varName);
  });

  it('accepts an unrecognised host without claiming it is production', () => {
    const resolved = resolveTarget('staging', { SUPABASE_DB_URL_STAGING: 'postgresql://postgres@localhost/postgres' });
    expect(resolved.projectRef).toBeNull();
    expect(resolved.isProduction).toBe(false);
  });
});

describe('describeTarget', () => {
  it('says PRODUCTION for production regardless of which flag got you there', () => {
    const line = describeTarget(resolveTarget('prod', { SUPABASE_DB_URL: PROD_URL }));
    expect(line).toContain('PRODUCTION');
    expect(line).toContain(PRODUCTION_PROJECT_REF);
  });

  it('names the source variable, so a wrong value is traceable to a place', () => {
    const line = describeTarget(resolveTarget('staging', { SUPABASE_DB_URL_STAGING: STAGING_URL }));
    expect(line).toContain('SUPABASE_DB_URL_STAGING');
    expect(line).not.toContain('PRODUCTION');
  });
});

describe('confirmProduction', () => {
  const staging = () => resolveTarget('staging', { SUPABASE_DB_URL_STAGING: STAGING_URL });
  const prod = () => resolveTarget('prod', { SUPABASE_DB_URL: PROD_URL });

  it('does not prompt for staging — friction belongs where the danger is', async () => {
    await expect(confirmProduction(staging(), { assumeYes: false, action: 'apply x.sql' })).resolves.toBeUndefined();
  });

  // `isTTY` is a plain data property on stdin, not a getter, so jest.spyOn cannot
  // take it — it has to be redefined and put back.
  const withStdinTTY = async (isTTY: boolean, body: () => Promise<void>) => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
    try {
      await body();
    } finally {
      if (original) Object.defineProperty(process.stdin, 'isTTY', original);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  };

  it('refuses production on a non-TTY instead of hanging on a prompt nobody can answer', async () => {
    await withStdinTTY(false, async () => {
      await expect(confirmProduction(prod(), { assumeYes: false, action: 'apply x.sql' })).rejects.toThrow(
        /non-interactive/,
      );
    });
  });

  it('lets --yes through on production, loudly', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(confirmProduction(prod(), { assumeYes: true, action: 'apply x.sql' })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('PRODUCTION'));
    } finally {
      warn.mockRestore();
    }
  });
});
