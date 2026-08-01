/**
 * One error type for the data layer, and three explicit dispositions.
 *
 * WHY THIS EXISTS
 * ---------------
 * The audit found FOUR incompatible conventions living side by side
 * (docs/audit/02-data-layer.md, "Four incompatible error conventions"):
 *
 *   1. `unwrap()` written out three times, character-for-character identical
 *      apart from its label prefix (counsellor/data.ts, parent/data.ts,
 *      counsellor/decks.ts).
 *   2. `if (error) throw error` — a raw `PostgrestError` thrown across 52 sites.
 *   3. One proper `ActionResult<T>` discriminated union, in one module.
 *   4. `const { data } = await …` — the `error` never bound at all. 27 sites.
 *
 * (4) is the one that hurts. `src/app/applications/page.tsx:29` discarded the
 * error from the applications query, so a failed read produced `data === null`,
 * which the page read as "no rows", which rendered the "No applications yet —
 * let's pick a first one" empty state to a student with a board full of
 * applications. An RLS change, a dropped column, a network blip: all of them
 * looked exactly like "this user has never applied anywhere". Nothing was
 * logged, so nothing was noticed.
 *
 * The root cause is that the disposition — throw, or degrade — was decided by
 * whether the author happened to bind `error`. Here it is a decision you must
 * make and name:
 *
 *   unwrap(result, context)            → throws. THE DEFAULT.
 *   soft(result, context, fallback)    → logs and returns the named fallback.
 *   ActionResult<T>                    → writes, which must not throw across an
 *                                        API or server-action boundary.
 *
 * `soft` is deliberately more typing than `unwrap`: rendering empty on failure
 * should cost a line of thought.
 *
 * WHAT DataError DELIBERATELY DOES NOT CARRY
 * ------------------------------------------
 * PostgREST error messages name tables ('relation "public.applications" does
 * not exist'), constraints, columns and RLS policies. Phase 0 removed several
 * such leaks from responses; `DataError.message` therefore never interpolates
 * the driver's message, only a fixed phrase chosen from the error's class. The
 * full detail is attached as `cause` and written to the structured log —
 * server-side, where it belongs — by `unwrap`/`soft` themselves. That is why
 * these two functions log rather than leaving it to the error boundary: the
 * boundary only ever sees the sanitised half.
 */

import { logger } from '@/lib/observability/logger';

/* -------------------------------------------------------------------------- */
/* the shape of a PostgREST result                                             */
/* -------------------------------------------------------------------------- */

/**
 * Structurally compatible with `PostgrestError`, `AuthError` and `StorageError`
 * without importing any of them — so this module (and its tests) stay free of
 * the driver, and a plain object works at a call site.
 */
export interface QueryErrorLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Structurally compatible with `PostgrestResponse` / `PostgrestSingleResponse`. */
export interface QueryResult<T> {
  data: T;
  error: QueryErrorLike | null;
}

/* -------------------------------------------------------------------------- */
/* classification                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A coarse, client-safe classification. Deliberately coarse: anything finer
 * starts describing the schema.
 */
export type DataErrorKind =
  | 'missing_table'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'constraint'
  | 'unavailable'
  | 'unknown';

const KIND_BY_CODE: Record<string, DataErrorKind> = {
  // relation does not exist / PostgREST schema-cache miss
  '42P01': 'missing_table',
  '42703': 'missing_table', // undefined column — same cause class: schema drift
  PGRST202: 'missing_table', // function not found
  PGRST205: 'missing_table', // table not found in schema cache
  // authorisation
  '42501': 'permission_denied', // insufficient privilege / RLS refusal
  PGRST301: 'permission_denied', // JWT invalid or expired
  // cardinality
  PGRST116: 'not_found', // .single() matched zero (or many) rows
  // integrity
  '23505': 'conflict', // unique violation
  '23503': 'constraint', // foreign-key violation
  '23502': 'constraint', // not-null violation
  '23514': 'constraint', // check violation
  // availability
  '57014': 'unavailable', // statement timeout
  '08006': 'unavailable', // connection failure
  '53300': 'unavailable', // too many connections
};

const REASON_BY_KIND: Record<DataErrorKind, string> = {
  missing_table: 'the data source is unavailable',
  permission_denied: 'the request was not permitted',
  not_found: 'no matching record',
  conflict: 'that record already exists',
  constraint: 'the request was rejected',
  unavailable: 'the database did not respond in time',
  unknown: 'the database request failed',
};

const classify = (code: string | null | undefined): DataErrorKind =>
  (code && KIND_BY_CODE[code]) || 'unknown';

const asQueryError = (cause: unknown): QueryErrorLike => {
  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>;
    return {
      message: typeof record.message === 'string' ? record.message : String(cause),
      code: typeof record.code === 'string' ? record.code : null,
      details: typeof record.details === 'string' ? record.details : null,
      hint: typeof record.hint === 'string' ? record.hint : null,
    };
  }
  return { message: String(cause), code: null };
};

