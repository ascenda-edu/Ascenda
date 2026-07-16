// Parent data-access layer — assembles the /parent section's read-scoped view
// of ONE linked child's journey. Domain types live in src/lib/parent/types.ts.
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
import { buildStepCompletion, type ProfileRecordGroup } from '@/lib/profile/completion';
import { PROFILE_STEPS } from '@/lib/profile/steps';
import { daysUntil } from '@/lib/utils/dates';
import { nameMap } from '@/lib/counsellor/data';
import type {
  ChildApplication,
  ChildApplicationStatus,
  ChildDeadline,
  ChildOverview,
  LinkedChild,
  MatchTier,
  ParentRelationship,
  ParentThread,
  ProgrammeCostLine,
} from '@/lib/parent/types';

type Client = SupabaseClient<Database>;

// Throw instead of silently treating a failed query as an empty table — a
// dropped policy or network failure must surface in the parent section's
// error boundary, not render as "all caught up".
const unwrap = <T,>(
  res: { data: T | null; error: { message?: string } | null },
  label: string
): T | null => {
  if (res.error) {
    throw new Error(`parent data: ${label} query failed — ${res.error.message ?? 'unknown error'}`);
  }
  return res.data;
};

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
    'guardian_links'
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
    'guardian_links'
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

type AppRecord = {
  id: string;
  status: string;
  program_id: string;
  program?: {
    id: string;
    name?: string | null;
    universities?: { name?: string | null; country?: string | null } | null;
    deadlines?: Array<{
      id: string;
      name: string;
      deadline_date?: string | null;
      intake?: string | null;
      program_id: string;
    }> | null;
  } | null;
  application_checklist?: Array<{
    id: string;
    task_name: string;
    status: 'todo' | 'doing' | 'done';
    due_date?: string | null;
  }> | null;
};

// Nested applications query — same shape the student board uses
// (src/app/applications/page.tsx), scoped to the linked child.
const fetchChildApplications = async (supabase: Client, childId: string): Promise<AppRecord[]> => {
  const rows = unwrap(
    await supabase
      .from('applications')
      .select(
        `
        id,
        status,
        program_id,
        program:programs(
          id,
          name:course_name,
          universities(name,country),
          deadlines(id, name, deadline_date, intake, program_id)
        ),
        application_checklist(id, task_name, status, due_date)
      `
      )
      .eq('profile_id', childId),
    'applications'
  );
  return ((rows ?? []) as unknown as AppRecord[]) ?? [];
};

const fetchTierByProgram = async (
  supabase: Client,
  childId: string,
  programIds: string[]
): Promise<Map<string, MatchTier>> => {
  const map = new Map<string, MatchTier>();
  if (programIds.length === 0) return map;
  const rows = (unwrap(
    await supabase
      .from('student_matches')
      .select('program_id, breakdown')
      .eq('profile_id', childId)
      .in('program_id', programIds),
    'student_matches'
  ) ?? []) as Array<{ program_id: string; breakdown: Record<string, unknown> | null }>;
  for (const row of rows) {
    const tier = row.breakdown?.tier;
    if (tier === 'Reach' || tier === 'Match' || tier === 'Safe') map.set(row.program_id, tier);
  }
  return map;
};

const safeDaysUntil = (value?: string | null): number | null => {
  if (!value) return null;
  const days = daysUntil(value);
  return Number.isNaN(days) ? null : days;
};

const deadlinesFromApps = (apps: AppRecord[]): ChildDeadline[] => {
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
    fetchChildApplications(supabase, childId),
    supabase
      .from('student_personal_information')
      .select('first_name,last_name,email,nationality,resident_country')
      .eq('profile_id', childId)
      .maybeSingle(),
    supabase
      .from('student_academic_input')
      .select('programme_type,school_name,school_country,graduation_year,intended_clusters,english_required')
      .eq('profile_id', childId)
      .maybeSingle(),
    supabase
      .from('student_lifestyle_preference')
      .select('extracurricular_interests')
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
    personal: unwrap(personalRes, 'student_personal_information'),
    academicInput: unwrap(academicRes, 'student_academic_input'),
    subjectCount: subjectsRes.count ?? 0,
    lifestyle: unwrap(lifestyleRes, 'student_lifestyle_preference'),
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

  const noteRows = (unwrap(noteRes, 'counsellor_notes') ?? []) as Array<{
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
  const apps = await fetchChildApplications(supabase, childId);
  if (apps.length === 0) return [];
  const tierByProgram = await fetchTierByProgram(
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
      status: app.status as ChildApplicationStatus,
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
  const apps = await fetchChildApplications(supabase, childId);
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
  const apps = unwrap(
    await supabase
      .from('applications')
      .select('id, status, program_id')
      .eq('profile_id', childId),
    'applications'
  ) as Array<{ id: string; status: string; program_id: string }> | null;
  const appRows = apps ?? [];
  if (appRows.length === 0) return [];

  const programIds = [...new Set(appRows.map((a) => a.program_id))].filter(Boolean);
  const [tierByProgram, programRes] = await Promise.all([
    fetchTierByProgram(supabase, childId, programIds),
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
    ((unwrap(programRes, 'programs') ?? []) as any[]).map((row) => [row.id, row])
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
        status: app.status as ChildApplicationStatus,
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
// Reuses the existing parent_contacts / parent_messages tables (the counsellor
// side of the same thread lives at /counsellor/parents). Scoped to the active
// child's contact row.

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
    'parent_contacts'
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
    'parent_messages'
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
