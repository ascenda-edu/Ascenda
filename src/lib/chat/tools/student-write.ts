// Student-mode WRITE tools. These NEVER execute inline: the tool loop turns a
// model call into a ToolActionProposal (an editable confirm card) via
// toProposal; the execute endpoint runs execute() only after the user approves,
// under the user-scoped client so RLS has the final word. validateParams
// re-checks the (possibly user-edited) params server-side at execute time.

import { Type } from '@google/genai';
import {
  trackProgram,
  createChecklistTask,
  updateChecklistTaskStatus,
} from '@/lib/applications/server-actions';
import { addToShortlist } from '@/lib/shortlist/server';
import { insertHelpRequest } from '@/lib/demo/help-request-client';
import { MAX_SUBJECT_LENGTH, MAX_BODY_LENGTH } from '@/lib/chat/actions';
import { isValidDate, clampText } from '@/lib/utils/dates';
import type { WriteTool, ToolContext, ToolActionResult } from './types';

// Every write declaration ends with this so the model always knows the action
// is a draft the user must approve — it must not claim success prematurely.
const DRAFT_NOTICE =
  'This drafts an action card — the user reviews and confirms before anything happens. Never claim the action is done until you see an execution result.';

const UUID_RE = /^[0-9a-f-]{36}$/i;

const isUuidish = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value.trim());

const failure = (error: string): ToolActionResult => ({
  ok: false,
  message: "Couldn't complete that action.",
  error,
});

// The server actions collapse exists-but-not-yours into 'not_found' at the
// source, so the error body can't become an existence oracle for row UUIDs
// (counsellor read policies make non-owned rows SELECTable). Surface the
// generic not-found text for that code and pass anything else through.
const actionFailure = (
  result: { error: string; code?: string },
  notFoundMessage: string
): ToolActionResult =>
  failure(result.code === 'not_found' ? notFoundMessage : result.error);

// Resolve a programme's course + university name for confirm-card summaries.
async function lookupProgram(
  ctx: ToolContext,
  programId: string
): Promise<{ course: string; university: string } | null> {
  const { data, error } = await ctx.supabase
    .from('programs')
    .select('id, course_name, universities(name)')
    .eq('id', programId)
    .maybeSingle();
  if (error || !data) return null;
  const uni = Array.isArray((data as any).universities)
    ? (data as any).universities[0]
    : (data as any).universities;
  return {
    course: (data as any).course_name ?? 'Programme',
    university: uni?.name ?? 'University',
  };
}

// ─── track_application ───────────────────────────────────────────────────────

const trackApplication: WriteTool = {
  kind: 'write',
  name: 'track_application',
  modes: ['student'],
  declaration: {
    name: 'track_application',
    description: `Start tracking a programme as an application for the student. Use when the user wants to track, apply to, or add a programme to their applications; pass the programme id from a search or matches result. ${DRAFT_NOTICE}`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        program_id: { type: Type.STRING, description: 'The programme id to track.' },
        program_name: { type: Type.STRING, description: 'Optional programme name for context.' },
        university_name: { type: Type.STRING, description: 'Optional university name for context.' },
      },
      required: ['program_id'],
    },
  },
  async toProposal(ctx, args) {
    const programId = typeof args.program_id === 'string' ? args.program_id.trim() : '';
    if (!programId) return null;
    const info = await lookupProgram(ctx, programId);
    if (!info) return null;
    return {
      tool: 'track_application',
      title: 'Track this application',
      summary: `Start tracking ${info.course} at ${info.university}.`,
      params: { program_id: programId },
      editable: [],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    if (!isUuidish(p.program_id)) return { ok: false, error: 'A valid programme id is required.' };
    return { ok: true, params: { program_id: (p.program_id as string).trim() } };
  },
  async execute(ctx, params): Promise<ToolActionResult> {
    try {
      const programId = params.program_id as string;
      const info = await lookupProgram(ctx, programId);
      const result = await trackProgram(ctx.supabase, ctx.userId, programId);
      if (!result.ok) return failure(result.error);
      const label = info ? `${info.course} at ${info.university}` : 'this programme';
      const message =
        result.status === 'created'
          ? `Now tracking ${label} — see [Applications](/applications).`
          : `Already tracking this one — see [Applications](/applications).`;
      return {
        ok: true,
        result: { applicationId: result.applicationId, status: result.status },
        message,
      };
    } catch (err) {
      return failure(err instanceof Error ? err.message : 'track failed');
    }
  },
};

// ─── create_task ─────────────────────────────────────────────────────────────

