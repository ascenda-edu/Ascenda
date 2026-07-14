import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

type CsvRow = [string, string, string];

const stringifyValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeCsv = (value: string) => {
  // Neutralise CSV/spreadsheet formula injection: a cell starting with =, +, -,
  // or @ is executed as a formula by Excel/Sheets. Prefix it with a single
  // quote so it's treated as literal text.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
};

const buildCsv = (rows: CsvRow[]) => {
  const header: CsvRow = ['section', 'field', 'value'];
  return [header, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
    .join('\n');
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export async function GET(request: Request) {
  const supabase = createRouteHandlerSupabaseClient();
  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [profileResult, personalResult, academicResult, lifestyleResult, subjectsResult, testsResult] = await Promise.all([
    // maybeSingle: a new user's missing rows are not errors — .single() would
    // add a spurious "unavailable" warning to every export for them.
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('student_personal_information').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('student_academic_input').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('student_lifestyle_preference').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('student_subjects').select('*').eq('profile_id', user.id).order('created_at', { ascending: true }),
    supabase.from('student_admissions_tests').select('*').eq('profile_id', user.id).order('created_at', { ascending: true })
  ]);

  const rows: CsvRow[] = [];
  const warnings: string[] = [];
  const pushRow = (section: string, field: string, value: unknown) => {
    rows.push([section, field, stringifyValue(value)]);
  };

  if (profileResult.error) warnings.push('Profile name was unavailable.');
  if (personalResult.error) warnings.push('Personal information was unavailable.');
  if (academicResult.error) warnings.push('Academic input was unavailable.');
  if (lifestyleResult.error) warnings.push('Lifestyle preferences were unavailable.');
  if (subjectsResult.error) warnings.push('Subject list was unavailable.');
  if (testsResult.error) warnings.push('Admissions tests were unavailable.');

  warnings.forEach((warning, index) => {
    pushRow('meta', `warning_${index + 1}`, warning);
  });

  const profileName = profileResult.data?.full_name?.trim() || '';
  const personal = personalResult.data;
  if (personal) {
    pushRow('personal_information', 'first_name', personal.first_name);
    pushRow('personal_information', 'last_name', personal.last_name);
    pushRow('personal_information', 'email', personal.email);
    pushRow('personal_information', 'phone', personal.phone);
    pushRow('personal_information', 'nationality', personal.nationality);
    pushRow('personal_information', 'age', personal.age);
    pushRow('personal_information', 'gender', personal.gender);
    pushRow('personal_information', 'resident_country', personal.resident_country);
    pushRow('personal_information', 'current_location_city', personal.current_location_city);
    pushRow('personal_information', 'time_zone', personal.time_zone);
  }

  const academic = academicResult.data;
  if (academic) {
    pushRow('academic_input', 'programme_type', academic.programme_type);
    pushRow('academic_input', 'school_name', academic.school_name);
    pushRow('academic_input', 'school_country', academic.school_country);
    pushRow('academic_input', 'school_city', academic.school_city);
    pushRow('academic_input', 'school_type', academic.school_type);
    pushRow('academic_input', 'language_of_instruction', academic.language_of_instruction);
    pushRow('academic_input', 'graduation_year', academic.graduation_year);
    pushRow('academic_input', 'desired_start_date', academic.desired_start_date);
    pushRow('academic_input', 'intended_clusters', academic.intended_clusters);
    pushRow('academic_input', 'secondary_clusters', academic.secondary_clusters);
    pushRow('academic_input', 'career_aspiration', academic.career_aspiration);
    pushRow('academic_input', 'ib_total_points', academic.ib_total_points);
    pushRow('academic_input', 'ib_core_points', academic.ib_core_points);
    pushRow('academic_input', 'ib_tok_grade', academic.ib_tok_grade);
    pushRow('academic_input', 'ib_ee_grade', academic.ib_ee_grade);
    pushRow('academic_input', 'ib_math_pathway', academic.ib_math_pathway);
    pushRow('academic_input', 'ee_subject', academic.ee_subject);
    pushRow('academic_input', 'ee_title', academic.ee_title);
    pushRow('academic_input', 'ee_summary', academic.ee_summary);
    pushRow('academic_input', 'a_level_predicted_grades', academic.a_level_predicted_grades);
    pushRow('academic_input', 'english_required', academic.english_required);
    pushRow('academic_input', 'english_test_type', academic.english_test_type);
    pushRow('academic_input', 'english_status', academic.english_status);
    pushRow('academic_input', 'english_score_overall', academic.english_score_overall);
  }

  const lifestyle = lifestyleResult.data;
  if (lifestyle) {
    pushRow('lifestyle_preference', 'teaching_style', lifestyle.teaching_style);
    pushRow('lifestyle_preference', 'desired_location_type', lifestyle.desired_location_type);
    pushRow('lifestyle_preference', 'campus_size', lifestyle.campus_size);
    pushRow('lifestyle_preference', 'extracurricular_interests', lifestyle.extracurricular_interests);
    pushRow('lifestyle_preference', 'other_extracurriculars', lifestyle.other_extracurriculars);
  }

  const subjects = subjectsResult.data ?? [];
  subjects.forEach((subject, index) => {
    const prefix = `subject_${index + 1}`;
    pushRow('subjects', `${prefix}_name`, subject.subject_name);
    pushRow('subjects', `${prefix}_level`, subject.level);
    pushRow('subjects', `${prefix}_grade`, subject.grade_value);
  });

  const tests = testsResult.data ?? [];
  tests.forEach((test, index) => {
    const prefix = `test_${index + 1}`;
    pushRow('admissions_tests', `${prefix}_type`, test.test_type);
    pushRow('admissions_tests', `${prefix}_status`, test.status);
    pushRow('admissions_tests', `${prefix}_score_numeric`, test.score_numeric);
    pushRow('admissions_tests', `${prefix}_percentile`, test.percentile);
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeName = profileName ? slugify(profileName) : '';
  const filenameBase = safeName ? `ascenda-${safeName}-${dateStamp}` : `ascenda-profile-${user.id}-${dateStamp}`;

  if (format === 'json') {
    return NextResponse.json(
      {
        meta: { profile_id: user.id, profile_name: profileName || null, exported_at: new Date().toISOString(), warnings },
        personal_information: personal ?? null,
        academic_input: academic ?? null,
        lifestyle_preference: lifestyle ?? null,
        subjects,
        admissions_tests: tests
      },
      {
        headers: {
          'Content-Disposition': `attachment; filename="${filenameBase}.json"`
        }
      }
    );
  }

  const csvContent = buildCsv(rows);

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`
    }
  });
}
