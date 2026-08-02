/**
 * @jest-environment ./jest.environment-node.js
 *
 * POST /api/counsellor/notes — the per-student scope check.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `grep -rl "counsellor/notes" __tests__/` used to return nothing but an SQL
 * fixture: the handler had no test at all. Replacing `if (!scope.ok)` with
 * `if (false)` — any caller who clears the counsellor guard writes a permanent
 * note onto ANY profile, which `counsellor_notes_select` then makes readable —
 * left 247 counsellor tests green.
 *
 * `studentId` arrives in the request body, and RLS (`counsellor_notes_insert`)
 * constrains only `author_profile_id = auth.uid()` — never the SUBJECT of the
 * note. `assertCounsellorMayActOnStudent` is the whole control.
 *
 * Modelled on `__tests__/checklist/route.test.ts`, the one route handler in the
 * repo whose authorization was already tested this way.
 */

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn()
}));

jest.mock('@/lib/api/guards', () => {
  const actual = jest.requireActual('@/lib/api/guards');
  return { ...actual, assertCounsellorMayActOnStudent: jest.fn() };
});

import { POST } from '@/app/api/counsellor/notes/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { assertCounsellorMayActOnStudent } from '@/lib/api/guards';

const req = (body: unknown) =>
  new Request('http://localhost/api/counsellor/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as never;

const client = (user: { id: string } | null = { id: 'c-1' }, insertError: unknown = null) => {
  const inserts: unknown[] = [];
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from: jest.fn(() => ({
      insert: jest.fn((payload: unknown) => {
        inserts.push(payload);
        return {
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue(
              insertError
                ? { data: null, error: insertError }
                : {
                    data: { id: 'note-1', body: 'A note', note_type: 'session', created_at: '2026-08-02' },
                    error: null
                  }
            )
          }))
        };
      })
    })),
    __inserts: inserts
  };
};

const use = (c: ReturnType<typeof client>) => {
  (createRouteHandlerSupabaseClient as jest.Mock).mockResolvedValue(c);
  return c;
};

const VALID = { studentId: 'stu-1', body: 'A note', noteType: 'session' };

beforeEach(() => {
  jest.clearAllMocks();
  (assertCounsellorMayActOnStudent as jest.Mock).mockResolvedValue({ ok: true });
});

describe('POST /api/counsellor/notes — authorization', () => {
  it('401s an anonymous caller, and never reaches the scope check', async () => {
    const c = use(client(null));

    const res = await POST(req(VALID));

    expect(res.status).toBe(401);
    expect(assertCounsellorMayActOnStudent).not.toHaveBeenCalled();
    expect(c.__inserts).toEqual([]);
  });

  it('403s and writes NOTHING when the caller may not act on this student', async () => {
    const c = use(client());
    (assertCounsellorMayActOnStudent as jest.Mock).mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await POST(req(VALID));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(c.__inserts).toEqual([]);
  });

  it('404s (not 403) on an unknown subject, so the route cannot enumerate profile ids', async () => {
    const c = use(client());
    (assertCounsellorMayActOnStudent as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await POST(req(VALID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(c.__inserts).toEqual([]);
  });

  it('authorises the CALLER against the student id from the BODY — not some other pair', async () => {
    use(client({ id: 'c-9' }));

    await POST(req({ ...VALID, studentId: 'stu-7' }));

    expect(assertCounsellorMayActOnStudent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'c-9' }),
      'stu-7'
    );
  });

  it('writes the note against the authorised subject, authored by the caller', async () => {
    const c = use(client({ id: 'c-9' }));

    const res = await POST(req({ ...VALID, studentId: 'stu-7', body: '  A note  ' }));

    expect(res.status).toBe(200);
    expect(c.__inserts).toEqual([
      {
        student_profile_id: 'stu-7',
        author_profile_id: 'c-9',
        body: 'A note',
        note_type: 'session'
      }
    ]);
    expect(await res.json()).toEqual({
      note: { id: 'note-1', content: 'A note', type: 'session', date: '2026-08-02' }
    });
  });
});

describe('POST /api/counsellor/notes — payload', () => {
  it.each([
    ['missing studentId', { body: 'x', noteType: 'session' }],
    ['blank body', { studentId: 's', body: '   ', noteType: 'session' }],
    ['missing noteType', { studentId: 's', body: 'x' }],
    ['unknown noteType', { studentId: 's', body: 'x', noteType: 'escalation' }]
  ])('400s on %s, before authorising anything', async (_label, payload) => {
    const c = use(client());

    expect((await POST(req(payload))).status).toBe(400);
    expect(c.__inserts).toEqual([]);
  });

  it('400s an over-length note rather than storing megabytes', async () => {
    const c = use(client());

    const res = await POST(req({ ...VALID, body: 'x'.repeat(5001) }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('5000');
    expect(c.__inserts).toEqual([]);
  });

  it('does not leak the PostgREST message when the insert fails', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    use(client({ id: 'c-1' }, { message: 'new row violates row-level security policy for table "counsellor_notes"' }));

    const res = await POST(req(VALID));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Could not save note.' });
    err.mockRestore();
  });
});
