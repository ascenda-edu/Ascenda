'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  Check, ChevronRight, ChevronLeft,
  Trash2, PlusCircle, Info, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROFILE_STEPS, FIRST_BOOSTER_STEP_INDEX, ESSENTIAL_STEP_KEYS, type StepKey } from '@/lib/profile/steps';
import { Chip } from '@/components/profile/wizard/chip';
import { Combobox } from '@/components/profile/wizard/combobox';
import { ReviewSection } from '@/components/profile/wizard/review-section';
import { IntakeRail, type RailStep } from '../wizard/_components/intake-rail';
import { IntakeStepMeter } from '../wizard/_components/intake-step-meter';
import { cn } from '@/lib/utils';
import { EASE, EASE_POP, DURATION, TRAVEL } from '@/lib/motion';
import type {
  AdmissionsTestType, EnglishStatus, EnglishTestType,
  IntendedCluster, ProgrammeType, StudentProfilePayload
} from '@/lib/profile/intake-types';
import {
  ACTIVITY_CATEGORIES, ACTIVITY_DURATIONS, ACTIVITY_LEVELS, ADMISSIONS_TEST_OPTIONS,
  A_LEVEL_GRADES, CLUSTER_OPTIONS, COMMITMENT_OPTIONS, COUNTRY_OPTIONS,
  ENGLISH_STATUS_OPTIONS, ENGLISH_TEST_OPTIONS, EXTRACURRICULAR_OPTIONS, GRADUATION_YEARS,
  IB_GRADES, LEADERSHIP_OPTIONS, SCHOOL_TYPE_OPTIONS, SUBJECT_OPTIONS,
  buildDefaultSubjects, buildNextSubject, clusterLabelMap, getMaxSubjects,
  type ActivityRowState, type AdmissionsRowState, type EnglishRequiredState, type SubjectRowState
} from '@/lib/profile/intake-options';
import {
  buildInitialAcademicInput, buildInitialActivities, buildInitialLifestylePreference,
  buildInitialPersonalInfo, computeIbSubjectSum, formatNationalities, fromPayload,
  shouldShowAdmissionsTests, shouldShowEnglishScore, toPayload,
  type IntakeFormState
} from '@/lib/profile/intake-logic';
import { validateStep, validateStep1, validateStep2, validateStep3, validatePayload, stepForFieldKey } from '@/lib/profile/intake-validation';
import { saveStudentIntake } from '../actions';
import { markOnboardingStep } from '@/lib/onboarding/actions';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';

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

// ─── Draft persistence ───────────────────────────────────────────────────────

const DRAFT_KEY = 'ascenda-intake-draft';

