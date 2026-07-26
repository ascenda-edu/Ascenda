'use client';

import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, ChevronDown, ChevronRight, ChevronLeft,
  Trash2, PlusCircle, Info, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { PROFILE_STEPS } from '@/lib/profile/steps';
import { cn } from '@/lib/utils';
import type {
  AdmissionsStatus, AdmissionsTestType, EnglishStatus, EnglishTestType,
  IntendedCluster, ProgrammeType, StudentAdmissionsTest, StudentProfilePayload, StudentSubject
} from '@/lib/profile/intake-types';
import { saveStudentIntake } from '../actions';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';

// ─── Types ───────────────────────────────────────────────────────────────────

type SubjectRowState = {
  subject_name: string;
  level: 'HL' | 'SL' | 'A_LEVEL' | 'AP';
  grade_value: string;
};
type AdmissionsRowState = {
  test_type: AdmissionsTestType;
  status: AdmissionsStatus | '';
  score_numeric: string;
  percentile: string;
};
type EnglishRequiredState = 'yes' | 'no' | 'not_sure' | '';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = PROFILE_STEPS.length + 1; // +1 for Review

// Wizard steps are mirrored to the `?step=` query param so they're deep-linkable
// and the browser Back button walks the wizard. Steps 1..N map to PROFILE_STEPS
// keys; the final Review step uses a dedicated key.
const STEP_PARAM_KEYS: string[] = PROFILE_STEPS.map((step) => step.key);
const REVIEW_STEP_KEY = 'review';
const stepKeyForIndex = (index: number): string =>
  index >= TOTAL_STEPS ? REVIEW_STEP_KEY : STEP_PARAM_KEYS[index - 1] ?? STEP_PARAM_KEYS[0];
const indexForStepKey = (key: string): number => {
  if (key === REVIEW_STEP_KEY) return TOTAL_STEPS;
  const i = STEP_PARAM_KEYS.indexOf(key);
  return i >= 0 ? i + 1 : 1;
};

