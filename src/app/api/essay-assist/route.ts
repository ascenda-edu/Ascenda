import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

export const runtime = 'nodejs';

type Action = 'feedback' | 'expand' | 'outline';

// ─── Platform-specific knowledge ────────────────────────────────────────────

const PLATFORM_LIMITS: Record<string, string> = {
  'UCAS': '4000 characters. 80% academic, 20% skills. Intellectual tone. No uni names.',
  'Common App': '650 words. Personal story with reflection. Authentic voice.',
  'UC PIQs': '350 words. Direct, specific, one theme per response.',
  'Custom': 'Motivation letter style. Connect background to programme.',
};

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a concise university admissions essay coach. You help students improve their own writing — you do NOT write essays for them.

RULES YOU MUST FOLLOW:
- Be SHORT. Most responses should be 100-200 words. Never exceed 250 words.
- Be SPECIFIC. Reference the student's actual words, blocks, and details by name.
- Be a COACH not a WRITER. Tell them what to do, don't do it for them. Give 1-sentence examples at most.
- NEVER write full paragraphs of essay content unless specifically asked to "expand a block."
- NEVER use filler phrases like "Great foundation!", "Let's craft...", "This is solid!"
- Start your response with the content immediately. No preamble.
- Use short bullet points, not long explanations.`;

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildUserPrompt(action: Action, data: {
  essay?: string;
  platform?: string;
  block?: { label: string; detail?: string };
  blocks?: { label: string; detail?: string }[];
  studentContext?: string;
}): string {
  const limit = PLATFORM_LIMITS[data.platform ?? 'Custom'] ?? PLATFORM_LIMITS['Custom'];

  switch (action) {
    case 'feedback': {
      return `Review this ${data.platform} essay. Platform: ${limit}

Student: ${data.studentContext ?? 'IB student, Engineering applicant.'}

ESSAY:
${data.essay}

Give feedback in this EXACT format (be brief — under 200 words total):

**Verdict:** One sentence — is this working or not?

**Keep:** 1-2 specific phrases that work (quote them)

**Fix:**
- "quote weak sentence" → why it's bad → suggest a 1-sentence replacement
- "quote another" → why → replacement
- (max 3 fixes, most important first)

**Missing for ${data.platform}:** 1-2 sentences on what this platform specifically needs that's absent.

Start with **Verdict:** now.`;
    }

    case 'expand': {
      return `Write ONE paragraph (3-4 sentences) for a ${data.platform} essay using this block:

Block: "${data.block?.label}"
Detail: "${data.block?.detail ?? 'none'}"

Student: ${data.studentContext ?? 'IB student, Engineering applicant.'}
${data.essay && data.essay.trim().length > 20 ? `\nExisting essay voice to match:\n${data.essay.slice(0, 300)}` : ''}

Rules: Start with a specific moment or action. Use details from the block. Sound like a 17-year-old, not a brochure. ${data.platform === 'UCAS' ? 'Academic tone.' : data.platform === 'Common App' ? 'Personal tone.' : 'Direct tone.'}

Output the paragraph only. No labels.`;
    }

    case 'outline': {
      const blockList = (data.blocks ?? []).map((b) => `"${b.label}"`).join(', ');
      return `Create a SHORT essay outline for a ${data.platform} statement. Platform: ${limit}

The student's building blocks: ${blockList}

${(data.blocks ?? []).map((b) => `- ${b.label}: ${b.detail ?? 'no detail'}`).join('\n')}

Student: ${data.studentContext ?? 'IB student, Engineering applicant.'}
${data.essay && data.essay.trim().length > 20 ? `\nThey've started writing:\n${data.essay.slice(0, 200)}...` : ''}

Give a SHORT outline (under 150 words) in this format:

**Hook:** What specific moment/image to open with (1 sentence of guidance, don't write it for them)
**Section 1 — [name]:** Use [block name(s)]. Focus on [what angle]. (~X words)
**Section 2 — [name]:** Use [block name(s)]. Focus on [what angle]. (~X words)
**Section 3 — [name]:** Use [block name(s)]. Focus on [what angle]. (~X words)
**Close:** [1 sentence of guidance on how to end]

IMPORTANT: Reference the actual block names listed above. Do NOT invent generic sections. Every section must map to specific blocks the student selected.

Start with **Hook:** now.`;
    }

    default:
      return data.essay ?? '';
  }
}

// ─── Route handler ──────────────────────────────────────────────────────────

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    // Bound per-user LLM spend — nothing else stops a scripted request loop.
    if (!checkRateLimit(`essay-assist:${user.id}`, { limit: 10, windowMs: 60_000 })) {
      return new Response(JSON.stringify({ error: 'Too many requests — try again in a minute' }), {
        status: 429
      });
    }

    const body = await req.json();
    const { action, essay, platform, block, blocks, studentContext } = body as {
      action: Action;
      essay?: string;
      platform?: string;
      block?: { label: string; detail?: string };
      blocks?: { label: string; detail?: string }[];
      studentContext?: string;
    };

    if (!action || !['feedback', 'expand', 'outline'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured. Add GEMINI_API_KEY to .env.local.' }), { status: 503 });
    }

    if (action === 'feedback' && (!essay || essay.trim().length < 20)) {
      return new Response(JSON.stringify({ error: 'Write at least a few sentences before requesting feedback.' }), { status: 400 });
    }

    if ((essay && essay.length > 30_000) || (studentContext && studentContext.length > 5_000)) {
      return new Response(JSON.stringify({ error: 'Input too long.' }), { status: 400 });
    }

    if (action === 'expand' && !block) {
      return new Response(JSON.stringify({ error: 'No building block selected. Pick one to expand.' }), { status: 400 });
    }

    if (action === 'outline' && (!blocks || blocks.length === 0)) {
      return new Response(JSON.stringify({ error: 'Select at least one building block from the left panel first.' }), { status: 400 });
    }

    const userPrompt = buildUserPrompt(action, { essay, platform, block, blocks, studentContext });

    // Prefill forces model to skip preamble
    const prefill = action === 'feedback' ? '**Verdict:**'
      : action === 'outline' ? '**Hook:**'
      : '';

    const contents = [
      { role: 'user' as const, parts: [{ text: userPrompt }] },
      ...(prefill ? [{ role: 'model' as const, parts: [{ text: prefill }] }] : []),
    ];

    // Try each Gemini model until one responds
    for (const model of MODELS) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: action === 'expand' ? 0.8 : 0.5,
            maxOutputTokens: action === 'expand' ? 512 : 600,
          },
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              if (prefill) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: prefill + ' ' })}\n\n`));
              }
              for await (const chunk of stream) {
                const text = chunk.text;
                if (text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (err) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted. Try again.' })}\n\n`));
              controller.close();
            }
          },
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[essay-assist] ${model} failed: ${msg.slice(0, 100)}`);
        continue;
      }
    }

    return new Response(JSON.stringify({
      error: 'AI models are rate-limited right now. Please wait 60 seconds and try again.',
    }), { status: 503 });
  } catch (err: unknown) {
    console.error('[essay-assist]', err);
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500 }
    );
  }
}
