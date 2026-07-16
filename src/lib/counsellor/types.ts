// Domain types for the counsellor section.
//
// These began life in src/lib/data/counsellor-dummy-data.ts; once the section
// was wired to real Supabase data (lib/counsellor/data.ts) every importer was
// type-only, so the types moved here and the ~900 lines of dummy data were
// deleted.

export type MatchTier = 'Reach' | 'Match' | 'Safe';
export type ApplicationStatus = 'planning' | 'in_progress' | 'submitted' | 'decision';
export type NoteType = 'session' | 'flag' | 'update';
export type DeadlineType = 'early_decision' | 'regular' | 'scholarship' | 'interview';
export type StudentFlag = 'profile_incomplete' | 'deadline_urgent' | 'no_matches' | 'stalled';
export type OutcomeResult = 'accepted' | 'rejected' | 'waitlisted' | 'pending' | 'withdrawn';
export type ApplicationPlatform = 'UCAS' | 'Common App' | 'Direct' | 'Coalition' | 'OUAC';

export interface CounsellorMatch {
  university: string;
  country: string;
  program: string;
  score: number;
  tier: MatchTier;
}

export interface CounsellorApplication {
  university: string;
  program: string;
  status: ApplicationStatus;
  deadline: string;
  platform?: ApplicationPlatform;
  country?: string;
}

export interface CounsellorDeadline {
  id: string;
  university: string;
  program: string;
  date: string;
  type: DeadlineType;
  studentId: string;
}

export interface CounsellorNote {
  id: string;
  date: string;
  content: string;
  type: NoteType;
}

export interface CounsellorStudent {
  id: string;
  personal: {
    firstName: string;
    lastName: string;
    nationality: string;
    flagEmoji: string;
    school: string;
    schoolCity: string;
    schoolCountry: string;
    email: string;
  };
  academic: {
    programmeType: 'IB' | 'A_LEVEL';
    ibPoints?: number;
    aLevelGrades?: string;
    subjects: string[];
    clusters: string[];
    careerAspiration: string;
    englishStatus: 'met' | 'missing' | 'booked';
    admissionsTests: { type: string; status: string; score?: number }[];
    graduationYear: number;
  };
  lifestyle: {
    teachingStyle: 'academic' | 'practical' | 'mixed';
    locationPreference: string;
    campusSize: 'small' | 'medium' | 'large' | 'no_preference';
    interests: string[];
  };
  profile: {
    completionPct: number;
    stepsComplete: ('personal' | 'academic' | 'subjects' | 'lifestyle')[];
  };
  matches: CounsellorMatch[];
  applications: CounsellorApplication[];
  deadlines: CounsellorDeadline[];
  notes: CounsellorNote[];
  flags: StudentFlag[];
  lastActive: string;
}

export interface CounsellorOutcome {
  id: string;
  studentId: string;
  studentName: string;
  university: string;
  program: string;
  country: string;
  tier: MatchTier;
  platform: ApplicationPlatform;
  result: OutcomeResult;
  responseDate: string | null;
  conditions: string | null;
}

export type RiskType =
  | 'essay_not_started'
  | 'missing_documents'
  | 'stalled_application'
  | 'low_completion'
  | 'deadline_approaching';
export type RiskUrgency = 'critical' | 'high' | 'medium';

export interface AtRiskAlert {
  studentId: string;
  studentName: string;
  flagEmoji: string;
  riskType: RiskType;
  urgency: RiskUrgency;
  description: string;
  suggestedAction: string;
}

export interface EnrichedApplication {
  studentId: string;
  studentName: string;
  flagEmoji: string;
  university: string;
  program: string;
  status: ApplicationStatus;
  deadline: string;
  platform: ApplicationPlatform;
  country: string;
}

