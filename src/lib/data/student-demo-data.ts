// ─── Student Demo Data (DEMO FIXTURES — deliberate seam) ─────────────────────
// Static fixture data that intentionally backs the demo-stage sections instead
// of Supabase queries. Consumed by: the entire Toolbox area (/toolbox, chances,
// requirements, timeline, essay-workshop), dashboard widgets (outcome-tracker,
// deadline-nudges), and some counsellor tabs. When one of these features gets a
// real data layer, migrate its consumers off this file — see docs/architecture.md
// ("Demo posture") for the full seam map.
// Demo student: "Alex Morgan" — IB student interested in Business → Engineering.

// ─── Date helper (same pattern as counsellor-dummy-data.ts) ──────────────────

function relDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type EvolutionCategory = 'interest' | 'goal' | 'achievement' | 'milestone' | 'counsellor_note';
export type EvolutionSource = 'student' | 'counsellor' | 'system';

export interface EvolutionEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  category: EvolutionCategory;
  source: EvolutionSource;
}

export type BlockCategory = 'experience' | 'strength' | 'interest' | 'achievement' | 'identity' | 'counsellor_insight';
export type BlockSource = 'profile' | 'counsellor' | 'chatbot';

export interface EssayBuildingBlock {
  id: string;
  label: string;
  category: BlockCategory;
  source: BlockSource;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ascendi';
  content: string;
  timestamp: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}

export type RecLetterStatus = 'draft' | 'requested' | 'writing' | 'signed' | 'uploaded';

export interface RecLetterRequest {
  id: string;
  teacherName: string;
  teacherEmail: string;
  subject: string;
  relationship: string;
  status: RecLetterStatus;
  requestedDate?: string;
  completedDate?: string;
  universities: string[];
}

export type SandboxPlatform = 'UCAS' | 'Common App' | 'UC Application' | 'Coalition App' | 'Direct';
export type SandboxStatus = 'ready' | 'submitted' | 'confirmed';

export interface SandboxApplication {
  id: string;
  platform: SandboxPlatform;
  university: string;
  program: string;
  country: string;
  flagEmoji: string;
  status: SandboxStatus;
  submittedDate?: string;
}

// ─── Evolution Timeline Data ─────────────────────────────────────────────────

export const DEMO_EVOLUTION: EvolutionEntry[] = [
  {
    id: 'evo-1',
    date: relDate(-300),
    title: 'Profile created',
    description: 'Alex started his Ascenda journey. Initial interests: Business, Finance.',
    category: 'milestone',
    source: 'system'
  },
  {
    id: 'evo-2',
    date: relDate(-270),
    title: 'Interested in Business & Finance',
    description: 'Completed the matchmaking survey. Top cluster: Business Administration. Shortlisted LSE, Warwick, and Bocconi.',
    category: 'interest',
    source: 'student'
  },
  {
    id: 'evo-3',
    date: relDate(-240),
    title: 'Counsellor session: career exploration',
    description: 'Discussed career goals with counsellor. Alex shows strong analytical thinking — suggested exploring Engineering alongside Business.',
    category: 'counsellor_note',
    source: 'counsellor'
  },
  {
    id: 'evo-4',
    date: relDate(-200),
    title: 'Discovered passion for engineering',
    description: 'After joining the school engineering society, Alex realised he enjoys hands-on challenges more than pure theory.',
    category: 'interest',
    source: 'student'
  },
  {
    id: 'evo-5',
    date: relDate(-170),
    title: 'Switched primary interest to Engineering',
    description: 'Updated survey preferences. New top cluster: Mechanical Engineering. Still keeping Business as a secondary interest.',
    category: 'goal',
    source: 'student'
  },
  {
    id: 'evo-6',
    date: relDate(-140),
    title: 'IB mock results: 39 points',
    description: 'Strong performance in Physics HL (7) and Maths AA HL (6). Counsellor noted this opens doors to top Engineering programmes.',
    category: 'achievement',
    source: 'system'
  },
  {
    id: 'evo-7',
    date: relDate(-90),
    title: 'Counsellor session: university shortlist review',
    description: 'Refined shortlist to Imperial, ETH Zürich, TU Delft, and EPFL. Discussed personal statement angle: bridge between business thinking and engineering.',
    category: 'counsellor_note',
    source: 'counsellor'
  },
  {
    id: 'evo-8',
    date: relDate(-60),
    title: 'Personal statement first draft',
    description: 'Completed first draft focusing on the engineering society project and how it shifted his perspective from finance to engineering.',
    category: 'milestone',
    source: 'student'
  },
  {
    id: 'evo-9',
    date: relDate(-30),
    title: 'Confirmed final university list',
    description: 'Finalised 5 applications: Imperial (Reach), ETH Zürich (Reach), TU Delft (Match), EPFL (Match), University of Bath (Safe).',
    category: 'goal',
    source: 'student'
  },
  {
    id: 'evo-10',
    date: relDate(-7),
    title: 'First application submitted',
    description: 'Submitted UCAS application to Imperial College London — MEng Mechanical Engineering.',
    category: 'achievement',
    source: 'system'
  }
];

