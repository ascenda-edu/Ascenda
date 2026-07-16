// Student-mode READ tools. Executed inline by the tool loop (no confirmation)
// under the user-scoped client — RLS scopes every row to the caller. Each
// execute() MUST NOT throw: a failed lookup returns an { error }/{ note }
// payload the model can see, never a broken stream.

import { Type, type FunctionDeclaration } from '@google/genai';
import { resolvePrograms } from '@/lib/counsellor/data';
import type { ReadTool, ToolContext } from './types';

const MAX_APPS = 20;

// ─── get_my_applications ─────────────────────────────────────────────────────

const getMyApplicationsDeclaration: FunctionDeclaration = {
  name: 'get_my_applications',
  description:
    "Fetch the signed-in student's tracked applications with live status, deadlines, and checklist tasks (each task includes an id you can act on). Use when the user asks about their applications, progress, tasks, or what's due. Data is live — never invent applications.",
  parameters: { type: Type.OBJECT, properties: {} },
};

type AppRow = {
  id: string;
  status: string | null;
  program_id: string;
  program?: {
    name?: string | null;
    universities?: { name?: string | null; country?: string | null } | null;
    deadlines?: Array<{ name: string; deadline_date?: string | null }> | null;
  } | null;
  application_checklist?: Array<{
    id: string;
    task_name: string;
    status: 'todo' | 'doing' | 'done';
    due_date?: string | null;
  }> | null;
};

const getMyApplications: ReadTool = {
  kind: 'read',
  name: 'get_my_applications',
  modes: ['student'],
  declaration: getMyApplicationsDeclaration,
  statusLabel: 'Checking your applications…',
  async execute(ctx: ToolContext): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await ctx.supabase
        .from('applications')
        .select(
          `
          id,
          status,
          program_id,
          program:programs(
            name:course_name,
            universities(name,country),
            deadlines(name, deadline_date)
          ),
          application_checklist(id, task_name, status, due_date)
        `
        )
        .eq('profile_id', ctx.userId)
        .limit(MAX_APPS);

      if (error) {
        return { error: 'Could not load your applications right now.' };
      }

      const rows = ((data ?? []) as unknown as AppRow[]) ?? [];
      return {
        applications: rows.map((app) => ({
          id: app.id,
          status: app.status ?? 'planning',
          course: app.program?.name ?? 'Programme',
          university: app.program?.universities?.name ?? 'University',
          country: app.program?.universities?.country ?? null,
          deadlines: (app.program?.deadlines ?? [])
            .filter((d): d is { name: string; deadline_date: string } => Boolean(d.deadline_date))
            .map((d) => ({ name: d.name, date: d.deadline_date })),
          tasks: (app.application_checklist ?? []).map((t) => ({
            id: t.id,
            task_name: t.task_name,
            status: t.status,
            due_date: t.due_date ?? null,
          })),
        })),
      };
    } catch {
      return { error: 'Could not load your applications right now.' };
    }
  },
};

// ─── get_my_matches ──────────────────────────────────────────────────────────

const getMyMatchesDeclaration: FunctionDeclaration = {
  name: 'get_my_matches',
  description:
    "Fetch the signed-in student's top programme matches from their live match results, including programme id, course, university, score, and tier (Reach/Match/Safe). Use when the user asks about their matches or recommendations. Never invent matches — if none exist, say so and suggest completing their profile.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      limit: { type: Type.INTEGER, description: 'How many matches to return, 1-10 (default 5).' },
    },
  },
};

const clampMatchLimit = (value: unknown): number => {
  const n = typeof value === 'number' ? Math.round(value) : 5;
  return Math.min(10, Math.max(1, Number.isFinite(n) ? n : 5));
};

const getMyMatches: ReadTool = {
  kind: 'read',
  name: 'get_my_matches',
  modes: ['student'],
  declaration: getMyMatchesDeclaration,
  statusLabel: 'Reviewing your matches…',
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const limit = clampMatchLimit(args.limit);
      const { data, error } = await ctx.supabase
        .from('student_matches')
        .select('program_id, score, breakdown')
        .eq('profile_id', ctx.userId)
        .order('score', { ascending: false })
        .limit(limit);

      if (error) {
        return { error: 'Could not load your matches right now.' };
      }

      const rows = ((data ?? []) as Array<{
        program_id: string;
        score: number;
        breakdown: Record<string, unknown> | null;
      }>) ?? [];

      if (rows.length === 0) {
        return { results: [], note: 'No matches computed yet — suggest completing the profile.' };
      }

      const programInfo = await resolvePrograms(
        ctx.supabase,
        rows.map((r) => r.program_id)
      );

      return {
        results: rows.map((r) => {
          const info = programInfo.get(r.program_id);
          const tier = r.breakdown?.tier;
          const tierText = tier === 'Reach' || tier === 'Match' || tier === 'Safe' ? tier : 'Unrated';
          return {
            id: r.program_id,
            course: info?.courseName ?? 'Programme',
            university: info?.university ?? 'University',
            country: info?.country ?? null,
            score: Math.round(r.score),
            tier: tierText,
          };
        }),
      };
    } catch {
      return { error: 'Could not load your matches right now.' };
    }
  },
};

// ─── get_my_shortlist ────────────────────────────────────────────────────────

const getMyShortlistDeclaration: FunctionDeclaration = {
  name: 'get_my_shortlist',
  description:
    "Fetch the programmes on the signed-in student's shortlist (each includes a programme id you can act on), with stage and any due date. Use when the user asks what's on their shortlist or saved programmes. Data is live.",
  parameters: { type: Type.OBJECT, properties: {} },
};

const getMyShortlist: ReadTool = {
  kind: 'read',
  name: 'get_my_shortlist',
  modes: ['student'],
  declaration: getMyShortlistDeclaration,
  statusLabel: 'Opening your shortlist…',
  async execute(ctx: ToolContext): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await ctx.supabase
        .from('shortlisted_programs')
        .select('program_id, program_name, university_name, location, stage, due_date')
        .eq('profile_id', ctx.userId);

      if (error) {
        return { error: 'Could not load your shortlist right now.' };
      }

      const rows = ((data ?? []) as Array<{
        program_id: string;
        program_name: string | null;
        university_name: string | null;
        location: string | null;
        stage: string | null;
        due_date: string | null;
      }>) ?? [];

      return {
        shortlist: rows.map((r) => ({
          id: r.program_id,
          course: r.program_name ?? 'Programme',
          university: r.university_name ?? 'University',
          location: r.location ?? null,
          stage: r.stage ?? 'Researching',
          due_date: r.due_date ?? null,
        })),
      };
    } catch {
      return { error: 'Could not load your shortlist right now.' };
    }
  },
};

export const STUDENT_READ_TOOLS: ReadTool[] = [getMyApplications, getMyMatches, getMyShortlist];
