/**
 * "What we can do with this so far" — the wizard's live feedback, derived ENTIRELY
 * from form state.
 *
 * ── WHY THIS SHAPE, AND NOT THE THING THAT WAS REVERTED ──────────────────────
 * The form used to have no feedback at all: its own comment on the IB total called
 * that "the only immediate feedback anywhere in this form", and that exists for IB
 * students on one screen. A live preview was built to fix it and reverted the same
 * day (`be04bab`) because the idea did not survive contact with the data:
 *
 *   - it ran `scoreStudentProfile` and showed a band, but `ENCOURAGING_BANDS`
 *     needs ≥130 of 200 and that is unreachable until the BOOSTER screens — so a
 *     straight-7 IB student was told "Weak" for their first four grades, and a
 *     median IB-30 student with a complete grade set was still told "Weak";
 *   - it counted `programs.field`, which is free text from CSV passthrough with no
 *     enum: three of the ten selectable clusters have no corroborated label at all,
 *     so a student who had just chosen their subject area could be told there were
 *     ZERO programmes in it;
 *   - it cost ~58 POSTs per student across two screens, unrated, each running the
 *     scoring engine plus a `count(exact)` over a 119k-row table.
 *
 * So the rule this module exists to enforce: **never state a number about the
 * catalogue, and never grade the student.** Every entry below is a CAPABILITY claim
 * — a thing the product can do once a particular answer exists — and each is true
 * by construction because it only asserts what the field it depends on enables.
 * There is no fetch, no scoring, and nothing here can be wrong about data.
 *
 * The two booster-dependent entries are deliberate: they are what makes the
 * optional screens visibly worth doing, replacing the "you are at 60%" guilt that
 * the tiering work removed.
 */

import type { IntakeFormState } from '@/lib/profile/intake-logic';
import { clusterLabelMap } from '@/lib/profile/intake-options';

export interface UnlockEntry {
  /** Stable identity, so the UI can diff which entries are NEWLY unlocked. */
  id: string;
  /** Present tense, active voice, about the student. Never a score. */
  text: string;
  /** What is still missing. Shown only while locked. */
  need: string;
  unlocked: boolean;
}

/** The one figure quoted anywhere in the wizard. Matches `/welcome`'s copy. */
const CATALOGUE_SIZE = '119,000';

export const buildUnlocks = (state: IntakeFormState): UnlockEntry[] => {
  const primaryCluster = state.academicInput.intended_clusters[0];
  const clusterName = primaryCluster ? clusterLabelMap.get(primaryCluster) : null;
  const hasGrade = state.subjects.some((s) => String(s.grade_value).trim().length > 0);
  const hasNationality = state.nationalities.some((n) => n.trim().length > 0);
  const lifestyleAnswered = Boolean(
    state.lifestylePreference.teaching_style ||
      state.lifestylePreference.campus_size ||
      state.lifestylePreference.desired_location_type.length > 0
  );
  // Leadership and commitment live on the `activities` slice even though they
  // persist into `student_lifestyle_preference`: the state→table mapping is a schema
  // fact and does not line up with the screen→field mapping. See the note in
  // `completion.ts`.
  const activitiesAnswered = Boolean(
    state.activities.leadership_roles.length > 0 ||
      state.activities.commitment_level ||
      state.activities.key_activities.length > 0 ||
      state.activityRows.some((r) => r.category.trim())
  );

  return [
    {
      id: 'rank',
      text: `Rank ${CATALOGUE_SIZE} programmes by how well they fit you`,
      need: 'pick a subject area',
      unlocked: Boolean(primaryCluster)
    },
    {
      id: 'narrow',
      // Names the student's own choice back to them. Still not a count — it says we
      // will narrow TO the field, not how many are in it.
      text: clusterName
        ? `Narrow the list to ${clusterName}`
        : 'Narrow the list to your subject area',
      need: 'pick a subject area',
      unlocked: Boolean(clusterName)
    },
    {
      id: 'entry',
      text: 'Check your grades against each entry requirement',
      need: 'add one predicted grade',
      unlocked: hasGrade
    },
    {
      id: 'deadlines',
      text: 'Show only the deadlines for your application year',
      need: 'add your graduation year',
      unlocked: Boolean(state.academicInput.graduation_year)
    },
    {
      id: 'fees',
      // Fee status genuinely turns on nationality plus residence, and it genuinely
      // changes which programmes are affordable. No number attached.
      text: 'Work out your fee status and flag scholarships you can apply for',
      need: 'add your nationality and where you live',
      unlocked: hasNationality && Boolean(state.personalInfo.resident_country)
    },
    {
      id: 'profile',
      text: 'Weigh your activities and leadership alongside your grades',
      need: 'the optional Activities section',
      unlocked: activitiesAnswered
    },
    {
      id: 'tiebreak',
      text: 'Break ties on teaching style and campus feel',
      need: 'the optional Life at university section',
      unlocked: lifestyleAnswered
    }
  ];
};

export const countUnlocked = (entries: readonly UnlockEntry[]): number =>
  entries.filter((e) => e.unlocked).length;
