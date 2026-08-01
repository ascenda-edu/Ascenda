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
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) })
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
