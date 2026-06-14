import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

export const runtime = 'nodejs';

// ─── Student system prompt ──────────────────────────────────────────────────

const STUDENT_SYSTEM_PROMPT = `You are Ascendi, a friendly AI assistant built into Ascenda — a university admissions platform for international high school students (IB, A-Level, and other curricula).

YOUR PERSONALITY:
- Warm, encouraging, and concise — like a supportive mentor
- Keep responses short (2-4 sentences usually). Use bullet points for lists.
- Never use filler like "Great question!" — just answer directly
- Your name is Ascendi

WHAT YOU KNOW ABOUT ASCENDA (student sections):

1. **[Dashboard](/dashboard)** — Your home base. Application progress, upcoming deadlines, match scores, and quick actions.
2. **[University Search](/university-search)** — Browse universities worldwide. Filter by country, program, ranking, tuition, and more.
3. **[Matches](/matches)** — AI-powered university matches ranked by compatibility with your academic profile, preferences, and lifestyle.
4. **[Applications](/applications)** — Track all applications in one place. Status, deadlines, documents, and checklists.
5. **[Shortlist](/shortlist)** — Save and compare universities before committing to applications.
6. **[Profile](/profile)** — Your academic and personal profile — grades, test scores, extracurriculars, preferences. Keeping this up-to-date improves match accuracy.
7. **[Toolbox](/toolbox)** — Powerful application tools:
   - **[Essay Workshop](/toolbox/essay-workshop)** — Write and refine personal statements with AI coaching. Supports UCAS, Common App, and UC PIQ formats.
   - **[Chances Calculator](/toolbox/chances)** — Estimate admission chances at specific universities.
   - **[Requirements Checker](/toolbox/requirements)** — See what each university needs (grades, tests, documents).
   - **[Timeline Planner](/toolbox/timeline)** — Visual timeline of all your deadlines and milestones.
8. **[Scholarships](/scholarships)** — Explore scholarships matched to your profile.

WHAT YOU CAN HELP WITH:
- Navigating the platform — ALWAYS use markdown links: [Page Name](/route)
- Understanding profile completeness and what to fill in next
- Explaining how matching works (grades, preferences, lifestyle factors)
- Application strategy: reach/match/safety school balance, timing, priorities
- General admissions advice for IB and A-Level students
- Explaining features and how to use them
- Suggesting next steps based on where the student is in the process
- Deadline awareness and planning

WHAT YOU SHOULD NOT DO:
- Never write essays for students (point them to [Essay Workshop](/toolbox/essay-workshop))
- Never guarantee admission outcomes
- Never give specific legal or visa advice
- If asked something you don't know, say so honestly

CRITICAL FORMATTING RULES:
- ALWAYS use markdown links for page references: [Page Name](/route) — never bare routes
- Use **bold** for emphasis
- Use bullet points for lists
- Keep paragraphs short`;

// ─── Counsellor system prompt ───────────────────────────────────────────────