const CLUSTER_OPTIONS: { value: IntendedCluster; label: string; emoji: string }[] = [
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

const COUNTRY_OPTIONS: string[] = (() => {
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

const SCHOOL_TYPE_OPTIONS = [
  { value: 'international_school', label: 'International school' },
  { value: 'local_private', label: 'Local private' },
  { value: 'state_public', label: 'State / public' },
  { value: 'boarding', label: 'Boarding' },
  { value: 'other', label: 'Other' },
];

const SUBJECT_OPTIONS = [
  'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
  'Economics', 'Business', 'Accounting', 'Psychology', 'English Literature', 'English Language',
  'History', 'Geography', 'Government & Politics', 'Philosophy', 'Sociology', 'Art & Design',
  'Design Technology', 'Music', 'Theatre Studies', 'Media Studies', 'Modern Languages',
  'Classical Studies', 'Sports Science', 'Environmental Systems', 'Other',
];

const ENGLISH_TEST_OPTIONS: { value: EnglishTestType; label: string }[] = [
  { value: 'IELTS', label: 'IELTS' },
  { value: 'TOEFL', label: 'TOEFL' },
  { value: 'DUOLINGO', label: 'Duolingo' },
  { value: 'WAIVER', label: 'Waiver / exempt' },
  { value: 'NONE', label: 'None yet' },
];

const ENGLISH_STATUS_OPTIONS: { value: EnglishStatus; label: string }[] = [
  { value: 'booked', label: 'Booked' },
  { value: 'met', label: 'Met' },
  { value: 'exceeds', label: 'Exceeds' },
  { value: 'exceptional', label: 'Exceptional' },
  { value: 'missing', label: 'Not started' },
  { value: 'failed', label: 'Below req.' },
];

const ADMISSIONS_TEST_OPTIONS: { value: AdmissionsTestType; label: string }[] = [
  { value: 'LNAT', label: 'LNAT' },
  { value: 'UCAT', label: 'UCAT' },
  { value: 'TMUA', label: 'TMUA' },
  { value: 'MAT', label: 'MAT' },
  { value: 'STEP', label: 'STEP' },
  { value: 'ESAT', label: 'ESAT' },
  { value: 'TSA', label: 'TSA' },
  { value: 'NONE', label: 'None' },
];

const EXTRACURRICULAR_OPTIONS = [
  'Sports / fitness', 'Student societies', 'Volunteering', 'Entrepreneurship',
  'Arts / music', 'Debate / public speaking', 'Gaming / esports', 'Cultural clubs', 'Other',
];

const LEADERSHIP_OPTIONS = [
  'Head Boy / Girl', 'Class President', 'Team Captain', 'Prefect',
  'Club Founder', 'Student Council', 'Community Leader', 'None',
];

const ACTIVITY_CATEGORIES = [
  'Sport', 'Music', 'Drama / Theatre', 'Debate / Model UN',
  'Community Service', 'Academic Competition', 'Science Competition',
  'Entrepreneurship', 'Art / Design', 'Writing / Journalism',
  'Coding / Hackathon', 'Research Project', 'Other',
] as const;

const ACTIVITY_LEVELS = ['School', 'Regional', 'National', 'International'] as const;
const ACTIVITY_DURATIONS = ['< 1 year', '1–2 years', '3–4 years', '5+ years'] as const;

type ActivityRowState = {
  localId: string;
  category: string;
  level: string;
  duration: string;
  highlight: string;
};

const COMMITMENT_OPTIONS = [
  { value: 'light', label: 'Light', desc: 'A few activities, casual involvement' },
  { value: 'moderate', label: 'Moderate', desc: '1–2 serious activities, regular commitment' },
  { value: 'deep', label: 'Deep', desc: 'Competitive level or school-wide recognition' },
  { value: 'exceptional', label: 'Exceptional', desc: 'National awards, publications, or elite-level' },
];

const GRADUATION_YEARS = (() => {
  const current = new Date().getFullYear();
  return [current - 2, current - 1, current, current + 1, current + 2, current + 3, current + 4, current + 5];
})();

const IB_GRADES = ['A', 'B', 'C', 'D', 'E'] as const;
const A_LEVEL_GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildEmptySubject = (programmeType: ProgrammeType | ''): SubjectRowState => ({
  subject_name: '',
  level: programmeType === 'IB' ? 'HL' : 'A_LEVEL',
  grade_value: '',
});

const buildDefaultSubjects = (programmeType: ProgrammeType | ''): SubjectRowState[] => {
  if (programmeType === 'IB') {
    return Array.from({ length: 6 }, (_, i) => ({ subject_name: '', level: i < 3 ? 'HL' : 'SL', grade_value: '' }));
  }
  return Array.from({ length: 3 }, () => buildEmptySubject('A_LEVEL'));
};

const getMaxSubjects = (programmeType: ProgrammeType | '') => programmeType === 'A_LEVEL' ? 4 : 6;

const clusterLabelMap = new Map(CLUSTER_OPTIONS.map((o) => [o.value, o.label]));

// ─── Draft persistence ───────────────────────────────────────────────────────

const DRAFT_KEY = 'ascenda-intake-draft';

const buildInitialPersonalInfo = () => ({
  first_name: '', last_name: '', email: '', age: '', gender: '',
  resident_country: '', current_location_city: '', time_zone: '',
});

const buildInitialAcademicInput = () => ({
  school_name: '', school_country: '', school_city: '', school_type: '',
  graduation_year: '', desired_start_date: '',
  intended_clusters: [] as IntendedCluster[], secondary_clusters: [] as IntendedCluster[],
  career_aspiration: '',
  ib_total_points: '', ib_core_points: '', ib_tok_grade: '', ib_ee_grade: '', ib_math_pathway: '',
  ee_subject: '', ee_title: '', ee_summary: '',
});

const buildInitialLifestylePreference = () => ({
  teaching_style: '', desired_location_type: [] as string[], campus_size: '',
  extracurricular_interests: [] as string[], other_extracurriculars: '',
});

const buildInitialActivities = () => ({
  leadership_roles: [] as string[],
  commitment_level: '',
  key_activities: [] as string[],
  sat_score: '',
  act_score: '',
  intl_experience: [] as string[],
  work_experience: null as boolean | null,
  work_experience_summary: '',
  ambition_statement: '',
  epq_subject: '',
  epq_title: '',
});

type IntakeDraft = {
  version: 1;
  savedAt: number;
  currentStep: number;
  programmeType: ProgrammeType | '';
  nationalities: string[];
  subjects: SubjectRowState[];
  admissionsTests: AdmissionsRowState[];
  englishRequired: EnglishRequiredState;
  englishTestType: EnglishTestType;
  englishStatus: EnglishStatus;
  englishScoreOverall: string;
  personalInfo: ReturnType<typeof buildInitialPersonalInfo>;
  academicInput: ReturnType<typeof buildInitialAcademicInput>;
  lifestylePreference: ReturnType<typeof buildInitialLifestylePreference>;
  activities: ReturnType<typeof buildInitialActivities>;
  activityRows: ActivityRowState[];
};

const isValidDraft = (d: unknown): d is IntakeDraft => {
  if (!d || typeof d !== 'object') return false;
  const draft = d as Partial<IntakeDraft>;
  return draft.version === 1
    && typeof draft.currentStep === 'number'
    && !!draft.personalInfo && typeof draft.personalInfo === 'object'
    && !!draft.academicInput && typeof draft.academicInput === 'object'
    && !!draft.lifestylePreference && typeof draft.lifestylePreference === 'object'
    && !!draft.activities && typeof draft.activities === 'object'
    && Array.isArray(draft.nationalities)
    && Array.isArray(draft.subjects)
    && Array.isArray(draft.admissionsTests)
    && Array.isArray(draft.activityRows);
};

// ─── Reusable field components ────────────────────────────────────────────────

const inputCls = 'flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 transition-[color,border-color,box-shadow] duration-150';
// SelectTrigger's default size clones the global `.form-input` (46px, rounded-2xl).
// This wizard predates that class and uses `inputCls` (44px, rounded-xl), so every
// trigger is nudged onto the input shape — a select and a text field share a grid
// row here, and a 2px/4px-of-radius mismatch between them is visible.
// Radix forbids an item with value='' , but these fields are OPTIONAL and their
// native predecessors had a selectable `<option value="">` — so a user could set a
// value and then take it back. A placeholder alone is not a substitute: it only
// shows while the field is empty and can never be re-chosen. This sentinel restores
// that path, mapped back to '' at the boundary so the submitted payload is unchanged.
const CLEAR = '__clear';

// NOTE the Selects below bind `value={state || ''}`, NOT `|| undefined`. Radix decides
// controlled-ness with `prop !== undefined`, so `undefined` flips the Select to
// UNCONTROLLED — and on the way back from a real value to '' it then renders its stale
// internal value. Net effect: picking "Not specified" saved null but kept displaying
// the old option. An unmatched '' on the ROOT is fine and shows the placeholder; only
// SelectItem forbids ''.

const selectTriggerCls = 'h-11 rounded-xl';

/** Stable DOM id for a validation error message, so inputs can point at it via aria-describedby. */
const fieldErrorId = (key: string) => `intake-error-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

function FieldError({ msg, id }: { msg?: string; id?: string }) {
  if (!msg) return null;
  return <p id={id} role="alert" className="mt-1 text-xs text-destructive font-medium">{msg}</p>;
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-5', className)}>
      {children}
    </div>
  );
}

function SectionTitle({ label, hint, why }: { label: string; hint?: string; why?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close "Why we ask" popover on Escape or outside click
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold text-foreground text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground mt-0.5">{hint}</p> : null}
      </div>
      {why ? (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-label text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
        >
          <Info className="w-3.5 h-3.5" />
          Why we ask
          {open ? <X className="w-3 h-3" /> : null}
        </button>
      ) : null}
      {open && why ? (
        <div className="absolute right-0 mt-6 w-56 text-xs bg-popover border border-border rounded-xl p-3 shadow-e-3 z-raised text-muted-foreground leading-relaxed">
          {why}
        </div>
      ) : null}
    </div>
  );
}

/** Searchable country combobox — replaces <input list="..."> */
function CountryCombobox({
  value, onChange, placeholder, error, id, errorId
}: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string; id?: string; errorId?: string }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  // Keep display in sync when value changes externally (hydration)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return COUNTRY_OPTIONS.slice(0, 8);
    const q = query.toLowerCase();
    return COUNTRY_OPTIONS.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  // Reset the active option whenever the visible list changes.
  useEffect(() => { setHighlight(-1); }, [query, open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (country: string) => {
    onChange(country);
    setQuery(country);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && highlight < filtered.length) {
        e.preventDefault();
        select(filtered[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputCls, 'pr-9', error && 'border-destructive')}
          value={query}
          placeholder={placeholder ?? 'Search country…'}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-background shadow-e-3 overflow-hidden max-h-52 overflow-y-auto"
        >
          {filtered.map((c, index) => (
            <li key={c} id={optionId(index)} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors',
                  index === highlight ? 'bg-muted/60' : 'hover:bg-muted/60'
                )}
                onMouseDown={() => select(c)}
                onMouseEnter={() => setHighlight(index)}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <FieldError msg={error} id={errorId} />}
    </div>
  );
}

/** Chip toggle button — used for radio/multi-select chip groups */
function Chip({
  label, selected, onClick, disabled, emoji, description
}: {
  label: string; selected: boolean; onClick: () => void;
  disabled?: boolean; emoji?: string; description?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-150',
        selected
          ? 'bg-primary/8 border-primary text-primary-ink shadow-e-1'
          : 'bg-background border-border text-foreground hover:border-primary/40 hover:bg-muted/50',
        disabled && !selected && 'opacity-40 cursor-not-allowed hover:border-border hover:bg-background'
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {emoji ? <span>{emoji}</span> : null}
          {label}
        </span>
        {selected && <Check className="w-3.5 h-3.5 text-primary-ink shrink-0" />}
      </span>
      {description ? <span className="text-label text-muted-foreground font-normal leading-snug">{description}</span> : null}
    </button>
  );
}

/** Searchable subject combobox */
function SubjectCombobox({
  value, onChange, error, errorId
}: { value: string; onChange: (v: string) => void; error?: string; errorId?: string }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return SUBJECT_OPTIONS.slice(0, 8);
    const q = query.toLowerCase();
    return SUBJECT_OPTIONS.filter((s) => s.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  useEffect(() => { setHighlight(-1); }, [query, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (subject: string) => {
    onChange(subject);
    setQuery(subject);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && highlight < filtered.length) {
        e.preventDefault();
        select(filtered[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputCls, 'pr-9', error && 'border-destructive')}
          value={query}
          placeholder="Subject name"
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-background shadow-e-3 overflow-hidden max-h-52 overflow-y-auto"
        >
          {filtered.map((s, index) => (
            <li key={s} id={optionId(index)} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors',
                  index === highlight ? 'bg-muted/60' : 'hover:bg-muted/60'
                )}
                onMouseDown={() => select(s)}
                onMouseEnter={() => setHighlight(index)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <FieldError msg={error} id={errorId} />}
    </div>
  );
}

// ─── Step header copy ─────────────────────────────────────────────────────────

const STEP_META: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Who are you?', subtitle: 'The basics — name, nationality, and where you live.' },
  2: { title: 'Your studies', subtitle: 'What you\'re taking, where you study, and what you want to pursue.' },
  3: { title: 'Grades & tests', subtitle: 'The more detail here, the sharper your matches.' },
  4: { title: 'Activities & ambitions', subtitle: 'Beyond grades — what you do and where you\'re headed.' },
  5: { title: 'Life at university', subtitle: 'Your preferences for campus life, teaching style, and environment.' },
  6: { title: 'Review & confirm', subtitle: 'Everything looks right? Hit submit and we\'ll run your matches.' },
};


// ─── Main component ───────────────────────────────────────────────────────────

export const StudentIntakeForm = ({
  initialStep = 1,
  initialPayload = null
}: {
  initialStep?: number;
  initialPayload?: StudentProfilePayload | null;
}) => {
  const contentTopRef = useRef<HTMLDivElement | null>(null);
  const [stepParam, setStepParam] = useSearchParamState('step', stepKeyForIndex(initialStep), { push: true });
  const currentStep = indexForStepKey(stepParam);
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;
  const setCurrentStep = useCallback(
    (next: number | ((prev: number) => number)) => {
      const resolved = typeof next === 'function' ? next(currentStepRef.current) : next;
      const clamped = Math.min(TOTAL_STEPS, Math.max(1, resolved));
      setStepParam(stepKeyForIndex(clamped));
    },
    [setStepParam]
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [isSaving, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [programmeType, setProgrammeType] = useState<ProgrammeType | ''>('');
  const [nationalities, setNationalities] = useState<string[]>(['']);
  const [subjects, setSubjects] = useState<SubjectRowState[]>(buildDefaultSubjects(''));
  const [admissionsTests, setAdmissionsTests] = useState<AdmissionsRowState[]>([]);
  const [englishRequired, setEnglishRequired] = useState<EnglishRequiredState>('');
  const [englishTestType, setEnglishTestType] = useState<EnglishTestType>('NONE');
  const [englishStatus, setEnglishStatus] = useState<EnglishStatus>('missing');
  const [englishScoreOverall, setEnglishScoreOverall] = useState('');
  const hasHydratedRef = useRef(false);
  const skipProgrammeResetRef = useRef(false);

  // ── Draft persistence bookkeeping ──
  const [draftNotice, setDraftNotice] = useState(false);
  const draftSaveInitRef = useRef(false);          // true after the persist effect's first (mount) run
  const skipNextDraftSaveRef = useRef(false);      // set when a programmatic state change shouldn't persist a draft
  const draftDataSnapshotRef = useRef<string | null>(null); // serialized form data (sans step) — used to detect real edits
  const isDirtyRef = useRef(false);                // user edited since load, not yet submitted
  const pendingDraftRef = useRef<string | null>(null); // draft awaiting the debounce timer (flushed on beforeunload)
  const submittedRef = useRef(false);

  const [personalInfo, setPersonalInfo] = useState(buildInitialPersonalInfo);

  const [academicInput, setAcademicInput] = useState(buildInitialAcademicInput);

  const [lifestylePreference, setLifestylePreference] = useState(buildInitialLifestylePreference);

  const [activities, setActivities] = useState(buildInitialActivities);

  const [activityRows, setActivityRows] = useState<ActivityRowState[]>([]);

  const addActivityRow = () => setActivityRows((prev) => [
    ...prev,
    { localId: Math.random().toString(36).slice(2), category: '', level: '', duration: '', highlight: '' }
  ]);
  const removeActivityRow = (localId: string) =>
    setActivityRows((prev) => prev.filter((r) => r.localId !== localId));
  const updateActivityRow = (localId: string, key: keyof Omit<ActivityRowState, 'localId'>, value: string) =>
    setActivityRows((prev) => prev.map((r) => r.localId === localId ? { ...r, [key]: value } : r));

  useEffect(() => {
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        skipNextDraftSaveRef.current = true;
        setPersonalInfo((prev) => ({ ...prev, time_zone: tz }));
      }
    }
  }, []);

  const applyPayload = useCallback((payload: StudentProfilePayload) => {
    const { personal_information: pi, academic_input: ai, lifestyle_preference: lp } = payload;
    skipProgrammeResetRef.current = true;
    setProgrammeType(ai.programme_type ?? '');
    setPersonalInfo({
      first_name: pi.first_name ?? '', last_name: pi.last_name ?? '', email: pi.email ?? '',
      age: pi.age !== null && pi.age !== undefined ? String(pi.age) : '',
      gender: pi.gender ?? '', resident_country: pi.resident_country ?? '',
      current_location_city: pi.current_location_city ?? '', time_zone: pi.time_zone ?? '',
    });
    setNationalities(
      pi.nationality ? pi.nationality.split(',').map((s) => s.trim()).filter(Boolean) : ['']
    );
    setAcademicInput({
      school_name: ai.school_name ?? '', school_country: ai.school_country ?? '',
      school_city: ai.school_city ?? '', school_type: ai.school_type ?? '',
      graduation_year: ai.graduation_year ? String(ai.graduation_year) : '',
      desired_start_date: ai.desired_start_date ?? '',
      intended_clusters: ai.intended_clusters ?? [], secondary_clusters: ai.secondary_clusters ?? [],
      career_aspiration: ai.career_aspiration ?? '',
      ib_total_points: ai.ib_total_points !== null && ai.ib_total_points !== undefined ? String(ai.ib_total_points) : '',
      ib_core_points: ai.ib_core_points !== null && ai.ib_core_points !== undefined ? String(ai.ib_core_points) : '',
      ib_tok_grade: ai.ib_tok_grade ?? '', ib_ee_grade: ai.ib_ee_grade ?? '',
      ib_math_pathway: ai.ib_math_pathway ?? '',
      ee_subject: ai.ee_subject ?? '', ee_title: ai.ee_title ?? '', ee_summary: ai.ee_summary ?? '',
    });
    setSubjects(() => {
      const prog = ai.programme_type ?? '';
      const max = getMaxSubjects(prog);
      const minRows = prog === 'IB' ? 6 : 3;
      const base = ai.subject_list ?? [];
      const mapped = base.slice(0, max).map((s) => ({
        subject_name: s.subject_name ?? '',
        level: s.level ?? (prog === 'IB' ? 'HL' : 'A_LEVEL'),
        grade_value: typeof s.grade_value === 'number' ? String(s.grade_value) : s.grade_value ?? '',
      }));
      while (mapped.length < minRows) mapped.push(buildEmptySubject(prog));
      return mapped;
    });
    setAdmissionsTests(
      (ai.admissions_tests ?? []).map((t) => ({
        test_type: t.test_type, status: t.status,
        score_numeric: t.score_numeric !== null && t.score_numeric !== undefined ? String(t.score_numeric) : '',
        percentile: t.percentile !== null && t.percentile !== undefined ? String(t.percentile) : '',
      }))
    );
    setEnglishRequired(
      ai.english_required === true ? 'yes' : ai.english_required === false ? 'no' : 'not_sure'
    );
    setEnglishTestType(ai.english_test_type ?? 'NONE');
    setEnglishStatus(ai.english_status ?? 'missing');
    setEnglishScoreOverall(
      ai.english_score_overall !== null && ai.english_score_overall !== undefined ? String(ai.english_score_overall) : ''
    );
    const storedLoc = lp.desired_location_type ?? '';
    // Migrate legacy 'london' → 'capital_city'; split comma-sep multi-select
    const locArray = storedLoc
      ? storedLoc.split(',').map((s) => s.trim() === 'london' ? 'capital_city' : s.trim()).filter(Boolean)
      : [];
    setLifestylePreference({
      teaching_style: lp.teaching_style ?? '',
      desired_location_type: locArray,
      campus_size: lp.campus_size ?? '',
      extracurricular_interests: lp.extracurricular_interests ?? [],
      other_extracurriculars: lp.other_extracurriculars ?? '',
    });
    setActivities({
      leadership_roles: lp.leadership_roles ?? [],
      commitment_level: lp.commitment_level ?? '',
      key_activities: lp.key_activities ?? [],
      sat_score: lp.sat_score !== null && lp.sat_score !== undefined ? String(lp.sat_score) : '',
      act_score: lp.act_score !== null && lp.act_score !== undefined ? String(lp.act_score) : '',
      intl_experience: lp.intl_experience ?? [],
      work_experience: lp.work_experience ?? null,
      work_experience_summary: lp.work_experience_summary ?? '',
      ambition_statement: lp.ambition_statement ?? '',
      epq_subject: (lp as any).epq_subject ?? '',
      epq_title: (lp as any).epq_title ?? '',
    });
    setActivityRows(
      (payload.activities_list ?? []).map((a) => ({
        localId: a.id ?? Math.random().toString(36).slice(2),
        category: a.category ?? '',
        level: a.level ?? '',
        duration: a.duration ?? '',
        highlight: a.highlight ?? '',
      }))
    );
  }, []);

  useEffect(() => {
    if (!programmeType) return;
    if (skipProgrammeResetRef.current) { skipProgrammeResetRef.current = false; return; }
    setSubjects(buildDefaultSubjects(programmeType));
    if (programmeType === 'A_LEVEL') {
      setAcademicInput((prev) => ({
        ...prev, ib_math_pathway: '', ib_total_points: '', ib_core_points: '',
        ib_tok_grade: '', ib_ee_grade: '', ee_subject: '', ee_title: '', ee_summary: '',
      }));
    }
  }, [programmeType]);

  const applyDraft = useCallback((draft: IntakeDraft) => {
    if (draft.programmeType) skipProgrammeResetRef.current = true;
    setProgrammeType(draft.programmeType);
    setPersonalInfo({ ...buildInitialPersonalInfo(), ...draft.personalInfo });
    setNationalities(draft.nationalities.length ? draft.nationalities : ['']);
    setAcademicInput({ ...buildInitialAcademicInput(), ...draft.academicInput });
    setSubjects(draft.subjects.length ? draft.subjects : buildDefaultSubjects(draft.programmeType));
    setAdmissionsTests(draft.admissionsTests);
    setEnglishRequired(draft.englishRequired);
    setEnglishTestType(draft.englishTestType);
    setEnglishStatus(draft.englishStatus);
    setEnglishScoreOverall(draft.englishScoreOverall);
    setLifestylePreference({ ...buildInitialLifestylePreference(), ...draft.lifestylePreference });
    setActivities({ ...buildInitialActivities(), ...draft.activities });
    setActivityRows(draft.activityRows);
    setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, draft.currentStep)));
  }, [setCurrentStep]);

  const clearDraft = useCallback(() => {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
    pendingDraftRef.current = null;
    isDirtyRef.current = false;
  }, []);

  // Hydrate once on mount: a local draft wins over the server payload (it is
  // by definition newer — it only exists when there are unsubmitted edits).
  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    let draft: IntakeDraft | null = null;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidDraft(parsed)) draft = parsed;
        else window.localStorage.removeItem(DRAFT_KEY); // corrupt/stale format — drop it
      }
    } catch { /* unreadable draft — ignore */ }
    if (draft) {
      skipNextDraftSaveRef.current = true;
      applyDraft(draft);
      setDraftNotice(true);
      return;
    }
    if (initialPayload) {
      skipNextDraftSaveRef.current = true;
      applyPayload(initialPayload);
    }
  }, [applyDraft, applyPayload, initialPayload]);

  // Debounced draft persistence — any change to the form state (post-hydration)
  // is written to localStorage after ~500ms of inactivity.
  useEffect(() => {
    if (submitted) return;
    const dataOnly = JSON.stringify({
      programmeType, nationalities, subjects, admissionsTests,
      englishRequired, englishTestType, englishStatus, englishScoreOverall,
      personalInfo, academicInput, lifestylePreference, activities, activityRows,
    });
    if (!draftSaveInitRef.current) {
      // First run (mount, pre-hydration state) — record baseline only.
      draftSaveInitRef.current = true;
      draftDataSnapshotRef.current = dataOnly;
      return;
    }
    if (skipNextDraftSaveRef.current) {
      // Programmatic change (hydration / discard / restore) — rebase, don't persist.
      skipNextDraftSaveRef.current = false;
      draftDataSnapshotRef.current = dataOnly;
      return;
    }
    if (dataOnly !== draftDataSnapshotRef.current) {
      draftDataSnapshotRef.current = dataOnly;
      isDirtyRef.current = true; // real edit (not just step navigation)
    }
    const draft: IntakeDraft = {
      version: 1, savedAt: Date.now(), currentStep, programmeType, nationalities,
      subjects, admissionsTests, englishRequired, englishTestType, englishStatus,
      englishScoreOverall, personalInfo, academicInput, lifestylePreference,
      activities, activityRows,
    };
    const serialized = JSON.stringify(draft);
    pendingDraftRef.current = serialized;
    const timer = window.setTimeout(() => {
      if (submittedRef.current) return;
      try { window.localStorage.setItem(DRAFT_KEY, serialized); } catch { /* storage unavailable */ }
      pendingDraftRef.current = null;
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    currentStep, programmeType, nationalities, subjects, admissionsTests,
    englishRequired, englishTestType, englishStatus, englishScoreOverall,
    personalInfo, academicInput, lifestylePreference, activities, activityRows,
    submitted,
  ]);

  // Warn before leaving with unsaved (unsubmitted) edits; flush any pending draft write.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (pendingDraftRef.current && !submittedRef.current) {
        try { window.localStorage.setItem(DRAFT_KEY, pendingDraftRef.current); } catch { /* storage unavailable */ }
        pendingDraftRef.current = null;
      }
      if (!isDirtyRef.current || submittedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const discardDraft = useCallback(() => {
    clearDraft();
    skipNextDraftSaveRef.current = true;
    setDraftNotice(false);
    setErrors({});
    if (initialPayload) {
      applyPayload(initialPayload);
      setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, initialStep)));
      return;
    }
    setProgrammeType('');
    setPersonalInfo(buildInitialPersonalInfo());
    setNationalities(['']);
    setAcademicInput(buildInitialAcademicInput());
    setSubjects(buildDefaultSubjects(''));
    setAdmissionsTests([]);
    setEnglishRequired('');
    setEnglishTestType('NONE');
    setEnglishStatus('missing');
    setEnglishScoreOverall('');
    setLifestylePreference(buildInitialLifestylePreference());
    setActivities(buildInitialActivities());
    setActivityRows([]);
    setCurrentStep(1);
  }, [clearDraft, initialPayload, applyPayload, initialStep, setCurrentStep]);

  useEffect(() => {
    if (englishRequired === 'no') {
      setEnglishTestType('WAIVER'); setEnglishStatus('met'); setEnglishScoreOverall(''); return;
    }
    if ((englishRequired === 'yes' || englishRequired === 'not_sure') && englishTestType === 'WAIVER') {
      setEnglishTestType('NONE');
    }
  }, [englishRequired, englishTestType]);

  // Suggest the admissions tests a chosen cluster implies.
  //
  // The updater MUST return `prev` unchanged when it adds nothing. It used to build
  // `[...prev]` and return it unconditionally — a fresh array reference every run — and
  // because `admissionsTests` is one of this effect's own dependencies, that reference
  // change re-triggered the effect, which produced another fresh array, forever.
  // Result: "Maximum update depth exceeded" and a wizard that never finished rendering,
  // for any student whose tests didn't already include a 'NONE' row (the early return
  // below was the only thing masking it).
  useEffect(() => {
    const wantsLaw = academicInput.intended_clusters.includes('law');
    const wantsMed = academicInput.intended_clusters.includes('medicine_dentistry');
    const alreadyNone = admissionsTests.some((t) => t.test_type === 'NONE');
    if (alreadyNone) return;
    setAdmissionsTests((prev) => {
      const additions: typeof prev = [];
      if (wantsLaw && !prev.some((t) => t.test_type === 'LNAT'))
        additions.push({ test_type: 'LNAT', status: '', score_numeric: '', percentile: '' });
      if (wantsMed && !prev.some((t) => t.test_type === 'UCAT'))
        additions.push({ test_type: 'UCAT', status: '', score_numeric: '', percentile: '' });
      if (additions.length === 0) return prev; // same reference — no re-render, no loop
      return [...prev, ...additions];
    });
  }, [academicInput.intended_clusters, admissionsTests]);

  const showEnglishScore = englishRequired !== 'no' && ['IELTS', 'TOEFL', 'DUOLINGO'].includes(englishTestType);
  const showAdmissionsTests =
    academicInput.intended_clusters.some((c) =>
      ['law', 'medicine_dentistry', 'maths', 'engineering', 'computer_science', 'economics_quant'].includes(c)
    ) || admissionsTests.length > 0;

  // ── State updaters ────────────────────────────────────────────────────────

  const updatePersonalInfo = (key: keyof typeof personalInfo, value: string) =>
    setPersonalInfo((prev) => ({ ...prev, [key]: value }));
  const updateAcademicInput = (key: keyof typeof academicInput, value: string) =>
    setAcademicInput((prev) => ({ ...prev, [key]: value }));
  const updateLifestylePreference = (key: keyof typeof lifestylePreference, value: string | string[]) =>
    setLifestylePreference((prev) => ({ ...prev, [key]: value }));

  const toggleCluster = (value: IntendedCluster, target: 'intended_clusters' | 'secondary_clusters') => {
    setAcademicInput((prev) => {
      if (target === 'intended_clusters') {
        return { ...prev, intended_clusters: prev.intended_clusters.includes(value) ? [] : [value] };
      }
      const cur = new Set(prev.secondary_clusters);
      if (cur.has(value)) { cur.delete(value); return { ...prev, secondary_clusters: Array.from(cur) }; }
      if (cur.size >= 2) return prev;
      cur.add(value);
      return { ...prev, secondary_clusters: Array.from(cur) };
    });
  };

  const toggleMulti = (list: string[], value: string, max?: number): string[] => {
    if (list.includes(value)) return list.filter((v) => v !== value);
    if (max && list.length >= max) return list;
    return [...list, value];
  };

  const toggleLocationPreference = (value: string) => {
    setLifestylePreference((prev) => {
      const cur = prev.desired_location_type;
      if (value === 'no_preference') {
        return { ...prev, desired_location_type: cur.includes('no_preference') ? [] : ['no_preference'] };
      }
      const withoutNone = cur.filter((v) => v !== 'no_preference');
      if (withoutNone.includes(value)) {
        return { ...prev, desired_location_type: withoutNone.filter((v) => v !== value) };
      }
      return { ...prev, desired_location_type: [...withoutNone, value] };
    });
  };

  const toggleAdmissionsTest = (testType: AdmissionsTestType) => {
    setAdmissionsTests((prev) => {
      if (testType === 'NONE') return [{ test_type: 'NONE', status: 'missing', score_numeric: '', percentile: '' }];
      const withoutNone = prev.filter((t) => t.test_type !== 'NONE');
      if (withoutNone.some((t) => t.test_type === testType))
        return withoutNone.filter((t) => t.test_type !== testType);
      return [...withoutNone, { test_type: testType, status: '', score_numeric: '', percentile: '' }];
    });
  };
  const updateAdmissionsTest = (index: number, key: keyof AdmissionsRowState, value: string) =>
    setAdmissionsTests((prev) => { const next = [...prev]; next[index] = { ...next[index], [key]: value }; return next; });

  const addNationality = () => setNationalities((prev) => [...prev, '']);
  const updateNationality = (i: number, v: string) =>
    setNationalities((prev) => { const next = [...prev]; next[i] = v; return next; });
  const removeNationality = (i: number) =>
    setNationalities((prev) => prev.filter((_, idx) => idx !== i));

  const updateSubject = (i: number, key: keyof SubjectRowState, value: string) =>
    setSubjects((prev) => { const next = [...prev]; next[i] = { ...next[i], [key]: value }; return next; });
  const addSubject = () =>
    setSubjects((prev) => prev.length >= getMaxSubjects(programmeType) ? prev : [...prev, buildEmptySubject(programmeType)]);
  const removeSubject = (i: number) =>
    setSubjects((prev) => prev.filter((_, idx) => idx !== i));

  const parseNumber = useCallback((v: string) => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, []);

  // Dynamic IB total from subject grades (sum of numeric grades 1–7)
  const ibSubjectSum = useMemo(() => {
    if (programmeType !== 'IB') return null;
    return subjects.reduce((acc, s) => {
      const g = parseNumber(s.grade_value);
      return g !== null && g >= 1 && g <= 7 ? acc + g : acc;
    }, 0);
  }, [programmeType, subjects, parseNumber]);

  const formattedNationalities = useMemo(
    () => nationalities.map((n) => n.trim()).filter(Boolean), [nationalities]
  );

  // ── Build payload ─────────────────────────────────────────────────────────

  const buildPayload = useCallback((): StudentProfilePayload => {
    const subjectList: StudentSubject[] = subjects.map((s) => ({
      subject_name: s.subject_name.trim(),
      level: s.level,
      grade_value: programmeType === 'IB'
        ? parseNumber(s.grade_value)
        : s.grade_value.trim() ? s.grade_value.trim() : null,
    }));

    const aLevelPredicted = programmeType === 'A_LEVEL'
      ? Object.fromEntries(
        subjectList
          .filter((s) => typeof s.grade_value === 'string' && s.subject_name)
          .map((s) => [s.subject_name, s.grade_value as 'A*' | 'A' | 'B' | 'C' | 'D' | 'E' | 'U'])
      )
      : null;

    const admissionsPayload: StudentAdmissionsTest[] = admissionsTests
      .filter((t) => t.test_type !== 'NONE')
      .map((t) => ({
        test_type: t.test_type,
        status: (t.status || 'missing') as AdmissionsStatus,
        score_numeric: parseNumber(t.score_numeric),
        percentile: parseNumber(t.percentile),
      }));

    return {
      personal_information: {
        first_name: personalInfo.first_name.trim(),
        last_name: personalInfo.last_name.trim(),
        email: personalInfo.email.trim(),
        phone: null,
        nationality: formattedNationalities.join(', '),
        age: parseNumber(personalInfo.age),
        gender: personalInfo.gender ? (personalInfo.gender as StudentProfilePayload['personal_information']['gender']) : null,
        resident_country: personalInfo.resident_country.trim(),
        current_location_city: personalInfo.current_location_city.trim() || null,
        time_zone: personalInfo.time_zone.trim() || null,
      },
      academic_input: {
        programme_type: programmeType as ProgrammeType,
        school_name: academicInput.school_name.trim(),
        school_country: academicInput.school_country.trim(),
        school_city: academicInput.school_city.trim() || null,
        school_type: academicInput.school_type ? (academicInput.school_type as StudentProfilePayload['academic_input']['school_type']) : null,
        language_of_instruction: null,
        graduation_year: Number(academicInput.graduation_year),
        desired_start_date: academicInput.desired_start_date || null,
        intended_clusters: academicInput.intended_clusters,
        secondary_clusters: academicInput.secondary_clusters,
        career_aspiration: academicInput.career_aspiration.trim() || null,
        subject_list: subjectList,
        ib_total_points: programmeType === 'IB' ? ibSubjectSum : null,
        ib_core_points: programmeType === 'IB' ? parseNumber(academicInput.ib_core_points) : null,
        ib_tok_grade: programmeType === 'IB' && academicInput.ib_tok_grade
          ? (academicInput.ib_tok_grade as StudentProfilePayload['academic_input']['ib_tok_grade']) : null,
        ib_ee_grade: programmeType === 'IB' && academicInput.ib_ee_grade
          ? (academicInput.ib_ee_grade as StudentProfilePayload['academic_input']['ib_ee_grade']) : null,
        ib_math_pathway: programmeType === 'IB' && academicInput.ib_math_pathway
          ? (academicInput.ib_math_pathway as StudentProfilePayload['academic_input']['ib_math_pathway']) : null,
        ee_subject: programmeType === 'IB' ? academicInput.ee_subject.trim() || null : null,
        ee_title: programmeType === 'IB' ? academicInput.ee_title.trim() || null : null,
        ee_summary: programmeType === 'IB' ? academicInput.ee_summary.trim() || null : null,
        a_level_predicted_grades: aLevelPredicted,
        english_required: englishRequired === 'yes' ? true : englishRequired === 'no' ? false : null,
        english_test_type: englishTestType,
        english_status: englishStatus,
        english_score_overall: showEnglishScore ? parseNumber(englishScoreOverall) : null,
        admissions_tests: admissionsPayload,
      },
      lifestyle_preference: {
        teaching_style: lifestylePreference.teaching_style ? (lifestylePreference.teaching_style as StudentProfilePayload['lifestyle_preference']['teaching_style']) : null,
        desired_location_type: (() => {
          const arr = lifestylePreference.desired_location_type;
          if (!arr || arr.length === 0) return null;
          // Store comma-separated; scoring treats multi-select same as no_preference
          return arr.join(',') as StudentProfilePayload['lifestyle_preference']['desired_location_type'];
        })(),
        campus_size: lifestylePreference.campus_size ? (lifestylePreference.campus_size as StudentProfilePayload['lifestyle_preference']['campus_size']) : null,
        extracurricular_interests: lifestylePreference.extracurricular_interests,
        other_extracurriculars: lifestylePreference.other_extracurriculars.trim() || null,
        leadership_roles: activities.leadership_roles,
        commitment_level: activities.commitment_level || null,
        // Derive legacy key_activities from structured rows for backward-compat scoring
        key_activities: activityRows.length > 0
          ? [...new Set(activityRows.map((r) => r.category).filter(Boolean))]
          : activities.key_activities,
        sat_score: parseNumber(activities.sat_score),
        act_score: parseNumber(activities.act_score),
        // Derive intl_experience from activity levels for backward-compat scoring
        intl_experience: activityRows.some((r) => r.level === 'National' || r.level === 'International')
          ? ['International competition']
          : activities.intl_experience,
        work_experience: activities.work_experience,
        work_experience_summary: activities.work_experience_summary.trim() || null,
        ambition_statement: activities.ambition_statement.trim() || null,
        epq_subject: (programmeType === 'A_LEVEL' || programmeType === 'ACT')
          ? activities.epq_subject.trim() || null : null,
        epq_title: (programmeType === 'A_LEVEL' || programmeType === 'ACT')
          ? activities.epq_title.trim() || null : null,
      } as StudentProfilePayload['lifestyle_preference'],
      activities_list: activityRows
        .filter((r) => r.category)
        .map((r, i) => ({
          category: r.category,
          level: (r.level || null) as any,
          duration: (r.duration || null) as any,
          highlight: r.highlight.trim() || null,
          sort_order: i,
        })),
    };
  }, [
    subjects, programmeType, parseNumber, admissionsTests, personalInfo,
    formattedNationalities, academicInput, englishRequired, englishTestType,
    englishStatus, showEnglishScore, englishScoreOverall, lifestylePreference,
    activities, activityRows, ibSubjectSum,
  ]);

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep1 = useCallback(() => {
    const e: Record<string, string> = {};
    if (!personalInfo.first_name.trim()) e['personal_information.first_name'] = 'First name is required.';
    if (!personalInfo.last_name.trim()) e['personal_information.last_name'] = 'Last name is required.';
    if (!personalInfo.email.trim()) e['personal_information.email'] = 'Email is required.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personalInfo.email.trim()))
      e['personal_information.email'] = 'Enter a valid email.';
    if (!formattedNationalities.length) e['personal_information.nationality'] = 'Add at least one nationality.';
    if (!personalInfo.resident_country.trim()) e['personal_information.resident_country'] = 'Country of residence is required.';
    return e;
  }, [personalInfo, formattedNationalities]);

  const validateStep2 = useCallback(() => {
    const e: Record<string, string> = {};
    if (!programmeType) e['academic_input.programme_type'] = 'Select IB or A-levels.';
    if (!academicInput.school_name.trim()) e['academic_input.school_name'] = 'School name is required.';
    if (!academicInput.school_country.trim()) e['academic_input.school_country'] = 'School country is required.';
    if (!academicInput.graduation_year) e['academic_input.graduation_year'] = 'Graduation year is required.';
    if (!academicInput.intended_clusters.length) e['academic_input.intended_clusters'] = 'Select at least one subject area.';
    return e;
  }, [programmeType, academicInput]);

  const validateSubjects = useCallback((e: Record<string, string>) => {
    const filled = subjects.filter((s) => s.subject_name.trim());
    if (programmeType === 'IB') {
      if (filled.length !== 6) e['academic_input.subject_list'] = 'IB requires exactly 6 subjects.';
      if (filled.filter((s) => s.level === 'HL').length !== 3)
        e['academic_input.subject_list.hl'] = 'IB requires 3 Higher Level subjects.';
    }
    if (programmeType === 'A_LEVEL') {
      if (filled.length < 3) e['academic_input.subject_list'] = 'A-levels require at least 3 subjects.';
      if (filled.length > 6) e['academic_input.subject_list'] = 'A-levels are limited to 6 subjects.';
    }
    subjects.forEach((s, i) => {
      if (!s.subject_name.trim()) e[`academic_input.subject_list.${i}.subject_name`] = 'Subject is required.';
      if (!s.grade_value.trim()) e[`academic_input.subject_list.${i}.grade_value`] = 'Grade is required.';
      else if (programmeType === 'IB') {
        const g = parseNumber(s.grade_value);
        if (g === null || g < 1 || g > 7) e[`academic_input.subject_list.${i}.grade_value`] = '1–7 only.';
      }
    });
  }, [subjects, programmeType, parseNumber]);

  const validateStep3 = useCallback(() => {
    const e: Record<string, string> = {};
    validateSubjects(e);
    if (programmeType === 'IB') {
      if (!academicInput.ib_math_pathway) e['academic_input.ib_math_pathway'] = 'Maths pathway required.';
      const cp = parseNumber(academicInput.ib_core_points);
      if (cp !== null && (cp < 0 || cp > 3)) e['academic_input.ib_core_points'] = '0–3 only.';
      if (academicInput.ee_summary && academicInput.ee_summary.length > 350)
        e['academic_input.ee_summary'] = 'Under 350 characters.';
    }
    if (!englishRequired) e['academic_input.english_required'] = 'Select an option.';
    if (englishRequired !== 'no') {
      if (!englishTestType) e['academic_input.english_test_type'] = 'Select a test type.';
      if (!englishStatus) e['academic_input.english_status'] = 'Select a status.';
    }
    admissionsTests.forEach((t, i) => {
      if (t.test_type === 'NONE') return;
      if (!t.status) e[`academic_input.admissions_tests.${i}.status`] = 'Select a status.';
    });
    return e;
  }, [validateSubjects, programmeType, academicInput, parseNumber, englishRequired, englishTestType, englishStatus, admissionsTests]);

  // Steps 4 & 5 are optional
  const validateStep4 = useCallback(() => ({} as Record<string, string>), []);
  const validateStep5 = useCallback(() => ({} as Record<string, string>), []);

  const validateCurrentStep = () => {
    switch (currentStep) {
      case 1: return validateStep1();
      case 2: return validateStep2();
      case 3: return validateStep3();
      case 4: return validateStep4();
      case 5: return validateStep5();
      default: return {};
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Scroll the first errored field into view and focus its input. */
  const focusFirstError = useCallback((errs: Record<string, string>, delay = 50) => {
    if (Object.keys(errs).length === 0) return;
    window.setTimeout(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-field]'));
      const exact = nodes.find((node) => {
        const key = node.getAttribute('data-field');
        return !!key && key in errs;
      });
      // Fall back to a container whose key prefixes an error key (e.g. subject_list → subject_list.hl)
      const target = exact ?? nodes.find((node) => {
        const key = node.getAttribute('data-field');
        return !!key && Object.keys(errs).some((k) => k.startsWith(`${key}.`));
      });
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
      (focusable ?? target).focus({ preventScroll: true });
    }, delay);
  }, []);

  const goNext = () => {
    const nextErrors = validateCurrentStep();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) { focusFirstError(nextErrors); return; }
    setCurrentStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  };

  const goBack = () => setCurrentStep((prev) => Math.max(1, prev - 1));

  const goToStep = (target: number) => {
    if (target === currentStep) return;
    if (target < currentStep) { setCurrentStep(target); return; }
    const nextErrors = validateCurrentStep();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) { focusFirstError(nextErrors); return; }
    setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, target)));
  };

  const restoreSavedProfile = () => {
    if (!initialPayload) return;
    clearDraft();
    skipNextDraftSaveRef.current = true;
    setDraftNotice(false);
    setErrors({}); setCurrentStep(1);
    setStatusMessage('Restored last saved progress.'); setStatusIsError(false);
    applyPayload(initialPayload);
  };

  const handleFinalSubmit = useCallback(() => {
    const s1 = validateStep1(); const s2 = validateStep2(); const s3 = validateStep3();
    const allErrors = { ...s1, ...s2, ...s3 };
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      if (Object.keys(s1).length > 0) setCurrentStep(1);
      else if (Object.keys(s2).length > 0) setCurrentStep(2);
      else setCurrentStep(3);
      // Wait for the step transition to finish before scrolling to the error.
      focusFirstError(allErrors, 600);
      return;
    }
    const payload = buildPayload();
    setStatusMessage('Saving…'); setStatusIsError(false);
    startTransition(async () => {
      try {
        const result = await saveStudentIntake(payload);
        if (!result?.success) {
          setStatusMessage(result?.message ?? 'Save failed.');
          setStatusIsError(true);
          return;
        }
        setStatusMessage('Profile saved! Your matches are ready.');
        setStatusIsError(false);
        setSubmitted(true);
        submittedRef.current = true;
        clearDraft();
        setDraftNotice(false);
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : 'Save failed.');
        setStatusIsError(true);
      }
    });
  }, [validateStep1, validateStep2, validateStep3, buildPayload, focusFirstError, clearDraft, setCurrentStep]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); handleFinalSubmit(); };

  useEffect(() => {
    contentTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentStep]);

  // ── Step completion (for sidebar indicators) ──────────────────────────────

  const stepCompletion = useMemo<Record<number, boolean>>(() => ({
    1: Object.keys(validateStep1()).length === 0,
    2: Object.keys(validateStep2()).length === 0,
    3: Object.keys(validateStep3()).length === 0,
    4: activities.leadership_roles.length > 0 || !!activities.commitment_level || activities.key_activities.length > 0,
    5: !!lifestylePreference.teaching_style || lifestylePreference.desired_location_type.length > 0 || !!lifestylePreference.campus_size,
    6: false,
  }), [validateStep1, validateStep2, validateStep3, activities, lifestylePreference]);

  const progressPct = Math.round(((currentStep - 1) / TOTAL_STEPS) * 100);

  /** aria-invalid / aria-describedby props for an errored input. */
  const a11yError = (key: string) =>
    errors[key]
      ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(key) }
      : {};

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <form className="relative font-sans" onSubmit={handleSubmit}>
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-64 lg:sticky lg:top-24 h-fit shrink-0">
          <div className="rounded-2xl border border-border/60 bg-background p-4 space-y-1 shadow-e-1">
            {/* Progress bar */}
            <div className="mb-4 px-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="eyebrow">Progress</span>
                <span className="text-label font-bold text-primary-ink">{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            {PROFILE_STEPS.map((step, idx) => {
              const stepNum = idx + 1;
              const isCurrent = stepNum === currentStep;
              const isDone = stepCompletion[stepNum];
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => goToStep(stepNum)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150 text-sm',
                    isCurrent
                      ? 'bg-primary/8 text-primary-ink font-semibold'
                      : isDone
                        ? 'text-success hover:bg-muted/50'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-lg text-label font-bold shrink-0',
                    isCurrent ? 'bg-primary text-primary-foreground'
                      : isDone ? 'bg-success-subtle text-success'
                        : 'bg-muted text-muted-foreground'
                  )}>
                    {isDone && !isCurrent ? <Check className="w-3 h-3" /> : stepNum}
                  </span>
                  <span className="truncate">{step.title}</span>
                </button>
              );
            })}

            {/* Review */}
            <button
              type="button"
              onClick={() => goToStep(TOTAL_STEPS)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150 text-sm',
                currentStep === TOTAL_STEPS
                  ? 'bg-primary/8 text-primary-ink font-semibold'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-lg text-label font-bold shrink-0',
                currentStep === TOTAL_STEPS ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                <Check className="w-3 h-3" />
              </span>
              <span className="truncate">Review</span>
            </button>

            {initialPayload ? (
              <button
                type="button"
                onClick={restoreSavedProfile}
                className="w-full mt-2 py-2 px-3 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Restore last save
              </button>
            ) : null}
          </div>
        </aside>

        {/* ── Main content ── */}
        <div ref={contentTopRef} className="flex-1 min-w-0">

          {/* Theme toggle */}
          <div className="mb-4 flex justify-end">
            <ThemeToggle compact />
          </div>

          {/* Restored-draft notice */}
          {draftNotice ? (
            <div
              role="status"
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
            >
              <span className="font-medium text-foreground">Restored your in-progress draft.</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={discardDraft}
                  className="px-2 py-1 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Discard draft
                </button>
                <button
                  type="button"
                  onClick={() => setDraftNotice(false)}
                  aria-label="Dismiss notice"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {/* Per-step heading */}
          <div className="mb-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={`heading-${currentStep}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                  {STEP_META[currentStep]?.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {STEP_META[currentStep]?.subtitle}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="space-y-6"
            >

              {/* ═══ STEP 1 — Personal info ═══════════════════════════════════ */}
              {currentStep === 1 ? (
                <section className="space-y-5">
                  {/* Name + email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1.5" data-field="personal_information.first_name">
                      <span className="text-sm font-medium">First name</span>
                      <input
                        type="text" autoComplete="given-name" className={cn(inputCls, errors['personal_information.first_name'] && 'border-destructive')}
                        {...a11yError('personal_information.first_name')}
                        value={personalInfo.first_name}
                        onChange={(e) => updatePersonalInfo('first_name', e.target.value)}
                        placeholder="Alex"
                      />
                      <FieldError msg={errors['personal_information.first_name']} id={fieldErrorId('personal_information.first_name')} />
                    </label>
                    <label className="space-y-1.5" data-field="personal_information.last_name">
                      <span className="text-sm font-medium">Last name</span>
                      <input
                        type="text" autoComplete="family-name" className={cn(inputCls, errors['personal_information.last_name'] && 'border-destructive')}
                        {...a11yError('personal_information.last_name')}
                        value={personalInfo.last_name}
                        onChange={(e) => updatePersonalInfo('last_name', e.target.value)}
                        placeholder="Smith"
                      />
                      <FieldError msg={errors['personal_information.last_name']} id={fieldErrorId('personal_information.last_name')} />
                    </label>
                  </div>
                  <label className="space-y-1.5 block" data-field="personal_information.email">
                    <span className="text-sm font-medium">Email</span>
                    <input
                      type="email" autoComplete="email" inputMode="email" spellCheck={false} className={cn(inputCls, errors['personal_information.email'] && 'border-destructive')}
                      {...a11yError('personal_information.email')}
                      value={personalInfo.email}
                      onChange={(e) => updatePersonalInfo('email', e.target.value)}
                      placeholder="alex@school.com"
                    />
                    <FieldError msg={errors['personal_information.email']} id={fieldErrorId('personal_information.email')} />
                  </label>

                  {/* Nationality */}
                  <SectionCard>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Nationality</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Add more than one if applicable.</p>
                      </div>
                      <button type="button" onClick={addNationality}
                        className="text-xs font-semibold text-primary-ink hover:text-primary-ink/80 transition-colors">
                        + Add another
                      </button>
                    </div>
                    <div className="space-y-3" data-field="personal_information.nationality">
                      {nationalities.map((val, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <div className="flex-1">
                            <CountryCombobox
                              value={val}
                              onChange={(v) => updateNationality(i, v)}
                              placeholder="Search nationality…"
                              error={i === 0 ? errors['personal_information.nationality'] : undefined}
                              errorId={fieldErrorId('personal_information.nationality')}
                            />
                          </div>
                          {nationalities.length > 1 && (
                            <button type="button" onClick={() => removeNationality(i)}
                              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  {/* Country of residence + City + Age + Gender */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1.5 block" data-field="personal_information.resident_country">
                      <span className="text-sm font-medium">Country of residence</span>
                      <CountryCombobox
                        value={personalInfo.resident_country}
                        onChange={(v) => updatePersonalInfo('resident_country', v)}
                        placeholder="Search country…"
                        error={errors['personal_information.resident_country']}
                        errorId={fieldErrorId('personal_information.resident_country')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">City <span className="text-xs">(optional)</span></span>
                      <input
                        type="text" className={inputCls}
                        value={personalInfo.current_location_city}
                        onChange={(e) => updatePersonalInfo('current_location_city', e.target.value)}
                        placeholder="London"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">Age <span className="text-xs">(optional)</span></span>
                      <input
                        type="number" min={10} max={60} className={inputCls}
                        value={personalInfo.age}
                        onChange={(e) => updatePersonalInfo('age', e.target.value)}
                        placeholder="17"
                      />
                    </label>
                  </div>

                  {/* Gender */}
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Gender <span className="text-xs">(optional)</span></span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'female', label: 'Female' },
                        { value: 'male', label: 'Male' },
                        { value: 'non_binary', label: 'Non-binary' },
                        { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                      ].map((opt) => (
                        <Chip
                          key={opt.value} label={opt.label}
                          selected={personalInfo.gender === opt.value}
                          onClick={() => updatePersonalInfo('gender', personalInfo.gender === opt.value ? '' : opt.value)}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {/* ═══ STEP 2 — Your studies ════════════════════════════════════ */}
              {currentStep === 2 ? (
                <section className="space-y-5">
                  {/* Programme type */}
                  <div className="space-y-2" data-field="academic_input.programme_type">
                    <p className="text-sm font-medium">Which qualification are you taking?</p>
                    <div className="flex flex-wrap gap-2">
                      {[{ value: 'IB', label: 'IB Diploma' }, { value: 'A_LEVEL', label: 'A-levels' }].map((opt) => (
                        <Chip
                          key={opt.value} label={opt.label}
                          selected={programmeType === opt.value}
                          onClick={() => setProgrammeType(opt.value as ProgrammeType)}
                        />
                      ))}
                    </div>
                    <FieldError msg={errors['academic_input.programme_type']} id={fieldErrorId('academic_input.programme_type')} />
                  </div>

                  {/* School */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1.5" data-field="academic_input.school_name">
                      <span className="text-sm font-medium">School name</span>
                      <input
                        type="text" className={cn(inputCls, errors['academic_input.school_name'] && 'border-destructive')}
                        {...a11yError('academic_input.school_name')}
                        value={academicInput.school_name}
                        onChange={(e) => updateAcademicInput('school_name', e.target.value)}
                        placeholder="Lycée International"
                      />
                      <FieldError msg={errors['academic_input.school_name']} id={fieldErrorId('academic_input.school_name')} />
                    </label>
                    <label className="space-y-1.5 block" data-field="academic_input.school_country">
                      <span className="text-sm font-medium">School country</span>
                      <CountryCombobox
                        value={academicInput.school_country}
                        onChange={(v) => updateAcademicInput('school_country', v)}
                        error={errors['academic_input.school_country']}
                        errorId={fieldErrorId('academic_input.school_country')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">School city <span className="text-xs">(optional)</span></span>
                      <input
                        type="text" className={inputCls}
                        value={academicInput.school_city}
                        onChange={(e) => updateAcademicInput('school_city', e.target.value)}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">School type <span className="text-xs">(optional)</span></span>
                      {/* `|| undefined` so an empty value shows the placeholder —
                        * Radix treats '' as a real (and illegal) item value. */}
                      <Select value={academicInput.school_type || ''}
                        onValueChange={(v) => updateAcademicInput('school_type', v === CLEAR ? '' : v)}>
                        <SelectTrigger aria-label="School type" className={selectTriggerCls}>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CLEAR}>Not specified</SelectItem>
                          {SCHOOL_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="space-y-1.5" data-field="academic_input.graduation_year">
                      <span className="text-sm font-medium">Graduation year</span>
                      <Select value={academicInput.graduation_year || ''}
                        onValueChange={(v) => updateAcademicInput('graduation_year', v === CLEAR ? '' : v)}>
                        <SelectTrigger
                          aria-label="Graduation year"
                          {...a11yError('academic_input.graduation_year')}
                          className={cn(selectTriggerCls, errors['academic_input.graduation_year'] && 'border-destructive')}>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* GRADUATION_YEARS is number[]; the state field is a string. */}
                          <SelectItem value={CLEAR}>Not specified</SelectItem>
                          {GRADUATION_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FieldError msg={errors['academic_input.graduation_year']} id={fieldErrorId('academic_input.graduation_year')} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">Preferred start date <span className="text-xs">(optional)</span></span>
                      <input
                        type="date" className={inputCls}
                        value={academicInput.desired_start_date}
                        onChange={(e) => updateAcademicInput('desired_start_date', e.target.value)}
                      />
                    </label>
                  </div>

                  {/* Subject clusters */}
                  <SectionCard>
                    <SectionTitle
                      label="What do you want to study?"
                      hint="Select your primary focus area."
                      why="We use this to shortlist the most relevant programmes and weight your eligibility scores."
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-field="academic_input.intended_clusters">
                      {CLUSTER_OPTIONS.map((opt) => (
                        <Chip
                          key={opt.value} label={opt.label} emoji={opt.emoji}
                          selected={academicInput.intended_clusters.includes(opt.value)}
                          disabled={!academicInput.intended_clusters.includes(opt.value) && academicInput.intended_clusters.length >= 1}
                          onClick={() => toggleCluster(opt.value, 'intended_clusters')}
                        />
                      ))}
                    </div>
                    <FieldError msg={errors['academic_input.intended_clusters']} id={fieldErrorId('academic_input.intended_clusters')} />
                  </SectionCard>

                  <SectionCard>
                    <SectionTitle label="Secondary interests" hint="Up to two — used to broaden your match pool." />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {CLUSTER_OPTIONS.map((opt) => (
                        <Chip
                          key={`sec-${opt.value}`} label={opt.label} emoji={opt.emoji}
                          selected={academicInput.secondary_clusters.includes(opt.value)}
                          disabled={!academicInput.secondary_clusters.includes(opt.value) && academicInput.secondary_clusters.length >= 2}
                          onClick={() => toggleCluster(opt.value, 'secondary_clusters')}
                        />
                      ))}
                    </div>
                  </SectionCard>

                  <label className="space-y-1.5 block">
                    <span className="text-sm font-medium text-muted-foreground">Career aspiration <span className="text-xs">(optional)</span></span>
                    <input
                      type="text" className={inputCls}
                      placeholder="Investment banker, software engineer, doctor…"
                      value={academicInput.career_aspiration}
                      onChange={(e) => updateAcademicInput('career_aspiration', e.target.value)}
                    />
                  </label>
                </section>
              ) : null}

              {/* ═══ STEP 3 — Grades & tests ══════════════════════════════════ */}
              {currentStep === 3 ? (
                <section className="space-y-5">
                  {/* Subjects */}
                  <SectionCard>
                    <div className="flex items-center justify-between gap-3">
                      <SectionTitle
                        label="Subjects & predicted grades"
                        hint={programmeType === 'A_LEVEL'
                          ? 'Minimum 3, maximum 4 A-levels.'
                          : 'IB: exactly 6 subjects with 3 HL.'}
                      />
                      <button
                        type="button"
                        disabled={subjects.length >= getMaxSubjects(programmeType)}
                        onClick={addSubject}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/8 text-primary-ink text-xs font-semibold hover:bg-primary/15 transition-[background-color,opacity] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>

                    {/* Column headers */}
                    <div className="hidden md:grid md:grid-cols-12 gap-3 px-1 pb-1">
                      <div className="md:col-span-5 eyebrow">Subject</div>
                      <div className="md:col-span-3 eyebrow">Level</div>
                      <div className="md:col-span-3 eyebrow">Grade</div>
                    </div>

                    <div className="space-y-3" data-field="academic_input.subject_list">
                      {subjects.map((subj, i) => (
                        <div key={i} className="md:grid md:grid-cols-12 md:gap-3 space-y-2 md:space-y-0 md:items-start">
                          <div className="md:col-span-5" data-field={`academic_input.subject_list.${i}.subject_name`}>
                            <label className="md:hidden text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
                            <SubjectCombobox
                              value={subj.subject_name}
                              onChange={(v) => updateSubject(i, 'subject_name', v)}
                              error={errors[`academic_input.subject_list.${i}.subject_name`]}
                              errorId={fieldErrorId(`academic_input.subject_list.${i}.subject_name`)}
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="md:hidden text-xs font-medium text-muted-foreground mb-1 block">Level</label>
                            <Select
                              value={subj.level}
                              onValueChange={(v) => updateSubject(i, 'level', v)}
                              disabled={programmeType === 'A_LEVEL'}
                            >
                              <SelectTrigger aria-label={`Level for subject ${i + 1}`} className={selectTriggerCls}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {programmeType === 'IB'
                                  ? <><SelectItem value="HL">HL</SelectItem><SelectItem value="SL">SL</SelectItem></>
                                  : <SelectItem value="A_LEVEL">A-level</SelectItem>}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-3" data-field={`academic_input.subject_list.${i}.grade_value`}>
                            <label className="md:hidden text-xs font-medium text-muted-foreground mb-1 block">Grade</label>
                            {programmeType === 'IB'
                              ? <input type="number" min={1} max={7} className={cn(inputCls, errors[`academic_input.subject_list.${i}.grade_value`] && 'border-destructive')}
                                  {...a11yError(`academic_input.subject_list.${i}.grade_value`)}
                                  value={subj.grade_value} onChange={(e) => updateSubject(i, 'grade_value', e.target.value)} placeholder="1–7" />
                              : <Select value={subj.grade_value || ''}
                                  onValueChange={(v) => updateSubject(i, 'grade_value', v === CLEAR ? '' : v)}>
                                  <SelectTrigger
                                    aria-label={`Grade for subject ${i + 1}`}
                                    {...a11yError(`academic_input.subject_list.${i}.grade_value`)}
                                    className={cn(selectTriggerCls, errors[`academic_input.subject_list.${i}.grade_value`] && 'border-destructive')}>
                                    <SelectValue placeholder="Grade…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={CLEAR}>Not specified</SelectItem>
                                    {A_LEVEL_GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                            }
                            <FieldError msg={errors[`academic_input.subject_list.${i}.grade_value`]} id={fieldErrorId(`academic_input.subject_list.${i}.grade_value`)} />
                          </div>
                          <div className="md:col-span-1 flex items-end justify-end md:justify-center pb-0.5">
                            <button type="button" onClick={() => removeSubject(i)}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <FieldError msg={errors['academic_input.subject_list']} id={fieldErrorId('academic_input.subject_list')} />
                    <FieldError msg={errors['academic_input.subject_list.hl']} id={fieldErrorId('academic_input.subject_list.hl')} />

                    {/* IB auto-calculated total */}
                    {programmeType === 'IB' && ibSubjectSum !== null ? (
                      <div className="mt-1 flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/15 px-4 py-3">
                        <span className="text-xs text-muted-foreground font-medium">Predicted from subjects:</span>
                        <span className={cn(
                          'text-sm font-bold',
                          ibSubjectSum >= 35 ? 'text-success' : ibSubjectSum >= 28 ? 'text-warning' : 'text-foreground'
                        )}>
                          {ibSubjectSum}/42
                        </span>
                        {academicInput.ib_core_points ? (
                          <span className="text-xs text-muted-foreground">
                            + {academicInput.ib_core_points} core = <strong>{ibSubjectSum + (Number(academicInput.ib_core_points) || 0)}</strong>/45
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">points (add core points below for total)</span>
                        )}
                      </div>
                    ) : null}
                  </SectionCard>

                  {/* IB extras */}
                  {programmeType === 'IB' ? (
                    <>
                      <div className="space-y-2" data-field="academic_input.ib_math_pathway">
                        <p className="text-sm font-medium">Maths pathway</p>
                        <div className="flex flex-wrap gap-2">
                          {[{ value: 'AA_HL', label: 'AA HL' }, { value: 'AA_SL', label: 'AA SL' },
                            { value: 'AI_HL', label: 'AI HL' }, { value: 'AI_SL', label: 'AI SL' }].map((opt) => (
                            <Chip key={opt.value} label={opt.label}
                              selected={academicInput.ib_math_pathway === opt.value}
                              onClick={() => updateAcademicInput('ib_math_pathway', academicInput.ib_math_pathway === opt.value ? '' : opt.value)} />
                          ))}
                        </div>
                        <FieldError msg={errors['academic_input.ib_math_pathway']} id={fieldErrorId('academic_input.ib_math_pathway')} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="space-y-1.5" data-field="academic_input.ib_core_points">
                          <span className="text-sm font-medium text-muted-foreground">Core points <span className="text-xs">(optional)</span></span>
                          <input type="number" min={0} max={3}
                            className={cn(inputCls, errors['academic_input.ib_core_points'] && 'border-destructive')}
                            {...a11yError('academic_input.ib_core_points')}
                            value={academicInput.ib_core_points}
                            onChange={(e) => updateAcademicInput('ib_core_points', e.target.value)}
                            placeholder="0–3" />
                          <FieldError msg={errors['academic_input.ib_core_points']} id={fieldErrorId('academic_input.ib_core_points')} />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">TOK grade <span className="text-xs">(optional)</span></span>
                          <Select value={academicInput.ib_tok_grade || ''}
                            onValueChange={(v) => updateAcademicInput('ib_tok_grade', v === CLEAR ? '' : v)}>
                            <SelectTrigger aria-label="TOK grade" className={selectTriggerCls}>
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CLEAR}>Not specified</SelectItem>
                              {IB_GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">EE grade <span className="text-xs">(optional)</span></span>
                          <Select value={academicInput.ib_ee_grade || ''}
                            onValueChange={(v) => updateAcademicInput('ib_ee_grade', v === CLEAR ? '' : v)}>
                            <SelectTrigger aria-label="EE grade" className={selectTriggerCls}>
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CLEAR}>Not specified</SelectItem>
                              {IB_GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">EE subject <span className="text-xs">(optional)</span></span>
                          <input type="text" className={inputCls} value={academicInput.ee_subject}
                            onChange={(e) => updateAcademicInput('ee_subject', e.target.value)} />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">EE title <span className="text-xs">(optional)</span></span>
                          <input type="text" className={inputCls} value={academicInput.ee_title}
                            onChange={(e) => updateAcademicInput('ee_title', e.target.value)} />
                        </label>
                      </div>
                      <label className="space-y-1.5 block" data-field="academic_input.ee_summary">
                        <span className="text-sm font-medium text-muted-foreground">EE summary <span className="text-xs">(optional, max 350 chars)</span></span>
                        <textarea rows={3} maxLength={350}
                          className={cn(inputCls, 'h-auto py-3 resize-y', errors['academic_input.ee_summary'] && 'border-destructive')}
                          {...a11yError('academic_input.ee_summary')}
                          value={academicInput.ee_summary}
                          onChange={(e) => updateAcademicInput('ee_summary', e.target.value)}
                          placeholder="1–3 sentences" />
                        <FieldError msg={errors['academic_input.ee_summary']} id={fieldErrorId('academic_input.ee_summary')} />
                      </label>
                    </>
                  ) : null}

                  {/* English proficiency */}
                  <SectionCard>
                    <SectionTitle
                      label="English proficiency"
                      hint="Some universities require a formal test score."
                      why="We flag whether a language test is still needed and which threshold applies for each programme."
                    />
                    <div className="space-y-1.5" data-field="academic_input.english_required">
                      <p className="text-sm font-medium">Will you need to prove English proficiency?</p>
                      <div className="flex flex-wrap gap-2">
                        {[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }].map((opt) => (
                          <Chip key={opt.value} label={opt.label}
                            selected={englishRequired === opt.value}
                            onClick={() => setEnglishRequired(opt.value as EnglishRequiredState)} />
                        ))}
                      </div>
                      <FieldError msg={errors['academic_input.english_required']} id={fieldErrorId('academic_input.english_required')} />
                    </div>
                    {englishRequired !== 'no' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <label className="space-y-1.5" data-field="academic_input.english_test_type">
                          <span className="text-sm font-medium">Test type</span>
                          <Select
                            value={englishTestType || ''}
                            onValueChange={(v) => setEnglishTestType(v as EnglishTestType)}>
                            <SelectTrigger
                              aria-label="Test type"
                              {...a11yError('academic_input.english_test_type')}
                              className={cn(selectTriggerCls, errors['academic_input.english_test_type'] && 'border-destructive')}>
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {ENGLISH_TEST_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FieldError msg={errors['academic_input.english_test_type']} id={fieldErrorId('academic_input.english_test_type')} />
                        </label>
                        <div className="space-y-1.5" data-field="academic_input.english_status">
                          <p className="text-sm font-medium">Test status</p>
                          <div className="flex flex-wrap gap-2">
                            {ENGLISH_STATUS_OPTIONS.map((opt) => (
                              <Chip key={opt.value} label={opt.label}
                                selected={englishStatus === opt.value}
                                onClick={() => setEnglishStatus(opt.value as EnglishStatus)} />
                            ))}
                          </div>
                          <FieldError msg={errors['academic_input.english_status']} id={fieldErrorId('academic_input.english_status')} />
                        </div>
                        {showEnglishScore ? (
                          <label className="space-y-1.5">
                            <span className="text-sm font-medium text-muted-foreground">Overall score <span className="text-xs">(optional)</span></span>
                            <input type="number" className={inputCls} value={englishScoreOverall}
                              onChange={(e) => setEnglishScoreOverall(e.target.value)} placeholder="e.g. 7.0" />
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </SectionCard>

                  {/* Admissions tests */}
                  {showAdmissionsTests ? (
                    <SectionCard>
                      <SectionTitle
                        label="Admissions tests"
                        hint="Select the tests you've taken or booked."
                        why="Some programmes require specific admissions tests for eligibility — we flag this in your matches."
                      />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ADMISSIONS_TEST_OPTIONS.map((opt) => (
                          <Chip key={opt.value} label={opt.label}
                            selected={admissionsTests.some((t) => t.test_type === opt.value)}
                            onClick={() => toggleAdmissionsTest(opt.value)} />
                        ))}
                      </div>
                      {admissionsTests.filter((t) => t.test_type !== 'NONE').map((test, i) => (
                        <div key={`${test.test_type}-${i}`} className="rounded-xl border border-border/60 bg-background p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          <div className="md:col-span-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Test</p>
                            <p className="text-sm font-bold">{test.test_type}</p>
                          </div>
                          <div className="md:col-span-5" data-field={`academic_input.admissions_tests.${i}.status`}>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Status</p>
                            <div className="flex flex-wrap gap-1.5">
                              {[{ value: 'taken', label: 'Taken' }, { value: 'booked', label: 'Booked' }, { value: 'missing', label: 'Not yet' }].map((opt) => (
                                <Chip key={opt.value} label={opt.label}
                                  selected={test.status === opt.value}
                                  onClick={() => updateAdmissionsTest(i, 'status', opt.value)} />
                              ))}
                            </div>
                            <FieldError msg={errors[`academic_input.admissions_tests.${i}.status`]} id={fieldErrorId(`academic_input.admissions_tests.${i}.status`)} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Score</span>
                              <input type="number" className={inputCls} value={test.score_numeric}
                                onChange={(e) => updateAdmissionsTest(i, 'score_numeric', e.target.value)} placeholder="Value" />
                            </label>
                          </div>
                          <div className="md:col-span-3">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Percentile</span>
                              <input type="number" min={0} max={100} className={inputCls} value={test.percentile}
                                onChange={(e) => updateAdmissionsTest(i, 'percentile', e.target.value)} placeholder="0–100" />
                            </label>
                          </div>
                        </div>
                      ))}
                    </SectionCard>
                  ) : null}

                  {/* EPQ / Extended Project — A-level only */}
                  {(programmeType === 'A_LEVEL' || programmeType === 'ACT') ? (
                    <SectionCard>
                      <SectionTitle
                        label="Extended Project (EPQ)"
                        hint="Optional — if you've written an EPQ or equivalent independent research project."
                        why="Universities value self-directed research. A relevant EPQ can strengthen your application for competitive programmes."
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">Subject area <span className="text-xs">(optional)</span></span>
                          <input type="text" className={inputCls}
                            value={activities.epq_subject}
                            onChange={(e) => setActivities((prev) => ({ ...prev, epq_subject: e.target.value }))}
                            placeholder="e.g. Biology, Economics, History" />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">Project title <span className="text-xs">(optional)</span></span>
                          <input type="text" className={inputCls}
                            value={activities.epq_title}
                            onChange={(e) => setActivities((prev) => ({ ...prev, epq_title: e.target.value }))}
                            placeholder="e.g. To what extent does microfinance reduce poverty?" />
                        </label>
                      </div>
                    </SectionCard>
                  ) : null}

                  {/* SAT / ACT — optional, for international applications */}
                  <SectionCard>
                    <SectionTitle
                      label="SAT / ACT scores"
                      hint="Optional — only relevant if applying to US-style programmes."
                      why="US universities use SAT/ACT scores in admissions. We use this to flag eligibility and score fit."
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">SAT score <span className="text-xs">(400–1600, optional)</span></span>
                        <input type="number" min={400} max={1600} className={inputCls}
                          value={activities.sat_score}
                          onChange={(e) => setActivities((prev) => ({ ...prev, sat_score: e.target.value }))}
                          placeholder="e.g. 1450" />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">ACT score <span className="text-xs">(1–36, optional)</span></span>
                        <input type="number" min={1} max={36} className={inputCls}
                          value={activities.act_score}
                          onChange={(e) => setActivities((prev) => ({ ...prev, act_score: e.target.value }))}
                          placeholder="e.g. 32" />
                      </label>
                    </div>
                  </SectionCard>
                </section>
              ) : null}

              {/* ═══ STEP 4 — Activities & ambitions ═════════════════════════ */}
              {currentStep === 4 ? (
                <section className="space-y-5">

                  {/* ── Leadership ─────────────────────────────────────────── */}
                  <SectionCard>
                    <SectionTitle label="Leadership roles" hint="Select all that apply — or none." />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {LEADERSHIP_OPTIONS.map((opt) => (
                        <Chip key={opt} label={opt}
                          selected={activities.leadership_roles.includes(opt)}
                          onClick={() => setActivities((prev) => ({
                            ...prev,
                            leadership_roles: opt === 'None'
                              ? (prev.leadership_roles.includes('None') ? [] : ['None'])
                              : toggleMulti(prev.leadership_roles.filter((r) => r !== 'None'), opt)
                          }))} />
                      ))}
                    </div>
                  </SectionCard>

                  {/* ── Overall involvement ───────────────────────────────── */}
                  <SectionCard>
                    <SectionTitle label="Overall involvement level" hint="Across everything — sport, competitions, clubs, volunteering." />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {COMMITMENT_OPTIONS.map((opt) => (
                        <Chip key={opt.value} label={opt.label} description={opt.desc}
                          selected={activities.commitment_level === opt.value}
                          onClick={() => setActivities((prev) => ({
                            ...prev, commitment_level: prev.commitment_level === opt.value ? '' : opt.value
                          }))} />
                      ))}
                    </div>
                  </SectionCard>

                  {/* ── Activity entries ──────────────────────────────────── */}
                  <SectionCard>
                    <SectionTitle
                      label="Your activities"
                      hint="Add each activity separately — you can include sport, competitions, volunteering, music, anything significant."
                      why="Universities look at depth, level, and achievement — not just a list of hobbies. The more specific you are, the better your counsellor can support you."
                    />

                    {activityRows.length === 0 && (
                      <p className="text-sm text-muted-foreground">No activities added yet. Hit the button below to start.</p>
                    )}

                    <div className="space-y-3">
                      {activityRows.map((row) => (
                        <div key={row.localId} className="rounded-xl border border-border/70 bg-background p-4 space-y-3">
                          {/* Row header: category + delete */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Activity type</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ACTIVITY_CATEGORIES.map((cat) => (
                                  <Chip key={cat} label={cat}
                                    selected={row.category === cat}
                                    onClick={() => updateActivityRow(row.localId, 'category', row.category === cat ? '' : cat)} />
                                ))}
                              </div>
                            </div>
                            <button type="button"
                              className="mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                              onClick={() => removeActivityRow(row.localId)}
                              aria-label="Remove activity">
                              <Trash2 className="w-4 h-4" aria-hidden />
                            </button>
                          </div>

                          {/* Level + Duration */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Highest level reached</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ACTIVITY_LEVELS.map((lvl) => (
                                  <Chip key={lvl} label={lvl}
                                    selected={row.level === lvl}
                                    onClick={() => updateActivityRow(row.localId, 'level', row.level === lvl ? '' : lvl)} />
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Duration</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ACTIVITY_DURATIONS.map((dur) => (
                                  <Chip key={dur} label={dur}
                                    selected={row.duration === dur}
                                    onClick={() => updateActivityRow(row.localId, 'duration', row.duration === dur ? '' : dur)} />
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Highlight */}
                          <label className="block space-y-1">
                            <span className="text-xs font-semibold text-muted-foreground">
                              {row.category === 'Academic Competition' || row.category === 'Science Competition'
                                ? 'Result / award'
                                : 'Key achievement or highlight'}
                              <span className="font-normal ml-1">(optional)</span>
                            </span>
                            <input type="text" maxLength={150} className={inputCls}
                              value={row.highlight}
                              onChange={(e) => updateActivityRow(row.localId, 'highlight', e.target.value)}
                              placeholder={
                                row.category === 'Academic Competition' ? 'e.g. 2nd place, Bangkok Economics Essay Competition'
                                : row.category === 'Sport' ? 'e.g. FOBISIA Games champion 3 years, national tournament finalist'
                                : row.category === 'Music' ? 'e.g. Grade 8 distinction, orchestra principal'
                                : 'e.g. Best delegate award, 3 years running'
                              } />
                          </label>
                        </div>
                      ))}
                    </div>

                    {activityRows.length < 10 && (
                      <button type="button"
                        className="mt-1 flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:text-primary-ink/80 transition-colors"
                        onClick={addActivityRow}>
                        <PlusCircle className="w-4 h-4" aria-hidden />
                        Add activity
                      </button>
                    )}
                  </SectionCard>

                  {/* ── Work experience ───────────────────────────────────── */}
                  <SectionCard>
                    <SectionTitle label="Work experience or internships" hint="Any paid or unpaid work outside school." />
                    <div className="flex gap-2">
                      {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map((opt) => (
                        <Chip key={String(opt.value)} label={opt.label}
                          selected={activities.work_experience === opt.value}
                          onClick={() => setActivities((prev) => ({ ...prev, work_experience: opt.value }))} />
                      ))}
                    </div>
                    {activities.work_experience ? (
                      <label className="space-y-1.5 block">
                        <span className="text-sm font-medium text-muted-foreground">Brief description <span className="text-xs">(optional)</span></span>
                        <textarea rows={2} className={cn(inputCls, 'h-auto py-3 resize-none')}
                          value={activities.work_experience_summary}
                          onChange={(e) => setActivities((prev) => ({ ...prev, work_experience_summary: e.target.value }))}
                          placeholder="e.g. Summer internship at a law firm, 2 months" />
                      </label>
                    ) : null}
                  </SectionCard>

                  {/* ── Ambition statement ────────────────────────────────── */}
                  <SectionCard>
                    <SectionTitle
                      label="Where do you want to go?"
                      hint="Optional — 2–3 sentences on your goals or what drives you."
                      why="Your counsellor uses this to give more targeted guidance and personalise your programme shortlist."
                    />
                    <textarea rows={3} className={cn(inputCls, 'h-auto py-3 resize-none')}
                      value={activities.ambition_statement}
                      onChange={(e) => setActivities((prev) => ({ ...prev, ambition_statement: e.target.value }))}
                      placeholder="e.g. I want to study biomedical sciences and eventually research treatments for autoimmune diseases. I'm particularly interested in universities with strong research output and lab access for undergraduates." />
                  </SectionCard>

                </section>
              ) : null}

              {/* ═══ STEP 5 — Lifestyle preferences ══════════════════════════ */}
              {currentStep === 5 ? (
                <section className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Teaching style preference</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'academic', label: 'Academic', desc: 'Lectures, seminars, theory-heavy' },
                        { value: 'practical', label: 'Practical', desc: 'Project-based, hands-on' },
                        { value: 'mixed', label: 'Mixed', desc: 'Best of both' },
                        { value: '', label: 'No preference' },
                      ].map((opt) => (
                        <Chip key={opt.value} label={opt.label} description={opt.desc}
                          selected={lifestylePreference.teaching_style === opt.value}
                          onClick={() => updateLifestylePreference('teaching_style', opt.value)} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Preferred location type</p>
                    <p className="text-xs text-muted-foreground">Select as many as you like. Choosing multiple is fine — it won&apos;t affect your score.</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'capital_city', label: '🏙 Capital city' },
                        { value: 'major_city', label: '🌆 Major city' },
                        { value: 'smaller_city', label: '🏘 Smaller city' },
                        { value: 'suburban', label: '🌿 Suburban / campus' },
                        { value: 'no_preference', label: 'No preference' },
                      ].map((opt) => (
                        <Chip key={opt.value} label={opt.label}
                          selected={lifestylePreference.desired_location_type.includes(opt.value)}
                          onClick={() => toggleLocationPreference(opt.value)} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Campus size preference</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'small', label: 'Small', desc: '<5k students' },
                        { value: 'medium', label: 'Medium', desc: '5–15k' },
                        { value: 'large', label: 'Large', desc: '15k+' },
                        { value: 'no_preference', label: 'No preference' },
                      ].map((opt) => (
                        <Chip key={opt.value} label={opt.label} description={(opt as any).desc}
                          selected={lifestylePreference.campus_size === opt.value}
                          onClick={() => updateLifestylePreference('campus_size', opt.value)} />
                      ))}
                    </div>
                  </div>

                  <SectionCard>
                    <SectionTitle label="Extracurricular interests" hint="What matters to you in campus life." />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {EXTRACURRICULAR_OPTIONS.map((opt) => (
                        <Chip key={opt} label={opt}
                          selected={lifestylePreference.extracurricular_interests.includes(opt)}
                          onClick={() => updateLifestylePreference(
                            'extracurricular_interests',
                            toggleMulti(lifestylePreference.extracurricular_interests, opt)
                          )} />
                      ))}
                    </div>
                    <label className="space-y-1.5 block pt-1">
                      <span className="text-xs text-muted-foreground">Anything else?</span>
                      <input type="text" className={inputCls}
                        value={lifestylePreference.other_extracurriculars}
                        onChange={(e) => updateLifestylePreference('other_extracurriculars', e.target.value)}
                        placeholder="Chess club, anime society…" />
                    </label>
                  </SectionCard>
                </section>
              ) : null}

              {/* ═══ STEP 6 — Review ══════════════════════════════════════════ */}
              {currentStep === TOTAL_STEPS ? (
                <section className="space-y-4">
                  {/* Personal */}
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Personal information</p>
                      <button type="button" onClick={() => setCurrentStep(1)}
                        className="text-xs text-primary-ink hover:text-primary-ink/80 transition-colors font-medium">Edit</button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div><span className="text-muted-foreground">Name</span><br />{[personalInfo.first_name, personalInfo.last_name].filter(Boolean).join(' ') || '—'}</div>
                      <div><span className="text-muted-foreground">Email</span><br />{personalInfo.email || '—'}</div>
                      <div><span className="text-muted-foreground">Nationality</span><br />{formattedNationalities.join(', ') || '—'}</div>
                      <div><span className="text-muted-foreground">Residence</span><br />{personalInfo.resident_country || '—'}</div>
                    </div>
                  </SectionCard>

                  {/* Academic */}
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Studies</p>
                      <button type="button" onClick={() => setCurrentStep(2)}
                        className="text-xs text-primary-ink hover:text-primary-ink/80 transition-colors font-medium">Edit</button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div><span className="text-muted-foreground">Programme</span><br />{programmeType || '—'}</div>
                      <div><span className="text-muted-foreground">School</span><br />{academicInput.school_name || '—'}</div>
                      <div><span className="text-muted-foreground">Focus</span><br />{academicInput.intended_clusters.map((c) => clusterLabelMap.get(c)).join(', ') || '—'}</div>
                      <div><span className="text-muted-foreground">Graduation</span><br />{academicInput.graduation_year || '—'}</div>
                    </div>
                  </SectionCard>

                  {/* Grades */}
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Grades & tests</p>
                      <button type="button" onClick={() => setCurrentStep(3)}
                        className="text-xs text-primary-ink hover:text-primary-ink/80 transition-colors font-medium">Edit</button>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Subjects:</span> {subjects.filter((s) => s.subject_name.trim()).length}</p>
                      {programmeType === 'IB' && academicInput.ib_total_points ?
                        <p><span className="text-muted-foreground">IB points:</span> {academicInput.ib_total_points}</p> : null}
                      <p><span className="text-muted-foreground">English:</span> {englishRequired ? { yes: 'Required', no: 'Not required', not_sure: 'Not sure' }[englishRequired] ?? '—' : '—'}</p>
                    </div>
                  </SectionCard>

                  {/* Activities */}
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Activities</p>
                      <button type="button" onClick={() => setCurrentStep(4)}
                        className="text-xs text-primary-ink hover:text-primary-ink/80 transition-colors font-medium">Edit</button>
                    </div>
                    <div className="text-sm space-y-1">
                      {activities.commitment_level ? <p><span className="text-muted-foreground">Commitment:</span> {COMMITMENT_OPTIONS.find((o) => o.value === activities.commitment_level)?.label}</p> : null}
                      {activities.key_activities.length > 0 ? <p><span className="text-muted-foreground">Activities:</span> {activities.key_activities.join(', ')}</p> : null}
                      {activities.leadership_roles.length > 0 ? <p><span className="text-muted-foreground">Leadership:</span> {activities.leadership_roles.join(', ')}</p> : null}
                    </div>
                  </SectionCard>

                  {/* Status + CTA */}
                  {statusMessage ? (
                    <div
                      role={statusIsError ? 'alert' : 'status'}
                      className={cn(
                        'rounded-xl px-4 py-3 text-sm font-medium',
                        submitted
                          ? 'bg-success-subtle text-success'
                          : statusIsError
                            ? 'bg-destructive/10 text-destructive border border-destructive/30'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {statusMessage}
                    </div>
                  ) : null}
                  {submitted ? (
                    <div className="flex justify-center pt-2">
                      <a
                        href="/matches"
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-e-1 hover:bg-primary/90 transition-colors"
                      >
                        Get me to my matches →
                      </a>
                    </div>
                  ) : null}
                </section>
              ) : null}

            </motion.div>
          </AnimatePresence>

          {/* ── Navigation buttons ── */}
          <div className="mt-8 flex items-center justify-between gap-3 pt-4 border-t border-border/50">
            <Button
              type="button" variant="outline" size="sm"
              onClick={goBack} disabled={currentStep === 1}
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>

            {currentStep < TOTAL_STEPS ? (
              <Button type="button" size="sm" onClick={goNext} className="gap-1.5">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="submit" size="sm"
                disabled={isSaving || submitted}
                className="gap-1.5 px-6"
              >
                {submitted ? 'Profile saved ✓' : isSaving ? 'Saving…' : 'Submit & see matches'}
              </Button>
            )}
          </div>
        </div>
      </div>

    </form>
  );
};
