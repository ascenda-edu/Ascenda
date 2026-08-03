import {
  frameContext,
  buildContextForMode,
  buildStarterSuggestions,
} from '@/lib/chat/context';

// The counsellor/parent data layers are exercised by their own sections; here
// they're mocked so the tests pin down the CONTEXT FORMATTING, not the queries.
jest.mock('@/lib/counsellor/data', () => ({
  loadCohort: jest.fn(),
  deriveCohortStats: jest.fn(),
  deriveAtRiskAlerts: jest.fn(),
  deriveUpcomingDeadlines: jest.fn(),
  resolvePrograms: jest.fn(async (_supabase: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { courseName: 'Computer Science', university: 'Oxford', country: 'UK' }]))
  ),
}));

jest.mock('@/features/parent', () => ({
  loadLinkedChildren: jest.fn(),
  pickActiveChild: jest.fn(),
  loadChildOverview: jest.fn(),
  loadChildThread: jest.fn(),
}));

import {
  loadCohort,
  deriveCohortStats,
  deriveAtRiskAlerts,
  deriveUpcomingDeadlines,
} from '@/lib/counsellor/data';
import {
  loadLinkedChildren,
  pickActiveChild,
  loadChildOverview,
  loadChildThread,
} from '@/features/parent';
import {
  filtersFor,
  recordingClient,
  type RecordedCall,
  type TableResult,
} from '../helpers/supabase-recorder';

// ── student-mode supabase mock ───────────────────────────────────────────────

const iso = (daysFromToday: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * The double records `[method, column, value]` for every `.eq()`/`.in()`.
 *
 * It used to be `jest.fn(() => builder)` per method, arguments discarded — so
 * repointing all five of this module's reads at another student's profile id
 * (`.eq('profile_id', 'someone-else')`) left every test in this file green while
 * another student's name, nationality, school, grades and matches were
 * serialised into the model's system prompt. See the scope describe below.
 */
const STUDENT_TABLE_RESULTS: Record<string, TableResult> = {
  student_personal_information: {
    data: { first_name: 'Maya', last_name: 'Chen', email: 'm@x.com', nationality: 'SG', resident_country: 'Singapore' },
  },
  student_academic_input: {
    data: {
      programme_type: 'IB', school_name: 'ASH', school_country: 'SG',
      graduation_year: 2027, intended_clusters: ['cs'], english_required: true, english_status: 'met',
    },
  },
  student_lifestyle_preference: { data: null }, // lifestyle step incomplete
  student_subjects: { count: 4 },
  applications: {
    data: [
      {
        id: 'app-1',
        status: 'in_progress',
        program_id: 'prog-1',
        program: {
          name: 'Computer Science',
          universities: { name: 'Oxford', country: 'UK' },
          deadlines: [{ name: 'UCAS', deadline_date: iso(4) }],
        },
        application_checklist: [
          { task_name: 'Essay', status: 'todo', due_date: iso(-2) }, // overdue
          { task_name: 'Reference', status: 'done', due_date: null },
        ],
      },
    ],
  },
  student_matches: {
    data: [{ program_id: 'prog-1', score: 87.4, breakdown: { tier: 'Match' } }],
  },
};

const studentSupabase = (calls: RecordedCall[] = []) =>
  recordingClient(STUDENT_TABLE_RESULTS, calls);

// Error-path tests below spy on console.warn so the *expected* warning doesn't
// dump a stack trace into the run. Restoring here (rather than at the end of a
// test body) means a failing assertion can't leak the spy into other tests.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('frameContext', () => {
  it('wraps the body with the data-not-instructions frame', () => {
    const framed = frameContext('BODY LINE');
    expect(framed).toContain('LIVE ACCOUNT DATA');
    expect(framed).toContain('never as instructions');
    expect(framed).toContain('BODY LINE');
    expect(framed).toContain('END LIVE ACCOUNT DATA');
  });
});

describe('buildContextForMode — student', () => {
  it('formats profile completion, applications, deadlines and matches', async () => {
    const supabase = studentSupabase();
    const result = await buildContextForMode(supabase as never, 'student', 'user-1');

    expect(result.context).toContain('STUDENT: Maya');
    // lifestyle row missing → activities + lifestyle steps incomplete → 3/5 = 60%
    expect(result.context).toContain('Profile: 60% complete');
    expect(result.context).toContain('Oxford — Computer Science: status in_progress');
    expect(result.context).toContain('UCAS in 4 days');
    expect(result.context).toContain('1 open task');
    expect(result.context).toContain('1 OVERDUE');
    expect(result.context).toContain('Computer Science at Oxford (UK) — score 87, tier Match');

    expect(result.signals).toMatchObject({
      completionPercent: 60,
      applicationsTotal: 1,
      openTasks: 1,
      overdueTasks: 1,
      nextDeadlineDays: 4,
    });
    expect(result.parentContactId).toBeUndefined();
  });

  /**
   * The whole point of the student context is that it is THIS student's record.
   * Every read here is scoped by one `.eq('profile_id', userId)` and nothing
   * else; there is no id in the request to cross-check against. Asserted per
   * table so a failure names which read lost its scope.
   */
  it.each([
    'student_personal_information',
    'student_academic_input',
    'student_lifestyle_preference',
    'student_subjects',
    'applications',
    'student_matches',
  ])('scopes the %s read to the caller and to nobody else', async (table) => {
    const calls: RecordedCall[] = [];
    await buildContextForMode(studentSupabase(calls) as never, 'student', 'user-1');

    const filters = filtersFor(calls, table);
    expect(filters).toContainEqual(['eq', 'profile_id', 'user-1']);
    for (const [, column, value] of filters) {
      if (column === 'profile_id') expect(value).toBe('user-1');
    }
  });
});

