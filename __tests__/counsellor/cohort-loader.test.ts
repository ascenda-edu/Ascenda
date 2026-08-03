/** @jest-environment ./jest.environment-node.js */
/**
 * `lib/counsellor/data.ts` — the cohort pipeline.
 *
 * This module assembles the counsellor's entire view of real student data from
 * eleven tables, and three of its properties are load-bearing in ways that fail
 * silently rather than loudly:
 *
 *   1. **A failed query must throw, not return `[]`.** A dropped RLS policy, an
 *      expired session or a statement timeout would otherwise render as
 *      "0 students, all clear" — the single most dangerous screen this product
 *      can show a counsellor. `unwrap()` exists for exactly this, and there is
 *      no test that would notice if someone "simplified" it to `?? []`.
 *   2. **The cohort scope is a security boundary, not scaffolding.** Until a
 *      counsellor↔student assignment table exists, `inDemoCohort()` is the only
 *      thing keeping this a demo-data surface (see docs/audit/SYNTHESIS.md §3.3).
 *      It also has to run BEFORE the per-table fan-out, or the queries fetch PII
 *      for profiles that are about to be discarded.
 *   3. **Column lists are part of a query's meaning.** The roster's academic
 *      select is derived from `COMPLETION_COLUMNS`; the last time it was
 *      hand-written it omitted `english_status` and every student who answered
 *      "Not sure" to the English question read as incomplete.
 */

import {
  loadCohort,
  loadRoster,
  loadStudentById,
  loadOutcomes,
  loadCounsellorDocuments,
  loadStudentEvolution,
  resolvePrograms,
  nameMap,
} from '@/lib/counsellor/data';
import { COMPLETION_COLUMNS } from '@/lib/profile/completion';
import { DataError } from '@/lib/data/errors';
import { resetLogSink, setLogSink, type LogEntry } from '@/lib/observability/logger';

/* ── the Supabase double ─────────────────────────────────────────────────────
 * A chainable, awaitable builder that actually honours `eq` / `in` / `order` /
 * `limit`, because the loader fans out one `student_matches` query per student
 * and flat-maps the results: a double that ignored `.eq()` would attribute every
 * student's matches to every other student and hide the bug it exists to catch.
 */

interface Call {
  table: string;
  select: string;
  ops: Array<{ name: string; args: any[] }>;
}

type Tables = Record<string, any[]>;
type Failure = { message: string; code?: string };

const makeSupabase = (tables: Tables, failures: Record<string, Failure> = {}) => {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, select: '', ops: [] };
      calls.push(call);
      const builder: Record<string, any> = {};
      for (const op of ['eq', 'in', 'order', 'limit', 'not', 'gte', 'lte', 'neq']) {
        builder[op] = (...args: any[]) => {
          call.ops.push({ name: op, args });
          return builder;
        };
      }
      builder.select = (select: string) => {
        call.select = select;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => {
        if (failures[table]) {
          return Promise.resolve({ data: null, error: failures[table] }).then(resolve, reject);
        }
        let rows = [...(tables[table] ?? [])];
        for (const { name, args } of call.ops) {
          if (name === 'eq') rows = rows.filter((r) => r[args[0]] === args[1]);
          else if (name === 'in') rows = rows.filter((r) => (args[1] as unknown[]).includes(r[args[0]]));
          else if (name === 'order') {
            const [col, opts] = args;
            const dir = opts?.ascending === false ? -1 : 1;
            rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * dir);
          } else if (name === 'limit') rows = rows.slice(0, args[0]);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      };
      return builder;
    },
  };
  return { client: client as unknown as Parameters<typeof loadCohort>[0], calls };
};

const callsTo = (calls: Call[], table: string) => calls.filter((c) => c.table === table);
const argsOf = (call: Call, name: string) => call.ops.filter((o) => o.name === name).map((o) => o.args);

/* ── fixtures ────────────────────────────────────────────────────────────── */

const ADA = '11111111-1111-1111-1111-111111111111';
const BEN = '11111111-1111-1111-1111-111111111112';
const PROGRAM = '22222222-2222-2222-2222-222222222222';

