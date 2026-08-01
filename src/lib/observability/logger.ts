/**
 * Provider-agnostic structured logger.
 *
 * WHY THIS EXISTS
 * ---------------
 * The entire production error pipeline today is 91 `console.*` calls across 47
 * files, feeding a Vercel log stream nobody is paged on. The 11 `error.tsx`
 * boundaries and `global-error.tsx` are well built and report to nobody: a
 * digest is shown to the user that no one can resolve to a stack trace.
 *
 * This module is the *seam*, not the solution. It deliberately installs no SDK.
 * No error-monitoring provider has been chosen for this project and no DSN
 * exists, so shipping a hard dependency on one would be a guess baked into 47
 * call sites. Instead: one small interface, a console fallback that is a strict
 * improvement on the status quo (levelled, structured, redacted), and a
 * one-function hook for whichever provider is picked.
 *
 * WIRING A PROVIDER (e.g. Sentry) — the whole change
 * --------------------------------------------------
 * 1. `npm i @sentry/nextjs` and add `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` to
 *    the schemas in `src/lib/env.ts` (optional, so CI builds keep passing).
 * 2. In `src/instrumentation.ts` `register()`, after `assertEnv()`:
 *
 *      const Sentry = await import('@sentry/nextjs');
 *      Sentry.init({ dsn: getServerEnv().SENTRY_DSN, tracesSampleRate: 0.1 });
 *      setLogSink((entry) => {
 *        if (entry.error) {
 *          Sentry.captureException(entry.error.cause ?? new Error(entry.message), {
 *            level: entry.level === 'warn' ? 'warning' : entry.level,
 *            extra: entry.context
 *          });
 *          return;
 *        }
 *        Sentry.addBreadcrumb({ level: entry.level, message: entry.message, data: entry.context });
 *      });
 *
 *    Nothing else in the codebase changes — every `logger.*` call already routes
 *    through the sink.
 * 3. Create `src/instrumentation-client.ts` with the browser `Sentry.init()` and
 *    the same `setLogSink()` call, for client-side reporting.
 * 4. `src/app/global-error.tsx:12` and each `error.tsx`: replace
 *    `console.error(...)` with `logger.error('Unhandled global error', error, { digest: error.digest })`.
 * 5. Migrate the 91 `console.*` sites file by file. No big-bang rewrite needed —
 *    the console fallback and the provider sink coexist.
 *
 * RUNTIME SAFETY
 * --------------
 * No Node built-ins, no `process.stdout`, no filesystem, no dynamic `import`.
 * `console` is the only host API used, which exists in the Node runtime, the
 * Edge runtime and the browser. `process.env` is read through a guarded
 * accessor because the Edge runtime and the browser both expose only a subset.
 *
 * This module intentionally does NOT import `@/lib/env`: the logger must be
 * importable from client components, and pulling the server schema into a
 * browser bundle to read one level string is the wrong trade.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export type LogRuntime = 'nodejs' | 'edge' | 'browser' | 'unknown';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  /** Next's error digest, when the caller has one (error boundaries do). */
  digest?: string;
  /** The original throwable, for providers that want the real object. Never serialized to console. */
  cause?: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  runtime: LogRuntime;
  context?: LogContext;
  error?: SerializedError;
}

/** A destination for log entries. Exactly one is installed at a time. */
export type LogSink = (entry: LogEntry) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/* -------------------------------------------------------------------------- */
/* environment probing — must not assume Node                                  */
/* -------------------------------------------------------------------------- */

const readEnv = (name: string): string | undefined => {
  try {
    // `process` is undefined in some Edge/browser contexts; the try/catch covers
    // both "not declared" and "declared but env is a restricted proxy".
    if (typeof process === 'undefined' || !process.env) return undefined;
    return process.env[name];
  } catch {
    return undefined;
  }
};

const detectRuntime = (): LogRuntime => {
  if (typeof window !== 'undefined') return 'browser';
  const next = readEnv('NEXT_RUNTIME');
  if (next === 'edge') return 'edge';
  if (next === 'nodejs') return 'nodejs';
  if (typeof process !== 'undefined' && process.versions?.node) return 'nodejs';
  return 'unknown';
};

const isProduction = (): boolean => readEnv('NODE_ENV') === 'production';

const resolveMinLevel = (): LogLevel => {
  const configured = readEnv('LOG_LEVEL');
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured;
  }
  // Quiet-by-default in production, verbose in development. Matches the
  // existing convention in `lib/analytics.ts:14`.
  return isProduction() ? 'info' : 'debug';
};