/* -------------------------------------------------------------------------- */
/* DataError                                                                   */
/* -------------------------------------------------------------------------- */

export class DataError extends Error {
  override readonly name = 'DataError';

  /**
   * Where this happened, in `module.operation` form — `applications.board`,
   * `parent.guardian_links`. Safe to show: it names OUR code, not the schema.
   */
  readonly context: string;

  /** The driver's error code, when there was one. Never interpolated into `message`. */
  readonly code: string | null;

  readonly kind: DataErrorKind;

  constructor(context: string, cause?: unknown) {
    const detail = asQueryError(cause);
    const kind = classify(detail.code);
    // NOT `detail.message` — see the module header. The driver's text names
    // tables, columns, constraints and policies.
    super(`${context}: ${REASON_BY_KIND[kind]}`, { cause });
    this.context = context;
    this.code = detail.code ?? null;
    this.kind = kind;
  }

  /** `42P01` / `PGRST205` — the schema-drift signature worth feature-detecting. */
  get isMissingTable(): boolean {
    return this.kind === 'missing_table';
  }

  /**
   * Structured fields for the log. The driver's `message`/`details`/`hint` are
   * carried on `cause` for the log sink; they are not returned here so that a
   * caller cannot casually forward them into a response body.
   */
  toLogContext(): { context: string; code: string | null; kind: DataErrorKind } {
    return { context: this.context, code: this.code, kind: this.kind };
  }
}

export const isDataError = (value: unknown): value is DataError => value instanceof DataError;

/**
 * The single place PostgREST detail is recorded. `cause` carries the original
 * driver error, which the console sink strips in production and a provider sink
 * (Sentry et al.) reports in full — see `lib/observability/logger.ts`.
 */
const report = (error: DataError, extra?: Record<string, unknown>): void => {
  logger.error(`data: ${error.context} failed`, error, { ...error.toLogContext(), ...extra });
};

/* -------------------------------------------------------------------------- */
/* the three dispositions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * READS THAT MUST NOT RENDER AS EMPTY. The default.
 *
 * Logs the driver detail, then throws a sanitised `DataError` to the route's
 * `error.tsx`. An error page is a worse experience than a board; a board that
 * lies about being empty is a worse experience than an error page.
 *
 *   const rows = unwrap(await supabase.from('applications').select(SEL), 'applications.board') ?? [];
 *
 * Returns whatever `data` was typed as — `T[] | null` for a list, `T | null`
 * for `.maybeSingle()`. Pass the type argument explicitly if inference through
 * the PostgREST response union is not giving you what you expect.
 */
export function unwrap<T>(result: QueryResult<T>, context: string): T {
  if (result.error) {
    const error = new DataError(context, result.error);
    report(error);
    throw error;
  }
  return result.data;
}

/**
 * READS THAT ARE GENUINELY OPTIONAL — a decoration, a badge, a nice-to-have.
 * Logs, then returns the fallback you named.
 *
 *   const tiers = soft<MatchTierRow[]>(await q, 'applications.tier', []);
 *
 * The fallback is a required argument on purpose: "render empty on failure" is
 * a product decision, and this is where it gets made and reviewed. If you
 * cannot name a fallback that is honest, you wanted `unwrap`.
 */
export function soft<T>(result: QueryResult<T | null>, context: string, fallback: T): T {
  if (result.error) {
    report(new DataError(context, result.error), { fallbackUsed: true });
    return fallback;
  }
  return result.data ?? fallback;
}

/* -------------------------------------------------------------------------- */
/* writes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Expected-failure codes a caller translates (route → HTTP status, tool → user
 * message). `not_found` is deliberately opaque: row-missing and
 * exists-but-not-owned collapse into it so no caller can turn the distinction
 * into a UUID existence oracle.
 */
export type ActionErrorCode = 'not_found' | 'conflict' | 'fk_violation' | 'invalid';

/**
 * WRITES. Never throw across an API or server-action boundary — the caller owns
 * the status code and the user-facing message.
 *
 * Mirrors the shape already proven in `src/lib/applications/server-actions.ts`
 * (`{ ok: true } & T`), so that module can adopt this type without changing a
 * single consumer.
 */
export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: ActionErrorCode };

const ACTION_CODE_BY_KIND: Partial<Record<DataErrorKind, ActionErrorCode>> = {
  not_found: 'not_found',
  conflict: 'conflict',
  constraint: 'fk_violation',
};

export const ok = <T extends object>(value: T): ActionResult<T> => ({ ok: true, ...value });

/**
 * Build a failed `ActionResult` from a driver error: logs the detail, returns a
 * sanitised message and a coarse code.
 */
export const err = <T>(context: string, cause?: unknown, code?: ActionErrorCode): ActionResult<T> => {
  const error = new DataError(context, cause);
  report(error);
  return {
    ok: false,
    error: error.message,
    code: code ?? ACTION_CODE_BY_KIND[error.kind],
  };
};
