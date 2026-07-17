// Counsellor-mode READ tools. Executed server-side during the tool loop (no
// confirmation) — every execute MUST return an `{ error }` payload instead of
// throwing, so a failed lookup degrades to a model-visible line, not a broken
// stream. Payloads are trimmed to what the model needs to reason and chain
// calls (always carrying ids), never the full nested cohort shape.

import { Type } from '@google/genai';
import type { ChatWidget, StatHit } from '../widgets';
import type { ReadTool, ToolContext } from './types';
import {
  loadCohort,
  loadStudentById,
  deriveCohortStats,
  deriveAtRiskAlerts,
  deriveUpcomingDeadlines,
  type CohortStats,
} from '@/lib/counsellor/data';
import type { CounsellorStudent } from '@/lib/counsellor/types';

// loadCohort is a whole-cohort load and every tool here starts from it — one
// multi-tool turn (or the execute endpoint's resume loop) would otherwise run
// it several times. Memoise per user with a short TTL, mirroring the 60s
// context cache; keyed by user (not globally) so it stays correct if the
// counsellor RLS posture is ever tightened per-user.
const COHORT_TTL_MS = 60_000;
const cohortCache = new Map<string, { at: number; students: CounsellorStudent[] }>();

/** Test hook, mirroring cache.ts's __resetContextCache. */
export const __resetCohortCache = (): void => {
  cohortCache.clear();
};

async function loadCohortCached(ctx: ToolContext): Promise<CounsellorStudent[]> {
  const hit = cohortCache.get(ctx.userId);
  if (hit && Date.now() - hit.at < COHORT_TTL_MS) return hit.students;
  const students = await loadCohort(ctx.supabase as CohortClient);
  cohortCache.set(ctx.userId, { at: Date.now(), students });
  if (cohortCache.size > 100) {
    const oldest = [...cohortCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cohortCache.delete(oldest[0]);
  }
  return students;
}

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
      const students = await loadCohortCached(ctx);
      const stats = deriveCohortStats(students);
      const atRisk = deriveAtRiskAlerts(students)
        .slice(0, 10)
        .map((a) => ({
          id: a.studentId,
          name: a.studentName,
          flag: a.flagEmoji,
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
  toWidgets: (result): ChatWidget[] | null => {
    const stats = (result as { stats?: CohortStats }).stats;
    if (!stats) return null;

    // ≤8 tiles: the four headline health numbers, then match-tier spread and the
    // submitted-application count — a readable snapshot without dumping the funnel.
    const statTiles: StatHit[] = [
      { label: 'Students', value: String(stats.total) },
      { label: 'Avg completion', value: `${stats.avgCompletion}%` },
      { label: 'Flagged', value: String(stats.flagged), tone: stats.flagged > 0 ? 'warning' : 'neutral' },
      { label: 'Due this week', value: String(stats.deadlinesThisWeek) },
      { label: 'Reach', value: String(stats.matchTiers.reach) },
      { label: 'Match', value: String(stats.matchTiers.match) },
      { label: 'Safe', value: String(stats.matchTiers.safe) },
      { label: 'Submitted', value: String(stats.appFunnel.submitted) },
    ];

    const widgets: ChatWidget[] = [{ kind: 'cohort_stats', items: statTiles }];

    const atRisk = (result as { atRisk?: AtRiskWidgetRow[] }).atRisk ?? [];
    if (atRisk.length > 0) {
      widgets.push({
        kind: 'at_risk',
        items: atRisk.map((a) => ({
          id: a.id,
          name: a.name,
          flag: a.flag,
          urgency: a.urgency,
          reason: a.reason,
        })),
      });
    }
    return widgets;
  },
};

type AtRiskWidgetRow = {
  id: string;
  name: string;
  flag?: string;
  urgency: 'critical' | 'high' | 'medium';
  reason: string;
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
        const cohort = await loadCohortCached(ctx);
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
      const students = await loadCohortCached(ctx);
      const deadlines = deriveUpcomingDeadlines(students, withinDays).map((d) => ({
        studentId: d.studentId,
        studentName: d.studentName,
        studentFlag: d.studentFlag,
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
  toWidgets: (result): ChatWidget[] | null => {
    const rows = (result as { deadlines?: DeadlineWidgetRow[] }).deadlines ?? [];
    if (rows.length === 0) return null;
    return [
      {
        kind: 'deadlines',
        items: rows.map((d) => ({
          label: d.program,
          university: d.university,
          studentName: d.studentName,
          studentFlag: d.studentFlag,
          date: d.date,
          daysUntil: d.daysUntil,
          type: d.type,
        })),
      },
    ];
  },
};

type DeadlineWidgetRow = {
  studentName: string;
  studentFlag: string;
  university: string;
  program: string;
  date: string;
  type: string;
  daysUntil: number;
};

export const COUNSELLOR_READ_TOOLS: ReadTool[] = [
  getCohortOverview,
  getStudentOverview,
  getCohortDeadlines,
];
