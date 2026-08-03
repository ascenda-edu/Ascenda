// Runtime validation for the student intake payload.
//
// `saveStudentIntake` is a `'use server'` action, i.e. a public POST endpoint,
// and `StudentProfilePayload` is erased at runtime — so without this schema the
// six-table write in `persist-intake.ts` accepts literally any JSON body.
//
// The schema mirrors `StudentProfilePayload` in `./intake-types.ts` EXACTLY; the
// type-equality assertion at the bottom of this file fails the typecheck if the
// two ever drift apart. Bounds are deliberately generous: this schema must never
// reject a payload the real intake form (`_components/StudentIntakeForm.tsx`)
// can actually produce.

import { z } from 'zod';
import type {
  StudentProfilePayload
} from '@/lib/profile/intake-types';

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Rejects NaN and ±Infinity, which plain `z.number()` lets through for Infinity. */
const finiteNumber = () => z.number().finite();

/** Names, countries, cities, single-word-ish free text. */
const shortText = z.string().max(200);
/** Titles, comma-joined multi-selects. */
const mediumText = z.string().max(500);
/** Summaries, statements, highlights. */
const longText = z.string().max(4000);

// Mirrors the intake form's own email check (StudentIntakeForm `validateStep1`)
// so nothing the form accepts can be rejected here.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ─── Enums (mirror intake-types.ts) ──────────────────────────────────────────

export const programmeTypeSchema = z.enum(['IB', 'A_LEVEL', 'ACT']);

export const intendedClusterSchema = z.enum([
  'computer_science',
  'maths',
  'engineering',
  'life_sciences_biochem',
  'medicine_dentistry',
  'economics_quant',
  'business_non_quant',
  'law',
  'humanities',
  'creative'
]);

export const englishTestTypeSchema = z.enum(['IELTS', 'TOEFL', 'DUOLINGO', 'WAIVER', 'NONE']);

export const englishStatusSchema = z.enum([
  'met',
  'exceeds',
  'exceptional',
  'booked',
  'missing',
  'failed'
]);

export const admissionsTestTypeSchema = z.enum([
  'LNAT',
  'UCAT',
  'TMUA',
  'MAT',
  'STEP',
  'ESAT',
  'TSA',
  'NONE'
]);

export const admissionsStatusSchema = z.enum(['taken', 'booked', 'missing']);

export const activityLevelSchema = z.enum(['School', 'Regional', 'National', 'International']);

// NOTE: the middle two use an EN DASH (–), matching ACTIVITY_DURATIONS in the form.
export const activityDurationSchema = z.enum(['< 1 year', '1–2 years', '3–4 years', '5+ years']);

const aLevelGradeSchema = z.enum(['A*', 'A', 'B', 'C', 'D', 'E', 'U']);
const ibLetterGradeSchema = z.enum(['A', 'B', 'C', 'D', 'E']);

// ─── Rows ────────────────────────────────────────────────────────────────────

export const studentSubjectSchema = z.object({
  subject_name: shortText,
  level: z.enum(['HL', 'SL', 'A_LEVEL', 'AP']),
  // IB rows submit a number (1–7); A-level/AP rows submit a letter grade string.
  grade_value: z.union([finiteNumber(), z.string().max(50)]).nullable()
});

export const studentAdmissionsTestSchema = z.object({
  test_type: admissionsTestTypeSchema,
  status: admissionsStatusSchema,
  // Raw scales vary wildly by test (LNAT 0–42, TMUA 1–9, UCAT up to 3600), so
  // this range is intentionally loose — it exists only to block absurd values.
  score_numeric: finiteNumber().min(0).max(100_000).nullable(),
  percentile: finiteNumber().min(0).max(100).nullable()
});

export const studentActivitySchema = z.object({
  id: z.string().max(200).optional(),
  category: shortText,
  level: activityLevelSchema.nullable(),
  duration: activityDurationSchema.nullable(),
  highlight: longText.nullable(),
  sort_order: z.number().int().min(0).max(10_000)
});

// ─── Sections ────────────────────────────────────────────────────────────────

export const personalInformationSchema = z.object({
  first_name: z.string().min(1).max(200),
  last_name: z.string().min(1).max(200),
  email: z.string().min(3).max(320).regex(EMAIL_RE, 'Enter a valid email address.'),
  phone: z.string().max(50).nullable(),
  // Multiple nationalities arrive comma-joined, hence the medium bound.
  nationality: z.string().min(1).max(500),
  age: finiteNumber().min(0).max(120).nullable(),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).nullable(),
  resident_country: z.string().min(1).max(200),
  current_location_city: shortText.nullable(),
  time_zone: shortText.nullable()
});

