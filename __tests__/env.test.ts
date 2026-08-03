/**
 * @jest-environment ./jest.environment-node.js
 *
 * `src/lib/env.ts` guards `getServerEnv()` with `typeof window !== 'undefined'`
 * (the same guard as `lib/supabase/service.ts`), so it must be exercised in a
 * node environment — jsdom defines `window` and every server-side assertion
 * would throw. The local wrapper exists only to sidestep a Node >=22 / jest 29
 * webstorage clash; see jest.environment-node.js.
 */
import {
  EnvValidationError,
  assertEnv,
  clientEnvSchema,
  getClientEnv,
  getServerEnv,
  resetEnvCacheForTests,
  serverEnvSchema
} from '@/lib/env';

/**
 * The exact values `.github/workflows/ci.yml` sets for `npm run build`. If this
 * set ever stops validating, CI's build step breaks — which is precisely the
 * failure this module must not cause.
 */
const CI_BUILD_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'placeholder-publishable-key',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000'
} as const;

const REALISTIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://alpkbobbasxvubogkark.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon.signature',
  NEXT_PUBLIC_SITE_URL: 'https://ascenda-ashy.vercel.app',
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: 'application-documents',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.signature',
  SUPABASE_DB_URL: 'postgresql://postgres:pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
  SUPABASE_PROJECT_ID: 'alpkbobbasxvubogkark',
  GEMINI_API_KEY: 'gemini-test-key',
  ADMIN_API_KEY: 'admin-test-key',
  NODE_ENV: 'production'
} as const;

/** Every variable either schema knows about — cleared before each case. */
const MANAGED_KEYS = [
  ...Object.keys(clientEnvSchema.shape),
  ...Object.keys(serverEnvSchema.shape)
];

const ORIGINAL_ENV = process.env;

const setEnv = (values: Record<string, string | undefined>) => {
  for (const key of MANAGED_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetEnvCacheForTests();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  resetEnvCacheForTests();
});