/* -------------------------------------------------------------------------- */
/* redaction                                                                   */
/* -------------------------------------------------------------------------- */

const SECRET_KEY_PATTERN = /(secret|password|token|api[-_]?key|service[-_]?role|authorization|cookie|session)/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 4;

/**
 * Structured context is written by hand at call sites, and a hand-written
 * context object is exactly where a secret eventually gets attached by
 * accident. Redact by key name before anything leaves this module — the
 * console fallback writes to a log stream, and a provider sink ships to a third
 * party.
 */
const redact = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return out;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }

  return value;
};

const redactContext = (context?: LogContext): LogContext | undefined => {
  if (!context) return undefined;
  const redacted = redact(context) as LogContext;
  return Object.keys(redacted).length > 0 ? redacted : undefined;
};

/* -------------------------------------------------------------------------- */
/* error serialization                                                         */
/* -------------------------------------------------------------------------- */

const serializeError = (error: unknown): SerializedError | undefined => {
  if (error === null || error === undefined) return undefined;

  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: typeof digest === 'string' ? digest : undefined,
      cause: error
    };
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : 'NonErrorThrowable',
      message: typeof record.message === 'string' ? record.message : safeStringify(error),
      digest: typeof record.digest === 'string' ? record.digest : undefined,
      cause: error
    };
  }

  return { name: 'NonErrorThrowable', message: String(error), cause: error };
};

const safeStringify = (value: unknown): string => {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return '[circular]';
        seen.add(item);
      }
      return item;
    }) ?? String(value);
  } catch {
    return String(value);
  }
};

/* -------------------------------------------------------------------------- */
/* sink                                                                        */
/* -------------------------------------------------------------------------- */

const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

/**
 * Fallback sink used until a provider is wired. One line per entry:
 *  - production → a single JSON object, so a log drain can parse it
 *  - development → the message plus the context object, readable in a terminal
 *
 * `cause` is stripped before serialization; it is only meaningful to a provider.
 */
const consoleSink: LogSink = (entry) => {
  const method = CONSOLE_METHOD[entry.level];

  if (isProduction()) {
    const { error, ...rest } = entry;
    const payload = error
      ? { ...rest, error: { name: error.name, message: error.message, stack: error.stack, digest: error.digest } }
      : rest;
    console[method](safeStringify(payload));
    return;
  }

  const prefix = `[${entry.level}] ${entry.message}`;
  if (entry.error && entry.context) {
    console[method](prefix, entry.context, entry.error.cause ?? entry.error);
  } else if (entry.error) {
    console[method](prefix, entry.error.cause ?? entry.error);
  } else if (entry.context) {
    console[method](prefix, entry.context);
  } else {
    console[method](prefix);
  }
};

let sink: LogSink = consoleSink;

/**
 * Install a provider sink. Call once, from `instrumentation.ts` (server/edge) or
 * `instrumentation-client.ts` (browser). See the wiring block at the top of this
 * file.
 *
 * The sink is wrapped so a failure inside the provider can never take down the
 * code that was merely trying to log something.
 */
export const setLogSink = (next: LogSink): void => {
  sink = (entry) => {
    try {
      next(entry);
    } catch (sinkError) {
      // Last resort: bypass the sink entirely.
      console.error('[logger] sink threw', sinkError);
      consoleSink(entry);
    }
  };
};

/** Restore the console fallback. Primarily for tests. */
export const resetLogSink = (): void => {
  sink = consoleSink;
};

/** True while no provider has been installed — useful for a boot-time notice. */
export const hasProviderSink = (): boolean => sink !== consoleSink;

/* -------------------------------------------------------------------------- */
/* public API                                                                  */
/* -------------------------------------------------------------------------- */

const emit = (level: LogLevel, message: string, context?: LogContext, error?: unknown): void => {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[resolveMinLevel()]) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    runtime: detectRuntime(),
    context: redactContext(context),
    error: serializeError(error)
  };

  try {
    sink(entry);
  } catch {
    // Never let logging throw into application code.
  }
};

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  /**
   * `error` takes the throwable second so call sites read naturally:
   *   logger.error('Failed to persist intake', err, { studentId })
   * The throwable is optional — some errors are conditions, not exceptions.
   */
  error: (message: string, error?: unknown, context?: LogContext) => emit('error', message, context, error)
} as const;

export type Logger = typeof logger;
