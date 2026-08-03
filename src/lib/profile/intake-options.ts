/**
 * Static option tables and row builders for the student intake wizard.
 *
 * MOVED VERBATIM out of `src/app/profile/_components/StudentIntakeForm.tsx`.
 * Nothing here reads React state or the DOM; every export is a plain value or a
 * pure function, so it can be unit-tested without rendering the 2,600-line form.
 *
 * The row-state TYPES live here too (rather than beside the payload logic in
 * `./intake-logic.ts`) because `buildNextSubject` / `buildDefaultSubjects`
 * return them — keeping them together avoids an import cycle between the two
 * modules.
 */

import type {
  AdmissionsStatus, AdmissionsTestType, EnglishStatus, EnglishTestType,
  IntendedCluster, ProgrammeType
} from '@/lib/profile/intake-types';

// ─── Row-state types ─────────────────────────────────────────────────────────

export type SubjectRowState = {
  subject_name: string;
  level: 'HL' | 'SL' | 'A_LEVEL' | 'AP';
  grade_value: string;
};

export type AdmissionsRowState = {
  test_type: AdmissionsTestType;
  status: AdmissionsStatus | '';
  score_numeric: string;
  percentile: string;
};

export type EnglishRequiredState = 'yes' | 'no' | 'not_sure' | '';

export type ActivityRowState = {
  localId: string;
  category: string;
  level: string;
  duration: string;
  highlight: string;
};

// ─── Option tables ───────────────────────────────────────────────────────────

export const CLUSTER_OPTIONS: { value: IntendedCluster; label: string; emoji: string }[] = [
  { value: 'computer_science', label: 'Computer science', emoji: '💻' },
  { value: 'maths', label: 'Mathematics', emoji: '📐' },
  { value: 'engineering', label: 'Engineering', emoji: '⚙️' },
  { value: 'life_sciences_biochem', label: 'Life sciences & biochem', emoji: '🧬' },
  { value: 'medicine_dentistry', label: 'Medicine & dentistry', emoji: '🩺' },
  { value: 'economics_quant', label: 'Economics (quant)', emoji: '📊' },
  { value: 'business_non_quant', label: 'Business (non-quant)', emoji: '🏢' },
  { value: 'law', label: 'Law', emoji: '⚖️' },
  { value: 'humanities', label: 'Humanities', emoji: '📚' },
  { value: 'creative', label: 'Creative arts', emoji: '🎨' },
];

export const COUNTRY_OPTIONS: string[] = (() => {
  const fallback = [
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
    'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
    'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
    'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
    'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'East Timor', 'Ecuador',
    'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France',
    'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau',
    'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
    'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
    'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
    'Lithuania', 'Luxembourg', 'Macau', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
    'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
    'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea',
    'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru',
    'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
    'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia',
    'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
    'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
    'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
    'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
    'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  ];
  if (typeof Intl?.supportedValuesOf === 'function' && typeof Intl.DisplayNames === 'function') {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      const codes = (Intl as any).supportedValuesOf('region').filter((c: string) => /^[A-Z]{2}$/.test(c));
      const names = codes.map((c: string) => displayNames.of(c) ?? '').filter(Boolean).sort((a: string, b: string) => a.localeCompare(b));
      if (names.length > 100) return names;
    } catch { /* fall through */ }
  }
  return fallback;
})();

export const SCHOOL_TYPE_OPTIONS = [
  { value: 'international_school', label: 'International school' },
  { value: 'local_private', label: 'Local private' },
  { value: 'state_public', label: 'State / public' },
  { value: 'boarding', label: 'Boarding' },
  { value: 'other', label: 'Other' },
];

export const SUBJECT_OPTIONS = [
  'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
  'Economics', 'Business', 'Accounting', 'Psychology', 'English Literature', 'English Language',
  'History', 'Geography', 'Government & Politics', 'Philosophy', 'Sociology', 'Art & Design',
  'Design Technology', 'Music', 'Theatre Studies', 'Media Studies', 'Modern Languages',
  'Classical Studies', 'Sports Science', 'Environmental Systems', 'Other',
];

export const ENGLISH_TEST_OPTIONS: { value: EnglishTestType; label: string }[] = [
  { value: 'IELTS', label: 'IELTS' },
  { value: 'TOEFL', label: 'TOEFL' },
  { value: 'DUOLINGO', label: 'Duolingo' },
  { value: 'WAIVER', label: 'Waiver / exempt' },
  { value: 'NONE', label: 'None yet' },
];

export const ENGLISH_STATUS_OPTIONS: { value: EnglishStatus; label: string }[] = [
  { value: 'booked', label: 'Booked' },
  { value: 'met', label: 'Met' },
  { value: 'exceeds', label: 'Exceeds' },
  { value: 'exceptional', label: 'Exceptional' },
  { value: 'missing', label: 'Not started' },
  { value: 'failed', label: 'Below req.' },
];

