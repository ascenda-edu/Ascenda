/**
 * Invariants on the select-column constants themselves.
 *
 * The point of `src/lib/data/columns.ts` is that a column list cannot diverge
 * between call sites. That property only holds while the constants are built
 * from the SHARED fragments — someone pasting a full string into one of them
 * would restore the divergence without changing a single call site.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
} from '@/lib/data/columns';

/**
 * The composition property has to be checked against the SOURCE, not the value.
 *
 * `expect(APPLICATION_BOARD_SELECT).toContain(`program:programs(${PROGRAMME_FIELDS}`)`
 * reads like a real assertion and is a tautology: `columns.ts` builds that
 * string by interpolating that very constant, so the two sides cannot disagree
 * — and the one regression it claims to catch (someone pasting a full literal
 * back into one of the selects) would still pass, because a freshly pasted
 * literal is byte-identical to what the template produced.
 *
 * Reading the declarations proves the thing the module header actually
 * promises: these constants are COMPOSED, so a change to a fragment reaches
 * every consumer of it.
 */
const COLUMNS_SOURCE = readFileSync(join(__dirname, '..', '..', 'src', 'lib', 'data', 'columns.ts'), 'utf8');

/** The right-hand side of `export const NAME = …` up to the closing backtick/quote. */
const declarationOf = (name: string): string => {
  const match = COLUMNS_SOURCE.match(new RegExp(`export const ${name}\\s*=\\s*([\\s\\S]*?)\\sas const;`));
  expect(match).not.toBeNull();
  return match![1];
};

describe('the shared fragments are actually shared', () => {
  it.each([
    ['APPLICATION_BOARD_SELECT'],
    ['APPLICATION_TASKS_SELECT'],
    ['APPLICATION_LABEL_SELECT'],
  ])('%s interpolates PROGRAMME_FIELDS rather than restating it', (name) => {
    const declaration = declarationOf(name);

    expect(declaration).toContain('program:programs(${PROGRAMME_FIELDS}');
    // The failure mode this catches: a literal pasted in place of the
    // interpolation. Identical output today, silently divergent tomorrow.
    expect(declaration).not.toContain('name:course_name');
  });

  it('PROGRAMME_FIELDS interpolates UNIVERSITY_FIELDS', () => {
    const declaration = declarationOf('PROGRAMME_FIELDS');

    expect(declaration).toContain('${UNIVERSITY_FIELDS}');
    expect(declaration).not.toContain('universities(');
  });

  it.each([['APPLICATION_BOARD_SELECT'], ['APPLICATION_TASKS_SELECT']])(
    '%s interpolates CHECKLIST_FIELDS',
    (name) => {
      const declaration = declarationOf(name);

      expect(declaration).toContain('${CHECKLIST_FIELDS}');
      expect(declaration).not.toContain('application_checklist(');
    }
  );

  it('the board interpolates DEADLINE_FIELDS', () => {
    const declaration = declarationOf('APPLICATION_BOARD_SELECT');

    expect(declaration).toContain('${DEADLINE_FIELDS}');
    expect(declaration).not.toContain('deadlines(id,');
  });

  it('the source scanner is looking at the real declarations', () => {
    // Without this, a rename or a reformat turns every check above into a pair
    // of assertions against an empty string — vacuous in the exact way this
    // rewrite exists to remove. `declarationOf` fails on a missing name, so
    // reaching these lines already proves the four constants were found.
    expect(declarationOf('APPLICATION_SUMMARY_SELECT').trim()).toBe(`'id,status,program_id'`);
    expect(COLUMNS_SOURCE).toContain('export const PROGRAMME_FIELDS');
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
