import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchingWeights } from './config';
import { filterVisiblePrograms, getFlaggedProgramIds } from '../catalog/visibility';
import type { Database } from '../types/database';
import type { EnrichedMatch, MissingProfileSection } from './types';
import type { MatchTier } from './match-tier';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import type { CourseRecord, EnrichedCourseRecord } from '@/lib/tiering/course_tiering';
import { rankCourseMatches, resolveTargetFields, type RankedCourseMatch } from '@/lib/matching/matching_engine';

type StudentAcademicInputRow = Database['public']['Tables']['student_academic_input']['Row'];
type StudentLifestyleRow = Database['public']['Tables']['student_lifestyle_preference']['Row'];
type StudentSubjectRow = Database['public']['Tables']['student_subjects']['Row'];
type StudentAdmissionsTestRow = Database['public']['Tables']['student_admissions_tests']['Row'];
type ProgramRow = Database['public']['Tables']['programs']['Row'];
type CourseScoringRow = Record<string, unknown>;
type ProgramSummaryRow = Pick<ProgramRow, 'id' | 'metadata'>;

type Client = SupabaseClient<Database>;

type LoadMatchesOptions = {
  programLimit?: number;
  resultLimit?: number;
  weights?: MatchingWeights;
  forceRefresh?: boolean;
};

export type MatchComputationResult = {
  matches: EnrichedMatch[];
  catalogSize: { programs: number; universities: number };
  missingSections: MissingProfileSection[];
  error?: { stage: 'profile' | 'programs' | 'universities' | 'requirements'; message: string };
};

const PROGRAM_PAGE_SIZE = 500;
const PROGRAM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROGRAM_CACHE_WINDOW_MS = 5 * 60 * 1000;
const DEMO_TIER1_UNIVERSITY_KEYWORDS = [
  'london school of economics',
  'university of oxford',
  'university of cambridge',
  'imperial college london',
  'university college london'
];

const assignDemoTierMix = (matches: EnrichedMatch[]): EnrichedMatch[] => {
  if (matches.length < 3) return matches;

  const isTier1University = (name: string, rankOverall: number | null, averageOutcomes: number) => {
    if (typeof rankOverall === 'number' && rankOverall > 0 && rankOverall <= 30) return true;
    const normalized = name.trim().toLowerCase();
    if (DEMO_TIER1_UNIVERSITY_KEYWORDS.some((keyword) => normalized.includes(keyword))) return true;
    // Fallback for sparse ranking data: treat strongest outcome bands as tier 1.
    return averageOutcomes >= 75;
  };

  const byUniversity = new Map<
    string,
    {
      university: string;
      rankOverall: number | null;
      matchIndexes: number[];
      outcomesTotal: number;
    }
  >();

  matches.forEach((match, index) => {
    const key = match.university.id || match.university.name;
    const existing = byUniversity.get(key);
    const outcomes = match.breakdown.outcomes ?? 0;
    if (existing) {
      existing.matchIndexes.push(index);
      existing.outcomesTotal += outcomes;
      return;
    }
    byUniversity.set(key, {
      university: match.university.name,
      rankOverall: match.university.rankOverall ?? null,
      matchIndexes: [index],
      outcomesTotal: outcomes
    });
  });

  const universities = Array.from(byUniversity.entries())
    .map(([key, value]) => ({
      key,
      ...value,
      averageOutcomes: value.matchIndexes.length ? value.outcomesTotal / value.matchIndexes.length : 0
    }))
    .sort((a, b) => b.averageOutcomes - a.averageOutcomes);

  const reachKeys = new Set(
    universities
      .filter((entry) => isTier1University(entry.university, entry.rankOverall, entry.averageOutcomes))
      .map((entry) => entry.key)
  );
  const nonReach = universities.filter((entry) => !reachKeys.has(entry.key));

  const matchKeys = new Set<string>();
  const safeKeys = new Set<string>();
  nonReach.forEach((entry, index) => {
    if (index < Math.ceil(nonReach.length / 2)) matchKeys.add(entry.key);
    else safeKeys.add(entry.key);
  });

  if (matchKeys.size === 0 && safeKeys.size > 0) {
    const promoted = Array.from(safeKeys)[0];
    safeKeys.delete(promoted);
    matchKeys.add(promoted);
  }
  if (safeKeys.size === 0 && matchKeys.size > 1) {
    const demoted = Array.from(matchKeys)[matchKeys.size - 1];
    matchKeys.delete(demoted);
    safeKeys.add(demoted);
  }

  const assignUniversityTier = (key: string): MatchTier => {
    if (reachKeys.has(key)) return 'Reach';
    if (matchKeys.has(key)) return 'Match';
    return 'Safe';
  };

  const tierCounters: Record<MatchTier, number> = {
    Reach: 0,
    Match: 0,
    Safe: 0
  };

  const scoreFromTier = (tier: MatchTier, index: number) => {
    if (tier === 'Safe') return Math.max(82, 92 - index);
    if (tier === 'Match') return Math.max(50, 70 - index);
    return Math.max(28, 44 - index);
  };

  return matches.map((match) => {
    const key = match.university.id || match.university.name;
    const tier = assignUniversityTier(key);
    const score = scoreFromTier(tier, tierCounters[tier]);
    tierCounters[tier] += 1;
    return { ...match, score, tier };
  });
};

