/**
 * @jest-environment ./jest.environment-node.js
 *
 * The point of this file is the FIRST describe block: `@/lib/auth/policy` and
 * `@/lib/api/guards` state the same rule twice, and nothing but a test stops
 * them drifting. Everything after it covers `can()` itself.
 */

import type { User } from '@supabase/supabase-js';

const createServerSupabaseClient = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: (...args: never[]) => createServerSupabaseClient(...args)
}));

import { canActAsCounsellor } from '@/lib/api/guards';
import type { Identity } from '@/lib/auth/identity';
import {
  actionForPath,
  actsAsCounsellor,
  can,
  COUNSELLOR_PORTAL_OPEN_TO_ALL,
  PARENT_PORTAL_OPEN_TO_ALL,
  roleGrants,
  ROUTE_POLICY
} from '@/lib/auth/policy';

// `isDemoUser` compares against NEXT_PUBLIC_DEMO_EMAIL, defaulting to this
// address (src/lib/demo/demo-profile.ts). Read the constant rather than
// hardcoding it so the test tracks the app.
const { DEMO_EMAIL } = require('@/lib/demo/demo-profile') as typeof import('@/lib/demo/demo-profile');

/** A profiles table stub: id -> role. Backs both guards.ts and policy.ts lookups. */
const profileTable = new Map<string, string | null>();

const stubSupabase = () => ({
  from: (table: string) => {
    expect(table).toBe('profiles');
    return {
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () =>
            profileTable.has(id)
              ? { data: { id, role: profileTable.get(id) }, error: null }
              : { data: null, error: null }
        })
      })
    };
  }
});

const identity = (over: Partial<Identity> = {}): Identity => ({
  userId: 'caller',
  email: 'someone@example.com',
  role: 'student',
  ...over
});

const asUser = (id: Identity): User => ({ id: id.userId, email: id.email ?? undefined }) as User;

beforeEach(() => {
  profileTable.clear();
  createServerSupabaseClient.mockImplementation(async () => stubSupabase());
});

/* -------------------------------------------------------------------------- */