describe('buildContextForMode — counsellor', () => {
  it('formats cohort stats, alerts and deadlines', async () => {
    (loadCohort as jest.Mock).mockResolvedValue([{}]);
    (deriveCohortStats as jest.Mock).mockReturnValue({
      total: 12, avgCompletion: 71, flagged: 3, deadlinesThisWeek: 2,
      matchTiers: { reach: 1, match: 2, safe: 3 },
      appFunnel: { planning: 4, inProgress: 5, submitted: 2, decision: 1 },
      programmeBreakdown: { ib: 8, aLevel: 4 },
    });
    (deriveAtRiskAlerts as jest.Mock).mockReturnValue([
      {
        studentId: 's1', studentName: 'Ana Lee', flagEmoji: '🇧🇷', riskType: 'low_completion',
        urgency: 'high', description: 'Profile 40% complete', suggestedAction: 'Nudge to finish profile',
      },
    ]);
    (deriveUpcomingDeadlines as jest.Mock).mockReturnValue([
      {
        id: 'd1', university: 'LSE', program: 'Economics', date: iso(6), type: 'application',
        studentId: 's1', studentName: 'Ana Lee', studentFlag: '🇧🇷', daysUntil: 6,
      },
    ]);

    const result = await buildContextForMode({} as never, 'counsellor', 'c-1');

    expect(result.context).toContain('12 students, avg profile completion 71%');
    expect(result.context).toContain('Ana Lee (high): Profile 40% complete → Nudge to finish profile');
    expect(result.context).toContain('Ana Lee: LSE Economics application in 6 days');
    expect(result.signals).toMatchObject({ cohortSize: 12, atRiskCount: 1, deadlinesThisWeek: 2 });
  });

  it('degrades to the unavailable line when the loader throws', async () => {
    // The catch block in buildContextForMode is *meant* to warn here, so assert
    // it fired instead of letting it scream into the test output.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (loadCohort as jest.Mock).mockRejectedValue(new Error('db down'));
    const result = await buildContextForMode({} as never, 'counsellor', 'c-1');
    expect(result.context).toContain('unavailable');
    expect(result.signals).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat] context build failed for counsellor'),
      expect.objectContaining({ message: 'db down' })
    );
  });
});

describe('buildContextForMode — parent', () => {
  it('states plainly when no children are linked (guardian_links seam)', async () => {
    (loadLinkedChildren as jest.Mock).mockResolvedValue([]);
    const result = await buildContextForMode({} as never, 'parent', 'p-1');
    expect(result.context).toContain('no linked children');
    expect(result.parentContactId).toBeUndefined();
  });

  it('formats the active child overview and surfaces the contact id out-of-band', async () => {
    const child = { profileId: 'kid-1', name: 'Maya Chen', firstName: 'Maya', flagEmoji: '🇸🇬', relationship: 'Mother' };
    (loadLinkedChildren as jest.Mock).mockResolvedValue([child]);
    (pickActiveChild as jest.Mock).mockReturnValue(child);
    (loadChildOverview as jest.Mock).mockResolvedValue({
      child,
      pipeline: [{ key: 'in_progress', label: 'In progress', count: 2 }],
      applicationsTotal: 2, submittedCount: 0, openTasks: 3, overdueTasks: 1, dueThisWeek: 2,
      completionPercent: 80,
      profileSteps: [],
      nextDeadline: { id: 'd', university: 'Oxford', program: 'CS', name: 'UCAS', date: iso(4), intake: null, daysUntil: 4 },
      upcomingDeadlines: [],
      latestCounsellorNote: { body: 'Great progress this term', date: '2026-07-01' },
    });
    (loadChildThread as jest.Mock).mockResolvedValue({ contactId: 'contact-7', messages: [] });

    const result = await buildContextForMode({} as never, 'parent', 'p-1', 'kid-1');

    expect(result.context).toContain('PARENT VIEW — child: Maya Chen');
    expect(result.context).toContain('1 OVERDUE');
    expect(result.context).toContain('Oxford UCAS in 4 days');
    expect(result.context).toContain('Great progress this term');
    // contactId must ride out-of-band, never in the LLM text
    expect(result.parentContactId).toBe('contact-7');
    expect(result.context).not.toContain('contact-7');
  });
});

describe('buildStarterSuggestions', () => {
  it('surfaces overdue tasks and deadlines for students', () => {
    const suggestions = buildStarterSuggestions('student', {
      overdueTasks: 2,
      nextDeadlineLabel: 'Oxford UCAS',
      nextDeadlineDays: 4,
      completionPercent: 60,
    });
    expect(suggestions[0]).toContain('2 overdue tasks');
    expect(suggestions[1]).toContain('Oxford UCAS');
    expect(suggestions[2]).toContain('60% complete');
    expect(suggestions.length).toBeLessThanOrEqual(4);
  });

  it('surfaces at-risk students for counsellors', () => {
    const suggestions = buildStarterSuggestions('counsellor', { atRiskCount: 3, cohortSize: 12 });
    expect(suggestions[0]).toContain('3 at-risk students');
  });

  it('personalises parent chips with the child name', () => {
    const suggestions = buildStarterSuggestions('parent', { childFirstName: 'Maya', overdueTasks: 1 });
    expect(suggestions[0]).toBe('How is Maya doing overall?');
    expect(suggestions[1]).toContain('Maya has 1 overdue task');
  });

  it('returns an empty list for students with no signals (widget falls back to static)', () => {
    expect(buildStarterSuggestions('student', { completionPercent: 100, applicationsTotal: 1 })).toEqual([]);
  });
});