// ─── Essay Building Blocks ───────────────────────────────────────────────────

export const DEMO_BUILDING_BLOCKS: EssayBuildingBlock[] = [
  // Identity
  { id: 'bb-1', label: 'Multicultural upbringing', category: 'identity', source: 'profile', detail: 'Grew up across multiple countries — unique international perspective on problem-solving.' },
  { id: 'bb-2', label: 'Bilingual speaker', category: 'identity', source: 'profile', detail: 'Fluent in two languages. Can engage with diverse academic communities.' },
  { id: 'bb-3', label: 'IB Diploma student', category: 'identity', source: 'profile', detail: 'International Baccalaureate programme — demonstrates rigour and global mindset.' },

  // Experience
  { id: 'bb-4', label: 'Engineering society president', category: 'experience', source: 'profile', detail: 'Led a team of 8 to build an autonomous line-following robot for the national competition.' },
  { id: 'bb-5', label: 'Summer internship at tech startup', category: 'experience', source: 'chatbot', detail: 'Worked at a fintech startup — saw how engineering and business intersect first-hand.' },
  { id: 'bb-6', label: 'Volunteer maths tutor', category: 'experience', source: 'profile', detail: 'Tutored younger students in maths for 2 years, developing patience and communication skills.' },

  // Strengths
  { id: 'bb-7', label: 'Strong analytical thinker', category: 'strength', source: 'counsellor', detail: 'Counsellor noted: "Alex approaches problems methodically — rare for his age."' },
  { id: 'bb-8', label: 'Physics HL grade 7', category: 'strength', source: 'profile', detail: 'Top mark in Physics Higher Level — demonstrates aptitude for engineering fundamentals.' },
  { id: 'bb-9', label: 'Self-driven learner', category: 'strength', source: 'counsellor', detail: 'Independently taught himself CAD modelling over the summer break.' },
  { id: 'bb-10', label: 'Effective team leader', category: 'strength', source: 'chatbot', detail: 'Managed engineering team through tight competition deadlines while keeping morale high.' },

  // Interests
  { id: 'bb-11', label: 'Sustainable energy', category: 'interest', source: 'profile', detail: 'Passionate about renewable energy solutions — Extended Essay topic on solar panel efficiency.' },
  { id: 'bb-12', label: 'Formula 1 engineering', category: 'interest', source: 'chatbot', detail: 'Deep interest in F1 aerodynamics and how engineering pushes performance boundaries.' },
  { id: 'bb-13', label: 'Entrepreneurship', category: 'interest', source: 'profile', detail: 'Still drawn to the business side — wants to eventually start an engineering-led company.' },

  // Achievements
  { id: 'bb-14', label: 'National engineering finalist', category: 'achievement', source: 'profile', detail: 'Team placed 3rd at the 2025 National Engineering Challenge with an autonomous navigation project.' },
  { id: 'bb-15', label: 'IB predicted 39 points', category: 'achievement', source: 'profile', detail: 'Strong predicted score positioning for competitive Engineering programmes.' },
  { id: 'bb-16', label: 'Extended Essay grade A', category: 'achievement', source: 'profile', detail: 'Research paper on solar panel efficiency in different climate zones. Graded A by examiner.' },

  // Counsellor insights
  { id: 'bb-17', label: 'Bridge between business and engineering', category: 'counsellor_insight', source: 'counsellor', detail: 'Unique angle: Alex\'s journey from business interest to engineering gives him a narrative few applicants have.' },
  { id: 'bb-18', label: 'Strong personal growth arc', category: 'counsellor_insight', source: 'counsellor', detail: 'The shift from Business to Engineering shows self-awareness, curiosity, and willingness to change direction.' }
];

