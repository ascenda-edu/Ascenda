// Counsellor data-access layer — assembles the counsellor section's view of
// real student data. Domain types live in src/lib/counsellor/types.ts.
//
// `loadCohort()` assembles the `CounsellorStudent` shape the UI already consumes
// from the real student tables (counsellor reads them via the can_act_as_counsellor()
// RLS policies added in 20260628120000). The pure `derive*` helpers mirror the dummy
// helpers but take the loaded cohort, so a page fetches once then derives many views.
//
// Tables added in 20260628120000 (counsellor_notes / parent_* / student_documents)
// and the new applications columns are not in the generated database.ts yet, so the
// queries that touch them cast through `any` (same pattern as lib/demo/help-request-client).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { COMPLETION_COLUMNS, buildStepCompletion } from '@/lib/profile/completion';
import { matchTierFromScore } from '@/lib/matching/match-tier';
import { tierFromBreakdown } from '@/lib/data/applications';
import type { MatchTierRow } from '@/lib/data/columns';
import { unwrap } from '@/lib/data/errors';
import { flagEmoji } from '@/lib/utils/flag';
import { MS_PER_DAY, parseLocalDate, startOfToday } from '@/lib/utils/dates';
import type {
  CounsellorStudent,
  CounsellorMatch,
  CounsellorApplication,
  CounsellorDeadline,
  CounsellorNote,
  MatchTier,
  ApplicationStatus,
  DeadlineType,
  StudentFlag,
  AtRiskAlert,
  RiskUrgency,
  EnrichedApplication,
  ApplicationPlatform,
  CounsellorOutcome,
  OutcomeResult,
} from '@/lib/counsellor/types';
import type { AppFunnel } from '@/lib/counsellor/stage-colors';
import type { CounsellorDocument, EvolutionEntry } from '@/lib/data/student-demo-data';
import { DEMO_EMAIL } from '@/lib/demo/demo-profile';

type Client = SupabaseClient<Database>;

const GRADE_ORDER: Record<string, number> = { 'A*': 7, A: 6, B: 5, C: 4, D: 3, E: 2, U: 1 };

// `unwrap` was defined here, and character-for-character again in decks.ts and
// parent/data.ts. It now lives in @/lib/data/errors — same disposition (throw,
// so a dropped RLS policy or network failure surfaces in the counsellor
// section's error boundary instead of rendering as "0 students, all clear"),
// plus two things the local copy did not do: it LOGS the driver detail, and it
// keeps PostgREST's message — which names tables, columns and policies — out of
// the error that reaches the boundary. Contexts below are `counsellor.<table>`.

// The counsellor view is scoped to the seeded demo cohort. Founder/dev accounts
// are also role='student' (so they keep their own student access) but should not
// appear in the counsellor roster. Seeded students use this email suffix.
// Remove/relax this scope when onboarding real students to a counsellor.
const DEMO_COHORT_EMAIL_SUFFIX = '+seed@ascenda.demo';
// The single-account demo also plays the student side as greg@workiflow.com.
// Keep that profile cohort-eligible so the counsellor can open greg's card in
// the roster and message him — the message (and its notification) then lands on
// the student identity the demo actually browses, closing the counsellor→student
// loop in one login. Only the students roster surfaces greg (see
// students/page.tsx); the analytics/overview pages still exclude him via excludeId.
const inDemoCohort = (email: string | null | undefined): boolean => {
  const normalized = (email ?? '').trim().toLowerCase();
  return normalized.endsWith(DEMO_COHORT_EMAIL_SUFFIX) || normalized === DEMO_EMAIL;
};

// ── return types (mirror the dummy helper shapes the components consume) ─────

export type DeadlineWithStudent = CounsellorDeadline & {
  studentName: string;
  studentFlag: string;
  daysUntil: number;
};
export type ActivityItem = CounsellorNote & {
  studentName: string;
  studentId: string;
  studentFlag: string;
};
/**
 * "Still needs work from the student." Written as an allow-list of the open
 * stages rather than a deny-list of the closed ones — the deny-list version
 * (`status !== 'submitted' && status !== 'decision'`) counted every ENROLLED
 * application as incomplete the moment `enrolled` became representable.
 */
const OPEN_APPLICATION_STATUSES: readonly ApplicationStatus[] = ['planning', 'in_progress'];
const isOpenApplication = (a: { status: ApplicationStatus }): boolean =>
  OPEN_APPLICATION_STATUSES.includes(a.status);

export interface CohortStats {
  total: number;
  avgCompletion: number;
  flagged: number;
  deadlinesThisWeek: number;
  matchTiers: { reach: number; match: number; safe: number };
  appFunnel: AppFunnel;
  programmeBreakdown: { ib: number; aLevel: number };
}
export interface OutcomeStats {
  total: number;
  accepted: number;
  rejected: number;
  waitlisted: number;
  pending: number;
  withdrawn: number;
  acceptanceRate: number;
}

// ── small mappers ────────────────────────────────────────────────────────────

