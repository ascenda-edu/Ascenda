// Parent data-access layer — assembles the /parent section's read-scoped view
// of ONE linked child's journey. Domain types live in features/parent/model/types.ts.
//
// SCOPING (the hard requirement): every loader takes a childId that must come
// from resolveLinkedChildIds() below — the single place parent→child access is
// decided. It reads guardian_links and NEVER falls back to the cohort: no
// links → empty portal, not all students.
//
// Launch posture: this is an application-layer boundary. The DB still carries
// the counsellor-open policies (20260712130000), so RLS alone would let any
// signed-in user read any student. Phase 2 keys can_act_as_parent() RLS on
// guardian_links and unwinds the open policy — see the migration header
// (20260716120000_guardian_links.sql).
//
// guardian_links postdates the generated database.ts, so its queries cast
// through `any` (same pattern as lib/counsellor/data.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { buildStepCompletion, COMPLETION_COLUMNS, type ProfileRecordGroup } from '@/lib/profile/completion';
import { PROFILE_STEPS } from '@/lib/profile/steps';
import { daysUntil } from '@/lib/utils/dates';
import { nameMap } from '@/lib/counsellor/data';
import { loadApplicationBoard, loadTierByProgram } from '@/lib/data/applications';
import { APPLICATION_SUMMARY_SELECT, type ApplicationBoardRow, type ApplicationSummaryRow } from '@/lib/data/columns';
// The three hand-copied `unwrap` definitions (here, counsellor/data.ts,
// counsellor/decks.ts) collapse into this one. Same disposition as before —
// throw, so a dropped policy or network failure surfaces in the parent
// section's error boundary rather than rendering as "all caught up" — but the
// thrown DataError no longer interpolates the driver's message, which named
// tables and policies. The detail goes to the structured log instead.
import { unwrap } from '@/lib/data/errors';
import type {
  ChildApplication,
  ChildApplicationStatus,
  ChildDeadline,
  ChildOverview,
  LinkedChild,
  ParentRelationship,
  ParentThread,
  ProgrammeCostLine,
} from '../model/types';

type Client = SupabaseClient<Database>;

const asRelationship = (value: string | null | undefined): ParentRelationship =>
  value === 'Mother' || value === 'Father' ? value : 'Guardian';

// ── the scoping seam ─────────────────────────────────────────────────────────

/** The ONLY place parent→child access is decided. Reads guardian_links for the
 * signed-in parent; an empty result means an empty portal — never the cohort. */
export const resolveLinkedChildIds = async (
  supabase: Client,
  parentUserId: string
): Promise<string[]> => {
  const rows = (unwrap(
    await (supabase as any)
      .from('guardian_links')
      .select('student_profile_id, status')
      .eq('parent_profile_id', parentUserId)
      .eq('status', 'active'),
    'parent.guardian_links'
  ) ?? []) as Array<{ student_profile_id: string }>;
  return [...new Set(rows.map((r) => r.student_profile_id))];
};

/** Linked children with names/flags for the child switcher. Same scoping as
 * resolveLinkedChildIds — one query over guardian_links, names via nameMap. */
export const loadLinkedChildren = async (
  supabase: Client,
  parentUserId: string
): Promise<LinkedChild[]> => {
  const rows = (unwrap(
    await (supabase as any)
      .from('guardian_links')
      .select('student_profile_id, relationship, status')
      .eq('parent_profile_id', parentUserId)
      .eq('status', 'active'),
    'parent.guardian_links'
  ) ?? []) as Array<{ student_profile_id: string; relationship: string | null }>;
  if (rows.length === 0) return [];

  const names = await nameMap(supabase, rows.map((r) => r.student_profile_id));
  return rows.map((r): LinkedChild => {
    const resolved = names.get(r.student_profile_id);
    const name = resolved?.name ?? 'Student';
    return {
      profileId: r.student_profile_id,
      name,
      firstName: name.split(/\s+/)[0] ?? name,
      flagEmoji: resolved?.flag ?? '🎓',
      relationship: asRelationship(r.relationship),
    };
  });
};

/** Pick the active child: the requested id when it's linked, else the first
 * linked child. Guarantees the returned child came from guardian_links. */
export const pickActiveChild = (
  children: LinkedChild[],
  requestedId?: string | null
): LinkedChild | null =>
  children.find((c) => c.profileId === requestedId) ?? children[0] ?? null;

// ── shared child queries ─────────────────────────────────────────────────────
//
// This file used to declare its own `AppRecord` interface and its own copy of
// the nested applications query, with a comment claiming it was the "same shape
// the student board uses". It was not: it omitted `notes`, `level` and the
// checklist's `application_id`, so a parent and their child were reading two
// different versions of the same row. Both now call `loadApplicationBoard`,
// which owns the one select string and the one row type.

const safeDaysUntil = (value?: string | null): number | null => {
  if (!value) return null;
  const days = daysUntil(value);
  return Number.isNaN(days) ? null : days;
};