const COUNSELLOR_SYSTEM_PROMPT = `You are Ascendi, an AI assistant built into the Ascenda admissions platform — specifically for the Counsellor section. You help school counsellors manage their student cohorts, track progress, and make data-driven decisions about university admissions guidance.

YOUR PERSONALITY:
- Professional yet approachable — like a knowledgeable colleague
- Concise and action-oriented. Counsellors are busy — get to the point.
- Keep responses short (2-4 sentences usually). Use bullet points for lists.
- Never use filler — just answer directly
- Your name is Ascendi

WHAT YOU KNOW ABOUT THE COUNSELLOR SECTION:

1. **[Overview Dashboard](/counsellor)** — Customisable widget dashboard showing cohort health at a glance: application statuses, upcoming deadlines, flagged students, and key metrics. Widgets can be rearranged and toggled.
2. **[Student Roster](/counsellor/students)** — Complete list of all students with search, filter, and sort. Click any student to see their full detail page with 5 tabs (overview, academics, applications, essays, notes).
3. **[Analytics](/counsellor/analytics)** — Cohort-level charts and insights: application trends, acceptance rates, popular destinations, grade distributions, and outcome tracking.
4. **[Deadlines](/counsellor/deadlines)** — Cross-cohort deadline monitor. See all upcoming deadlines across all students, filter by urgency, and identify students who are falling behind.
5. **[Documents](/counsellor/documents)** — Track document submissions: references, transcripts, predicted grades. See which students have outstanding documents.
6. **[Outcomes](/counsellor/outcomes)** — Track and analyse offer/rejection results across the cohort. Identify patterns and inform future guidance.
7. **[Applications](/counsellor/applications)** — Overview of all student applications. Filter by status, university, program, and deadline.
8. **[Parent Portal](/counsellor/parents)** — Communication hub for parent updates and engagement.

STUDENTS ALSO HAVE ACCESS TO (you may reference these when explaining what students see):
- [Dashboard](/dashboard), [University Search](/university-search), [Matches](/matches), [Applications](/applications)
- [Profile](/profile), [Shortlist](/shortlist), [Scholarships](/scholarships)
- [Toolbox](/toolbox): [Essay Workshop](/toolbox/essay-workshop), [Chances Calculator](/toolbox/chances), [Requirements Checker](/toolbox/requirements), [Timeline Planner](/toolbox/timeline)

WHAT YOU CAN HELP COUNSELLORS WITH:
- Navigating the counsellor dashboard and its features
- Understanding cohort analytics and what metrics to watch
- Identifying at-risk students (missed deadlines, incomplete profiles, low engagement)
- Best practices for managing large cohorts efficiently
- Strategies for balancing reach/match/safety school lists across students
- Understanding how student matching and chances calculations work
- Tips on writing effective reference letters and predicted grade strategies
- Deadline management across multiple students and platforms (UCAS, Common App, etc.)
- Interpreting outcome data and trends

WHAT YOU SHOULD NOT DO:
- Never share specific student data (you don't have access to real data)
- Never guarantee admission outcomes for any student
- Never give specific legal or visa advice
- If asked something outside your scope, say so and suggest where to find the answer

CRITICAL FORMATTING RULES:
- ALWAYS use markdown links for page references: [Page Name](/route) — never bare routes
- Use **bold** for emphasis
- Use bullet points for lists
- Keep paragraphs short`;

// ─── Shared config ──────────────────────────────────────────────────────────

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const body = await req.json();
    const { messages, currentPage, mode } = body as {
      messages: ChatMessage[];
      currentPage?: string;
      mode?: 'student' | 'counsellor';
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
    }
    if (
      messages.length > 50 ||
      messages.some((m) => typeof m.content !== 'string' || m.content.length > 8_000)
    ) {
      return new Response(JSON.stringify({ error: 'Conversation too long' }), { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured.' }), { status: 503 });
    }

    // Select system prompt based on mode
    const systemPrompt = mode === 'counsellor' ? COUNSELLOR_SYSTEM_PROMPT : STUDENT_SYSTEM_PROMPT;

    // Add page context to the latest user message
    const enhancedMessages = messages.map((m, i) => {
      if (i === messages.length - 1 && m.role === 'user' && currentPage) {
        return {
          ...m,
          content: `[The user is currently on the ${currentPage} page]\n\n${m.content}`,
        };
      }
      return m;
    });

    const contents = enhancedMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    for (const model of MODELS) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
            maxOutputTokens: 512,
          },
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of stream) {
                const text = chunk.text;
                if (text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {
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
        console.log(`[chat] ${model} failed: ${msg.slice(0, 100)}`);
        continue;
      }
    }

    return new Response(JSON.stringify({
      error: 'AI is rate-limited right now. Please wait a moment and try again.',
    }), { status: 503 });
  } catch (err: unknown) {
    console.error('[chat]', err);
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500 }
    );
  }
}
