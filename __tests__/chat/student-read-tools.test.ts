/** @jest-environment ./jest.environment-node.js */

import type { ReadTool, ToolContext } from '@/lib/chat/tools/types';

jest.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

// student-read only pulls resolvePrograms from the data layer; mock it so the
// matches test pins the tool's payload shaping, not the DB.
jest.mock('@/lib/counsellor/data', () => ({
  resolvePrograms: jest.fn(),
}));

import { resolvePrograms } from '@/lib/counsellor/data';
import { STUDENT_READ_TOOLS } from '@/lib/chat/tools/student-read';
import {
  filtersFor,
  recordingClient,
  type RecordedCall,
} from '../helpers/supabase-recorder';

const ctx: ToolContext = { supabase: {} as never, userId: 'stu-1', mode: 'student' };
const tool = (name: string): ReadTool => STUDENT_READ_TOOLS.find((t) => t.name === name)!;

// YYYY-MM-DD local, N days from today — keeps daysUntil() assertions stable.
const dayOut = (n: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The double used to be a bag of `jest.fn(() => builder)` whose arguments were
 * discarded, so `profile_id` appeared nowhere in this directory and deleting the
 * scope filter from either read tool left all 1,541 tests green. It now records
 * `[method, column, value]` — see `__tests__/helpers/supabase-recorder.ts`.
 */
const clientFor = (table: string, result: { data?: unknown; error?: unknown }, calls: RecordedCall[]) =>
  recordingClient({ [table]: result }, calls);

describe('get_my_applications toWidgets', () => {
  const t = tool('get_my_applications');

  it('splits into deadlines + tasks, filters >= -30, and sorts each', () => {
    const payload = {
      applications: [
        {
          id: 'a1',
          course: 'Computer Science',
          university: 'Oxford',
          deadlines: [
            { name: 'App due', date: dayOut(10) },
            { name: 'Ancient', date: dayOut(-40) }, // dropped by -30 filter
            { name: 'Malformed', date: 'not-a-date' }, // dropped by date guard
          ],
          tasks: [
            { id: 't1', task_name: 'Essay', status: 'todo', due_date: dayOut(5) },
            { id: 't2', task_name: 'Finished', status: 'done', due_date: dayOut(1) },
          ],
        },
        {
          id: 'a2',
          course: 'Electrical Engineering',
          university: 'MIT',
          deadlines: [{ name: 'Early', date: dayOut(2) }],
          tasks: [{ id: 't3', task_name: 'No due', status: 'doing', due_date: null }],
        },
      ],
    };

    const widgets = t.toWidgets!(payload)!;
    const byKind = Object.fromEntries(widgets.map((w) => [w.kind, w]));

    // deadlines: 'Ancient' & 'Malformed' gone; sorted ascending by daysUntil.
    expect((byKind.deadlines as { items: Array<{ label: string; daysUntil: number }> }).items).toEqual([
      { label: 'Early', university: 'MIT', date: dayOut(2), daysUntil: 2 },
      { label: 'App due', university: 'Oxford', date: dayOut(10), daysUntil: 10 },
    ]);

    // tasks: not-done first (by dueDate, nulls last), done last.
    const tasks = (byKind.tasks as { items: Array<{ id: string }> }).items;
    expect(tasks.map((x) => x.id)).toEqual(['t1', 't3', 't2']);
    expect(tasks[0]).toMatchObject({ id: 't1', name: 'Essay', status: 'todo', application: 'Computer Science', applicationId: 'a1' });
  });

  it('returns null on an error payload and only emits non-empty groups', () => {
    expect(t.toWidgets!({ error: 'boom' })).toBeNull();
    const onlyTasks = t.toWidgets!({
      applications: [{ id: 'a', course: 'C', university: 'U', deadlines: [], tasks: [{ id: 'x', task_name: 'T', status: 'todo', due_date: null }] }],
    })!;
    expect(onlyTasks.map((w) => w.kind)).toEqual(['tasks']);
  });
});

describe('get_my_matches', () => {
  const t = tool('get_my_matches');

  it('clamps breakdown factors to 0-100 and passes the stored tier through', async () => {
    (resolvePrograms as jest.Mock).mockResolvedValue(
      new Map([['prog-1', { courseName: 'CS', university: 'Oxford', country: 'UK' }]])
    );
    const calls: RecordedCall[] = [];
    const supabase = clientFor(
      'student_matches',
      {
        data: [
          {
            program_id: 'prog-1',
            score: 87.6,
            breakdown: { tier: 'Reach', eligibility: 150, academicFit: -5, preferenceFit: 0, outcomes: 'x' },
          },
        ],
        error: null,
      },
      calls
    );

    const res = await t.execute({ ...ctx, supabase: supabase as never }, {});
    const first = (res.results as Array<Record<string, unknown>>)[0];
    expect(first.tier).toBe('Reach');
    expect(first.score).toBe(88);
    expect(first.factors).toEqual({ eligibility: 100, academicFit: 0, preferenceFit: 0, outcomes: 0 });
  });

  it('toWidgets maps stored tier, turning Unrated into null', () => {
    const payload = {
      results: [
        { id: 'p1', course: 'CS', university: 'Oxford', score: 88, tier: 'Reach', factors: { eligibility: 100, academicFit: 40, preferenceFit: 0, outcomes: 70 } },
        { id: 'p2', course: 'Law', university: 'LSE', score: 55, tier: 'Unrated', factors: { eligibility: 0, academicFit: 0, preferenceFit: 0, outcomes: 0 } },
      ],
    };
    const widgets = t.toWidgets!(payload)!;
    expect(widgets).toHaveLength(1);
    const items = (widgets[0] as { items: Array<{ tier: unknown }> }).items;
    expect(items[0].tier).toBe('Reach');
    expect(items[1].tier).toBeNull();
  });

  it('toWidgets returns null on empty results / error', () => {
    expect(t.toWidgets!({ results: [], note: 'none' })).toBeNull();
    expect(t.toWidgets!({ error: 'boom' })).toBeNull();
  });
});

/**
 * The scope property, stated on its own rather than left implicit in the payload
 * tests above.
 *
 * These tools take no student id — they read "the signed-in student's" rows, and
 * `.eq('profile_id', ctx.userId)` is the ONLY thing that makes that true. Delete
 * either line and a student asking the assistant "what are my matches?" receives
 * the highest-scoring rows across the whole table: other students' programme
 * matches, rendered into a chat widget.
 */
describe('every student read tool scopes to the caller', () => {
  it.each([
    ['get_my_matches', 'student_matches'],
    ['get_my_shortlist', 'shortlisted_programs'],
  ])('%s filters on the caller profile_id', async (toolName, table) => {
    (resolvePrograms as jest.Mock).mockResolvedValue(new Map());
    const calls: RecordedCall[] = [];
    const supabase = clientFor(table, { data: [], error: null }, calls);

    await tool(toolName).execute({ ...ctx, supabase: supabase as never }, {});

    expect(calls.map((c) => c.table)).toContain(table);
    expect(filtersFor(calls, table)).toContainEqual(['eq', 'profile_id', 'stu-1']);
    // No filter may name a profile other than the caller's.
    for (const [, column, value] of filtersFor(calls, table)) {
      if (column === 'profile_id') expect(value).toBe('stu-1');
    }
  });
});

describe('get_my_shortlist toWidgets', () => {
  const t = tool('get_my_shortlist');

  it('maps rows to a programs widget (location → country)', () => {
    const payload = {
      shortlist: [
        { id: 'p1', course: 'CS', university: 'Oxford', location: 'Oxford, UK', stage: 'Researching', due_date: null },
        { id: 'p2', course: 'Law', university: 'LSE', location: null, stage: 'Applying', due_date: null },
      ],
    };
    const widgets = t.toWidgets!(payload)!;
    expect(widgets[0].kind).toBe('programs');
    expect((widgets[0] as { items: unknown[] }).items).toEqual([
      { id: 'p1', course: 'CS', university: 'Oxford', country: 'Oxford, UK', city: null, level: null },
      { id: 'p2', course: 'Law', university: 'LSE', country: '—', city: null, level: null },
    ]);
  });

  it('returns null for the localStorage-posture note and empty sets', () => {
    expect(t.toWidgets!({ note: 'stored only in the browser' })).toBeNull();
    expect(t.toWidgets!({ shortlist: [] })).toBeNull();
  });
});
