/**
 * @jest-environment ./jest.environment-node.js
 *
 * POST/DELETE /api/counsellor/decks/assign — the bulk subject scope.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This handler had no test. The surviving mutation is the nastiest shape in the
 * whole audit: `filterActionableStudentIds` is still CALLED — so the 403-on-null
 * branch still works and the code still reads correctly in review — but its
 * filtered result is discarded and the raw `studentIds` from the request body is
 * passed to `assignDeck`. The `outOfScope` arithmetic underneath then computes
 * `size - allowedStudentIds.length`, so a partially out-of-scope request reports
 * a clean success.
 *
 * It is a bulk write behind a SECURITY DEFINER notification trigger: every id
 * becomes a row in someone else's feed carrying caller-supplied `message` text.
 *
 * So the assertion that matters is not "the guard was called" — the mutation
 * keeps that true. It is "assignDeck received EXACTLY the allowed subset".
 */

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn()
}));

jest.mock('@/lib/api/guards', () => {
  const actual = jest.requireActual('@/lib/api/guards');
  return { ...actual, filterActionableStudentIds: jest.fn() };
});

jest.mock('@/lib/counsellor/decks', () => ({
  requireCounsellor: jest.fn(),
  assignDeck: jest.fn(),
  unassignDeck: jest.fn()
}));

import { NextResponse } from 'next/server';
import { DELETE, POST } from '@/app/api/counsellor/decks/assign/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { filterActionableStudentIds } from '@/lib/api/guards';
import { assignDeck, requireCounsellor, unassignDeck } from '@/lib/counsellor/decks';

const req = (body: unknown) =>
  new Request('http://localhost/api/counsellor/decks/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as never;

const del = (query: string) =>
  new Request(`http://localhost/api/counsellor/decks/assign${query}`, { method: 'DELETE' }) as never;

const VALID = { deckId: 'deck-1', studentIds: ['stu-1', 'stu-2'], message: 'Have a look' };

beforeEach(() => {
  jest.clearAllMocks();
  (createRouteHandlerSupabaseClient as jest.Mock).mockResolvedValue({});
  (requireCounsellor as jest.Mock).mockResolvedValue({ user: { id: 'c-1' }, errorResponse: null });
  (filterActionableStudentIds as jest.Mock).mockResolvedValue(['stu-1', 'stu-2']);
  (assignDeck as jest.Mock).mockResolvedValue({ assignments: [{ id: 'a-1' }], skipped: 0, error: null });
  (unassignDeck as jest.Mock).mockResolvedValue({ error: null });
});

describe('POST /api/counsellor/decks/assign — the bulk subject scope', () => {
  it('passes ONLY the allowed subset to assignDeck when the guard filters an id out', async () => {
    (filterActionableStudentIds as jest.Mock).mockResolvedValue(['stu-1']);

    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(assignDeck).toHaveBeenCalledTimes(1);
    const [, deckId, passedIds, assignedBy, message] = (assignDeck as jest.Mock).mock.calls[0];
    expect(passedIds).toEqual(['stu-1']);
    // Stated negatively too: the id the guard refused must not reach the write.
    expect(passedIds).not.toContain('stu-2');
    expect(deckId).toBe('deck-1');
    expect(assignedBy).toBe('c-1');
    expect(message).toBe('Have a look');
  });

  it('reports the filtered-out ids as skipped — a partial refusal is never a clean success', async () => {
    (filterActionableStudentIds as jest.Mock).mockResolvedValue(['stu-1']);
    (assignDeck as jest.Mock).mockResolvedValue({ assignments: [{ id: 'a-1' }], skipped: 0, error: null });

    const res = await POST(req({ ...VALID, studentIds: ['stu-1', 'stu-2', 'stu-3'] }));

    expect(await res.json()).toEqual({ assignments: [{ id: 'a-1' }], skipped: 2 });
  });

  it('403s and writes NOTHING when the caller is not a counsellor (guard returns null)', async () => {
    (filterActionableStudentIds as jest.Mock).mockResolvedValue(null);

    const res = await POST(req(VALID));

    expect(res.status).toBe(403);
    expect(assignDeck).not.toHaveBeenCalled();
  });

  it('400s and writes NOTHING when the guard allows none of the named students', async () => {
    (filterActionableStudentIds as jest.Mock).mockResolvedValue([]);

    const res = await POST(req(VALID));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No assignable students in request.' });
    expect(assignDeck).not.toHaveBeenCalled();
  });

  it('authorises the ids from the BODY against the CALLER', async () => {
    await POST(req({ ...VALID, studentIds: ['stu-7', 'stu-8'] }));

    expect(filterActionableStudentIds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'c-1' }),
      ['stu-7', 'stu-8']
    );
  });

  it('returns the counsellor guard response untouched when it refuses', async () => {
    (requireCounsellor as jest.Mock).mockResolvedValue({
      user: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    });

    const res = await POST(req(VALID));

    expect(res.status).toBe(401);
    expect(filterActionableStudentIds).not.toHaveBeenCalled();
    expect(assignDeck).not.toHaveBeenCalled();
  });
});

describe('POST /api/counsellor/decks/assign — payload limits', () => {
  it.each([
    ['missing deckId', { studentIds: ['s'] }],
    ['empty studentIds', { deckId: 'd', studentIds: [] }],
    ['studentIds not an array', { deckId: 'd', studentIds: 'stu-1' }],
    ['a non-string id in the list', { deckId: 'd', studentIds: ['stu-1', 42] }]
  ])('400s on %s, before authorising or writing', async (_label, payload) => {
    const res = await POST(req(payload));

    expect(res.status).toBe(400);
    expect(filterActionableStudentIds).not.toHaveBeenCalled();
    expect(assignDeck).not.toHaveBeenCalled();
  });

  it('caps the fan-out at 200 students — the bound is enforced, not just documented', async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `stu-${i}`);

    expect((await POST(req({ deckId: 'd', studentIds: ids(201) }))).status).toBe(400);
    expect(assignDeck).not.toHaveBeenCalled();

    (filterActionableStudentIds as jest.Mock).mockResolvedValue(ids(200));
    expect((await POST(req({ deckId: 'd', studentIds: ids(200) }))).status).toBe(200);
  });

  it('400s a message longer than the notification body allows', async () => {
    const res = await POST(req({ ...VALID, message: 'm'.repeat(1001) }));

    expect(res.status).toBe(400);
    expect(assignDeck).not.toHaveBeenCalled();
  });

  it('400s when assignDeck itself fails, without leaking the driver message', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    (assignDeck as jest.Mock).mockResolvedValue({
      assignments: [],
      skipped: 0,
      error: { message: 'insert or update on table "deck_assignments" violates foreign key constraint' }
    });

    const res = await POST(req(VALID));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Could not assign deck.' });
    err.mockRestore();
  });
});

describe('DELETE /api/counsellor/decks/assign', () => {
  it('requires a counsellor before unassigning anything', async () => {
    (requireCounsellor as jest.Mock).mockResolvedValue({
      user: null,
      errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    });

    expect((await DELETE(del('?id=a-1'))).status).toBe(403);
    expect(unassignDeck).not.toHaveBeenCalled();
  });

  it('400s without an id, and unassigns with one', async () => {
    expect((await DELETE(del(''))).status).toBe(400);
    expect(unassignDeck).not.toHaveBeenCalled();

    const res = await DELETE(del('?id=a-1'));
    expect(res.status).toBe(200);
    expect(unassignDeck).toHaveBeenCalledWith(expect.anything(), 'a-1');
  });
});
