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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoachPanel } from '@/components/onboarding/coach-panel';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';
import { resolveCoachPanelScope } from '@/lib/onboarding/coach-scope';
import { CoachProvider } from '@/components/onboarding/coach-context';
import type { Role } from '@/lib/auth/identity';

/**
 * Set per case by the mount tests at the bottom. `mock`-prefixed so
 * babel-plugin-jest-hoist allows the hoisted factory below to close over it.
 */
let mockRole: Role = 'student';

// `@/lib/auth/identity` throws on import under jsdom by design — it must never
// reach a browser bundle — so the mount's dependency on it has to be mocked, not
// merely stubbed at the call site.
jest.mock('@/lib/auth/identity', () => ({
  getIdentity: async () => ({ userId: 'u1', email: 'a@b.c', role: mockRole })
}));
jest.mock('@/lib/onboarding/read', () => ({ getOnboardingState: async () => ({}) }));
// The coach schedules timers and measures rects, neither of which this file is
// about. `resetCoachSession` lives in the same module and the panel imports it.
jest.mock('@/components/onboarding/ascendi-coach', () => ({
  AscendiCoach: () => <div data-testid="coach" />,
  resetCoachSession: jest.fn()
}));

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
    // A defensive default, NOT a supported mode — `next build`, `next start` and
    // Vercel preview deployments all set `production`, so there is no real
    // deployment path here. Pinned only so the comparison stays `!== 'production'`
    // (a whitelist of `=== 'development'` would silently drop the dev panel under
    // `NODE_ENV=test`, which is how this suite itself runs).
    setNodeEnv('preview');
    expect(resolveCoachPanelScope('student')).toBe('development');
  });

  it('lives in a module the server is allowed to call', () => {
    // THE REGRESSION THIS FILE EXISTS FOR, second only to the student case.
    //
    // The resolver first shipped as an export of `coach-panel.tsx`, which is
    // `'use client'`. Next's flight loader rewrites every named export of a client
    // module into a throwing `registerClientReference` stub for the server graph,
    // so `ascendi-coach-mount.tsx` — a server component — called the stub and threw
    // on every render, taking out all ten coach-mounting routes.
    //
    // Nothing in the normal toolchain sees it: `tsc` does not model the RSC
    // boundary, Jest imports the module as plain code under jsdom, and `next build`
    // compiles without executing a dynamic route. Only loading a page catches it.
    // So the invariant is asserted structurally instead — the module the server
    // imports must not carry the directive.
    const source = readFileSync(join(process.cwd(), 'src/lib/onboarding/coach-scope.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);

    // And the mount must import it from there, not from the client component.
    const mount = readFileSync(
      join(process.cwd(), 'src/components/onboarding/ascendi-coach-mount.tsx'),
      'utf8'
    );
    expect(mount).toMatch(/import \{ resolveCoachPanelScope \} from '@\/lib\/onboarding\/coach-scope'/);
    expect(mount).not.toMatch(/resolveCoachPanelScope[^\n]*from '\.\/coach-panel'/);
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

  it('puts the trigger before the panel it reveals, and points at it', () => {
    // Source order is the tab order. With the panel first, opening it by keyboard
    // then tabbed straight PAST its three buttons — reachable only backwards. A
    // localhost-only chip could carry that; an admin control on the live site
    // should not. `flex-col-reverse` keeps the paint order while fixing the DOM.
    openPanel('admin');
    const trigger = screen.getByRole('button', { expanded: true });
    const panelId = trigger.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING: the panel comes after the trigger in the DOM.
    expect(trigger.compareDocumentPosition(panel as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And the controls live inside the element the trigger names.
    expect(panel).toContainElement(screen.getByRole('button', { name: RUN }));
  });

  it('renders nothing without a CoachProvider', () => {
    // Seven `loading.tsx` files and one client page render the shell without the
    // provider; `useCoach` returns null there rather than throwing, and this panel
    // must take that path instead of crashing the surface.
    const { container } = render(<CoachPanel scope="development" />);
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * The seam the unit tests above cannot see.
 *
 * Every case so far renders `CoachPanel` directly with a scope handed to it — which
 * says nothing about whether the mount computes that scope correctly, and the mount
 * is where the first cut of this feature was broken. `getIdentity` is mocked because
 * `@/lib/auth/identity` throws on import under jsdom by design.
 */
describe('AscendiCoachMount', () => {
  const CHIP = /^coach$/i;

  /**
   * `mockRole` is set per case and read by the hoisted factory at the top of this
   * file. Deliberately NOT `jest.resetModules()` + dynamic `import()`: that gives
   * the freshly-loaded tree its own copy of `react`, whose hook dispatcher is null
   * under the `react-dom` that RTL already booted — the failure surfaces as
   * `Cannot read properties of null (reading 'useContext')` inside `useCoach`,
   * nowhere near the cause. One registry, one React, a mutable variable.
   */
  const mountFor = async (role: Role) => {
    mockRole = role;
    const tree = await AscendiCoachMount();
    render(<CoachProvider>{tree}</CoachProvider>);
  };

  it('gives a production admin the chip', async () => {
    setNodeEnv('production');
    await mountFor('admin');
    expect(screen.getByRole('button', { name: CHIP })).toBeInTheDocument();
  });

  it('gives a production student no chip at all', async () => {
    // The safety property, asserted where it is actually decided. A student's HTML
    // must not contain the panel — not "contains it, hidden".
    setNodeEnv('production');
    await mountFor('student');
    expect(screen.queryByRole('button', { name: CHIP })).not.toBeInTheDocument();
    // The coach itself still mounts; only the panel is withheld.
    expect(screen.getByTestId('coach')).toBeInTheDocument();
  });

  it('gives a student the chip in development', async () => {
    setNodeEnv('development');
    await mountFor('student');
    expect(screen.getByRole('button', { name: CHIP })).toBeInTheDocument();
  });
});

// A type-level assertion, not a runtime one: `resolveCoachPanelScope` must keep
// accepting the full `Role` union, so widening it in identity.ts fails here.
const _acceptsEveryRole: (role: Role) => unknown = resolveCoachPanelScope;
void _acceptsEveryRole;