// Thresholds come from lib/matching/match-tier. This used to hardcode >=70/>=50,
// which disagreed with the rule the search surfaces applied — a score of 75 read
// "Safe" here and "Match" there.
//
// ── On the `?? 'Reach'` fallback ───────────────────────────────────────────
// This FABRICATES a tier for a row with no score, and the fabrication is real:
// `matchTierFromScore` deliberately returns null for "we don't know" so that
// unknown stays distinguishable from Reach, and this call site then collapses
// that distinction. docs/audit/review/02-domain.md calls it the most harmful
// null-handling site on the branch.
//
// It is kept, deliberately, for two reasons — recorded here because the next
// person to read this deserves the argument rather than a silent `??`:
//
//   1. It leans the SAFE way. 'Reach' overstates difficulty. The expensive error
//      in this product is telling a student a reach school is safe, never the
//      reverse — the same reasoning that chose 80/60 over 70/50 in match-tier.ts.
//      An unscored programme presented as "Safe" would be the harmful version of
//      this bug; this is its opposite.
//   2. The honest alternative is a nullable tier rendered as "—", and
//      `CounsellorMatch.tier` is consumed at 23 sites in the counsellor UI. That
//      is a real change to what a counsellor sees, and it is a product decision
//      about whether an unscored programme should appear on the roster at all —
//      not something to infer from a lint of the type signature.
//
// So: known, argued, and NOT a silent default. If you make `tier` nullable,
// delete this fallback rather than moving it.
const tierFromScore = (score: number | null | undefined): MatchTier =>
  matchTierFromScore(score) ?? 'Reach';

/**
 * The stored tier, else one derived from the score.
 *
 * The EXTRACTION half is `tierFromBreakdown` from lib/data/applications — the
 * same `breakdown.tier` key the student board and parent portal read. Only the
 * fallback is local, and it is deliberately NOT pushed down into the shared
 * loader: `loadTierByProgram` returns "no tier" when the key is absent (a badge
 * disappears), whereas the counsellor roster must render a tier for every row,
 * so it derives one from the score. Two different products, one parser.
 *
 * Behaviour note: the old local parser returned `breakdown.tier` unchecked, so a
 * junk value ('Bogus') was passed through as if it were a MatchTier. It now
 * falls back to the score-derived tier instead.
 */
const tierFromMatchRow = (row: { score: number | null; breakdown: MatchTierRow['breakdown'] }): MatchTier =>
  tierFromBreakdown(row.breakdown) ?? tierFromScore(row.score);

const mapEnglishStatus = (s: string | null | undefined): 'met' | 'missing' | 'booked' => {
  if (s === 'met' || s === 'exceeds' || s === 'exceptional') return 'met';
  if (s === 'booked') return 'booked';
  return 'missing'; // missing | failed | null
};

const mapProgrammeType = (s: string | null | undefined): 'IB' | 'A_LEVEL' =>
  s === 'IB' ? 'IB' : 'A_LEVEL';

const gradesObjectToString = (grades: unknown): string | undefined => {
  if (!grades || typeof grades !== 'object') return undefined;
  const values = Object.values(grades as Record<string, string>).filter(Boolean);
  if (values.length === 0) return undefined;
  const sorted = values.sort((a, b) => (GRADE_ORDER[b] ?? 0) - (GRADE_ORDER[a] ?? 0));
  return `${sorted.join('')} (predicted)`;
};

const classifyDeadlineType = (name: string | null | undefined): DeadlineType => {
  const n = (name ?? '').toLowerCase();
  if (n.includes('early')) return 'early_decision';
  if (n.includes('scholarship')) return 'scholarship';
  if (n.includes('interview')) return 'interview';
  return 'regular';
};

const formatSubject = (name: string | null, level: string | null): string => {
  const base = name ?? '';
  if (!level || level === 'A_LEVEL') return base;
  return `${base} ${level}`.trim();
};

// ── program → {course, university, country} resolution (avoids the program_id
//    multi-FK embed ambiguity by resolving in a separate, single-FK query) ─────

export type ProgramInfo = { courseName: string; university: string; country: string };

export const resolvePrograms = async (supabase: Client, programIds: string[]): Promise<Map<string, ProgramInfo>> => {
  const map = new Map<string, ProgramInfo>();
  const ids = [...new Set(programIds)].filter(Boolean);
  if (ids.length === 0) return map;
  // Chunk to stay under PostgREST's 1000-row cap — otherwise programmes beyond
  // the first 1000 silently fall back to 'University'/'Programme' in the UI.
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await supabase
      .from('programs')
      .select('id, course_name, universities(name, country)')
      .in('id', ids.slice(i, i + CHUNK));
    for (const row of (unwrap(res, 'counsellor.programs') ?? []) as any[]) {
      const uni = Array.isArray(row.universities) ? row.universities[0] : row.universities;
      map.set(row.id, {
        courseName: row.course_name ?? 'Programme',
        university: uni?.name ?? 'University',
        country: uni?.country ?? 'UK',
      });
    }
  }
  return map;
};

