/** @jest-environment ./jest.environment-node.js */
/**
 * `lib/counsellor/decks.ts` — counsellor-built programme "decks" and their
 * assignments to students.
 *
 * Two things in here are worth a test rather than a read-through:
 *
 *   * **`assignDeck` must be idempotent.** Assigning a deck fires the
 *     `trg_deck_assignment_notify` SECURITY DEFINER trigger, which writes a
 *     notification into the student's feed. Re-assigning a deck the student
 *     already has must insert nothing — otherwise a counsellor tidying up their
 *     decks spams every student, and the notification-injection surface the
 *     audit flagged (SYNTHESIS §3.4) reopens through sheer volume.
 *   * **`upsertDeckCard` computes a position by read-then-write.** Getting
 *     "append" wrong reshuffles a deck the counsellor has already ordered;
 *     getting "re-upsert" wrong moves an edited card to the end.
 *
 * The route guard is here too: it is the 401/403 envelope every deck route
 * shares, and the deck-assign route was one of the eight authorisation holes.
 */

import {
  assignDeck,
  createDeck,
  deleteDeck,
  loadDecks,
  loadStudentQuestDecks,
  removeDeckCard,
  requireCounsellor,
  unassignDeck,
  upsertDeckCard,
} from '@/lib/counsellor/decks';
import { DataError } from '@/lib/data/errors';
import { resetLogSink, setLogSink } from '@/lib/observability/logger';

/* ── the Supabase double ─────────────────────────────────────────────────── */

interface Call {
  table: string;
  ops: Array<{ name: string; args: any[] }>;
}

let calls: Call[] = [];
let respond: (call: Call) => Promise<{ data: any; error: any }>;
let authUser: { id: string; email?: string } | null;

type Client = Parameters<typeof loadDecks>[0];

const makeClient = (): Client =>
  ({
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, any> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'upsert', 'delete', 'not']) {
        builder[method] = (...args: any[]) => {
          call.ops.push({ name: method, args });
          return builder;
        };
      }
      builder.single = () => {
        call.ops.push({ name: 'single', args: [] });
        return respond(call);
      };
      builder.maybeSingle = () => {
        call.ops.push({ name: 'maybeSingle', args: [] });
        return respond(call);
      };
      builder.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
        respond(call).then(resolve, reject);
      return builder;
    },
    auth: { getUser: async () => ({ data: { user: authUser } }) },
  }) as unknown as Client;

/** Table-backed responder: reads filter, writes echo their payload. */
const serve =
  (tables: Record<string, any[]>) =>
  async (call: Call): Promise<{ data: any; error: any }> => {
    const single = call.ops.some((o) => o.name === 'single' || o.name === 'maybeSingle');
    const write = call.ops.find((o) => o.name === 'insert' || o.name === 'upsert');
    if (write) {
      const payload = write.args[0];
      const rows = (Array.isArray(payload) ? payload : [payload]).map((r: any, i: number) => ({
        id: `new-${i}`,
        created_at: '2026-08-01T00:00:00.000Z',
        ...r,
      }));
      return { data: single ? rows[0] : rows, error: null };
    }
    if (call.ops.some((o) => o.name === 'delete')) return { data: null, error: null };
    let rows = [...(tables[call.table] ?? [])];
    for (const { name, args } of call.ops) {
      if (name === 'eq') rows = rows.filter((r) => r[args[0]] === args[1]);
      else if (name === 'in') rows = rows.filter((r) => (args[1] as unknown[]).includes(r[args[0]]));
    }
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  };

const argsOf = (call: Call, name: string) => call.ops.filter((o) => o.name === name).map((o) => o.args);
const callsTo = (table: string) => calls.filter((c) => c.table === table);

const COUNSELLOR = 'c0000000-0000-0000-0000-000000000000';
const STUDENT_A = 'a0000000-0000-0000-0000-000000000000';
const STUDENT_B = 'b0000000-0000-0000-0000-000000000000';
const DECK = 'd0000000-0000-0000-0000-000000000000';

beforeEach(() => {
  calls = [];
  authUser = { id: COUNSELLOR, email: 'c@example.com' };
  respond = serve({});
  setLogSink(() => {});
});
afterEach(() => resetLogSink());

