/**
 * @jest-environment ./jest.environment-node.js
 *
 * Route handlers need the fetch globals (Request/Response), which the default
 * jsdom environment lacks; the node environment provides them natively. The
 * local wrapper exists only to sidestep a Node >=22 / jest 29 webstorage clash.
 */
import { GET } from '@/app/api/profile/export/route';

const buildSingleQuery = (data: unknown, error: unknown = null) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data, error })
});

const buildOrderQuery = (data: unknown, error: unknown = null) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({ data, error })
});

const mockSupabase = () => {
  const tables = {
    profiles: buildSingleQuery({ full_name: 'Taylor Swift' }),
    student_personal_information: buildSingleQuery({
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
    student_academic_input: buildSingleQuery({
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
    student_lifestyle_preference: buildSingleQuery({
      teaching_style: 'interactive',
      desired_location_type: 'major_city',
      campus_size: 'medium',
      extracurricular_interests: ['Sports/fitness'],
      other_extracurriculars: 'Robotics club'
    }),
    student_subjects: buildOrderQuery([
      { subject_name: 'Mathematics', level: 'HL', grade_value: '7' },
      { subject_name: 'Physics', level: 'HL', grade_value: '6' }
    ]),
    student_admissions_tests: buildOrderQuery([
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