export const nameMap = async (supabase: Client, profileIds: string[]): Promise<Map<string, { name: string; flag: string }>> => {
  const map = new Map<string, { name: string; flag: string }>();
  const ids = [...new Set(profileIds)].filter(Boolean);
  if (ids.length === 0) return map;
  const res = await supabase
    .from('student_personal_information')
    .select('profile_id, first_name, last_name, nationality, resident_country')
    .in('profile_id', ids);
  for (const r of (unwrap(res, 'counsellor.studentNames') ?? []) as Array<{
    profile_id: string;
    first_name: string | null;
    last_name: string | null;
    nationality: string | null;
    resident_country: string | null;
  }>) {
    map.set(r.profile_id, {
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Student',
      flag: flagEmoji(r.nationality, r.resident_country),
    });
  }
  return map;
};

// ── cohort loader ────────────────────────────────────────────────────────────

const maxIso = (...values: Array<string | null | undefined>): string | null => {
  const times = values.filter(Boolean).map((v) => new Date(v as string).getTime());
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
};

// Completion math shared by buildStudents and loadRoster. Maps the 5 real
// profile steps → the 4 UI keys (activities folds into lifestyle).
const computeProfileCompletion = (
  personal: any,
  academic: any,
  subjectCount: number,
  lifestyle: object | null
): { completionPct: number; stepsComplete: CounsellorStudent['profile']['stepsComplete'] } => {
  const completion = buildStepCompletion({
    personal,
    academicInput: academic,
    subjectCount,
    lifestyle,
  });
  const stepsComplete: CounsellorStudent['profile']['stepsComplete'] = [];
  if (completion.personal_information) stepsComplete.push('personal');
  if (completion.academic_input) stepsComplete.push('academic');
  if (completion.academic_details) stepsComplete.push('subjects');
  if (completion.lifestyle_preferences) stepsComplete.push('lifestyle');
  return { stepsComplete, completionPct: Math.round((stepsComplete.length / 4) * 100) };
};