const deadlinesFromApps = (apps: ApplicationBoardRow[]): ChildDeadline[] => {
  const out: ChildDeadline[] = [];
  for (const app of apps) {
    for (const d of app.program?.deadlines ?? []) {
      if (!d.deadline_date) continue;
      out.push({
        id: `${app.id}-${d.id}`,
        university: app.program?.universities?.name ?? 'University',
        program: app.program?.name ?? 'Programme',
        name: d.name,
        date: d.deadline_date,
        intake: d.intake ?? null,
        daysUntil: daysUntil(d.deadline_date),
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
};

// ── overview (the /parent landing page) ──────────────────────────────────────

const PIPELINE_STAGES: Array<{ key: ChildApplicationStatus; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'decision', label: 'Awaiting decision' },
  { key: 'enrolled', label: 'Enrolled' },
];

export const loadChildOverview = async (
  supabase: Client,
  child: LinkedChild
): Promise<ChildOverview> => {
  const childId = child.profileId;
  const [apps, personalRes, academicRes, lifestyleRes, subjectsRes, noteRes] = await Promise.all([
    loadApplicationBoard(supabase, childId),
    supabase
      .from('student_personal_information')
      .select(COMPLETION_COLUMNS.personal)
      .eq('profile_id', childId)
      .maybeSingle(),
    // COMPLETION_COLUMNS, not a hand-written list: omitting `english_status`
    // is what capped a "Not sure" English answer at 80% and locked students out
    // of the app from middleware. See the constant's own docblock.
    supabase
      .from('student_academic_input')
      .select(COMPLETION_COLUMNS.academicInput)
      .eq('profile_id', childId)
      .maybeSingle(),
    supabase
      .from('student_lifestyle_preference')
      .select(COMPLETION_COLUMNS.lifestyle)
      .eq('profile_id', childId)
      .maybeSingle(),
    supabase.from('student_subjects').select('id', { count: 'exact', head: true }).eq('profile_id', childId),
    (supabase as any)
      .from('counsellor_notes')
      .select('body, created_at')
      .eq('student_profile_id', childId)
      .in('note_type', ['session', 'update'])
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  // Profile completion — same helper the student dashboard uses.
  const records: ProfileRecordGroup = {
    personal: unwrap(personalRes, 'parent.student_personal_information'),
    academicInput: unwrap(academicRes, 'parent.student_academic_input'),
    subjectCount: subjectsRes.count ?? 0,
    lifestyle: unwrap(lifestyleRes, 'parent.student_lifestyle_preference'),
  };
  const stepCompletion = buildStepCompletion(records);
  const profileSteps = PROFILE_STEPS.map((step) => ({
    key: step.key,
    title: step.title,
    done: stepCompletion[step.key],
  }));
  const completionPercent = Math.round(
    (profileSteps.filter((s) => s.done).length / PROFILE_STEPS.length) * 100
  );

  // Pipeline + tasks — same derivations as the student dashboard.
  const pipeline = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: apps.filter((a) => a.status === stage.key).length,
  }));
  const submittedCount = apps.filter(
    (a) => a.status === 'submitted' || a.status === 'decision' || a.status === 'enrolled'
  ).length;

  const allTasks = apps.flatMap((a) => a.application_checklist ?? []);
  const openTasks = allTasks.filter((t) => t.status !== 'done');
  const overdueTasks = openTasks.filter((t) => {
    const days = safeDaysUntil(t.due_date);
    return days !== null && days < 0;
  }).length;
  const dueThisWeek = openTasks.filter((t) => {
    const days = safeDaysUntil(t.due_date);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  const deadlines = deadlinesFromApps(apps);
  const upcoming = deadlines.filter((d) => d.daysUntil >= 0);

  const noteRows = (unwrap(noteRes, 'parent.counsellor_notes') ?? []) as Array<{
    body: string;
    created_at: string;
  }>;

  return {
    child,
    pipeline,
    applicationsTotal: apps.length,
    submittedCount,
    openTasks: openTasks.length,
    overdueTasks,
    dueThisWeek,
    completionPercent,
    profileSteps,
    nextDeadline: upcoming[0] ?? null,
    upcomingDeadlines: upcoming.slice(0, 5),
    latestCounsellorNote: noteRows[0]
      ? { body: noteRows[0].body, date: noteRows[0].created_at }
      : null,
  };
};

// ── progress (/parent/progress) ──────────────────────────────────────────────

export const loadChildProgress = async (
  supabase: Client,
  childId: string
): Promise<ChildApplication[]> => {
  const apps = await loadApplicationBoard(supabase, childId);
  if (apps.length === 0) return [];
  const tierByProgram = await loadTierByProgram(
    supabase,
    childId,
    apps.map((a) => a.program_id)
  );

  return apps.map((app): ChildApplication => {
    const tasks = app.application_checklist ?? [];
    const earliestDeadline = (app.program?.deadlines ?? [])
      .map((d) => d.deadline_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    return {
      id: app.id,
      university: app.program?.universities?.name ?? 'University',
      program: app.program?.name ?? 'Programme',
      country: app.program?.universities?.country ?? 'UK',
      status: app.status,
      tier: tierByProgram.get(app.program_id) ?? null,
      daysUntilDeadline: safeDaysUntil(earliestDeadline ?? null),
      tasksOpen: tasks.filter((t) => t.status !== 'done').length,
      tasksTotal: tasks.length,
    };
  });
};

// ── deadlines (/parent/deadlines) ────────────────────────────────────────────

export const loadChildDeadlines = async (
  supabase: Client,
  childId: string
): Promise<ChildDeadline[]> => {
  const apps = await loadApplicationBoard(supabase, childId);
  return deadlinesFromApps(apps);
};

// ── finances (/parent/finances) ──────────────────────────────────────────────
//
// Cost lines come from the child's APPLICATIONS — the shortlist is client-side
// localStorage (see shortlist-store.ts) and can't be read server-side.

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

export const loadChildFinances = async (
  supabase: Client,
  childId: string
): Promise<ProgrammeCostLine[]> => {
  // Deliberately NOT the board shape: cost lines resolve a much wider `programs`
  // row below, so the embed would be fetched and thrown away.
  const apps = unwrap(
    await supabase.from('applications').select(APPLICATION_SUMMARY_SELECT).eq('profile_id', childId),
    'parent.applications'
  ) as ApplicationSummaryRow[] | null;
  const appRows = apps ?? [];
  if (appRows.length === 0) return [];

  const programIds = [...new Set(appRows.map((a) => a.program_id))].filter(Boolean);
  const [tierByProgram, programRes] = await Promise.all([
    loadTierByProgram(supabase, childId, programIds),
    supabase
      .from('programs')
      .select(
        `
        id,
        course_name,
        tuition_fees_international,
        yearly_international_tuition_fee_gbp,
        student_dorm_cost_gbp_per_year_override,
        average_rent_outside_campus_gbp_per_month_override,
        average_starting_salary_gbp_override,
        universities(name, country, average_starting_salary_gbp, graduate_employment_rate_pct)
      `
      )
      .in('id', programIds),
  ]);

  const programById = new Map<string, any>(
    ((unwrap(programRes, 'parent.programs') ?? []) as any[]).map((row) => [row.id, row])
  );

  return appRows
    .map((app): ProgrammeCostLine | null => {
      const program = programById.get(app.program_id);
      if (!program) return null;
      const uni = Array.isArray(program.universities) ? program.universities[0] : program.universities;
      return {
        programId: app.program_id,
        university: uni?.name ?? 'University',
        program: program.course_name ?? 'Programme',
        country: uni?.country ?? 'UK',
        status: app.status,
        tier: tierByProgram.get(app.program_id) ?? null,
        tuitionGbp: toNumber(program.yearly_international_tuition_fee_gbp),
        tuitionRaw: program.tuition_fees_international ?? null,
        dormGbp: toNumber(program.student_dorm_cost_gbp_per_year_override),
        rentMonthlyGbp: toNumber(program.average_rent_outside_campus_gbp_per_month_override),
        startingSalaryGbp:
          toNumber(program.average_starting_salary_gbp_override) ??
          toNumber(uni?.average_starting_salary_gbp),
        graduateEmploymentPct: toNumber(uni?.graduate_employment_rate_pct),
      };
    })
    .filter((line): line is ProgrammeCostLine => line !== null);
};

// ── messages (/parent/messages) ──────────────────────────────────────────────
//
// Reads the parent_contacts / parent_messages tables, scoped to the active
// child's contact row. There is currently no counsellor-facing UI for these
// threads — messages sent here are stored but only visible on the parent side.

export const loadChildThread = async (
  supabase: Client,
  childId: string
): Promise<ParentThread | null> => {
  const contacts = (unwrap(
    await (supabase as any)
      .from('parent_contacts')
      .select('id, parent_name, relationship, status, created_at')
      .eq('student_profile_id', childId)
      .order('created_at', { ascending: true })
      .limit(1),
    'parent.parent_contacts'
  ) ?? []) as Array<{
    id: string;
    parent_name: string;
    relationship: string | null;
    status: 'active' | 'needs-response' | 'resolved';
  }>;
  const contact = contacts[0];
  if (!contact) return null;

  const messages = (unwrap(
    await (supabase as any)
      .from('parent_messages')
      .select('id, sender, body, template, read_at, created_at')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: true }),
    'parent.parent_messages'
  ) ?? []) as Array<{
    id: string;
    sender: 'counsellor' | 'parent';
    body: string;
    template: string | null;
    read_at: string | null;
    created_at: string;
  }>;

  return {
    contactId: contact.id,
    parentName: contact.parent_name,
    relationship: asRelationship(contact.relationship),
    status: contact.status,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      content: m.body,
      date: m.created_at,
      read: Boolean(m.read_at),
      template: m.template,
    })),
  };
};
