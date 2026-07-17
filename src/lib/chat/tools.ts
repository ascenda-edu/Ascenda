// Gemini function declarations + executors for the chatbot.
//
// search_programs is the one DATA tool: the route executes it server-side and
// feeds results back to the model. The propose_* ACTION tools are never
// executed server-side — see actions.ts.

import { Type, type FunctionDeclaration, type Tool } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { ChatMode } from './prompts';
import { HELP_REQUEST_TOOL, COUNSELLOR_MESSAGE_TOOL } from './actions';

type Client = SupabaseClient<Database>;

// ─── Declarations ───────────────────────────────────────────────────────────

export const searchProgramsDeclaration: FunctionDeclaration = {
  name: 'search_programs',
  description:
    'Search the Ascenda catalogue of real university programmes. Use when the user asks about specific courses, universities, or countries, or wants recommendations grounded in real programmes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Course/subject keywords only, e.g. "computer science". Put university names in the university parameter, not here.',
      },
      university: {
        type: Type.STRING,
        description: 'Optional university name, e.g. "Oxford" or "Imperial College".',
      },
      country: { type: Type.STRING, description: 'Optional country filter, e.g. "United Kingdom".' },
      level: { type: Type.STRING, description: 'Optional study level, e.g. "Undergraduate" or "Postgraduate".' },
      limit: { type: Type.INTEGER, description: 'Max results, 1-8 (default 5).' },
    },
    required: ['query'],
  },
};

const helpRequestDeclaration: FunctionDeclaration = {
  name: HELP_REQUEST_TOOL,
  description:
    "Draft a help request to the student's counsellor. Call ONLY when the user explicitly wants to contact or ask their counsellor. This drafts — the user reviews and confirms before anything is sent.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, description: 'Short, specific subject line.' },
      body: { type: Type.STRING, description: 'The request itself, written for the counsellor.' },
      application_id: {
        type: Type.STRING,
        description: 'Optional: the related application id if the live account data names one.',
      },
    },
    required: ['subject', 'body'],
  },
};

const counsellorMessageDeclaration: FunctionDeclaration = {
  name: COUNSELLOR_MESSAGE_TOOL,
  description:
    "Draft a message to the counsellor about the parent's child. Call ONLY when the parent explicitly wants to message or contact the counsellor. This drafts — the parent reviews and confirms before anything is sent.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      body: { type: Type.STRING, description: 'The message, courteous and specific.' },
    },
    required: ['body'],
  },
};

/** Tools available per mode. Parent only gets the message tool when a
 * counsellor contact thread actually exists (otherwise there is no recipient). */
export function buildToolsForMode(mode: ChatMode, hasParentContact: boolean): Tool[] | undefined {
  const declarations: FunctionDeclaration[] =
    mode === 'student'
      ? [searchProgramsDeclaration, helpRequestDeclaration]
      : mode === 'counsellor'
        ? [searchProgramsDeclaration]
        : hasParentContact
          ? [counsellorMessageDeclaration]
          : [];
  return declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined;
}

// ─── search_programs executor ───────────────────────────────────────────────

export interface ProgramHit {
  id: string;
  course: string;
  university: string;
  country: string;
  city: string | null;
  level: string | null;
}

export interface SearchProgramsResult {
  results: ProgramHit[];
  note?: string;
}

const STOP_WORDS = new Set([
  'university', 'college', 'institute', 'school', 'of', 'the', 'and', 'at', 'in', 'for', 'a', 'an',
]);

const clampLimit = (value: unknown): number => {
  const n = typeof value === 'number' ? Math.round(value) : 5;
  return Math.min(8, Math.max(1, Number.isFinite(n) ? n : 5));
};

const meaningfulWords = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

type UniRow = { id: string; recognition_score: number | null };

/** Resolve a university-name phrase to ids, preferring well-known unis
 * (recognition_score ≥ 5, same threshold as search suggestions), falling back
 * to any name match. Words are chained as AND ilike filters — never .or()
 * strings, which crash PostgREST when values contain spaces. Exported for the
 * get_university_info read tool. */
export async function resolveUniversityIds(supabase: Client, university: string): Promise<string[]> {
  const words = meaningfulWords(university);
  if (words.length === 0) return [];

  const lookup = async (minRecognition: number | null): Promise<UniRow[]> => {
    let q = (supabase as any).from('universities').select('id,recognition_score').limit(100);
    if (minRecognition !== null) q = q.gte('recognition_score', minRecognition);
    words.forEach((w) => {
      q = q.ilike('name', `%${w}%`);
    });
    const { data } = await q;
    return (data ?? []) as UniRow[];
  };

  let rows = await lookup(5);
  if (rows.length === 0) rows = await lookup(null);
  return rows
    .sort((a, b) => (b.recognition_score ?? 0) - (a.recognition_score ?? 0))
    .map((u) => u.id)
    .slice(0, 20);
}

export async function executeSearchPrograms(
  supabase: Client,
  args: { query?: unknown; university?: unknown; country?: unknown; level?: unknown; limit?: unknown }
): Promise<SearchProgramsResult> {
  try {
    const limit = clampLimit(args.limit);
    const queryWords = meaningfulWords(typeof args.query === 'string' ? args.query : '');
    const university = typeof args.university === 'string' ? args.university.trim() : '';

    let q = supabase
      .from('programs')
      .select('id,course_name,study_level,universities!inner(name,country,city)')
      .limit(limit);

    if (university) {
      const uniIds = await resolveUniversityIds(supabase, university);
      if (uniIds.length === 0) {
        return { results: [], note: `No university matching "${university}" found in the catalogue.` };
      }
      q = q.in('university_id', uniIds);
    }
    if (typeof args.country === 'string' && args.country.trim()) {
      q = q.ilike('universities.country', `%${args.country.trim()}%`);
    }
    if (typeof args.level === 'string' && args.level.trim()) {
      q = q.ilike('study_level', `%${args.level.trim()}%`);
    }
    // AND-chain up to 3 course terms; "computer science" matches courses whose
    // name carries both words. Never build .or() strings (CLAUDE.md gotcha).
    queryWords.slice(0, 3).forEach((w) => {
      q = q.ilike('course_name', `%${w}%`);
    });

    const { data, error } = await q;
    if (error) {
      console.warn('[chat] search_programs failed:', error.message);
      return { results: [], note: 'Catalogue search failed — do not invent programmes.' };
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      course_name: string | null;
      study_level: string | null;
      universities: { name: string | null; country: string | null; city: string | null } | null;
    }>;

    return {
      results: rows.map((row) => ({
        id: row.id,
        course: row.course_name ?? 'Programme',
        university: row.universities?.name ?? 'University',
        country: row.universities?.country ?? '—',
        city: row.universities?.city ?? null,
        level: row.study_level ?? null,
      })),
      ...(rows.length === 0 ? { note: 'No programmes matched — say so; do not invent any.' } : {}),
    };
  } catch (err) {
    console.warn('[chat] search_programs threw:', err);
    return { results: [], note: 'Catalogue search failed — do not invent programmes.' };
  }
}