/* ═══════════════════════════════════════════════════════════════════════════
 * assignDeck — idempotency, because assignment has a side effect
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('assignDeck', () => {
  it('inserts only the students who do not already have the deck', async () => {
    respond = serve({ deck_assignments: [{ deck_id: DECK, student_profile_id: STUDENT_A }] });
    const result = await assignDeck(makeClient(), DECK, [STUDENT_A, STUDENT_B], COUNSELLOR, 'go get em');

    expect(result.error).toBeNull();
    expect(result.skipped).toBe(1);
    const insert = argsOf(callsTo('deck_assignments')[1], 'insert')[0][0];
    expect(insert).toEqual([
      { deck_id: DECK, student_profile_id: STUDENT_B, assigned_by: COUNSELLOR, message: 'go get em' },
    ]);
    expect(result.assignments).toHaveLength(1);
  });

  it('writes nothing at all when every student already has the deck', async () => {
    // The insert would re-fire trg_deck_assignment_notify and push a duplicate
    // notification into each student's feed.
    respond = serve({
      deck_assignments: [
        { deck_id: DECK, student_profile_id: STUDENT_A },
        { deck_id: DECK, student_profile_id: STUDENT_B },
      ],
    });
    const result = await assignDeck(makeClient(), DECK, [STUDENT_A, STUDENT_B], COUNSELLOR, null);

    expect(result.assignments).toEqual([]);
    expect(result.skipped).toBe(2);
    expect(callsTo('deck_assignments')).toHaveLength(1); // the read, and nothing else
  });

  it('dedupes repeated ids in one request', async () => {
    respond = serve({ deck_assignments: [] });
    await assignDeck(makeClient(), DECK, [STUDENT_A, STUDENT_A, STUDENT_B], COUNSELLOR, null);
    const insert = argsOf(callsTo('deck_assignments')[1], 'insert')[0][0];
    expect(insert.map((r: any) => r.student_profile_id)).toEqual([STUDENT_A, STUDENT_B]);
  });

  it('scopes the existing-assignment lookup to this deck and these students', async () => {
    respond = serve({ deck_assignments: [] });
    await assignDeck(makeClient(), DECK, [STUDENT_A], COUNSELLOR, null);
    const read = callsTo('deck_assignments')[0];
    expect(argsOf(read, 'eq')[0]).toEqual(['deck_id', DECK]);
    expect(argsOf(read, 'in')[0]).toEqual(['student_profile_id', [STUDENT_A]]);
  });

  it('reports a failed lookup instead of assigning everyone again', async () => {
    respond = async () => ({ data: null, error: { message: 'permission denied' } });
    const result = await assignDeck(makeClient(), DECK, [STUDENT_A], COUNSELLOR, null);
    expect(result.error).toEqual({ message: 'permission denied' });
    expect(result.assignments).toEqual([]);
    expect(calls).toHaveLength(1); // no insert followed
  });

  it('reports a failed insert without claiming the assignments landed', async () => {
    let n = 0;
    respond = async () => {
      n += 1;
      return n === 1 ? { data: [], error: null } : { data: null, error: { message: 'insert blocked' } };
    };
    const result = await assignDeck(makeClient(), DECK, [STUDENT_A], COUNSELLOR, null);
    expect(result.error).toEqual({ message: 'insert blocked' });
    expect(result.assignments).toEqual([]);
    expect(result.skipped).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * upsertDeckCard — the position read-then-write
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('upsertDeckCard', () => {
  const card = (program_id: string) => ({
    deck_id: DECK,
    program_id,
    rarity: 'rare' as const,
    fit: 'match' as const,
    note: null,
  });
  const upsertArgs = () => argsOf(callsTo('counsellor_deck_programs')[1], 'upsert')[0];

  it('appends the first card at position 0', async () => {
    respond = serve({ counsellor_deck_programs: [] });
    await upsertDeckCard(makeClient(), card('prog-1'));
    expect(upsertArgs()[0].position).toBe(0);
  });

  it('appends after the highest existing position, not after the count', async () => {
    // Positions go non-contiguous as soon as a card is removed; `length` would
    // then collide with a card that is still there.
    respond = serve({
      counsellor_deck_programs: [
        { deck_id: DECK, program_id: 'prog-1', position: 0 },
        { deck_id: DECK, program_id: 'prog-2', position: 5 },
      ],
    });
    await upsertDeckCard(makeClient(), card('prog-3'));
    expect(upsertArgs()[0].position).toBe(6);
  });

  it('keeps an existing card in its slot when it is edited', async () => {
    respond = serve({
      counsellor_deck_programs: [
        { deck_id: DECK, program_id: 'prog-1', position: 0 },
        { deck_id: DECK, program_id: 'prog-2', position: 1 },
      ],
    });
    await upsertDeckCard(makeClient(), { ...card('prog-1'), note: 'edited' });
    expect(upsertArgs()[0]).toMatchObject({ program_id: 'prog-1', position: 0, note: 'edited' });
  });

  it('reads positions for THIS deck only', async () => {
    respond = serve({
      counsellor_deck_programs: [{ deck_id: 'other-deck', program_id: 'prog-9', position: 42 }],
    });
    await upsertDeckCard(makeClient(), card('prog-1'));
    expect(argsOf(callsTo('counsellor_deck_programs')[0], 'eq')[0]).toEqual(['deck_id', DECK]);
    expect(upsertArgs()[0].position).toBe(0);
  });

  it('upserts on the (deck_id, program_id) pair so a re-add is not a duplicate row', async () => {
    respond = serve({ counsellor_deck_programs: [] });
    await upsertDeckCard(makeClient(), card('prog-1'));
    expect(upsertArgs()[1]).toEqual({ onConflict: 'deck_id,program_id' });
  });

  it('returns the position-read error without writing anything', async () => {
    let n = 0;
    respond = async () => {
      n += 1;
      return { data: null, error: { message: 'cannot read positions' } };
    };
    const result = await upsertDeckCard(makeClient(), card('prog-1'));
    expect(result.error).toEqual({ message: 'cannot read positions' });
    expect(result.data).toBeNull();
    expect(n).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * loadDecks / loadStudentQuestDecks
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('loadDecks', () => {
  const tables = {
    counsellor_decks: [
      { id: DECK, counsellor_id: COUNSELLOR, name: 'Russell Group', description: 'UK', theme: { hue: 'violet' }, created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'deck-2', counsellor_id: COUNSELLOR, name: 'Safety net', description: null, theme: null, created_at: '2026-06-01T00:00:00.000Z' },
    ],
    counsellor_deck_programs: [
      { id: 'card-1', deck_id: DECK, program_id: 'prog-1', rarity: 'legendary', fit: 'reach', note: 'dream', position: 0 },
      { id: 'card-2', deck_id: 'deck-2', program_id: 'prog-2', rarity: 'common', fit: 'safe', note: null, position: 0 },
    ],
    deck_assignments: [
      { id: 'asg-1', deck_id: DECK, student_profile_id: STUDENT_A, created_at: '2026-07-02T00:00:00.000Z', message: null },
    ],
    programs: [
      { id: 'prog-1', course_name: 'Computer Science', universities: { name: 'Imperial', country: 'UK' } },
    ],
    student_personal_information: [
      { profile_id: STUDENT_A, first_name: 'Ada', last_name: 'Lovelace', nationality: 'British', resident_country: 'UK' },
    ],
  };

  it('groups cards and assignees onto their own deck, never another', async () => {
    respond = serve(tables);
    const decks = await loadDecks(makeClient(), COUNSELLOR);

    expect(decks.map((d) => d.id)).toEqual([DECK, 'deck-2']);
    expect(decks[0].cards.map((c) => c.id)).toEqual(['card-1']);
    expect(decks[1].cards.map((c) => c.id)).toEqual(['card-2']);
    expect(decks[0].assignees.map((a) => a.profileId)).toEqual([STUDENT_A]);
    expect(decks[1].assignees).toEqual([]);
  });

  it('resolves programme and student labels, with placeholders when it cannot', async () => {
    respond = serve(tables);
    const decks = await loadDecks(makeClient(), COUNSELLOR);

    expect(decks[0].cards[0]).toMatchObject({
      courseName: 'Computer Science',
      university: 'Imperial',
      country: 'UK',
      rarity: 'legendary',
      fit: 'reach',
    });
    // prog-2 is not in the programs table — the card still renders.
    expect(decks[1].cards[0]).toMatchObject({ courseName: 'Programme', university: 'University', country: '' });
    expect(decks[0].assignees[0]).toMatchObject({ name: 'Ada Lovelace', flag: '🇬🇧', assignmentId: 'asg-1' });
  });

  it('normalises a null theme to an empty object rather than passing null on', async () => {
    respond = serve(tables);
    const decks = await loadDecks(makeClient(), COUNSELLOR);
    expect(decks[1].theme).toEqual({});
  });

  it('scopes to the signed-in counsellor', async () => {
    respond = serve(tables);
    await loadDecks(makeClient(), COUNSELLOR);
    expect(argsOf(callsTo('counsellor_decks')[0], 'eq')[0]).toEqual(['counsellor_id', COUNSELLOR]);
  });

  it('does no further work when the counsellor has no decks', async () => {
    respond = serve({ counsellor_decks: [] });
    expect(await loadDecks(makeClient(), COUNSELLOR)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('throws rather than rendering "no decks" when the read fails', async () => {
    respond = async () => ({ data: null, error: { message: 'permission denied', code: '42501' } });
    await expect(loadDecks(makeClient(), COUNSELLOR)).rejects.toBeInstanceOf(DataError);
    await expect(loadDecks(makeClient(), COUNSELLOR)).rejects.toMatchObject({ context: 'decks.list' });
  });
});

describe('loadStudentQuestDecks', () => {
  const tables = {
    deck_assignments: [
      { id: 'asg-1', deck_id: DECK, student_profile_id: STUDENT_A, message: 'have a go', created_at: '2026-07-02T00:00:00.000Z' },
      { id: 'asg-2', deck_id: 'deleted-deck', student_profile_id: STUDENT_A, message: null, created_at: '2026-07-01T00:00:00.000Z' },
    ],
    counsellor_decks: [{ id: DECK, name: 'Russell Group', theme: { hue: 'violet' } }],
    counsellor_deck_programs: [
      { id: 'card-1', deck_id: DECK, program_id: 'prog-applied', rarity: 'rare', fit: 'match', note: null, position: 0 },
      { id: 'card-2', deck_id: DECK, program_id: 'prog-untouched', rarity: 'common', fit: 'safe', note: null, position: 1 },
    ],
    applications: [{ profile_id: STUDENT_A, program_id: 'prog-applied' }],
    programs: [
      { id: 'prog-applied', course_name: 'CS', universities: { name: 'Imperial', country: 'UK' } },
      { id: 'prog-untouched', course_name: 'Maths', universities: { name: 'UCL', country: 'UK' } },
    ],
  };

  it('marks a quest cleared only when the student has actually applied', async () => {
    respond = serve(tables);
    const [deck] = await loadStudentQuestDecks(makeClient(), STUDENT_A);
    expect(deck.quests.map((q) => [q.programId, q.cleared])).toEqual([
      ['prog-applied', true],
      ['prog-untouched', false],
    ]);
    expect(deck.message).toBe('have a go');
  });

  it('drops an assignment whose deck no longer exists', async () => {
    // A deleted deck must not render as an untitled, empty quest log.
    respond = serve(tables);
    const decks = await loadStudentQuestDecks(makeClient(), STUDENT_A);
    expect(decks.map((d) => d.deckId)).toEqual([DECK]);
  });

  it('reads only this student’s applications', async () => {
    respond = serve(tables);
    await loadStudentQuestDecks(makeClient(), STUDENT_A);
    expect(argsOf(callsTo('applications')[0], 'eq')[0]).toEqual(['profile_id', STUDENT_A]);
  });

  it('does no further work when nothing is assigned', async () => {
    respond = serve({ deck_assignments: [] });
    expect(await loadStudentQuestDecks(makeClient(), STUDENT_B)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * The writes that only apply filters
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the destructive writes carry their own scope', () => {
  it('deleteDeck filters by owner as well as id', async () => {
    // RLS is the real enforcement; this is the defence-in-depth half, and it is
    // the half a refactor can delete without any test noticing.
    respond = serve({});
    await deleteDeck(makeClient(), DECK, COUNSELLOR);
    const call = callsTo('counsellor_decks')[0];
    expect(call.ops.some((o) => o.name === 'delete')).toBe(true);
    expect(argsOf(call, 'eq')).toEqual([
      ['id', DECK],
      ['counsellor_id', COUNSELLOR],
    ]);
  });

  it('removeDeckCard and unassignDeck delete by row id', async () => {
    respond = serve({});
    const client = makeClient();
    await removeDeckCard(client, 'card-1');
    await unassignDeck(client, 'asg-1');
    expect(argsOf(callsTo('counsellor_deck_programs')[0], 'eq')[0]).toEqual(['id', 'card-1']);
    expect(argsOf(callsTo('deck_assignments')[0], 'eq')[0]).toEqual(['id', 'asg-1']);
  });

  it('createDeck returns the row the route echoes back', async () => {
    respond = serve({});
    const { data, error } = await createDeck(makeClient(), {
      counsellor_id: COUNSELLOR,
      name: 'New deck',
      description: null,
      theme: {},
    } as any);
    expect(error).toBeNull();
    expect(data).toMatchObject({ name: 'New deck' });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * requireCounsellor — the shared 401/403 envelope
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('requireCounsellor', () => {
  it('401s a signed-out caller', async () => {
    authUser = null;
    respond = serve({});
    const result = await requireCounsellor(makeClient());
    expect(result.user).toBeNull();
    expect(result.errorResponse!.status).toBe(401);
    await expect(result.errorResponse!.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('403s a signed-in student', async () => {
    authUser = { id: STUDENT_A, email: 'ada+seed@ascenda.demo' };
    respond = serve({ profiles: [{ id: STUDENT_A, role: 'student' }] });
    const result = await requireCounsellor(makeClient());
    expect(result.user).toBeNull();
    expect(result.errorResponse!.status).toBe(403);
    await expect(result.errorResponse!.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('lets a counsellor through and hands back the user', async () => {
    respond = serve({ profiles: [{ id: COUNSELLOR, role: 'counsellor' }] });
    const result = await requireCounsellor(makeClient());
    expect(result.errorResponse).toBeNull();
    expect(result.user!.id).toBe(COUNSELLOR);
  });

  it('fails closed when the role lookup errors', async () => {
    respond = async () => ({ data: null, error: { message: 'rls' } });
    const result = await requireCounsellor(makeClient());
    expect(result.errorResponse!.status).toBe(403);
  });
});
