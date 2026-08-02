/**
 * @jest-environment ./jest.environment-node.js
 *
 * POST /api/parent/messages — the guardian-link scope check.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `guardian_links` is the ONLY thing scoping the parent portal.
 * `src/lib/auth/policy.ts` says so in as many words: `PARENT_PORTAL_OPEN_TO_ALL`
 * is `true`, justified on the grounds that the portal's DATA is genuinely
 * scoped. RLS on `parent_messages`/`parent_contacts` is currently the
 * counsellor-open policy (any authenticated session), so the app-layer check in
 * this handler is the enforcement that matters.
 *
 * It had no test. Reducing
 *   `if (!contact || !linkedChildIds.includes(contact.student_profile_id))`
 * to `if (!contact)` — any signed-in user who knows a `parent_contacts.id` can
 * post into that family's counsellor thread — left the whole suite green.
 *
 * The tests below assert the 403 AND that nothing was written, because a handler
 * that inserts and then refuses is not a handler that refused.
 */

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn()
}));

jest.mock('@/features/parent', () => ({
  resolveLinkedChildIds: jest.fn()
}));

import { POST } from '@/app/api/parent/messages/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { resolveLinkedChildIds } from '@/features/parent';

const req = (body: unknown) =>
  new Request('http://localhost/api/parent/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as never;

type Written = { table: string; op: 'insert' | 'update'; payload: unknown };

/**
 * A supabase double recording every write, plus the `parent_contacts` lookup.
 *
 * `contact` is what the contactId resolves to; `null` means "no such row".
 */
const client = (
  opts: {
    user?: { id: string } | null;
    contact?: { id: string; student_profile_id: string } | null;
    contactError?: unknown;
    insertError?: unknown;
    updateError?: unknown;
  } = {}
) => {
  const { user = { id: 'parent-1' }, contact = { id: 'contact-1', student_profile_id: 'kid-1' } } = opts;
  const writes: Written[] = [];
  const lookups: Array<[string, unknown]> = [];

  const from = jest.fn((table: string) => ({
    select: jest.fn(() => ({
      eq: jest.fn((column: string, value: unknown) => {
        lookups.push([column, value]);
        return {
          maybeSingle: jest.fn().mockResolvedValue(
            opts.contactError ? { data: null, error: opts.contactError } : { data: contact, error: null }
          )
        };
      })
    })),
    insert: jest.fn((payload: unknown) => {
      writes.push({ table, op: 'insert', payload });
      return {
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue(
            opts.insertError
              ? { data: null, error: opts.insertError }
              : {
                  data: {
                    id: 'msg-1',
                    contact_id: 'contact-1',
                    sender: 'parent',
                    body: 'hello',
                    template: null,
                    read_at: null,
                    created_at: '2026-08-02T00:00:00.000Z'
                  },
                  error: null
                }
          )
        }))
      };
    }),
    update: jest.fn((payload: unknown) => {
      writes.push({ table, op: 'update', payload });
      return {
        eq: jest.fn((column: string, value: unknown) => {
          lookups.push([column, value]);
          return Promise.resolve({ error: opts.updateError ?? null });
        })
      };
    })
  }));

  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from,
    __writes: writes,
    __lookups: lookups
  };
};

const use = (c: ReturnType<typeof client>) => {
  (createRouteHandlerSupabaseClient as jest.Mock).mockResolvedValue(c);
  return c;
};

const VALID = { contactId: 'contact-1', body: 'hello' };

beforeEach(() => {
  jest.clearAllMocks();
  (resolveLinkedChildIds as jest.Mock).mockResolvedValue(['kid-1']);
});

describe('POST /api/parent/messages — the guardian_links check', () => {
  it('403s and writes NOTHING when the contact belongs to a child the caller is not linked to', async () => {
    // The attack: a signed-in user who knows (or guesses) a parent_contacts.id
    // for someone else's family.
    const c = use(client({ contact: { id: 'contact-1', student_profile_id: 'someone-elses-kid' } }));
    (resolveLinkedChildIds as jest.Mock).mockResolvedValue(['kid-1']);

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(c.__writes).toEqual([]);
  });

  it('403s and writes NOTHING when the caller has no linked children at all', async () => {
    const c = use(client());
    (resolveLinkedChildIds as jest.Mock).mockResolvedValue([]);

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(403);
    expect(c.__writes).toEqual([]);
  });

  it('403s and writes NOTHING when the contact id does not exist', async () => {
    const c = use(client({ contact: null }));

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(403);
    expect(c.__writes).toEqual([]);
  });

  it('scopes the linked-children lookup to the CALLER, and the contact lookup to the requested id', async () => {
    const c = use(client());

    await POST(req(VALID) as never);

    expect(resolveLinkedChildIds).toHaveBeenCalledWith(expect.anything(), 'parent-1');
    // The contact lookup, then the status update — both keyed by the same id.
    expect(c.__lookups).toEqual([['id', 'contact-1'], ['id', 'contact-1']]);
  });

  it('accepts a message for a genuinely linked child, and flags the thread', async () => {
    const c = use(client());

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: {
        id: 'msg-1',
        sender: 'parent',
        content: 'hello',
        template: null,
        read: false,
        date: '2026-08-02T00:00:00.000Z'
      }
    });
    expect(c.__writes.map((w) => [w.table, w.op])).toEqual([
      ['parent_messages', 'insert'],
      ['parent_contacts', 'update']
    ]);
    expect(c.__writes[0].payload).toMatchObject({
      contact_id: 'contact-1',
      sender: 'parent',
      body: 'hello'
    });
    expect(c.__writes[1].payload).toMatchObject({ status: 'needs-response' });
  });
});

describe('POST /api/parent/messages — auth, payload and failure dispositions', () => {
  it('401s an anonymous caller before anything else runs', async () => {
    const c = use(client({ user: null }));

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(401);
    expect(resolveLinkedChildIds).not.toHaveBeenCalled();
    expect(c.__writes).toEqual([]);
  });

  it.each([
    ['missing contactId', { body: 'hello' }],
    ['missing body', { contactId: 'contact-1' }],
    ['whitespace-only body', { contactId: 'contact-1', body: '   ' }]
  ])('400s on %s', async (_label, payload) => {
    const c = use(client());

    const res = await POST(req(payload) as never);

    expect(res.status).toBe(400);
    expect(c.__writes).toEqual([]);
  });

  it('400s an oversized body or template rather than storing it', async () => {
    const c = use(client());

    expect((await POST(req({ contactId: 'c', body: 'x'.repeat(4001) }) as never)).status).toBe(400);
    expect(
      (await POST(req({ contactId: 'c', body: 'ok', template: 't'.repeat(101) }) as never)).status
    ).toBe(400);
    expect(c.__writes).toEqual([]);
  });

  it('400s — and does not 403 — when the contact lookup itself errors', async () => {
    // Distinguishing "you may not" from "we could not check" matters here for
    // the same reason it does in the admin guard: both deny, only one is a bug
    // report. Either way, nothing is written.
    const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
    const c = use(client({ contactError: { message: 'permission denied' } }));

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(400);
    expect(c.__writes).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('500s when the message lands but the thread state does not — never a clean 200', async () => {
    const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
    use(client({ updateError: { message: 'update failed' } }));

    const res = await POST(req(VALID) as never);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('could not be updated');
    warn.mockRestore();
  });
});
