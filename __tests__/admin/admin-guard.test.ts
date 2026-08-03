/**
 * @jest-environment ./jest.environment-node.js
 *
 * `src/app/api/admin/admin-guard.ts` — the authorisation preamble for
 * /api/admin/import, /api/admin/catalog-health and /api/admin/update-deadlines.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * All 110 lines of the guard were untested. A reviewer replaced its 401 branch
 * with `return { user: { id: 'anon' }, response: null }` — an anonymous POST to
 * /api/admin/import reaching the catalogue upsert — and the full suite reported
 * 67 suites / 1,541 tests / all pass. `__tests__/admin-import-validation.test.ts`
 * tests the payload validator and never touches the guard.
 *
 * The guard's own header argues at length about which of its four dispositions
 * is which (401 no user / 503 unreadable role / 403 non-admin / pass). That
 * argument is prose. This file is the part that fails when the prose stops being
 * true.
 */

import { NextResponse } from 'next/server';
import { hasValidAdminBearer, requireAdminUser } from '@/app/api/admin/admin-guard';
import { resetLogSink, setLogSink, type LogEntry } from '@/lib/observability/logger';

/** A supabase double: `auth.getUser()` plus one `profiles` role lookup. */
const clientFor = (
  user: { id: string } | null,
  profile: { data: { role: string } | null; error: unknown } = { data: null, error: null },
  filters: Array<[string, unknown]> = []
) => ({
  auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
  from: jest.fn((table: string) => {
    expect(table).toBe('profiles');
    return {
      select: jest.fn((columns: string) => {
        expect(columns).toBe('role');
        return {
          eq: jest.fn((column: string, value: unknown) => {
            filters.push([column, value]);
            return { maybeSingle: jest.fn().mockResolvedValue(profile) };
          })
        };
      })
    };
  })
});

const logs: LogEntry[] = [];
beforeEach(() => {
  logs.length = 0;
  setLogSink((entry) => logs.push(entry));
});
afterEach(() => {
  resetLogSink();
  delete process.env.ADMIN_API_KEY;
});

describe('requireAdminUser — the four dispositions', () => {
  it('401s an unauthenticated caller, and never reads profiles', async () => {
    const supabase = clientFor(null);

    const { user, response } = await requireAdminUser(supabase as never, 'import');

    expect(user).toBeNull();
    expect(response).toBeInstanceOf(NextResponse);
    expect(response!.status).toBe(401);
    expect(await response!.json()).toEqual({ ok: false, error: 'Unauthorized' });
    // No session, no lookup: the role read must not be reachable anonymously.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('503s (not 403) when the role lookup itself fails, and logs the driver detail', async () => {
    const supabase = clientFor({ id: 'u-1' }, {
      data: null,
      error: { message: 'permission denied for table profiles', code: '42501' }
    });

    const { user, response } = await requireAdminUser(supabase as never, 'catalog-health');

    expect(user).toBeNull();
    expect(response!.status).toBe(503);
    // The body carries no table name, no policy name, no driver code.
    expect(await response!.json()).toEqual({ ok: false, error: 'Role check unavailable' });
    // The detail goes to the log instead — an outage that answers 403 is
    // invisible to anyone grepping for it.
    expect(logs.map((entry) => entry.level)).toContain('error');
    expect(logs.some((entry) => entry.message.includes('admin: role check failed'))).toBe(true);
  });

  it.each([
    ['a student', 'student'],
    ['a counsellor', 'counsellor'],
    ['an unknown role literal', 'counsellor.student']
  ])('403s %s', async (_label, role) => {
    const supabase = clientFor({ id: 'u-1' }, { data: { role }, error: null });

    const { user, response } = await requireAdminUser(supabase as never, 'import');

    expect(user).toBeNull();
    expect(response!.status).toBe(403);
    expect(await response!.json()).toEqual({ ok: false, error: 'Forbidden' });
  });

  it('403s a signed-in user with NO profiles row — a genuine non-admin, not an outage', async () => {
    const supabase = clientFor({ id: 'ghost' }, { data: null, error: null });

    const { response } = await requireAdminUser(supabase as never, 'import');

    expect(response!.status).toBe(403);
    // Distinguishing this from the 503 above is the entire reason the guard uses
    // .maybeSingle() rather than .single() (which errors PGRST116 on zero rows).
    expect(logs.some((entry) => entry.message.includes('admin: non-admin request refused'))).toBe(true);
  });

  it('passes an admin through, with the resolved user and no response', async () => {
    const supabase = clientFor({ id: 'admin-1', email: 'a@x.com' } as never, {
      data: { role: 'admin' },
      error: null
    });

    const { user, response } = await requireAdminUser(supabase as never, 'import');

    expect(response).toBeNull();
    expect(user).toEqual(expect.objectContaining({ id: 'admin-1' }));
  });

  it('looks the role up for the CALLER, not for some other id', async () => {
    // The `.eq('id', user.id)` → `.eq('role', user.id)` class: both arguments
    // are strings, so every type- and lint-level gate stays green.
    const filters: Array<[string, unknown]> = [];
    const supabase = clientFor({ id: 'admin-1' }, { data: { role: 'admin' }, error: null }, filters);

    await requireAdminUser(supabase as never, 'import');

    expect(filters).toEqual([['id', 'admin-1']]);
  });
});

describe('hasValidAdminBearer', () => {
  const withHeader = (value?: string) =>
    new Request('http://localhost/api/admin/catalog-health', {
      headers: value === undefined ? {} : { authorization: value }
    });

  it('fails closed when ADMIN_API_KEY is unset — "no key configured" is not "no check needed"', () => {
    delete process.env.ADMIN_API_KEY;
    expect(hasValidAdminBearer(withHeader('Bearer anything'))).toBe(false);
    expect(hasValidAdminBearer(withHeader())).toBe(false);
  });

  it('accepts the configured key and refuses everything else', () => {
    process.env.ADMIN_API_KEY = 's3cret-key';

    expect(hasValidAdminBearer(withHeader('Bearer s3cret-key'))).toBe(true);
    expect(hasValidAdminBearer(withHeader('bearer s3cret-key'))).toBe(true); // case-insensitive scheme
    expect(hasValidAdminBearer(withHeader('s3cret-key'))).toBe(true); // bare token accepted

    expect(hasValidAdminBearer(withHeader('Bearer wrong-length'))).toBe(false);
    expect(hasValidAdminBearer(withHeader('Bearer s3cret-keX'))).toBe(false); // same length, one byte off
    expect(hasValidAdminBearer(withHeader('Bearer '))).toBe(false);
    expect(hasValidAdminBearer(withHeader())).toBe(false);
  });

  it('does not throw on a length mismatch (timingSafeEqual would)', () => {
    process.env.ADMIN_API_KEY = 'short';
    expect(() => hasValidAdminBearer(withHeader('Bearer a-much-longer-token'))).not.toThrow();
    expect(hasValidAdminBearer(withHeader('Bearer a-much-longer-token'))).toBe(false);
  });
});
