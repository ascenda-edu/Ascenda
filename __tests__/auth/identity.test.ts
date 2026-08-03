/**
 * @jest-environment ./jest.environment-node.js
 *
 * `@/lib/auth/identity` throws on import when `window` exists (the repo's
 * server-only convention, since the `server-only` package is not a dependency).
 * The node environment is therefore not a preference here — it is the module's
 * contract, and this docblock is part of what proves the guard works.
 */

const getUser = jest.fn();
const profileMaybeSingle = jest.fn();
const from = jest.fn();

/**
 * THE DOUBLE RECORDS FILTER ARGUMENTS. That is the whole point of it.
 *
 * The previous double was `select: () => ({ eq: () => ({ maybeSingle }) })` —
 * arguments discarded — and the suite asserted only `toHaveBeenCalledWith
 * ('profiles')`. A reviewer changed `.eq('id', user.id)` to `.eq('role',
 * user.id)` in `identity.ts` — the module that answers "who is making this
 * request" — and all 1,069 tests stayed green. That is the SAME
 * find-and-replace class that already shipped on this branch once, as
 * `'counsellor.student'` (commit b5119ae). Twice is a pattern, not bad luck.
 *
 * So: record `[method, column, value]` per filter, the select column list, and
 * which terminal was used, then assert WHICH COLUMN is filtered — never just
 * which table. Same shape as the recorder in `__tests__/data/applications.test.ts`
 * and `__tests__/counsellor/cohort-loader.test.ts`.
 */
type Filter = [method: 'eq', column: string, value: unknown];
interface RecordedQuery {
  table: string;
  select: string;
  filters: Filter[];
  terminal: string | null;
}

