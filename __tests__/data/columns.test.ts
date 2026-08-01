/**
 * Invariants on the select-column constants themselves.
 *
 * The point of `src/lib/data/columns.ts` is that a column list cannot diverge
 * between call sites. That property only holds while the constants are built
 * from the SHARED fragments — someone pasting a full string into one of them
 * would restore the divergence without changing a single call site.
 */

import {
  APPLICATION_BOARD_SELECT,
  APPLICATION_LABEL_SELECT,
  APPLICATION_SUMMARY_SELECT,
  APPLICATION_TASKS_SELECT,
  CHECKLIST_FIELDS,
  DEADLINE_FIELDS,
  DOCUMENT_SELECT,
  MATCH_TIER_SELECT,
  PROGRAMME_FIELDS,
  UNIVERSITY_FIELDS,
} from '@/lib/data/columns';

const APPLICATION_SELECTS = {
  APPLICATION_BOARD_SELECT,
  APPLICATION_TASKS_SELECT,
  APPLICATION_LABEL_SELECT,
};

describe('the shared fragments are actually shared', () => {
  it.each(Object.entries(APPLICATION_SELECTS))(
    '%s embeds the one programme fragment',
    (_name, select) => {
      expect(select).toContain(`program:programs(${PROGRAMME_FIELDS}`);
    }
  );

  it('the programme fragment embeds the one university fragment', () => {
    expect(PROGRAMME_FIELDS).toContain(UNIVERSITY_FIELDS);
  });

  it('every application select that carries a checklist carries the same one', () => {
    for (const select of [APPLICATION_BOARD_SELECT, APPLICATION_TASKS_SELECT]) {
      expect(select).toContain(CHECKLIST_FIELDS);
    }
  });
});

describe('the columns each read shape promised', () => {
  it('the board carries notes, deadlines and the checklist', () => {
    expect(APPLICATION_BOARD_SELECT).toContain('notes');
    expect(APPLICATION_BOARD_SELECT).toContain(DEADLINE_FIELDS);
    expect(APPLICATION_BOARD_SELECT).toContain(CHECKLIST_FIELDS);
  });

  it('the aliases every consumer reads by are present', () => {
    // Renaming these silently turns `app.program.name` into undefined and every
    // card in the app reads "Programme".
    expect(PROGRAMME_FIELDS).toContain('name:course_name');
    expect(PROGRAMME_FIELDS).toContain('level:study_level');
  });

  it('the checklist carries application_id — the column the parent copy dropped', () => {
    expect(CHECKLIST_FIELDS).toContain('application_id');
  });

  it('the tasks and label shapes deliberately omit deadlines', () => {
    expect(APPLICATION_TASKS_SELECT).not.toContain('deadlines(');
    expect(APPLICATION_LABEL_SELECT).not.toContain('deadlines(');
  });

  it('the summary shape has no embeds at all', () => {
    expect(APPLICATION_SUMMARY_SELECT).not.toContain('(');
  });
});

describe('the strings are safe to send', () => {
  const ALL = [
    APPLICATION_BOARD_SELECT,
    APPLICATION_TASKS_SELECT,
    APPLICATION_LABEL_SELECT,
    APPLICATION_SUMMARY_SELECT,
    MATCH_TIER_SELECT,
    DOCUMENT_SELECT,
  ];

  it('contain no whitespace', () => {
    // PostgREST tolerates some, but whitespace is the tell-tale of a string
    // pasted back in by hand rather than composed from the fragments above.
    for (const select of ALL) expect(select).not.toMatch(/\s/);
  });

  it('have balanced embed parentheses', () => {
    for (const select of ALL) {
      const open = (select.match(/\(/g) ?? []).length;
      const close = (select.match(/\)/g) ?? []).length;
      expect(open).toBe(close);
    }
  });

  it('name no empty columns', () => {
    for (const select of ALL) {
      expect(select).not.toMatch(/,,|,\)|\(,|^,|,$/);
    }
  });
});
