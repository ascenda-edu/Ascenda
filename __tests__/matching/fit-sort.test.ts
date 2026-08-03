/** @jest-environment ./jest.environment-node.js */
//
// F-14 (docs/audit/05-domain-logic.md): the search page's DEFAULT sort option is
// labelled "fit", but `case 'fit'` fell through to `default: break` and the only
// ordering applied was `.order('id')` — primary-key order. Combined with F-03,
// the rows that sorted highest on "fit" were the ones with no fit data at all.
//
// Fit is a per-profile number with no column in `programs` (it is resolved after
// the page arrives, from student_matches + /api/match/score), so it cannot be a
// PostgREST `.order()`. `sortByFit` is where the ordering actually happens.

import { sortByFit } from '@/hooks/use-search-results';
import type { ProgramSearchResult } from '@/components/university-search/types';

const row = (id: string, fitScore: number | null): ProgramSearchResult => ({
  id,
  universityName: `Uni ${id}`,
  programName: `Program ${id}`,
  location: 'Somewhere',
  fitScore,
  tier: null,
  highlights: [],
  durationLabel: null,
  levelLabel: null,
  tuitionLabel: null
});

const ids = (rows: ProgramSearchResult[]) => rows.map((r) => r.id);

describe('sortByFit', () => {
  it('orders by fit score, highest first', () => {
    const sorted = sortByFit([row('a', 41), row('b', 88), row('c', 62)]);
    expect(ids(sorted)).toEqual(['b', 'c', 'a']);
  });

  it('is not primary-key order — the bug it replaces', () => {
    // Ids ascending would be a,b,c; fit ordering must not agree by accident.
    const sorted = sortByFit([row('a', 10), row('b', 20), row('c', 30)]);
    expect(ids(sorted)).toEqual(['c', 'b', 'a']);
  });

  it('puts unknown-fit rows last rather than treating them as best', () => {
    const sorted = sortByFit([row('a', null), row('b', 55), row('c', null), row('d', 91)]);
    expect(ids(sorted).slice(0, 2)).toEqual(['d', 'b']);
    expect(new Set(ids(sorted).slice(2))).toEqual(new Set(['a', 'c']));
  });

  it('breaks ties on id so the rendered order is reproducible', () => {
    // chance_percent is an integer clamped to 5..95, so ties are the norm.
    const sorted = sortByFit([row('z', 70), row('a', 70), row('m', 70)]);
    expect(ids(sorted)).toEqual(['a', 'm', 'z']);
  });

  it('is order-independent — the same page sorts the same way however it arrives', () => {
    const page = [row('a', 33), row('b', 91), row('c', null), row('d', 91), row('e', 12)];
    const forwards = ids(sortByFit(page));
    const backwards = ids(sortByFit([...page].reverse()));
    expect(backwards).toEqual(forwards);
  });

  it('does not mutate the caller’s array', () => {
    const page = [row('a', 10), row('b', 90)];
    const before = ids(page);
    sortByFit(page);
    expect(ids(page)).toEqual(before);
  });

  it('treats NaN fit as unknown', () => {
    const sorted = sortByFit([row('a', Number.NaN), row('b', 5)]);
    expect(ids(sorted)).toEqual(['b', 'a']);
  });

  it('handles the empty page', () => {
    expect(sortByFit([])).toEqual([]);
  });
});
