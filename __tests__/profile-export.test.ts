/**
 * @jest-environment ./jest.environment-node.js
 *
 * Route handlers need the fetch globals (Request/Response), which the default
 * jsdom environment lacks; the node environment provides them natively. The
 * local wrapper exists only to sidestep a Node >=22 / jest 29 webstorage clash.
 */
import { GET } from '@/app/api/profile/export/route';

/**
 * Every `.eq()` this route makes, as `[table, column, value]`.
 *
 * `eq: jest.fn().mockReturnThis()` discards its arguments, so the tests below —
 * which pin the CSV/JSON shape and formatting in detail — said nothing about
 * whose record was exported. Repointing all five reads at
 * `.eq('profile_id', 'someone-else')` (another student's name, nationality,
 * school, grades, subjects and admissions tests, served as a download) left
 * 313 tests green. The `scopes every read` block at the bottom is the fix.
 */
const recordedFilters: Array<[table: string, column: string, value: unknown]> = [];

const buildSingleQuery = (table: string, data: unknown, error: unknown = null) => {
  const query: Record<string, unknown> = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: unknown) => {
      recordedFilters.push([table, column, value]);
      return query;
    }),
    maybeSingle: jest.fn().mockResolvedValue({ data, error })
  };
  return query;
};

const buildOrderQuery = (table: string, data: unknown, error: unknown = null) => {
  const query: Record<string, unknown> = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: unknown) => {
      recordedFilters.push([table, column, value]);
      return query;
    }),
    order: jest.fn().mockResolvedValue({ data, error })
  };
  return query;
};

const mockSupabase = () => {
  const tables = {
    profiles: buildSingleQuery('profiles', { full_name: 'Taylor Swift' }),
    student_personal_information: buildSingleQuery('student_personal_information', {
      first_name: 'Taylor',
      last_name: 'Swift',
      email: 'taylor@example.com',
      phone: null,
      nationality: 'US',
      age: 17,
      gender: 'female',
      resident_country: 'United States',
      current_location_city: 'Nashville',
      time_zone: 'America/Chicago'
    }),
    student_academic_input: buildSingleQuery('student_academic_input', {
      programme_type: 'IB',
      school_name: 'Ascenda High',
      school_country: 'United States',
      school_city: 'Nashville',
      school_type: 'international_school',
      language_of_instruction: 'english',
      graduation_year: 2026,
      desired_start_date: '2026-09-01',
      intended_clusters: ['computer_science'],
      secondary_clusters: ['business_non_quant'],
      career_aspiration: 'Engineer',
      ib_total_points: 40,
      ib_core_points: 2,
      ib_tok_grade: 'A',
      ib_ee_grade: 'B',
      ib_math_pathway: 'aa',
      ee_subject: 'Math',
      ee_title: 'Extended Essay',
      ee_summary: 'A summary',
      a_level_predicted_grades: null,
      english_required: true,
      english_test_type: 'IELTS',
      english_status: 'met',
      english_score_overall: 7.5
    }),
    student_lifestyle_preference: buildSingleQuery('student_lifestyle_preference', {
      teaching_style: 'interactive',
      desired_location_type: 'major_city',
      campus_size: 'medium',
      extracurricular_interests: ['Sports/fitness'],
      other_extracurriculars: 'Robotics club'
    }),
    student_subjects: buildOrderQuery('student_subjects', [
      { subject_name: 'Mathematics', level: 'HL', grade_value: '7' },
      { subject_name: 'Physics', level: 'HL', grade_value: '6' }
    ]),
    student_admissions_tests: buildOrderQuery('student_admissions_tests', [
      { test_type: 'LNAT', status: 'booked', score_numeric: 25, percentile: 90 }
    ])
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } })
    },
    from: jest.fn((table: keyof typeof tables) => tables[table])
  };
};

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: () => mockSupabase()
}));

describe('profile export route', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-02-20T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns a CSV export with a dated filename', async () => {
    const response = await GET(new Request('http://localhost/api/profile/export'));
    const contentType = response.headers.get('Content-Type');
    const contentDisposition = response.headers.get('Content-Disposition');
    const body = await response.text();

    expect(contentType).toBe('text/csv; charset=utf-8');
    expect(contentDisposition).toBe('attachment; filename="ascenda-taylor-swift-2025-02-20.csv"');
    expect(body).toContain('section,field,value');
    expect(body).toContain('personal_information,first_name,Taylor');
    expect(body).toContain('subjects,subject_1_name,Mathematics');
    expect(body).toContain('admissions_tests,test_1_type,LNAT');
  });

  it('returns a JSON export when requested', async () => {
    const response = await GET(new Request('http://localhost/api/profile/export?format=json'));
    const contentDisposition = response.headers.get('Content-Disposition');
    const payload = await response.json();

    expect(contentDisposition).toBe('attachment; filename="ascenda-taylor-swift-2025-02-20.json"');
    expect(payload.personal_information?.first_name).toBe('Taylor');
    expect(payload.academic_input?.programme_type).toBe('IB');
    expect(payload.subjects).toHaveLength(2);
    expect(payload.admissions_tests).toHaveLength(1);
  });
});

/**
 * The scope property, stated on its own.
 *
 * This route takes no id: it exports "the signed-in student's" whole record, and
 * six `.eq('…', user.id)` calls are the only thing that makes that sentence
 * true. There is no second control — no RLS assertion in this test, no id in the
 * URL to cross-check.
 */
describe('profile export scopes every read to the caller', () => {
  beforeEach(() => {
    recordedFilters.length = 0;
  });

  it('reads each of the six tables filtered by the caller and nothing else', async () => {
    await GET(new Request('http://localhost/api/profile/export'));

    expect(recordedFilters).toEqual([
      // The `profiles` row is keyed by `id`; the five student tables by `profile_id`.
      ['profiles', 'id', 'user-123'],
      ['student_personal_information', 'profile_id', 'user-123'],
      ['student_academic_input', 'profile_id', 'user-123'],
      ['student_lifestyle_preference', 'profile_id', 'user-123'],
      ['student_subjects', 'profile_id', 'user-123'],
      ['student_admissions_tests', 'profile_id', 'user-123']
    ]);
  });

  it('never filters on a profile other than the caller — stated negatively too', async () => {
    await GET(new Request('http://localhost/api/profile/export?format=json'));

    expect(recordedFilters).toHaveLength(6);
    for (const [, , value] of recordedFilters) {
      expect(value).toBe('user-123');
    }
  });
});
