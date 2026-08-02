/** @jest-environment ./jest.environment-node.js */

import type { ReadTool, ToolContext } from '@/lib/chat/tools/types';

jest.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

import { UNIVERSITY_READ_TOOLS } from '@/lib/chat/tools/university-read';
import { getReadTool } from '@/lib/chat/tools/registry';

const ctx: ToolContext = { supabase: {} as never, userId: 'u-1', mode: 'student' };
const tool = (): ReadTool => UNIVERSITY_READ_TOOLS.find((t) => t.name === 'get_university_info')!;

/**
 * Every scoping call the tool made, in order, as `[method, column, value]`.
 *
 * This tool reads the PUBLIC catalogue, so there is no tenant to scope to — the
 * reason this file sat on the `recording-doubles` allowlist. But "no tenant"
 * is not "no scope": `get_university_info` resolves a name to an id and then
 * reads `universities.eq('id', …)` and `programs.eq('university_id', …)`. If
 * the second filter stops using the id the first one resolved, the assistant
 * answers a question about Imperial with somebody else's programmes and every
 * assertion below still passes. Recording the arguments is what makes that
 * visible.
 */
let filters: Array<[string, string, unknown]> = [];

// A thenable + maybeSingle chainable builder — every filter method records its
// arguments and returns the builder; awaiting it (or calling maybeSingle)
// yields the seeded result.
const makeBuilder = (result: { data: unknown; error?: unknown }) => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'limit']) {
    builder[m] = jest.fn(() => builder);
  }
  for (const m of ['gte', 'ilike', 'eq']) {
    builder[m] = jest.fn((column: string, value: unknown) => {
      filters.push([m, column, value]);
      return builder;
    });
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
};

const uniLookup = () => makeBuilder({ data: [{ id: 'uni-1', recognition_score: 9 }] });
const uniLookupEmpty = () => makeBuilder({ data: [] });

beforeEach(() => {
  filters = [];
});

const uniRow = {
  id: 'uni-1',
  name: 'Imperial College London',
  city: 'London',
  country: 'United Kingdom',
  rank_overall: 6,
  rank_source: 'QS',
  acceptance_rate_pct: 14,
  intl_tuition_low: 35000,
  intl_tuition_high: 45000,
  currency: 'GBP',
  number_of_students: 20000,
};

describe('get_university_info execute', () => {
  it('resolves → selects the university + top-3 programmes into a payload', async () => {
    const from = jest.fn();
    from
      .mockReturnValueOnce(uniLookup())
      .mockReturnValueOnce(makeBuilder({ data: uniRow, error: null }))
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            { id: 'p1', course_name: 'Computing MEng', study_level: 'Undergraduate' },
            { id: 'p2', course_name: 'Aeronautics BEng', study_level: 'Undergraduate' },
            { id: 'p3', course_name: 'Physics BSc', study_level: null },
          ],
        })
      );

    const res = await tool().execute({ ...ctx, supabase: { from } as never }, { name: 'Imperial' });

    expect(res.error).toBeUndefined();
    expect(res.university).toMatchObject({
      id: 'uni-1',
      name: 'Imperial College London',
      city: 'London',
      country: 'United Kingdom',
      rankOverall: 6,
      rankSource: 'QS',
      acceptanceRatePct: 14,
      tuitionLow: 35000,
      tuitionHigh: 45000,
      currency: 'GBP',
      students: 20000,
    });
    expect(res.programs).toEqual([
      { id: 'p1', course: 'Computing MEng', level: 'Undergraduate' },
      { id: 'p2', course: 'Aeronautics BEng', level: 'Undergraduate' },
      { id: 'p3', course: 'Physics BSc', level: null },
    ]);

    // The two reads after the name lookup must both be keyed on the id that
    // lookup resolved. Assert the whole sequence, not just its presence: a
    // `.eq('university_id', …)` pointed at anything else returns the wrong
    // university's programmes under the right university's heading, and the
    // payload assertions above cannot tell.
    expect(filters).toEqual([
      ['gte', 'recognition_score', 5],
      // lower-cased by `meaningfulWords`, which is why the argument is worth
      // recording rather than assumed.
      ['ilike', 'name', '%imperial%'],
      ['eq', 'id', 'uni-1'],
      ['eq', 'university_id', 'uni-1'],
    ]);
  });

  it('returns { error } when no university matches (never throws)', async () => {
    // resolveUniversityIds tries recognition≥5 then unscoped — both empty.
    const from = jest.fn().mockReturnValueOnce(uniLookupEmpty()).mockReturnValueOnce(uniLookupEmpty());
    const res = await tool().execute({ ...ctx, supabase: { from } as never }, { name: 'Nowhere U' });
    expect(res.error).toBe('No university matching "Nowhere U" in the catalogue.');
  });

  it('requires a name', async () => {
    const from = jest.fn(() => {
      throw new Error('supabase must not be called');
    });
    const res = await tool().execute({ ...ctx, supabase: { from } as never }, {});
    expect(res.error).toBe('Provide a university name.');
  });

  it('degrades to { error } when the detail query throws (never throws)', async () => {
    const throwingDetail: Record<string, unknown> = {};
    throwingDetail.select = jest.fn(() => throwingDetail);
    throwingDetail.eq = jest.fn((column: string, value: unknown) => {
      filters.push(['eq', column, value]);
      return throwingDetail;
    });
    throwingDetail.maybeSingle = jest.fn(() => Promise.reject(new Error('db down')));

    const from = jest.fn().mockReturnValueOnce(uniLookup()).mockReturnValueOnce(throwingDetail);
    const res = await tool().execute({ ...ctx, supabase: { from } as never }, { name: 'Imperial' });
    expect(res.error).toBeDefined();
    expect(res.university).toBeUndefined();
  });
});

describe('get_university_info toWidgets', () => {
  it('maps the payload to one universities widget with ≤3 programmes', () => {
    const result = {
      university: {
        id: 'uni-1',
        name: 'Imperial College London',
        city: 'London',
        country: 'United Kingdom',
        rankOverall: 6,
        rankSource: 'QS',
        acceptanceRatePct: 14,
        tuitionLow: 35000,
        tuitionHigh: 45000,
        currency: 'GBP',
        students: 20000,
      },
      programs: [
        { id: 'p1', course: 'Computing MEng', level: 'Undergraduate' },
        { id: 'p2', course: 'Aeronautics BEng', level: 'Undergraduate' },
        { id: 'p3', course: 'Physics BSc', level: null },
      ],
    };
    const widgets = tool().toWidgets!(result)!;
    expect(widgets).toHaveLength(1);
    expect(widgets[0].kind).toBe('universities');
    const items = (widgets[0] as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    expect((items[0] as { programs: unknown[] }).programs).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: 'uni-1', name: 'Imperial College London', country: 'United Kingdom' });
  });

  it('returns null for an error payload', () => {
    expect(tool().toWidgets!({ error: 'nope' })).toBeNull();
  });
});

describe('get_university_info registration', () => {
  it('is a read tool registered for both student and counsellor modes', () => {
    expect(getReadTool('get_university_info', 'student')).not.toBeNull();
    expect(getReadTool('get_university_info', 'counsellor')).not.toBeNull();
  });
});