const createTask: WriteTool = {
  kind: 'write',
  name: 'create_task',
  modes: ['student'],
  declaration: {
    name: 'create_task',
    description: `Add a checklist task to one of the student's tracked applications. Use when the user wants to add a to-do or task; pass the application id (from get_my_applications) it belongs to. ${DRAFT_NOTICE}`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        application_id: { type: Type.STRING, description: 'The application id the task belongs to.' },
        task_name: { type: Type.STRING, description: 'What needs doing.' },
        due_date: { type: Type.STRING, description: 'Optional due date, YYYY-MM-DD.' },
      },
      required: ['application_id', 'task_name'],
    },
  },
  async toProposal(ctx, args) {
    const applicationId = typeof args.application_id === 'string' ? args.application_id.trim() : '';
    const taskName = clampText(args.task_name, 200);
    if (!applicationId || !taskName) return null;
    const { data, error } = await ctx.supabase
      .from('applications')
      .select('id, program:programs(name:course_name)')
      .eq('id', applicationId)
      .maybeSingle();
    if (error || !data) return null;
    const course = (data as any).program?.name ?? 'your application';
    const dueDate = typeof args.due_date === 'string' && isValidDate(args.due_date) ? args.due_date : '';
    return {
      tool: 'create_task',
      title: 'Add a task',
      summary: `Add "${taskName}" to ${course}.`,
      params: { application_id: applicationId, task_name: taskName, due_date: dueDate },
      editable: [
        { key: 'task_name', label: 'Task', kind: 'text' },
        { key: 'due_date', label: 'Due date', kind: 'date' },
      ],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    if (!isUuidish(p.application_id)) return { ok: false, error: 'A valid application id is required.' };
    const taskName = clampText(p.task_name, 200);
    if (!taskName) return { ok: false, error: 'A task name is required.' };
    const dueRaw = typeof p.due_date === 'string' ? p.due_date.trim() : '';
    if (dueRaw && !isValidDate(dueRaw)) return { ok: false, error: 'Due date must be YYYY-MM-DD.' };
    return {
      ok: true,
      params: {
        application_id: (p.application_id as string).trim(),
        task_name: taskName,
        due_date: dueRaw || null,
      },
    };
  },
  async execute(ctx, params): Promise<ToolActionResult> {
    try {
      const result = await createChecklistTask(ctx.supabase, ctx.userId, {
        applicationId: params.application_id as string,
        taskName: params.task_name as string,
        dueDate: (params.due_date as string | null) ?? null,
      });
      if (!result.ok) return actionFailure(result, 'Application not found');
      return {
        ok: true,
        result: { taskId: (result.task as any).id },
        message: 'Task added — see [Tasks](/applications/tasks).',
      };
    } catch (err) {
      return failure(err instanceof Error ? err.message : 'create task failed');
    }
  },
};

// ─── update_task_status ──────────────────────────────────────────────────────

const TASK_STATUSES = ['todo', 'doing', 'done'] as const;

const updateTaskStatus: WriteTool = {
  kind: 'write',
  name: 'update_task_status',
  modes: ['student'],
  declaration: {
    name: 'update_task_status',
    description: `Change the status of one of the student's checklist tasks (todo, doing, or done). Use when the user wants to mark a task done or move it along; pass the task id from get_my_applications. ${DRAFT_NOTICE}`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: { type: Type.STRING, description: 'The checklist task id.' },
        status: { type: Type.STRING, description: 'New status: todo, doing, or done.' },
      },
      required: ['task_id', 'status'],
    },
  },
  async toProposal(ctx, args) {
    const taskId = typeof args.task_id === 'string' ? args.task_id.trim() : '';
    const status =
      typeof args.status === 'string' && (TASK_STATUSES as readonly string[]).includes(args.status)
        ? args.status
        : '';
    if (!taskId || !status) return null;
    const { data, error } = await ctx.supabase
      .from('application_checklist')
      .select('id, task_name, status, applications!inner(profile_id)')
      .eq('id', taskId)
      .maybeSingle();
    if (error || !data) return null;
    if ((data as any).applications?.profile_id !== ctx.userId) return null;
    const taskName = (data as any).task_name ?? 'this task';
    return {
      tool: 'update_task_status',
      title: 'Update task status',
      summary: `Mark "${taskName}" as ${status}.`,
      params: { task_id: taskId, status },
      editable: [
        { key: 'status', label: 'Status', kind: 'select', options: [...TASK_STATUSES] },
      ],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    if (!isUuidish(p.task_id)) return { ok: false, error: 'A valid task id is required.' };
    if (typeof p.status !== 'string' || !(TASK_STATUSES as readonly string[]).includes(p.status)) {
      return { ok: false, error: 'Status must be todo, doing, or done.' };
    }
    return { ok: true, params: { task_id: (p.task_id as string).trim(), status: p.status } };
  },
  async execute(ctx, params): Promise<ToolActionResult> {
    try {
      const result = await updateChecklistTaskStatus(ctx.supabase, ctx.userId, {
        taskId: params.task_id as string,
        status: params.status as 'todo' | 'doing' | 'done',
      });
      if (!result.ok) return actionFailure(result, 'Checklist item not found');
      return {
        ok: true,
        result: { taskId: (result.item as any).id },
        message: 'Updated — see [Tasks](/applications/tasks).',
      };
    } catch (err) {
      return failure(err instanceof Error ? err.message : 'update task failed');
    }
  },
};

