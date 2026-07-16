// Counsellor-mode READ tools. Executed server-side during the tool loop (no
// confirmation) — every execute MUST return an `{ error }` payload instead of
// throwing, so a failed lookup degrades to a model-visible line, not a broken
// stream. Payloads are trimmed to what the model needs to reason and chain
// calls (always carrying ids), never the full nested cohort shape.

import { Type } from '@google/genai';
import type { ReadTool, ToolContext } from './types';
import {
  loadCohort,
  loadStudentById,
  deriveCohortStats,
  deriveAtRiskAlerts,
  deriveUpcomingDeadlines,
} from '@/lib/counsellor/data';
import type { CounsellorStudent } from '@/lib/counsellor/types';

// loadCohort/loadStudentById return the user-scoped client's Database generic;
// the counsellor data layer already casts through `any` internally, so the tool
// context client is compatible at the call site.
type CohortClient = Parameters<typeof loadCohort>[0];

const fullName = (s: CounsellorStudent): string =>
  `${s.personal.firstName} ${s.personal.lastName}`.trim() || 'Student';

// Application status tallies — compact enough to hand the model per student.
const statusSummary = (s: CounsellorStudent) => {
  const summary = { planning: 0, in_progress: 0, submitted: 0, decision: 0 };
  for (const a of s.applications) summary[a.status] += 1;
  return summary;
};

const clampWithinDays = (value: unknown): number => {
  const n = typeof value === 'number' ? Math.round(value) : 30;
  return Math.min(90, Math.max(1, Number.isFinite(n) ? n : 30));
};

const getCohortOverview: ReadTool = {
  kind: 'read',
  name: 'get_cohort_overview',
  modes: ['counsellor'],
  statusLabel: 'Reviewing the cohort…',
  declaration: {
    name: 'get_cohort_overview',
    description:
      "Snapshot of the counsellor's whole cohort: aggregate stats, at-risk alerts, and a compact roster (with student ids). Use to answer 'how is my cohort doing', 'who needs attention', or before drilling into a specific student.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  async execute(ctx: ToolContext) {
    try {
      const students = await loadCohort(ctx.supabase as CohortClient);
      const stats = deriveCohortStats(students);
      const atRisk = deriveAtRiskAlerts(students)
        .slice(0, 10)
        .map((a) => ({
          id: a.studentId,
          name: a.studentName,
          urgency: a.urgency,
          reason: a.description,
        }));
      const roster = students.slice(0, 30).map((s) => ({
        id: s.id,
        name: fullName(s),
        applications: s.applications.length,
        statuses: statusSummary(s),
        completionPct: s.profile.completionPct,
        flags: s.flags,
      }));
      return {
        stats,
        atRisk,
        roster,
        rosterTruncated: students.length > 30 ? students.length : undefined,
      };
    } catch {
      return { error: 'Could not load the cohort right now.' };
    }
  },
};

const getStudentOverview: ReadTool = {
  kind: 'read',
  name: 'get_student_overview',
  modes: ['counsellor'],
  statusLabel: 'Pulling up the student…',
  declaration: {
    name: 'get_student_overview',
    description:
      "Full picture of one student: profile summary, applications with statuses and deadlines, flags, and recent counsellor notes. Provide student_id (preferred, from get_cohort_overview) or name. An ambiguous name returns candidates to disambiguate.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_id: { type: Type.STRING, description: 'The student profile id (preferred).' },
        name: { type: Type.STRING, description: 'Full or partial student name, used only when no id is known.' },
      },
    },
  },
  async execute(ctx: ToolContext, args) {
    try {
      const studentId = typeof args.student_id === 'string' ? args.student_id.trim() : '';
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!studentId && !name) return { error: 'Provide a student id or name.' };

      let id = studentId;
      if (!id) {
        const cohort = await loadCohort(ctx.supabase as CohortClient);
        const needle = name.toLowerCase();
        const matches = cohort.filter((s) => fullName(s).toLowerCase().includes(needle));
        if (matches.length === 0) return { error: `No student matching "${name}".` };
        if (matches.length > 1) {
          return {
            ambiguous: true,
            candidates: matches.map((s) => ({ id: s.id, name: fullName(s) })),
          };
        }
        id = matches[0].id;
      }

      const student = await loadStudentById(ctx.supabase as CohortClient, id);
      if (!student) return { error: 'No student with that id in your cohort.' };

      return {
        id: student.id,
        name: fullName(student),
        profile: {
          completionPct: student.profile.completionPct,
          stepsComplete: student.profile.stepsComplete,
          programmeType: student.academic.programmeType,
          school: student.personal.school,
          careerAspiration: student.academic.careerAspiration,
        },
        flags: student.flags,
        applications: student.applications.map((a) => ({
          university: a.university,
          program: a.program,
          status: a.status,
          deadline: a.deadline || null,
        })),
        deadlines: student.deadlines.map((d) => ({
          university: d.university,
          program: d.program,
          date: d.date,
          type: d.type,
        })),
        recentNotes: student.notes.slice(0, 5).map((n) => ({
          type: n.type,
          date: n.date,
          content: n.content.slice(0, 240),
        })),
      };
    } catch {
      return { error: 'Could not load that student right now.' };
    }
  },
};

const getCohortDeadlines: ReadTool = {
  kind: 'read',
  name: 'get_cohort_deadlines',
  modes: ['counsellor'],
  statusLabel: 'Scanning deadlines…',
  declaration: {
    name: 'get_cohort_deadlines',
    description:
      "Upcoming application deadlines across the cohort within a window, each with the student id and name. Use for 'what's due this week' or to plan check-ins.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        within_days: { type: Type.INTEGER, description: 'Look-ahead window in days, 1-90 (default 30).' },
      },
    },
  },
  async execute(ctx: ToolContext, args) {
    try {
      const withinDays = clampWithinDays(args.within_days);
      const students = await loadCohort(ctx.supabase as CohortClient);
      const deadlines = deriveUpcomingDeadlines(students, withinDays).map((d) => ({
        studentId: d.studentId,
        studentName: d.studentName,
        university: d.university,
        program: d.program,
        date: d.date,
        type: d.type,
        daysUntil: d.daysUntil,
      }));
      return { withinDays, deadlines };
    } catch {
      return { error: 'Could not load deadlines right now.' };
    }
  },
};

export const COUNSELLOR_READ_TOOLS: ReadTool[] = [
  getCohortOverview,
  getStudentOverview,
  getCohortDeadlines,
];