export const academicInputSchema = z.object({
  programme_type: programmeTypeSchema,
  school_name: z.string().min(1).max(300),
  school_country: z.string().min(1).max(200),
  school_city: shortText.nullable(),
  school_type: z
    .enum(['international_school', 'local_private', 'state_public', 'boarding', 'other'])
    .nullable(),
  language_of_instruction: z.enum(['english', 'bilingual', 'non_english']).nullable(),
  // The form offers currentYear-2 … currentYear+5; this window is far wider so
  // that a profile hydrated from an old DB row can always be re-saved.
  graduation_year: z.number().int().min(1950).max(2100),
  // Free-form date-ish string ("2027-09" / "Autumn 2027") — not parsed here.
  desired_start_date: shortText.nullable(),
  intended_clusters: z.array(intendedClusterSchema).max(20),
  secondary_clusters: z.array(intendedClusterSchema).max(20),
  career_aspiration: longText.nullable(),
  // The form caps at 6 (IB) / 4 (A-level); 30 leaves room for any future curriculum.
  subject_list: z.array(studentSubjectSchema).max(30),
  ib_total_points: finiteNumber().min(0).max(45).nullable(),
  ib_core_points: finiteNumber().min(0).max(3).nullable(),
  ib_tok_grade: ibLetterGradeSchema.nullable(),
  ib_ee_grade: ibLetterGradeSchema.nullable(),
  ib_math_pathway: z.enum(['AA_HL', 'AA_SL', 'AI_HL', 'AI_SL']).nullable(),
  ee_subject: shortText.nullable(),
  ee_title: mediumText.nullable(),
  ee_summary: longText.nullable(),
  // Keyed by subject name, so the key bound matches `subject_name`.
  a_level_predicted_grades: z.record(shortText, aLevelGradeSchema).nullable(),
  english_required: z.boolean().nullable(),
  english_test_type: englishTestTypeSchema,
  english_status: englishStatusSchema,
  // IELTS 0–9, TOEFL 0–120, Duolingo 10–160 — one loose range covers all three.
  english_score_overall: finiteNumber().min(0).max(200).nullable(),
  admissions_tests: z.array(studentAdmissionsTestSchema).max(30)
});

export const lifestylePreferenceSchema = z.object({
  teaching_style: z.enum(['academic', 'practical', 'mixed']).nullable(),
  // Multi-select stored comma-joined by the form.
  desired_location_type: mediumText.nullable(),
  campus_size: z.enum(['small', 'medium', 'large', 'no_preference']).nullable(),
  extracurricular_interests: z.array(shortText).max(100),
  other_extracurriculars: longText.nullable(),
  // Activities & ambitions (step 4)
  leadership_roles: z.array(shortText).max(100),
  commitment_level: shortText.nullable(),
  key_activities: z.array(shortText).max(100),
  sat_score: finiteNumber().min(0).max(1600).nullable(),
  act_score: finiteNumber().min(0).max(36).nullable(),
  intl_experience: z.array(shortText).max(100),
  work_experience: z.boolean().nullable(),
  work_experience_summary: longText.nullable(),
  ambition_statement: longText.nullable(),
  // EPQ / Extended Project (A-level equivalent of IB EE)
  epq_subject: shortText.nullable(),
  epq_title: mediumText.nullable()
});

// ─── Payload ─────────────────────────────────────────────────────────────────

export const studentProfilePayloadSchema = z.object({
  personal_information: personalInformationSchema,
  academic_input: academicInputSchema,
  lifestyle_preference: lifestylePreferenceSchema,
  activities_list: z.array(studentActivitySchema).max(100)
});

export type StudentProfilePayloadInput = z.infer<typeof studentProfilePayloadSchema>;

// ─── Drift guard ─────────────────────────────────────────────────────────────
//
// These are compile-time only (erased at build). If the schema and
// `StudentProfilePayload` ever diverge — a field added to one, a `.nullable()`
// written where the type says optional, an enum member missed — `tsc --noEmit`
// fails here instead of the mismatch reaching production silently.

type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

// Structural identity in both directions.
const _schemaMatchesType: Exact<StudentProfilePayloadInput, StudentProfilePayload> = true;
// Mutual assignability — a second, more readable signal if `Exact` ever gets noisy.
const _inferAssignableToType = (value: StudentProfilePayloadInput): StudentProfilePayload => value;
const _typeAssignableToInfer = (value: StudentProfilePayload): StudentProfilePayloadInput => value;

void _schemaMatchesType;
void _inferAssignableToType;
void _typeAssignableToInfer;

/**
 * Human-readable one-line summary of zod issues, safe to log server-side.
 * Field paths only — values are never included, so PII stays out of the logs.
 */
/**
 * Human-readable field list for a validation failure, safe to show the user.
 *
 * `formatIntakeIssues` is for the SERVER LOG (full paths, zod's own wording).
 * This one is for the person: it names the fields in the words the form uses, so
 * a save that fails is actionable. Deliberately no submitted values — this string
 * reaches the browser and the values are a minor's personal data.
 */
const FIELD_LABELS: Record<string, string> = {
  'academic_input.career_aspiration': 'career aspiration',
  'lifestyle_preference.ambition_statement': 'ambition statement',
  'lifestyle_preference.work_experience_summary': 'work experience summary',
  'academic_input.ee_summary': 'extended essay summary',
  'personal_information.first_name': 'first name',
  'personal_information.last_name': 'last name',
  'personal_information.email': 'email',
  'academic_input.school_name': 'school name'
};

export const describeIntakeIssues = (error: z.ZodError): string => {
  const seen = new Set<string>();
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    // Walk up to the nearest labelled ancestor so an array index
    // (subject_list.2.grade_value) still reads as a field name.
    const label =
      FIELD_LABELS[path] ??
      FIELD_LABELS[issue.path.slice(0, 2).join('.')] ??
      (issue.path[0] ? String(issue.path[0]).replace(/_/g, ' ') : 'your answers');
    seen.add(label);
  }
  const labels = [...seen];
  if (labels.length <= 2) return labels.join(' and ');
  return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} other field${labels.length - 2 === 1 ? '' : 's'}`;
};

export const formatIntakeIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