// ─── Chatbot Conversations ───────────────────────────────────────────────────

export const DEMO_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'conv-1',
    title: 'University selection advice',
    messages: [
      { id: 'msg-1-1', role: 'user', content: 'Hey Ascendi, I\'m not sure if I should apply to ETH Zürich. My IB predicted is 39 — is that competitive enough?', timestamp: relDate(-45) + 'T14:30:00' },
      { id: 'msg-1-2', role: 'ascendi', content: 'Great question, Alex! ETH Zürich typically looks for IB scores of 36+ for Engineering, so your 39 puts you in a strong position. Your Physics HL 7 is especially relevant for their programme. I\'d classify this as a Reach — competitive but definitely within range. Want me to compare it with your other shortlisted universities?', timestamp: relDate(-45) + 'T14:30:15' },
      { id: 'msg-1-3', role: 'user', content: 'Yes please! How does it compare to TU Delft and EPFL?', timestamp: relDate(-45) + 'T14:31:00' },
      { id: 'msg-1-4', role: 'ascendi', content: 'Here\'s a quick breakdown based on your profile:\n\n• **ETH Zürich** — Reach (score 82%). Strong fit academically, but highly competitive intake.\n• **EPFL** — Match (score 87%). Your bilingual abilities are a real advantage here.\n• **TU Delft** — Match (score 89%). Great practical engineering focus that aligns with your hands-on experience.\n\nAll three are excellent choices. Your shortlist has a healthy mix of Reach and Match schools.', timestamp: relDate(-45) + 'T14:31:20' },
      { id: 'msg-1-5', role: 'user', content: 'That\'s really helpful, thanks! I feel more confident about applying now.', timestamp: relDate(-45) + 'T14:32:00' },
      { id: 'msg-1-6', role: 'ascendi', content: 'You\'ve got a strong profile, Alex. Remember — your journey from Business to Engineering is a compelling story. Make sure that comes through in your personal statement! 🚀', timestamp: relDate(-45) + 'T14:32:10' }
    ]
  },
  {
    id: 'conv-2',
    title: 'Personal statement brainstorm',
    messages: [
      { id: 'msg-2-1', role: 'user', content: 'I\'m stuck on my personal statement opening. Any ideas?', timestamp: relDate(-35) + 'T10:00:00' },
      { id: 'msg-2-2', role: 'ascendi', content: 'Let\'s brainstorm! I can see from your profile that you have some powerful building blocks to work with. Here are three possible angles:\n\n1. **The pivot moment** — Start with the engineering society experience that made you switch from Business to Engineering.\n2. **The international perspective** — Open with your multicultural background and how it shaped your curiosity.\n3. **The problem-solver** — Lead with a specific engineering challenge you tackled and what it revealed about you.\n\nWhich resonates most with you?', timestamp: relDate(-35) + 'T10:00:20' },
      { id: 'msg-2-3', role: 'user', content: 'I like option 1 — the pivot moment. That feels most authentic to me.', timestamp: relDate(-35) + 'T10:01:00' },
      { id: 'msg-2-4', role: 'ascendi', content: 'Great choice! That pivot is genuinely your strongest narrative thread. Here\'s a suggested structure:\n\n**Opening:** The moment in the engineering society when everything clicked — be specific and vivid.\n**Middle:** How your business background actually enriches your engineering thinking (strategy, systems thinking).\n**End:** Your vision — sustainable energy, entrepreneurship, the intersection of engineering and business.\n\nTip: Admissions tutors love specificity. Instead of "I joined the engineering society", try "The first time our autonomous project navigated the maze without a single collision..."', timestamp: relDate(-35) + 'T10:01:30' },
      { id: 'msg-2-5', role: 'user', content: 'That\'s amazing, I\'m going to start drafting now!', timestamp: relDate(-35) + 'T10:02:00' }
    ]
  }
];

// ─── Recommendation Letter Requests ──────────────────────────────────────────

