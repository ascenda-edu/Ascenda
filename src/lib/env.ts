/**
 * Typed, fail-fast environment validation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Roughly ten call sites reach for `process.env.X!`. The non-null assertion is a
 * lie the compiler cannot check: when the variable is actually unset, the value
 * flows onward as `undefined` and the failure surfaces as a 500 on the *first
 * request that needs it*. `src/middleware.ts` runs on nearly every authenticated
 * route, so a typo'd `NEXT_PUBLIC_SUPABASE_URL` in Vercel is a hard 500 across
 * the whole product, discovered by a user rather than by CI — the build only
 * needs the placeholder values to *exist*.
 *
 * This module turns that into a single, boot-time failure that names every
 * missing or invalid variable at once. `src/instrumentation.ts` calls
 * `assertEnv()` during `register()`, so misconfiguration is loud and immediate.
 *
 * SERVER / CLIENT SPLIT
 * ---------------------
 * Two schemas, deliberately separate:
 *
 *   - `clientEnvSchema` — only `NEXT_PUBLIC_*`. Next inlines these at build
 *     time, so they are already public by construction and safe to read from a
 *     browser bundle.
 *   - `serverEnvSchema` — everything else. Reachable through `getServerEnv()`,
 *     which throws if it is ever called in a browser.
 *
 * The `server-only` package is NOT a dependency of this repo (verified), and
 * this module is not permitted to add one, so the guard is the runtime
 * `typeof window` check used by `src/lib/supabase/service.ts:11` — the same
 * pattern, for the same reason. If `server-only` is ever installed, replace the
 * guard in `getServerEnv()` with a top-level `import 'server-only'` in a
 * dedicated `env.server.ts` and the enforcement becomes a build error instead.
 *
 * The guard is checked lazily rather than at module load on purpose: a top-level
 * throw would make `getClientEnv()` unusable from client components, which is
 * the exact split this module is meant to provide.
 *
 * Note that a stray client import of this file cannot leak a secret even without
 * the guard: Next only inlines `NEXT_PUBLIC_*` into client bundles, so every
 * server key below evaluates to `undefined` in the browser. The guard exists so
 * that mistake fails loudly instead of silently producing a broken value.
 *
 * READING VALUES — DO NOT MAKE THIS DYNAMIC
 * -----------------------------------------
 * Every variable is read as a literal `process.env.NAME` expression. Next's
 * bundler performs a *textual* substitution for `NEXT_PUBLIC_*`; a computed
 * `process.env[name]` lookup is never substituted and silently yields
 * `undefined` in the browser. Keep the explicit literal map below literal.
 *
 * MIGRATION PATH (later phase — do not do this here)
 * -------------------------------------------------
 * Call sites move over one file at a time, no behaviour change:
 *
 *   // before — src/lib/supabase/server.ts
 *   process.env.NEXT_PUBLIC_SUPABASE_URL!
 *   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 *
 *   // after
 *   import { getClientEnv } from '@/lib/env';
 *   const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getClientEnv();
 *
 *   // before — src/app/api/chat/route.ts
 *   if (!process.env.GEMINI_API_KEY) { ... }
 *
 *   // after
 *   import { getServerEnv } from '@/lib/env';
 *   if (!getServerEnv().GEMINI_API_KEY) { ... }
 *
 * `src/middleware.ts` runs in the edge runtime and should use `getClientEnv()`
 * (both variables it needs are `NEXT_PUBLIC_*`). Do not import `getServerEnv()`
 * from middleware — the edge runtime inlines `process.env` statically and the
 * optional server keys would all read as `undefined` there anyway.
 *
 * REQUIRED vs OPTIONAL
 * --------------------
 * Exactly two variables are required: `NEXT_PUBLIC_SUPABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`. That is not a judgement about importance —
 * it is the hard constraint that `npm run build` must keep passing in CI, which
 * supplies only four placeholder `NEXT_PUBLIC_*` values
 * (`.github/workflows/ci.yml`). Anything marked required here that CI does not
 * set would break every build.
 *
 * Variables that are load-bearing in production but cannot be required at build
 * time are listed in `PRODUCTION_RECOMMENDED` and produce a startup *warning*
 * from `src/instrumentation.ts` when unset in production. Promote them to
 * required only alongside a matching change to the CI build env.
 */
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `.env` files habitually contain bare `KEY=` lines (see `.env.example`), and
 * Vercel stores a cleared variable as an empty string. An empty value is "not
 * configured", never "configured as the empty string" — collapse it so required
 * checks fire and `.optional()` defaults apply.
 *
 * This runs as a plain pre-pass over the raw record rather than as a
 * `z.preprocess()` wrapper on each field, and that is load-bearing: in zod 3 a
 * `ZodEffects` failure ABORTS the enclosing object parse, so a schema built from
 * `z.preprocess(...)` fields reports only the FIRST bad variable. Requirement:
 * name them all at once. Verified against zod@3.22.4 — with `preprocess`, an
 * empty env yields 1 issue; without it, 2.
 */
