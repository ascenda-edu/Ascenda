import type { SupabaseClient } from '@supabase/supabase-js';
import { filterVisiblePrograms, getFlaggedProgramIds } from '../catalog/visibility';
import type { Database } from '../types/database';
import type { EnrichedMatch, MissingProfileSection } from './types';
import { matchTierFromScore, type MatchTier } from './match-tier';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { logger } from '@/lib/observability/logger';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import { mapIntakeRowsToPayload } from '@/lib/scoring/student_score_loader';
import type { CourseRecord, EnrichedCourseRecord } from '@/lib/tiering/course_tiering';
import {
  classifyCourseChance,
  rankCourseMatches,
  resolveStudentIbEquivalent,
  resolveTargetFields,
  type RankedCourseMatch
} from '@/lib/matching/matching_engine';

type StudentSubjectRow = Database['public']['Tables']['student_subjects']['Row'];
type StudentAdmissionsTestRow = Database['public']['Tables']['student_admissions_tests']['Row'];
type ProgramRow = Database['public']['Tables']['programs']['Row'];
type CourseScoringRow = Record<string, unknown>;
type ProgramSummaryRow = Pick<ProgramRow, 'id' | 'metadata'>;

type Client = SupabaseClient<Database>;

type LoadMatchesOptions = {
  programLimit?: number;
  resultLimit?: number;
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
// The match cache is keyed by profile_id only and shared by every caller, so
// truncating what we store to one caller's resultLimit would starve the
// others. The expensive work (full-catalogue scoring) is limit-independent —
// truncation happens after ranking — so writes always store the ranked set
// computed at at least this cap (the largest caller: /matches at 300) and
// resultLimit is applied by slicing at read time. Dashboard (60), /api/match
// (20) and /matches (300) then share one compute per TTL.
const FULL_CACHE_LIMIT = 300;
const applyProgramVisibilityFilters = (query: any) => {
  // Order by bare id. Unfiltered pages stream off the primary key; the
  // field-filtered pager issues one query per field (`field = X order by id`,
  // see loadMatchesForProfile), which matches idx_programs_field_id exactly —
  // either way pages stream pre-sorted with no per-page sort. Do NOT order by
  // (field, id) here: the pager's programLimit cap would then hold exactly the
  // alphabetically-first fields, and late fields (Medicine, Physics, …) would
  // never be scored.
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

// Run async work over a list with a bounded worker pool. Firing every catalog
// page / scoring-view batch at once (10 + up to 25 concurrent queries) piles
// heavy scans onto a small DB instance and trips its 8s statement timeout
// (57014) — a few at a time keeps latency close while staying under it.
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  // PromiseLike so PostgREST query builders (thenables) can be passed directly.
  fn: (item: T) => PromiseLike<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    })
  );
  return results;
};

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
    supabase.from('student_activities').select('*').eq('profile_id', profileId).order('sort_order')
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
  if (!options.forceRefresh && latestMatchMeta.data?.created_at) {
    const latestCreatedAt = new Date(latestMatchMeta.data.created_at);
    if (Number.isFinite(latestCreatedAt.valueOf())) {
      const age = Date.now() - latestCreatedAt.getTime();
      const isFreshAgainstProfile = profileFreshnessMs === null || latestCreatedAt.getTime() >= profileFreshnessMs;
      if (age >= 0 && age <= PROGRAM_CACHE_TTL_MS && isFreshAgainstProfile) {
        const windowStart = new Date(latestCreatedAt.getTime() - PROGRAM_CACHE_WINDOW_MS).toISOString();
        // Paginate cache reads — Supabase defaults to 1000 rows max. When the
        // caller only wants the top N, stop after N plus a buffer covering the
        // recognition boost (≤ +5 pts) instead of loading the whole cache.
        const cacheFetchCap = options.resultLimit
          ? Math.min(2000, options.resultLimit + 200)
          : Number.POSITIVE_INFINITY;
        const cachedRows: any[] = [];
        let cacheOffset = 0;
        let cacheReadFailed = false;
        const CACHE_PAGE = 1000;
        while (cachedRows.length < cacheFetchCap) {
          const pageTo = Math.min(cacheOffset + CACHE_PAGE, cacheFetchCap) - 1;
          const { data: page, error: pageError } = await supabase
            .from('student_matches')
            .select('program_id, score, breakdown, created_at')
            .eq('profile_id', profileId)
            .gte('created_at', windowStart)
            .order('score', { ascending: false })
            .range(cacheOffset, pageTo);
          if (pageError) {
            // A failed page mid-pagination means the rows we have are an
            // arbitrary prefix — recompute rather than serve a partial cache.
            cacheReadFailed = true;
            break;
          }
          if (!page || page.length === 0) break;
          cachedRows.push(...page);
          if (page.length < CACHE_PAGE) break;
          cacheOffset += CACHE_PAGE;
        }
        // Cache sufficiency. Writes store the ranked set computed at
        // breakdown.result_limit (a number ≥ FULL_CACHE_LIMIT, or null for an
        // unbounded compute) and reads slice to the caller's resultLimit, so a
        // cache satisfies any request up to its stamp. Legacy rows predate
        // read-time slicing and carry NO result_limit key: they hold only the
        // writing caller's truncated slice (as few as 3 rows), so a missing
        // stamp must be treated as "guarantees nothing beyond the rows
        // actually present" — never as unbounded. Insufficient caches are
        // recomputed and rewritten at the full limit.
        const cachedLimit = cachedRows[0]?.breakdown?.result_limit;
        let cacheSatisfiesLimit: boolean;
        if (cachedLimit === null) {
          // Stamped unbounded compute — the cache holds the full ranked set.
          cacheSatisfiesLimit = true;
        } else if (typeof cachedLimit === 'number') {
          cacheSatisfiesLimit = typeof options.resultLimit === 'number' && options.resultLimit <= cachedLimit;
        } else {
          // Legacy truncated cache — sufficient only when the rows present
          // already cover the request.
          cacheSatisfiesLimit = typeof options.resultLimit === 'number' && cachedRows.length >= options.resultLimit;
        }
        if (!cacheReadFailed && cachedRows.length > 0 && cacheSatisfiesLimit) {
          const cachedMatches = cachedRows
            .map((row) => {
              const breakdown = (row.breakdown ?? {}) as Record<string, number | string>;
              const programName = typeof breakdown.program_name === 'string' ? breakdown.program_name : null;
              const universityName = typeof breakdown.university_name === 'string' ? breakdown.university_name : null;
              const universityCountry = typeof breakdown.university_country === 'string' ? breakdown.university_country : null;
              if (!programName || !universityName || !universityCountry) return null;

              const cachedTier = (breakdown.tier as MatchTier | undefined) ?? null;
              // Thresholds come from ./match-tier. This used to hardcode
              // >=70/>=50, disagreeing with the search surfaces on every score in
              // the 70-79 band.
              const fallbackTier: MatchTier = matchTierFromScore(row.score) ?? 'Reach';

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
            const cachedRowByProgramId = new Map<string, any>(cachedRows.map((r) => [r.program_id, r]));
            const cachedWithRecognition = cachedMatches.map((m) => {
              const bd = (cachedRowByProgramId.get(m.program.id)?.breakdown ?? {}) as Record<string, unknown>;
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

  // Catalogue pages run through a small worker pool — the range boundaries are
  // known up front so pages can overlap, but unbounded concurrency (10 at once)
  // trips the DB statement timeout under the filtered + ordered scan.
  //
  // Two pager shapes, both chosen so pages stream off an index with no
  // per-page sort AND the programLimit cap never collapses to the
  // alphabetically-first fields:
  // - No field preference: plain offset pages ordered by id — the pkey index
  //   streams them, and an id-ordered window is a cross-section of the whole
  //   catalogue.
  // - Field preference: one pager per field label (`field = X order by id`),
  //   splitting programLimit evenly across the labels. Each query matches
  //   idx_programs_field_id exactly (equality on the leading column, then id),
  //   so pages stream pre-sorted; `field in (A, B) order by id` would instead
  //   re-sort every matched row (incl. jsonb metadata) on every page, which is
  //   what used to blow the 8s DB statement timeout. A sparse field can leave
  //   part of its share of the budget unused, but no target field is ever
  //   starved by an alphabetically-earlier one.
  type ProgramPageTask = { field: string | null; range: [number, number] };
  const buildPageRanges = (limit: number): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];
    for (let from = 0; from < limit; from += PROGRAM_PAGE_SIZE) {
      ranges.push([from, Math.min(from + PROGRAM_PAGE_SIZE - 1, limit - 1)]);
    }
    return ranges;
  };
  const pageTasks: ProgramPageTask[] = [];
  if (fieldLabels && fieldLabels.length > 0) {
    const perFieldLimit = Math.ceil(programLimit / fieldLabels.length);
    for (const field of fieldLabels) {
      for (const range of buildPageRanges(perFieldLimit)) pageTasks.push({ field, range });
    }
  } else {
    for (const range of buildPageRanges(programLimit)) pageTasks.push({ field: null, range });
  }
  const fetchProgramPage = ({ field, range: [rangeFrom, rangeTo] }: ProgramPageTask) => {
    let programQuery = supabase.from('programs').select('id,metadata');
    if (field) programQuery = programQuery.eq('field', field);
    return applyProgramVisibilityFilters(programQuery).range(rangeFrom, rangeTo);
  };
  const pageResults: Array<{ data: ProgramSummaryRow[] | null; error: { message?: string } | null }> =
    await mapWithConcurrency(pageTasks, 3, fetchProgramPage);
  // One serial retry for pages that failed (typically 57014 statement timeout)
  // — with the pool drained there is no contention, so a lone retry usually
  // completes well under the limit.
  for (let i = 0; i < pageResults.length; i++) {
    if (pageResults[i]?.error) {
      pageResults[i] = await fetchProgramPage(pageTasks[i]);
    }
  }
  const programsData: ProgramSummaryRow[] = [];
  for (const { data, error: programsError } of pageResults) {
    if (programsError) {
      console.error('Failed to load catalog data', { programsError });
      return {
        matches: [],
        catalogSize: { programs: 0, universities: 0 },
        missingSections,
        error: { stage: 'programs', message: 'Failed to load programs' }
      };
    }
    // No early break: per-field pagers interleave, so a short page only means
    // that one field (or the catalogue tail) is exhausted — later tasks may
    // still carry rows. Past-the-end pages simply come back empty.
    if (data && data.length > 0) programsData.push(...data);
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

  // Batch size stays at 200 (URL-length bound for .in()). The batches are
  // independent but each one evaluates the heavy scoring view — a bounded pool
  // overlaps them without stampeding the DB (25 at once hit statement timeouts).
  const fetchCourseBatch = (batch: string[]) =>
    supabase
      .from('course_scoring_v1' as any)
      .select(courseColumns)
      .in('course_id', batch);
  const courseBatches = chunk(programIds, 200);
  const courseBatchResults = await mapWithConcurrency(courseBatches, 3, fetchCourseBatch);
  // Same serial retry as the program pages — see above.
  for (let i = 0; i < courseBatchResults.length; i++) {
    if (courseBatchResults[i]?.error) {
      courseBatchResults[i] = await fetchCourseBatch(courseBatches[i]);
    }
  }
  const courseRows: CourseScoringRow[] = [];
  for (const { data, error } of courseBatchResults) {
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
    const { data: recData, error: recError } = await supabase
      .from('universities')
      .select('id, recognition_score')
      .in('id', allUniIds);
    // Discarding this error (audit E-05) left every university on the default
    // of 3 — see the `?? 3` at the cachePayload mapper below and the sort key
    // that reads this map. The match list is then ordered as if no university
    // were more recognised than any other, which is a different ranking served
    // and cached for 24h with no signal that anything failed.
    if (recError) {
      console.error(
        'Failed to load recognition scores — the match list will be ordered as if every ' +
          'university had the default recognition of 3',
        recError
      );
    }
    for (const row of (recData ?? []) as Array<{ id: string; recognition_score: number }>) {
      if (row.id && typeof row.recognition_score === 'number') {
        recognitionByUniId.set(row.id, row.recognition_score);
      }
    }
  }

  // Shared row→payload mapper (also used by the score loader) — the two used
  // to maintain independently-drifting copies of this field mapping.
  const studentPayload = mapIntakeRowsToPayload({
    personal: null,
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
    const byBand = {
      Safety: ranked.filter((m) => m.admission_band === 'Safety').length,
      Target: ranked.filter((m) => m.admission_band === 'Target').length,
      Reach: ranked.filter((m) => m.admission_band === 'Reach').length,
      Hard: ranked.filter((m) => m.admission_band === 'Harder-than-reach').length
    };
    const sample = ranked.slice(0, 8).map((m) => ({
      uni: m.university,
      course: m.course,
      band: m.admission_band,
      chance: m.chance_percent,
      courseTier: m.course_tier
    }));
    console.info('[match-debug]', {
      profileId,
      studentIb: studentPayload.academic_input.ib_total_points,
      enrichedCount: enrichedCourses.length,
      rankedCount: ranked.length,
      byBand,
      sample
    });
  }

  const toKey = (value: { university: string; course: string; ucas_code?: string | null }) =>
    `${value.university}::${value.course}::${value.ucas_code ?? ''}`;
  const courseLookup = new Map(enrichedCourses.map((course) => [toKey(course), course]));
  const courseByProgramId = new Map(enrichedCourses.map((course) => [course.program_id, course]));

  // Apply the result limit per ADMISSION BAND so the set spans a range of
  // difficulties. Without this, a top-N cut returns only Safety results (highest
  // admission %). After capping, we pin programs from high-recognition
  // universities (score ≥ 9) that would otherwise be cut off — prestigious
  // schools always appear among the hardest options.
  //
  // This balances WHICH courses are returned. It does not decide what tier they
  // are labelled with; that is `matchTierFromScore` below, applied to the same
  // number the card prints. Keeping selection and labelling separate is what
  // stopped the percentile pass that used to sit under this from relabelling a
  // 41%-chance programme "Safe".
  //
  // The set is built at computeLimit — at least FULL_CACHE_LIMIT — not the
  // caller's resultLimit, and the caller's slice is taken when returning. The
  // whole set is cached, so a small-limit caller (dashboard at 60) warms the
  // cache for the largest one (/matches at 300) instead of poisoning it with
  // a truncated set.
  const computeLimit =
    typeof options.resultLimit === 'number' ? Math.max(options.resultLimit, FULL_CACHE_LIMIT) : undefined;
  let limited: RankedCourseMatch[];
  if (computeLimit) {
    const perTier = Math.ceil(computeLimit / 3);
    const safety = ranked.filter((m) => m.admission_band === 'Safety').slice(0, perTier);
    const target = ranked.filter((m) => m.admission_band === 'Target').slice(0, perTier);
    const reachAll = ranked.filter((m) => m.admission_band === 'Reach' || m.admission_band === 'Harder-than-reach');
    const reach = reachAll.slice(0, perTier);

    // Pin top-recognition universities that got cut off from the Reach cap
    const includedIds = new Set([...reach, ...target, ...safety].map((m) => m.program_id));
    const cutOffReach = reachAll.slice(perTier);
    const pinnedReach: RankedCourseMatch[] = [];
    const pinnedUniCounts = new Map<string, number>();
    for (const m of cutOffReach) {
      const course = m.program_id ? courseByProgramId.get(m.program_id) : undefined;
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

  // The tier is derived from `chance_percent` — the number this same object
  // publishes as `score` and the card prints next to the pill — so the label can
  // never contradict the figure beside it, and so the tier persisted in
  // `breakdown.tier` agrees with the `score` column persisted alongside it. The
  // cached read path at :393 already recomputes with `matchTierFromScore(row.score)`
  // when the key is missing; before this, the write path used a different rule
  // (`assignTierFromFit`, an IB-points-gap band), so a cache hit and a cache miss
  // could label the same row differently.
  //
  // `?? 'Reach'` is unreachable in practice — `chance_percent` is a clamped
  // integer — but stays as the conservative choice if that ever changes.
  const scoredMatches: EnrichedMatch[] = limited
    .map((match) => {
      const course =
        (match.program_id ? courseByProgramId.get(match.program_id) : null) ??
        courseLookup.get(toKey(match));
      if (!course) return null;
      const tier: MatchTier = matchTierFromScore(match.chance_percent) ?? 'Reach';
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

  // DELETED HERE: a percentile reassignment that fired whenever one tier held
  // >75% of the set (and >= 6 results) and rewrote every tier by RANK — top 35%
  // Safe, next 30% Match, rest Reach. It ran after the tier was computed and
  // before the cache write, so rank-derived tiers were what got persisted into
  // `breakdown.tier` and read back by /applications and the counsellor surfaces.
  //
  // It was a third implementation of the tier rule, and the only one that could
  // detach the label from the number entirely: a student whose best chance was
  // 41% got a "Safe" badge, and an 87% programme in the bottom third got
  // "Reach". Its stated purpose — "students always see a useful Reach/Match/Safe
  // spread" — is a SELECTION concern, and the per-band caps above already serve
  // it by choosing a spread of admission difficulties. Relabelling to
  // manufacture a spread makes the label mean nothing.
  //
  // Consequence, stated plainly: a student whose whole result set scores under
  // 60 now sees three Reach groups' worth of programmes under one Reach heading
  // instead of a fabricated Safe/Match/Reach split. That is the true answer.

  // Apply recognition-boosted sort: well-known universities surface before unknown
  // ones when admission chances are similar (up to +5 pts boost for score-10 schools).
  const matches: EnrichedMatch[] = scoredMatches
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
        // Limit this set was computed at (null = unbounded). Reads treat the
        // cache as sufficient for any resultLimit ≤ this stamp and slice at
        // read time (see cacheSatisfiesLimit above).
        result_limit: computeLimit ?? null,
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
    // Rebuild the cache fail-safe: if the clear fails, don't insert (we'd
    // duplicate rows); if any insert batch fails, wipe the partial cache —
    // an empty cache recomputes next request, but a truncated one would be
    // served as authoritative for the full 24h TTL.
    const { error: deleteError } = await supabase.from('student_matches').delete().eq('profile_id', profileId);
    if (deleteError) {
      console.warn('Failed to clear cached matches — skipping cache rebuild', deleteError);
    } else {
      // Insert in batches to avoid payload size limits
      for (let i = 0; i < cachePayload.length; i += 500) {
        const batch = cachePayload.slice(i, i + 500);
        const { error: insertError } = await supabase.from('student_matches').insert(batch);
        if (insertError) {
          console.warn(`Failed to persist cached matches batch ${i} — clearing partial cache`, insertError);
          // This rollback was the one write in src/ that discarded its error
          // (audit E-04). If the wipe fails, the truncated cache it was meant to
          // remove stays — and a truncated cache is served as authoritative for
          // the full 24h TTL, so the student silently sees a subset of their
          // matches. It must be loud: nothing downstream can detect this state.
          const { error: rollbackError } = await supabase
            .from('student_matches')
            .delete()
            .eq('profile_id', profileId);
          if (rollbackError) {
            console.error(
              `Failed to clear the partial match cache for profile ${profileId} — ` +
                'a TRUNCATED cache will be served as authoritative until the 24h TTL expires',
              rollbackError
            );
          }
          break;
        }
      }
    }
  }

  return {
    // The cache got the full computed set above; the caller gets its slice.
    matches: options.resultLimit ? matches.slice(0, options.resultLimit) : matches,
    catalogSize: { programs: filteredPrograms.length, universities: universitiesCount },
    missingSections
  };
};

/** Raised when EVERY course_scoring_v1 batch failed — see the note on
 * `scoreProgramsForProfile`. Exported so a caller can distinguish an
 * infrastructure failure from "this student has no scorable programmes". */
export class CourseScoringUnavailableError extends Error {
  constructor(readonly batchCount: number, readonly batchError?: unknown) {
    super(`course_scoring_v1 unavailable — all ${batchCount} batch(es) failed`);
    this.name = 'CourseScoringUnavailableError';
  }
}

// ── On-demand scoring ───────────────────────────────────────────────────────
//
// Scores an explicit list of programs for a student, regardless of whether
// they made the ranked top-N cached in student_matches. Used by the explore
// page so every result card carries a fit score — the ranked pipeline's
// exclusion gates (field mismatch, budget, postgrad, quality) are pool-
// selection concerns, not score validity, so none apply here. Uses the same
// classifier as the ranked path (classifyCourseChance), so a program that IS
// in the cache gets the identical number from either source.
//
// UNKNOWN IS A VALUE. A program with no row in course_scoring_v1 maps to
// `null`, never to a number. It used to be classified against an all-null
// course record, whose documented defaults (courseScore ?? 40 →
// tierImpliedMinIb(40) = 25) handed a median student 90% and, via the ≥80
// tier cut, a confident "Safe". A program we know nothing about is now
// rendered as "fit unknown" (getFitScoreVisuals already has that branch and
// UniversityCard omits the ring entirely) rather than as the best result on
// the page.
//
// FAILURE IS NOT ABSENCE. A failed batch is logged and, if some batches
// succeeded, degrades only its own ids to `null` — dropping 50 good scores
// because one batch of 200 timed out is worse for the student than an honest
// per-program "unknown", and `null` can no longer be mistaken for a
// confident score. But when EVERY batch fails the result is indistinguishable
// from "no program is scorable", so that case throws: the route turns it into
// a 5xx that monitoring can see, while the search page's existing best-effort
// catch keeps rendering cards with no fit score.
export const scoreProgramsForProfile = async (
  supabase: Client,
  profileId: string,
  programIds: string[]
): Promise<Record<string, number | null>> => {
  const ids = [...new Set(programIds)].filter(Boolean);
  if (!ids.length) return {};

  const [{ data: academicData, error: academicError }, { data: lifestyleData }, { data: subjectsData }, { data: admissionsData }] =
    await Promise.all([
      supabase.from('student_academic_input').select('*').eq('profile_id', profileId).maybeSingle(),
      supabase.from('student_lifestyle_preference').select('*').eq('profile_id', profileId).maybeSingle(),
      supabase.from('student_subjects').select('*').eq('profile_id', profileId),
      supabase.from('student_admissions_tests').select('*').eq('profile_id', profileId)
    ]);
  // No academic input → no basis for a personal score (matches the ranked
  // pipeline, which reports academic_input as a missing section).
  if (academicError || !academicData) return {};

  const studentPayload = mapIntakeRowsToPayload({
    personal: null,
    academic: academicData,
    lifestyle: lifestyleData ?? null,
    subjects: (subjectsData ?? []) as StudentSubjectRow[],
    admissionsTests: (admissionsData ?? []) as StudentAdmissionsTestRow[],
    // Activities don't feed the IB-equivalent resolution the classifier uses.
    activities: []
  });
  const studentIb = resolveStudentIbEquivalent(studentPayload);

  // programs.metadata carries the pre-computed import scores that the scoring
  // view lacks for non-UK rows — inject them exactly like the ranked path.
  const { data: programsData } = await supabase.from('programs').select('id,metadata').in('id', ids);
  const metadataByProgramId = new Map<string, Record<string, unknown>>();
  for (const p of programsData ?? []) {
    const meta = p.metadata;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      metadataByProgramId.set(p.id, meta as Record<string, unknown>);
    }
  }

  // Only the classifier inputs — the full view row isn't needed here.
  const scoringColumns =
    'course_id, program_id, university_id, course, min_ib_score, university_score, course_selectivity_score, total_course_score, course_tier';
  const batchResults = await mapWithConcurrency(chunk(ids, 200), 3, (batch) =>
    supabase
      .from('course_scoring_v1' as any)
      .select(scoringColumns)
      .in('course_id', batch)
  );
  const courseRows: CourseScoringRow[] = [];
  let failedBatches = 0;
  let firstBatchError: unknown = null;
  for (let batchIndex = 0; batchIndex < batchResults.length; batchIndex++) {
    const { data, error } = batchResults[batchIndex];
    if (error) {
      // Never silent: a swallowed batch used to be indistinguishable from a
      // catalogue with no scoring rows, and the fallback below turned it into
      // a page of confident "Safe" cards.
      failedBatches += 1;
      firstBatchError ??= error;
      logger.error('course_scoring_v1 batch failed while scoring programs', error, {
        profileId,
        batchIndex,
        batchCount: batchResults.length,
        requestedIds: ids.length
      });
      continue;
    }
    courseRows.push(...((data as unknown as CourseScoringRow[]) ?? []));
  }
  if (batchResults.length > 0 && failedBatches === batchResults.length) {
    throw new CourseScoringUnavailableError(batchResults.length, firstBatchError);
  }
  if (failedBatches > 0) {
    logger.warn('Returning partial fit scores — some course_scoring_v1 batches failed', {
      profileId,
      failedBatches,
      batchCount: batchResults.length
    });
  }

  const scores: Record<string, number | null> = {};
  for (const row of courseRows) {
    const pid = String(row.program_id ?? row.course_id ?? '');
    if (!pid) continue;
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
    scores[pid] = classifyCourseChance(studentIb, mapCourseScoringRow(row)).chancePercent;
  }

  // Programs absent from the scoring view (or in a batch that failed) are
  // explicitly UNKNOWN. The key is present so the caller can tell "we looked
  // and there is nothing" apart from "we never asked", and can cache the
  // answer; the value is null so nothing downstream can read it as a score.
  for (const id of ids) {
    if (!(id in scores)) scores[id] = null;
  }

  return scores;
};