export const DEMO_REC_LETTERS: RecLetterRequest[] = [
  {
    id: 'rec-1',
    teacherName: 'Mrs. Sarah Mitchell',
    teacherEmail: 's.mitchell@intl-school.edu',
    subject: 'University Counsellor',
    relationship: 'School counsellor — 2 years',
    status: 'uploaded',
    requestedDate: relDate(-90),
    completedDate: relDate(-45),
    universities: ['Imperial College London', 'ETH Zürich', 'EPFL', 'TU Delft', 'University of Bath']
  },
  {
    id: 'rec-2',
    teacherName: 'Mr. James Parker',
    teacherEmail: 'j.parker@intl-school.edu',
    subject: 'Physics HL',
    relationship: 'Physics teacher — 2 years',
    status: 'signed',
    requestedDate: relDate(-75),
    completedDate: relDate(-20),
    universities: ['Imperial College London', 'ETH Zürich', 'EPFL']
  },
  {
    id: 'rec-3',
    teacherName: 'Ms. Priya Nair',
    teacherEmail: 'p.nair@intl-school.edu',
    subject: 'Mathematics AA HL',
    relationship: 'Maths teacher — 1 year',
    status: 'writing',
    requestedDate: relDate(-60),
    universities: ['Imperial College London', 'TU Delft']
  },
  {
    id: 'rec-4',
    teacherName: 'Dr. David Chen',
    teacherEmail: 'd.chen@intl-school.edu',
    subject: 'Extended Essay Supervisor',
    relationship: 'EE supervisor — Solar panel research',
    status: 'requested',
    requestedDate: relDate(-14),
    universities: ['ETH Zürich', 'EPFL']
  }
];

// ─── Application Sandbox ─────────────────────────────────────────────────────

export const DEMO_SANDBOX_APPS: SandboxApplication[] = [
  {
    id: 'sandbox-1',
    platform: 'UCAS',
    university: 'Imperial College London',
    program: 'MEng Mechanical Engineering',
    country: 'United Kingdom',
    flagEmoji: '🇬🇧',
    status: 'submitted',
    submittedDate: relDate(-7)
  },
  {
    id: 'sandbox-2',
    platform: 'Direct',
    university: 'ETH Zürich',
    program: 'BSc Mechanical Engineering',
    country: 'Switzerland',
    flagEmoji: '🇨🇭',
    status: 'ready'
  },
  {
    id: 'sandbox-3',
    platform: 'Direct',
    university: 'EPFL',
    program: 'BSc Mechanical Engineering',
    country: 'Switzerland',
    flagEmoji: '🇨🇭',
    status: 'ready'
  },
  {
    id: 'sandbox-4',
    platform: 'Direct',
    university: 'TU Delft',
    program: 'BSc Mechanical Engineering',
    country: 'Netherlands',
    flagEmoji: '🇳🇱',
    status: 'ready'
  },
  {
    id: 'sandbox-5',
    platform: 'UCAS',
    university: 'University of Bath',
    program: 'MEng Mechanical Engineering',
    country: 'United Kingdom',
    flagEmoji: '🇬🇧',
    status: 'submitted',
    submittedDate: relDate(-7)
  },
  {
    id: 'sandbox-6',
    platform: 'Common App',
    university: 'MIT',
    program: 'BS Mechanical Engineering',
    country: 'United States',
    flagEmoji: '🇺🇸',
    status: 'ready'
  }
];

// ─── Essay Prompts (for prompt matcher) ──────────────────────────────────────

export interface EssayPrompt {
  id: string;
  platform: string;
  title: string;
  prompt: string;
  relatedBlockIds: string[];
}

// ─── Outcome Recording (student-facing analytics) ───────────────────────────

export interface OutcomeRecord {
  id: string;
  university: string;
  program: string;
  country: string;
  result: 'accepted' | 'rejected' | 'waitlisted' | 'pending' | 'withdrawn';
  responseDate?: string;
  notes?: string;
}

export const DEMO_OUTCOMES: OutcomeRecord[] = [
  { id: 'out-1', university: 'Imperial College London', program: 'MEng Mechanical Engineering', country: 'UK', result: 'pending', notes: 'Application submitted via UCAS. Interview scheduled.' },
  { id: 'out-2', university: 'University of Bath', program: 'MEng Mechanical Engineering', country: 'UK', result: 'accepted', responseDate: relDate(-3), notes: 'Unconditional offer received!' },
  { id: 'out-3', university: 'ETH Zürich', program: 'BSc Mechanical Engineering', country: 'Switzerland', result: 'pending', notes: 'Awaiting entrance exam results.' },
  { id: 'out-4', university: 'EPFL', program: 'BSc Mechanical Engineering', country: 'Switzerland', result: 'waitlisted', responseDate: relDate(-10), notes: 'Placed on waiting list. Decision expected in May.' },
  { id: 'out-5', university: 'TU Delft', program: 'BSc Mechanical Engineering', country: 'Netherlands', result: 'accepted', responseDate: relDate(-14), notes: 'Offer received. Must confirm by June.' }
];