// ─── add_to_shortlist ────────────────────────────────────────────────────────

const addToShortlistTool: WriteTool = {
  kind: 'write',
  name: 'add_to_shortlist',
  modes: ['student'],
  declaration: {
    name: 'add_to_shortlist',
    description: `Save a programme to the student's shortlist. Use when the user wants to shortlist, save, or bookmark a programme; pass the programme id from a search or matches result. ${DRAFT_NOTICE}`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        program_id: { type: Type.STRING, description: 'The programme id to shortlist.' },
      },
      required: ['program_id'],
    },
  },
  async toProposal(ctx, args) {
    const programId = typeof args.program_id === 'string' ? args.program_id.trim() : '';
    if (!programId) return null;
    const info = await lookupProgram(ctx, programId);
    if (!info) return null;
    return {
      tool: 'add_to_shortlist',
      title: 'Add to shortlist',
      summary: `Add ${info.course} at ${info.university} to your shortlist.`,
      params: { program_id: programId },
      editable: [],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    if (!isUuidish(p.program_id)) return { ok: false, error: 'A valid programme id is required.' };
    return { ok: true, params: { program_id: (p.program_id as string).trim() } };
  },
  async execute(ctx, params): Promise<ToolActionResult> {
    try {
      const result = await addToShortlist(ctx.supabase, ctx.userId, params.program_id as string);
      if (!result.ok) return failure(result.error);
      const message = result.already
        ? 'That programme is already on your shortlist.'
        : "Added to your shortlist — it'll appear on [Shortlist](/shortlist).";
      return {
        ok: true,
        result: { programId: params.program_id, already: result.already },
        message,
      };
    } catch (err) {
      return failure(err instanceof Error ? err.message : 'shortlist failed');
    }
  },
};

// ─── send_help_request ───────────────────────────────────────────────────────
// Supersedes the legacy propose_help_request action tool.

const sendHelpRequest: WriteTool = {
  kind: 'write',
  name: 'send_help_request',
  modes: ['student'],
  declaration: {
    name: 'send_help_request',
    description: `Send a help request to the student's counsellor. Use ONLY when the user explicitly wants to contact or ask their counsellor. Optionally reference an application id. ${DRAFT_NOTICE}`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        subject: { type: Type.STRING, description: 'Short, specific subject line.' },
        body: { type: Type.STRING, description: 'The request itself, written for the counsellor.' },
        application_id: {
          type: Type.STRING,
          description: 'Optional: a related application id if one is relevant.',
        },
      },
      required: ['subject', 'body'],
    },
  },
  async toProposal(_ctx, args) {
    const subject = clampText(args.subject, MAX_SUBJECT_LENGTH);
    const body = clampText(args.body, MAX_BODY_LENGTH);
    if (!subject || !body) return null;
    const applicationId = typeof args.application_id === 'string' ? args.application_id.trim() : '';
    return {
      tool: 'send_help_request',
      title: 'Message your counsellor',
      summary: `Send "${subject}" to your counsellor.`,
      params: { subject, body, ...(applicationId ? { application_id: applicationId } : {}) },
      editable: [
        { key: 'subject', label: 'Subject', kind: 'text' },
        { key: 'body', label: 'Message', kind: 'textarea' },
      ],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    const subject = clampText(p.subject, MAX_SUBJECT_LENGTH);
    const body = clampText(p.body, MAX_BODY_LENGTH);
    if (!subject) return { ok: false, error: 'A subject is required.' };
    if (!body) return { ok: false, error: 'A message is required.' };
    const applicationId = typeof p.application_id === 'string' ? p.application_id.trim() : '';
    return {
      ok: true,
      params: { subject, body, ...(applicationId ? { application_id: applicationId } : {}) },
    };
  },
  async execute(ctx, params): Promise<ToolActionResult> {
    try {
      // Counsellor notification fires via a DB trigger — do NOT insert one here.
      const inserted = await insertHelpRequest(ctx.supabase, {
        student_profile_id: ctx.userId,
        subject: params.subject as string,
        body: params.body as string,
        ...(params.application_id ? { application_id: params.application_id as string } : {}),
      } as any);
      return {
        ok: true,
        result: { helpRequestId: inserted.id },
        message: 'Sent to your counsellor — track it in [Inbox](/inbox).',
      };
    } catch (err) {
      return failure(err instanceof Error ? err.message : 'send failed');
    }
  },
};

export const STUDENT_WRITE_TOOLS: WriteTool[] = [
  trackApplication,
  createTask,
  updateTaskStatus,
  addToShortlistTool,
  sendHelpRequest,
];