// Pin "now" to a date whose ±90-day neighbourhood contains no DST transition in
// any common timezone. The urgent-deadline flag is `Math.ceil(msDifference /
// MS_PER_DAY)`, which is off by one across a clock change — so without this the
// 14-day boundary assertions would flake for about a fortnight a year.
beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'performance',
    ],
    now: new Date(2026, 4, 15, 12, 0, 0),
  });
});
afterAll(() => jest.useRealTimers());

const pad = (n: number) => String(n).padStart(2, '0');
/** A date-only string N days from today, in LOCAL time (as the columns are). */
const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const baseTables = (over: Partial<Tables> = {}): Tables => ({
  profiles: [{ id: ADA, role: 'student', created_at: '2026-01-01T00:00:00.000Z' }],
  student_personal_information: [
    {
      profile_id: ADA,
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada+seed@ascenda.demo',
      nationality: 'British',
      resident_country: 'UK',
      updated_at: isoDaysAgo(1),
    },
  ],
  student_academic_input: [
    {
      profile_id: ADA,
      programme_type: 'IB',
      school_name: 'Demo School',
      school_city: 'London',
      school_country: 'UK',
      graduation_year: 2027,
      intended_clusters: ['computer_science'],
      english_required: true,
      english_status: 'met',
      career_aspiration: 'Engineer',
      ib_total_points: 40,
      updated_at: isoDaysAgo(1),
    },
  ],
  student_subjects: [{ profile_id: ADA, subject_name: 'Mathematics', level: 'HL', grade_value: 7 }],
  student_lifestyle_preference: [
    {
      profile_id: ADA,
      teaching_style: 'practical',
      desired_location_type: 'city',
      campus_size: 'large',
      extracurricular_interests: ['chess'],
      updated_at: isoDaysAgo(1),
    },
  ],
  student_admissions_tests: [
    { profile_id: ADA, test_type: 'LNAT', status: 'booked', score_numeric: null },
    { profile_id: ADA, test_type: 'NONE', status: 'not_taking', score_numeric: null },
  ],
  applications: [
    {
      id: 'app-1',
      profile_id: ADA,
      program_id: PROGRAM,
      status: 'planning',
      platform: 'UCAS',
      decision: null,
      updated_at: isoDaysAgo(1),
      created_at: '2026-06-01T00:00:00.000Z',
    },
  ],
  counsellor_notes: [
    {
      id: 'note-1',
      student_profile_id: ADA,
      body: 'Session held',
      note_type: 'session',
      created_at: isoDaysAgo(2),
    },
  ],
  student_matches: [{ profile_id: ADA, program_id: PROGRAM, score: 75, breakdown: null }],
  programs: [{ id: PROGRAM, course_name: 'Computer Science', universities: { name: 'Imperial', country: 'UK' } }],
  deadlines: [{ id: 'dl-1', program_id: PROGRAM, name: 'Regular decision', deadline_date: dateIn(60) }],
  ...over,
});