// ─── Deadline Nudges (proactive student-facing reminders) ────────────────────

export type NudgeUrgency = 'critical' | 'warning' | 'info';

export interface DeadlineNudge {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  university?: string;
  urgency: NudgeUrgency;
  actionLabel: string;
  actionHref: string;
  dismissed?: boolean;
}

export const DEMO_NUDGES: DeadlineNudge[] = [
  {
    id: 'nudge-1',
    title: 'Imperial College interview prep',
    description: 'Your interview is in 5 days. Review your personal statement and prepare answers about your engineering project.',
    dueDate: relDate(5),
    university: 'Imperial College London',
    urgency: 'critical',
    actionLabel: 'Open prep checklist',
    actionHref: '/applications/tasks'
  },
  {
    id: 'nudge-2',
    title: 'ETH Zürich entrance exam',
    description: 'The entrance exam registration closes in 12 days. Make sure you have confirmed your time slot.',
    dueDate: relDate(12),
    university: 'ETH Zürich',
    urgency: 'warning',
    actionLabel: 'View details',
    actionHref: '/applications'
  },
  {
    id: 'nudge-3',
    title: 'Confirm University of Bath offer',
    description: 'You received an offer from Bath. The deadline to accept or decline is approaching.',
    dueDate: relDate(21),
    university: 'University of Bath',
    urgency: 'warning',
    actionLabel: 'Review offer',
    actionHref: '/applications'
  },
  {
    id: 'nudge-4',
    title: 'Request final transcript',
    description: 'Several universities require your final IB transcript. Ask your school coordinator to prepare it.',
    dueDate: relDate(30),
    urgency: 'info',
    actionLabel: 'View documents',
    actionHref: '/applications/documents'
  },
  {
    id: 'nudge-5',
    title: 'Ms. Nair — recommendation letter reminder',
    description: 'Your Maths teacher has not yet submitted her recommendation letter. Consider sending a polite nudge.',
    dueDate: relDate(14),
    urgency: 'warning',
    actionLabel: 'View letters',
    actionHref: '/applications/documents'
  }
];

// ─── Counsellor Documents (shared docs visible to counsellor) ────────────────

export type CounsellorDocStatus = 'received' | 'pending' | 'overdue';

export interface CounsellorDocument {
  id: string;
  studentId: string;
  studentName: string;
  documentName: string;
  type: 'transcript' | 'recommendation' | 'essay' | 'certificate' | 'other';
  status: CounsellorDocStatus;
  uploadedDate?: string;
  dueDate?: string;
  notes?: string;
}

export const DEMO_COUNSELLOR_DOCS: CounsellorDocument[] = [
  { id: 'cdoc-1', studentId: 'student-1', studentName: 'Aarav Sharma', documentName: 'IB Transcript (Predicted)', type: 'transcript', status: 'received', uploadedDate: relDate(-30) },
  { id: 'cdoc-2', studentId: 'student-1', studentName: 'Aarav Sharma', documentName: 'Personal Statement v2', type: 'essay', status: 'received', uploadedDate: relDate(-14) },
  { id: 'cdoc-3', studentId: 'student-1', studentName: 'Aarav Sharma', documentName: 'Physics Teacher Recommendation', type: 'recommendation', status: 'received', uploadedDate: relDate(-21) },
  { id: 'cdoc-4', studentId: 'student-2', studentName: 'Sofia Müller', documentName: 'IB Transcript (Predicted)', type: 'transcript', status: 'received', uploadedDate: relDate(-25) },
  { id: 'cdoc-5', studentId: 'student-2', studentName: 'Sofia Müller', documentName: 'Counsellor Recommendation', type: 'recommendation', status: 'pending', dueDate: relDate(7) },
  { id: 'cdoc-6', studentId: 'student-3', studentName: 'Mohammed Al-Rashid', documentName: 'A-Level Transcript', type: 'transcript', status: 'overdue', dueDate: relDate(-5), notes: 'Chased via email twice' },
  { id: 'cdoc-7', studentId: 'student-3', studentName: 'Mohammed Al-Rashid', documentName: 'English Teacher Recommendation', type: 'recommendation', status: 'overdue', dueDate: relDate(-3) },
  { id: 'cdoc-8', studentId: 'student-4', studentName: 'Isabella Chen', documentName: 'IB Transcript (Predicted)', type: 'transcript', status: 'received', uploadedDate: relDate(-18) },
  { id: 'cdoc-9', studentId: 'student-4', studentName: 'Isabella Chen', documentName: 'Personal Statement Final', type: 'essay', status: 'received', uploadedDate: relDate(-7) },
  { id: 'cdoc-10', studentId: 'student-5', studentName: 'Yuki Tanaka', documentName: 'Medical Portfolio', type: 'other', status: 'pending', dueDate: relDate(10) },
  { id: 'cdoc-11', studentId: 'student-5', studentName: 'Yuki Tanaka', documentName: 'Biology Teacher Recommendation', type: 'recommendation', status: 'received', uploadedDate: relDate(-12) },
  { id: 'cdoc-12', studentId: 'student-5', studentName: 'Yuki Tanaka', documentName: 'IB Transcript (Predicted)', type: 'transcript', status: 'received', uploadedDate: relDate(-20) }
];