const buildStudents = async (
  supabase: Client,
  opts: { ids?: string[]; excludeId?: string } = {}
): Promise<CounsellorStudent[]> => {
  // 1. base profiles (students only)
  let profileQuery = supabase.from('profiles').select('id, created_at').eq('role', 'student');
  if (opts.ids && opts.ids.length > 0) profileQuery = profileQuery.in('id', opts.ids);
  const profiles = unwrap(await profileQuery, 'counsellor.profiles') ?? [];
  let ids = profiles.map((p) => p.id);
  if (opts.excludeId) ids = ids.filter((id) => id !== opts.excludeId);
  if (ids.length === 0) return [];

  // 2. Scope to the seeded demo cohort BEFORE fanning out the per-table
  // fetches — no point loading subjects/apps/notes for profiles the email
  // filter is about to discard. This also inherently drops empty/junk
  // profile rows (no personal record → no email).
  const personal = (unwrap(
    await supabase.from('student_personal_information').select('*').in('profile_id', ids),
    'student_personal_information'
  ) ?? []) as any[];
  const emailById = new Map<string, string | null>(personal.map((r) => [r.profile_id, r.email]));
  ids = ids.filter((id) => inDemoCohort(emailById.get(id)));
  if (ids.length === 0) return [];

  // 3. batched per-table fetches (these are bounded; safe under PostgREST's 1000-row cap)
  const [
    academicRes,
    subjectsRes,
    lifestyleRes,
    testsRes,
    appsRes,
    notesRes,
  ] = await Promise.all([
    supabase.from('student_academic_input').select('*').in('profile_id', ids),
    supabase.from('student_subjects').select('profile_id, subject_name, level, grade_value').in('profile_id', ids),
    supabase.from('student_lifestyle_preference').select('*').in('profile_id', ids),
    supabase.from('student_admissions_tests').select('profile_id, test_type, status, score_numeric').in('profile_id', ids),
    supabase
      .from('applications')
      .select('id, profile_id, program_id, status, platform, decision, updated_at, created_at')
      .in('profile_id', ids),
    supabase
      .from('counsellor_notes')
      .select('id, student_profile_id, body, note_type, created_at')
      .in('student_profile_id', ids),
  ]);

  const academic = (unwrap(academicRes, 'counsellor.student_academic_input') ?? []) as any[];
  const subjects = (unwrap(subjectsRes, 'counsellor.student_subjects') ?? []) as any[];
  const lifestyle = (unwrap(lifestyleRes, 'counsellor.student_lifestyle_preference') ?? []) as any[];
  const tests = (unwrap(testsRes, 'counsellor.student_admissions_tests') ?? []) as any[];
  const apps = (unwrap(appsRes, 'counsellor.applications') ?? []) as any[];
  const notes = (unwrap(notesRes, 'counsellor.counsellor_notes') ?? []) as any[];

  // Matches per student, capped + ordered by score. Done per-student (not one
  // .in()) so a profile with a bloated match cache can't (a) blow past
  // PostgREST's 1000-row default and starve other students, or (b) load tens of
  // thousands of cache rows. student_matches is a regenerable cache.
  const MATCH_CAP = 30;
  const matchResults = await Promise.all(
    ids.map((id) =>
      supabase
        .from('student_matches')
        .select('profile_id, program_id, score, breakdown')
        .eq('profile_id', id)
        .order('score', { ascending: false })
        .limit(MATCH_CAP)
    )
  );
  const matches = matchResults.flatMap((res) => (unwrap(res, 'counsellor.student_matches') ?? []) as any[]);

  // 3. resolve program names/universities + applied-program deadlines
  const allProgramIds = [
    ...matches.map((m) => m.program_id),
    ...apps.map((a) => a.program_id),
  ];
  const programInfo = await resolvePrograms(supabase, allProgramIds);

  const appliedProgramIds = [...new Set(apps.map((a) => a.program_id))].filter(Boolean);
  let deadlinesByProgram = new Map<string, Array<{ id: string; name: string; date: string }>>();
  if (appliedProgramIds.length > 0) {
    const dlsRes = await supabase
      .from('deadlines')
      .select('id, program_id, name, deadline_date')
      .in('program_id', appliedProgramIds);
    for (const d of (unwrap(dlsRes, 'counsellor.deadlines') ?? []) as any[]) {
      if (!d.deadline_date) continue;
      const arr = deadlinesByProgram.get(d.program_id) ?? [];
      arr.push({ id: d.id, name: d.name, date: d.deadline_date });
      deadlinesByProgram.set(d.program_id, arr);
    }
  }

  // 4. index by profile_id
  const by = <T extends { profile_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const a = m.get(r.profile_id) ?? [];
      a.push(r);
      m.set(r.profile_id, a);
    }
    return m;
  };
  const single = <T extends { profile_id: string }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) m.set(r.profile_id, r);
    return m;
  };

  const personalById = single(personal as any[]);
  const academicById = single(academic);
  const lifestyleById = single(lifestyle);
  const subjectsById = by(subjects);
  const testsById = by(tests);
  const matchesById = by(matches);
  const appsById = by(apps);
  const notesByStudent = (() => {
    const m = new Map<string, any[]>();
    for (const n of notes) {
      const a = m.get(n.student_profile_id) ?? [];
      a.push(n);
      m.set(n.student_profile_id, a);
    }
    return m;
  })();
  const profileCreated = new Map(profiles.map((p) => [p.id, p.created_at] as const));

  const today = startOfToday();

  // 5. assemble each student
  return ids.map((id): CounsellorStudent => {
    const p = personalById.get(id) ?? ({} as any);
    const a = academicById.get(id) ?? ({} as any);
    const l = lifestyleById.get(id) ?? ({} as any);
    const subs = subjectsById.get(id) ?? [];
    const ts = testsById.get(id) ?? [];
    const ms = matchesById.get(id) ?? [];
    const as = appsById.get(id) ?? [];
    const ns = notesByStudent.get(id) ?? [];

    const { completionPct, stepsComplete } = computeProfileCompletion(
      p,
      a,
      subs.length,
      Object.keys(l).length ? l : null
    );

    const studentMatches: CounsellorMatch[] = ms.map((m) => {
      const info = programInfo.get(m.program_id);
      return {
        university: info?.university ?? 'University',
        country: info?.country ?? 'UK',
        program: info?.courseName ?? 'Programme',
        score: m.score ?? 0,
        tier: tierFromMatchRow(m),
      };
    });

    const studentApps: CounsellorApplication[] = as.map((app) => {
      const info = programInfo.get(app.program_id);
      const programDeadlines = deadlinesByProgram.get(app.program_id) ?? [];
      const earliest = programDeadlines
        .map((d) => d.date)
        .sort((x, y) => new Date(x).getTime() - new Date(y).getTime())[0];
      return {
        university: info?.university ?? 'University',
        program: info?.courseName ?? 'Programme',
        // Straight through. This used to read
        //   (app.status === 'enrolled' ? 'decision' : app.status)
        // because ApplicationStatus omitted `enrolled` — which made every
        // enrolled student read as "awaiting decision" and put the cohort's
        // enrolment count permanently at zero.
        status: app.status as ApplicationStatus,
        deadline: earliest ?? '',
        platform: (app.platform ?? undefined) as ApplicationPlatform | undefined,
        country: info?.country,
      };
    });

    // One deadline per applied programme (earliest), deduped — a programme may
    // carry several deadline rows (e.g. duplicates across the cohort's seeds).
    const seenDeadlinePrograms = new Set<string>();
    const studentDeadlines: CounsellorDeadline[] = as.flatMap((app) => {
      if (seenDeadlinePrograms.has(app.program_id)) return [];
      seenDeadlinePrograms.add(app.program_id);
      const info = programInfo.get(app.program_id);
      const programDeadlines = [...(deadlinesByProgram.get(app.program_id) ?? [])]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const earliest = programDeadlines[0];
      if (!earliest) return [];
      return [{
        id: `${id}-${earliest.id}`,
        university: info?.university ?? 'University',
        program: info?.courseName ?? 'Programme',
        date: earliest.date,
        type: classifyDeadlineType(earliest.name),
        studentId: id,
      }];
    });

    const studentNotes: CounsellorNote[] = ns
      .map((n) => ({
        id: n.id,
        date: n.created_at,
        content: n.body,
        type: n.note_type as CounsellorNote['type'],
      }))
      .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

    const lastActive =
      maxIso(
        p.updated_at,
        a.updated_at,
        l.updated_at,
        ...as.map((app) => app.updated_at),
        ...ns.map((n) => n.created_at)
      ) ??
      profileCreated.get(id) ??
      new Date().toISOString();

    // flags (single source — feeds both the chips and the at-risk panel)
    const flags: StudentFlag[] = [];
    if (completionPct < 100) flags.push('profile_incomplete');
    const hasUrgentDeadline = studentDeadlines.some((d) => {
      const days = Math.ceil((parseLocalDate(d.date).getTime() - today.getTime()) / MS_PER_DAY);
      return days >= 0 && days <= 14;
    });
    if (hasUrgentDeadline) flags.push('deadline_urgent');
    if (studentMatches.length === 0) flags.push('no_matches');
    const daysSinceActive = Math.round((Date.now() - new Date(lastActive).getTime()) / MS_PER_DAY);
    const hasOpenApp = studentApps.some(isOpenApplication);
    if (daysSinceActive > 14 && hasOpenApp) flags.push('stalled');

    return {
      id,
      personal: {
        firstName: p.first_name ?? '',
        lastName: p.last_name ?? '',
        nationality: p.nationality ?? '',
        flagEmoji: flagEmoji(p.nationality, p.resident_country),
        school: a.school_name ?? '',
        schoolCity: a.school_city ?? '',
        schoolCountry: a.school_country ?? '',
        email: p.email ?? '',
      },
      academic: {
        programmeType: mapProgrammeType(a.programme_type),
        ibPoints: a.ib_total_points ?? undefined,
        aLevelGrades: gradesObjectToString(a.a_level_predicted_grades),
        subjects: subs.map((s) => formatSubject(s.subject_name, s.level)),
        clusters: (a.intended_clusters ?? []) as string[],
        careerAspiration: a.career_aspiration ?? '',
        englishStatus: mapEnglishStatus(a.english_status),
        admissionsTests: ts
          .filter((t) => t.test_type && t.test_type !== 'NONE')
          .map((t) => ({ type: t.test_type, status: t.status, score: t.score_numeric ?? undefined })),
        graduationYear: a.graduation_year ?? new Date().getFullYear() + 1,
      },
      lifestyle: {
        teachingStyle: (l.teaching_style ?? 'mixed') as CounsellorStudent['lifestyle']['teachingStyle'],
        locationPreference: l.desired_location_type ?? 'no_preference',
        campusSize: (l.campus_size ?? 'no_preference') as CounsellorStudent['lifestyle']['campusSize'],
        interests: (l.extracurricular_interests ?? []) as string[],
      },
      profile: { completionPct, stepsComplete },
      matches: studentMatches,
      applications: studentApps,
      deadlines: studentDeadlines,
      notes: studentNotes,
      flags,
      lastActive,
    };
  });
};

