/** @jest-environment ./jest.environment-node.js */

import type { ToolContext } from '@/lib/chat/tools/types';

jest.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

// The counsellor data layer is exercised by its own section; here it's mocked so
// the tests pin the TOOL behaviour (matching, clamping, validation), not queries.
jest.mock('@/lib/counsellor/data', () => ({
  loadCohort: jest.fn(),
  loadStudentById: jest.fn(),
  deriveCohortStats: jest.fn(() => ({ total: 0 })),
  deriveAtRiskAlerts: jest.fn(() => []),
  deriveUpcomingDeadlines: jest.fn(() => []),
  nameMap: jest.fn(async () => new Map()),
}));

jest.mock('@/lib/demo/help-request-client', () => ({
  insertHelpRequest: jest.fn(async () => ({ id: 'help-1' })),
}));

import { loadCohort, loadStudentById, deriveUpcomingDeadlines } from '@/lib/counsellor/data';
import { COUNSELLOR_READ_TOOLS, __resetCohortCache } from '@/lib/chat/tools/counsellor-read';
import { COUNSELLOR_WRITE_TOOLS } from '@/lib/chat/tools/counsellor-write';

const ctx: ToolContext = {
  supabase: {} as never,
  userId: 'counsellor-1',
  mode: 'counsellor',
};

const readTool = (name: string) => COUNSELLOR_READ_TOOLS.find((t) => t.name === name)!;
const writeTool = (name: string) => COUNSELLOR_WRITE_TOOLS.find((t) => t.name === name)!;

const student = (id: string, firstName: string, lastName: string) => ({
  id,
  personal: { firstName, lastName, flagEmoji: '🇬🇧', school: '', schoolCity: '', schoolCountry: '', nationality: '', email: '' },
  academic: { programmeType: 'IB', subjects: [], clusters: [], careerAspiration: '', englishStatus: 'met', admissionsTests: [], graduationYear: 2026 },
  lifestyle: { teachingStyle: 'mixed', locationPreference: 'no_preference', campusSize: 'no_preference', interests: [] },
  profile: { completionPct: 80, stepsComplete: ['personal'] },
  matches: [],
  applications: [],
  deadlines: [],
  notes: [],
  flags: [],
  lastActive: new Date().toISOString(),
});

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  // The cohort memo is module-level and keyed by userId — clear it so each
  // test's loadCohort mock is actually consulted.
  __resetCohortCache();
});

describe('add_student_note.validateParams', () => {
  const tool = writeTool('add_student_note');

  it('accepts a valid note and trims the body', () => {
    const res = tool.validateParams({ student_id: VALID_UUID, body: '  hi  ', note_type: 'flag' });
    expect(res).toEqual({ ok: true, params: { student_id: VALID_UUID, body: 'hi', note_type: 'flag' } });
  });

  it('rejects a non-uuid student, empty body, and bad note_type', () => {
    expect(tool.validateParams({ student_id: 'nope', body: 'x', note_type: 'flag' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, body: '   ', note_type: 'flag' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, body: 'x', note_type: 'other' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, body: 'x'.repeat(2001), note_type: 'flag' }).ok).toBe(false);
  });
});

describe('message_student.validateParams', () => {
  const tool = writeTool('message_student');

  it('accepts a valid message', () => {
    const res = tool.validateParams({ student_id: VALID_UUID, subject: 'Hi', body: 'Body' });
    expect(res).toEqual({ ok: true, params: { student_id: VALID_UUID, subject: 'Hi', body: 'Body' } });
  });

  it('rejects bad id, empty subject/body, and over-long fields', () => {
    expect(tool.validateParams({ student_id: 'x', subject: 'Hi', body: 'B' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, subject: '', body: 'B' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, subject: 'Hi', body: '' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, subject: 'x'.repeat(201), body: 'B' }).ok).toBe(false);
    expect(tool.validateParams({ student_id: VALID_UUID, subject: 'Hi', body: 'x'.repeat(2001) }).ok).toBe(false);
  });
});

describe('get_student_overview disambiguation', () => {
  const tool = readTool('get_student_overview');

  it('requires an id or name', async () => {
    const res = await tool.execute(ctx, {});
    expect(res.error).toBe('Provide a student id or name.');
  });

  it('returns an error when no name matches', async () => {
    (loadCohort as jest.Mock).mockResolvedValue([student('a', 'Ada', 'Lovelace')]);
    const res = await tool.execute(ctx, { name: 'Zoltan' });
    expect(res.error).toContain('No student matching');
    expect(loadStudentById).not.toHaveBeenCalled();
  });

  it('returns candidates when a name matches more than one student', async () => {
    (loadCohort as jest.Mock).mockResolvedValue([
      student('a', 'Ada', 'Smith'),
      student('b', 'Alan', 'Smith'),
    ]);
    const res = await tool.execute(ctx, { name: 'Smith' });
    expect(res.ambiguous).toBe(true);
    expect(res.candidates).toEqual([
      { id: 'a', name: 'Ada Smith' },
      { id: 'b', name: 'Alan Smith' },
    ]);
    expect(loadStudentById).not.toHaveBeenCalled();
  });

  it('resolves a single name match and loads the full overview', async () => {
    (loadCohort as jest.Mock).mockResolvedValue([
      student('a', 'Ada', 'Lovelace'),
      student('b', 'Alan', 'Turing'),
    ]);
    (loadStudentById as jest.Mock).mockResolvedValue(student('a', 'Ada', 'Lovelace'));
    const res = await tool.execute(ctx, { name: 'ada' });
    expect(loadStudentById).toHaveBeenCalledWith(ctx.supabase, 'a');
    expect(res.id).toBe('a');
    expect(res.name).toBe('Ada Lovelace');
  });

  it('degrades to an error payload instead of throwing', async () => {
    (loadCohort as jest.Mock).mockRejectedValue(new Error('db down'));
    const res = await tool.execute(ctx, { name: 'ada' });
    expect(res.error).toBeDefined();
  });
});

describe('get_cohort_deadlines clamping', () => {
  const tool = readTool('get_cohort_deadlines');

  it('clamps within_days to 1-90 and defaults to 30', async () => {
    (loadCohort as jest.Mock).mockResolvedValue([]);

    await tool.execute(ctx, { within_days: 500 });
    expect((deriveUpcomingDeadlines as jest.Mock).mock.calls[0][1]).toBe(90);

    await tool.execute(ctx, { within_days: -5 });
    expect((deriveUpcomingDeadlines as jest.Mock).mock.calls[1][1]).toBe(1);

    await tool.execute(ctx, {});
    expect((deriveUpcomingDeadlines as jest.Mock).mock.calls[2][1]).toBe(30);
  });
});
