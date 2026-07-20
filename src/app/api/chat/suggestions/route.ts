// Personalised starter suggestions for the chatbot's empty state. Reuses the
// same cached context the chat endpoint builds, so opening the widget also
// pre-warms the context cache before the first message.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { ACTIVE_CHILD_COOKIE } from '@/lib/parent/active-child';
import { buildContextForMode, buildStarterSuggestions } from '@/lib/chat/context';
import { contextCacheKey, getCachedContext, setCachedContext } from '@/lib/chat/cache';
import { resolveChatMode } from '@/lib/chat/mode';

export const runtime = 'nodejs';
// The catch-all below would swallow Next's DynamicServerError during build
// prerendering (auth reads cookies), baking a static empty response — force
// the route dynamic explicitly.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ suggestions: [] }, { status: 401 });
    }
    if (!checkRateLimit(`chat-suggestions:${user.id}`, { limit: 30, windowMs: 60_000 })) {
      return NextResponse.json({ suggestions: [] }, { status: 429 });
    }

    const rawMode = new URL(req.url).searchParams.get('mode');
    const resolved = await resolveChatMode(supabase, user, rawMode);
    if (!resolved.ok) {
      return NextResponse.json({ suggestions: [] }, { status: 403 });
    }
    const mode = resolved.mode;

    const activeChildId =
      mode === 'parent' ? cookies().get(ACTIVE_CHILD_COOKIE)?.value : undefined;
    const cacheKey = contextCacheKey(mode, user.id, activeChildId);
    let chatContext = getCachedContext(cacheKey);
    if (!chatContext) {
      chatContext = await buildContextForMode(supabase, mode, user.id, activeChildId);
      setCachedContext(cacheKey, chatContext);
    }

    return NextResponse.json(
      { suggestions: buildStarterSuggestions(mode, chatContext.signals) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.warn('[chat] suggestions failed:', err);
    // Suggestions are decorative — never surface an error to the widget.
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
