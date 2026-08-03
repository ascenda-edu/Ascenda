/**
 * The data layer's error contract.
 *
 * Two properties matter here and neither is about happy paths:
 *
 *  1. A failed read must NEVER be indistinguishable from an empty one. That is
 *     what `unwrap` buys, and what `src/app/applications/page.tsx` lacked when
 *     it rendered "No applications yet" to students whose query had failed.
 *  2. The thrown error must not carry PostgREST's description of the schema.
 *     Driver messages name tables, columns, constraints and RLS policies; Phase
 *     0 removed several such leaks and this is where they would come back.
 */

import {
  DataError,
  err,
  isDataError,
  ok,
  soft,
  unwrap,
  type ActionResult,
  type QueryErrorLike,
} from '@/lib/data/errors';
import { resetLogSink, setLogSink, type LogEntry } from '@/lib/observability/logger';

/** A realistic PostgREST error: the message names the table AND the policy. */
const RLS_ERROR: QueryErrorLike = {
  message: 'new row violates row-level security policy "applications_select_own" for table "applications"',
  code: '42501',
  details: 'Failing row contains (…)',
  hint: 'check policy applications_select_own on public.applications',
};

const MISSING_TABLE_ERROR: QueryErrorLike = {
  message: 'relation "public.shortlisted_programs" does not exist',
  code: '42P01',
  details: null,
  hint: null,
};

/** Every schema identifier that must not escape into a thrown message. */
const LEAKY_FRAGMENTS = [
  'applications_select_own',
  'row-level security',
  'public.applications',
  'public.shortlisted_programs',
  'relation',
  'Failing row',
  'check policy',
];

const captured: LogEntry[] = [];

beforeEach(() => {
  captured.length = 0;
  setLogSink((entry) => captured.push(entry));
});

afterEach(() => {
  resetLogSink();
});

describe('DataError', () => {
  it('names the call site but not the schema', () => {
    const error = new DataError('applications.board', RLS_ERROR);

    expect(error.message).toContain('applications.board');
    for (const fragment of LEAKY_FRAGMENTS) {
      expect(error.message).not.toContain(fragment);
    }
  });

  it('keeps the driver detail on `cause` for the log sink, not on the message', () => {
    const error = new DataError('applications.board', RLS_ERROR);

    expect(error.cause).toBe(RLS_ERROR);
    expect(error.message).not.toContain(RLS_ERROR.message);
  });

  it('classifies the codes the app feature-detects on', () => {
    expect(new DataError('x', MISSING_TABLE_ERROR).isMissingTable).toBe(true);
    expect(new DataError('x', { message: 'm', code: 'PGRST205' }).isMissingTable).toBe(true);
    expect(new DataError('x', RLS_ERROR).kind).toBe('permission_denied');
    expect(new DataError('x', { message: 'm', code: 'PGRST116' }).kind).toBe('not_found');
    expect(new DataError('x', { message: 'm', code: '23505' }).kind).toBe('conflict');
    expect(new DataError('x', { message: 'm', code: '57014' }).kind).toBe('unavailable');
    expect(new DataError('x', { message: 'm', code: 'something-new' }).kind).toBe('unknown');
  });

  it('survives a non-PostgREST throwable', () => {
    const error = new DataError('x', new TypeError('fetch failed'));
    expect(error.kind).toBe('unknown');
    expect(error.code).toBeNull();
    expect(isDataError(error)).toBe(true);
    expect(isDataError(new Error('plain'))).toBe(false);
  });

  it('exposes only redaction-safe fields to the log context', () => {
    const context = new DataError('applications.board', RLS_ERROR).toLogContext();
    expect(context).toEqual({ context: 'applications.board', code: '42501', kind: 'permission_denied' });
    expect(JSON.stringify(context)).not.toContain('applications_select_own');
  });
});

describe('unwrap', () => {
  it('returns the data when the query succeeded', () => {
    expect(unwrap({ data: [{ id: 'a' }], error: null }, 'applications.board')).toEqual([{ id: 'a' }]);
    expect(captured).toHaveLength(0);
  });

  it('throws a DataError carrying the context', () => {
    expect(() => unwrap({ data: null, error: RLS_ERROR }, 'applications.board')).toThrow(DataError);

    try {
      unwrap({ data: null, error: RLS_ERROR }, 'applications.board');
      throw new Error('unreachable — unwrap must throw');
    } catch (caught) {
      expect(isDataError(caught)).toBe(true);
      const error = caught as DataError;
      expect(error.context).toBe('applications.board');
      expect(error.code).toBe('42501');
    }
  });

  it('never lets a failed read look like an empty one', () => {
    // The regression this whole module exists for: `data` is null on failure,
    // so anything that reads only `data` cannot tell the two apart.
    const failed = { data: null, error: RLS_ERROR };
    const empty = { data: [] as unknown[], error: null };

    expect(unwrap(empty, 'applications.board')).toEqual([]);
    expect(() => unwrap(failed, 'applications.board')).toThrow();
  });

  it('logs the driver detail exactly once, server-side', () => {
    expect(() => unwrap({ data: null, error: RLS_ERROR }, 'applications.board')).toThrow();

    expect(captured).toHaveLength(1);
    const entry = captured[0];
    expect(entry.level).toBe('error');
    expect(entry.message).toContain('applications.board');
    expect(entry.context).toMatchObject({ code: '42501', kind: 'permission_denied' });
    // The full driver error reaches a provider sink through `cause`.
    expect((entry.error?.cause as DataError)?.cause).toBe(RLS_ERROR);
  });
});

describe('soft', () => {
  it('returns the named fallback and logs on failure', () => {
    const fallback: string[] = [];
    const result = soft({ data: null, error: RLS_ERROR }, 'applications.tierByProgram', fallback);

    expect(result).toBe(fallback);
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe('error');
    expect(captured[0].message).toContain('applications.tierByProgram');
    expect(captured[0].context).toMatchObject({ fallbackUsed: true });
  });

  it('does not leak schema detail into the log message', () => {
    soft({ data: null, error: MISSING_TABLE_ERROR }, 'shortlist.load', []);
    expect(captured[0].message).not.toContain('shortlisted_programs');
  });

  it('returns the data when the query succeeded, and the fallback for a null row', () => {
    expect(soft({ data: [1, 2], error: null }, 'x', [] as number[])).toEqual([1, 2]);
    expect(soft({ data: null, error: null }, 'x', [] as number[])).toEqual([]);
    expect(captured).toHaveLength(0);
  });
});

describe('ActionResult', () => {
  it('ok() carries the payload', () => {
    const result: ActionResult<{ applicationId: string }> = ok({ applicationId: 'app-1' });
    expect(result).toEqual({ ok: true, applicationId: 'app-1' });
  });

  it('err() returns a sanitised message plus a coarse code, and logs', () => {
    const result = err<{ applicationId: string }>('applications.track', {
      message: 'duplicate key value violates unique constraint "applications_pkey"',
      code: '23505',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('conflict');
    expect(result.error).toContain('applications.track');
    expect(result.error).not.toContain('applications_pkey');
    expect(captured).toHaveLength(1);
  });

  it('lets the caller override the code', () => {
    const result = err('applications.track', { message: 'nope' }, 'not_found');
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('not_found');
  });
});
