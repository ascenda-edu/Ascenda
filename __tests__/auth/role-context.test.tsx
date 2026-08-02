import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const getUser = jest.fn();
const single = jest.fn();
const getBrowserSupabaseClient = jest.fn();

/**
 * The double records `.select()` columns and `.eq()` arguments.
 *
 * It used to be `from: () => ({ select: () => ({ eq: () => ({ single }) }) })`
 * — arguments thrown away — and nothing here asserted them. The same hole in
 * the sibling suite let `.eq('id', user.id) → .eq('role', user.id)` survive the
 * entire 1,069-test run on the module that resolves who the user is. The
 * fallback path below writes the same query in the browser, so it gets the same
 * treatment: record `[method, column, value]`, assert WHICH COLUMN.
 */
type Filter = [method: 'eq', column: string, value: unknown];
interface RecordedQuery {
  table: string;
  select: string;
  filters: Filter[];
}
const queries: RecordedQuery[] = [];

jest.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => getBrowserSupabaseClient()
}));

import {
  LOCAL_ROLE_KEY,
  RoleProvider,
  SESSION_ROLE_KEY,
  useRole
} from '@/lib/auth/role-context';

const RoleProbe = () => <span data-testid="role">{String(useRole())}</span>;

const withProvider = (role: string | null | undefined) => (
  <RoleProvider role={role}>
    <RoleProbe />
  </RoleProvider>
);

const readRole = () => screen.getByTestId('role').textContent;

beforeEach(() => {
  jest.clearAllMocks();
  queries.length = 0;
  window.sessionStorage.clear();
  window.localStorage.clear();
  getBrowserSupabaseClient.mockReturnValue({
    auth: { getUser },
    from: (table: string) => {
      const record: RecordedQuery = { table, select: '', filters: [] };
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
        single
      };
      return builder;
    }
  });
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
  single.mockResolvedValue({ data: { role: 'student' } });
});

describe('server-resolved role', () => {
  it('is used as-is, with no browser round trip', async () => {
    render(withProvider('admin'));

    expect(readRole()).toBe('admin');
    await waitFor(() => expect(readRole()).toBe('admin'));
    expect(getBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('is correct on the FIRST render — no null flash before an effect lands', () => {
    render(withProvider('counsellor'));
    // Asserted synchronously, before any effect could have run.
    expect(readRole()).toBe('counsellor');
  });

  it('an anonymous request (role=null) resolves to null without a lookup', async () => {
    render(withProvider(null));

    await waitFor(() => expect(readRole()).toBe('null'));
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe('the demo role switcher still wins', () => {
  it('sessionStorage overrides the server role for nav', async () => {
    // What /role-select and SideSwitcher write.
    window.sessionStorage.setItem(SESSION_ROLE_KEY, 'counsellor');

    render(withProvider('student'));

    await waitFor(() => expect(readRole()).toBe('counsellor'));
    // Still no network: the override short-circuits before the fallback.
    expect(getUser).not.toHaveBeenCalled();
  });

  it('overrides an admin server role too, so the switched side stays switched', async () => {
    window.sessionStorage.setItem(SESSION_ROLE_KEY, 'parent');

    render(withProvider('admin'));

    await waitFor(() => expect(readRole()).toBe('parent'));
  });

  it('is ignored once cleared, falling back to the server role', async () => {
    // This test used to be byte-identical to `'is used as-is'` — it never set
    // the override it claimed to clear, so the name promised a path it did not
    // drive and it would have passed with the override handling deleted. Now it
    // actually walks the transition.
    window.sessionStorage.setItem(SESSION_ROLE_KEY, 'counsellor');
    const { rerender } = render(withProvider('student'));
    await waitFor(() => expect(readRole()).toBe('counsellor'));

    window.sessionStorage.removeItem(SESSION_ROLE_KEY);
    // The effect is keyed on the server role, so changing it re-runs the
    // precedence chain — the same thing a navigation does after /role-select
    // clears the override.
    rerender(withProvider('admin'));

    await waitFor(() => expect(readRole()).toBe('admin'));
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe('fallback when no RoleProvider supplies a role', () => {
  const renderBare = (children: ReactNode) => render(<>{children}</>);

  it('derives the role in the browser (the pre-refactor behaviour)', async () => {
    renderBare(<RoleProbe />);

    await waitFor(() => expect(readRole()).toBe('student'));
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('reads the CALLER row: profiles.role WHERE id = the signed-in user', async () => {
    // The fallback re-derives the role in the browser. If it filtered on the
    // wrong column it would hand whatever row came back to `setRole` — which is
    // how a nav that says "Admin" appears for someone who is not one.
    getUser.mockResolvedValue({ data: { user: { id: 'u-99' } } });

    renderBare(<RoleProbe />);
    await waitFor(() => expect(readRole()).toBe('student'));

    expect(queries).toEqual([{ table: 'profiles', select: 'role', filters: [['eq', 'id', 'u-99']] }]);
    expect(queries[0].filters.map(([, column]) => column)).not.toContain('role');
  });

  it('uses the localStorage cache first to avoid nav flicker', async () => {
    window.localStorage.setItem(LOCAL_ROLE_KEY, 'admin');
    single.mockResolvedValue({ data: { role: 'counsellor' } });

    renderBare(<RoleProbe />);

    // Cached value paints first, then the DB value replaces it.
    await waitFor(() => expect(readRole()).toBe('admin'));
    await waitFor(() => expect(readRole()).toBe('counsellor'));
  });

  it('resolves to null when the browser has no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    renderBare(<RoleProbe />);

    await waitFor(() => expect(readRole()).toBe('null'));
  });

  it('resolves to null rather than throwing when the lookup fails', async () => {
    getUser.mockRejectedValue(new Error('offline'));

    renderBare(<RoleProbe />);

    await waitFor(() => expect(readRole()).toBe('null'));
  });

  it('an explicit `undefined` role prop is treated as "not provided"', async () => {
    render(withProvider(undefined));

    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
  });
});

describe('the localStorage mirror', () => {
  it('is written from the server role so the fallback path stays warm', async () => {
    render(withProvider('counsellor'));

    await waitFor(() => expect(window.localStorage.getItem(LOCAL_ROLE_KEY)).toBe('counsellor'));
  });

  it('is cleared when the role resolves to null', async () => {
    window.localStorage.setItem(LOCAL_ROLE_KEY, 'admin');

    render(withProvider(null));

    await waitFor(() => expect(window.localStorage.getItem(LOCAL_ROLE_KEY)).toBeNull());
  });
});