// The data layer logs every DataError through the observability sink, which
// falls back to `console.error`. Swallow it by default; the failure suite
// installs its own collecting sink.
beforeEach(() => setLogSink(() => {}));
afterEach(() => resetLogSink());

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A failed query is never a quiet zero.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('a failed batch surfaces instead of reporting an empty cohort', () => {
  const RLS_REFUSAL: Failure = {
    message: 'permission denied for table student_subjects',
    code: '42501',
  };

  const logs: LogEntry[] = [];
  beforeEach(() => {
    logs.length = 0;
    setLogSink((entry) => logs.push(entry));
  });
  afterEach(() => resetLogSink());

  const TABLES = [
    'profiles',
    'student_personal_information',
    'student_academic_input',
    'student_subjects',
    'student_lifestyle_preference',
    'student_admissions_tests',
    'applications',
    'counsellor_notes',
    'student_matches',
    'programs',
    'deadlines',
  ];

  it.each(TABLES)('loadCohort rejects when the %s query fails', async (table) => {
    const { client } = makeSupabase(baseTables(), { [table]: RLS_REFUSAL });
    // The failure mode this replaces is `?? []` — which resolves to a page
    // reading "0 students, all clear" while RLS is broken.
    await expect(loadCohort(client)).rejects.toBeInstanceOf(DataError);
  });

  it('names OUR module and operation, and logs the driver detail', async () => {
    const { client } = makeSupabase(baseTables(), { student_subjects: RLS_REFUSAL });
    await expect(loadCohort(client)).rejects.toMatchObject({
      context: 'counsellor.student_subjects',
      kind: 'permission_denied',
      code: '42501',
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
  });

  it('does not carry PostgREST’s message — which names tables and policies — to the boundary', async () => {
    const { client } = makeSupabase(baseTables(), { student_subjects: RLS_REFUSAL });
    const error: unknown = await loadCohort(client).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(DataError);
    const dataError = error as DataError;
    expect(dataError.message).not.toContain('permission denied for table');
    // …but the detail is not lost: it rides on `cause` for the log sink.
    expect(dataError.cause).toMatchObject({ message: RLS_REFUSAL.message });
  });

  it('loadOutcomes, loadCounsellorDocuments and loadStudentEvolution reject too', async () => {
    const t = baseTables({ student_documents: [{ id: 'd1', student_profile_id: ADA, status: 'requested' }] });
    const boom: Failure = { message: 'boom' };
    await expect(loadOutcomes(makeSupabase(t, { profiles: boom }).client)).rejects.toBeInstanceOf(DataError);
    await expect(
      loadCounsellorDocuments(makeSupabase(t, { student_documents: boom }).client)
    ).rejects.toBeInstanceOf(DataError);
    await expect(
      loadStudentEvolution(makeSupabase(t, { counsellor_notes: boom }).client, ADA)
    ).rejects.toBeInstanceOf(DataError);
  });

  it('an EMPTY cohort is still a legitimate answer — only errors throw', async () => {
    const { client } = makeSupabase({ profiles: [] });
    await expect(loadCohort(client)).resolves.toEqual([]);
    expect(logs).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Cohort scoping — the demo/PII boundary.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('cohort scoping', () => {
  const withSecondStudent = (email: string | null) =>
    baseTables({
      profiles: [
        { id: ADA, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
        { id: BEN, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
      ],
      student_personal_information: [
        ...baseTables().student_personal_information,
        ...(email === null
          ? []
          : [{ profile_id: BEN, first_name: 'Ben', last_name: 'Real', email, nationality: 'Indian', resident_country: 'India' }]),
      ],
    });

  it('excludes a real user who is not part of the seeded cohort', async () => {
    const { client } = makeSupabase(withSecondStudent('ben@some-school.org'));
    const students = await loadCohort(client);
    expect(students.map((s) => s.id)).toEqual([ADA]);
  });

  it('excludes a profile with no personal record at all', async () => {
    const { client } = makeSupabase(withSecondStudent(null));
    const students = await loadCohort(client);
    expect(students.map((s) => s.id)).toEqual([ADA]);
  });

  it.each([
    ['exact', 'ben+seed@ascenda.demo'],
    ['upper-cased', 'BEN+SEED@ASCENDA.DEMO'],
    ['padded', '  ben+seed@ascenda.demo  '],
  ])('includes a %s seeded address', async (_label, email) => {
    const { client } = makeSupabase(withSecondStudent(email));
    const students = await loadCohort(client);
    expect(students.map((s) => s.id)).toEqual([ADA, BEN]);
  });

  it('includes the single-account demo identity', async () => {
    const { client } = makeSupabase(withSecondStudent('greg@workiflow.com'));
    const students = await loadCohort(client);
    expect(students.map((s) => s.id)).toContain(BEN);
  });

  it('scopes BEFORE fanning out, so no out-of-cohort PII is ever fetched', async () => {
    const { client, calls } = makeSupabase(withSecondStudent('ben@some-school.org'));
    await loadCohort(client);

    // The personal read is the scoping read and legitimately covers both ids;
    // everything downstream must be narrowed to the surviving cohort.
    for (const table of [
      'student_academic_input',
      'student_subjects',
      'student_lifestyle_preference',
      'student_admissions_tests',
      'applications',
    ]) {
      const [call] = callsTo(calls, table);
      expect(argsOf(call, 'in')[0][1]).toEqual([ADA]);
    }
    expect(argsOf(callsTo(calls, 'counsellor_notes')[0], 'in')[0]).toEqual(['student_profile_id', [ADA]]);
  });

  it('honours excludeId — the counsellor is not their own student', async () => {
    const { client } = makeSupabase(withSecondStudent('ben+seed@ascenda.demo'));
    const students = await loadCohort(client, { excludeId: BEN });
    expect(students.map((s) => s.id)).toEqual([ADA]);
  });

  it('loadStudentById returns null for someone outside the cohort', async () => {
    const { client } = makeSupabase(withSecondStudent('ben@some-school.org'));
    await expect(loadStudentById(client, BEN)).resolves.toBeNull();
    await expect(loadStudentById(client, ADA)).resolves.toMatchObject({ id: ADA });
  });

  it('does no further work at all when nothing survives scoping', async () => {
    const { client, calls } = makeSupabase(
      baseTables({
        student_personal_information: [
          { profile_id: ADA, first_name: 'Ada', last_name: 'L', email: 'ada@elsewhere.com' },
        ],
      })
    );
    await expect(loadCohort(client)).resolves.toEqual([]);
    expect(callsTo(calls, 'applications')).toHaveLength(0);
    expect(callsTo(calls, 'student_matches')).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Profile completion — the same rule the student's own dashboard applies.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('profile completion', () => {
  it('is 100% for a fully-filled profile, across all four steps', async () => {
    const { client } = makeSupabase(baseTables());
    const [student] = await loadCohort(client);
    expect(student.profile.completionPct).toBe(100);
    expect(student.profile.stepsComplete).toEqual(['personal', 'academic', 'subjects', 'lifestyle']);
  });

  it('accepts english_status alone when english_required is null ("Not sure")', async () => {
    // Answering "Not sure" sets english_required → null. Reading only that
    // column caps the profile at 75% here and — via the same omission in
    // middleware — locked those students out of the app entirely.
    const t = baseTables();
    t.student_academic_input[0].english_required = null;
    const { client } = makeSupabase(t);
    const [student] = await loadCohort(client);
    expect(student.profile.completionPct).toBe(100);
    expect(student.profile.stepsComplete).toContain('subjects');
  });

  it('counts a missing step as 25 points, not as an error', async () => {
    const t = baseTables({ student_lifestyle_preference: [] });
    const { client } = makeSupabase(t);
    const [student] = await loadCohort(client);
    expect(student.profile.completionPct).toBe(75);
    expect(student.profile.stepsComplete).not.toContain('lifestyle');
  });

});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3b. The slim roster loader, and loadOutcomes.
 *
 * These were written as `it.failing` against a LIVE BUG, now FIXED — they are
 * ordinary tests again, and they are the regression guard for it.
 *
 * `loadRoster` (data.ts) and `loadOutcomes` both filtered the base profile query
 * with `.eq('role', 'counsellor.student')`. No such role exists — `profiles.role`
 * is 'student' | 'counsellor' | 'admin' — so both returned `[]` for every input:
 * `/counsellor/universities` showed an empty student roster and
 * `/counsellor/outcomes` showed nothing, on real data, with no error.
 *
 * It was collateral damage from a same-day refactor. An `unwrap` label rename
 * (`'profiles'` -> `'counsellor.profiles'`) put the `counsellor.` prefix on the
 * neighbouring string literal instead — the role argument. The tell was that the
 * `unwrap` label on both calls was still the un-prefixed `'profiles'`: the rename
 * had visibly missed its target and hit the line below it.
 *
 * Worth remembering when reading the rest of this work: a find-and-replace over
 * string literals cannot tell a label from a value, and neither typecheck nor
 * lint nor any of the other five gates caught this. Only a test that asserted
 * which role is actually queried did.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the slim roster loader', () => {
  it('selects students by their actual role', async () => {
    const { client, calls } = makeSupabase(baseTables());
    await loadRoster(client);
    expect(argsOf(callsTo(calls, 'profiles')[0], 'eq')[0]).toEqual(['role', 'student']);
  });

  it('asks for the completion columns by NAME, not by hand', async () => {
    const { client, calls } = makeSupabase(baseTables());
    await loadRoster(client);
    const [academic] = callsTo(calls, 'student_academic_input');
    expect(academic.select).toBe(`profile_id, ${COMPLETION_COLUMNS.academicInput}`);
    expect(academic.select).toContain('english_status');
  });

  it('agrees with the full cohort on the same student', async () => {
    // Two independent query paths computing the same number. When they
    // disagree, a student is "complete" on one counsellor screen and
    // "incomplete" on another — which is precisely what happened.
    const t = baseTables();
    t.student_academic_input[0].english_required = null;
    const [full] = await loadCohort(makeSupabase(t).client);
    const [roster] = await loadRoster(makeSupabase(t).client);
    expect(roster.completionPct).toBe(full.profile.completionPct);
    expect(roster.name).toBe('Ada Lovelace');
    expect(roster.flag).toBe(full.personal.flagEmoji);
  });

  it('falls back to "Student" rather than rendering an empty name chip', async () => {
    const t = baseTables();
    t.student_personal_information[0].first_name = null;
    t.student_personal_information[0].last_name = null;
    const [roster] = await loadRoster(makeSupabase(t).client);
    expect(roster.name).toBe('Student');
  });

  it('applies the same cohort scope as loadCohort', async () => {
    const t = baseTables({
      profiles: [
        { id: ADA, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
        { id: BEN, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
      ],
      student_personal_information: [
        ...baseTables().student_personal_information,
        { profile_id: BEN, first_name: 'Ben', last_name: 'Real', email: 'ben@some-school.org' },
      ],
    });
    const roster = await loadRoster(makeSupabase(t).client);
    expect(roster.map((r) => r.id)).toEqual([ADA]);
  });
});

describe('loadOutcomes', () => {
  const outcomeTables = () =>
    baseTables({
      applications: [
        {
          id: 'app-1',
          profile_id: ADA,
          program_id: PROGRAM,
          status: 'decision',
          platform: 'UCAS',
          decision: 'accepted',
          decision_at: '2026-05-01T00:00:00.000Z',
          decision_conditions: 'AAB',
        },
      ],
    });

  it('builds one outcome per application, with the cached tier', async () => {
    const outcomes = await loadOutcomes(makeSupabase(outcomeTables()).client);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      studentId: ADA,
      studentName: 'Ada Lovelace',
      university: 'Imperial',
      program: 'Computer Science',
      result: 'accepted',
      tier: 'Match', // score 75 under the canonical 80/60 thresholds
      responseDate: '2026-05-01T00:00:00.000Z',
      conditions: 'AAB',
    });
  });

  it('treats an undecided application as pending rather than dropping it', async () => {
    const t = outcomeTables();
    t.applications[0].decision = null;
    t.applications[0].decision_at = null;
    const outcomes = await loadOutcomes(makeSupabase(t).client);
    expect(outcomes[0].result).toBe('pending');
    expect(outcomes[0].responseDate).toBeNull();
  });

  it('reports a stored decision_at even when decision is null', async () => {
    // Not the behaviour you would design, but it IS the behaviour: responseDate
    // is `app.decision_at ?? null`, read independently of `decision`. This test
    // originally asserted the tidier invariant (undecided => no date) and failed,
    // because nothing prevents a row from carrying a decision_at with a null
    // decision — an inconsistent state the schema permits.
    //
    // Pinned as-is rather than "fixed": changing the mapper would hide the bad
    // row instead of preventing it. The real fix is a CHECK constraint tying the
    // two columns together, which belongs with the other integrity constraints in
    // step 15 of docs/audit/12-database-design.md.
    const t = outcomeTables();
    t.applications[0].decision = null;
    const outcomes = await loadOutcomes(makeSupabase(t).client);
    expect(outcomes[0].result).toBe('pending');
    expect(outcomes[0].responseDate).toBe('2026-05-01T00:00:00.000Z');
  });

  it('scopes match lookups to each student’s APPLIED programmes', async () => {
    // Not one unbounded `.in()` over student_matches: a bloated cache for one
    // student would push every other student's tier out of the 1000-row window,
    // and they would all silently default to 'Match'.
    const { client, calls } = makeSupabase(outcomeTables());
    await loadOutcomes(client);
    const [matchCall] = callsTo(calls, 'student_matches');
    expect(argsOf(matchCall, 'eq')[0]).toEqual(['profile_id', ADA]);
    expect(argsOf(matchCall, 'in')[0]).toEqual(['program_id', [PROGRAM]]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Flags — one source, feeding both the chips and the at-risk panel.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('student flags', () => {
  const flagsFor = async (over: Partial<Tables>) => {
    const { client } = makeSupabase(baseTables(over));
    const [student] = await loadCohort(client);
    return student.flags;
  };

  it('a complete, active, matched student carries no flags', async () => {
    expect(await flagsFor({})).toEqual([]);
  });

  it('flags an incomplete profile', async () => {
    expect(await flagsFor({ student_lifestyle_preference: [] })).toContain('profile_incomplete');
  });

  it('flags a deadline inside 14 days, but not one beyond it', async () => {
    const at = (days: number) => ({
      deadlines: [{ id: 'dl-1', program_id: PROGRAM, name: 'Regular', deadline_date: dateIn(days) }],
    });
    expect(await flagsFor(at(0))).toContain('deadline_urgent'); // today still counts
    expect(await flagsFor(at(14))).toContain('deadline_urgent');
    expect(await flagsFor(at(15))).not.toContain('deadline_urgent');
    expect(await flagsFor(at(-1))).not.toContain('deadline_urgent'); // already passed
  });

  it('flags a student with no matches', async () => {
    expect(await flagsFor({ student_matches: [] })).toContain('no_matches');
  });

  it.each([
    ['planning', true],
    ['in_progress', true],
    ['submitted', false],
    ['decision', false],
    ['enrolled', false],
  ])('an inactive student with a %s application is stalled: %s', async (status, expected) => {
    // "Still needs work from the student" is an ALLOW-list of the open stages.
    // The deny-list version (`!== 'submitted' && !== 'decision'`) marked every
    // enrolled application incomplete the moment `enrolled` became representable.
    const t = baseTables();
    t.applications[0].status = status;
    t.applications[0].updated_at = isoDaysAgo(40);
    t.student_personal_information[0].updated_at = isoDaysAgo(40);
    t.student_academic_input[0].updated_at = isoDaysAgo(40);
    t.student_lifestyle_preference[0].updated_at = isoDaysAgo(40);
    t.counsellor_notes[0].created_at = isoDaysAgo(40);
    const { client } = makeSupabase(t);
    const [student] = await loadCohort(client);
    expect(student.flags.includes('stalled')).toBe(expected);
  });

  it('an active student with an open application is not stalled', async () => {
    expect(await flagsFor({})).not.toContain('stalled');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Mapping.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the row → domain mapping', () => {
  it('uses the canonical score→tier thresholds, not this module’s old 70/50', async () => {
    // A score of 75 read "Safe" here and "Match" on search — same student, same
    // programme, same moment. 80/60 is the rule the codebase calls canonical.
    const { client } = makeSupabase(baseTables());
    const [student] = await loadCohort(client);
    expect(student.matches[0].score).toBe(75);
    expect(student.matches[0].tier).toBe('Match');
  });

  it('prefers a persisted breakdown tier over recomputation', async () => {
    const t = baseTables();
    t.student_matches[0].breakdown = { tier: 'Safe' };
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.matches[0].tier).toBe('Safe');
  });

  it('treats an unscored match as a Reach, never as a Safe', async () => {
    const t = baseTables();
    t.student_matches[0].score = null;
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.matches[0].tier).toBe('Reach');
    expect(student.matches[0].score).toBe(0);
  });

  it('passes every application status through untouched', async () => {
    for (const status of ['planning', 'in_progress', 'submitted', 'decision', 'enrolled'] as const) {
      const t = baseTables();
      t.applications[0].status = status;
      const [student] = await loadCohort(makeSupabase(t).client);
      expect(student.applications[0].status).toBe(status);
    }
  });

  it('orders predicted A-level grades best-first', async () => {
    const t = baseTables();
    t.student_academic_input[0].programme_type = 'A_LEVEL';
    t.student_academic_input[0].a_level_predicted_grades = { maths: 'B', physics: 'A*', chemistry: 'C' };
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.academic.programmeType).toBe('A_LEVEL');
    expect(student.academic.aLevelGrades).toBe('A*BC (predicted)');
  });

  it('omits the grades string entirely when there is nothing to show', async () => {
    const t = baseTables();
    t.student_academic_input[0].a_level_predicted_grades = {};
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.academic.aLevelGrades).toBeUndefined();
  });

  it.each([
    ['met', 'met'],
    ['exceeds', 'met'],
    ['exceptional', 'met'],
    ['booked', 'booked'],
    ['failed', 'missing'],
    [null, 'missing'],
  ])('maps english_status %s → %s', async (input, expected) => {
    const t = baseTables();
    t.student_academic_input[0].english_status = input;
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.academic.englishStatus).toBe(expected);
  });

  it('drops the NONE admissions-test sentinel', async () => {
    const [student] = await loadCohort(makeSupabase(baseTables()).client);
    expect(student.academic.admissionsTests.map((t) => t.type)).toEqual(['LNAT']);
  });

  it.each([
    ['Regular decision', 'regular'],
    ['Early action', 'early_decision'],
    ['Scholarship deadline', 'scholarship'],
    ['Interview day', 'interview'],
    [null, 'regular'],
  ])('classifies the %s deadline as %s', async (name, expected) => {
    const t = baseTables();
    t.deadlines[0].name = name;
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.deadlines[0].type).toBe(expected);
  });

  it('keeps the EARLIEST deadline per programme and never repeats a programme', async () => {
    const t = baseTables({
      deadlines: [
        { id: 'dl-late', program_id: PROGRAM, name: 'Regular', deadline_date: dateIn(90) },
        { id: 'dl-early', program_id: PROGRAM, name: 'Regular', deadline_date: dateIn(30) },
      ],
      applications: [
        { ...baseTables().applications[0], id: 'app-1' },
        { ...baseTables().applications[0], id: 'app-2' }, // same programme, twice
      ],
    });
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.deadlines).toHaveLength(1);
    expect(student.deadlines[0].date).toBe(dateIn(30));
    expect(student.applications.every((a) => a.deadline === dateIn(30))).toBe(true);
  });

  it('sorts notes newest-first', async () => {
    const t = baseTables({
      counsellor_notes: [
        { id: 'n-old', student_profile_id: ADA, body: 'older', note_type: 'session', created_at: isoDaysAgo(9) },
        { id: 'n-new', student_profile_id: ADA, body: 'newer', note_type: 'flag', created_at: isoDaysAgo(1) },
      ],
    });
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.notes.map((n) => n.id)).toEqual(['n-new', 'n-old']);
  });

  it('falls back to placeholders when a programme cannot be resolved', async () => {
    const t = baseTables({ programs: [] });
    const [student] = await loadCohort(makeSupabase(t).client);
    expect(student.applications[0]).toMatchObject({ university: 'University', program: 'Programme' });
    expect(student.matches[0]).toMatchObject({ university: 'University', country: 'UK' });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. Query shape.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('query shape', () => {
  it('fans matches out per student, capped and score-ordered', async () => {
    // NOT one unbounded `.in()`: a single profile with a bloated match cache
    // would blow past PostgREST's 1000-row default and starve every other
    // student's tiers, which then silently default.
    const t = baseTables({
      profiles: [
        { id: ADA, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
        { id: BEN, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
      ],
      student_personal_information: [
        ...baseTables().student_personal_information,
        { profile_id: BEN, first_name: 'Ben', last_name: 'Seed', email: 'ben+seed@ascenda.demo' },
      ],
    });
    const { client, calls } = makeSupabase(t);
    await loadCohort(client);

    const matchCalls = callsTo(calls, 'student_matches');
    expect(matchCalls).toHaveLength(2);
    expect(matchCalls.map((c) => argsOf(c, 'eq')[0])).toEqual([
      ['profile_id', ADA],
      ['profile_id', BEN],
    ]);
    for (const call of matchCalls) {
      expect(argsOf(call, 'order')[0]).toEqual(['score', { ascending: false }]);
      expect(argsOf(call, 'limit')[0]).toEqual([30]);
      expect(argsOf(call, 'in')).toHaveLength(0);
    }
  });

  it('never leaks one student’s matches onto another', async () => {
    const t = baseTables({
      profiles: [
        { id: ADA, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
        { id: BEN, role: 'student', created_at: '2026-01-01T00:00:00.000Z' },
      ],
      student_personal_information: [
        ...baseTables().student_personal_information,
        { profile_id: BEN, first_name: 'Ben', last_name: 'Seed', email: 'ben+seed@ascenda.demo' },
      ],
      student_matches: [{ profile_id: ADA, program_id: PROGRAM, score: 75, breakdown: null }],
    });
    const students = await loadCohort(makeSupabase(t).client);
    expect(students.find((s) => s.id === ADA)!.matches).toHaveLength(1);
    expect(students.find((s) => s.id === BEN)!.matches).toHaveLength(0);
  });

  it('reads students only — never the whole profiles table', async () => {
    const { client, calls } = makeSupabase(baseTables());
    await loadCohort(client);
    expect(argsOf(callsTo(calls, 'profiles')[0], 'eq')[0]).toEqual(['role', 'student']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. resolvePrograms / nameMap — the two shared lookups.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('resolvePrograms', () => {
  const manyPrograms = Array.from({ length: 1200 }, (_, i) => ({
    id: `prog-${i}`,
    course_name: `Course ${i}`,
    universities: { name: `Uni ${i}`, country: 'UK' },
  }));

  it('chunks past PostgREST’s 1000-row cap instead of losing the tail', async () => {
    // Beyond the cap the surplus programmes silently fell back to
    // 'University'/'Programme' in the UI — data loss that looks like a design.
    const { client, calls } = makeSupabase({ programs: manyPrograms });
    const map = await resolvePrograms(client, manyPrograms.map((p) => p.id));

    expect(callsTo(calls, 'programs')).toHaveLength(3);
    expect(callsTo(calls, 'programs').map((c) => argsOf(c, 'in')[0][1].length)).toEqual([500, 500, 200]);
    expect(map.size).toBe(1200);
    expect(map.get('prog-1199')).toEqual({ courseName: 'Course 1199', university: 'Uni 1199', country: 'UK' });
  });

  it('dedupes and drops falsy ids before querying', async () => {
    const { client, calls } = makeSupabase({ programs: manyPrograms });
    await resolvePrograms(client, ['prog-1', 'prog-1', 'prog-2', '', null as any, undefined as any]);
    expect(argsOf(callsTo(calls, 'programs')[0], 'in')[0][1]).toEqual(['prog-1', 'prog-2']);
  });

  it('does not query at all for an empty list', async () => {
    const { client, calls } = makeSupabase({ programs: manyPrograms });
    expect((await resolvePrograms(client, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('accepts the embedded university as either an object or a single-element array', async () => {
    const { client } = makeSupabase({
      programs: [
        { id: 'a', course_name: 'A', universities: { name: 'Obj Uni', country: 'DE' } },
        { id: 'b', course_name: 'B', universities: [{ name: 'Arr Uni', country: 'FR' }] },
        { id: 'c', course_name: null, universities: null },
      ],
    });
    const map = await resolvePrograms(client, ['a', 'b', 'c']);
    expect(map.get('a')!.university).toBe('Obj Uni');
    expect(map.get('b')!.university).toBe('Arr Uni');
    expect(map.get('c')).toEqual({ courseName: 'Programme', university: 'University', country: 'UK' });
  });
});

describe('nameMap', () => {
  const rows = [
    { profile_id: ADA, first_name: 'Ada', last_name: 'Lovelace', nationality: 'British', resident_country: 'UK' },
    { profile_id: BEN, first_name: null, last_name: null, nationality: null, resident_country: null },
  ];

  it('resolves names and flags, and never renders a blank chip', async () => {
    const { client } = makeSupabase({ student_personal_information: rows });
    const map = await nameMap(client, [ADA, BEN, ADA]);
    expect(map.get(ADA)!.name).toBe('Ada Lovelace');
    expect(map.get(ADA)!.flag).toBe('🇬🇧');
    expect(map.get(BEN)!.name).toBe('Student');
    expect(map.get(BEN)!.flag).toBe('🎓');
  });

  it('dedupes ids and skips the query entirely when there are none', async () => {
    const { client, calls } = makeSupabase({ student_personal_information: rows });
    await nameMap(client, [ADA, ADA, BEN]);
    expect(argsOf(callsTo(calls, 'student_personal_information')[0], 'in')[0][1]).toEqual([ADA, BEN]);

    const empty = makeSupabase({ student_personal_information: rows });
    expect((await nameMap(empty.client, [])).size).toBe(0);
    expect(empty.calls).toHaveLength(0);
  });
});
