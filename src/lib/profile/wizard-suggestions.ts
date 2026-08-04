/**
 * Subject suggestions derived from the student's chosen subject area.
 *
 * The grades screen is the heaviest in the wizard, and a student who has just told
 * us they want to read Engineering has already told us most of what goes in the
 * first three rows. Offering those rows to accept in one tap is the largest single
 * reduction in effort available anywhere in the flow, and it costs nothing: no
 * network, no scoring, no catalogue lookup.
 *
 * ── THE CONSTRAINT THAT MATTERS MORE THAN THE FEATURE ────────────────────────
 * A suggestion must NEVER be read back by a validator.
 *
 * This is not a hypothetical. Commit `968b331` is titled "stop the wizard blocking
 * medicine and law applicants on its own suggestion", and the bug was exactly this
 * shape: choosing "Medicine & dentistry" silently added a UCAT row whose status was
 * `''`, `validateStep3` requires a status on every non-NONE admissions row, and so
 * the wizard blocked the grades screen on a row the student had never added. On a
 * fully complete saved profile the ring read 67%, Next did nothing, and the only
 * error named a field they had not touched. Every medicine and law applicant hit it
 * on first load.
 *
 * So the contract here is narrow and deliberate:
 *
 *   1. Suggestions only ever WRITE values a student could have typed themselves.
 *   2. They are offered ONLY while the rows are completely untouched, so they can
 *      never overwrite an answer.
 *   3. They fill subject NAMES and leave grades empty — a suggested grade would be
 *      a fabrication attributed to the student.
 *   4. Nothing in `intake-validation.ts` knows this module exists.
 *
 * The admissions-test suggestion in `StudentIntakeForm` follows the same rule the
 * hard way: it writes `status: 'missing'` ("not taken yet"), which is a truthful
 * default that satisfies the validator, rather than an empty status that traps.
 */

import type { IntendedCluster } from '@/lib/profile/intake-types';
import { SUBJECT_OPTIONS, clusterLabelMap, type SubjectRowState } from '@/lib/profile/intake-options';

/**
 * What most applicants to each field actually take. Three per cluster: enough to be
 * useful, few enough that a student still makes the real decisions. Every entry is
 * checked against `SUBJECT_OPTIONS` by the unit test, because a name that is not in
 * the picker would write a value the combobox cannot display.
 */
export const SUGGESTED_SUBJECTS: Record<IntendedCluster, readonly string[]> = {
  computer_science: ['Mathematics', 'Computer Science', 'Physics'],
  maths: ['Mathematics', 'Further Mathematics', 'Physics'],
  engineering: ['Mathematics', 'Physics', 'Chemistry'],
  life_sciences_biochem: ['Biology', 'Chemistry', 'Mathematics'],
  medicine_dentistry: ['Biology', 'Chemistry', 'Mathematics'],
  economics_quant: ['Mathematics', 'Economics', 'Further Mathematics'],
  business_non_quant: ['Business', 'Economics', 'Mathematics'],
  law: ['History', 'English Literature', 'Government & Politics'],
  humanities: ['History', 'English Literature', 'Philosophy'],
  creative: ['Art & Design', 'Design Technology', 'Media Studies']
};

export interface SubjectSuggestion {
  cluster: IntendedCluster;
  clusterLabel: string;
  subjects: readonly string[];
}

/**
 * The suggestion to offer, or `null`.
 *
 * Returns `null` the moment ANY subject name is filled in. That is rule 2 above:
 * once a student has typed something, a banner offering to populate the rows is at
 * best noise and at worst a threat to work they have already done.
 */
export const suggestionFor = (
  clusters: readonly IntendedCluster[],
  subjects: readonly SubjectRowState[],
  dismissedClusters: readonly string[]
): SubjectSuggestion | null => {
  const cluster = clusters[0];
  if (!cluster) return null;
  if (dismissedClusters.includes(cluster)) return null;
  const suggested = SUGGESTED_SUBJECTS[cluster];
  if (!suggested) return null;
  if (subjects.some((s) => s.subject_name.trim().length > 0)) return null;
  return {
    cluster,
    clusterLabel: clusterLabelMap.get(cluster) ?? cluster,
    subjects: suggested
  };
};

/**
 * Apply a suggestion to the existing rows, returning a NEW array.
 *
 * Only names are written, and only into rows that already exist — the row count and
 * every `level` stay exactly as `buildDefaultSubjects` set them, so an IB student
 * keeps their 3 HL / 3 SL shape and does not silently acquire a fourth HL. Grades
 * are untouched, per rule 3.
 */
export const applySuggestion = (
  subjects: readonly SubjectRowState[],
  suggestion: SubjectSuggestion
): SubjectRowState[] =>
  subjects.map((row, index) =>
    index < suggestion.subjects.length ? { ...row, subject_name: suggestion.subjects[index] } : { ...row }
  );

/** Exported for the test that keeps the table honest. */
export const ALL_SUGGESTED_NAMES = Array.from(
  new Set(Object.values(SUGGESTED_SUBJECTS).flat())
);

/** True when every suggested name is a real option in the subject picker. */
export const suggestionsAreSelectable = (): boolean =>
  ALL_SUGGESTED_NAMES.every((name) => (SUBJECT_OPTIONS as readonly string[]).includes(name));