export const loadCohort = (supabase: Client, opts: { excludeId?: string } = {}): Promise<CounsellorStudent[]> =>
  buildStudents(supabase, opts);

export const loadStudentById = async (supabase: Client, id: string): Promise<CounsellorStudent | null> => {
  const [student] = await buildStudents(supabase, { ids: [id] });
  return student ?? null;
};

// ── slim roster loader (name + completion chips only) ───────────────────────
//
// Pages that only render student chips (e.g. /counsellor/universities) don't
// need the full loadCohort pipeline — matches fan-out, programme resolution
// and deadlines all get discarded. This replicates just the cohort scoping and
// completion inputs: 5 fixed queries, no per-student fan-out.

export type RosterStudent = {
  id: string;
  name: string;
  flag: string;
  completionPct: number;
};

export const loadRoster = async (
  supabase: Client,
  opts: { excludeId?: string } = {}
): Promise<RosterStudent[]> => {
  // 1. base profiles (students only)
  const profiles = unwrap(
    // `.eq('role', 'student')` — NOT 'counsellor.student'. `profiles.role` is
    // 'student' | 'counsellor' | 'admin' (schema.sql:60), so the prefixed value
    // matched nothing and this function returned [] for every input.
    await supabase.from('profiles').select('id').eq('role', 'student'),
    'counsellor.profiles'
  ) ?? [];
  let ids = profiles.map((p) => p.id);
  if (opts.excludeId) ids = ids.filter((id) => id !== opts.excludeId);
  if (ids.length === 0) return [];

  // 2. seeded-cohort scoping — identical to buildStudents. The selected columns
  // cover the name chip, the flag, and every field buildStepCompletion reads.
  const personal = (unwrap(
    await supabase
      .from('student_personal_information')
      .select('profile_id, first_name, last_name, email, nationality, resident_country')
      .in('profile_id', ids),
    'student_personal_information'
  ) ?? []) as any[];
  const personalById = new Map<string, any>(personal.map((r) => [r.profile_id, r]));
  ids = ids.filter((id) => inDemoCohort(personalById.get(id)?.email));
  if (ids.length === 0) return [];

  // 3. completion inputs only (no matches/programs/deadlines/notes)
  const [academicRes, subjectsRes, lifestyleRes] = await Promise.all([
    supabase
      .from('student_academic_input')
      // Column list comes from COMPLETION_COLUMNS, not hand-written. This was the
      // second copy that omitted `english_status` (the other was middleware.ts),
      // so a student who answered "Not sure" to the English question showed as
      // incomplete on the counsellor roster while their own dashboard — reading
      // the same rule over `select('*')` — showed them complete.
      .select(`profile_id, ${COMPLETION_COLUMNS.academicInput}`)
      .in('profile_id', ids),
    supabase.from('student_subjects').select('profile_id').in('profile_id', ids),
    supabase.from('student_lifestyle_preference').select('profile_id').in('profile_id', ids),
  ]);
  const academicById = new Map<string, any>(
    ((unwrap(academicRes, 'counsellor.student_academic_input') ?? []) as any[]).map((r) => [r.profile_id, r])
  );
  const subjectCounts = new Map<string, number>();
  for (const r of (unwrap(subjectsRes, 'counsellor.student_subjects') ?? []) as any[]) {
    subjectCounts.set(r.profile_id, (subjectCounts.get(r.profile_id) ?? 0) + 1);
  }
  const lifestyleById = new Map<string, any>(
    ((unwrap(lifestyleRes, 'counsellor.student_lifestyle_preference') ?? []) as any[]).map((r) => [r.profile_id, r])
  );

  return ids.map((id): RosterStudent => {
    const p = personalById.get(id) ?? ({} as any);
    const { completionPct } = computeProfileCompletion(
      p,
      academicById.get(id) ?? null,
      subjectCounts.get(id) ?? 0,
      lifestyleById.get(id) ?? null
    );
    return {
      id,
      name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Student',
      flag: flagEmoji(p.nationality, p.resident_country),
      completionPct,
    };
  });
};

