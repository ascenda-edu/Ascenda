import type {
  RequirementCategory,
  RequirementRow,
  SandboxApplication
} from '@/lib/data/student-demo-data';
import { DEMO_COUNSELLOR } from '@/lib/demo/counsellor';

const CATEGORY_FALLBACK: Record<RequirementCategory, string> = {
  subjects: 'subject planning',
  exams: 'the entrance exam prep',
  interviews: 'the interview prep',
  documents: 'getting the supporting documents together',
  essays: 'the personal statement / essays'
};

const nextStepFromRequirement = (requirement?: RequirementRow): string | null => {
  if (!requirement) return null;
  const open = requirement.cells.find(
    (cell) => cell.status === 'missing' || cell.status === 'in-progress'
  );
  if (!open) return null;
  if (open.detail && open.detail.trim().length) return open.detail.toLowerCase();
  return CATEGORY_FALLBACK[open.category];
};

export const draftMessageForApplication = (
  app: SandboxApplication,
  requirement?: RequirementRow
): { subject: string; body: string } => {
  const stuckOn = nextStepFromRequirement(requirement);
  const progress = requirement?.progress ?? 0;

  const subject = `Help with my ${app.university} application`;

  const lines = [
    `Hi ${DEMO_COUNSELLOR.firstName},`,
    '',
    `I'm working on my ${app.university} application (${app.program}). ${
      progress > 0 ? `I'm about ${progress}% through the requirements` : "I'm just getting started"
    }${stuckOn ? ` and I'm stuck on ${stuckOn}.` : '.'}`,
    '',
    'Could we book a 15-minute call this week to talk it through?',
    '',
    'Thanks,',
    'Greg'
  ];

  return { subject, body: lines.join('\n') };
};