// ─── Chances Calculator ─────────────────────────────────────────────────────

export interface DemoStudentGrades {
  system: 'IB' | 'A-Level';
  predicted: number;
  subjects: { name: string; level: string; predicted: string }[];
}

export interface UniversityChance {
  id: string;
  university: string;
  programme: string;
  country: string;
  flagEmoji: string;
  typicalOffer: string;
  minimumScore: number;
  hlRequirements?: string[];
  entranceExams?: string[];
  interviewRequired?: boolean;
  deadline: string;
}

export const DEMO_STUDENT_GRADES: DemoStudentGrades = {
  system: 'IB',
  predicted: 39,
  subjects: [
    { name: 'Physics', level: 'HL', predicted: '7' },
    { name: 'Mathematics AA', level: 'HL', predicted: '6' },
    { name: 'Chemistry', level: 'HL', predicted: '6' },
    { name: 'English A', level: 'SL', predicted: '6' },
    { name: 'Spanish B', level: 'SL', predicted: '7' },
    { name: 'Economics', level: 'SL', predicted: '7' },
  ],
};

export const DEMO_UNIVERSITY_CHANCES: UniversityChance[] = [
  { id: 'ch-1', university: 'Imperial College London', programme: 'MEng Mechanical Engineering', country: 'UK', flagEmoji: '🇬🇧', typicalOffer: '39–40 IB (HL 7,6,6)', minimumScore: 39, hlRequirements: ['Physics HL 7', 'Maths AA HL 6'], interviewRequired: true, deadline: relDate(45) },
  { id: 'ch-2', university: 'ETH Zürich', programme: 'BSc Mechanical Engineering', country: 'Switzerland', flagEmoji: '🇨🇭', typicalOffer: '36+ IB', minimumScore: 36, hlRequirements: ['Physics HL 6+', 'Maths HL 6+'], entranceExams: ['Comprehensive entrance exam'], deadline: relDate(60) },
  { id: 'ch-3', university: 'TU Delft', programme: 'BSc Mechanical Engineering', country: 'Netherlands', flagEmoji: '🇳🇱', typicalOffer: '34+ IB', minimumScore: 34, hlRequirements: ['Physics HL 5+', 'Maths HL 5+'], deadline: relDate(90) },
  { id: 'ch-4', university: 'EPFL', programme: 'BSc Mechanical Engineering', country: 'Switzerland', flagEmoji: '🇨🇭', typicalOffer: '35+ IB', minimumScore: 35, hlRequirements: ['Physics HL 5+', 'Maths HL 5+'], entranceExams: ['EPFL entrance exam (conditional)'], deadline: relDate(75) },
  { id: 'ch-5', university: 'University of Bath', programme: 'MEng Mechanical Engineering', country: 'UK', flagEmoji: '🇬🇧', typicalOffer: '36 IB', minimumScore: 36, hlRequirements: ['Physics HL 6', 'Maths HL 6'], deadline: relDate(45) },
  { id: 'ch-6', university: 'University of Leeds', programme: 'BEng Mechanical Engineering', country: 'UK', flagEmoji: '🇬🇧', typicalOffer: '34 IB', minimumScore: 34, hlRequirements: ['Physics HL 5', 'Maths HL 5'], deadline: relDate(45) },
];

// ─── Activity Portfolio ─────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  name: string;
  role: string;
  organization: string;
  category: 'academic' | 'leadership' | 'service' | 'athletics' | 'arts' | 'work' | 'other';
  startDate: string;
  endDate?: string;
  hoursPerWeek: number;
  weeksPerYear: number;
  description: string;
  tier: 1 | 2 | 3 | 4;
}

