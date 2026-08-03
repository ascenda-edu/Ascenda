/**
 * `application_status` is a five-value Postgres enum, but the counsellor domain
 * type declared only four — and `lib/counsellor/data.ts` hid the gap by rewriting
 * `enrolled → decision` on the way in. Enrolment, the terminal success state the
 * whole product exists to produce, was therefore invisible to counsellors and
 * counted as zero in every funnel.
 *
 * These tests are driven off `Constants.public.Enums.application_status` — the
 * generated enum itself — rather than a hand-written list, so they FAIL the day a
 * sixth value is added to the database and the domain tables are not extended
 * with it. That is the point: the previous four-value tables did not fail, they
 * silently mislabelled data.
 */

import { Constants } from '@/lib/types/database';
import type { Database } from '@/lib/types/database';
import type { ApplicationStatus, CounsellorStudent } from '@/lib/counsellor/types';
import {
  STAGE_COLORS,
  STAGE_LABEL,
  STAGE_ORDER,
  FUNNEL_STAGE_TO_STATUS,
  FUNNEL_STAGES,
} from '@/lib/counsellor/stage-colors';
import { APPLICATION_STATUS_VISUAL } from '@/lib/theme/categories';
import { recordingClient, filtersFor, type RecordedCall } from '../helpers/supabase-recorder';
import {
  deriveAtRiskAlerts,
  deriveCohortStats,
  deriveApplicationsWithPlatform,
  loadCohort,
} from '@/lib/counsellor/data';

const DB_STATUSES = Constants.public.Enums.application_status;

// Compile-time halves of the same assertion: the domain type and the generated
// enum union must be mutually assignable. A missing member on either side is a
// type error at build time, not a surprise at runtime.
type DbApplicationStatus = Database['public']['Enums']['application_status'];
const _domainCoversDb: ApplicationStatus = null as unknown as DbApplicationStatus;
const _dbCoversDomain: DbApplicationStatus = null as unknown as ApplicationStatus;
void _domainCoversDb;
void _dbCoversDomain;

describe('application_status — enum ↔ domain parity', () => {
  it('the generated enum still has the five values these tables are built for', () => {
    expect([...DB_STATUSES].sort()).toEqual(
      ['decision', 'enrolled', 'in_progress', 'planning', 'submitted'].sort()
    );
  });

  it.each(DB_STATUSES)('%s has a stage label', (status) => {
    expect(STAGE_LABEL[status as ApplicationStatus]).toEqual(expect.any(String));
    expect(STAGE_LABEL[status as ApplicationStatus]).not.toHaveLength(0);
  });

  it.each(DB_STATUSES)('%s has a visual entry with real class strings', (status) => {
    const visual = APPLICATION_STATUS_VISUAL[status as ApplicationStatus];
    // The pre-fix code did `APPLICATION_STATUS_VISUAL[status as ApplicationStatusTone]`
    // and then read `.text` — for `enrolled` that was `undefined.text`, a crash.
    expect(visual).toBeDefined();
    expect(visual.text).toEqual(expect.any(String));
    expect(visual.bg).toEqual(expect.any(String));
    expect(visual.bar).toEqual(expect.any(String));
  });

  it.each(DB_STATUSES)('%s has a stage colour bundle', (status) => {
    const stage = STAGE_COLORS[status as ApplicationStatus];
    expect(stage).toBeDefined();
    expect(stage.label).toBe(STAGE_LABEL[status as ApplicationStatus]);
    expect(stage.text).toBe(APPLICATION_STATUS_VISUAL[status as ApplicationStatus].text);
  });

  it('the ordered pipeline covers the enum exactly once each', () => {
    expect([...STAGE_ORDER].sort()).toEqual([...DB_STATUSES].sort());
    expect(new Set(STAGE_ORDER).size).toBe(STAGE_ORDER.length);
  });

  it('every funnel stage maps to a distinct enum value, covering all of them', () => {
    const mapped = FUNNEL_STAGES.map((s) => FUNNEL_STAGE_TO_STATUS[s]);
    expect([...mapped].sort()).toEqual([...DB_STATUSES].sort());
  });

  it('enrolled is visually distinct from submitted', () => {
    // Both are "good news" states; if they render identically the counsellor
    // cannot tell an offer that was accepted from one that was merely sent.
    expect(APPLICATION_STATUS_VISUAL.enrolled.text).not.toBe(
      APPLICATION_STATUS_VISUAL.submitted.text
    );
    expect(APPLICATION_STATUS_VISUAL.enrolled.bar).not.toBe(
      APPLICATION_STATUS_VISUAL.submitted.bar
    );
  });

  it('uses semantic tone tokens, not palette literals', () => {
    const PALETTES =
      /\b(?:text|bg|border|ring|from|to|via|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    for (const status of DB_STATUSES) {
      const v = APPLICATION_STATUS_VISUAL[status as ApplicationStatus];
      for (const cls of [v.text, v.bg, v.border, v.ring, v.accent, v.chip, v.swatch, v.bar]) {
        expect(cls).not.toMatch(PALETTES);
      }
    }
  });
});

/* ── the data mapper ───────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

/**
 * A stand-in for the Supabase client built on the shared recording double:
 * `from(table)` returns a chainable, awaitable builder that resolves the rows
 * seeded for that table AND records every `.eq()`/`.in()` into `calls`.
 *
 * The double this replaces discarded the filter arguments. That mattered here
 * more than anywhere: `loadCohort`'s very first query is
 * `profiles.eq('role','student')`, and the historic roster bug was that exact
 * argument reading `'counsellor.student'` — a string, so the compiler is blind
 * to it — which returned an empty cohort with six gates green. A double that
 * ignores the argument cannot see that, and this file is the one that drives
 * the loader end to end.
 *
 * An unseeded table resolves `[]` rather than throwing: `loadCohort` reads more
 * tables than any one fixture cares about, and the recorder's default is to
 * fail loudly on an unanticipated read.
 */
const fakeSupabase = (tables: Record<string, Row[]>, calls: RecordedCall[] = []) =>
  recordingClient(
    Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, { data: rows }])),
    calls,
    { onUnknownTable: () => ({ data: [] }) }
  ) as unknown as Parameters<typeof loadCohort>[0];

