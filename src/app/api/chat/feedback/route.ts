// Thumbs up/down on chatbot answers → chat_feedback table.
//
// Fails soft by design: until the 20260717120000 migration is applied to the
// remote DB, the upsert errors — we log and return { ok: false } with HTTP 200
// so the widget never shows an error for a decorative feature.

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { upsertChatFeedback } from '@/lib/chat/feedback';

export const runtime = 'nodejs';

const VALID_MODES = new Set(['student', 'counsellor', 'parent']);
const EXCERPT_LENGTH = 280;

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!checkRateLimit(`chat-feedback:${user.id}`, { limit: 60, windowMs: 60_000 })) {
      return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { mode, messageContent, rating, comment } = body as {
      mode?: string;
      messageContent?: string;
      rating?: number;
      comment?: string;
    };

    if (
      typeof messageContent !== 'string' ||
      messageContent.length === 0 ||
      messageContent.length > 16_000 ||
      (rating !== 1 && rating !== -1) ||
      !VALID_MODES.has(mode ?? '')
    ) {
      return NextResponse.json({ ok: false, error: 'Invalid feedback payload' }, { status: 400 });
    }

    try {
      await upsertChatFeedback(supabase, {
        profile_id: user.id, // server-set — a forged body can't attribute to another user
        mode: mode as 'student' | 'counsellor' | 'parent',
        message_hash: createHash('sha256').update(messageContent).digest('hex'),
        message_excerpt: messageContent.slice(0, EXCERPT_LENGTH),
        rating,
        ...(typeof comment === 'string' && comment.trim()
          ? { comment: comment.trim().slice(0, 1_000) }
          : {}),
      });
    } catch (err) {
      console.warn('[chat] feedback upsert failed (migration applied?):', err);
      return NextResponse.json({ ok: false });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[chat] feedback', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