export const DEMO_ACTIVITIES: ActivityEntry[] = [
  { id: 'act-1', name: 'Engineering Society', role: 'President', organization: 'International School', category: 'leadership', startDate: relDate(-365), hoursPerWeek: 6, weeksPerYear: 40, description: 'Led team of 8 to build autonomous robot for national competition. Managed budget, schedule, and technical decisions.', tier: 1 },
  { id: 'act-2', name: 'Mathematics Tutoring', role: 'Volunteer Tutor', organization: 'Community Learning Centre', category: 'service', startDate: relDate(-730), endDate: relDate(-30), hoursPerWeek: 3, weeksPerYear: 36, description: 'Tutored IGCSE and IB maths to younger students. Developed custom worksheets for struggling learners.', tier: 2 },
  { id: 'act-3', name: 'Fintech Internship', role: 'Engineering Intern', organization: 'PayFlow Technologies', category: 'work', startDate: relDate(-180), endDate: relDate(-120), hoursPerWeek: 35, weeksPerYear: 8, description: 'Built internal dashboards and API integrations. Saw how engineering and business intersect in product development.', tier: 2 },
  { id: 'act-4', name: 'National Engineering Challenge', role: 'Team Lead', organization: 'National STEM Foundation', category: 'academic', startDate: relDate(-150), endDate: relDate(-120), hoursPerWeek: 10, weeksPerYear: 4, description: 'Team placed 3rd nationally. Presented autonomous navigation project to panel of industry judges.', tier: 1 },
  { id: 'act-5', name: 'Extended Essay Research', role: 'Researcher', organization: 'IB Programme', category: 'academic', startDate: relDate(-300), endDate: relDate(-90), hoursPerWeek: 4, weeksPerYear: 30, description: 'Researched solar panel efficiency across climate zones. Grade A. Presented findings at school symposium.', tier: 2 },
];

// ─── Requirements Checker ───────────────────────────────────────────────────

export type RequirementStatus = 'complete' | 'in-progress' | 'missing' | 'not-required';
export type RequirementCategory = 'subjects' | 'exams' | 'interviews' | 'documents' | 'essays';

export interface RequirementCell {
  category: RequirementCategory;
  status: RequirementStatus;
  detail?: string;
}

export interface RequirementRow {
  id: string;
  university: string;
  programme: string;
  flagEmoji: string;
  cells: RequirementCell[];
  progress: number;
}

export const DEMO_REQUIREMENTS: RequirementRow[] = [
  { id: 'rq-1', university: 'Imperial College London', programme: 'MEng Mechanical Engineering', flagEmoji: '🇬🇧', progress: 75, cells: [
    { category: 'subjects', status: 'complete', detail: 'Physics HL 7 and Maths HL 6 meet requirements' },
    { category: 'exams', status: 'not-required' },
    { category: 'interviews', status: 'in-progress', detail: 'Interview scheduled in 5 days' },
    { category: 'documents', status: 'in-progress', detail: 'Transcript uploaded, 1 reference pending' },
    { category: 'essays', status: 'complete', detail: 'UCAS personal statement submitted' },
  ] },
  { id: 'rq-2', university: 'ETH Zürich', programme: 'BSc Mechanical Engineering', flagEmoji: '🇨🇭', progress: 50, cells: [
    { category: 'subjects', status: 'complete', detail: 'Meets HL requirements' },
    { category: 'exams', status: 'in-progress', detail: 'Entrance exam registration closing soon' },
    { category: 'interviews', status: 'not-required' },
    { category: 'documents', status: 'in-progress', detail: '2 references needed' },
    { category: 'essays', status: 'in-progress', detail: 'Motivation letter in draft' },
  ] },
  { id: 'rq-3', university: 'TU Delft', programme: 'BSc Mechanical Engineering', flagEmoji: '🇳🇱', progress: 70, cells: [
    { category: 'subjects', status: 'complete' },
    { category: 'exams', status: 'not-required' },
    { category: 'interviews', status: 'not-required' },
    { category: 'documents', status: 'complete', detail: 'All documents uploaded' },
    { category: 'essays', status: 'missing', detail: 'Motivation letter not started' },
  ] },
  { id: 'rq-4', university: 'EPFL', programme: 'BSc Mechanical Engineering', flagEmoji: '🇨🇭', progress: 40, cells: [
    { category: 'subjects', status: 'complete' },
    { category: 'exams', status: 'in-progress', detail: 'Conditional entrance exam' },
    { category: 'interviews', status: 'not-required' },
    { category: 'documents', status: 'in-progress', detail: 'Transcript pending' },
    { category: 'essays', status: 'missing', detail: 'Application essay not started' },
  ] },
  { id: 'rq-5', university: 'University of Bath', programme: 'MEng Mechanical Engineering', flagEmoji: '🇬🇧', progress: 100, cells: [
    { category: 'subjects', status: 'complete' },
    { category: 'exams', status: 'not-required' },
    { category: 'interviews', status: 'not-required' },
    { category: 'documents', status: 'complete' },
    { category: 'essays', status: 'complete', detail: 'UCAS personal statement submitted' },
  ] },
];