/** The persisted draft is the whole form state plus where the student had got to. */
type IntakeDraft = IntakeFormState & {
  version: 1;
  savedAt: number;
  currentStep: number;
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

// FIELD SHAPE: `.form-input` (tailwind.config.ts) — the app-wide input treatment,
// and the reason this wizard stopped looking a generation behind the rest of the
// app. It replaced a local `inputCls` (h-11, rounded-xl, ring-primary/30,
// ring-offset-0) that predated the shared class, so the wizard's fields were 2px
// shorter, 4px sharper and had a different focus ring from every other form in
// the product. `SelectTrigger`'s default size is a deliberate clone of the same
// class (see src/components/ui/select.tsx), so a select and a text field sharing
// a grid row now match BY CONSTRUCTION rather than by two constants agreeing.
// Do not reintroduce a local variant: use `cn('form-input', …)`.

// These fields are OPTIONAL and their native predecessors had a selectable
// `<option value="">` — so a user could set a value and then take it back. A
// placeholder alone is not a substitute: it only shows while the field is empty
// and can never be re-chosen. This sentinel restores that path, mapped back to
// '' at the boundary so the submitted payload is unchanged. It is NOT decoration:
// `<SelectItem value="">` mounts fine and then does nothing when clicked, because
// the wrapper swallows `onValueChange('')` app-wide — see ui/select.tsx. Pinned by
// "the CLEAR sentinel un-sets an optional Select" in the characterization suite.
const CLEAR = '__clear';

// NOTE the Selects below bind `value={state || ''}`, NOT `|| undefined`. Radix decides
// controlled-ness with `prop !== undefined`, so `undefined` flips the Select to
// UNCONTROLLED — and on the way back from a real value to '' it then renders its stale
// internal value. Net effect: picking "Not specified" saved null but kept displaying
// the old option. An unmatched '' on the ROOT is fine and shows the placeholder; only
// SelectItem is the case that silently fails.

/** Stable DOM id for a validation error message, so inputs can point at it via aria-describedby. */
const fieldErrorId = (key: string) => `intake-error-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

function FieldError({ msg, id }: { msg?: string; id?: string }) {
  if (!msg) return null;
  // `text-danger`, NOT `text-destructive`. `--destructive` is documented in
  // globals.css as an ACTION colour tuned to carry white `--destructive-foreground`
  // — as copy it measures 4.80:1 light and 2.47:1 DARK, an AA failure on every
  // validation message in the wizard. `--danger` is the status text token: 5.86:1
  // and 7.57:1. Same class of mistake as `text-primary` vs `text-primary-ink`, and
  // `check-design-tokens.mjs` does not lint for it.
  return <p id={id} role="alert" className="mt-1 text-xs font-medium text-danger">{msg}</p>;
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
        {/* An <h3>, not a <p>. These are the form's section headings — "Subjects &
          * predicted grades", "English proficiency", "Admissions tests" — and they
          * read as headings, but as paragraphs they were invisible to the
          * heading-navigation a screen-reader user relies on to move through a long
          * step. h3 is the right level: PageHero owns the h1, the step title is the
          * h2. `.text-body-sm` rather than `text-sm` because h1-h6 pick up
          * `font-heading tracking-tight` from globals.css, and these should stay in
          * the body voice — they are labels, not display type. */}
        <h3 className="text-body-sm font-semibold text-foreground">{label}</h3>
        {hint ? <p className="text-xs text-muted-foreground mt-0.5">{hint}</p> : null}
      </div>
      {why ? (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
          className="-my-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-3.5 text-label text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Info className="w-3.5 h-3.5" />
          Why we ask
          {open ? <X className="w-3 h-3" /> : null}
        </button>
      ) : null}
      {open && why ? (
        <div className="absolute right-0 z-overlay mt-6 w-56 rounded-xl border border-border bg-popover p-3 text-xs leading-relaxed text-muted-foreground shadow-e-3">
          {why}
        </div>
      ) : null}
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
  /** Pending `focusFirstError` timer — cancelled on re-entry and on unmount. */
  const focusTimerRef = useRef<number | null>(null);
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

  /** Push a saved profile into state. All of the normalisation lives in `fromPayload`. */
  const applyPayload = useCallback((payload: StudentProfilePayload) => {
    const next = fromPayload(payload);
    skipProgrammeResetRef.current = true;
    setProgrammeType(next.programmeType);
    setPersonalInfo(next.personalInfo);
    setNationalities(next.nationalities);
    setAcademicInput(next.academicInput);
    setSubjects(next.subjects);
    setAdmissionsTests(next.admissionsTests);
    setEnglishRequired(next.englishRequired);
    setEnglishTestType(next.englishTestType);
    setEnglishStatus(next.englishStatus);
    setEnglishScoreOverall(next.englishScoreOverall);
    setLifestylePreference(next.lifestylePreference);
    setActivities(next.activities);
    setActivityRows(next.activityRows);
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

  // Suggest the admissions tests a chosen cluster implies — once per cluster change.
  //
  // `admissionsTests` is deliberately NOT a dependency: this effect WRITES that state,
  // so depending on it makes the effect re-trigger itself. Two separate bugs came out of
  // that. (1) The updater used to return `[...prev]` unconditionally — a fresh reference
  // every run — so the effect fed itself forever: "Maximum update depth exceeded", and a
  // wizard that never finished rendering for any student without a 'NONE' row. (2) Even
  // returning `prev` when nothing changed, a suggested row could never be REMOVED:
  // deselecting the LNAT chip changed `admissionsTests`, which re-ran the effect, which
  // added LNAT straight back. Keying only on the cluster list fixes both — the current
  // rows are read inside the updater, where they don't create a feedback loop.
  useEffect(() => {
    const wantsLaw = academicInput.intended_clusters.includes('law');
    const wantsMed = academicInput.intended_clusters.includes('medicine_dentistry');
    if (!wantsLaw && !wantsMed) return;
    setAdmissionsTests((prev) => {
      if (prev.some((t) => t.test_type === 'NONE')) return prev; // "no tests" is an explicit choice
      const additions: typeof prev = [];
      // `status: 'missing'`, NOT `''`. A suggested row with an empty status was a
      // trap the app set for itself: `validateStep3` requires a status for every
      // non-NONE row, so choosing "Medicine & dentistry" on step 2 silently added a
      // UCAT row and then BLOCKED step 3 on it. Measured on a fully complete saved
      // profile: the ring read 67%, "Grades & tests" had no tick, Next did nothing,
      // the only error was "Select a status." for a row the student never added —
      // and because the essentials were incomplete, `canSkipBoosters` was false so
      // "Skip for now" never appeared either. Every medicine and law applicant hit
      // that on first load. `missing` means "not taken yet", which is the truthful
      // default for a test the APP is suggesting, and the student can change it.
      if (wantsLaw && !prev.some((t) => t.test_type === 'LNAT'))
        additions.push({ test_type: 'LNAT', status: 'missing', score_numeric: '', percentile: '' });
      if (wantsMed && !prev.some((t) => t.test_type === 'UCAT'))
        additions.push({ test_type: 'UCAT', status: 'missing', score_numeric: '', percentile: '' });
      if (additions.length === 0) return prev; // same reference — no re-render, no loop
      return [...prev, ...additions];
    });
  }, [academicInput.intended_clusters]);

  const showEnglishScore = shouldShowEnglishScore(englishRequired, englishTestType);
  const showAdmissionsTests = shouldShowAdmissionsTests(academicInput.intended_clusters, admissionsTests);

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
    setSubjects((prev) => prev.length >= getMaxSubjects(programmeType) ? prev : [...prev, buildNextSubject(programmeType, prev)]);
  const removeSubject = (i: number) =>
    setSubjects((prev) => prev.filter((_, idx) => idx !== i));

  // Dynamic IB total from subject grades (sum of numeric grades 1–7)
  const ibSubjectSum = useMemo(
    () => computeIbSubjectSum(programmeType, subjects), [programmeType, subjects]
  );

  const formattedNationalities = useMemo(
    () => formatNationalities(nationalities), [nationalities]
  );

  // ── Form state ────────────────────────────────────────────────────────────

  /**
   * Every collected value in one object, so the pure modules in `@/lib/profile/`
   * can own the payload build and the validators. This is a VIEW over the same
   * `useState` slices — it holds no state of its own and changes identity
   * exactly when one of them does.
   */
  const formState = useMemo<IntakeFormState>(() => ({
    programmeType, nationalities, subjects, admissionsTests,
    englishRequired, englishTestType, englishStatus, englishScoreOverall,
    personalInfo, academicInput, lifestylePreference, activities, activityRows,
  }), [
    programmeType, nationalities, subjects, admissionsTests,
    englishRequired, englishTestType, englishStatus, englishScoreOverall,
    personalInfo, academicInput, lifestylePreference, activities, activityRows,
  ]);

  // ── Build payload ─────────────────────────────────────────────────────────

  const buildPayload = useCallback((): StudentProfilePayload => toPayload(formState), [formState]);

  // ── Validation ────────────────────────────────────────────────────────────
  //
  // The five validators are pure and live in `@/lib/profile/intake-validation`;
  // `validateStep` is their switch. Steps 4 and 5 are optional and return {}.

  const validateCurrentStep = () => validateStep(currentStep, formState);

  // ── Navigation ────────────────────────────────────────────────────────────

  /**
   * Scroll the first errored field into view and focus its input.
   *
   * The deferral is real: after a failed `goNext` the step body may still be
   * mid-transition, so the node we want does not exist yet. But a pending timer
   * that outlives the component used to `.focus()` whatever `[data-field]` it
   * could find anywhere in the live document — stealing focus from whatever had
   * replaced this form (in tests, the NEXT test's freshly mounted tree). Two
   * guards: only one timer is ever outstanding and unmount clears it, and the
   * search is scoped to this form's own content subtree, which must still be
   * connected for the callback to do anything at all.
   *
   * ── The 600ms call sites are gone (2026-08-04) ──────────────────────────────
   * `handleFinalSubmit` used to pass 600 instead of 50, because a submit bounce
   * CHANGES STEP FIRST and `AnimatePresence mode="wait"` would not mount the
   * target step until the outgoing one had finished its 0.25s exit. That coupling
   * no longer exists: the step body is a keyed `motion.div` with no exit, so the
   * new step's DOM is committed in the same tick as the state update and the
   * default deferral is enough.
   *
   * Measured, not assumed — `intake-form.characterization.test.tsx`'s
   * `focusFirstError` describe covers both bounce paths (step 1 and a bounce that
   * skips to step 3) and passes at 50ms across repeated runs. Those two tests
   * exist precisely so this delay cannot be changed blind. jsdom is not a
   * browser, though: if a submit bounce is ever seen reporting an error without
   * focusing the field, this constant is the first thing to raise.
   */
  const focusFirstError = useCallback((errs: Record<string, string>, delay = 50) => {
    const keys = Object.keys(errs);
    if (keys.length === 0) return;
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null;
      const root = contentTopRef.current;
      if (!root || !root.isConnected) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-field]'));
      // A node is a candidate if its key IS an error key, or PREFIXES one — the latter
      // covers group-level messages hung off a container (subject_list → subject_list.hl).
      const matches = nodes.filter((node) => {
        const key = node.getAttribute('data-field');
        return !!key && (key in errs || keys.some((k) => k.startsWith(`${key}.`)));
      });
      if (matches.length === 0) return;
      // Containers match every row error nested inside them, so in document order the
      // `subject_list` wrapper always precedes the row that is actually wrong. Prefer the
      // most specific candidate: the first one that doesn't enclose another candidate.
      // Without this, a "6 subjects required" group error stole focus for row 1's name
      // field while the empty row further down was the thing needing attention.
      const target = matches.find((node) => !matches.some((other) => other !== node && node.contains(other)))
        ?? matches[0];
      // Same reduced-motion escape as the step-change scroll below: a JS
      // `behavior: 'smooth'` OVERRIDES the CSS `scroll-behavior` property, so
      // globals.css's `scroll-behavior: auto !important` inside the
      // prefers-reduced-motion block never reaches it. Measured under `reduce`: 14
      // distinct intermediate scroll positions on a failed Next. The comment 180
      // lines below explained the mechanism and this call still did it.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
      (focusable ?? target).focus({ preventScroll: true });
    }, delay);
  }, []);

  // Cancel any pending focus hop on unmount — see `focusFirstError` above.
  useEffect(() => () => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
  }, []);

  const goNext = () => {
    const nextErrors = validateCurrentStep();
    liveClearableRef.current = new Set(Object.keys(nextErrors));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) { focusFirstError(nextErrors); return; }
    setCurrentStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  };

  const goBack = () => setCurrentStep((prev) => Math.max(1, prev - 1));

  const goToStep = (target: number) => {
    if (target === currentStep) return;
    if (target < currentStep) { setCurrentStep(target); return; }
    const nextErrors = validateCurrentStep();
    liveClearableRef.current = new Set(Object.keys(nextErrors));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) { focusFirstError(nextErrors); return; }
    setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, target)));
  };

  /**
   * The rail speaks in `StepKey`s, not indices, so the boundary converts once
   * here. `indexForStepKey` already owns the `?step=` mapping — reusing it means
   * the rail, the URL and the sidebar can never disagree about which step a key
   * names. A plain function, like `goToStep` itself: both close over
   * `currentStep`, and memoising one but not the other is how a stale closure
   * gets in.
   */
  const goToStepKey = (key: string) => goToStep(indexForStepKey(key));

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
    const s1 = validateStep1(formState); const s2 = validateStep2(formState); const s3 = validateStep3(formState);
    const allErrors = { ...s1, ...s2, ...s3 };
    liveClearableRef.current = new Set(Object.keys(allErrors));
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      if (Object.keys(s1).length > 0) setCurrentStep(1);
      else if (Object.keys(s2).length > 0) setCurrentStep(2);
      else setCurrentStep(3);
      // Wait for the step transition to finish before scrolling to the error.
      focusFirstError(allErrors);
      return;
    }
    const payload = buildPayload();

    // The wizard used to send whatever the step validators did not object to,
    // and steps 4–5 object to nothing. So a SAT of 1650 — or any free-text
    // answer past 4,000 characters — sailed through and the server rejected the
    // entire six-table save with a step name the student could not act on.
    // `validatePayload` runs the SAME schema the server parses with, so the two
    // cannot disagree, and the errors it returns are keyed by payload path,
    // which is what `focusFirstError` scrolls to.
    const payloadErrors = validatePayload(payload);
    if (Object.keys(payloadErrors).length > 0) {
      // NOT clearable. These come from the zod schema, and no step validator can
      // re-emit them — so if the live-clear pass were allowed to touch them it
      // would delete them on the very navigation that is meant to show them. See
      // the note on `liveClearableRef`. Clearing the set (rather than leaving a
      // stale one) also stops a previous step's clearable keys applying here.
      liveClearableRef.current = new Set();
      setErrors(payloadErrors);
      // These fields live on step 4; send the student to the step that holds
      // the first offending field rather than leaving them on the review page.
      const firstKey = Object.keys(payloadErrors)[0];
      setCurrentStep(stepForFieldKey(firstKey));
      focusFirstError(payloadErrors);
      return;
    }

    setStatusMessage('Saving…'); setStatusIsError(false);
    startTransition(async () => {
      try {
        const result = await saveStudentIntake(payload);
        if (!result?.success) {
          setStatusMessage(result?.message ?? 'Save failed.');
          setStatusIsError(true);
          return;
        }
        // No status message here: `setSubmitted(true)` below swaps the whole
        // status line for the success panel, which carries the wording and its own
        // `role="status"`. Setting one would render nowhere.
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
  }, [formState, buildPayload, focusFirstError, clearDraft, setCurrentStep]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); handleFinalSubmit(); };

  /**
   * "Skip for now" — submit with the booster steps left empty.
   *
   * This is the same submit the Review step performs, not a separate write
   * path, and that is the point: one code path means a skipped profile and a
   * completed one cannot diverge in what they persist. `handleFinalSubmit`
   * validates steps 1-3 only, so a student who has filled those in gets saved;
   * one who has not is sent back to the offending step with the errors shown,
   * exactly as if they had reached Review.
   *
   * The breadcrumb is fire-and-forget. It records that this student chose to
   * defer, which the dashboard checklist uses to phrase its nudge — losing it
   * costs a slightly less specific prompt, so it must never delay or block the
   * save the student actually asked for.
   */
  const handleSkipBoosters = useCallback(() => {
    void markOnboardingStep('skipped_boosters_at').catch(() => {
      /* breadcrumb only — see above */
    });
    handleFinalSubmit();
  }, [handleFinalSubmit]);

  /**
   * Which way the step body should travel.
   *
   * DERIVED from the previously rendered step rather than set in `goNext`/
   * `goBack`, because those are not the only things that move the step: the
   * wizard mirrors its position into `?step=` with `push: true`, so the browser
   * Back button walks it too — and a popstate never touches a handler. Comparing
   * against the last render covers every route in, including a deep link.
   *
   * Reading a ref during render is safe here because it is only updated in the
   * effect BELOW this render's read: on the render where `currentStep` changes,
   * `prevStepRef` still holds the step being left, which is exactly the
   * comparison wanted.
   */
  const prevStepRef = useRef(currentStep);
  const stepDirection = currentStep >= prevStepRef.current ? 1 : -1;

  useEffect(() => {
    prevStepRef.current = currentStep;
  }, [currentStep]);

  /**
   * Bring the step into view when it changes — but NOT on first paint.
   *
   * This effect also ran on mount, so opening a deep link like
   * `?step=academic_details` scroll-jumped the page after paint, for no reason:
   * the student had not navigated anywhere, and the wizard was already the top of
   * the document. Same `isFirstPaint` shape as `page-transition.tsx`.
   */
  const hasScrolledOnceRef = useRef(false);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (!hasScrolledOnceRef.current) {
      hasScrolledOnceRef.current = true;
      return;
    }

    /**
     * `behavior: 'smooth'` is NOT covered by the reduced-motion CSS. Per CSSOM-View
     * the JS option overrides the `scroll-behavior` property, so
     * `globals.css`'s `scroll-behavior: auto !important` inside the
     * `prefers-reduced-motion` block never reaches this call, and `MotionConfig`
     * has no bearing on it either. Six smooth-scrolled transitions for a user who
     * asked for none. Read the preference directly.
     */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    contentTopRef.current?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start'
    });

    /**
     * Move focus to the new step's heading.
     *
     * Without this a step change is invisible to two groups at once. A keyboard
     * user presses Next and focus stays on the button at the BOTTOM of the step
     * they just arrived at, so Tab leaves the form and reaching field one means
     * Shift+Tabbing back up through the whole body. A screen-reader user gets
     * nothing at all: the `<h2>` swaps inside a keyed `motion.div`, which is not a
     * live region, so pressing Next is silent.
     *
     * The heading is `tabIndex={-1}` — programmatically focusable, not tab-stop —
     * which is the standard route-change pattern. Focusing it both announces the
     * step and puts the tab sequence at the top of the new step's fields.
     *
     * `preventScroll` because the `scrollIntoView` above already owns the scroll
     * position, and letting focus scroll too fights it.
     *
     * GUARDED on focus still being inside this form, for the same reason
     * `focusFirstError` is scoped to a still-connected subtree (defect F-B). Two
     * reasons it matters: yanking focus back is hostile if the student has
     * deliberately moved to something else on the page — the chat launcher, the
     * theme toggle — and in tests an unguarded steal reaches across a boundary into
     * whatever tree replaced this one, which showed up as three unrelated step-2
     * tests failing intermittently while passing in isolation. On a real step
     * change focus is on the Next button, i.e. inside the form, so the guard never
     * blocks the case it exists for.
     */
    const form = contentTopRef.current?.closest('form');
    const focusIsOurs = form?.contains(document.activeElement) ?? false;
    if (focusIsOurs) stepHeadingRef.current?.focus({ preventScroll: true });
  }, [currentStep]);

  // ── Step completion (for the rail's dots and the essentials ring) ──────────

  /**
   * These rules deliberately MIRROR `buildStepCompletion` in
   * `src/lib/profile/completion.ts` — the difference is only the source: this one
   * reads live form state, that one reads the saved rows. They must agree, or the
   * same profile reads "3/5" in the wizard and "5/5" on the dashboard, which is a
   * bug that has already shipped once.
   *
   * Step 4 includes `extracurricular_interests` because `completion.ts` does. The
   * sidebar used to omit it, so a student whose only booster answer was an
   * interest chip saw the wizard call step 4 incomplete while the dashboard
   * counted it — the exact drift the mirror comment warns about.
   *
   * Note the slice it comes from: `extracurricular_interests` is attributed to
   * step 4 by `completion.ts` but lives on the `lifestylePreference` state slice,
   * because steps 4 and 5 both persist into the single
   * `student_lifestyle_preference` row. The step→field mapping is a product
   * decision; the state→table mapping is a schema fact. They do not line up, and
   * reading it off `activities` (which is where it looks like it belongs) is a
   * type error rather than a silent wrong answer only because the slices differ.
   */
  /**
   * ── When an error appears, and when it goes away ─────────────────────────────
   *
   * Three rules, and the whole point is that the form stops arguing with someone
   * who is mid-answer.
   *
   *   1. NEVER on change for a field that has no error yet. Being told "enter a
   *      valid email" after typing "a" is the single most disliked behaviour a
   *      form has. `goNext` and submit are what surface untouched fields.
   *   2. ON BLUR, for that one field — but only if the student actually put
   *      something in it. Tabbing through an empty required field and being
   *      scolded for not having filled it in yet is the same mistake as (1);
   *      "what you typed is wrong" is useful, "you have not got there yet" is not.
   *   3. LIVE-CLEAR the moment it is satisfied. An error that lingers after being
   *      fixed is what makes a form feel broken.
   *
   * Both additions only ever move errors in ONE direction (blur adds one key,
   * change removes keys), so `goNext`'s "set every error for this step at once"
   * behaviour is untouched and every existing assertion about it still holds.
   *
   * `stepForFieldKey` gates both, and that gate is load-bearing: `errors` can hold
   * keys from OTHER steps — `handleFinalSubmit` routes a payload rejection back to
   * its own step, and `validateStep(currentStep, …)` knows nothing about those
   * keys. Without the gate, reconciling the current step would silently delete
   * them and the student would be bounced to a step showing no reason why.
   */

  /**
   * PROVENANCE, and it is load-bearing. Only errors produced by a STEP VALIDATOR
   * may be live-cleared. Errors produced by `validatePayload` may not.
   *
   * The first version of this gated on `stepForFieldKey(key) !== currentStep`, and
   * that was exactly backwards for the only case that occurs. `handleFinalSubmit`
   * bounces to `setCurrentStep(stepForFieldKey(firstKey))`, so a payload error's
   * step BECOMES the current step; and `validatePayload` only runs once
   * `validateStep1/2/3` have all returned clean, so `validateStep(currentStep, …)`
   * can never re-emit the key. Both clauses false → the error was deleted on the
   * very navigation meant to reveal it.
   *
   * The user-visible bug: paste a 250-character name (the input has no
   * `maxLength`), press Submit on Review, get teleported to step 1 with NO error
   * shown, press Submit again, forever. That is audit finding A2 —  the thing
   * `validatePayload` was written to prevent — reintroduced by its own guard.
   *
   * A set of clearable keys removes the guesswork: a step validator marks its keys
   * clearable, `validatePayload` explicitly does not, and the effect below will
   * only ever remove a key it finds in the set.
   */
  const liveClearableRef = useRef<Set<string>>(new Set());

  /** Surface one field's error on blur, if it has content to be wrong about. */
  const handleFieldBlur = useCallback((event: React.FocusEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement | null;
    // Only real text controls. A `closest()` from a Select trigger or a row's
    // delete button resolves to the enclosing GROUP wrapper
    // (`academic_input.subject_list`), which would surface "IB requires exactly 6
    // subjects." the moment you touched row 1 — a rule-1 violation. Until now the
    // only thing preventing that was `HTMLButtonElement.value` being `''` and
    // tripping the empty-value return below, which is an accident, not a rule.
    if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

    const owner = target.closest('[data-field]');
    const key = owner?.getAttribute('data-field');
    if (!key || stepForFieldKey(key) !== currentStepRef.current) return;

    // Rule 2: an empty field has not been answered wrongly, only not yet.
    if (target.value.trim() === '') return;

    const stepErrors = validateStep(currentStepRef.current, formState);
    liveClearableRef.current.add(key);
    setErrors((prev) => {
      const message = stepErrors[key];
      if (message === prev[key]) return prev;
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, [formState]);

  /**
   * Rule 3. An effect rather than an onChange handler, because a form-level
   * change handler reads `formState` from before the field's own setState has been
   * applied — it would validate the previous keystroke.
   */
  useEffect(() => {
    setErrors((prev) => {
      const shown = Object.keys(prev);
      if (shown.length === 0) return prev;
      const stepErrors = validateStep(currentStep, formState);
      let changed = false;
      const next: Record<string, string> = {};
      for (const key of shown) {
        // Keep unless this error is BOTH ours to clear and now satisfied.
        if (!liveClearableRef.current.has(key) || stepErrors[key]) next[key] = prev[key];
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [formState, currentStep]);

  const stepCompletion = useMemo<Record<number, boolean>>(() => ({
    1: Object.keys(validateStep1(formState)).length === 0,
    2: Object.keys(validateStep2(formState)).length === 0,
    3: Object.keys(validateStep3(formState)).length === 0,
    4: activities.leadership_roles.length > 0 || !!activities.commitment_level
      || activities.key_activities.length > 0,
    // `extracurricular_interests` counts toward step 5, where its chip group
    // actually renders — see the note in completion.ts. Attributing it to step 4
    // (because both steps share one DB row) meant ticking one interest chip on
    // step 5 marked "Activities" complete without the student opening it.
    5: !!lifestylePreference.teaching_style || lifestylePreference.desired_location_type.length > 0
      || !!lifestylePreference.campus_size
      || lifestylePreference.extracurricular_interests.length > 0,
    6: false,
  }), [formState, activities, lifestylePreference]);

  /**
   * The Review step's model: one entry per `PROFILE_STEPS` step, in step order.
   *
   * Rows with a null value are dropped by `ReviewSection`, so a section shows what
   * the student HAS answered rather than a column of em-dashes. Titles come from
   * `PROFILE_STEPS` so the summary cannot drift from the rail.
   */
  const reviewSections = useMemo(() => {
    const label = (key: StepKey) => PROFILE_STEPS.find((step) => step.key === key)?.title ?? '';
    const list = (values: string[]) => (values.length > 0 ? values.join(', ') : null);

    return [
      {
        step: 1,
        title: label('personal_information'),
        done: stepCompletion[1],
        rows: [
          { label: 'Name', value: [personalInfo.first_name, personalInfo.last_name].filter(Boolean).join(' ') || null },
          { label: 'Email', value: personalInfo.email || null },
          { label: 'Nationality', value: list(formattedNationalities) },
          { label: 'Residence', value: personalInfo.resident_country || null }
        ]
      },
      {
        step: 2,
        title: label('academic_input'),
        done: stepCompletion[2],
        rows: [
          { label: 'Programme', value: programmeType === 'IB' ? 'IB Diploma' : programmeType === 'A_LEVEL' ? 'A-levels' : null },
          { label: 'School', value: academicInput.school_name || null },
          { label: 'Focus', value: list(academicInput.intended_clusters.map((c) => clusterLabelMap.get(c) ?? c)) },
          { label: 'Graduation', value: academicInput.graduation_year || null }
        ]
      },
      {
        step: 3,
        title: label('academic_details'),
        done: stepCompletion[3],
        rows: [
          // Names, not just a count. "Subjects: 6" cannot help anyone catch the
          // mistake this screen exists to catch.
          { label: 'Subjects', value: list(subjects.filter((s) => s.subject_name.trim()).map((s) => s.subject_name.trim())) },
          // `ibSubjectSum`, not `academicInput.ib_total_points`: the total is DERIVED
          // from the subject grades, and nothing in the UI writes ib_total_points —
          // it only ever holds the value hydrated from the last save. Reading it here
          // made the review screen quote a stale total that contradicted the grades
          // just entered.
          {
            label: 'Predicted points',
            value: programmeType === 'IB' && ibSubjectSum
              ? `${ibSubjectSum}/42${academicInput.ib_core_points ? ` + ${academicInput.ib_core_points} core` : ''}`
              : null
          },
          {
            label: 'English',
            value: englishRequired
              ? ({ yes: 'Required', no: 'Not required', not_sure: 'Not sure' }[englishRequired] ?? null)
              : null
          },
          { label: 'Admissions tests', value: list(admissionsTests.filter((t) => t.test_type && t.test_type !== 'NONE').map((t) => t.test_type)) }
        ]
      },
      {
        step: 4,
        title: label('activities_ambitions'),
        done: stepCompletion[4],
        optional: true,
        emptyPrompt: 'Nothing added yet — two or three activities sharpen how you rank against other applicants.',
        emptyCta: 'Add activities',
        rows: [
          { label: 'Commitment', value: COMMITMENT_OPTIONS.find((o) => o.value === activities.commitment_level)?.label ?? null },
          { label: 'Activities', value: list(activities.key_activities) },
          { label: 'Leadership', value: list(activities.leadership_roles) },
          { label: 'Interests', value: list(lifestylePreference.extracurricular_interests) }
        ]
      },
      {
        step: 5,
        title: label('lifestyle_preferences'),
        done: stepCompletion[5],
        optional: true,
        emptyPrompt: 'Nothing added yet — these tune where and how you would rather study.',
        emptyCta: 'Set your preferences',
        rows: [
          { label: 'Teaching style', value: lifestylePreference.teaching_style || null },
          { label: 'Location', value: list(lifestylePreference.desired_location_type) },
          { label: 'Campus size', value: lifestylePreference.campus_size || null }
        ]
      }
    ];
  }, [
    stepCompletion, personalInfo, formattedNationalities, programmeType, academicInput,
    subjects, ibSubjectSum, englishRequired, admissionsTests, activities, lifestylePreference
  ]);

  /**
   * The rail's model. Derived from `PROFILE_STEPS` so the tier boundary, the step
   * count and the order all come from one place — nothing here knows that
   * "essential" means three or that Review is sixth.
   */
  const railSteps = useMemo<RailStep[]>(() => [
    ...PROFILE_STEPS.map((step, index) => ({
      key: step.key,
      title: step.title,
      tier: step.tier,
      done: stepCompletion[index + 1] ?? false,
      current: currentStep === index + 1
    })),
    {
      key: 'review' as const,
      title: 'Review',
      tier: 'review' as const,
      done: false,
      current: currentStep === TOTAL_STEPS
    }
  ], [stepCompletion, currentStep]);

  /**
   * Completeness of the ESSENTIAL steps — what the ring shows, and the only
   * threshold that means anything to the student (it is what `runMatching` needs
   * and what `middleware.ts` gates on). The bar this replaced measured position
   * in the wizard instead, so it told a fully-hydrated returning student on step
   * 1 that they were 0% done. See the note in `intake-rail.tsx`.
   */
  const essentialsDone = railSteps.filter((step) => step.tier === 'essential' && step.done).length;
  const essentialPct = ESSENTIAL_STEP_KEYS.length
    ? Math.round((essentialsDone / ESSENTIAL_STEP_KEYS.length) * 100)
    : 100;

  /**
   * Whether to offer "Skip for now" beside Next.
   *
   * Two conditions, and both matter. The student must be standing ON a booster
   * step — offering an exit from step 2 would be a lie, since submitting there
   * fails validation and throws them backwards. And the essential steps must
   * already validate, because those are what `runMatching` needs; a skip that
   * produced an empty matches page is worse than no skip at all.
   *
   * Both conditions are now derived from the tiers rather than naming steps 1-3
   * and 4 by number, so re-tiering `PROFILE_STEPS` moves this with it.
   */
  const canSkipBoosters =
    currentStep >= FIRST_BOOSTER_STEP_INDEX &&
    currentStep < TOTAL_STEPS &&
    essentialsDone === ESSENTIAL_STEP_KEYS.length;

  /** Whether the success panel should offer a route back to the extras. */
  const boostersOutstanding = railSteps.some((step) => step.tier === 'booster' && !step.done);

  /** aria-invalid / aria-describedby props for an errored input. */
  const a11yError = (key: string) =>
    errors[key]
      ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(key) }
      : {};

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <form className="relative font-sans" onSubmit={handleSubmit} onBlur={handleFieldBlur}>
      {/* Step navigation below `lg`, where the rail does not fit. Without it a
        * phone user has no way to jump steps and no sense of progress — only Back
        * and Next.
        *
        * It sits OUTSIDE the two-column row, as a direct child of the <form>,
        * and that placement is load-bearing rather than tidiness: `.surface-card`
        * applies `overflow: hidden` (globals.css:509, to clip content to its
        * radius), and an ancestor with a non-visible overflow becomes the scroll
        * container a descendant `position: sticky` resolves against. Inside the
        * step-body card the bar therefore scrolled away with the content — it
        * looked sticky in the markup and measured `top: -496` after a 900px
        * scroll. Here its nearest scroll container is the document, which is what
        * it needs to pin against. */}
      <IntakeStepMeter
        steps={railSteps}
        essentialPct={essentialPct}
        onStepSelect={goToStepKey}
        currentIndex={currentStep}
        currentTitle={STEP_META[currentStep]?.title ?? ''}
      />

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── The step map ──
          * Presentational and prop-driven (see `intake-rail.tsx`). Rendered here
          * on lg+; the same component is what the mobile "Steps" sheet shows, so
          * there is one rail implementation in two containers rather than two
          * lists that drift. */}
        <div className="hidden lg:block lg:w-64">
          <IntakeRail
            sticky
            tourAnchor
            steps={railSteps}
            essentialPct={essentialPct}
            onStepSelect={goToStepKey}
            footer={initialPayload ? (
              <button
                type="button"
                onClick={restoreSavedProfile}
                className="w-full rounded-xl px-3 py-3.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Restore last save
              </button>
            ) : null}
          />
        </div>

        {/* ── The work ──
          * Its own surface, separate from the rail's. `min-w-0` is load-bearing
          * in a flex row: without it the grids inside refuse to shrink and the
          * whole page gains a horizontal scrollbar. */}
        <div
          ref={contentTopRef}
          /* `overflow-visible` overrides `.surface-card`'s `overflow: hidden`
           * (globals.css:509, there to clip content to the radius). This card
           * contains popovers that are NOT portalled — every `Combobox` listbox is
           * an `absolute` child up to 256px tall, and so is every "Why we ask"
           * panel — so with the clip in place any one opened near the bottom edge
           * lost its lower options entirely. Nothing in here needs clipping: the
           * children are cards and fields, none of which reach the corners. The
           * same `overflow: hidden` is why the sticky step meter had to move out of
           * this card, 40 lines above. */
          className="surface-card min-w-0 flex-1 scroll-mt-28 overflow-visible rounded-4xl lg:scroll-mt-0"
        >

          {/* Restored-draft notice. `info` tone rather than a primary tint: this
            * is the app telling the student something, not asking for an action. */}
          {draftNotice ? (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.fast, ease: EASE }}
              className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-info/25 bg-info-subtle px-4 py-3 text-sm"
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Info className="h-4 w-4 shrink-0 text-info" aria-hidden />
                Restored your in-progress draft.
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={discardDraft}
                  className="-my-2 rounded-lg px-3 py-3 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Discard draft
                </button>
                <button
                  type="button"
                  onClick={() => setDraftNotice(false)}
                  aria-label="Dismiss notice"
                  className="-my-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </motion.div>
          ) : null}

          {/* ── The step ──
            * ONE keyed motion.div, heading and body together, and NO
            * AnimatePresence. Three deliberate changes from what this was:
            *
            * 1. `mode="wait"` is gone. `product-tour.tsx:485` documents why it is
            *    wrong twice over: the incoming step is not mounted until the
            *    outgoing one has finished exiting, so every Next costs the exit
            *    duration before any new text appears — and if the exit never
            *    completes, the new step never mounts at all. Changing the `key`
            *    unmounts the old copy immediately and plays the new one's enter,
            *    which is the same visual result with no dependency on an exit.
            *    (Plain `sync` is not the alternative: with static positioning it
            *    would stack both copies and double the height mid-transition.)
            *
            * 2. Heading and body were two SEPARATE AnimatePresence blocks, which
            *    is why the suite's `hydrateThenGoTo` had to await a title AND a
            *    body string — the heading could land a frame before the fields.
            *    One block, one arrival.
            *
            * 3. Travel is HORIZONTAL and direction-aware. Vertical travel fought
            *    the `scrollIntoView` that fires on every step change and read as
            *    the page jumping; sliding along the axis you are paging through
            *    reads as pagination, which is what this is. Back slides the other
            *    way, so the gesture is reversible.
            *
            * Durations and easing come from `@/lib/motion` rather than the raw
            * 0.2/0.25/'easeOut' that were here — this wizard imported
            * framer-motion but none of the app's motion vocabulary. */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: stepDirection * TRAVEL.app }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="space-y-6"
          >
            <div className="mb-6">
              {/* `tabIndex={-1}` so the step-change effect can focus it: that is
                * what announces the new step to a screen reader and puts a keyboard
                * user at the top of the new fields instead of at the Next button
                * they just left. Not a tab stop. */}
              <h2
                ref={stepHeadingRef}
                tabIndex={-1}
                className="text-balance font-heading text-xl font-semibold tracking-tight text-foreground outline-none md:text-2xl"
              >
                {STEP_META[currentStep]?.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {STEP_META[currentStep]?.subtitle}
              </p>
            </div>
            <div className="space-y-6">

              {/* ═══ STEP 1 — Personal info ═══════════════════════════════════ */}
              {currentStep === 1 ? (
                <section className="space-y-5">
                  {/* Name + email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* The FieldError sits OUTSIDE the <label>. Inside it, the message
                      * was concatenated into the input's accessible name ("First name"
                      * became "First nameFirst name is required.") and a screen reader
                      * re-read the whole thing on every keystroke. `a11yError` already
                      * points aria-describedby at the message's id, which is where an
                      * error belongs. Same shape for every errored field below. */}
                    <div data-field="personal_information.first_name">
                      <label className="space-y-1.5 block">
                        <span className="text-sm font-medium">First name</span>
                        <input
                          type="text" autoComplete="given-name" className={cn('form-input', errors['personal_information.first_name'] && 'border-destructive')}
                          {...a11yError('personal_information.first_name')}
                          value={personalInfo.first_name}
                          onChange={(e) => updatePersonalInfo('first_name', e.target.value)}
                          placeholder="Alex"
                        />
                      </label>
                      <FieldError msg={errors['personal_information.first_name']} id={fieldErrorId('personal_information.first_name')} />
                    </div>
                    <div data-field="personal_information.last_name">
                      <label className="space-y-1.5 block">
                        <span className="text-sm font-medium">Last name</span>
                        <input
                          type="text" autoComplete="family-name" className={cn('form-input', errors['personal_information.last_name'] && 'border-destructive')}
                          {...a11yError('personal_information.last_name')}
                          value={personalInfo.last_name}
                          onChange={(e) => updatePersonalInfo('last_name', e.target.value)}
                          placeholder="Smith"
                        />
                      </label>
                      <FieldError msg={errors['personal_information.last_name']} id={fieldErrorId('personal_information.last_name')} />
                    </div>
                  </div>
                  <div data-field="personal_information.email">
                    <label className="space-y-1.5 block">
                      <span className="text-sm font-medium">Email</span>
                      <input
                        type="email" autoComplete="email" inputMode="email" spellCheck={false} className={cn('form-input', errors['personal_information.email'] && 'border-destructive')}
                        {...a11yError('personal_information.email')}
                        value={personalInfo.email}
                        onChange={(e) => updatePersonalInfo('email', e.target.value)}
                        placeholder="alex@school.com"
                      />
                    </label>
                    <FieldError msg={errors['personal_information.email']} id={fieldErrorId('personal_information.email')} />
                  </div>

                  {/* Nationality */}
                  <SectionCard>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Nationality</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Add more than one if applicable.</p>
                      </div>
                      <button type="button" onClick={addNationality}
                        className="-my-2 rounded-lg px-2 py-3.5 text-xs font-semibold text-primary-ink transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        + Add another
                      </button>
                    </div>
                    <div className="space-y-3" data-field="personal_information.nationality">
                      {nationalities.map((val, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <div className="flex-1">
                            <Combobox
                              options={COUNTRY_OPTIONS}
                              value={val}
                              onChange={(v) => updateNationality(i, v)}
                              placeholder="Search nationality…"
                              error={i === 0 ? errors['personal_information.nationality'] : undefined}
                              errorId={fieldErrorId('personal_information.nationality')}
                            />
                          </div>
                          {nationalities.length > 1 && (
                            <button type="button" onClick={() => removeNationality(i)}
                              aria-label={`Remove nationality ${i + 1}`}
                              className="rounded-lg p-3.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  {/* Country of residence + City + Age + Gender */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* CountryCombobox renders its own FieldError, so a wrapping
                      * <label> would swallow it into the input's name. Associate by
                      * id instead. */}
                    <div className="space-y-1.5" data-field="personal_information.resident_country">
                      <label htmlFor="intake-resident-country" className="text-sm font-medium block">Country of residence</label>
                      <Combobox
                        options={COUNTRY_OPTIONS}
                        id="intake-resident-country"
                        value={personalInfo.resident_country}
                        onChange={(v) => updatePersonalInfo('resident_country', v)}
                        placeholder="Search country…"
                        error={errors['personal_information.resident_country']}
                        errorId={fieldErrorId('personal_information.resident_country')}
                      />
                    </div>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">City <span className="text-xs">(optional)</span></span>
                      <input
                        type="text" autoComplete="address-level2" className="form-input"
                        value={personalInfo.current_location_city}
                        onChange={(e) => updatePersonalInfo('current_location_city', e.target.value)}
                        placeholder="London"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">Age <span className="text-xs">(optional)</span></span>
                      <input
                        type="number" min={10} max={60} className="form-input"
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
                    <div data-field="academic_input.school_name">
                      <label className="space-y-1.5 block">
                        <span className="text-sm font-medium">School name</span>
                        <input
                          type="text" className={cn('form-input', errors['academic_input.school_name'] && 'border-destructive')}
                          {...a11yError('academic_input.school_name')}
                          value={academicInput.school_name}
                          onChange={(e) => updateAcademicInput('school_name', e.target.value)}
                          placeholder="Lycée International"
                        />
                      </label>
                      <FieldError msg={errors['academic_input.school_name']} id={fieldErrorId('academic_input.school_name')} />
                    </div>
                    <div className="space-y-1.5" data-field="academic_input.school_country">
                      <label htmlFor="intake-school-country" className="text-sm font-medium block">School country</label>
                      <Combobox
                        options={COUNTRY_OPTIONS}
                        id="intake-school-country"
                        value={academicInput.school_country}
                        onChange={(v) => updateAcademicInput('school_country', v)}
                        error={errors['academic_input.school_country']}
                        errorId={fieldErrorId('academic_input.school_country')}
                      />
                    </div>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">School city <span className="text-xs">(optional)</span></span>
                      <input
                        type="text" className="form-input"
                        value={academicInput.school_city}
                        onChange={(e) => updateAcademicInput('school_city', e.target.value)}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">School type <span className="text-xs">(optional)</span></span>
                      {/* `|| ''`, NOT `|| undefined` — see the note at the top of this
                        * file. An earlier version of this comment had it backwards and
                        * also claimed Radix treats '' as an illegal item value; both are
                        * wrong. `undefined` flips the Select to uncontrolled, and '' on
                        * the ROOT is fine and shows the placeholder. See
                        * src/components/ui/select.tsx for why value="" on an ITEM is the
                        * thing that does not work. */}
                      <Select value={academicInput.school_type || ''}
                        onValueChange={(v) => updateAcademicInput('school_type', v === CLEAR ? '' : v)}>
                        <SelectTrigger aria-label="School type">
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
                    {/* A <label> here would wrap a Radix trigger (a labelable <button>)
                      * AND the error text. The trigger's aria-label wins today, but the
                      * div keeps the message out of the name by construction. */}
                    <div className="space-y-1.5" data-field="academic_input.graduation_year">
                      <span className="text-sm font-medium block">Graduation year</span>
                      <Select value={academicInput.graduation_year || ''}
                        onValueChange={(v) => updateAcademicInput('graduation_year', v === CLEAR ? '' : v)}>
                        <SelectTrigger
                          aria-label="Graduation year"
                          {...a11yError('academic_input.graduation_year')}
                          className={cn(errors['academic_input.graduation_year'] && 'border-destructive')}>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* GRADUATION_YEARS is number[]; the state field is a string. */}
                          <SelectItem value={CLEAR}>Not specified</SelectItem>
                          {GRADUATION_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FieldError msg={errors['academic_input.graduation_year']} id={fieldErrorId('academic_input.graduation_year')} />
                    </div>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-muted-foreground">Preferred start date <span className="text-xs">(optional)</span></span>
                      <input
                        type="date" className="form-input"
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
                        // NOT disabled at the cap. `toggleCluster` already REPLACES
                        // the selection for this single-choice group, so disabling the
                        // other nine was decoration that (a) dropped them out of the
                        // tab order with no announcement of why, (b) crushed them to
                        // opacity-40 — 2.5:1, unreadable — and (c) forced a
                        // deselect-then-select round trip to change your mind. Picking
                        // another one just works.
                        <Chip
                          key={opt.value} label={opt.label} emoji={opt.emoji}
                          selected={academicInput.intended_clusters.includes(opt.value)}
                          onClick={() => toggleCluster(opt.value, 'intended_clusters')}
                        />
                      ))}
                    </div>
                    <FieldError msg={errors['academic_input.intended_clusters']} id={fieldErrorId('academic_input.intended_clusters')} />
                  </SectionCard>

                  <SectionCard>
                    <SectionTitle
                      label="Secondary interests"
                      hint={academicInput.secondary_clusters.length >= 2
                        ? 'Two picked — deselect one to swap.'
                        : 'Up to two — used to broaden your match pool.'}
                    />
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
                      type="text" className="form-input"
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
                        className="flex items-center gap-1.5 rounded-lg bg-primary/8 px-3 py-3.5 text-xs font-semibold text-primary-ink transition-[background-color,opacity] hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
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

                    {/* One card per subject below `md`, the 12-column table above it.
                      * Six IB subjects used to stack as eighteen loose fields on a
                      * phone — Subject / Level / Grade / remove, six times, with
                      * nothing grouping a row together. The card gives each subject
                      * an edge, and `md:contents` on the Level+Grade pair dissolves
                      * its wrapper at `md` so those two rejoin the 12-column grid
                      * instead of needing a second markup path. */}
                    <div className="space-y-3" data-field="academic_input.subject_list">
                      {subjects.map((subj, i) => (
                        <div
                          key={i}
                          className="space-y-3 rounded-xl border border-border/60 bg-background p-3 md:grid md:grid-cols-12 md:items-start md:gap-3 md:space-y-0 md:rounded-none md:border-0 md:bg-transparent md:p-0"
                        >
                          <div className="md:col-span-5" data-field={`academic_input.subject_list.${i}.subject_name`}>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">Subject</label>
                            <Combobox
                              options={SUBJECT_OPTIONS}
                              placeholder="Subject name"
                              emptyLabel="No subjects match"
                              value={subj.subject_name}
                              onChange={(v) => updateSubject(i, 'subject_name', v)}
                              error={errors[`academic_input.subject_list.${i}.subject_name`]}
                              errorId={fieldErrorId(`academic_input.subject_list.${i}.subject_name`)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3 md:contents">
                          <div className="md:col-span-3">
                            <label className="md:hidden text-xs font-medium text-muted-foreground mb-1 block">Level</label>
                            <Select
                              value={subj.level}
                              onValueChange={(v) => updateSubject(i, 'level', v)}
                              disabled={programmeType === 'A_LEVEL'}
                            >
                              <SelectTrigger aria-label={`Level for subject ${i + 1}`}>
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
                              ? <input type="number" min={1} max={7} className={cn('form-input', errors[`academic_input.subject_list.${i}.grade_value`] && 'border-destructive')}
                                  {...a11yError(`academic_input.subject_list.${i}.grade_value`)}
                                  value={subj.grade_value} onChange={(e) => updateSubject(i, 'grade_value', e.target.value)} placeholder="1–7" />
                              : <Select value={subj.grade_value || ''}
                                  onValueChange={(v) => updateSubject(i, 'grade_value', v === CLEAR ? '' : v)}>
                                  <SelectTrigger
                                    aria-label={`Grade for subject ${i + 1}`}
                                    {...a11yError(`academic_input.subject_list.${i}.grade_value`)}
                                    className={cn(errors[`academic_input.subject_list.${i}.grade_value`] && 'border-destructive')}>
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
                          </div>
                          <div className="flex items-end justify-end pb-0.5 md:col-span-1 md:justify-center">
                            <button type="button" onClick={() => removeSubject(i)}
                              aria-label={`Remove subject ${i + 1}`}
                              className="rounded-lg p-3.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <FieldError msg={errors['academic_input.subject_list']} id={fieldErrorId('academic_input.subject_list')} />
                    <FieldError msg={errors['academic_input.subject_list.hl']} id={fieldErrorId('academic_input.subject_list.hl')} />

                    {/* ── The running IB total ──
                      * The only immediate feedback anywhere in this form: type a
                      * grade and a number moves. It was a small line of bold text
                      * among several; it is now the foot of the subjects card, with
                      * the figure at heading scale and keyed on its own value so it
                      * LANDS when it changes (`EASE_POP`, entrances only — the
                      * overshoot is what makes it read as a score going up rather
                      * than a label being repainted).
                      *
                      * `ibSubjectSum`, never `academicInput.ib_total_points`: the
                      * total is derived from the rows, and the stored field only
                      * ever holds the last save's value. Reading it here made the
                      * strip contradict the grades just entered. The Review step
                      * reads the same derived value for the same reason. */}
                    {programmeType === 'IB' && ibSubjectSum !== null ? (
                      <div
                        aria-live="polite"
                        className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3"
                      >
                        <span className="text-xs font-medium text-muted-foreground">Predicted from subjects:</span>
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <motion.span
                            key={ibSubjectSum}
                            initial={{ opacity: 0, y: -4, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: DURATION.fast, ease: EASE_POP }}
                            className={cn(
                              'font-heading text-xl font-semibold tabular-nums',
                              ibSubjectSum >= 35 ? 'text-success' : ibSubjectSum >= 28 ? 'text-warning' : 'text-foreground'
                            )}
                          >
                            {ibSubjectSum}/42
                          </motion.span>
                          {academicInput.ib_core_points ? (
                            <span className="text-xs text-muted-foreground">
                              + {academicInput.ib_core_points} core = <strong className="text-foreground">{ibSubjectSum + (Number(academicInput.ib_core_points) || 0)}</strong>/45
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">points (add core points below for total)</span>
                          )}
                        </span>
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
                        <div data-field="academic_input.ib_core_points">
                          <label className="space-y-1.5 block">
                            <span className="text-sm font-medium text-muted-foreground">Core points <span className="text-xs">(optional)</span></span>
                            <input type="number" min={0} max={3}
                              className={cn('form-input', errors['academic_input.ib_core_points'] && 'border-destructive')}
                              {...a11yError('academic_input.ib_core_points')}
                              value={academicInput.ib_core_points}
                              onChange={(e) => updateAcademicInput('ib_core_points', e.target.value)}
                              placeholder="0–3" />
                          </label>
                          <FieldError msg={errors['academic_input.ib_core_points']} id={fieldErrorId('academic_input.ib_core_points')} />
                        </div>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">TOK grade <span className="text-xs">(optional)</span></span>
                          <Select value={academicInput.ib_tok_grade || ''}
                            onValueChange={(v) => updateAcademicInput('ib_tok_grade', v === CLEAR ? '' : v)}>
                            <SelectTrigger aria-label="TOK grade">
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
                            <SelectTrigger aria-label="EE grade">
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
                          <input type="text" className="form-input" value={academicInput.ee_subject}
                            onChange={(e) => updateAcademicInput('ee_subject', e.target.value)} />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">EE title <span className="text-xs">(optional)</span></span>
                          <input type="text" className="form-input" value={academicInput.ee_title}
                            onChange={(e) => updateAcademicInput('ee_title', e.target.value)} />
                        </label>
                      </div>
                      <div data-field="academic_input.ee_summary">
                        <label className="space-y-1.5 block">
                          <span className="text-sm font-medium text-muted-foreground">EE summary <span className="text-xs">(optional, max 350 chars)</span></span>
                          <textarea rows={3} maxLength={350}
                            className={cn('form-input', 'form-input--textarea', errors['academic_input.ee_summary'] && 'border-destructive')}
                            {...a11yError('academic_input.ee_summary')}
                            value={academicInput.ee_summary}
                            onChange={(e) => updateAcademicInput('ee_summary', e.target.value)}
                            placeholder="1–3 sentences" />
                        </label>
                        <FieldError msg={errors['academic_input.ee_summary']} id={fieldErrorId('academic_input.ee_summary')} />
                      </div>
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
                        <div className="space-y-1.5" data-field="academic_input.english_test_type">
                          <span className="text-sm font-medium block">Test type</span>
                          <Select
                            value={englishTestType || ''}
                            onValueChange={(v) => setEnglishTestType(v as EnglishTestType)}>
                            <SelectTrigger
                              aria-label="Test type"
                              {...a11yError('academic_input.english_test_type')}
                              className={cn(errors['academic_input.english_test_type'] && 'border-destructive')}>
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {ENGLISH_TEST_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FieldError msg={errors['academic_input.english_test_type']} id={fieldErrorId('academic_input.english_test_type')} />
                        </div>
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
                            <input type="number" className="form-input" value={englishScoreOverall}
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
                              <input type="number" className="form-input" value={test.score_numeric}
                                onChange={(e) => updateAdmissionsTest(i, 'score_numeric', e.target.value)} placeholder="Value" />
                            </label>
                          </div>
                          <div className="md:col-span-3">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Percentile</span>
                              <input type="number" min={0} max={100} className="form-input" value={test.percentile}
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
                          <input type="text" className="form-input"
                            value={activities.epq_subject}
                            onChange={(e) => setActivities((prev) => ({ ...prev, epq_subject: e.target.value }))}
                            placeholder="e.g. Biology, Economics, History" />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">Project title <span className="text-xs">(optional)</span></span>
                          <input type="text" className="form-input"
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
                      {/* `data-field` + `FieldError` on both, and they are not
                        * decoration. The schema caps SAT at 1600 and ACT at 36, and
                        * `max=` on the input is never enforced because every Next is
                        * `type="button"` and the submit happens from Review with this
                        * step unmounted. So `validatePayload` rejects, routes the
                        * student here — and before this there was no `[data-field]`
                        * for `focusFirstError` to scroll to and nowhere to render the
                        * message. They arrived on Activities with no reason given,
                        * pressed Submit again, and got the same silent bounce. */}
                      <div data-field="lifestyle_preference.sat_score">
                        <label className="space-y-1.5 block">
                          <span className="text-sm font-medium text-muted-foreground">SAT score <span className="text-xs">(400–1600, optional)</span></span>
                          <input
                            type="number" min={400} max={1600} inputMode="numeric"
                            className={cn('form-input', errors['lifestyle_preference.sat_score'] && 'border-danger ring-1 ring-danger/30')}
                            {...a11yError('lifestyle_preference.sat_score')}
                            value={activities.sat_score}
                            onChange={(e) => setActivities((prev) => ({ ...prev, sat_score: e.target.value }))}
                            placeholder="e.g. 1450" />
                        </label>
                        <FieldError msg={errors['lifestyle_preference.sat_score']} id={fieldErrorId('lifestyle_preference.sat_score')} />
                      </div>
                      <div data-field="lifestyle_preference.act_score">
                        <label className="space-y-1.5 block">
                          <span className="text-sm font-medium text-muted-foreground">ACT score <span className="text-xs">(1–36, optional)</span></span>
                          <input
                            type="number" min={1} max={36} inputMode="numeric"
                            className={cn('form-input', errors['lifestyle_preference.act_score'] && 'border-danger ring-1 ring-danger/30')}
                            {...a11yError('lifestyle_preference.act_score')}
                            value={activities.act_score}
                            onChange={(e) => setActivities((prev) => ({ ...prev, act_score: e.target.value }))}
                            placeholder="e.g. 32" />
                        </label>
                        <FieldError msg={errors['lifestyle_preference.act_score']} id={fieldErrorId('lifestyle_preference.act_score')} />
                      </div>
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
                              className="mt-0.5 shrink-0 rounded-lg p-3.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                            <input type="text" maxLength={150} className="form-input"
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
                        className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium text-primary-ink transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                      <div data-field="lifestyle_preference.work_experience_summary">
                        <label className="space-y-1.5 block">
                          <span className="text-sm font-medium text-muted-foreground">Brief description <span className="text-xs">(optional)</span></span>
                          <textarea
                            rows={2}
                            className={cn('form-input', 'resize-none', errors['lifestyle_preference.work_experience_summary'] && 'border-danger ring-1 ring-danger/30')}
                            {...a11yError('lifestyle_preference.work_experience_summary')}
                            value={activities.work_experience_summary}
                            onChange={(e) => setActivities((prev) => ({ ...prev, work_experience_summary: e.target.value }))}
                            placeholder="e.g. Summer internship at a law firm, 2 months" />
                        </label>
                        <FieldError msg={errors['lifestyle_preference.work_experience_summary']} id={fieldErrorId('lifestyle_preference.work_experience_summary')} />
                      </div>
                    ) : null}
                  </SectionCard>

                  {/* ── Ambition statement ────────────────────────────────── */}
                  <SectionCard>
                    <SectionTitle
                      label="Where do you want to go?"
                      hint="Optional — 2–3 sentences on your goals or what drives you."
                      why="Your counsellor uses this to give more targeted guidance and personalise your programme shortlist."
                    />
                    <div data-field="lifestyle_preference.ambition_statement">
                      <textarea
                        rows={3}
                        aria-label="Where do you want to go?"
                        className={cn('form-input', 'resize-none', errors['lifestyle_preference.ambition_statement'] && 'border-danger ring-1 ring-danger/30')}
                        {...a11yError('lifestyle_preference.ambition_statement')}
                        value={activities.ambition_statement}
                        onChange={(e) => setActivities((prev) => ({ ...prev, ambition_statement: e.target.value }))}
                        placeholder="e.g. I want to study biomedical sciences and eventually research treatments for autoimmune diseases…" />
                      <FieldError msg={errors['lifestyle_preference.ambition_statement']} id={fieldErrorId('lifestyle_preference.ambition_statement')} />
                    </div>
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
                      {/* The emoji goes in `emoji`, NOT baked into `label`. It used
                        * to be part of the label string, which made it part of the
                        * chip's accessible name — a screen reader read "cityscape
                        * Capital city". Every other chip group in this form already
                        * passed it separately, so this was also the odd one out. */}
                      {[
                        { value: 'capital_city', label: 'Capital city', emoji: '🏙' },
                        { value: 'major_city', label: 'Major city', emoji: '🌆' },
                        { value: 'smaller_city', label: 'Smaller city', emoji: '🏘' },
                        { value: 'suburban', label: 'Suburban / campus', emoji: '🌿' },
                        { value: 'no_preference', label: 'No preference' },
                      ].map((opt) => (
                        <Chip key={opt.value} label={opt.label} emoji={opt.emoji}
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
                      <input type="text" className="form-input"
                        value={lifestylePreference.other_extracurriculars}
                        {...a11yError('lifestyle_preference.other_extracurriculars')}
                        onChange={(e) => updateLifestylePreference('other_extracurriculars', e.target.value)}
                        placeholder="Chess club, anime society…" />
                    </label>
                  </SectionCard>
                </section>
              ) : null}

              {/* ═══ STEP 6 — Review ══════════════════════════════════════════ */}
              {currentStep === TOTAL_STEPS ? (
                <section className="space-y-3">
                  {/* One card per step, in step order, ALL FIVE. The old summary
                    * showed four and silently omitted everything from "Life at
                    * university", so the one screen whose job is catching a mistake
                    * could not be used to check that step at all. */}
                  {reviewSections.map((section) => (
                    <ReviewSection
                      key={section.title}
                      title={section.title}
                      rows={section.rows}
                      done={section.done}
                      optional={section.optional}
                      emptyPrompt={section.emptyPrompt}
                      emptyCta={section.emptyCta}
                      editLabel={section.title}
                      onEdit={() => setCurrentStep(section.step)}
                    />
                  ))}

                  {/* The status line and the post-save CTA both live outside this
                    * section now — see below the keyed step body. */}
                </section>
              ) : null}

            </div>
          </motion.div>

          {/* ── Status line ──
            * OUTSIDE the keyed step body, so it renders on every step and is not
            * unmounted by a step change. It used to
            * live inside the Review step's JSX, which made one of its messages
            * unreachable: `restoreSavedProfile` sets "Restored last saved
            * progress." and then sends the user to step 1, where the block did not
            * exist. That is still the reason it sits out here.
            *
            * It now renders only while NOT submitted. The success case moved to the
            * panel below, which carries both the wording and its own
            * `role="status"`; leaving a status line as well said the same thing
            * twice. "Saving…" and the save error are unaffected. */}
          {statusMessage && !submitted ? (
            <div
              role={statusIsError ? 'alert' : 'status'}
              className={cn(
                'mt-6 rounded-xl px-4 py-3 text-sm font-medium',
                statusIsError
                  ? 'border border-destructive/30 bg-destructive/10 text-danger'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {statusMessage}
            </div>
          ) : null}

          {/* ── The save moment ──
            * A panel, not a link appended under a status line. Finishing this form
            * is the point of the whole surface and it used to be acknowledged by
            * one sentence and a button.
            *
            * It also carries the ONE route that did not exist before: a student who
            * took "Skip for now" had no way back to the extras from here — the
            * wizard congratulated them and offered a single exit. Now the secondary
            * action appears exactly when a booster is still empty.
            *
            * Kept below the status line so the pair stays in its original order
            * (message, then action), and `submitted` is still only ever set from a
            * successful save. */}
          {submitted ? (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: DURATION.base, ease: EASE_POP }}
              className="mt-4 rounded-2xl border border-success/25 bg-success-subtle p-5 text-center"
            >
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success-fill">
                <Check className="h-5 w-5 text-success-foreground" aria-hidden />
              </span>
              <p className="mt-3 font-heading text-base font-semibold text-foreground">
                Profile saved — your matches are ready
              </p>
              <p className="mt-1 text-body-sm text-muted-foreground">
                {boostersOutstanding
                  ? 'You can add the optional extras whenever you like; they sharpen the ranking.'
                  : 'Everything is in, and your ranking is running on your full profile.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm">
                  <a href="/matches">Get me to my matches</a>
                </Button>
                {boostersOutstanding ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentStep(FIRST_BOOSTER_STEP_INDEX)}
                  >
                    Add the optional extras
                  </Button>
                ) : null}
              </div>
            </motion.div>
          ) : null}

          {/* ── Navigation buttons ──
            * No `size="sm"`. These were `h-9` (36px) — under the 44px tap floor,
            * on the four most-tapped controls in a six-step mobile form. The
            * default `h-10` plus the row's `pt-4` gives a comfortable target
            * without making them look like hero buttons. */}
          <div className="mt-8 flex items-center justify-between gap-3 pt-4 border-t border-border/50">
            <Button
              type="button" variant="outline"
              onClick={goBack} disabled={currentStep === 1}
              className="h-11 gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>

            {currentStep < TOTAL_STEPS ? (
              <div className="flex items-center gap-2">
                {/* Skip the boosters and submit.
                    Only offered from the first booster step onward, because
                    `handleFinalSubmit` validates steps 1-3 and bounces to the
                    first offending one. Offering it on step 2 would look like an
                    exit and behave like a validation error.
                    Steps 4-5 are all-optional fields, so submitting from here
                    writes them as nulls — and `writeStudentIntake` upserts the
                    lifestyle row regardless, which is the row `runMatching`
                    requires. See src/lib/profile/steps.ts. */}
                {canSkipBoosters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSkipBoosters}
                    disabled={isSaving || submitted}
                    className="h-11 gap-1.5 text-muted-foreground"
                  >
                    Skip for now
                  </Button>
                ) : null}
                <Button type="button" onClick={goNext} className="h-11 gap-1.5">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                disabled={isSaving || submitted}
                className="h-11 gap-1.5 px-6"
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
