import { STUDENT_WRITE_TOOLS } from '@/lib/chat/tools/student-write';
import type { WriteTool, ToolContext } from '@/lib/chat/tools/types';

jest.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

const byName = (name: string): WriteTool => {
  const tool = STUDENT_WRITE_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
};

const UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// A ctx whose supabase throws if touched — proves toProposal short-circuits on
// missing required args before it ever queries.
const noDbCtx = (): ToolContext =>
  ({
    supabase: {
      from: () => {
        throw new Error('supabase must not be called');
      },
    },
    userId: 'user-1',
    mode: 'student',
  }) as unknown as ToolContext;

describe('STUDENT_WRITE_TOOLS registry', () => {
  it('exposes the five student write tools, all kind:write / modes:[student]', () => {
    expect(STUDENT_WRITE_TOOLS.map((t) => t.name).sort()).toEqual([
      'add_to_shortlist',
      'create_task',
      'send_help_request',
      'track_application',
      'update_task_status',
    ]);
    for (const tool of STUDENT_WRITE_TOOLS) {
      expect(tool.kind).toBe('write');
      expect(tool.modes).toEqual(['student']);
      expect(tool.declaration.description).toContain('This drafts an action card');
    }
  });
});

describe('validateParams', () => {
  describe('track_application', () => {
    const tool = byName('track_application');
    it('accepts a uuid-ish program_id', () => {
      expect(tool.validateParams({ program_id: UUID })).toEqual({
        ok: true,
        params: { program_id: UUID },
      });
    });
    it('rejects a missing / bad program_id', () => {
      expect(tool.validateParams({}).ok).toBe(false);
      expect(tool.validateParams({ program_id: 'nope' }).ok).toBe(false);
    });
  });

  describe('create_task', () => {
    const tool = byName('create_task');
    it('accepts a valid task with an optional date', () => {
      const res = tool.validateParams({
        application_id: UUID,
        task_name: '  Draft essay  ',
        due_date: '2026-09-01',
      });
      expect(res).toEqual({
        ok: true,
        params: { application_id: UUID, task_name: 'Draft essay', due_date: '2026-09-01' },
      });
    });
    it('normalises an empty due_date to null', () => {
      const res = tool.validateParams({ application_id: UUID, task_name: 'X' });
      expect(res.ok && res.params.due_date).toBeNull();
    });
    it('rejects bad application id, empty name, oversized name, and bad date', () => {
      expect(tool.validateParams({ application_id: 'x', task_name: 'X' }).ok).toBe(false);
      expect(tool.validateParams({ application_id: UUID, task_name: '   ' }).ok).toBe(false);
      const big = tool.validateParams({ application_id: UUID, task_name: 'z'.repeat(500) });
      expect(big.ok && (big.params.task_name as string).length).toBe(200);
      expect(
        tool.validateParams({ application_id: UUID, task_name: 'X', due_date: '01-09-2026' }).ok
      ).toBe(false);
    });
  });

  describe('update_task_status', () => {
    const tool = byName('update_task_status');
    it('accepts a valid enum status', () => {
      expect(tool.validateParams({ task_id: UUID, status: 'done' })).toEqual({
        ok: true,
        params: { task_id: UUID, status: 'done' },
      });
    });
    it('rejects a bad uuid or a wrong enum value', () => {
      expect(tool.validateParams({ task_id: 'x', status: 'done' }).ok).toBe(false);
      expect(tool.validateParams({ task_id: UUID, status: 'archived' }).ok).toBe(false);
    });
  });

  describe('add_to_shortlist', () => {
    const tool = byName('add_to_shortlist');
    it('accepts a uuid-ish program_id and rejects junk', () => {
      expect(tool.validateParams({ program_id: UUID }).ok).toBe(true);
      expect(tool.validateParams({ program_id: '' }).ok).toBe(false);
    });
  });

  describe('send_help_request', () => {
    const tool = byName('send_help_request');
    it('requires subject and body, clamps to the max lengths', () => {
      const res = tool.validateParams({
        subject: 's'.repeat(500),
        body: 'b'.repeat(5000),
        application_id: UUID,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.params.subject as string).length).toBe(200);
        expect((res.params.body as string).length).toBe(2000);
        expect(res.params.application_id).toBe(UUID);
      }
    });
    it('rejects when subject or body is missing', () => {
      expect(tool.validateParams({ body: 'hi' }).ok).toBe(false);
      expect(tool.validateParams({ subject: 'hi' }).ok).toBe(false);
    });
  });
});

describe('toProposal returns null on missing required args (no DB touch)', () => {
  it('track_application without program_id', async () => {
    expect(await byName('track_application').toProposal(noDbCtx(), {})).toBeNull();
  });
  it('create_task without application_id / task_name', async () => {
    expect(await byName('create_task').toProposal(noDbCtx(), { task_name: 'x' })).toBeNull();
    expect(await byName('create_task').toProposal(noDbCtx(), { application_id: UUID })).toBeNull();
  });
  it('update_task_status without task_id / status', async () => {
    expect(await byName('update_task_status').toProposal(noDbCtx(), { status: 'done' })).toBeNull();
    expect(await byName('update_task_status').toProposal(noDbCtx(), { task_id: UUID })).toBeNull();
  });
  it('add_to_shortlist without program_id', async () => {
    expect(await byName('add_to_shortlist').toProposal(noDbCtx(), {})).toBeNull();
  });
  it('send_help_request without subject / body (never touches DB)', async () => {
    expect(await byName('send_help_request').toProposal(noDbCtx(), { subject: 'hi' })).toBeNull();
    expect(await byName('send_help_request').toProposal(noDbCtx(), { body: 'hi' })).toBeNull();
  });

  it('send_help_request builds a proposal with editable subject + body', async () => {
    const proposal = await byName('send_help_request').toProposal(noDbCtx(), {
      subject: 'Reference question',
      body: 'Can we talk about my reference letter?',
    });
    expect(proposal).not.toBeNull();
    expect(proposal!.tool).toBe('send_help_request');
    expect(proposal!.editable.map((f) => f.key)).toEqual(['subject', 'body']);
  });
});
