/** @jest-environment ./jest.environment-node.js */
/**
 * The pure `derive*` helpers in `lib/counsellor/data.ts`, plus the two loaders
 * whose real work is a derivation over rows (documents → overdue, notes →
 * evolution timeline).
 *
 * Every counsellor page fetches the cohort once and then derives many views
 * from it, so these functions are where the counsellor's numbers actually come
 * from — the stats tiles, the at-risk panel, the deadline lists, the outcome
 * rates. They are pure and cheap to test, and two whole classes of bug live in
 * them:
 *
 *   * **counting the wrong unit.** `matchTiers.reach` counts STUDENTS who have
 *     at least one Reach, not Reach matches. Swapping those silently multiplies
 *     the dashboard's headline numbers.
 *   * **date-only strings parsed as UTC.** Every date here is a `YYYY-MM-DD`
 *     column compared against a local-midnight boundary. `new Date(iso)` shifts
 *     each one by the viewer's UTC offset, so a deadline due today vanishes for
 *     UTC+ users. `parseLocalDate` is the fix and these tests are what keeps it.
 */

import {
  deriveAllDeadlines,
  deriveApplicationsWithPlatform,
  deriveAtRiskAlerts,
  deriveCohortStats,
  deriveFieldDistribution,
  deriveOutcomeStats,
  deriveRecentActivity,
  deriveUpcomingDeadlines,
  loadCounsellorDocuments,
  loadStudentEvolution,
} from '@/lib/counsellor/data';
import type {
  ApplicationStatus,
  CounsellorOutcome,
  CounsellorStudent,
  MatchTier,
} from '@/lib/counsellor/types';
import { resetLogSink, setLogSink } from '@/lib/observability/logger';

/* ── fixtures ────────────────────────────────────────────────────────────── */

// Pin "now" to a date whose ±90-day neighbourhood contains no DST transition in
// any common timezone. Several of the functions under test compute day counts
// as `Math.ceil(msDifference / MS_PER_DAY)`, which is off by one across a clock
// change — so without this the boundary assertions below would flake for about
// a fortnight a year, in whichever direction the local zone shifts.
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
/** A date-only string N days from today, in LOCAL time — as the columns are. */
const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

interface StudentSpec {
  id?: string;
  completionPct?: number;
  matches?: Array<{ tier: MatchTier; university?: string }>;
  applications?: Array<{ status: ApplicationStatus; university?: string; platform?: any; country?: string }>;
  deadlines?: Array<{ date: string; university?: string }>;
  notes?: Array<{ id: string; date: string; content?: string }>;
  flags?: CounsellorStudent['flags'];
  lastActive?: string;
  programmeType?: 'IB' | 'A_LEVEL';
  clusters?: string[];
  firstName?: string;
}

const student = (spec: StudentSpec = {}): CounsellorStudent => {
  const id = spec.id ?? 'stu-1';
  return {
    id,
    personal: {
      firstName: spec.firstName ?? 'Ada',
      lastName: 'Lovelace',
      nationality: 'British',
      flagEmoji: '🇬🇧',
      school: 'Demo School',
      schoolCity: 'London',
      schoolCountry: 'UK',
      email: `${id}+seed@ascenda.demo`,
    },
    academic: {
      programmeType: spec.programmeType ?? 'IB',
      subjects: [],
      clusters: spec.clusters ?? [],
      careerAspiration: '',
      englishStatus: 'met',
      admissionsTests: [],
      graduationYear: 2027,
    },
    lifestyle: { teachingStyle: 'mixed', locationPreference: 'city', campusSize: 'large', interests: [] },
    profile: { completionPct: spec.completionPct ?? 100, stepsComplete: [] },
    matches: (spec.matches ?? []).map((m) => ({
      university: m.university ?? 'Imperial',
      country: 'UK',
      program: 'Computer Science',
      score: 70,
      tier: m.tier,
    })),
    applications: (spec.applications ?? []).map((a) => ({
      university: a.university ?? 'Imperial',
      program: 'Computer Science',
      status: a.status,
      deadline: dateIn(30),
      platform: a.platform,
      country: a.country,
    })),
    deadlines: (spec.deadlines ?? []).map((d, i) => ({
      id: `${id}-dl-${i}`,
      university: d.university ?? 'Imperial',
      program: 'Computer Science',
      date: d.date,
      type: 'regular' as const,
      studentId: id,
    })),
    notes: (spec.notes ?? []).map((n) => ({
      id: n.id,
      date: n.date,
      content: n.content ?? 'note',
      type: 'session' as const,
    })),
    flags: spec.flags ?? [],
    lastActive: spec.lastActive ?? isoDaysAgo(1),
  };
};