// ── pure derivations over a loaded cohort (mirror the dummy helpers) ─────────

export const deriveCohortStats = (students: CounsellorStudent[]): CohortStats => {
  const total = students.length || 1;
  const today = startOfToday();
  const inOneWeek = new Date(today);
  inOneWeek.setDate(inOneWeek.getDate() + 7);

  const deadlinesThisWeek = students.flatMap((s) =>
    s.deadlines.filter((d) => {
      const date = parseLocalDate(d.date);
      return date >= today && date <= inOneWeek;
    })
  ).length;

  return {
    total: students.length,
    avgCompletion: Math.round(students.reduce((acc, s) => acc + s.profile.completionPct, 0) / total),
    flagged: students.filter((s) => s.flags.length > 0).length,
    deadlinesThisWeek,
    matchTiers: {
      reach: students.filter((s) => s.matches.some((m) => m.tier === 'Reach')).length,
      match: students.filter((s) => s.matches.some((m) => m.tier === 'Match')).length,
      safe: students.filter((s) => s.matches.some((m) => m.tier === 'Safe')).length,
    },
    appFunnel: {
      planning: students.filter((s) => s.applications.some((a) => a.status === 'planning')).length,
      inProgress: students.filter((s) => s.applications.some((a) => a.status === 'in_progress')).length,
      submitted: students.filter((s) => s.applications.some((a) => a.status === 'submitted')).length,
      decision: students.filter((s) => s.applications.some((a) => a.status === 'decision')).length,
      enrolled: students.filter((s) => s.applications.some((a) => a.status === 'enrolled')).length,
    },
    programmeBreakdown: {
      ib: students.filter((s) => s.academic.programmeType === 'IB').length,
      aLevel: students.filter((s) => s.academic.programmeType === 'A_LEVEL').length,
    },
  };
};

const withStudent = (students: CounsellorStudent[]): DeadlineWithStudent[] => {
  const today = startOfToday();
  return students.flatMap((s) =>
    s.deadlines.map((d) => ({
      ...d,
      studentName: `${s.personal.firstName} ${s.personal.lastName}`.trim(),
      studentFlag: s.personal.flagEmoji,
      daysUntil: Math.ceil((parseLocalDate(d.date).getTime() - today.getTime()) / MS_PER_DAY),
    }))
  );
};

export const deriveUpcomingDeadlines = (students: CounsellorStudent[], withinDays = 30): DeadlineWithStudent[] => {
  const today = startOfToday();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + withinDays);
  return withStudent(students)
    .filter((d) => parseLocalDate(d.date) >= today && parseLocalDate(d.date) <= cutoff)
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
};

export const deriveAllDeadlines = (students: CounsellorStudent[]): DeadlineWithStudent[] =>
  withStudent(students).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

