/**
 * Guards for the subject-suggestion feature.
 *
 * The tests that matter here are the ones enforcing that a suggestion can never
 * damage a student's answers or block them. `968b331` — "stop the wizard blocking
 * medicine and law applicants on its own suggestion" — is what these exist to stop
 * recurring in a new place.
 */

import {
  SUGGESTED_SUBJECTS,
  suggestionFor,
  applySuggestion,
  suggestionsAreSelectable,
  ALL_SUGGESTED_NAMES
} from '@/lib/profile/wizard-suggestions';
import { CLUSTER_OPTIONS, SUBJECT_OPTIONS, buildDefaultSubjects } from '@/lib/profile/intake-options';
import type { IntendedCluster } from '@/lib/profile/intake-types';
import { validateStep3 } from '@/lib/profile/intake-validation';
import { buildInitialFormState } from '@/lib/profile/intake-logic';

const ALL_CLUSTERS = CLUSTER_OPTIONS.map((o) => o.value);

describe('the suggestion table', () => {
  it('covers every selectable cluster', () => {
    // A missing cluster is a silently absent feature for that subject area, which is
    // exactly the kind of gap nobody notices.
    ALL_CLUSTERS.forEach((cluster) => {
      expect(SUGGESTED_SUBJECTS[cluster]).toBeDefined();
      expect(SUGGESTED_SUBJECTS[cluster].length).toBeGreaterThan(0);
    });
  });

  it('only suggests subjects the picker can actually display', () => {
    // A name outside SUBJECT_OPTIONS would be written into state and then render as
    // an empty combobox — the student would see three blank rows and no explanation.
    expect(suggestionsAreSelectable()).toBe(true);
    ALL_SUGGESTED_NAMES.forEach((name) => {
      expect(SUBJECT_OPTIONS).toContain(name);
    });
  });

  it('suggests at most three, so the student still makes the real choices', () => {
    ALL_CLUSTERS.forEach((cluster) => {
      expect(SUGGESTED_SUBJECTS[cluster].length).toBeLessThanOrEqual(3);
    });
  });

  it('never repeats a subject within one cluster', () => {
    ALL_CLUSTERS.forEach((cluster) => {
      const list = SUGGESTED_SUBJECTS[cluster];
      expect(new Set(list).size).toBe(list.length);
    });
  });
});

describe('when a suggestion is offered', () => {
  it('is offered for a chosen cluster with empty rows', () => {
    const suggestion = suggestionFor(['engineering'], buildDefaultSubjects('A_LEVEL'), []);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.subjects).toEqual(['Mathematics', 'Physics', 'Chemistry']);
    expect(suggestion!.clusterLabel).toBe('Engineering');
  });

  it('is not offered before a cluster is picked', () => {
    expect(suggestionFor([], buildDefaultSubjects('IB'), [])).toBeNull();
  });

  it('is not offered once ANY subject is filled in', () => {
    // Rule 2. This is the guard that makes the feature incapable of overwriting
    // work: a banner offering to fill rows the student has started is a threat.
    const rows = buildDefaultSubjects('IB');
    rows[4].subject_name = 'Theatre Studies';
    expect(suggestionFor(['law'], rows, [])).toBeNull();
  });

  it('is not offered again once dismissed for that cluster', () => {
    expect(suggestionFor(['law'], buildDefaultSubjects('A_LEVEL'), ['law'])).toBeNull();
    // …but a DIFFERENT cluster still gets its own offer, because the student
    // changing their mind is new information.
    expect(suggestionFor(['humanities'], buildDefaultSubjects('A_LEVEL'), ['law'])).not.toBeNull();
  });

  it('reads only the PRIMARY cluster, not the secondary interests', () => {
    const suggestion = suggestionFor(['maths', 'creative'] as IntendedCluster[], buildDefaultSubjects('IB'), []);
    expect(suggestion!.cluster).toBe('maths');
  });
});

describe('applying a suggestion', () => {
  it('fills names and leaves grades empty', () => {
    // Rule 3. A suggested GRADE would be a fabrication attributed to the student.
    const rows = buildDefaultSubjects('A_LEVEL');
    const suggestion = suggestionFor(['engineering'], rows, [])!;
    const next = applySuggestion(rows, suggestion);
    expect(next.map((r) => r.subject_name)).toEqual(['Mathematics', 'Physics', 'Chemistry']);
    expect(next.every((r) => r.grade_value === '')).toBe(true);
  });

  it('preserves the IB 3 HL / 3 SL shape', () => {
    // Writing names must not disturb levels: an IB student who silently acquired a
    // fourth HL would fail "IB requires 3 Higher Level subjects" without touching a
    // level field themselves.
    const rows = buildDefaultSubjects('IB');
    const suggestion = suggestionFor(['medicine_dentistry'], rows, [])!;
    const next = applySuggestion(rows, suggestion);
    expect(next).toHaveLength(6);
    expect(next.filter((r) => r.level === 'HL')).toHaveLength(3);
    expect(next.filter((r) => r.level === 'SL')).toHaveLength(3);
  });

  it('does not mutate the array it is given', () => {
    const rows = buildDefaultSubjects('A_LEVEL');
    const suggestion = suggestionFor(['law'], rows, [])!;
    applySuggestion(rows, suggestion);
    expect(rows.every((r) => r.subject_name === '')).toBe(true);
  });

  it('leaves extra rows alone when there are more rows than suggestions', () => {
    const rows = buildDefaultSubjects('IB'); // 6 rows, 3 suggestions
    const suggestion = suggestionFor(['humanities'], rows, [])!;
    const next = applySuggestion(rows, suggestion);
    expect(next.slice(3).every((r) => r.subject_name === '')).toBe(true);
  });
});

describe('a suggestion never blocks the student (the 968b331 rule)', () => {
  it('leaves the grades screen exactly as invalid as it was before', () => {
    // The whole point. Accepting a suggestion must not ADD a validation error, and
    // must not remove one either — it fills names, so only the "subject is required"
    // messages should disappear. Nothing about a status, a level or a grade may
    // change, because those are the shapes that trapped medicine applicants.
    const state = buildInitialFormState();
    state.programmeType = 'A_LEVEL';
    state.subjects = buildDefaultSubjects('A_LEVEL');

    const before = validateStep3(state);
    const suggestion = suggestionFor(['engineering'], state.subjects, [])!;
    state.subjects = applySuggestion(state.subjects, suggestion);
    const after = validateStep3(state);

    // Names satisfied…
    expect(before['academic_input.subject_list.0.subject_name']).toBe('Subject is required.');
    expect(after['academic_input.subject_list.0.subject_name']).toBeUndefined();
    // …and nothing new appeared.
    const newKeys = Object.keys(after).filter((k) => !(k in before));
    expect(newKeys).toEqual([]);
  });

  it('never invents a grade that would then be validated', () => {
    const state = buildInitialFormState();
    state.programmeType = 'IB';
    state.subjects = buildDefaultSubjects('IB');
    const suggestion = suggestionFor(['life_sciences_biochem'], state.subjects, [])!;
    state.subjects = applySuggestion(state.subjects, suggestion);
    // Grades are still required — the suggestion did not pretend to know them.
    expect(validateStep3(state)['academic_input.subject_list.0.grade_value']).toBe('Grade is required.');
  });
});
