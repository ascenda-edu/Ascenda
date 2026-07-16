import {
  listConversations,
  createConversation,
  renameConversation,
  listMessages,
  updateMessageAction,
  listActionHistory,
  togglePin,
} from '@/lib/chat/history';

type BuilderResult = { data: unknown; error: unknown };

const makeBuilder = (result: BuilderResult = { data: null, error: null }) => {
  const calls: Record<string, unknown[][]> = {};
  const builder: Record<string, unknown> = { calls };
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete']) {
    builder[method] = jest.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    });
  }
  builder.single = jest.fn(async () => result);
  builder.maybeSingle = jest.fn(async () => result);
  builder.then = (resolve: (v: BuilderResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder as { calls: Record<string, unknown[][]> } & Record<string, jest.Mock>;
};

const clientFor = (tables: Record<string, unknown>) => ({
  from: jest.fn((table: string) => tables[table]),
});

describe('chat history wrapper', () => {
  it('lists conversations pinned-first, newest activity first, capped at 50', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }];
    const builder = makeBuilder({ data: rows, error: null });
    const sb = clientFor({ chat_conversations: builder });

    const result = await listConversations(sb as never, 'user-1', 'student');

    expect(result).toEqual(rows);
    expect(builder.calls.eq).toEqual([
      ['owner_id', 'user-1'],
      ['mode', 'student'],
    ]);
    expect(builder.calls.order).toEqual([
      ['pinned', { ascending: false }],
      ['last_message_at', { ascending: false }],
    ]);
    expect(builder.calls.limit).toEqual([[50]]);
  });

  it('creates a conversation and returns its id', async () => {
    const builder = makeBuilder({ data: { id: 'conv-9' }, error: null });
    const sb = clientFor({ chat_conversations: builder });

    const result = await createConversation(sb as never, { ownerId: 'u1', mode: 'parent' });

    expect(result).toEqual({ id: 'conv-9' });
    expect(builder.calls.insert).toEqual([[{ owner_id: 'u1', mode: 'parent', title: null }]]);
  });

  it('clamps rename titles to 120 chars', async () => {
    const builder = makeBuilder();
    const sb = clientFor({ chat_conversations: builder });

    await renameConversation(sb as never, 'c1', ' x'.repeat(200));

    const [payload] = builder.calls.update[0] as [{ title: string }];
    expect(payload.title.length).toBe(120);
    expect(builder.calls.eq).toEqual([['id', 'c1']]);
  });

  it('toggles pin on the given conversation', async () => {
    const builder = makeBuilder();
    const sb = clientFor({ chat_conversations: builder });
    await togglePin(sb as never, 'c1', true);
    expect(builder.calls.update).toEqual([[{ pinned: true }]]);
  });

  it('lists messages capped at 200, returned in chronological order', async () => {
    // Query returns newest-first; wrapper must reverse to chronological.
    const builder = makeBuilder({ data: [{ id: 'newest' }, { id: 'oldest' }], error: null });
    const sb = clientFor({ chat_messages: builder });

    const result = await listMessages(sb as never, 'conv-1');

    expect(result.map((m) => m.id)).toEqual(['oldest', 'newest']);
    expect(builder.calls.order).toEqual([['created_at', { ascending: false }]]);
    expect(builder.calls.limit).toEqual([[200]]);
  });

  it('updates action state, including the action payload only when given', async () => {
    const builder = makeBuilder();
    const sb = clientFor({ chat_messages: builder });

    await updateMessageAction(sb as never, 'm1', 'cancelled');
    await updateMessageAction(sb as never, 'm2', 'sent', { kind: 'help_request', sentHelpRequestId: 'h1' });

    expect(builder.calls.update[0]).toEqual([{ action_state: 'cancelled' }]);
    expect(builder.calls.update[1]).toEqual([
      { action_state: 'sent', action: { kind: 'help_request', sentHelpRequestId: 'h1' } },
    ]);
  });

  it('resolves action history in two steps (conversation ids, then .in filter)', async () => {
    const conversations = makeBuilder({ data: [{ id: 'c1' }, { id: 'c2' }], error: null });
    const messages = makeBuilder({ data: [{ id: 'm1' }], error: null });
    const sb = clientFor({ chat_conversations: conversations, chat_messages: messages });

    const result = await listActionHistory(sb as never, 'u1', 'student');

    expect(result).toEqual([{ id: 'm1' }]);
    expect(messages.calls.in).toEqual([['conversation_id', ['c1', 'c2']]]);
    expect(messages.calls.eq).toEqual([['action_state', 'sent']]);
  });

  it('short-circuits action history when the user has no conversations', async () => {
    const conversations = makeBuilder({ data: [], error: null });
    const messages = makeBuilder();
    const sb = clientFor({ chat_conversations: conversations, chat_messages: messages });

    const result = await listActionHistory(sb as never, 'u1', 'parent');

    expect(result).toEqual([]);
    expect(sb.from).not.toHaveBeenCalledWith('chat_messages');
  });
});
