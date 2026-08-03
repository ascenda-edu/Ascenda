// Counsellor-mode WRITE tools. NEVER executed inline: the loop turns the
// model's call into an editable confirm card (toProposal); the execute endpoint
// runs `execute` only after the counsellor approves, and only through the
// user-scoped client so RLS + can_act_as_counsellor() have the final say.
// Declarations tell the model these DRAFT a card and that it must not claim the
// action is done until it sees an execution result.

import { Type } from '@google/genai';
import type { WriteTool, ToolContext, ToolActionProposal, ToolActionResult } from './types';
import { MAX_SUBJECT_LENGTH, MAX_BODY_LENGTH } from '@/lib/chat/actions';
import { insertHelpRequest } from '@/lib/demo/help-request-client';
import { nameMap } from '@/lib/counsellor/data';
import { isActionableStudent } from '@/lib/api/guards';
import type { HelpRequestInsert } from '@/lib/types/demo-tables';

const NOTE_TYPES = ['session', 'flag', 'update'] as const;
type NoteType = (typeof NOTE_TYPES)[number];

/** Refusal shared by both write tools when the named subject is out of scope. */
const OUT_OF_SCOPE: ToolActionResult = {
  ok: false,
  message: "Couldn't complete that action.",
  error: 'not an assignable student',
};

// Real UUID shape. The previous `/^[0-9a-f-]{36}$/i` matched any 36-character
// run of hex digits and hyphens — including 36 hyphens — so it rejected almost
// nothing. Format validation is not authorisation either way: the subject is
// authorised in execute() via isActionableStudent.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

// Cheap name resolution for the card title. nameMap is a single
// student_personal_information select; falls back to 'this student' on any miss.
async function resolveStudentName(ctx: ToolContext, studentId: string): Promise<string> {
  try {
    const names = await nameMap(ctx.supabase as Parameters<typeof nameMap>[0], [studentId]);
    return names.get(studentId)?.name ?? 'this student';
  } catch {
    return 'this student';
  }
}

const addStudentNote: WriteTool = {
  kind: 'write',
  name: 'add_student_note',
  modes: ['counsellor'],
  declaration: {
    name: 'add_student_note',
    description:
      "Draft a private counsellor note about a student (session log, flag, or progress update). This only DRAFTS an editable card the counsellor must confirm — nothing is saved until they approve. Never tell the user the note is saved until you receive an execution result.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_id: { type: Type.STRING, description: 'The student profile id (from a read tool).' },
        body: { type: Type.STRING, description: 'The note text.' },
        note_type: {
          type: Type.STRING,
          description: "One of 'session', 'flag', or 'update'.",
        },
      },
      required: ['student_id', 'body', 'note_type'],
    },
  },
  async toProposal(ctx: ToolContext, args): Promise<ToolActionProposal | null> {
    const student_id = asString(args.student_id).trim();
    const body = asString(args.body).trim();
    const note_type = asString(args.note_type).trim();
    if (!student_id || !body) return null;
    const type: NoteType = (NOTE_TYPES as readonly string[]).includes(note_type)
      ? (note_type as NoteType)
      : 'session';
    const name = await resolveStudentName(ctx, student_id);
    return {
      tool: 'add_student_note',
      title: `Add a ${type} note for ${name}`,
      summary: body.slice(0, 160),
      params: { student_id, body: body.slice(0, MAX_BODY_LENGTH), note_type: type },
      editable: [
        { key: 'body', label: 'Note', kind: 'textarea' },
        { key: 'note_type', label: 'Type', kind: 'select', options: [...NOTE_TYPES] },
      ],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    const student_id = asString(p.student_id).trim();
    const body = asString(p.body).trim();
    const note_type = asString(p.note_type).trim();
    if (!UUID_RE.test(student_id)) return { ok: false, error: 'A valid student is required.' };
    if (!body) return { ok: false, error: 'The note cannot be empty.' };
    if (body.length > MAX_BODY_LENGTH) return { ok: false, error: 'The note is too long.' };
    if (!(NOTE_TYPES as readonly string[]).includes(note_type))
      return { ok: false, error: 'Choose a note type of session, flag, or update.' };
    return { ok: true, params: { student_id, body, note_type } };
  },
  async execute(ctx: ToolContext, params): Promise<ToolActionResult> {
    try {
      // `student_id` originates in model output, which the conversation content
      // influences — so it is authorised here, not trusted.
      if (!(await isActionableStudent(ctx.supabase, params.student_id as string))) {
        return OUT_OF_SCOPE;
      }

      const { data, error } = await (ctx.supabase as any)
        .from('counsellor_notes')
        .insert({
          student_profile_id: params.student_id,
          author_profile_id: ctx.userId,
          body: params.body,
          note_type: params.note_type,
        })
        .select('id')
        .single();
      if (error) throw error;
      return {
        ok: true,
        result: { noteId: data.id },
        message: "Note saved — see the student's page in [Students](/counsellor/students).",
      };
    } catch (err) {
      return {
        ok: false,
        message: "Couldn't complete that action.",
        error: err instanceof Error ? err.message : 'insert failed',
      };
    }
  },
};

