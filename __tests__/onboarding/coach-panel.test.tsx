/**
 * Who gets the coach panel, and what it lets them do.
 *
 * The panel used to early-return on `NODE_ENV === 'production'`, so "not in prod"
 * was enforced by a single line that the bundler then removed entirely. It now
 * ships to production admins, which means the visibility rule is real logic with
 * real branches — and two of those branches are silent when they break:
 *
 * 1. A PRODUCTION STUDENT MUST GET NOTHING. This is the whole safety property. If
 *    `resolveCoachPanelScope` ever returns a scope for a non-admin in production,
 *    every student on the live site grows a debug chip in the corner and nothing
 *    fails — it just looks like a design decision nobody made.
 *
 * 2. THE RESET BUTTON MUST NOT REACH AN ADMIN. Its server action refuses outside
 *    development on its own (`lib/onboarding/actions.ts`), so a leak here is not a
 *    data risk — it is a dead button that reports failure to the one user most
 *    likely to assume it worked. The action guard and this assertion cover the two
 *    halves; neither substitutes for the other.
 *
 * `resolveCoachPanelScope` reads `process.env.NODE_ENV`, which Jest sets to `test`.
 * Every case that cares therefore sets it explicitly rather than inheriting it —
 * `defineProperty` because the type is read-only under @types/node.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { CoachPanel, resolveCoachPanelScope } from '@/components/onboarding/coach-panel';
import { CoachProvider } from '@/components/onboarding/coach-context';
import type { Role } from '@/lib/auth/identity';

/**
 * The roles, restated rather than imported — `@/lib/auth/identity` throws on import
 * under jsdom by design (it must never reach a browser bundle), so `ROLES` is not
 * reachable from this environment.
 *
 * A `Record<Role, …>` and not an array: an object literal typed this way must name
 * every member of the union, so adding a fourth role to `identity.ts` fails to
 * COMPILE here until someone decides whether it gets the panel. An array would have
 * silently kept passing while leaving the new role untested.
 */
const ROLE_CASES: Record<Role, true> = { student: true, counsellor: true, admin: true };
const ROLES = Object.keys(ROLE_CASES) as Role[];

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ refresh: jest.fn() })
}));

// A live POST endpoint in the real app. Nothing here should ever call it — the
// admin case asserts the button is absent — but a real import would drag in the
// Supabase server client and `next/headers`.
jest.mock('@/lib/onboarding/actions', () => ({
  resetOnboardingForTesting: jest.fn(async () => ({ success: true as const }))
}));

const RESET = /reset onboarding/i;
const RUN = /run tour/i;

const originalNodeEnv = process.env.NODE_ENV;

const setNodeEnv = (value: string) => {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true });
};

afterEach(() => {
  setNodeEnv(originalNodeEnv ?? 'test');
});

describe('resolveCoachPanelScope', () => {
  it('gives production admins the panel, in admin scope', () => {
    setNodeEnv('production');
    expect(resolveCoachPanelScope('admin')).toBe('admin');
  });

  it('gives every other production role nothing at all', () => {
    setNodeEnv('production');
    // Derived from ROLES rather than listed, so a new role added to the union is
    // denied by default here instead of being silently unconsidered.
    const nonAdmin = ROLES.filter((role) => role !== 'admin');
    expect(nonAdmin.length).toBeGreaterThan(0);
    nonAdmin.forEach((role) => {
      expect(resolveCoachPanelScope(role)).toBeNull();
    });
  });

  it('gives everyone the dev panel outside production', () => {
    setNodeEnv('development');
    ROLES.forEach((role) => {
      expect(resolveCoachPanelScope(role)).toBe('development');
    });
  });

  it('treats an unrecognised NODE_ENV as non-production rather than as production', () => {
    // Fails OPEN deliberately: the cost of a stray panel in a preview build is a
    // visible chip, whereas failing closed would mean a build with an unexpected
    // NODE_ENV silently loses the control this feature exists to provide.
    setNodeEnv('preview');
    expect(resolveCoachPanelScope('student')).toBe('development');
  });
});

describe('CoachPanel', () => {
  const openPanel = (scope: 'development' | 'admin') => {
    render(
      <CoachProvider>
        <CoachPanel scope={scope} />
      </CoachProvider>
    );
    // Collapsed by default — the chip is the only thing on screen until clicked.
    fireEvent.click(screen.getByRole('button', { expanded: false }));
  };

  it('offers an admin the replay controls but no reset', () => {
    openPanel('admin');
    expect(screen.getByRole('button', { name: RUN })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RESET })).not.toBeInTheDocument();
    expect(screen.getByText(/coach · admin/i)).toBeInTheDocument();
  });

  it('offers reset in development', () => {
    openPanel('development');
    expect(screen.getByRole('button', { name: RUN })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RESET })).toBeInTheDocument();
    expect(screen.getByText(/coach · dev only/i)).toBeInTheDocument();
  });

  it('renders nothing without a CoachProvider', () => {
    // Seven `loading.tsx` files and one client page render the shell without the
    // provider; `useCoach` returns null there rather than throwing, and this panel
    // must take that path instead of crashing the surface.
    const { container } = render(<CoachPanel scope="development" />);
    expect(container).toBeEmptyDOMElement();
  });
});

// A type-level assertion, not a runtime one: `resolveCoachPanelScope` must keep
// accepting the full `Role` union, so widening it in identity.ts fails here.
const _acceptsEveryRole: (role: Role) => unknown = resolveCoachPanelScope;
void _acceptsEveryRole;
