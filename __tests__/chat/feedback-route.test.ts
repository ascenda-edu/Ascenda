/**
 * @jest-environment ./jest.environment-node.js
 */

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(() => true),
}));

jest.mock('@/lib/chat/feedback', () => ({
  upsertChatFeedback: jest.fn(),
}));

import { POST } from '@/app/api/chat/feedback/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { upsertChatFeedback } from '@/lib/chat/feedback';

const feedbackRequest = (body: unknown) =>
  new Request('http://localhost/api/chat/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

describe('POST /api/chat/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }) },
    });
    (checkRateLimit as jest.Mock).mockReturnValue(true);
    (upsertChatFeedback as jest.Mock).mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests', async () => {
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await POST(feedbackRequest({ mode: 'student', messageContent: 'x', rating: 1 }));
    expect(res.status).toBe(401);
    expect(upsertChatFeedback).not.toHaveBeenCalled();
  });

  it('rejects invalid ratings and modes', async () => {
    for (const bad of [
      { mode: 'student', messageContent: 'x', rating: 0 },
      { mode: 'student', messageContent: 'x', rating: 5 },
      { mode: 'admin', messageContent: 'x', rating: 1 },
      { mode: 'student', messageContent: '', rating: 1 },
    ]) {
      const res = await POST(feedbackRequest(bad));
      expect(res.status).toBe(400);
    }
    expect(upsertChatFeedback).not.toHaveBeenCalled();
  });

  it('upserts with a server-set profile id and content hash', async () => {
    const res = await POST(
      feedbackRequest({
        mode: 'counsellor',
        messageContent: 'A helpful answer about deadlines.',
        rating: -1,
        // a forged profile_id in the body must be ignored
        profile_id: 'attacker-999',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertChatFeedback).toHaveBeenCalledTimes(1);
    const row = (upsertChatFeedback as jest.Mock).mock.calls[0][1];
    expect(row.profile_id).toBe('user-123');
    expect(row.mode).toBe('counsellor');
    expect(row.rating).toBe(-1);
    expect(row.message_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.message_excerpt).toBe('A helpful answer about deadlines.');
  });

  it('fails soft (ok:false, HTTP 200) when the table is missing', async () => {
    (upsertChatFeedback as jest.Mock).mockRejectedValue(new Error('relation does not exist'));
    const res = await POST(
      feedbackRequest({ mode: 'student', messageContent: 'answer', rating: 1 })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });
});