const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
};

/** Required non-empty string. */
const required = (hint: string) => z.string({ required_error: hint, invalid_type_error: hint }).min(1, hint);

/** Required absolute URL. */
const requiredUrl = (hint: string) => z.string({ required_error: hint, invalid_type_error: hint }).url(hint);

/** Optional non-empty string; blank and unset are both `undefined`. */
const optional = () => z.string().min(1).optional();

/** Optional non-empty string with a fallback the app already hardcodes. */
const optionalWithDefault = (fallback: string) => z.string().min(1).optional().default(fallback);

/* -------------------------------------------------------------------------- */
/* client schema — NEXT_PUBLIC_* only, safe in the browser                     */
/* -------------------------------------------------------------------------- */

export const clientEnvSchema = z.object({
  /**
   * REQUIRED. 17 reads across src+scripts. Backs every Supabase client
   * (`lib/supabase/server.ts`, `client.ts`, `middleware.ts:27`,
   * `auth/callback/route.ts`). Unset ⇒ `createServerClient(undefined!, …)`
   * throws inside middleware on every request.
   * CI placeholder `https://placeholder.supabase.co` satisfies `.url()`.
   */
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl(
    'NEXT_PUBLIC_SUPABASE_URL must be an absolute URL (e.g. https://<project-ref>.supabase.co)'
  ),

  /**
   * REQUIRED. 7 reads. Paired with the URL above in every client factory.
   * Deliberately only `min(1)` and NOT shape-checked as a JWT — CI builds with
   * the literal `placeholder-anon-key`, and a JWT regex here would break
   * `npm run build`.
   */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required('NEXT_PUBLIC_SUPABASE_ANON_KEY is required (Supabase → Settings → API → anon key)'),

  /**
   * OPTIONAL. Read by nothing (verified: zero matches for `PUBLISHABLE` across
   * src/, scripts/ and config). Set in `ci.yml:73` and listed in CLAUDE.md's
   * env section, so it is kept here as documentation of a known phantom rather
   * than dropped — declaring it optional costs nothing and removing it from CI
   * is a separate decision in a file this module does not own.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(),

  /**
   * OPTIONAL. Also read by nothing today (verified: zero `process.env` reads).
   * Present in `.env.example` and set in CI. Retained for the same reason as
   * the publishable key — it is the natural home for absolute-URL construction
   * and removing it would only hide the drift.
   */
  NEXT_PUBLIC_SITE_URL: optional(),

  /**
   * OPTIONAL, defaulted. `applications/documents/page.tsx:79` and
   * `document-uploader.tsx:33` both already fall back to
   * `'application-documents'`; the default here mirrors them exactly so the
   * schema cannot disagree with the call sites.
   */
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: optionalWithDefault('application-documents'),

  /**
   * OPTIONAL. `lib/demo/demo-profile.ts:6` falls back to a hardcoded address.
   * Demo-only discriminator; nothing breaks when unset.
   */
  NEXT_PUBLIC_DEMO_EMAIL: optional(),

  /**
   * OPTIONAL. `lib/analytics.ts:28` — `trackEvent` POSTs here only when set,
   * and is a no-op otherwise. Undocumented in `.env.example` until now.
   */
  NEXT_PUBLIC_ANALYTICS_ENDPOINT: optional(),

  /** OPTIONAL. `lib/catalog/visibility.ts:15` — comma-separated id allow/deny list. */
  NEXT_PUBLIC_FLAGGED_PROGRAM_IDS: optional(),

  /** OPTIONAL. `lib/catalog/visibility.ts:16` — comma-separated id list. */
  NEXT_PUBLIC_DEMO_PROGRAM_IDS: optional()
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/* -------------------------------------------------------------------------- */
/* server schema — never reaches the browser                                   */
/* -------------------------------------------------------------------------- */

export const serverEnvSchema = z.object({
  /**
   * OPTIONAL. Standard Node variable; Next sets it. Defaulted rather than
   * required so plain `tsx` scripts and ad-hoc node processes validate cleanly.
   */
  // `.catch` for the same reason as LOG_LEVEL below: a bad value degrades to the
  // default rather than taking the process down.
  NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development').catch('development'),

  /**
   * OPTIONAL. `lib/supabase/service.ts:16` reads it with an explicit
   * `|| NEXT_PUBLIC_SUPABASE_URL` fallback, and 11 `scripts/` reads do the
   * same. Requiring it would break both the CI build and every developer who
   * only sets the public URL.
   */
  SUPABASE_URL: optional(),

  /**
   * OPTIONAL — and it must stay optional. It is the highest-value secret in the
   * project (BYPASSRLS), but it has zero importers under `src/`: only
   * `scripts/` and `supabase/functions/` use it. CI does not set it, so
   * requiring it here would fail every build. The consumers already throw a
   * clear error when it is missing (`service.ts:19`).
   */
  SUPABASE_SERVICE_ROLE_KEY: optional(),

  /** OPTIONAL. `scripts/apply-sql.ts` only — the `npm run db:apply` path. */
  SUPABASE_DB_URL: optional(),

  /** OPTIONAL. Consumed by the `supabase:types` npm script, not by app code. */
  SUPABASE_PROJECT_ID: optional(),

  /**
   * OPTIONAL by necessity, load-bearing in production. Five reads
   * (`lib/chat/gemini.ts:21`, `api/chat/route.ts:115`,
   * `api/essay-assist/route.ts:6,159`, `api/chat/actions/execute/route.ts:203`).
   * Every one degrades gracefully — chat and essay-assist return 503 with an
   * explicit "AI service not configured" message — so the app boots without it.
   * CI does not set it, so it cannot be required. Listed in
   * `PRODUCTION_RECOMMENDED` instead, which warns loudly at boot in production.
   */
  GEMINI_API_KEY: optional(),

  /**
   * OPTIONAL. `api/admin/catalog-health/route.ts:23`. The route is *safe* when
   * unset — the bearer path simply never matches and an authenticated admin is
   * required — so this is genuinely optional, not merely un-requireable.
   */
  ADMIN_API_KEY: optional(),

  /** OPTIONAL. `lib/catalog/visibility.ts:17` — server-side twin of the NEXT_PUBLIC list. */
  DEMO_PROGRAM_IDS: optional(),

  /** OPTIONAL. `lib/matching/service.ts:721` — verbose matching diagnostics when `'1'`. */
  MATCH_DEBUG: optional(),

  /** OPTIONAL. `scripts/seed-demo-user.ts` — seeding only; the script fails fast itself. */
  DEMO_USER_ID: optional(),

  /**
   * OPTIONAL. `scripts/seed-demo-user.ts:61`. Deliberately has NO default: the
   * script must fail loudly rather than fall back to a committed credential.
   */
  DEMO_USER_PASSWORD: optional(),

  /** OPTIONAL. `scripts/seed-students.ts:46`. Same no-default rule as above. */
  SEED_STUDENT_PASSWORD: optional(),

  /**
   * OPTIONAL ×3. `lib/calendar-feed.ts` declares these as `envKey` strings and
   * `api/calendar-feed/route.ts:182` reads them dynamically; each feed resolves
   * to `null` when its variable is unset, so an absent feed is a supported
   * state, not an error.
   */
  GOOGLE_CALENDAR_FEED_URL: optional(),
  OUTLOOK_CALENDAR_FEED_URL: optional(),
  CUSTOM_ICS_FEED_URL: optional(),

  /**
   * OPTIONAL. New in this change — read by `lib/observability/logger.ts` to set
   * the minimum emitted level. Defaults to `debug` outside production and
   * `info` in production (applied in the logger, not here, so the logger stays
   * importable from the browser without pulling in this schema).
   */
  /*
   * `.catch(undefined)` — an unrecognised value falls back to the logger's own
   * default instead of failing the parse.
   *
   * Every other field here is either required (and fatal by design) or a plain
   * optional string that cannot fail to parse. This enum and NODE_ENV were the
   * only two fields where a TYPO in a non-essential variable would throw, and
   * because getServerEnv() raises on any issue, that throw would not be confined
   * to startup — it would fire at every call site. A misspelled log level is not
   * a reason to refuse traffic.
   */
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional().catch(undefined)
});

/**
 * Optional variables whose value we silently repair, paired with how to detect
 * that we did. `assertEnv` warns for each one so the repair is visible in the
 * boot log rather than being a silent mystery when log output looks wrong.
 */
const REPAIRABLE: ReadonlyArray<{ name: string; valid: readonly string[] }> = [
  { name: 'NODE_ENV', valid: ['development', 'test', 'production'] },
  { name: 'LOG_LEVEL', valid: ['debug', 'info', 'warn', 'error'] }
];

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/* -------------------------------------------------------------------------- */
/* raw readers — literal property access, see the header note                  */
/* -------------------------------------------------------------------------- */

const readClientRaw = (): Record<string, unknown> => sanitize({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  NEXT_PUBLIC_DEMO_EMAIL: process.env.NEXT_PUBLIC_DEMO_EMAIL,
  NEXT_PUBLIC_ANALYTICS_ENDPOINT: process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT,
  NEXT_PUBLIC_FLAGGED_PROGRAM_IDS: process.env.NEXT_PUBLIC_FLAGGED_PROGRAM_IDS,
  NEXT_PUBLIC_DEMO_PROGRAM_IDS: process.env.NEXT_PUBLIC_DEMO_PROGRAM_IDS
});

const readServerRaw = (): Record<string, unknown> => sanitize({
  NODE_ENV: process.env.NODE_ENV,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
  SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  DEMO_PROGRAM_IDS: process.env.DEMO_PROGRAM_IDS,
  MATCH_DEBUG: process.env.MATCH_DEBUG,
  DEMO_USER_ID: process.env.DEMO_USER_ID,
  DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD,
  SEED_STUDENT_PASSWORD: process.env.SEED_STUDENT_PASSWORD,
  GOOGLE_CALENDAR_FEED_URL: process.env.GOOGLE_CALENDAR_FEED_URL,
  OUTLOOK_CALENDAR_FEED_URL: process.env.OUTLOOK_CALENDAR_FEED_URL,
  CUSTOM_ICS_FEED_URL: process.env.CUSTOM_ICS_FEED_URL,
  LOG_LEVEL: process.env.LOG_LEVEL
});


/* -------------------------------------------------------------------------- */
/* validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Server variables that are not required to *boot* but whose absence is almost
 * certainly a misconfiguration in production. `src/instrumentation.ts` warns
 * once at startup for each unset entry. Warning, never throwing: CI builds
 * without them and must stay green.
 */
export const PRODUCTION_RECOMMENDED = [
  {
    name: 'GEMINI_API_KEY',
    consequence: '/api/chat and /api/essay-assist return 503 "AI service not configured"'
  }
] as const;

/** Thrown when validation fails. `variables` lists every offending name. */
export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(message: string, variables: readonly string[]) {
    super(message);
    this.name = 'EnvValidationError';
    this.variables = variables;
  }
}

type Issue = { variable: string; message: string };

const collectIssues = (schema: z.ZodTypeAny, raw: Record<string, unknown>, scope: string): Issue[] => {
  const result = schema.safeParse(raw);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const variable = issue.path.length > 0 ? String(issue.path[0]) : `<${scope}>`;
    return { variable, message: issue.message };
  });
};