describe('agreement with src/lib/api/guards.ts', () => {
  // can_act_as_counsellor() = is_counsellor() or is_demo_account()
  //   is_counsellor()   -> profiles.role in ('counsellor','admin')
  //   is_demo_account() -> JWT email claim matches the demo address
  const CASES: Array<[label: string, id: Identity, expected: boolean]> = [
    ['a counsellor', identity({ userId: 'c', role: 'counsellor' }), true],
    ['an admin', identity({ userId: 'a', role: 'admin' }), true],
    ['a plain student', identity({ userId: 's', role: 'student' }), false],
    ['the demo account (role student)', identity({ userId: 'd', role: 'student', email: DEMO_EMAIL }), true],
    [
      'the demo address in a different case',
      identity({ userId: 'd2', role: 'student', email: DEMO_EMAIL.toUpperCase() }),
      true
    ],
    ['a signed-in user with no email', identity({ userId: 'n', role: 'student', email: null }), false]
  ];

  it.each(CASES)('%s: policy and guards agree', async (_label, id, expected) => {
    profileTable.set(id.userId, id.role);

    const fromGuards = await canActAsCounsellor(stubSupabase() as never, asUser(id));
    const fromPolicy = actsAsCounsellor(id);

    expect(fromPolicy).toBe(expected);
    expect(fromGuards).toBe(expected);
    expect(fromPolicy).toBe(fromGuards);
  });

  it('both fail closed when the profile row cannot be read', async () => {
    const id = identity({ userId: 'ghost', role: 'student' });
    // deliberately not added to profileTable -> guards.ts sees `data: null`
    expect(await canActAsCounsellor(stubSupabase() as never, asUser(id))).toBe(false);
    expect(actsAsCounsellor(id)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe('can() — coarse actions', () => {
  it('only an admin gets portal:admin and catalogue:write', async () => {
    for (const role of ['student', 'counsellor'] as const) {
      const id = identity({ role });
      expect(await can(id, 'portal:admin')).toBe(false);
      expect(await can(id, 'catalogue:write')).toBe(false);
    }
    const admin = identity({ role: 'admin' });
    expect(await can(admin, 'portal:admin')).toBe(true);
    expect(await can(admin, 'catalogue:write')).toBe(true);
  });

  it('the demo account does NOT become an admin', async () => {
    const demo = identity({ role: 'student', email: DEMO_EMAIL });
    expect(actsAsCounsellor(demo)).toBe(true);
    expect(await can(demo, 'portal:admin')).toBe(false);
    expect(await can(demo, 'catalogue:write')).toBe(false);
  });

  it('every role can reach the student portal', async () => {
    for (const role of ['student', 'counsellor', 'admin'] as const) {
      expect(await can(identity({ role }), 'portal:student')).toBe(true);
    }
  });
});

describe('can() — the demo posture on /counsellor and /parent', () => {
  it('a plain student may still reach /counsellor today (posture unchanged)', async () => {
    expect(COUNSELLOR_PORTAL_OPEN_TO_ALL).toBe(true);
    expect(await can(identity({ role: 'student' }), 'portal:counsellor')).toBe(true);
  });

  it('a plain student may still reach /parent today', async () => {
    expect(PARENT_PORTAL_OPEN_TO_ALL).toBe(true);
    expect(await can(identity({ role: 'student' }), 'portal:parent')).toBe(true);
  });

  it('the open posture is a PORTAL override only — it grants no student data', async () => {
    const student = identity({ userId: 's', role: 'student' });
    profileTable.set('victim', 'student');

    expect(await can(student, 'student:read', { studentId: 'victim' })).toBe(false);
    expect(await can(student, 'student:note', { studentId: 'victim' })).toBe(false);
    expect(await can(student, 'student:message', { studentId: 'victim' })).toBe(false);
  });

  it('flipping the flag closes /counsellor for a student and keeps it open for a counsellor', () => {
    // `roleGrants` is `can()` minus the posture override — i.e. exactly the
    // answer the app gives the moment COUNSELLOR_PORTAL_OPEN_TO_ALL is false.
    expect(roleGrants(identity({ role: 'student' })).has('portal:counsellor')).toBe(false);
    expect(roleGrants(identity({ role: 'counsellor' })).has('portal:counsellor')).toBe(true);
    expect(roleGrants(identity({ role: 'admin' })).has('portal:counsellor')).toBe(true);
    expect(
      roleGrants(identity({ role: 'student', email: DEMO_EMAIL })).has('portal:counsellor')
    ).toBe(true);
  });
});

describe('can() — subject-scoped actions', () => {
  const counsellor = identity({ userId: 'c-1', role: 'counsellor' });

  beforeEach(() => {
    profileTable.set('c-1', 'counsellor');
    profileTable.set('stu-1', 'student');
    profileTable.set('c-2', 'counsellor');
  });

  it('a counsellor may note a real student', async () => {
    expect(await can(counsellor, 'student:note', { studentId: 'stu-1' })).toBe(true);
  });

  it('refuses a subject that is not a student profile', async () => {
    expect(await can(counsellor, 'student:note', { studentId: 'c-2' })).toBe(false);
  });

  it('refuses an unknown subject id', async () => {
    expect(await can(counsellor, 'student:note', { studentId: 'nope' })).toBe(false);
  });

  it('refuses a subject-scoped action called WITHOUT a resource, for every role', async () => {
    // The forget-the-resource bug is what F2/F3/F6 all were. Answering the
    // coarse question here would reproduce it.
    for (const role of ['student', 'counsellor', 'admin'] as const) {
      expect(await can(identity({ role }), 'student:note')).toBe(false);
      expect(await can(identity({ role }), 'student:read')).toBe(false);
      expect(await can(identity({ role }), 'student:message')).toBe(false);
    }
  });

  it('a student may always act on their own record', async () => {
    const student = identity({ userId: 'stu-1', role: 'student' });
    expect(await can(student, 'student:read', { studentId: 'stu-1' })).toBe(true);
  });

  it('a student may never act on someone else’s record', async () => {
    const student = identity({ userId: 'stu-2', role: 'student' });
    expect(await can(student, 'student:read', { studentId: 'stu-1' })).toBe(false);
  });

  it('the demo account inherits the counsellor subject rule', async () => {
    const demo = identity({ userId: 'demo', role: 'student', email: DEMO_EMAIL });
    expect(await can(demo, 'student:note', { studentId: 'stu-1' })).toBe(true);
    expect(await can(demo, 'student:note', { studentId: 'c-2' })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe('ROUTE_POLICY', () => {
  it('maps a nested path through its longest matching prefix', () => {
    expect(actionForPath('/counsellor')).toBe('portal:counsellor');
    expect(actionForPath('/counsellor/students/abc')).toBe('portal:counsellor');
    expect(actionForPath('/admin/simulation')).toBe('portal:admin');
    expect(actionForPath('/parent/messages')).toBe('portal:parent');
    expect(actionForPath('/dashboard')).toBe('portal:student');
  });

  it('does not match a prefix that is only a string prefix of the segment', () => {
    // '/admin' must not claim '/administration'
    expect(actionForPath('/administration')).toBeNull();
  });

  it('returns null for unprotected paths', () => {
    expect(actionForPath('/')).toBeNull();
    expect(actionForPath('/login')).toBeNull();
  });

  it('covers every prefix middleware protects', () => {
    // Mirrors PROTECTED_PREFIXES in src/middleware.ts. A route added there
    // without a policy entry is a route with no authorisation story.
    const MIDDLEWARE_PROTECTED = [
      '/dashboard',
      '/profile',
      '/matches',
      '/applications',
      '/admin',
      '/university-search',
      '/course',
      '/shortlist',
      '/scholarships',
      '/counsellor',
      '/parent',
      '/role-select',
      '/inbox',
      '/assistant'
    ];

    const covered = new Set(ROUTE_POLICY.map(([prefix]) => prefix));
    expect(MIDDLEWARE_PROTECTED.filter((prefix) => !covered.has(prefix))).toEqual([]);
  });
});
