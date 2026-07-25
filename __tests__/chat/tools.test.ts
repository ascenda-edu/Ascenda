import { executeSearchPrograms, buildToolsForMode } from '@/lib/chat/tools';

jest.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

// Chainable, awaitable query-builder mock that records every filter call.
// Deliberately has NO .or() — the CLAUDE.md gotcha (PostgREST .or() with
// spaces in ilike values crashes) means calling it should blow the test up.
type BuilderResult = { data: unknown; error: { message: string } | null; count?: number };

const makeBuilder = (result: BuilderResult) => {
  const calls: Record<string, unknown[][]> = { select: [], limit: [], in: [], ilike: [], gte: [] };
  const builder: Record<string, unknown> = { calls };
  for (const method of Object.keys(calls)) {
    builder[method] = jest.fn((...args: unknown[]) => {
      calls[method].push(args);
      return builder;
    });
  }
  builder.then = (resolve: (v: BuilderResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder as { calls: Record<string, unknown[][]> } & Record<string, jest.Mock>;
};

const programRow = {
  id: 'prog-1',
  course_name: 'Computer Science BSc',
  study_level: 'Undergraduate',
  universities: { name: 'University of Oxford', country: 'United Kingdom', city: 'Oxford' },
};

// The query-error test spies on console.warn (executeSearchPrograms warns when
// the catalogue query fails). Restoring in afterEach keeps the spy from leaking
// if an assertion throws mid-test.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('executeSearchPrograms', () => {
  it('AND-chains ilike filters per course word — never .or()', async () => {
    const programs = makeBuilder({ data: [programRow], error: null });
    const supabase = { from: jest.fn(() => programs) };

    const result = await executeSearchPrograms(supabase as never, { query: 'computer science' });

    expect(programs.calls.ilike).toEqual(
      expect.arrayContaining([
        ['course_name', '%computer%'],
        ['course_name', '%science%'],
      ])
    );
    expect(result.results).toEqual([
      {
        id: 'prog-1',
        course: 'Computer Science BSc',
        university: 'University of Oxford',
        country: 'United Kingdom',
        city: 'Oxford',
        level: 'Undergraduate',
      },
    ]);
  });

  it('clamps limit to 1-8 and defaults to 5', async () => {
    const programs = makeBuilder({ data: [], error: null });
    const supabase = { from: jest.fn(() => programs) };

    await executeSearchPrograms(supabase as never, { query: 'law', limit: 50 });
    expect(programs.calls.limit[0]).toEqual([8]);

    await executeSearchPrograms(supabase as never, { query: 'law', limit: -3 });
    expect(programs.calls.limit[1]).toEqual([1]);

    await executeSearchPrograms(supabase as never, { query: 'law' });
    expect(programs.calls.limit[2]).toEqual([5]);
  });

  it('resolves a university name to ids (recognition first) and filters by them', async () => {
    const programs = makeBuilder({ data: [programRow], error: null });
    const universities = makeBuilder({
      data: [{ id: 'uni-1', recognition_score: 9 }],
      error: null,
    });
    const supabase = {
      from: jest.fn((table: string) => (table === 'programs' ? programs : universities)),
    };

    await executeSearchPrograms(supabase as never, {
      query: 'economics',
      university: 'oxford university',
    });

    // Stop word 'university' is dropped; only 'oxford' matches the name.
    expect(universities.calls.ilike).toEqual([['name', '%oxford%']]);
    expect(universities.calls.gte).toEqual([['recognition_score', 5]]);
    expect(programs.calls.in).toEqual([['university_id', ['uni-1']]]);
  });

  it('reports an unmatched university instead of searching unscoped', async () => {
    const programs = makeBuilder({ data: [programRow], error: null });
    const universities = makeBuilder({ data: [], error: null });
    const supabase = {
      from: jest.fn((table: string) => (table === 'programs' ? programs : universities)),
    };

    const result = await executeSearchPrograms(supabase as never, {
      query: 'economics',
      university: 'nonexistentuni',
    });

    expect(result.results).toEqual([]);
    expect(result.note).toContain('nonexistentuni');
    expect(programs.calls.in).toEqual([]);
  });

  it('degrades to an empty result with a note on query error', async () => {
    // Warning on a failed catalogue query is intended behaviour — assert it.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const programs = makeBuilder({ data: null, error: { message: 'boom' } });
    const supabase = { from: jest.fn(() => programs) };

    const result = await executeSearchPrograms(supabase as never, { query: 'law' });
    expect(result.results).toEqual([]);
    expect(result.note).toContain('do not invent');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat] search_programs failed'),
      'boom'
    );
  });
});

describe('buildToolsForMode', () => {
  const names = (tools: ReturnType<typeof buildToolsForMode>) =>
    tools?.[0]?.functionDeclarations?.map((d) => d.name) ?? [];

  it('gives students search + help request', () => {
    expect(names(buildToolsForMode('student', false))).toEqual([
      'search_programs',
      'propose_help_request',
    ]);
  });

  it('gives counsellors search only', () => {
    expect(names(buildToolsForMode('counsellor', false))).toEqual(['search_programs']);
  });

  it('gives parents the message tool only when a contact thread exists', () => {
    expect(names(buildToolsForMode('parent', true))).toEqual(['propose_counsellor_message']);
    expect(buildToolsForMode('parent', false)).toBeUndefined();
  });
});