export const deriveRecentActivity = (students: CounsellorStudent[]): ActivityItem[] =>
  students
    .flatMap((s) =>
      s.notes.map((n) => ({
        ...n,
        studentName: `${s.personal.firstName} ${s.personal.lastName}`.trim(),
        studentId: s.id,
        studentFlag: s.personal.flagEmoji,
      }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

const CLUSTER_LABELS: Record<string, string> = {
  computer_science: 'Computer Science',
  engineering: 'Engineering',
  economics_quant: 'Economics',
  business_non_quant: 'Business',
  maths: 'Mathematics',
  medicine_dentistry: 'Medicine',
  life_sciences_biochem: 'Life Sciences',
  law: 'Law',
  humanities: 'Humanities',
  creative: 'Creative Arts',
};

export const deriveFieldDistribution = (students: CounsellorStudent[]) => {
  const counts: Record<string, number> = {};
  students.forEach((s) => s.academic.clusters.forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
  return Object.entries(counts)
    .map(([key, count]) => ({ key, label: CLUSTER_LABELS[key] || key, count }))
    .sort((a, b) => b.count - a.count);
};

export const deriveAtRiskAlerts = (students: CounsellorStudent[]): AtRiskAlert[] => {
  const alerts: AtRiskAlert[] = [];
  const now = Date.now();
  students.forEach((s) => {
    const name = `${s.personal.firstName} ${s.personal.lastName}`.trim();
    const emoji = s.personal.flagEmoji;
    if (s.profile.completionPct < 70) {
      alerts.push({
        studentId: s.id, studentName: name, flagEmoji: emoji,
        riskType: 'low_completion',
        urgency: s.profile.completionPct < 50 ? 'critical' : 'high',
        description: `Profile only ${s.profile.completionPct}% complete — missing sections limit match quality.`,
        suggestedAction: 'Schedule a session to complete their profile together.',
      });
    }
    const daysSinceActive = Math.round((now - new Date(s.lastActive).getTime()) / MS_PER_DAY);
    if (daysSinceActive > 14 && s.applications.some(isOpenApplication)) {
      alerts.push({
        studentId: s.id, studentName: name, flagEmoji: emoji,
        riskType: 'stalled_application',
        urgency: daysSinceActive > 30 ? 'critical' : 'high',
        description: `No activity for ${daysSinceActive} days with ${s.applications.filter(isOpenApplication).length} incomplete application(s).`,
        suggestedAction: 'Send a check-in message or schedule a meeting.',
      });
    }
    s.deadlines.forEach((dl) => {
      const daysUntil = Math.round((parseLocalDate(dl.date).getTime() - now) / MS_PER_DAY);
      const matchingApp = s.applications.find((a) => a.university === dl.university);
      if (daysUntil > 0 && daysUntil <= 14 && matchingApp && matchingApp.status === 'planning') {
        alerts.push({
          studentId: s.id, studentName: name, flagEmoji: emoji,
          riskType: 'deadline_approaching',
          urgency: daysUntil <= 5 ? 'critical' : 'high',
          description: `${dl.university} deadline in ${daysUntil} days but application is still in planning stage.`,
          suggestedAction: 'Prioritise this application immediately.',
        });
      }
    });
    // Flagged urgent but no deadline_approaching alert yet (e.g. the nearest app
    // isn't in 'planning' status) — surface a critical alert anyway. Mirrors the
    // dummy getAtRiskAlerts fallback.
    if (s.flags.includes('deadline_urgent') && !alerts.some((a) => a.studentId === s.id && a.riskType === 'deadline_approaching')) {
      alerts.push({
        studentId: s.id, studentName: name, flagEmoji: emoji,
        riskType: 'deadline_approaching',
        urgency: 'critical',
        description: 'Flagged as having an urgent deadline.',
        suggestedAction: 'Review deadlines and ensure all materials are ready.',
      });
    }

    if (s.flags.includes('no_matches') && s.matches.length === 0) {
      alerts.push({
        studentId: s.id, studentName: name, flagEmoji: emoji,
        riskType: 'missing_documents',
        urgency: 'medium',
        description: 'No university matches generated — profile may need more detail.',
        suggestedAction: 'Run match generation and review shortlist.',
      });
    }
  });
  const urgencyOrder: Record<RiskUrgency, number> = { critical: 0, high: 1, medium: 2 };
  return alerts.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
};

export const deriveApplicationsWithPlatform = (students: CounsellorStudent[]): EnrichedApplication[] =>
  students.flatMap((s) =>
    s.applications.map((app) => ({
      studentId: s.id,
      studentName: `${s.personal.firstName} ${s.personal.lastName}`.trim(),
      flagEmoji: s.personal.flagEmoji,
      university: app.university,
      program: app.program,
      status: app.status,
      deadline: app.deadline,
      platform: (app.platform ?? 'UCAS') as ApplicationPlatform,
      country: app.country ?? 'UK',
    }))
  );

// ── outcomes (own queries; outcomes page only) ──────────────────────────────

export const loadOutcomes = async (supabase: Client, opts: { excludeId?: string } = {}): Promise<CounsellorOutcome[]> => {
  const studentProfiles = unwrap(
    // `.eq('role', 'student')` — NOT 'counsellor.student'. `profiles.role` is
    // 'student' | 'counsellor' | 'admin' (schema.sql:60), so the prefixed value
    // matched nothing and this function returned [] for every input.
    await supabase.from('profiles').select('id').eq('role', 'student'),
    'counsellor.profiles'
  ) ?? [];
  let ids = studentProfiles.map((p) => p.id);
  if (opts.excludeId) ids = ids.filter((id) => id !== opts.excludeId);
  if (ids.length === 0) return [];

  // Scope to the seeded demo cohort (matches the roster — see DEMO_COHORT_EMAIL_SUFFIX).
  const personalRows = (unwrap(
    await supabase
      .from('student_personal_information')
      .select('profile_id, email')
      .in('profile_id', ids),
    'student_personal_information'
  ) ?? []) as any[];
  const demoIds = new Set(personalRows.filter((r) => inDemoCohort(r.email)).map((r) => r.profile_id));
  ids = ids.filter((id) => demoIds.has(id));
  if (ids.length === 0) return [];

  const apps = (unwrap(
    await supabase
      .from('applications')
      .select('id, profile_id, program_id, status, platform, decision, decision_at, decision_conditions')
      .in('profile_id', ids),
    'applications'
  ) ?? []) as any[];
  if (apps.length === 0) return [];

  // Tier per applied (profile, programme). Fetch per-student filtered to only the
  // applied programmes — NOT one unbounded .in() over student_matches, which a
  // profile with a bloated match cache would blow past PostgREST's 1000-row cap,
  // silently dropping other students' tiers (they'd wrongly default to 'Match').
  const programsByProfile = new Map<string, Set<string>>();
  for (const a of apps) {
    (programsByProfile.get(a.profile_id) ?? programsByProfile.set(a.profile_id, new Set()).get(a.profile_id)!).add(a.program_id);
  }
  const tierByKey = new Map<string, MatchTier>();
  const matchResults = await Promise.all(
    [...programsByProfile.entries()].map(([pid, progs]) =>
      supabase
        .from('student_matches')
        .select('profile_id, program_id, score, breakdown')
        .eq('profile_id', pid)
        .in('program_id', [...progs])
    )
  );
  for (const res of matchResults) {
    for (const m of (unwrap(res, 'counsellor.student_matches') ?? []) as any[]) {
      tierByKey.set(`${m.profile_id}:${m.program_id}`, tierFromMatchRow(m));
    }
  }

  const programInfo = await resolvePrograms(supabase, apps.map((a) => a.program_id));
  const names = await nameMap(supabase, apps.map((a) => a.profile_id));

  return apps.map((app): CounsellorOutcome => {
    const info = programInfo.get(app.program_id);
    const result: OutcomeResult = (app.decision ?? 'pending') as OutcomeResult;
    return {
      id: app.id,
      studentId: app.profile_id,
      studentName: names.get(app.profile_id)?.name ?? 'Student',
      university: info?.university ?? 'University',
      program: info?.courseName ?? 'Programme',
      country: info?.country ?? 'UK',
      tier: tierByKey.get(`${app.profile_id}:${app.program_id}`) ?? 'Match',
      platform: (app.platform ?? 'UCAS') as ApplicationPlatform,
      result,
      responseDate: app.decision_at ?? null,
      conditions: app.decision_conditions ?? null,
    };
  });
};

export const deriveOutcomeStats = (outcomes: CounsellorOutcome[]): OutcomeStats => {
  const total = outcomes.length;
  const accepted = outcomes.filter((o) => o.result === 'accepted').length;
  const rejected = outcomes.filter((o) => o.result === 'rejected').length;
  const waitlisted = outcomes.filter((o) => o.result === 'waitlisted').length;
  const pending = outcomes.filter((o) => o.result === 'pending').length;
  const withdrawn = outcomes.filter((o) => o.result === 'withdrawn').length;
  // "Decided" = accepted + rejected + waitlisted. Withdrawn applications never
  // reached a decision, so they don't belong in the acceptance-rate denominator.
  const decided = total - pending - withdrawn;
  return {
    total, accepted, rejected, waitlisted, pending, withdrawn,
    acceptanceRate: decided > 0 ? Math.round((accepted / decided) * 100) : 0,
  };
};

// ── documents ─────────────────────────────────────────────────────────────────

export const loadCounsellorDocuments = async (supabase: Client): Promise<CounsellorDocument[]> => {
  const rows = (unwrap(
    await supabase.from('student_documents').select('*'),
    'student_documents'
  ) ?? []) as any[];
  if (rows.length === 0) return [];
  const names = await nameMap(supabase, rows.map((r) => r.student_profile_id));
  const today = startOfToday();
  return rows.map((r): CounsellorDocument => {
    let status = r.status as CounsellorDocument['status'];
    if (status !== 'received' && r.due_date && parseLocalDate(r.due_date) < today) status = 'overdue';
    return {
      id: r.id,
      studentId: r.student_profile_id,
      studentName: names.get(r.student_profile_id)?.name ?? 'Student',
      documentName: r.document_name,
      type: r.doc_type,
      status,
      uploadedDate: r.uploaded_at ?? undefined,
      dueDate: r.due_date ?? undefined,
      notes: r.notes ?? undefined,
    };
  });
};

// ── student evolution timeline (single student) ─────────────────────────────

export const loadStudentEvolution = async (supabase: Client, studentId: string): Promise<EvolutionEntry[]> => {
  const rows = (unwrap(
    await supabase
      .from('counsellor_notes')
      .select('id, body, note_type, created_at')
      .eq('student_profile_id', studentId),
    'counsellor_notes'
  ) ?? []) as any[];
  const categoryFor = (t: string): EvolutionEntry['category'] =>
    t === 'flag' ? 'goal' : t === 'update' ? 'milestone' : 'counsellor_note';
  const titleFor = (t: string): string =>
    t === 'flag' ? 'Flag raised' : t === 'update' ? 'Progress update' : 'Counsellor session';
  return rows
    .map((n): EvolutionEntry => ({
      id: n.id,
      date: n.created_at,
      title: titleFor(n.note_type),
      description: n.body,
      category: categoryFor(n.note_type),
      source: 'counsellor',
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