/* ═══════════════════════════════════════════════════════════════════════════
 * deriveCohortStats
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('deriveCohortStats', () => {
  it('counts STUDENTS per tier, not matches', async () => {
    // A student with five Reaches is one student at risk of reaching, not five.
    const stats = deriveCohortStats([
      student({ id: 'a', matches: [{ tier: 'Reach' }, { tier: 'Reach' }, { tier: 'Safe' }] }),
      student({ id: 'b', matches: [{ tier: 'Match' }] }),
    ]);
    expect(stats.matchTiers).toEqual({ reach: 1, match: 1, safe: 1 });
  });

  it('averages completion and rounds', async () => {
    const stats = deriveCohortStats([
      student({ id: 'a', completionPct: 100 }),
      student({ id: 'b', completionPct: 75 }),
      student({ id: 'c', completionPct: 50 }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.avgCompletion).toBe(75);
  });

  it('reports an empty cohort as zero, not NaN', async () => {
    // `students.length || 1` is the guard; a NaN here renders as "NaN%".
    const stats = deriveCohortStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avgCompletion).toBe(0);
    expect(Number.isNaN(stats.avgCompletion)).toBe(false);
  });

  it('counts a flagged student once, however many flags they carry', async () => {
    const stats = deriveCohortStats([
      student({ id: 'a', flags: ['profile_incomplete', 'no_matches', 'stalled'] }),
      student({ id: 'b', flags: [] }),
    ]);
    expect(stats.flagged).toBe(1);
  });

  it('counts deadlines in the next seven days, inclusive at both ends', async () => {
    const stats = deriveCohortStats([
      student({
        id: 'a',
        deadlines: [
          { date: dateIn(-1) }, // yesterday — gone
          { date: dateIn(0) }, // today — counts (the UTC-parsing bug drops this one)
          { date: dateIn(7) }, // the boundary — counts
          { date: dateIn(8) }, // next week — not yet
        ],
      }),
    ]);
    expect(stats.deadlinesThisWeek).toBe(2);
  });

  it('splits the cohort by programme type', async () => {
    const stats = deriveCohortStats([
      student({ id: 'a', programmeType: 'IB' }),
      student({ id: 'b', programmeType: 'A_LEVEL' }),
      student({ id: 'c', programmeType: 'A_LEVEL' }),
    ]);
    expect(stats.programmeBreakdown).toEqual({ ib: 1, aLevel: 2 });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Deadlines
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('deadline derivations', () => {
  // Built per test, not at describe scope: describe bodies run before the
  // `beforeAll` that pins the clock, so a shared fixture would carry the real
  // date into assertions written against the fake one.
  const cohort = () => [
    student({ id: 'a', deadlines: [{ date: dateIn(20) }, { date: dateIn(-5) }] }),
    student({ id: 'b', firstName: 'Ben', deadlines: [{ date: dateIn(3) }, { date: dateIn(45) }] }),
  ];

  it('keeps upcoming deadlines only, soonest first', async () => {
    const upcoming = deriveUpcomingDeadlines(cohort());
    expect(upcoming.map((d) => d.date)).toEqual([dateIn(3), dateIn(20)]);
    expect(upcoming[0].studentName).toBe('Ben Lovelace');
    expect(upcoming[0].studentFlag).toBe('🇬🇧');
  });

  it('honours the window, and includes a deadline landing exactly on it', async () => {
    expect(deriveUpcomingDeadlines(cohort(), 45).map((d) => d.date)).toEqual([
      dateIn(3),
      dateIn(20),
      dateIn(45),
    ]);
    expect(deriveUpcomingDeadlines(cohort(), 44)).toHaveLength(2);
  });

  it('includes a deadline due TODAY', async () => {
    // Parsed as UTC midnight, "today" is in the past for every user east of
    // Greenwich and today's deadlines silently disappear from the panel.
    const today = deriveUpcomingDeadlines([student({ deadlines: [{ date: dateIn(0) }] })]);
    expect(today).toHaveLength(1);
    expect(today[0].daysUntil).toBe(0);
  });

  it('computes daysUntil from local midnight, so it is a whole number of days', async () => {
    const [d] = deriveUpcomingDeadlines([student({ deadlines: [{ date: dateIn(9) }] })]);
    expect(d.daysUntil).toBe(9);
  });

  it('deriveAllDeadlines keeps the past ones too, still sorted', async () => {
    const all = deriveAllDeadlines(cohort());
    expect(all).toHaveLength(4);
    expect(all.map((d) => d.date)).toEqual([dateIn(-5), dateIn(3), dateIn(20), dateIn(45)]);
    expect(all.find((d) => d.date === dateIn(-5))!.daysUntil).toBe(-5);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Activity + field distribution
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('deriveRecentActivity', () => {
  it('interleaves notes from every student, newest first, capped at ten', async () => {
    const cohort = [
      student({ id: 'a', notes: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, date: isoDaysAgo(i * 2) })) }),
      student({ id: 'b', notes: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, date: isoDaysAgo(i * 2 + 1) })) }),
    ];
    const activity = deriveRecentActivity(cohort);
    expect(activity).toHaveLength(10);
    expect(activity.map((n) => n.id)).toEqual(['a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4']);
    expect(activity[0].studentId).toBe('a');
    expect(activity[0].studentName).toBe('Ada Lovelace');
  });

  it('is empty, not undefined, for a cohort with no notes', async () => {
    expect(deriveRecentActivity([student()])).toEqual([]);
  });
});

describe('deriveFieldDistribution', () => {
  it('labels known clusters, passes unknown keys through, and sorts by count', async () => {
    const dist = deriveFieldDistribution([
      student({ id: 'a', clusters: ['law', 'computer_science'] }),
      student({ id: 'b', clusters: ['computer_science'] }),
      student({ id: 'c', clusters: ['computer_science', 'underwater_basket_weaving'] }),
    ]);
    expect(dist[0]).toEqual({ key: 'computer_science', label: 'Computer Science', count: 3 });
    expect(dist.map((d) => d.count)).toEqual([3, 1, 1]);
    // An unmapped key must still be countable — dropping it would understate
    // the cohort rather than showing an ugly label.
    expect(dist.find((d) => d.key === 'underwater_basket_weaving')).toEqual({
      key: 'underwater_basket_weaving',
      label: 'underwater_basket_weaving',
      count: 1,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * deriveAtRiskAlerts
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('deriveAtRiskAlerts', () => {
  const typesFor = (s: CounsellorStudent) => deriveAtRiskAlerts([s]).map((a) => a.riskType);

  it('says nothing about a healthy student', async () => {
    expect(deriveAtRiskAlerts([student({ matches: [{ tier: 'Match' }] })])).toEqual([]);
  });

  it.each([
    [40, 'critical'],
    [49, 'critical'],
    [50, 'high'],
    [69, 'high'],
  ])('escalates a %i%% profile to %s', async (completionPct, urgency) => {
    const [alert] = deriveAtRiskAlerts([student({ completionPct, matches: [{ tier: 'Match' }] })]);
    expect(alert.riskType).toBe('low_completion');
    expect(alert.urgency).toBe(urgency);
    expect(alert.description).toContain(`${completionPct}%`);
  });

  it('says nothing at 70% — the threshold is exclusive', async () => {
    expect(typesFor(student({ completionPct: 70, matches: [{ tier: 'Match' }] }))).toEqual([]);
  });

  it.each([
    ['planning', true],
    ['in_progress', true],
    ['submitted', false],
    ['decision', false],
    ['enrolled', false],
  ])('treats a stale %s application as stalled: %s', async (status, expected) => {
    // The enrolled row is the point: a student who ACCEPTED a place and then
    // stopped logging in is not an abandoned application, and chasing them is
    // exactly the wrong counsellor action.
    const s = student({
      matches: [{ tier: 'Match' }],
      applications: [{ status: status as ApplicationStatus }],
      lastActive: isoDaysAgo(20),
    });
    expect(typesFor(s).includes('stalled_application')).toBe(expected);
  });

  it('escalates a stall past 30 days to critical, and counts only the OPEN applications', async () => {
    const s = student({
      matches: [{ tier: 'Match' }],
      applications: [{ status: 'planning' }, { status: 'in_progress' }, { status: 'enrolled' }],
      lastActive: isoDaysAgo(40),
    });
    const [alert] = deriveAtRiskAlerts([s]);
    expect(alert.urgency).toBe('critical');
    expect(alert.description).toContain('2 incomplete application(s)');
  });

  it('raises a deadline alert only when the matching application is still in planning', async () => {
    const near = { date: dateIn(3), university: 'Imperial' };
    const planning = student({
      matches: [{ tier: 'Match' }],
      deadlines: [near],
      applications: [{ status: 'planning', university: 'Imperial' }],
    });
    const [alert] = deriveAtRiskAlerts([planning]);
    expect(alert.riskType).toBe('deadline_approaching');
    expect(alert.urgency).toBe('critical'); // <= 5 days
    expect(alert.description).toContain('Imperial');

    const submitted = student({
      matches: [{ tier: 'Match' }],
      deadlines: [near],
      applications: [{ status: 'submitted', university: 'Imperial' }],
    });
    expect(typesFor(submitted)).toEqual([]);
  });

  it('falls back to a critical alert for a deadline-flagged student with no planning application', async () => {
    // Without this, a student the roster shows a red "deadline" chip for has no
    // corresponding row in the at-risk panel — the two disagree on screen.
    const s = student({
      matches: [{ tier: 'Match' }],
      flags: ['deadline_urgent'],
      applications: [{ status: 'submitted' }],
    });
    const alerts = deriveAtRiskAlerts([s]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ riskType: 'deadline_approaching', urgency: 'critical' });
  });

  it('does not double-raise when a real deadline alert already exists', async () => {
    const s = student({
      matches: [{ tier: 'Match' }],
      flags: ['deadline_urgent'],
      deadlines: [{ date: dateIn(3), university: 'Imperial' }],
      applications: [{ status: 'planning', university: 'Imperial' }],
    });
    expect(deriveAtRiskAlerts([s]).filter((a) => a.riskType === 'deadline_approaching')).toHaveLength(1);
  });

  it('reports an unmatched student at medium urgency', async () => {
    const [alert] = deriveAtRiskAlerts([student({ flags: ['no_matches'], matches: [] })]);
    expect(alert).toMatchObject({ riskType: 'missing_documents', urgency: 'medium' });
  });

  it('orders the panel critical → high → medium', async () => {
    const alerts = deriveAtRiskAlerts([
      student({ id: 'medium', flags: ['no_matches'], matches: [] }),
      student({ id: 'high', completionPct: 60, matches: [{ tier: 'Match' }] }),
      student({ id: 'critical', completionPct: 10, matches: [{ tier: 'Match' }] }),
    ]);
    expect(alerts.map((a) => a.urgency)).toEqual(['critical', 'high', 'medium']);
  });

  it('gives every alert a student to act on and an action to take', async () => {
    const alerts = deriveAtRiskAlerts([
      student({ id: 'x', completionPct: 10, flags: ['no_matches'], matches: [] }),
    ]);
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.studentId).toBe('x');
      expect(alert.studentName).toBe('Ada Lovelace');
      expect(alert.suggestedAction.length).toBeGreaterThan(0);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * deriveApplicationsWithPlatform
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('deriveApplicationsWithPlatform', () => {
  it('flattens the cohort and defaults the two optional columns', async () => {
    const rows = deriveApplicationsWithPlatform([
      student({ id: 'a', applications: [{ status: 'planning' }] }),
      student({
        id: 'b',
        applications: [{ status: 'enrolled', platform: 'Common App', country: 'US' }],
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ studentId: 'a', platform: 'UCAS', country: 'UK' });
    expect(rows[1]).toMatchObject({ studentId: 'b', platform: 'Common App', country: 'US', status: 'enrolled' });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * deriveOutcomeStats
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('deriveOutcomeStats', () => {
  const outcome = (result: CounsellorOutcome['result']): CounsellorOutcome => ({
    id: `o-${result}-${Math.random()}`,
    studentId: 'a',
    studentName: 'Ada',
    university: 'Imperial',
    program: 'CS',
    country: 'UK',
    tier: 'Match',
    platform: 'UCAS',
    result,
    responseDate: null,
    conditions: null,
  });

  it('tallies each result independently', async () => {
    const stats = deriveOutcomeStats([
      outcome('accepted'),
      outcome('accepted'),
      outcome('rejected'),
      outcome('waitlisted'),
      outcome('pending'),
      outcome('withdrawn'),
    ]);
    expect(stats).toMatchObject({
      total: 6,
      accepted: 2,
      rejected: 1,
      waitlisted: 1,
      pending: 1,
      withdrawn: 1,
    });
  });

  it('excludes pending AND withdrawn from the acceptance-rate denominator', async () => {
    // 2 accepted of 4 decided = 50%. Counting the pending and withdrawn rows
    // would report 33%, which reads as a worse counsellor than they are, and
    // gets worse the more applications are still in flight.
    const stats = deriveOutcomeStats([
      outcome('accepted'),
      outcome('accepted'),
      outcome('rejected'),
      outcome('waitlisted'),
      outcome('pending'),
      outcome('withdrawn'),
    ]);
    expect(stats.acceptanceRate).toBe(50);
  });

  it('reports 0% rather than NaN when nothing has been decided', async () => {
    expect(deriveOutcomeStats([]).acceptanceRate).toBe(0);
    expect(deriveOutcomeStats([outcome('pending'), outcome('withdrawn')]).acceptanceRate).toBe(0);
  });

  it('rounds to whole percent', async () => {
    const stats = deriveOutcomeStats([outcome('accepted'), outcome('rejected'), outcome('rejected')]);
    expect(stats.acceptanceRate).toBe(33);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * The two loaders whose work is a derivation
 * ═══════════════════════════════════════════════════════════════════════════ */