describe('env — valid configuration', () => {
  it('accepts a realistic production configuration', () => {
    setEnv(REALISTIC_ENV);

    const { client, server } = assertEnv();

    expect(client.NEXT_PUBLIC_SUPABASE_URL).toBe('https://alpkbobbasxvubogkark.supabase.co');
    expect(client.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(REALISTIC_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(server.GEMINI_API_KEY).toBe('gemini-test-key');
    expect(server.NODE_ENV).toBe('production');
  });

  it('applies the storage-bucket default that the call sites already hardcode', () => {
    setEnv({ ...REALISTIC_ENV, NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: undefined });

    expect(getClientEnv().NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET).toBe('application-documents');
  });

  it('defaults NODE_ENV rather than requiring it', () => {
    setEnv({ ...REALISTIC_ENV, NODE_ENV: undefined });

    expect(getServerEnv().NODE_ENV).toBe('development');
  });

  it('treats a blank value as unset, not as the empty string', () => {
    setEnv({ ...REALISTIC_ENV, GEMINI_API_KEY: '   ', NEXT_PUBLIC_DEMO_EMAIL: '' });

    expect(getServerEnv().GEMINI_API_KEY).toBeUndefined();
    expect(getClientEnv().NEXT_PUBLIC_DEMO_EMAIL).toBeUndefined();
  });

  it('memoises — a later mutation of process.env is not picked up mid-process', () => {
    setEnv(REALISTIC_ENV);
    const first = getClientEnv();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://changed.supabase.co';

    expect(getClientEnv()).toBe(first);
    expect(getClientEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://alpkbobbasxvubogkark.supabase.co');
  });
});

describe('env — CI placeholder configuration', () => {
  it('accepts exactly the values .github/workflows/ci.yml sets for the build', () => {
    setEnv(CI_BUILD_ENV);

    expect(() => assertEnv()).not.toThrow();
  });

  it('does not require GEMINI_API_KEY, ADMIN_API_KEY or SUPABASE_SERVICE_ROLE_KEY', () => {
    // CI sets none of these; requiring any of them would break every build.
    setEnv(CI_BUILD_ENV);

    const server = getServerEnv();

    expect(server.GEMINI_API_KEY).toBeUndefined();
    expect(server.ADMIN_API_KEY).toBeUndefined();
    expect(server.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it('does not reject the placeholder anon key for failing to look like a JWT', () => {
    setEnv(CI_BUILD_ENV);

    expect(getClientEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('placeholder-anon-key');
  });
});

describe('env — invalid configuration', () => {
  it('throws EnvValidationError naming EVERY missing variable at once', () => {
    setEnv({});

    let caught: unknown;
    try {
      assertEnv();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const failure = caught as EnvValidationError;

    // Both required variables must appear — reporting one at a time would mean
    // one failed deploy per missing key.
    expect(failure.variables).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])
    );
    expect(failure.variables).toHaveLength(2);

    expect(failure.message).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(failure.message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(failure.message).toContain('2 problems');
  });

  it('reports a malformed URL alongside a separate missing variable', () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' });

    let caught: unknown;
    try {
      assertEnv();
    } catch (error) {
      caught = error;
    }

    const failure = caught as EnvValidationError;
    expect(failure).toBeInstanceOf(EnvValidationError);
    expect(failure.variables).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])
    );
    expect(failure.message).toContain('absolute URL');
  });

  it('repairs an invalid LOG_LEVEL instead of refusing to boot', () => {
    setEnv({ ...REALISTIC_ENV, LOG_LEVEL: 'verbose' });

    // A typo in a non-essential variable must not take the process down. Only
    // the two genuinely required vars are fatal; everything else degrades to its
    // documented default. Note this is not confined to startup — getServerEnv()
    // raises on any issue, so a throw here would fire at every call site.
    expect(() => getServerEnv()).not.toThrow();
    expect(getServerEnv().LOG_LEVEL).toBeUndefined();
  });

  it('warns on stderr about a repaired value so the fallback is not silent', () => {
    setEnv({ ...REALISTIC_ENV, LOG_LEVEL: 'verbose' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    assertEnv();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LOG_LEVEL'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to the default'));
    warn.mockRestore();
  });

  it('points at .env.example and Vercel in the failure message', () => {
    setEnv({});

    expect(() => assertEnv()).toThrow(/\.env\.example/);
  });

  it('getClientEnv fails on missing client vars even when the server env is complete', () => {
    setEnv({ GEMINI_API_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' });

    expect(() => getClientEnv()).toThrow(EnvValidationError);
    expect(() => getServerEnv()).not.toThrow();
  });
});

describe('env — server/client separation', () => {
  it('exposes no server-only key on the client schema', () => {
    const clientKeys = Object.keys(clientEnvSchema.shape);

    expect(clientKeys.every((key) => key.startsWith('NEXT_PUBLIC_'))).toBe(true);
  });

  it('exposes no NEXT_PUBLIC key on the server schema', () => {
    const serverKeys = Object.keys(serverEnvSchema.shape);

    expect(serverKeys.some((key) => key.startsWith('NEXT_PUBLIC_'))).toBe(false);
  });

  it('getServerEnv throws when a browser global is present', () => {
    setEnv(REALISTIC_ENV);
    const globals = globalThis as { window?: unknown };

    globals.window = {};
    try {
      expect(() => getServerEnv()).toThrow(/must never be called in the browser/);
      expect(() => assertEnv()).toThrow(/server-only/);
    } finally {
      delete globals.window;
    }
  });

  it('getClientEnv still works with a browser global present', () => {
    setEnv(REALISTIC_ENV);
    const globals = globalThis as { window?: unknown };

    globals.window = {};
    try {
      expect(getClientEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(REALISTIC_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    } finally {
      delete globals.window;
    }
  });
});
