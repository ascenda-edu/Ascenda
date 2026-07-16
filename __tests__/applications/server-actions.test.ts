import {
  trackProgram,
  createChecklistTask,
  updateChecklistTaskStatus,
} from '@/lib/applications/server-actions';

// Chainable, awaitable query-builder mock. Every chain method returns the same
// builder; awaiting it shifts the next result off a shared queue, so a helper
// that issues N sequential queries is fed N queued results in order.
type Result = { data: unknown; error: { code?: string; message?: string } | null };

const makeSupabase = (queue: Result[]) => {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'limit', 'insert', 'update', 'single', 'maybeSingle'];
  for (const m of methods) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => {
    const next = queue.shift() ?? { data: null, error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  return { from: jest.fn(() => builder) };
};

describe('trackProgram', () => {
  it('inserts a new application and returns status "created"', async () => {
    const supabase = makeSupabase([
      { data: [], error: null }, // existing lookup — none
      { data: { id: 'app-1' }, error: null }, // insert
    ]);
    const result = await trackProgram(supabase as never, 'user-1', 'prog-1');
    expect(result).toEqual({ ok: true, status: 'created', applicationId: 'app-1' });
  });

  it('returns status "exists" when an application is already tracked', async () => {
    const supabase = makeSupabase([{ data: [{ id: 'app-9' }], error: null }]);
    const result = await trackProgram(supabase as never, 'user-1', 'prog-1');
    expect(result).toEqual({ ok: true, status: 'exists', applicationId: 'app-9' });
  });

  it('maps a 23503 FK violation to "Programme not found"', async () => {
    const supabase = makeSupabase([
      { data: [], error: null },
      { data: null, error: { code: '23503', message: 'fk' } },
    ]);
    const result = await trackProgram(supabase as never, 'user-1', 'missing');
    expect(result).toEqual({ ok: false, error: 'Programme not found', code: '23503' });
  });

  it('returns a generic error when the lookup fails', async () => {
    const supabase = makeSupabase([{ data: null, error: { message: 'boom' } }]);
    const result = await trackProgram(supabase as never, 'user-1', 'prog-1');
    expect(result).toEqual({ ok: false, error: 'Could not start tracking this programme' });
  });
});

describe('createChecklistTask', () => {
  it("rejects when the application isn't owned by the user", async () => {
    const supabase = makeSupabase([
      { data: { id: 'app-1', profile_id: 'someone-else' }, error: null },
    ]);
    const result = await createChecklistTask(supabase as never, 'user-1', {
      applicationId: 'app-1',
      taskName: 'Draft essay',
    });
    expect(result).toEqual({ ok: false, error: 'Unauthorized', code: 'unauthorized' });
  });

  it('returns not_found when the application does not exist', async () => {
    const supabase = makeSupabase([{ data: null, error: { message: 'no rows' } }]);
    const result = await createChecklistTask(supabase as never, 'user-1', {
      applicationId: 'app-x',
      taskName: 'Draft essay',
    });
    expect(result).toEqual({ ok: false, error: 'Application not found', code: 'not_found' });
  });

  it('inserts the task when ownership checks out', async () => {
    const supabase = makeSupabase([
      { data: { id: 'app-1', profile_id: 'user-1' }, error: null },
      { data: { id: 'task-1', task_name: 'Draft essay', status: 'todo' }, error: null },
    ]);
    const result = await createChecklistTask(supabase as never, 'user-1', {
      applicationId: 'app-1',
      taskName: 'Draft essay',
    });
    expect(result).toEqual({
      ok: true,
      task: { id: 'task-1', task_name: 'Draft essay', status: 'todo' },
    });
  });
});

describe('updateChecklistTaskStatus', () => {
  it('rejects a task owned by another user', async () => {
    const supabase = makeSupabase([
      { data: { id: 't-1', applications: { profile_id: 'other' } }, error: null },
    ]);
    const result = await updateChecklistTaskStatus(supabase as never, 'user-1', {
      taskId: 't-1',
      status: 'done',
    });
    expect(result).toEqual({ ok: false, error: 'Unauthorized', code: 'unauthorized' });
  });

  it('updates the status when the user owns the task', async () => {
    const supabase = makeSupabase([
      { data: { id: 't-1', applications: { profile_id: 'user-1' } }, error: null },
      { data: { id: 't-1', status: 'done' }, error: null },
    ]);
    const result = await updateChecklistTaskStatus(supabase as never, 'user-1', {
      taskId: 't-1',
      status: 'done',
    });
    expect(result).toEqual({ ok: true, item: { id: 't-1', status: 'done' } });
  });

  it('rejects an invalid status without querying', async () => {
    const supabase = makeSupabase([]);
    const result = await updateChecklistTaskStatus(supabase as never, 'user-1', {
      taskId: 't-1',
      status: 'nope' as never,
    });
    expect(result).toEqual({ ok: false, error: 'Invalid status' });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