const queries: RecordedQuery[] = [];
/** The single `profiles` read `getIdentity` makes, or a failure naming what it did instead. */
const profileQuery = (): RecordedQuery => {
  const profileReads = queries.filter((q) => q.table === 'profiles');
  expect(profileReads).toHaveLength(1);
  return profileReads[0];
};

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(async () => ({
    auth: { getUser },
    from
  }))
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    // Real `redirect()` throws a NEXT_REDIRECT error so control never returns.
    // Mimic that: a mock that merely records the call would let the code under
    // test carry on past a guard it is supposed to have been stopped by, which
    // is the exact failure this suite exists to catch.
    const error = Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT;${url}` });
    throw error;
  })
}));

import { getIdentity, parseRole, requireIdentity, requireRole } from '@/lib/auth/identity';

const signedOut = () => getUser.mockResolvedValue({ data: { user: null }, error: null });

const signedIn = (user: { id: string; email?: string | null }, role: unknown, error: unknown = null) => {
  getUser.mockResolvedValue({ data: { user: { id: user.id, email: user.email ?? null } }, error: null });
  profileMaybeSingle.mockResolvedValue({ data: role === undefined ? null : { role }, error });
};

beforeEach(() => {
  jest.clearAllMocks();
  queries.length = 0;
  from.mockImplementation((table: string) => {
    const record: RecordedQuery = { table, select: '', filters: [], terminal: null };
    queries.push(record);
    const builder: Record<string, unknown> = {
      select: (columns: string) => {
        record.select = columns;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        record.filters.push(['eq', column, value]);
        return builder;
      },
      maybeSingle: () => {
        record.terminal = 'maybeSingle';
        return profileMaybeSingle();
      },
      single: () => {
        record.terminal = 'single';
        return profileMaybeSingle();
      }
    };
    return builder;
  });
});

describe('getIdentity', () => {
  it('returns null when signed out — and does not look up a profile', async () => {
    signedOut();

    await expect(getIdentity()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('resolves the role from profiles', async () => {
    signedIn({ id: 'u-1', email: 'c@example.com' }, 'counsellor');

    await expect(getIdentity()).resolves.toEqual({
      userId: 'u-1',
      email: 'c@example.com',
      role: 'counsellor'
    });
    expect(from).toHaveBeenCalledWith('profiles');
  });

  it('reads the CALLER row: profiles WHERE id = <the JWT subject>', async () => {
    signedIn({ id: 'u-42', email: 'c@example.com' }, 'counsellor');

    await getIdentity();

    // The whole query, in one assertion, so a change to any part of it names
    // itself in the diff rather than hiding behind a table-name check.
    expect(queries).toEqual([
      { table: 'profiles', select: 'role', filters: [['eq', 'id', 'u-42']], terminal: 'maybeSingle' }
    ]);
  });

  describe('the profiles read is pinned column by column', () => {
    // Stated as four separate properties rather than left implicit in the shape
    // assertion above, because each one is a distinct way to break this module
    // silently, and the failure should name which one broke.
    beforeEach(() => signedIn({ id: 'u-42', email: 'c@example.com' }, 'counsellor'));

    it('filters on `id` — not on `role`, not on any other column', async () => {
      await getIdentity();

      const { filters } = profileQuery();
      expect(filters).toEqual([['eq', 'id', 'u-42']]);
      // Said again, negatively: `.eq('role', user.id)` is the exact mutation
      // that survived the whole suite, and it is a one-word find-and-replace
      // away at all times.
      expect(filters.map(([, column]) => column)).not.toContain('role');
    });

    it('filters on the JWT subject, never on the email or anything else', async () => {
      await getIdentity();

      expect(profileQuery().filters).toEqual([['eq', 'id', 'u-42']]);
      expect(JSON.stringify(profileQuery().filters)).not.toContain('c@example.com');
    });

    it('selects `role` — not `id`, not `*`', async () => {
      await getIdentity();

      expect(profileQuery().select).toBe('role');
    });

    it('resolves at most one row, and tolerates zero', async () => {
      // `.single()` errors with PGRST116 when the profile row is missing, which
      // would turn "no profile yet" into a logged error on every render.
      await getIdentity();

      expect(profileQuery().terminal).toBe('maybeSingle');
    });

    it('touches `profiles` and nothing else', async () => {
      await getIdentity();

      expect(queries.map((q) => q.table)).toEqual(['profiles']);
    });
  });

  it('takes the email from the verified JWT claim, not from a profile table', async () => {
    signedIn({ id: 'u-1', email: 'jwt@example.com' }, 'student');

    await expect(getIdentity()).resolves.toMatchObject({ email: 'jwt@example.com' });
  });

  it('reports a missing email as null rather than undefined', async () => {
    signedIn({ id: 'u-1', email: null }, 'admin');

    await expect(getIdentity()).resolves.toEqual({ userId: 'u-1', email: null, role: 'admin' });
  });

  describe('fails closed on the role', () => {
    it.each([
      ['a missing profile row', undefined],
      ['a null role', null],
      ['an unknown role', 'superuser'],
      ['a non-string role', 42]
    ])('%s resolves to student', async (_label, role) => {
      signedIn({ id: 'u-1' }, role);
      await expect(getIdentity()).resolves.toMatchObject({ role: 'student' });
    });

    it('an unreadable profile resolves to student, never admin', async () => {
      signedIn({ id: 'u-1' }, undefined, { message: 'permission denied' });
      await expect(getIdentity()).resolves.toMatchObject({ role: 'student' });
    });
  });
});

describe('parseRole', () => {
  it('passes the three real roles through', () => {
    expect(parseRole('student')).toBe('student');
    expect(parseRole('counsellor')).toBe('counsellor');
    expect(parseRole('admin')).toBe('admin');
  });

  it('collapses everything else to the least privileged value', () => {
    for (const raw of [null, undefined, '', 'Admin', 'ADMIN', 'parent', 0, {}, []]) {
      expect(parseRole(raw)).toBe('student');
    }
  });
});

describe('requireIdentity', () => {
  it('returns the identity when signed in', async () => {
    signedIn({ id: 'u-1', email: 'a@example.com' }, 'student');
    await expect(requireIdentity()).resolves.toMatchObject({ userId: 'u-1' });
  });

  it('redirects to /login when signed out', async () => {
    signedOut();
    await expect(requireIdentity()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});

describe('requireRole', () => {
  it('returns the identity when the role matches', async () => {
    signedIn({ id: 'u-1' }, 'admin');
    await expect(requireRole('admin')).resolves.toMatchObject({ role: 'admin' });
  });

  it('accepts any of several roles', async () => {
    signedIn({ id: 'u-1' }, 'counsellor');
    await expect(requireRole('counsellor', 'admin')).resolves.toMatchObject({ role: 'counsellor' });
  });

  it('redirects on a role mismatch', async () => {
    signedIn({ id: 'u-1' }, 'student');
    await expect(requireRole('admin')).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it('redirects a signed-out caller to /login, not /dashboard', async () => {
    signedOut();
    await expect(requireRole('admin')).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('does not let an unreadable profile satisfy an admin requirement', async () => {
    signedIn({ id: 'u-1' }, undefined, { message: 'permission denied' });
    await expect(requireRole('admin')).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });
});