/**
 * Format every problem into one message. Deliberately reports the whole set —
 * fixing env vars one failed boot at a time is the worst possible feedback loop
 * on a platform where each attempt costs a redeploy.
 */
const formatIssues = (issues: readonly Issue[]): string => {
  const lines = issues.map((issue) => `  - ${issue.variable}: ${issue.message}`);
  return [
    `Invalid environment configuration — ${issues.length} problem${issues.length === 1 ? '' : 's'}:`,
    ...lines,
    '',
    'Set these in .env.local for local development, or in the Vercel project',
    'settings for preview/production. See .env.example for the full list.'
  ].join('\n');
};

const raise = (issues: readonly Issue[]): never => {
  throw new EnvValidationError(
    formatIssues(issues),
    Array.from(new Set(issues.map((issue) => issue.variable)))
  );
};

/* -------------------------------------------------------------------------- */
/* accessors                                                                   */
/* -------------------------------------------------------------------------- */

let clientCache: ClientEnv | undefined;
let serverCache: ServerEnv | undefined;

/**
 * Validated `NEXT_PUBLIC_*` values. Safe to call from client components, server
 * components, route handlers and middleware.
 *
 * Memoised: env vars do not change within a process, and in a client bundle
 * they are compile-time constants.
 */
export const getClientEnv = (): ClientEnv => {
  if (clientCache) return clientCache;
  const issues = collectIssues(clientEnvSchema, readClientRaw(), 'client');
  if (issues.length > 0) raise(issues);
  clientCache = clientEnvSchema.parse(readClientRaw());
  return clientCache;
};