const applyProgramVisibilityFilters = (query: any) => {
  const flagged = getFlaggedProgramIds();
  if (!flagged.length) return query.order('id', { ascending: true });

  const formatted = flagged.map((id) => `"${id}"`).join(',');
  return query.not('id', 'in', `(${formatted})`).order('id', { ascending: true });
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const asCostOfLife = (value: unknown): CourseRecord['cost_of_life'] => {
  if (!value) return null;
  const normalized = String(value).toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') return normalized;
  return null;
};

type CourseSource = EnrichedCourseRecord & {
  program_id: string;
  university_id: string;
  program_level: string | null;
  program_language: string | null;
  program_mode: string | null;
  program_tuition: number | null;
  program_currency: string | null;
  program_url: string | null;
  university_country: string;
  university_rank_overall: number | null;
  university_rank_source: string | null;
  university_requires_test: boolean | null;
};

const buildStudentPayload = (params: {
  academic: StudentAcademicInputRow;
  lifestyle: StudentLifestyleRow | null;
  subjects: StudentSubjectRow[];
  admissionsTests: StudentAdmissionsTestRow[];
  activities: StudentProfilePayload['activities_list'];
}): StudentProfilePayload => {
  const programmeType = params.academic.programme_type ?? 'IB';
  const subjectList = params.subjects.map((subject) => {
    const rawGrade = subject.grade_value ?? '';
    const numericGrade = programmeType === 'IB' ? asNumber(rawGrade) : null;
    return {
      subject_name: subject.subject_name ?? '',
      level: subject.level ?? (programmeType === 'IB' ? 'HL' : 'A_LEVEL'),
      grade_value: programmeType === 'IB' ? numericGrade : rawGrade
    };
  });

  return {
    personal_information: {
      first_name: '',
      last_name: '',
      email: '',
      phone: null,
      nationality: '',
      age: null,
      gender: null,
      resident_country: '',
      current_location_city: null,
      time_zone: null
    },
    academic_input: {
      programme_type: programmeType,
      school_name: params.academic.school_name ?? '',
      school_country: params.academic.school_country ?? '',
      school_city: params.academic.school_city ?? null,
      school_type: params.academic.school_type ?? null,
      language_of_instruction: params.academic.language_of_instruction ?? null,
      graduation_year: params.academic.graduation_year ?? new Date().getFullYear(),
      desired_start_date: params.academic.desired_start_date ?? null,
      intended_clusters: (params.academic.intended_clusters ?? []) as StudentProfilePayload['academic_input']['intended_clusters'],
      secondary_clusters: (params.academic.secondary_clusters ?? []) as StudentProfilePayload['academic_input']['secondary_clusters'],
      career_aspiration: params.academic.career_aspiration ?? null,
      subject_list: subjectList,
      ib_total_points: params.academic.ib_total_points ?? null,
      ib_core_points: params.academic.ib_core_points ?? null,
      ib_tok_grade: params.academic.ib_tok_grade ?? null,
      ib_ee_grade: params.academic.ib_ee_grade ?? null,
      ib_math_pathway: params.academic.ib_math_pathway ?? null,
      ee_subject: params.academic.ee_subject ?? null,
      ee_title: params.academic.ee_title ?? null,
      ee_summary: params.academic.ee_summary ?? null,
      a_level_predicted_grades: (params.academic.a_level_predicted_grades ?? null) as StudentProfilePayload['academic_input']['a_level_predicted_grades'],
      english_required: params.academic.english_required ?? null,
      english_test_type: params.academic.english_test_type ?? 'NONE',
      english_status: params.academic.english_status ?? 'missing',
      english_score_overall: params.academic.english_score_overall ?? null,
      admissions_tests: params.admissionsTests.map((test) => ({
        test_type: test.test_type ?? 'NONE',
        status: test.status ?? 'missing',
        score_numeric: test.score_numeric ?? null,
        percentile: test.percentile ?? null
      }))
    },
    lifestyle_preference: {
      teaching_style: params.lifestyle?.teaching_style ?? null,
      desired_location_type: params.lifestyle?.desired_location_type ?? null,
      campus_size: params.lifestyle?.campus_size ?? null,
      extracurricular_interests: params.lifestyle?.extracurricular_interests ?? [],
      other_extracurriculars: params.lifestyle?.other_extracurriculars ?? null,
      leadership_roles: params.lifestyle?.leadership_roles ?? [],
      commitment_level: params.lifestyle?.commitment_level ?? null,
      key_activities: params.lifestyle?.key_activities ?? [],
      sat_score: params.lifestyle?.sat_score ?? null,
      act_score: params.lifestyle?.act_score ?? null,
      intl_experience: params.lifestyle?.intl_experience ?? [],
      work_experience: params.lifestyle?.work_experience ?? null,
      work_experience_summary: params.lifestyle?.work_experience_summary ?? null,
      ambition_statement: params.lifestyle?.ambition_statement ?? null,
      epq_subject: (params.lifestyle as any)?.epq_subject ?? null,
      epq_title: (params.lifestyle as any)?.epq_title ?? null,
    },
    activities_list: params.activities ?? [],
  };
};

const toTier = (value: unknown): 1 | 2 | 3 | 4 | 5 => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5) return parsed;
  return 5;
};

