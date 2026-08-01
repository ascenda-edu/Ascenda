/**
 * Select-column constants, and the row shapes they produce.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/lib/profile/completion.ts` exports `COMPLETION_COLUMNS` because two
 * callers hand-wrote a narrower column list, one of them left out
 * `english_status`, and the missing column silently changed the ANSWER rather
 * than failing: students who answered "Not sure" were bounced to the onboarding
 * wizard from every protected route while their dashboard read 100% complete.
 *
 * This module generalises that lesson. The nested applications query was
 * written out FOUR times with four different column lists:
 *
 *   app/applications/page.tsx        notes, level, deadlines, checklist+application_id
 *   lib/parent/data.ts               no notes, no level, checklist without application_id
 *   lib/chat/context.ts              no program id, no intake, checklist without id
 *   app/applications/documents/…     id + programme label only
 *
 * — and the parent copy described itself in a comment as "same shape the
 * student board uses", which it was not. A parent and their child were looking
 * at two different readings of the same row.
 *
 * All four now call `lib/data/applications.ts`, as do the three chat modules
 * found during the migration (`lib/chat/context.ts` and the assistant's
 * `student-read` / `student-write` tools, which between them held a fifth and
 * sixth spelling). The allowlist in `__tests__/data/call-sites.test.ts` is down
 * to this file, and may only shrink.
 *
 * A column list is part of a query's meaning, not an optimisation. There are
 * three genuinely different read shapes below (a board needs deadlines, a label
 * does not), so there are three constants — but all three are BUILT FROM the
 * same fragments, so the programme embed is one string in one place and cannot
 * diverge. Adding a column to `PROGRAMME_FIELDS` adds it everywhere at once.
 *
 * The row types are `Pick<>`s over the generated `Database` rows (see
 * `./types.ts`). They are never hand-written in parallel — hand-written row
 * interfaces are exactly the drift this module removes.
 */

import type { Row } from './types';

/* -------------------------------------------------------------------------- */
/* fragments — the shared halves of every select below                         */
/* -------------------------------------------------------------------------- */

/** The university embed under a programme. */
export const UNIVERSITY_FIELDS = 'universities(name,country)' as const;

/**
 * The programme embed, aliased the way every consumer already reads it:
 * `course_name` → `name`, `study_level` → `level`. `id` is included even where
 * a page only renders the label, because the alternative is a fourth variant
 * of this string.
 */
export const PROGRAMME_FIELDS = `id,name:course_name,level:study_level,${UNIVERSITY_FIELDS}` as const;

/** Deadlines under a programme. Only the board shape needs these. */
export const DEADLINE_FIELDS = 'deadlines(id,name,deadline_date,intake,program_id)' as const;

/**
 * The application's checklist. `application_id` is included in every shape:
 * the student board needs it to route a task back to its application, and
 * omitting it elsewhere was one of the four divergences.
 */
export const CHECKLIST_FIELDS =
  'application_checklist(id,task_name,status,due_date,application_id)' as const;

/* -------------------------------------------------------------------------- */
/* select strings                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The full application board shape: status + notes + programme + deadlines +
 * checklist. Used by the student board (`/applications`) AND the parent portal,
 * which is the point — they must read the same row the same way.
 */
export const APPLICATION_BOARD_SELECT =
  `id,status,notes,program_id,program:programs(${PROGRAMME_FIELDS},${DEADLINE_FIELDS}),${CHECKLIST_FIELDS}` as const;

/**
 * Applications with their tasks but without the deadlines embed — the task
 * tracker groups by application and never reads a programme deadline.
 */
export const APPLICATION_TASKS_SELECT =
  `id,status,program_id,program:programs(${PROGRAMME_FIELDS}),${CHECKLIST_FIELDS}` as const;

/** Just enough to render "University · Programme" for an application picker. */
export const APPLICATION_LABEL_SELECT = `id,program:programs(${PROGRAMME_FIELDS})` as const;

/**
 * The application row with no embeds at all — for callers that resolve
 * programme data themselves (the parent portal's cost lines fetch a much wider
 * `programs` row than any board needs).
 */
export const APPLICATION_SUMMARY_SELECT = 'id,status,program_id' as const;

/**
 * `student_matches` carries the Reach/Match/Safe tier inside `breakdown` JSON.
 * This lookup was written three times (student board, parent portal, counsellor
 * data); this is the one column list for it.
 */
export const MATCH_TIER_SELECT = 'program_id,breakdown' as const;

/** Uploaded application documents. */
export const DOCUMENT_SELECT = 'id,name,type,storage_path,uploaded_at,application_id' as const;

/* -------------------------------------------------------------------------- */
/* row shapes — derived from the generated schema, never hand-written          */
/* -------------------------------------------------------------------------- */

type ApplicationRow = Row<'applications'>;
type ProgramRow = Row<'programs'>;

/** Matches `UNIVERSITY_FIELDS`. */
export type UniversityEmbed = Pick<Row<'universities'>, 'name' | 'country'>;

/** Matches `DEADLINE_FIELDS`. */
export type DeadlineEmbed = Pick<
  Row<'deadlines'>,
  'id' | 'name' | 'deadline_date' | 'intake' | 'program_id'
>;

/** Matches `CHECKLIST_FIELDS`. */
export type ChecklistEmbed = Pick<
  Row<'application_checklist'>,
  'id' | 'task_name' | 'status' | 'due_date' | 'application_id'
>;

/**
 * Matches `PROGRAMME_FIELDS`. The two aliased columns take their type from the
 * column they alias, so renaming or re-typing `programs.course_name` is a
 * compile error here rather than a runtime `undefined` in a heading.
 */
export interface ProgrammeEmbed {
  id: ProgramRow['id'];
  name: ProgramRow['course_name'];
  level: ProgramRow['study_level'];
  universities: UniversityEmbed | null;
}

/** `PROGRAMME_FIELDS` + `DEADLINE_FIELDS`. */
export interface ProgrammeWithDeadlinesEmbed extends ProgrammeEmbed {
  deadlines: DeadlineEmbed[] | null;
}

/** The row `APPLICATION_BOARD_SELECT` returns. */
export interface ApplicationBoardRow {
  id: ApplicationRow['id'];
  status: ApplicationRow['status'];
  notes: ApplicationRow['notes'];
  program_id: ApplicationRow['program_id'];
  program: ProgrammeWithDeadlinesEmbed | null;
  application_checklist: ChecklistEmbed[] | null;
}

/** The row `APPLICATION_TASKS_SELECT` returns. */
export interface ApplicationTasksRow {
  id: ApplicationRow['id'];
  status: ApplicationRow['status'];
  program_id: ApplicationRow['program_id'];
  program: ProgrammeEmbed | null;
  application_checklist: ChecklistEmbed[] | null;
}

/** The row `APPLICATION_LABEL_SELECT` returns. */
export interface ApplicationLabelRow {
  id: ApplicationRow['id'];
  program: ProgrammeEmbed | null;
}

/** The row `APPLICATION_SUMMARY_SELECT` returns. */
export type ApplicationSummaryRow = Pick<ApplicationRow, 'id' | 'status' | 'program_id'>;

/** The row `MATCH_TIER_SELECT` returns. */
export type MatchTierRow = Pick<Row<'student_matches'>, 'program_id' | 'breakdown'>;

/** The row `DOCUMENT_SELECT` returns. */
export type DocumentRow = Pick<
  Row<'documents'>,
  'id' | 'name' | 'type' | 'storage_path' | 'uploaded_at' | 'application_id'
>;