const makeSupabase = (tables: Record<string, any[]>) => {
  const client = {
    from(table: string) {
      const builder: Record<string, any> = {};
      const ops: Array<{ name: string; args: any[] }> = [];
      for (const op of ['eq', 'in', 'order', 'limit']) {
        builder[op] = (...args: any[]) => {
          ops.push({ name: op, args });
          return builder;
        };
      }
      builder.select = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) => {
        let rows = [...(tables[table] ?? [])];
        for (const { name, args } of ops) {
          if (name === 'eq') rows = rows.filter((r) => r[args[0]] === args[1]);
          else if (name === 'in') rows = rows.filter((r) => (args[1] as unknown[]).includes(r[args[0]]));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      };
      return builder;
    },
  };
  return client as unknown as Parameters<typeof loadCounsellorDocuments>[0];
};

beforeEach(() => setLogSink(() => {}));
afterEach(() => resetLogSink());

describe('loadCounsellorDocuments', () => {
  const doc = (over: Record<string, unknown>) => ({
    id: 'd1',
    student_profile_id: 'stu-1',
    document_name: 'Personal statement',
    doc_type: 'essay',
    status: 'requested',
    uploaded_at: null,
    due_date: null,
    notes: null,
    ...over,
  });
  const people = [
    { profile_id: 'stu-1', first_name: 'Ada', last_name: 'Lovelace', nationality: 'British', resident_country: 'UK' },
  ];

  it('derives "overdue" from a past due date', async () => {
    const rows = await loadCounsellorDocuments(
      makeSupabase({
        student_documents: [doc({ due_date: dateIn(-1) })],
        student_personal_information: people,
      })
    );
    expect(rows[0].status).toBe('overdue');
    expect(rows[0].studentName).toBe('Ada Lovelace');
  });

  it('does not call a document due TODAY overdue', async () => {
    // The date-only column is compared against local midnight. Parsed as UTC,
    // today's documents flip to red a whole day early.
    const rows = await loadCounsellorDocuments(
      makeSupabase({
        student_documents: [doc({ due_date: dateIn(0) })],
        student_personal_information: people,
      })
    );
    expect(rows[0].status).toBe('requested');
  });

  it('never marks a RECEIVED document overdue', async () => {
    const uploadedAt = '2026-06-01T09:30:00.000Z';
    const rows = await loadCounsellorDocuments(
      makeSupabase({
        student_documents: [doc({ status: 'received', due_date: dateIn(-30), uploaded_at: uploadedAt })],
        student_personal_information: people,
      })
    );
    expect(rows[0].status).toBe('received');
    expect(rows[0].uploadedDate).toBe(uploadedAt);
  });

  it('does not look up names when there are no documents', async () => {
    const rows = await loadCounsellorDocuments(makeSupabase({ student_documents: [] }));
    expect(rows).toEqual([]);
  });

  it('falls back to "Student" for an unresolvable owner', async () => {
    const rows = await loadCounsellorDocuments(
      makeSupabase({ student_documents: [doc({})], student_personal_information: [] })
    );
    expect(rows[0].studentName).toBe('Student');
  });
});

