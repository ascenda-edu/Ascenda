/**
 * @jest-environment ./jest.environment-node.js
 */

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/applications/server-actions', () => ({
  createChecklistTask: jest.fn(),
  updateChecklistTaskStatus: jest.fn(),
}));

import { PATCH, POST, DELETE } from '@/app/api/checklist/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createChecklistTask, updateChecklistTaskStatus } from '@/lib/applications/server-actions';

const req = (method: string, body: unknown) =>
  new Request('http://localhost/api/checklist', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

// A minimal authed client with no query surface — the PATCH/POST paths only
// touch auth.getUser() and the (mocked) server-actions.
const authedClient = () => ({
  auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }) },
});

const unauthedClient = () => ({
  auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
});

// Build a supabase mock for the DELETE path: select().eq().single() resolves to
// `selectResult`; delete().eq() resolves to `deleteResult`.
const deleteClient = (selectResult: unknown, deleteResult: unknown = { error: null }) => {
  const single = jest.fn().mockResolvedValue(selectResult);
  const selectEq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq: selectEq });
  const deleteEq = jest.fn().mockResolvedValue(deleteResult);
  const del = jest.fn().mockReturnValue({ eq: deleteEq });
  const from = jest.fn().mockReturnValue({ select, delete: del });
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }) },
    from,
    __spies: { from, select, selectEq, single, del, deleteEq },
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue(authedClient());
  (createChecklistTask as jest.Mock).mockResolvedValue({ ok: true, task: { id: 'task-1' } });
  (updateChecklistTaskStatus as jest.Mock).mockResolvedValue({ ok: true, item: { id: 'task-1' } });
});

describe('checklist route — auth', () => {
  it('PATCH/POST/DELETE all 401 when unauthenticated', async () => {
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue(unauthedClient());
    for (const res of [
      await PATCH(req('PATCH', { id: 'task-1', status: 'done' })),
      await POST(req('POST', { application_id: 'app-1', task_name: 'x' })),
      await DELETE(req('DELETE', { id: 'task-1' })),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(updateChecklistTaskStatus).not.toHaveBeenCalled();
    expect(createChecklistTask).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/checklist', () => {
  it('400 on missing id or status, and invalid status value', async () => {
    for (const bad of [
      { status: 'done' }, // missing id
      { id: 'task-1' }, // missing status
      { id: 'task-1', status: 'archived' }, // invalid value
    ]) {
      const res = await PATCH(req('PATCH', bad));
      expect(res.status).toBe(400);
    }
    expect(updateChecklistTaskStatus).not.toHaveBeenCalled();
  });

  it('maps a not_found result to 404 with a generic body — never the raw error', async () => {
    // The action collapses exists-but-not-yours and genuinely-missing into one
    // 'not_found' at the source; the route must still mask the raw error text so
    // it can't reopen the existence oracle the 404 status closes.
    (updateChecklistTaskStatus as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'internal: row 9f3 owned by other-user',
      code: 'not_found',
    });
    const res = await PATCH(req('PATCH', { id: 'task-1', status: 'done' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Checklist item not found' });
  });

  it('happy path returns the updated item', async () => {
    const res = await PATCH(req('PATCH', { id: 'task-1', status: 'doing' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ item: { id: 'task-1' } });
    expect(updateChecklistTaskStatus).toHaveBeenCalledWith(expect.anything(), 'user-123', {
      taskId: 'task-1',
      status: 'doing',
    });
  });
});

describe('POST /api/checklist', () => {
  it('400 on missing application_id or task_name', async () => {
    for (const bad of [
      { task_name: 'x' }, // missing application_id
      { application_id: 'app-1' }, // missing task_name
      { application_id: 'app-1', task_name: '   ' }, // whitespace-only
    ]) {
      const res = await POST(req('POST', bad));
      expect(res.status).toBe(400);
    }
    expect(createChecklistTask).not.toHaveBeenCalled();
  });

  it('clamps a >200-char task_name to 200 before calling createChecklistTask', async () => {
    const longName = 'a'.repeat(500);
    const res = await POST(req('POST', { application_id: 'app-1', task_name: longName }));
    expect(res.status).toBe(201);
    const args = (createChecklistTask as jest.Mock).mock.calls[0][2];
    expect(args.taskName).toHaveLength(200);
  });

  it('rejects invalid due_date with 400 — including impossible calendar days', async () => {
    // 2026-02-30 etc. matter: bare `new Date('2026-02-30')` ROLLS OVER to a
    // valid Mar 2, so a naive NaN check would let these through.
    for (const bad of ['2026-13-45', 'not-a-date', '2026-2-3', '2026-02-30', '2026-02-29', '2026-04-31', '2026-00-10', '2026-01-00']) {
      const res = await POST(req('POST', { application_id: 'app-1', task_name: 'x', due_date: bad }));
      expect(res.status).toBe(400);
    }
    expect(createChecklistTask).not.toHaveBeenCalled();
  });

  it('accepts a real leap day', async () => {
    const res = await POST(req('POST', { application_id: 'app-1', task_name: 'x', due_date: '2028-02-29' }));
    expect(res.status).toBe(201);
    expect((createChecklistTask as jest.Mock).mock.calls[0][2].dueDate).toBe('2028-02-29');
  });

  it('accepts a valid due_date and passes it through', async () => {
    const res = await POST(req('POST', { application_id: 'app-1', task_name: 'x', due_date: '2026-08-01' }));
    expect(res.status).toBe(201);
    expect((createChecklistTask as jest.Mock).mock.calls[0][2].dueDate).toBe('2026-08-01');
  });

  it('passes null when due_date is omitted', async () => {
    const res = await POST(req('POST', { application_id: 'app-1', task_name: 'x' }));
    expect(res.status).toBe(201);
    expect((createChecklistTask as jest.Mock).mock.calls[0][2].dueDate).toBeNull();
  });

  it('maps a not_found result to 404 with a generic body — never the raw error', async () => {
    (createChecklistTask as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'internal: app 9f3 owned by other-user',
      code: 'not_found',
    });
    const res = await POST(req('POST', { application_id: 'app-1', task_name: 'x' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Application not found' });
  });
});

describe('DELETE /api/checklist', () => {
  it('400 when id is missing', async () => {
    const res = await DELETE(req('DELETE', {}));
    expect(res.status).toBe(400);
  });

  it('404 when the row exists but is owned by someone else', async () => {
    const client = deleteClient({
      data: { id: 'task-1', applications: { profile_id: 'other-user' } },
      error: null,
    });
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue(client);
    const res = await DELETE(req('DELETE', { id: 'task-1' }));
    expect(res.status).toBe(404);
    // must not have attempted the delete
    expect(client.__spies.del).not.toHaveBeenCalled();
  });

  it('404 when the row does not exist', async () => {
    const client = deleteClient({ data: null, error: { message: 'no rows' } });
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue(client);
    const res = await DELETE(req('DELETE', { id: 'task-1' }));
    expect(res.status).toBe(404);
  });

  it('happy path deletes and returns { ok: true }', async () => {
    const client = deleteClient({
      data: { id: 'task-1', applications: { profile_id: 'user-123' } },
      error: null,
    });
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue(client);
    const res = await DELETE(req('DELETE', { id: 'task-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(client.__spies.del).toHaveBeenCalledTimes(1);
    expect(client.__spies.deleteEq).toHaveBeenCalledWith('id', 'task-1');
  });
});