const STUDENT_ID = '11111111-1111-1111-1111-111111111111';
const PROGRAM_ID = '22222222-2222-2222-2222-222222222222';

const cohortFixture = (status: ApplicationStatus) => ({
  profiles: [{ id: STUDENT_ID, created_at: '2026-01-01T00:00:00.000Z', role: 'student' }],
  student_personal_information: [
    {
      profile_id: STUDENT_ID,
      first_name: 'Ada',
      last_name: 'Lovelace',
      // Must end with the seeded-cohort suffix or the loader filters her out.
      email: 'ada+seed@ascenda.demo',
      nationality: 'GB',
      resident_country: 'GB',
    },
  ],
  student_academic_input: [
    { profile_id: STUDENT_ID, programme_type: 'IB', school_name: 'Demo School', graduation_year: 2027 },
  ],
  student_subjects: [],
  student_lifestyle_preference: [],
  student_admissions_tests: [],
  applications: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      profile_id: STUDENT_ID,
      program_id: PROGRAM_ID,
      status,
      platform: 'UCAS',
      decision: null,
      updated_at: '2026-07-01T00:00:00.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
    },
  ],
  counsellor_notes: [],
  student_matches: [],
  programs: [
    { id: PROGRAM_ID, course_name: 'Computer Science', universities: { name: 'Imperial', country: 'UK' } },
  ],
  deadlines: [{ id: 'd1', program_id: PROGRAM_ID, name: 'Regular', deadline_date: '2026-10-15' }],
});

describe('loadCohort — status passthrough', () => {
  it.each(Constants.public.Enums.application_status)(
    'preserves %s exactly as stored',
    async (status) => {
      const students = await loadCohort(fakeSupabase(cohortFixture(status as ApplicationStatus)));
      expect(students).toHaveLength(1);
      expect(students[0].applications).toHaveLength(1);
      expect(students[0].applications[0].status).toBe(status);
    }
  );

  it('does NOT rewrite enrolled to decision', async () => {
    const students = await loadCohort(fakeSupabase(cohortFixture('enrolled')));
    expect(students[0].applications[0].status).toBe('enrolled');
    expect(students[0].applications[0].status).not.toBe('decision');
  });

  it('carries enrolled through to the enriched application list', async () => {
    const students = await loadCohort(fakeSupabase(cohortFixture('enrolled')));
    const enriched = deriveApplicationsWithPlatform(students);
    expect(enriched).toHaveLength(1);
    expect(enriched[0].status).toBe('enrolled');
  });

  it('selects the cohort by role and scopes every student read to it', async () => {
    const calls: RecordedCall[] = [];
    await loadCohort(fakeSupabase(cohortFixture('submitted'), calls));

    // THE roster bug, pinned. `profiles.role` is 'student' | 'counsellor' |
    // 'admin'; the value here is a bare string, so no compiler sees it. When it
    // read 'counsellor.student' the cohort was empty and every gate was green.
    expect(filtersFor(calls, 'profiles')).toEqual([['eq', 'role', 'student']]);

    // And every per-student read is confined to the ids that query returned —
    // not to the whole table.
    for (const table of ['student_personal_information', 'student_academic_input', 'applications']) {
      expect(filtersFor(calls, table)).toContainEqual(['in', 'profile_id', [STUDENT_ID]]);
    }
  });
});

/* ── the funnel ────────────────────────────────────────────────────────────── */