const messageStudent: WriteTool = {
  kind: 'write',
  name: 'message_student',
  modes: ['counsellor'],
  declaration: {
    name: 'message_student',
    description:
      "Draft a message to a student, opening a counsellor-initiated help thread. This only DRAFTS an editable card the counsellor must confirm — nothing is sent until they approve. Never tell the user the message is sent until you receive an execution result.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_id: { type: Type.STRING, description: 'The student profile id (from a read tool).' },
        subject: { type: Type.STRING, description: 'Short subject line.' },
        body: { type: Type.STRING, description: 'The message, written for the student.' },
      },
      required: ['student_id', 'subject', 'body'],
    },
  },
  async toProposal(ctx: ToolContext, args): Promise<ToolActionProposal | null> {
    const student_id = asString(args.student_id).trim();
    const subject = asString(args.subject).trim();
    const body = asString(args.body).trim();
    if (!student_id || !subject || !body) return null;
    const name = await resolveStudentName(ctx, student_id);
    return {
      tool: 'message_student',
      title: `Message ${name}`,
      summary: subject.slice(0, MAX_SUBJECT_LENGTH),
      params: {
        student_id,
        subject: subject.slice(0, MAX_SUBJECT_LENGTH),
        body: body.slice(0, MAX_BODY_LENGTH),
      },
      editable: [
        { key: 'subject', label: 'Subject', kind: 'text' },
        { key: 'body', label: 'Message', kind: 'textarea' },
      ],
    };
  },
  validateParams(params) {
    const p = (params ?? {}) as Record<string, unknown>;
    const student_id = asString(p.student_id).trim();
    const subject = asString(p.subject).trim();
    const body = asString(p.body).trim();
    if (!UUID_RE.test(student_id)) return { ok: false, error: 'A valid student is required.' };
    if (!subject) return { ok: false, error: 'A subject is required.' };
    if (subject.length > MAX_SUBJECT_LENGTH) return { ok: false, error: 'The subject is too long.' };
    if (!body) return { ok: false, error: 'The message cannot be empty.' };
    if (body.length > MAX_BODY_LENGTH) return { ok: false, error: 'The message is too long.' };
    return { ok: true, params: { student_id, subject, body } };
  },
  async execute(ctx: ToolContext, params): Promise<ToolActionResult> {
    try {
      // Same rule as add_counsellor_note: the subject named by the model is
      // authorised before a row that notifies that student is written.
      if (!(await isActionableStudent(ctx.supabase, params.student_id as string))) {
        return OUT_OF_SCOPE;
      }

      // The opening body IS the thread's first message (rendered attributed to
      // initiated_by); the student's notification fires via trg_help_request_notify
      // — do NOT insert a notification here.
      const row: HelpRequestInsert = {
        student_profile_id: params.student_id as string,
        counsellor_profile_id: ctx.userId,
        subject: params.subject as string,
        body: params.body as string,
        initiated_by: 'counsellor',
      };
      const { id } = await insertHelpRequest(ctx.supabase, row);
      return {
        ok: true,
        result: { helpRequestId: id },
        message: 'Sent — the thread is in your [Inbox](/counsellor/inbox).',
      };
    } catch (err) {
      return {
        ok: false,
        message: "Couldn't complete that action.",
        error: err instanceof Error ? err.message : 'insert failed',
      };
    }
  },
};

export const COUNSELLOR_WRITE_TOOLS: WriteTool[] = [addStudentNote, messageStudent];