/**
 * Validated server-only values.
 *
 * Throws if called in a browser. This mirrors `src/lib/supabase/service.ts:11`
 * — the repo's existing "must never ship in a client bundle" guard — because
 * the `server-only` package is not a dependency here.
 */
export const getServerEnv = (): ServerEnv => {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() must never be called in the browser — use getClientEnv() for NEXT_PUBLIC_* values');
  }
  if (serverCache) return serverCache;
  const issues = collectIssues(serverEnvSchema, readServerRaw(), 'server');
  if (issues.length > 0) raise(issues);
  serverCache = serverEnvSchema.parse(readServerRaw());
  return serverCache;
};

/**
 * Validate BOTH schemas and throw a single error naming every offending
 * variable. This is the boot-time entry point; `src/instrumentation.ts` calls
 * it inside `register()`.
 *
 * Returns the parsed values so a caller can use them without a second parse.
 */
export const assertEnv = (): { client: ClientEnv; server: ServerEnv } => {
  if (typeof window !== 'undefined') {
    throw new Error('assertEnv() is server-only');
  }
  const issues = [
    ...collectIssues(clientEnvSchema, readClientRaw(), 'client'),
    ...collectIssues(serverEnvSchema, readServerRaw(), 'server')
  ];
  if (issues.length > 0) raise(issues);

  // Surface anything `.catch()` quietly repaired. These are not fatal — the
  // process boots on the default — but an operator who set LOG_LEVEL=warning
  // (not a valid level) should find out from the boot log, not from wondering
  // why the logs look unchanged.
  const repaired = REPAIRABLE.filter(({ name, valid }) => {
    const raw = process.env[name];
    return typeof raw === 'string' && raw.length > 0 && !valid.includes(raw);
  });
  for (const { name, valid } of repaired) {
    // Deliberately console, not the logger: this runs before the logger's sink
    // is configured, and must not depend on the very setting it is reporting on.
    console.warn(
      `[env] ${name}="${process.env[name]}" is not one of ${valid.join(' | ')} — falling back to the default.`
    );
  }

  return { client: getClientEnv(), server: getServerEnv() };
};

/**
 * Drop the memoised values. Exists for tests, which mutate `process.env`
 * between cases. Production code has no reason to call this.
 */
export const resetEnvCacheForTests = (): void => {
  clientCache = undefined;
  serverCache = undefined;
};