const studentWith = (id: string, statuses: ApplicationStatus[]): CounsellorStudent =>
  ({
    id,
    personal: {
      firstName: 'Ada',
      lastName: id,
      nationality: 'GB',
      flagEmoji: '🇬🇧',
      school: 'Demo School',
      schoolCity: 'London',
      schoolCountry: 'GB',
      email: `${id}+seed@ascenda.demo`,
    },
    academic: {
      programmeType: 'IB',
      subjects: [],
      clusters: [],
      careerAspiration: '',
      englishStatus: 'met',
      admissionsTests: [],
      graduationYear: 2027,
    },
    lifestyle: { teachingStyle: 'mixed', locationPreference: '', campusSize: 'no_preference', interests: [] },
    profile: { completionPct: 100, stepsComplete: ['personal', 'academic', 'subjects', 'lifestyle'] },
    matches: [],
    applications: statuses.map((status) => ({
      university: 'Imperial',
      program: 'Computer Science',
      status,
      deadline: '2026-10-15',
      platform: 'UCAS' as const,
      country: 'UK',
    })),
    deadlines: [],
    notes: [],
    flags: [],
    lastActive: new Date().toISOString(),
  }) as CounsellorStudent;

describe('deriveCohortStats — the funnel', () => {
  it('counts an enrolled student', () => {
    const stats = deriveCohortStats([studentWith('a', ['enrolled'])]);
    expect(stats.appFunnel.enrolled).toBe(1);
    // …and does not double-count them as "awaiting decision", which is exactly
    // what the old `enrolled → decision` coercion did.
    expect(stats.appFunnel.decision).toBe(0);
  });

  it('tallies every stage independently', () => {
    const stats = deriveCohortStats([
      studentWith('a', ['planning']),
      studentWith('b', ['in_progress']),
      studentWith('c', ['submitted']),
      studentWith('d', ['decision']),
      studentWith('e', ['enrolled']),
      studentWith('f', ['enrolled']),
    ]);
    expect(stats.appFunnel).toEqual({
      planning: 1,
      inProgress: 1,
      submitted: 1,
      decision: 1,
      enrolled: 2,
    });
  });

  it('exposes exactly one funnel key per application status', () => {
    const stats = deriveCohortStats([studentWith('a', ['enrolled'])]);
    expect(Object.keys(stats.appFunnel).sort()).toEqual([...FUNNEL_STAGES].sort());
  });

});

/* ── "incomplete application" ──────────────────────────────────────────────── */

/**
 * `isOpenApplication` is the allow-list that replaced the deny-list
 * `status !== 'submitted' && status !== 'decision'` — which counted every
 * ENROLLED application as incomplete forever, the moment `enrolled` became
 * representable.
 *
 * There used to be a test here NAMED for that bug that could not detect it: it
 * called `deriveCohortStats` (which never computes flags) and then asserted
 * `stale.flags` — the `studentWith` fixture's own `flags: []` — so it was the
 * fixture asserting itself. A reviewer reinstated the deny-list and it stayed
 * green while three real tests elsewhere went red.
 *
 * `deriveAtRiskAlerts` is the function that actually consumes
 * `isOpenApplication`, so that is what these drive.
 */
describe('deriveAtRiskAlerts — an enrolled application is finished, not stalled', () => {
  const inactiveFor = (days: number, statuses: ApplicationStatus[]) => {
    const student = studentWith('a', statuses);
    student.lastActive = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return student;
  };

  const stalledAlerts = (student: CounsellorStudent) =>
    deriveAtRiskAlerts([student]).filter((alert) => alert.riskType === 'stalled_application');

  it('raises no stalled alert for a long-inactive student whose only application is enrolled', () => {
    // The student got in. There is nothing left for them to do, so chasing them
    // for 60 days of inactivity is noise on the counsellor's at-risk panel.
    expect(stalledAlerts(inactiveFor(60, ['enrolled']))).toEqual([]);
  });

  it.each<[ApplicationStatus, boolean]>([
    ['planning', true],
    ['in_progress', true],
    ['submitted', false],
    ['decision', false],
    ['enrolled', false]
  ])('a 60-day-inactive student with a %s application ⇒ stalled alert: %s', (status, expected) => {
    // The whole enum, so a sixth value cannot quietly land on the wrong side of
    // the allow-list, and so this cannot pass by never raising an alert at all.
    expect(stalledAlerts(inactiveFor(60, [status])).length > 0).toBe(expected);
  });

  it('counts only the OPEN applications in the alert text', () => {
    const student = inactiveFor(60, ['planning', 'enrolled', 'submitted', 'in_progress']);

    expect(stalledAlerts(student)[0].description).toContain('2 incomplete application(s)');
  });

  it('says nothing about a recently-active student, whatever their applications', () => {
    // The control: without it every assertion above passes on a function that
    // has stopped raising stalled alerts entirely.
    expect(stalledAlerts(inactiveFor(1, ['planning']))).toEqual([]);
  });
});