const toPlacementYear = (value: unknown, detail: string | null): string | null => {
  if (detail && detail.trim()) return detail.trim();
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return asString(value);
};

const mapCourseScoringRow = (row: CourseScoringRow): CourseSource => {
  // The view computes university_score, course_selectivity_score, total_course_score
  // from ranking columns — but for the all_countries_programs import those rankings are
  // often null, producing default 30/40/5 values.  The real pre-computed scores live in
  // programs.metadata.  We read them via extra columns the view now exposes (meta_*),
  // or fall back to the view's computed values.
  const metaTotalScore = asNumber((row as any).meta_total_course_score);
  const metaSelectivity = asNumber((row as any).meta_selectivity_score);
  const metaUniScore = asNumber((row as any).meta_university_score);
  const metaTier = asNumber((row as any).meta_course_tier);

  const viewUniScore = asNumber(row.university_score) ?? 0;
  const viewSelectivity = asNumber(row.course_selectivity_score) ?? 0;
  const viewTotal = asNumber(row.total_course_score) ?? Math.round(viewUniScore * 0.6 + viewSelectivity * 0.4);
  const viewTier = toTier(row.course_tier);

  const universityScore = metaUniScore ?? viewUniScore;
  const selectivityScore = metaSelectivity ?? viewSelectivity;
  const totalScore = metaTotalScore ?? viewTotal;
  const courseTier = metaTier != null && metaTier >= 1 && metaTier <= 5
    ? (metaTier as 1 | 2 | 3 | 4 | 5)
    : viewTier;
  const genderRatio = row.gender_ratio_pct;
  const genderRatioText =
    typeof genderRatio === 'number' ? String(genderRatio) : asString(genderRatio);

  return {
    university: asString(row.university) ?? 'University',
    city: asString(row.city) ?? '',
    level: asString(row.level) ?? 'Undergraduate',
    degree_type: asString(row.degree_type) ?? asString(row.course) ?? 'Undergraduate degree',
    field_of_study: asString(row.field_of_study),
    course: asString(row.course) ?? 'Course',
    duration: asString(row.duration),
    qs_uk_rank: null,
    times_sunday_rank: null,
    guardian_rank: null,
    acceptance_rate_pct: asNumber(row.acceptance_rate_pct),
    nss_score_pct: asNumber(row.nss_score_pct),
    intake_size: asNumber(row.intake_size),
    gender_ratio_pct: genderRatioText,
    international_students_ratio_pct: asNumber(row.international_students_ratio_pct),
    student_to_staff_ratio: asNumber(row.student_to_staff_ratio),
    yearly_international_tuition_fee_gbp: asNumber(row.yearly_international_tuition_fee_gbp),
    student_dorm_cost_gbp_per_year: asNumber(row.student_dorm_cost_gbp_per_year),
    average_rent_outside_campus_gbp_per_month: asNumber(row.average_rent_outside_campus_gbp_per_month),
    cost_of_life: asCostOfLife(row.cost_of_life),
    min_ib_score: asNumber(row.min_ib_score),
    min_a_level_score: asString(row.min_a_level_score),
    preferred_subjects: asString(row.preferred_subjects),
    english_score_requirement: asString(row.english_score_requirement),
    course_online_page: asString(row.course_online_page),
    ucas_code: asString(row.ucas_code),
    ucas_deadline: asString(row.ucas_deadline),
    admission_test: asString(row.admission_test),
    interview: asString(row.interview),
    university_life: asString(row.university_life),
    number_of_students: asNumber(row.number_of_students),
    transport_accessibility: asString(row.transport_accessibility),
    cultural_social_environment: asString(row.cultural_social_environment),
    city_life: asString(row.city_life),
    climate: asString(row.climate),
    safety_index: asString(row.safety_index),
    study_abroad_option: asString(row.study_abroad_option),
    graduate_employment_rate_pct: asNumber(row.graduate_employment_rate_pct),
    average_starting_salary_gbp: asNumber(row.average_starting_salary_gbp),
    top_industries: asString(row.top_industries),
    placement_year: toPlacementYear(row.placement_year, asString(row.placement_year_detail)),
    university_score: Math.round(universityScore),
    course_selectivity_score: Math.round(selectivityScore),
    total_course_score: Math.round(totalScore),
    course_tier: courseTier,
    explanations: [
      `University ranking score: ${Math.round(universityScore)}/100`,
      `Course selectivity score: ${Math.round(selectivityScore)}/100`,
      `Total score: ${Math.round(totalScore)}/100`,
      `Tier ${courseTier} based on total score`
    ],
    program_id: String(row.program_id ?? row.course_id ?? ''),
    university_id: String(row.university_id ?? ''),
    program_level: asString(row.level),
    program_language: asString(row.program_language),
    program_mode: asString(row.program_mode),
    program_tuition: asNumber(row.program_tuition),
    program_currency: asString(row.program_currency),
    program_url: asString(row.program_url),
    university_country: asString(row.university_country) ?? 'United Kingdom',
    university_rank_overall: asNumber(row.university_rank_overall),
    university_rank_source: asString(row.university_rank_source),
    university_requires_test: (row.university_requires_test as boolean | null) ?? null
  };
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

const latestTimestampMs = (timestamps: Array<string | null | undefined>): number | null => {
  const values = timestamps
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Math.max(...values);
};

export const loadMatchesForProfile = async (
  supabase: Client,
  profileId: string,
  options: LoadMatchesOptions = {}
): Promise<MatchComputationResult> => {
  // Demo tier override disabled — v4 engine handles tiers natively.
  const forceDemoTierMix = false;
  const programLimit = options.programLimit ?? 5000;

  const [
    { data: academicData, error: academicError },
    { data: lifestyleData, error: lifestyleError },
    { data: subjectsData, error: subjectsError },
    { data: admissionsData, error: admissionsError },
    activitiesResponse
  ] = await Promise.all([
    supabase.from('student_academic_input').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('student_lifestyle_preference').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('student_subjects').select('*').eq('profile_id', profileId),
    supabase.from('student_admissions_tests').select('*').eq('profile_id', profileId),
    // student_activities postdates the generated types — cast like the score loader does.
    (supabase as any).from('student_activities').select('*').eq('profile_id', profileId).order('sort_order')
  ]);

  const activitiesList: StudentProfilePayload['activities_list'] = (
    ((activitiesResponse as any)?.data ?? []) as any[]
  ).map((a, i) => ({
    id: a.id,
    category: a.category ?? '',
    level: a.level ?? null,
    duration: a.duration ?? null,
    highlight: a.highlight ?? null,
    sort_order: a.sort_order ?? i
  }));

  const profileErrors = [academicError, lifestyleError, subjectsError, admissionsError].filter(
    (err) => err && err.code !== 'PGRST116'
  );
  if (profileErrors.length > 0) {
    return {
      matches: [],
      catalogSize: { programs: 0, universities: 0 },
      missingSections: [],
      error: { stage: 'profile', message: 'Failed to load profile data' }
    };
  }

  const missingSections: MissingProfileSection[] = [];
  if (!academicData) missingSections.push('academic_input');
  if (!subjectsData || subjectsData.length === 0) missingSections.push('academic_details');
  if (!lifestyleData) missingSections.push('lifestyle_preferences');

  if (missingSections.length > 0) {
    return {
      matches: [],
      catalogSize: { programs: 0, universities: 0 },
      missingSections
    };
  }

  const profileFreshnessMs = latestTimestampMs([
    academicData?.updated_at,
    lifestyleData?.updated_at,
    ...((subjectsData ?? []).map((subject) => subject.created_at) as Array<string | null | undefined>),
    ...((admissionsData ?? []).map((test) => test.created_at) as Array<string | null | undefined>),
    ...((((activitiesResponse as any)?.data ?? []) as any[]).map((a) => a.created_at) as Array<
      string | null | undefined
    >)
  ]);

  const latestMatchMeta = await supabase
    .from('student_matches')
    .select('created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!forceDemoTierMix && !options.forceRefresh && latestMatchMeta.data?.created_at) {
    const latestCreatedAt = new Date(latestMatchMeta.data.created_at);
    if (Number.isFinite(latestCreatedAt.valueOf())) {
      const age = Date.now() - latestCreatedAt.getTime();
      const isFreshAgainstProfile = profileFreshnessMs === null || latestCreatedAt.getTime() >= profileFreshnessMs;
      if (age >= 0 && age <= PROGRAM_CACHE_TTL_MS && isFreshAgainstProfile) {
        const windowStart = new Date(latestCreatedAt.getTime() - PROGRAM_CACHE_WINDOW_MS).toISOString();
        // Paginate cache reads — Supabase defaults to 1000 rows max
        const cachedRows: any[] = [];
        let cacheOffset = 0;
        const CACHE_PAGE = 1000;
        while (true) {
          const { data: page, error: pageError } = await supabase
            .from('student_matches')
            .select('program_id, score, breakdown, created_at')
            .eq('profile_id', profileId)
            .gte('created_at', windowStart)
            .order('score', { ascending: false })
            .range(cacheOffset, cacheOffset + CACHE_PAGE - 1);
          if (pageError || !page || page.length === 0) break;
          cachedRows.push(...page);
          if (page.length < CACHE_PAGE) break;
          cacheOffset += CACHE_PAGE;
        }
        const cachedError = null;
        if (!cachedError && cachedRows && cachedRows.length > 0) {
          const cachedMatches = cachedRows
            .map((row) => {
              const breakdown = (row.breakdown ?? {}) as Record<string, number | string>;
              const programName = typeof breakdown.program_name === 'string' ? breakdown.program_name : null;
              const universityName = typeof breakdown.university_name === 'string' ? breakdown.university_name : null;
              const universityCountry = typeof breakdown.university_country === 'string' ? breakdown.university_country : null;
              if (!programName || !universityName || !universityCountry) return null;

              const cachedTier = (breakdown.tier as MatchTier | undefined) ?? null;
              const fallbackTier: MatchTier =
                (row.score ?? 0) >= 70 ? 'Safe' : (row.score ?? 0) >= 50 ? 'Match' : 'Reach';

              return {
                program: {
                  id: row.program_id,
                  name: programName,
                  field: typeof breakdown.program_field === 'string' ? breakdown.program_field : null,
                  level: typeof breakdown.program_level === 'string' ? breakdown.program_level : null,
                  language: typeof breakdown.program_language === 'string' ? breakdown.program_language : null,
                  mode: typeof breakdown.program_mode === 'string' ? breakdown.program_mode : null,
                  tuition: typeof breakdown.program_tuition === 'number' ? breakdown.program_tuition : null,
                  currency: typeof breakdown.program_currency === 'string' ? breakdown.program_currency : null,
                  url: typeof breakdown.program_url === 'string' ? breakdown.program_url : null
                },
                university: {
                  id: typeof breakdown.university_id === 'string' ? breakdown.university_id : '',
                  name: universityName,
                  country: universityCountry,
                  rankOverall: typeof breakdown.university_rank_overall === 'number' ? breakdown.university_rank_overall : null,
                  rankSource: typeof breakdown.university_rank_source === 'string' ? breakdown.university_rank_source : null,
                  requiresTest: typeof breakdown.university_requires_test === 'boolean' ? breakdown.university_requires_test : null
                },
                score: row.score ?? 0,
                breakdown: {
                  eligibility: typeof breakdown.eligibility === 'number' ? breakdown.eligibility : 0,
                  academicFit: typeof breakdown.academicFit === 'number' ? breakdown.academicFit : 0,
                  preferenceFit: typeof breakdown.preferenceFit === 'number' ? breakdown.preferenceFit : 0,
                  outcomes: typeof breakdown.outcomes === 'number' ? breakdown.outcomes : 0
                },
                blockingReasons: [],
                tier: cachedTier ?? fallbackTier
              } as EnrichedMatch;
            })
            .filter((value): value is EnrichedMatch => value !== null);

          if (cachedMatches.length > 0) {
            const cachedWithRecognition = cachedMatches.map((m) => {
              const bd = (cachedRows.find((r) => r.program_id === m.program.id)?.breakdown ?? {}) as Record<string, unknown>;
              const recScore = typeof bd.university_recognition_score === 'number' ? bd.university_recognition_score : 3;
              return { match: m, recScore };
            });
            cachedWithRecognition.sort((a, b) => {
              const keyA = a.match.score + (a.recScore / 10) * 5;
              const keyB = b.match.score + (b.recScore / 10) * 5;
              return keyB - keyA;
            });
            const sortedCachedMatches = cachedWithRecognition.map((x) => x.match);
            const limited = options.resultLimit ? sortedCachedMatches.slice(0, options.resultLimit) : sortedCachedMatches;
            const universitiesCount = new Set(sortedCachedMatches.map((match) => match.university.id)).size;
            return {
              matches: limited,
              catalogSize: { programs: cachedMatches.length, universities: universitiesCount },
              missingSections
            };
          }
        }
      }
    }
  }

  // Pre-compute target field labels from student clusters for DB-level filtering.
  // This lets us load far more relevant programs within the limit rather than
  // getting a random cross-section of the 120k catalog.
  const studentClusters = [
    ...(academicData?.intended_clusters ?? []),
    ...(academicData?.secondary_clusters ?? [])
  ] as import('@/lib/profile/intake-types').IntendedCluster[];
  const targetFields = resolveTargetFields(studentClusters);
  const fieldLabels = targetFields ? Array.from(targetFields) : null;

  const programsData: ProgramSummaryRow[] = [];
  let offset = 0;
  while (programsData.length < programLimit) {
    const rangeFrom = offset;
    const rangeTo = Math.min(offset + PROGRAM_PAGE_SIZE - 1, programLimit - 1);
    let programQuery = supabase.from('programs').select('id,metadata');
    // If the student has field preferences, filter to matching programs at the DB level
    if (fieldLabels && fieldLabels.length > 0) {
      programQuery = programQuery.in('field', fieldLabels);
    }
    programQuery = applyProgramVisibilityFilters(programQuery).range(rangeFrom, rangeTo);
    const { data, error: programsError } = await programQuery;
    if (programsError) {
      console.error('Failed to load catalog data', { programsError });
      return {
        matches: [],
        catalogSize: { programs: 0, universities: 0 },
        missingSections,
        error: { stage: 'programs', message: 'Failed to load programs' }
      };
    }
    if (!data || data.length === 0) break;
    programsData.push(...data);
    if (data.length < PROGRAM_PAGE_SIZE) break;
    offset += PROGRAM_PAGE_SIZE;
  }

  if (programsData.length === 0) {
    return {
      matches: [],
      catalogSize: { programs: 0, universities: 0 },
      missingSections
    };
  }

  const normalizeMetadata = (value: unknown): Record<string, unknown> | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  };

  const visibilityCheck = (programsData ?? []).map((p) => ({
    id: p.id,
    metadata: normalizeMetadata((p as any).metadata)
  }));
  const visibleIds = new Set(filterVisiblePrograms(visibilityCheck).map((p) => p.id));
  const filteredPrograms = (programsData ?? []).filter((p) => visibleIds.has(p.id));

  if (!filteredPrograms.length) {
    return {
      matches: [],
      catalogSize: { programs: filteredPrograms.length, universities: 0 },
      missingSections
    };
  }

  const programIds = filteredPrograms.map((program) => program.id);

  // Build a metadata lookup so we can inject pre-computed scores from the
  // all_countries_programs import into the course rows after loading from the view.
  const metadataByProgramId = new Map<string, Record<string, unknown>>();
  for (const p of filteredPrograms) {
    const meta = normalizeMetadata((p as any).metadata);
    if (meta) metadataByProgramId.set(p.id, meta);
  }

  const courseColumns = [
    'course_id',
    'program_id',
    'university_id',
    'university',
    'course',
    'city',
    'ucas_code',
    'level',
    'degree_type',
    'field_of_study',
    'duration',
    'nss_score_pct',
    'intake_size',
    'gender_ratio_pct',
    'student_to_staff_ratio',
    'yearly_international_tuition_fee_gbp',
    'cost_of_life',
    'min_ib_score',
    'min_a_level_score',
    'preferred_subjects',
    'english_score_requirement',
    'course_online_page',
    'ucas_deadline',
    'admission_test',
    'interview',
    'university_life',
    'number_of_students',
    'study_abroad_option',
    'average_starting_salary_gbp',
    'top_industries',
    'placement_year',
    'placement_year_detail',
    'program_language',
    'program_mode',
    'program_tuition',
    'program_currency',
    'program_url',
    'university_country',
    'university_rank_overall',
    'university_rank_source',
    'university_requires_test',
    'university_score',
    'course_selectivity_score',
    'total_course_score',
    'course_tier'
  ].join(',');

  const courseRows: CourseScoringRow[] = [];
  for (const batch of chunk(programIds, 200)) {
    const { data, error } = await supabase
      .from('course_scoring_v1' as any)
      .select(courseColumns)
      .in('course_id', batch);
    if (error) {
      console.error('Failed to load catalog data', { courseScoringError: error });
      return {
        matches: [],
        catalogSize: { programs: filteredPrograms.length, universities: 0 },
        missingSections,
        error: { stage: 'programs', message: 'Failed to load course scoring view' }
      };
    }
    courseRows.push(...((data as unknown as CourseScoringRow[]) ?? []));
  }

  if (!courseRows.length) {
    return {
      matches: [],
      catalogSize: { programs: filteredPrograms.length, universities: 0 },
      missingSections,
      error: { stage: 'programs', message: 'Course scoring view returned no rows' }
    };
  }

  // Inject pre-computed metadata scores into each course row before mapping,
  // so mapCourseScoringRow can prefer them over the view's ranking-derived defaults.
  const enrichedCourses = courseRows.map((row) => {
    const pid = String(row.program_id ?? row.course_id ?? '');
    const meta = metadataByProgramId.get(pid);
    if (meta) {
      if (meta.total_course_score != null && row.meta_total_course_score == null) {
        (row as any).meta_total_course_score = meta.total_course_score;
      }
      if (meta.selectivity_score != null && row.meta_selectivity_score == null) {
        (row as any).meta_selectivity_score = meta.selectivity_score;
      }
      if (meta.course_tier != null && row.meta_course_tier == null) {
        (row as any).meta_course_tier = meta.course_tier;
      }
      if (meta.university_score != null && row.meta_university_score == null) {
        (row as any).meta_university_score = meta.university_score;
      }
    }
    return mapCourseScoringRow(row);
  });

  const universitiesCount = new Set(enrichedCourses.map((course) => course.university_id)).size;

  // Fetch recognition scores for all universities in the catalog up front.
  // Used both for pinning high-prestige schools that fall below the result cap
  // and for the final recognition-boosted sort.
  const allUniIds = [...new Set(enrichedCourses.map((c) => c.university_id).filter(Boolean))];
  const recognitionByUniId = new Map<string, number>();
  if (allUniIds.length > 0) {
    const { data: recData } = await (supabase as any)
      .from('universities')
      .select('id, recognition_score')
      .in('id', allUniIds);
    for (const row of (recData ?? []) as Array<{ id: string; recognition_score: number }>) {
      if (row.id && typeof row.recognition_score === 'number') {
        recognitionByUniId.set(row.id, row.recognition_score);
      }
    }
  }

  const studentPayload = buildStudentPayload({
    academic: academicData!,
    lifestyle: lifestyleData ?? null,
    subjects: (subjectsData ?? []) as StudentSubjectRow[],
    admissionsTests: (admissionsData ?? []) as StudentAdmissionsTestRow[],
    activities: activitiesList
  });
  const studentScore = scoreStudentProfile(studentPayload);
  const { error: scorePersistError } = await supabase.from('student_scores').upsert({
    profile_id: profileId,
    total_score: studentScore.total_score,
    student_band: studentScore.student_band,
    eligibility_flags: studentScore.eligibility_flags,
    readiness_flags: studentScore.readiness_flags,
    breakdown: studentScore.breakdown
  });
  if (scorePersistError) {
    console.warn('Failed to persist student score', scorePersistError);
  }
  const ranked = rankCourseMatches(studentPayload, studentScore, enrichedCourses)
    .filter((match) => !match.excluded);

  if (process.env.MATCH_DEBUG === '1') {
    const byTier = {
      Safety: ranked.filter((m) => m.tier_fit === 'Safety').length,
      Target: ranked.filter((m) => m.tier_fit === 'Target').length,
      Reach: ranked.filter((m) => m.tier_fit === 'Reach').length,
      Hard: ranked.filter((m) => m.tier_fit === 'Harder-than-reach').length
    };
    const sample = ranked.slice(0, 8).map((m) => ({
      uni: m.university,
      course: m.course,
      tier: m.tier_fit,
      chance: m.chance_percent,
      courseTier: m.course_tier
    }));
    console.info('[match-debug]', {
      profileId,
      studentIb: studentPayload.academic_input.ib_total_points,
      enrichedCount: enrichedCourses.length,
      rankedCount: ranked.length,
      byTier,
      sample
    });
  }

  // Apply result limit per-tier to ensure balanced Reach/Match/Safe representation.
  // Without this, a top-N cut returns only Safety results (highest admission %).
  // After capping, we pin programs from high-recognition universities (score ≥ 9) that
  // would otherwise be cut off — prestigious schools always appear as Reach options.
  let limited: RankedCourseMatch[];
  if (options.resultLimit) {
    const perTier = Math.ceil(options.resultLimit / 3);
    const safety = ranked.filter((m) => m.tier_fit === 'Safety').slice(0, perTier);
    const target = ranked.filter((m) => m.tier_fit === 'Target').slice(0, perTier);
    const reachAll = ranked.filter((m) => m.tier_fit === 'Reach' || m.tier_fit === 'Harder-than-reach');
    const reach = reachAll.slice(0, perTier);

    // Pin top-recognition universities that got cut off from the Reach cap
    const includedIds = new Set([...reach, ...target, ...safety].map((m) => m.program_id));
    const cutOffReach = reachAll.slice(perTier);
    const pinnedReach: RankedCourseMatch[] = [];
    const pinnedUniCounts = new Map<string, number>();
    for (const m of cutOffReach) {
      const course = enrichedCourses.find((c) => c.program_id === m.program_id);
      if (!course) continue;
      const recScore = recognitionByUniId.get(course.university_id) ?? 3;
      if (recScore < 9) continue;
      const uniCount = pinnedUniCounts.get(course.university_id) ?? 0;
      if (uniCount >= 3) continue;
      if (includedIds.has(m.program_id)) continue;
      pinnedReach.push(m);
      pinnedUniCounts.set(course.university_id, uniCount + 1);
      includedIds.add(m.program_id);
    }

    limited = [...reach, ...pinnedReach, ...target, ...safety];
  } else {
    limited = ranked;
  }

  const toKey = (value: { university: string; course: string; ucas_code?: string | null }) =>
    `${value.university}::${value.course}::${value.ucas_code ?? ''}`;
  const courseLookup = new Map(enrichedCourses.map((course) => [toKey(course), course]));
  const courseByProgramId = new Map(enrichedCourses.map((course) => [course.program_id, course]));

  const assignTierFromFit = (fit: RankedCourseMatch['tier_fit']): MatchTier => {
    if (fit === 'Safety') return 'Safe';
    if (fit === 'Target') return 'Match';
    return 'Reach';
  };

  let matches: EnrichedMatch[] = limited
    .map((match) => {
      const course =
        (match.program_id ? courseByProgramId.get(match.program_id) : null) ??
        courseLookup.get(toKey(match));
      if (!course) return null;
      const tier: MatchTier = assignTierFromFit(match.tier_fit);
      return {
        program: {
          id: course.program_id,
          name: course.course,
          field: course.field_of_study ?? null,
          level: course.program_level ?? course.level ?? null,
          language: course.program_language ?? null,
          mode: course.program_mode ?? null,
          tuition: course.program_tuition ?? null,
          currency: course.program_currency ?? null,
          url: course.program_url ?? null
        },
        university: {
          id: course.university_id,
          name: course.university,
          country: course.university_country,
          rankOverall: course.university_rank_overall,
          rankSource: course.university_rank_source,
          requiresTest: course.university_requires_test ?? null
        },
        score: match.chance_percent,
        breakdown: {
          eligibility: match.excluded ? 0 : 100,
          academicFit: Math.min(100, Math.round(studentScore.total_score / 2)),
          preferenceFit: 0,
          outcomes: course.total_course_score
        },
        blockingReasons: match.reasons,
        tier
      } as EnrichedMatch;
    })
    .filter((value): value is EnrichedMatch => value !== null);

  // Redistribute tiers by score percentile when the engine collapses everything
  // into one tier (common when catalog programs lack real selectivity data).
  // Semantically correct: Reach = lowest admission chance relative to the set,
  // Safe = highest. Ensures students always see a useful Reach/Match/Safe spread.
  const tierCounts = matches.reduce((acc, m) => { acc[m.tier] = (acc[m.tier] ?? 0) + 1; return acc; }, {} as Record<MatchTier, number>);
  const dominantTierPct = Math.max(...Object.values(tierCounts)) / (matches.length || 1);
  if (dominantTierPct > 0.75 && matches.length >= 6) {
    const sorted = [...matches].sort((a, b) => b.score - a.score);
    const n = sorted.length;
    matches = sorted.map((m, i) => {
      const pct = i / n;
      const tier: MatchTier = pct < 0.35 ? 'Safe' : pct < 0.65 ? 'Match' : 'Reach';
      return { ...m, tier };
    });
  }

  // Apply recognition-boosted sort: well-known universities surface before unknown
  // ones when admission chances are similar (up to +5 pts boost for score-10 schools).
  matches = matches
    .map((m) => ({ m, key: m.score + ((recognitionByUniId.get(m.university.id) ?? 3) / 10) * 5 }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.m);

  if (matches.length > 0) {
    const cachePayload = matches.map((match) => ({
      profile_id: profileId,
      program_id: match.program.id,
      score: match.score,
      breakdown: {
        ...match.breakdown,
        tier: match.tier,
        program_name: match.program.name,
        program_field: match.program.field,
        program_level: match.program.level,
        program_language: match.program.language,
        program_mode: match.program.mode,
        program_tuition: match.program.tuition,
        program_currency: match.program.currency,
        program_url: match.program.url,
        university_id: match.university.id,
        university_name: match.university.name,
        university_country: match.university.country,
        university_rank_overall: match.university.rankOverall,
        university_rank_source: match.university.rankSource,
        university_requires_test: match.university.requiresTest,
        university_recognition_score: recognitionByUniId.get(match.university.id) ?? 3
      }
    }));
    const { error: deleteError } = await supabase.from('student_matches').delete().eq('profile_id', profileId);
    if (deleteError) {
      console.warn('Failed to clear cached matches', deleteError);
    }
    // Insert in batches to avoid payload size limits
    for (let i = 0; i < cachePayload.length; i += 500) {
      const batch = cachePayload.slice(i, i + 500);
      const { error: insertError } = await supabase.from('student_matches').insert(batch);
      if (insertError) {
        console.warn(`Failed to persist cached matches batch ${i}`, insertError);
        break;
      }
    }
  }

  return {
    matches,
    catalogSize: { programs: filteredPrograms.length, universities: universitiesCount },
    missingSections
  };
};
