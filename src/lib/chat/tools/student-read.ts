// Student-mode READ tools. Executed inline by the tool loop (no confirmation)
// under the user-scoped client — RLS scopes every row to the caller. Each
// execute() MUST NOT throw: a failed lookup returns an { error }/{ note }
// payload the model can see, never a broken stream.

import { Type, type FunctionDeclaration } from '@google/genai';
import { resolvePrograms } from '@/lib/counsellor/data';
import { loadApplicationBoard } from '@/lib/data/applications';
import { reportDataError } from '@/lib/data/errors';
import { isMissingShortlistTable } from '@/lib/shortlist/server';
import { daysUntil } from '@/lib/utils/dates';
import type { ProgramHit } from '../tools';
import type { ChatWidget } from '../widgets';
import type { ReadTool, ToolContext } from './types';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MAX_APPS = 20;

// ─── get_my_applications ─────────────────────────────────────────────────────

const getMyApplicationsDeclaration: FunctionDeclaration = {
  name: 'get_my_applications',
  description:
    "Fetch the signed-in student's tracked applications with live status, deadlines, and checklist tasks (each task includes an id you can act on). Use when the user asks about their applications, progress, tasks, or what's due. Data is live — never invent applications.",
  parameters: { type: Type.OBJECT, properties: {} },
};

// The local `AppRow` that used to sit here was the fourth hand-written copy of
// the applications embed — the one that DID include checklist ids and did not
// include the programme id. Both shapes now come from lib/data/columns.ts.

const getMyApplications: ReadTool = {
  kind: 'read',
  name: 'get_my_applications',
  modes: ['student'],
  declaration: getMyApplicationsDeclaration,
  statusLabel: 'Checking your applications…',
  async execute(ctx: ToolContext): Promise<Record<string, unknown>> {
    try {
      // Disposition: the loader unwraps (throws + logs); the catch below turns
      // that into the model-facing payload this tool contract requires. An
      // empty `applications: []` on failure would have the assistant tell a
      // student with a full board that they are tracking nothing.
      const rows = await loadApplicationBoard(ctx.supabase, ctx.userId, { limit: MAX_APPS });
      return {
        applications: rows.map((app) => ({
          id: app.id,
          status: app.status ?? 'planning',
          course: app.program?.name ?? 'Programme',
          university: app.program?.universities?.name ?? 'University',
          country: app.program?.universities?.country ?? null,
          deadlines: (app.program?.deadlines ?? []).flatMap((d) =>
            d.deadline_date ? [{ name: d.name, date: d.deadline_date }] : []
          ),
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
  toWidgets: (result): ChatWidget[] | null => {
    if (result.error) return null;
    const apps = (result as { applications?: AppWidgetRow[] }).applications ?? [];

    const deadlines = apps
      .flatMap((app) =>
        (app.deadlines ?? [])
          .filter((d) => typeof d.date === 'string' && DATE_ONLY.test(d.date))
          .map((d) => ({
            label: d.name,
            university: app.university,
            date: d.date,
            daysUntil: daysUntil(d.date),
          }))
      )
      .filter((d) => d.daysUntil >= -30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const tasks = apps
      .flatMap((app) =>
        (app.tasks ?? []).map((t) => ({
          id: t.id,
          name: t.task_name,
          status: t.status,
          dueDate: t.due_date ?? null,
          application: app.course,
          applicationId: app.id,
        }))
      )
      .sort((a, b) => {
        const doneDelta = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
        if (doneDelta !== 0) return doneDelta;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });

    const widgets: ChatWidget[] = [];
    if (deadlines.length > 0) widgets.push({ kind: 'deadlines', items: deadlines });
    if (tasks.length > 0) widgets.push({ kind: 'tasks', items: tasks });
    return widgets.length > 0 ? widgets : null;
  },
};

type AppWidgetRow = {
  id: string;
  course: string;
  university: string;
  deadlines?: Array<{ name: string; date: string }>;
  tasks?: Array<{ id: string; task_name: string; status: 'todo' | 'doing' | 'done'; due_date: string | null }>;
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
        // Disposition: report-only. Neither `unwrap` (a throw breaks the tool
        // stream) nor `soft` (an empty list tells the model "no matches yet",
        // and the payload below acts on exactly that) — the tool owns its
        // model-facing message, so only the logging half is shared.
        reportDataError('chat.getMyMatches', error, { userId: ctx.userId });
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
          const b = r.breakdown ?? {};
          return {
            id: r.program_id,
            course: info?.courseName ?? 'Programme',
            university: info?.university ?? 'University',
            country: info?.country ?? null,
            score: Math.round(r.score),
            tier: tierText,
            factors: {
              eligibility: clampFactor(b.eligibility),
              academicFit: clampFactor(b.academicFit),
              preferenceFit: clampFactor(b.preferenceFit),
              outcomes: clampFactor(b.outcomes),
            },
          };
        }),
      };
    } catch {
      return { error: 'Could not load your matches right now.' };
    }
  },
  toWidgets: (result): ChatWidget[] | null => {
    if (result.error) return null;
    const rows = (result as { results?: MatchWidgetRow[] }).results ?? [];
    if (rows.length === 0) return null;
    return [
      {
        kind: 'matches',
        items: rows.map((r) => ({
          id: r.id,
          course: r.course,
          university: r.university,
          score: r.score,
          tier: r.tier === 'Reach' || r.tier === 'Match' || r.tier === 'Safe' ? r.tier : null,
          factors: r.factors,
        })),
      },
    ];
  },
};

// breakdown jsonb carries these four (service.ts) but is untyped on the wire —
// keep only finite numbers in 0-100, default 0.
const clampFactor = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

type MatchWidgetRow = {
  id: string;
  course: string;
  university: string;
  score: number;
  tier: string;
  factors: { eligibility: number; academicFit: number; preferenceFit: number; outcomes: number };
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
        if (isMissingShortlistTable(error)) {
          // The client falls back to localStorage in this posture — the server
          // genuinely cannot see the shortlist, and "empty" would be a lie.
          return {
            note: "Shortlist sync isn't enabled on this deployment; the user's shortlist is stored only in their browser and is not visible here. Do NOT claim it is empty — point them at the Shortlist page.",
          };
        }
        // Report-only, as above. The missing-table branch returns before this:
        // that one is an expected deployment posture, not a failure to log.
        reportDataError('chat.getMyShortlist', error, { userId: ctx.userId });
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
  toWidgets: (result): ChatWidget[] | null => {
    // {note} = localStorage posture (server can't see it) or {error} — neither
    // is card-worthy. Only the shortlist array renders.
    const rows = (result as { shortlist?: ShortlistWidgetRow[] }).shortlist;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const items: ProgramHit[] = rows.map((r) => ({
      id: r.id,
      course: r.course,
      university: r.university,
      country: r.location ?? '—',
      city: null,
      level: null,
    }));
    return [{ kind: 'programs', items }];
  },
};

type ShortlistWidgetRow = {
  id: string;
  course: string;
  university: string;
  location: string | null;
};

export const STUDENT_READ_TOOLS: ReadTool[] = [getMyApplications, getMyMatches, getMyShortlist];
