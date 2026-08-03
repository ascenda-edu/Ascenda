/**
 * `useHelpThread` — the student↔counsellor message thread, previously at **0%
 * coverage**.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Audit finding G1. `reply()` opens with
 *
 *     if (!requestId || !currentProfileId || !request) return;
 *
 * — a silent `return`, not a throw. Its only caller, `handleReply` in
 * `help-thread-drawer-impl.tsx:143`, is written as
 *
 *     await reply(replyText, side);
 *     setReplyText('');
 *     showToast({ title: 'Reply sent …', variant: 'success' });
 *
 * so a `reply()` that declines to send is indistinguishable from one that
 * succeeded: **the composer is cleared and the student is told the message was
 * sent.** The text is gone and nothing was written.
 *
 * `currentProfileId` is populated by an unawaited `auth.getUser()` whose promise
 * had no `.catch()`. That call reaches the network, so it rejects on a flaky
 * connection or an auth-server blip — leaving `currentProfileId` null for the
 * lifetime of the mount, and every reply typed into that drawer silently
 * destroyed.
 *
 * The refactor added exactly this `.catch()` to `use-is-demo-user.ts`, with a
 * comment naming the hazard, and missed this hook and `use-notifications.ts`.
 *
 * WHAT IS PINNED HERE
 * -------------------
 *   1. a reply that cannot be sent must REJECT, so the caller's `catch` runs and
 *      the text survives in the composer;
 *   2. a rejected `getUser()` must not leave the hook wedged in that state;
 *   3. the happy path must still insert, and must insert against the right
 *      thread — the filter, not just the call.
 */

import { renderHook, act, waitFor } from '@testing-library/react';

import { useHelpThread } from '@/hooks/use-help-thread';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client');

const REQUEST_ID = 'req-1';
const USER_ID = 'profile-under-test';

/** Rows returned per table. */
let rows: Record<string, unknown[]> = {};
/** Recorded inserts: [table, payload]. */
let inserts: Array<[string, unknown]> = [];
/**
 * Every read filter, as `[table, method, column, value]`.
 *
 * The double this replaces stubbed `eq: () => builder`, so the four loaders
 * this hook drives could all drop `.eq('request_id', requestId)` and still
 * resolve the seeded rows — the drawer would then render whichever messages the
 * query happened to return, from any thread, and every assertion here would
 * pass. See `__tests__/meta/recording-doubles.test.ts`.
 */
let readFilters: Array<[string, string, string, unknown]> = [];
/** What `auth.getUser()` does. */
let getUserImpl: () => Promise<{ data: { user: { id: string } | null } }>;

const makeClient = () => ({
  auth: { getUser: () => getUserImpl() },
  from(table: string) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        readFilters.push([table, 'eq', column, value]);
        return builder;
      },
      in: (column: string, value: unknown) => {
        readFilters.push([table, 'in', column, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      insert: (payload: unknown) => {
        inserts.push([table, payload]);
        return {
          select: () => ({
            single: async () => ({ data: { id: 'row-1', ...(payload as object) }, error: null })
          })
        };
      },
      update: () => builder,
      delete: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject)
    };
    return builder;
  },
  // `useRealtimePoll` chains `.on()` once per table and then `.subscribe()`, so
  // `.on()` has to return the builder, not a one-shot object.
  channel: () => {
    const channel: Record<string, unknown> = {
      on: () => channel,
      subscribe: (cb?: (status: string) => void) => {
        cb?.('SUBSCRIBED');
        return channel;
      },
      unsubscribe: () => {}
    };
    return channel;
  },
  removeChannel: () => {}
});

beforeEach(() => {
  jest.clearAllMocks();
  rows = {
    help_requests: [
      {
        id: REQUEST_ID,
        student_profile_id: USER_ID,
        counsellor_profile_id: 'counsellor-1',
        subject: 'Need help',
        status: 'open'
      }
    ],
    help_messages: [],
    help_notes: [],
    help_meetings: []
  };
  inserts = [];
  readFilters = [];
  getUserImpl = async () => ({ data: { user: { id: USER_ID } } });
  (getBrowserSupabaseClient as jest.Mock).mockReturnValue(makeClient());
});

describe('reply() when the author is unknown', () => {
  it('rejects rather than resolving, so the caller does not report success', async () => {
    // The exact production trigger: getUser() reaches the network and fails.
    getUserImpl = () => Promise.reject(new Error('network down'));

    const { result } = renderHook(() => useHelpThread(REQUEST_ID, 'student'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // handleReply does `await reply(...)` inside a try/catch and treats a
    // resolved promise as "sent". If this resolves, the student's text is
    // cleared and they are toasted "Reply sent" with nothing written.
    //
    // Capture the outcome explicitly rather than asserting on `act()`'s own
    // promise: `act()` can reject for reasons that have nothing to do with
    // `reply()` (a React warning escalated during the flush), which made an
    // earlier version of this test pass even with the defect reinstated. The
    // outcome variable can only be set by `reply()` itself.
    let outcome: 'resolved' | 'rejected' = 'resolved';
    await act(async () => {
      try {
        await result.current.reply('please help me', 'student');
      } catch {
        outcome = 'rejected';
      }
    });

    expect(outcome).toBe('rejected');
    expect(inserts.filter(([table]) => table === 'help_messages')).toHaveLength(0);
  });

  it('does not silently swallow a rejected getUser()', async () => {
    const rejection = jest.fn();
    getUserImpl = () => Promise.reject(new Error('auth server 503'));

    const { result } = renderHook(() => useHelpThread(REQUEST_ID, 'student'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reply('hello', 'student').catch(rejection);
    });

    // An unhandled rejection here is what left `currentProfileId` null forever.
    expect(rejection).toHaveBeenCalled();
  });
});

describe('reply() on the happy path', () => {
  it('still inserts, and against the thread it was asked to reply to', async () => {
    const { result } = renderHook(() => useHelpThread(REQUEST_ID, 'student'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reply('thanks!', 'student');
    });

    const messageInserts = inserts.filter(([table]) => table === 'help_messages');
    expect(messageInserts).toHaveLength(1);
    // Assert the CONTENT of the write, not merely that a write happened: the
    // request_id is what binds the message to the right thread.
    expect(messageInserts[0][1]).toMatchObject({
      request_id: REQUEST_ID,
      author_profile_id: USER_ID,
      body: 'thanks!'
    });
  });
});

describe('the thread loads only the thread it was asked for', () => {
  it('scopes all four reads to the request id', async () => {
    const { result } = renderHook(() => useHelpThread(REQUEST_ID, 'student'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Asserted per table rather than as one ordered list: `refresh()` fires the
    // four in parallel and `markThreadRead` adds a fifth filter on its own
    // schedule, so ordering is not a property of the hook. What IS a property
    // is that each table was read, and read scoped.
    const forTable = (table: string) => readFilters.filter(([t]) => t === table);

    expect(forTable('help_requests')).toContainEqual(['help_requests', 'eq', 'id', REQUEST_ID]);
    for (const table of ['help_messages', 'help_notes', 'help_meetings']) {
      // toContainEqual, not toEqual([...]): a `[]` here would silently mean
      // "that read was deleted", which is the failure this file guards.
      expect(forTable(table)).toContainEqual([table, 'eq', 'request_id', REQUEST_ID]);
    }
  });

  it('reads nothing at all when there is no thread selected', async () => {
    const { result } = renderHook(() => useHelpThread(null, 'student'));
    await waitFor(() => expect(result.current.request).toBeNull());
    expect(readFilters).toEqual([]);
  });
});