// ─── Deadline Timeline Tool ─────────────────────────────────────────────────

export type TimelineDeadlineType = 'submission' | 'exam' | 'interview' | 'document';

export interface TimelineDeadline {
  id: string;
  title: string;
  date: string;
  university: string;
  type: TimelineDeadlineType;
  detail?: string;
}

export const DEMO_TIMELINE_DEADLINES: TimelineDeadline[] = [
  { id: 'tl-1', title: 'Imperial interview', date: relDate(5), university: 'Imperial College London', type: 'interview', detail: 'Online panel interview' },
  { id: 'tl-2', title: 'ETH entrance exam registration', date: relDate(12), university: 'ETH Zürich', type: 'exam', detail: 'Registration closes' },
  { id: 'tl-3', title: 'Ms. Nair reference letter', date: relDate(14), university: 'Multiple', type: 'document', detail: 'Maths recommendation' },
  { id: 'tl-4', title: 'Bath offer confirmation', date: relDate(21), university: 'University of Bath', type: 'submission', detail: 'Accept/decline deadline' },
  { id: 'tl-5', title: 'Final transcript request', date: relDate(30), university: 'Multiple', type: 'document', detail: 'IB final transcript' },
  { id: 'tl-6', title: 'EPFL application submission', date: relDate(75), university: 'EPFL', type: 'submission', detail: 'Full application package' },
  { id: 'tl-7', title: 'ETH entrance exam', date: relDate(80), university: 'ETH Zürich', type: 'exam', detail: 'Comprehensive written exam' },
  { id: 'tl-8', title: 'TU Delft application deadline', date: relDate(90), university: 'TU Delft', type: 'submission', detail: 'Online portal submission' },
  { id: 'tl-9', title: 'EPFL entrance exam (conditional)', date: relDate(100), university: 'EPFL', type: 'exam' },
  { id: 'tl-10', title: 'IB results release', date: relDate(120), university: 'Multiple', type: 'document', detail: 'Official IB results' },
];

// ─── Essay Prompts (for prompt matcher) ──────────────────────────────────────

export const DEMO_ESSAY_PROMPTS: EssayPrompt[] = [
  {
    id: 'prompt-1',
    platform: 'UCAS',
    title: 'Personal Statement',
    prompt: 'Write about why you want to study your chosen course, your relevant skills and experience, and what makes you a suitable candidate.',
    relatedBlockIds: ['bb-4', 'bb-5', 'bb-7', 'bb-8', 'bb-11', 'bb-14', 'bb-17']
  },
  {
    id: 'prompt-2',
    platform: 'Common App',
    title: 'Personal Essay — Prompt 6',
    prompt: 'Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you?',
    relatedBlockIds: ['bb-4', 'bb-11', 'bb-12', 'bb-14', 'bb-16']
  },
  {
    id: 'prompt-3',
    platform: 'Common App',
    title: 'Personal Essay — Prompt 5',
    prompt: 'Discuss an accomplishment, event, or realisation that sparked a period of personal growth and a new understanding of yourself or others.',
    relatedBlockIds: ['bb-4', 'bb-5', 'bb-13', 'bb-17', 'bb-18']
  },
  {
    id: 'prompt-4',
    platform: 'ETH Zürich',
    title: 'Motivation Letter',
    prompt: 'Explain your motivation for studying at ETH Zürich and how your background prepares you for the programme.',
    relatedBlockIds: ['bb-1', 'bb-7', 'bb-8', 'bb-11', 'bb-15', 'bb-17']
  }
];
