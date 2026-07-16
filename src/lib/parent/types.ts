// Domain types for the parent portal (/parent).
//
// The parent section is a read-scoped mirror of one linked child's journey:
// progress, deadlines, finances, and the counsellor message thread. Data
// assembly lives in src/lib/parent/data.ts; everything here is pure types.

import type { MatchTier } from '@/lib/counsellor/types';

export type { MatchTier };

export type ParentRelationship = 'Mother' | 'Father' | 'Guardian';

/** A child the signed-in parent is linked to (guardian_links row + name). */
export interface LinkedChild {
  profileId: string;
  name: string;
  firstName: string;
  flagEmoji: string;
  relationship: ParentRelationship;
}

/** Application pipeline status — mirrors the student-side enum. */
export type ChildApplicationStatus = 'planning' | 'in_progress' | 'submitted' | 'decision' | 'enrolled';

export interface ChildApplication {
  id: string;
  university: string;
  program: string;
  country: string;
  status: ChildApplicationStatus;
  tier: MatchTier | null;
  daysUntilDeadline: number | null;
  tasksOpen: number;
  tasksTotal: number;
}

export interface ChildDeadline {
  id: string;
  university: string;
  program: string;
  name: string;
  /** Date-only string (YYYY-MM-DD) — always render via parseLocalDate. */
  date: string;
  intake: string | null;
  daysUntil: number;
}

export interface ChildProfileStep {
  key: string;
  title: string;
  done: boolean;
}

/** The overview snapshot the /parent landing page renders. */
export interface ChildOverview {
  child: LinkedChild;
  pipeline: Array<{ key: ChildApplicationStatus; label: string; count: number }>;
  applicationsTotal: number;
  submittedCount: number;
  openTasks: number;
  overdueTasks: number;
  dueThisWeek: number;
  completionPercent: number;
  profileSteps: ChildProfileStep[];
  nextDeadline: ChildDeadline | null;
  upcomingDeadlines: ChildDeadline[];
  latestCounsellorNote: { body: string; date: string } | null;
}

/** One programme's cost picture for /parent/finances. GBP-native; the UI
 * converts to the parent's home currency via lib/parent/currency. */
export interface ProgrammeCostLine {
  programId: string;
  university: string;
  program: string;
  country: string;
  status: ChildApplicationStatus;
  tier: MatchTier | null;
  /** Yearly international tuition in GBP (best available field). */
  tuitionGbp: number | null;
  /** Raw provider tuition string (e.g. "£24,500 per year") as fallback display. */
  tuitionRaw: string | null;
  /** Dorm cost per year, GBP. */
  dormGbp: number | null;
  /** Rent outside campus per month, GBP. */
  rentMonthlyGbp: number | null;
  /** Average starting salary, GBP (programme override else university). */
  startingSalaryGbp: number | null;
  graduateEmploymentPct: number | null;
}

export interface ParentThreadMessage {
  id: string;
  sender: 'counsellor' | 'parent';
  content: string;
  date: string;
  read: boolean;
  template: string | null;
}

export interface ParentThread {
  contactId: string;
  parentName: string;
  relationship: ParentRelationship;
  status: 'active' | 'needs-response' | 'resolved';
  messages: ParentThreadMessage[];
}