describe('loadStudentEvolution', () => {
  const note = (id: string, note_type: string, created_at: string) => ({
    id,
    student_profile_id: 'stu-1',
    body: `body ${id}`,
    note_type,
    created_at,
  });

  it('maps each note type to a timeline category and title, oldest first', async () => {
    const entries = await loadStudentEvolution(
      makeSupabase({
        counsellor_notes: [
          note('n-flag', 'flag', isoDaysAgo(1)),
          note('n-session', 'session', isoDaysAgo(30)),
          note('n-update', 'update', isoDaysAgo(10)),
        ],
      }),
      'stu-1'
    );

    // A timeline reads forwards, so the sort is the opposite of the notes list.
    expect(entries.map((e) => e.id)).toEqual(['n-session', 'n-update', 'n-flag']);
    expect(entries.map((e) => e.category)).toEqual(['counsellor_note', 'milestone', 'goal']);
    expect(entries.map((e) => e.title)).toEqual([
      'Counsellor session',
      'Progress update',
      'Flag raised',
    ]);
    expect(entries.every((e) => e.source === 'counsellor')).toBe(true);
  });

  it('scopes to the student asked for', async () => {
    const entries = await loadStudentEvolution(
      makeSupabase({
        counsellor_notes: [
          note('mine', 'session', isoDaysAgo(1)),
          { ...note('theirs', 'session', isoDaysAgo(1)), student_profile_id: 'someone-else' },
        ],
      }),
      'stu-1'
    );
    expect(entries.map((e) => e.id)).toEqual(['mine']);
  });
});