export const ADMISSIONS_TEST_OPTIONS: { value: AdmissionsTestType; label: string }[] = [
  { value: 'LNAT', label: 'LNAT' },
  { value: 'UCAT', label: 'UCAT' },
  { value: 'TMUA', label: 'TMUA' },
  { value: 'MAT', label: 'MAT' },
  { value: 'STEP', label: 'STEP' },
  { value: 'ESAT', label: 'ESAT' },
  { value: 'TSA', label: 'TSA' },
  { value: 'NONE', label: 'None' },
];

export const EXTRACURRICULAR_OPTIONS = [
  'Sports / fitness', 'Student societies', 'Volunteering', 'Entrepreneurship',
  'Arts / music', 'Debate / public speaking', 'Gaming / esports', 'Cultural clubs', 'Other',
];

export const LEADERSHIP_OPTIONS = [
  'Head Boy / Girl', 'Class President', 'Team Captain', 'Prefect',
  'Club Founder', 'Student Council', 'Community Leader', 'None',
];

export const ACTIVITY_CATEGORIES = [
  'Sport', 'Music', 'Drama / Theatre', 'Debate / Model UN',
  'Community Service', 'Academic Competition', 'Science Competition',
  'Entrepreneurship', 'Art / Design', 'Writing / Journalism',
  'Coding / Hackathon', 'Research Project', 'Other',
] as const;

export const ACTIVITY_LEVELS = ['School', 'Regional', 'National', 'International'] as const;
export const ACTIVITY_DURATIONS = ['< 1 year', '1–2 years', '3–4 years', '5+ years'] as const;

export const COMMITMENT_OPTIONS = [
  { value: 'light', label: 'Light', desc: 'A few activities, casual involvement' },
  { value: 'moderate', label: 'Moderate', desc: '1–2 serious activities, regular commitment' },
  { value: 'deep', label: 'Deep', desc: 'Competitive level or school-wide recognition' },
  { value: 'exceptional', label: 'Exceptional', desc: 'National awards, publications, or elite-level' },
];

/**
 * Eight graduation years centred on "now", evaluated ONCE at module scope.
 *
 * DELIBERATELY NOT a function. It was module-scope in StudentIntakeForm and it
 * stays module-scope here: turning it into `graduationYears()` would make the
 * list re-derive on every render, which is a different observable behaviour
 * (a session open across New Year would silently re-index the <Select>), and
 * the characterization suite pins the current shape by asserting the option
 * COUNT and selecting options BY POSITION precisely because the value cannot be
 * frozen from a test. Keeping the evaluation site identical keeps that contract
 * intact. See the DETERMINISM note in
 * `__tests__/profile/intake-form/intake-form.characterization.test.tsx`.
 */
export const GRADUATION_YEARS = (() => {
  const current = new Date().getFullYear();
  return [current - 2, current - 1, current, current + 1, current + 2, current + 3, current + 4, current + 5];
})();

export const IB_GRADES = ['A', 'B', 'C', 'D', 'E'] as const;
export const A_LEVEL_GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'] as const;

// ─── Subject-row builders ────────────────────────────────────────────────────

export const buildEmptySubject = (programmeType: ProgrammeType | ''): SubjectRowState => ({
  subject_name: '',
  level: programmeType === 'IB' ? 'HL' : 'A_LEVEL',
  grade_value: '',
});

/**
 * An empty row to append to `existing`. IB allows exactly 3 HL, so once three HL rows are
 * present the next blank row must default to SL — `buildEmptySubject` alone always says HL,
 * which meant a saved IB profile with fewer than 6 subjects hydrated as 4–6 HL rows and
 * failed its own "IB requires 3 Higher Level subjects" check before the student typed a thing.
 */
export const buildNextSubject = (
  programmeType: ProgrammeType | '',
  existing: SubjectRowState[]
): SubjectRowState => {
  const base = buildEmptySubject(programmeType);
  if (programmeType !== 'IB') return base;
  const hlCount = existing.filter((s) => s.level === 'HL').length;
  return { ...base, level: hlCount < 3 ? 'HL' : 'SL' };
};

export const buildDefaultSubjects = (programmeType: ProgrammeType | ''): SubjectRowState[] => {
  if (programmeType === 'IB') {
    return Array.from({ length: 6 }, (_, i) => ({ subject_name: '', level: i < 3 ? 'HL' : 'SL', grade_value: '' }));
  }
  return Array.from({ length: 3 }, () => buildEmptySubject('A_LEVEL'));
};

export const getMaxSubjects = (programmeType: ProgrammeType | '') => programmeType === 'A_LEVEL' ? 4 : 6;

export const clusterLabelMap = new Map(CLUSTER_OPTIONS.map((o) => [o.value, o.label]));
