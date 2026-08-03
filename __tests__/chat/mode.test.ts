/**
 * @jest-environment ./jest.environment-node.js
 *
 * `resolveChatMode` — the seam that decides which mode a caller is entitled to,
 * and therefore which prompt context and which tools they get.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Audit finding A1. The refactor made parent mode require an active
 * `guardian_link`, but `PARENT_PORTAL_OPEN_TO_ALL` still renders all six
 * `/parent/*` routes to everyone — so the assistant 403'd on every message for
 * any account without a link, which during development is most of them. It
 * worked on `origin/main`. **The assistant must not be stricter than the portal
 * it lives in.**
 *
 * The fix keys the link requirement off the same flag the portal uses, so the
 * two cannot drift. These tests pin both halves of that coupling, and pin the
 * counsellor limb as untouched — `canActAsCounsellor` was `Boolean(user)` on
 * `origin/main` (any signed-in user) and is now a real role check, which is a
 * tightening this file must not undo.
 */

import { resolveChatMode } from '@/lib/chat/mode';
import { canActAsCounsellor } from '@/lib/api/guards';
import { PARENT_PORTAL_OPEN_TO_ALL } from '@/lib/auth/policy';

jest.mock('@/lib/api/guards', () => ({ canActAsCounsellor: jest.fn() }));

const USER = { id: 'user-123' } as never;

/** Records every filter the guardian_links probe would apply, if it ran. */
let linkFilters: Array<[string, unknown]>;
let linkCount: number;

const client = () =>
  ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn((c1: string, v1: unknown) => {
          linkFilters.push([c1, v1]);
          return {
            eq: jest.fn((c2: string, v2: unknown) => {
              linkFilters.push([c2, v2]);
              return Promise.resolve({ count: linkCount, error: null });
            })
          };
        })
      }))
    }))
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  linkFilters = [];
  linkCount = 0;
  (canActAsCounsellor as jest.Mock).mockResolvedValue(false);
});

describe('parent mode tracks PARENT_PORTAL_OPEN_TO_ALL', () => {
  it('is granted without a guardian link while the portal is open to all', async () => {
    // The regression: this returned { ok: false } and the assistant 403'd.
    expect(PARENT_PORTAL_OPEN_TO_ALL).toBe(true);

    await expect(resolveChatMode(client(), USER, 'parent')).resolves.toEqual({
      ok: true,
      mode: 'parent'
    });
  });

  it('does not even probe guardian_links while the portal is open', async () => {
    await resolveChatMode(client(), USER, 'parent');

    // Not just a passing result — the short-circuit means no query at all.
    expect(linkFilters).toEqual([]);
  });

  it('grants parent mode to a user who DOES have a link, too', async () => {
    linkCount = 1;

    await expect(resolveChatMode(client(), USER, 'parent')).resolves.toEqual({
      ok: true,
      mode: 'parent'
    });
  });
});

describe('the counsellor limb is untouched', () => {
  it('refuses counsellor mode when canActAsCounsellor says no', async () => {
    await expect(resolveChatMode(client(), USER, 'counsellor')).resolves.toEqual({
      ok: false,
      reason: 'forbidden'
    });
  });

  it('grants counsellor mode when it says yes', async () => {
    (canActAsCounsellor as jest.Mock).mockResolvedValue(true);

    await expect(resolveChatMode(client(), USER, 'counsellor')).resolves.toEqual({
      ok: true,
      mode: 'counsellor'
    });
  });
});

describe('an unrecognised mode falls back to the least-privileged one', () => {
  it.each([['admin'], ['superuser'], [''], [null], [undefined], [42]])(
    '%p resolves to student',
    async (raw) => {
      await expect(resolveChatMode(client(), USER, raw)).resolves.toEqual({
        ok: true,
        mode: 'student'
      });
    }
  );
});
