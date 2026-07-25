/**
 * Student → Programme Matcher v4
 *
 * Ported from student_matcher_v4.py.  Replaces the old tier-fit heuristic with
 * a sigmoid-based admission-probability model, comprehensive field-of-study
 * synonym matching, multi-currency fee estimation, aggressive course-name
 * dedup, and institution quality gates.
 *
 * The function signature and output types are preserved so the rest of the
 * app (service.ts, UI components, caching layer) keeps working unchanged.
 */

import type { IntendedCluster, StudentProfilePayload } from '@/lib/profile/intake-types';
import type { StudentScoreResult } from '@/lib/scoring/student_scoring';
import type { EnrichedCourseRecord } from '@/lib/tiering/course_tiering';

// ── Re-exports expected by the rest of the app ─────────────────────────────

export interface PreferencesFilters {
  city_in?: string[];
  max_yearly_fee_gbp?: number;
  cost_of_life_in?: Array<'HIGH' | 'MEDIUM' | 'LOW'>;
  min_nss_score_pct?: number;
  intake_size_min?: number;
  intake_size_max?: number;
  max_student_to_staff_ratio?: number;
  placement_year_required?: boolean;
  average_starting_salary_min_gbp?: number;
  university_life_in?: string[];
}

export interface RankedCourseMatch {
  university: string;
  course: string;
  ucas_code: string | null;
  program_id?: string;
  university_id?: string;
  course_tier: 1 | 2 | 3 | 4 | 5;
  tier_fit: 'Safety' | 'Target' | 'Reach' | 'Harder-than-reach';
  chance_percent: number;
  chance_category: 'Very likely' | 'Likely' | 'Possible' | 'Stretch' | 'Unlikely';
  reasons: string[];
  excluded: boolean;
}

// ── FX rates (approximate, for budget filtering only) ──────────────────────

const FX_TO_USD: Record<string, number> = { USD: 1.0, GBP: 1.27, AUD: 0.65, CAD: 0.74 };

const toUsd = (amount: number, currency: string): number =>
  amount * (FX_TO_USD[currency.toUpperCase()] ?? 1.0);

// ── Postgrad / non-bachelor filter ─────────────────────────────────────────

const PG_PATTERN = new RegExp(
  '(' +
    'PGDE|PGCE|MSW\\b|MSc\\b|MBA\\b|MPhil\\b|PhD\\b|DPhil\\b|' +
    'Master of|Masters in|' +
    'Postgraduate|Graduate Entry|Graduate-Entry|Graduates [Oo]nly|' +
    'Relevant Graduate|graduate programme|' +
    'Senior Status|Juris Doctor|' +
    'Accelerated Programme|Accelerated Program|' +
    'Physician Associate\\b|Intercalated\\b|' +
    'MChiro\\b|MChem\\b|MPhys\\b|MTh\\b' +
    ')',
  'i'
);
const BACH_START = /^(Bachelor|BEng|BSc|BA\b|BBA|BFA|BEd|LLB|MBBS|BDS|BVetMed|BMus|BArch|BMed)/i;
const DIPLOMA_PATTERN = /^(Diploma|Associate Degree|Certificate)/i;

const isPostgrad = (courseName: string): boolean => {
  const name = courseName.trim();
  if (DIPLOMA_PATTERN.test(name)) return true;
  if (BACH_START.test(name)) return false;
  return PG_PATTERN.test(name);
};

// ── Institution quality gate ───────────────────────────────────────────────

const isSuspiciousScore = (course: EnrichedCourseRecord): boolean => {
  const instType = ((course as any).institution_type ?? '').toLowerCase();
  if (instType.includes('for-profit') || instType.includes('for profit')) return true;
  const qs = (course as any).qs_world_rank_raw ?? '';
  const the = (course as any).the_world_rank_raw ?? '';
  // Production rows carry rank evidence as university_rank_overall (mapped from
  // QS World rank by the all-countries import); the raw rank strings only exist
  // in simulation fixtures.
  const rankOverall = (course as any).university_rank_overall;
  const hasRank =
    (qs !== '' && qs !== 'N/A') ||
    (the !== '' && the !== 'N/A') ||
    (typeof rankOverall === 'number' && Number.isFinite(rankOverall));
  return !hasRank && course.university_score > 88;
};

// ── Field-of-study synonym map ─────────────────────────────────────────────

const FIELD_SYNONYMS: Record<string, string[]> = {
  'computer science': ['Computer Science & IT'],
  cs: ['Computer Science & IT'],
  computing: ['Computer Science & IT'],
  'software engineering': ['Computer Science & IT', 'Engineering'],
  'software development': ['Computer Science & IT'],
  software: ['Computer Science & IT'],
  cybersecurity: ['Computer Science & IT', 'Criminal Justice & Security'],
  'cyber security': ['Computer Science & IT', 'Criminal Justice & Security'],
  'information security': ['Computer Science & IT', 'Criminal Justice & Security'],
  'artificial intelligence': ['Computer Science & IT', 'Mathematics & Statistics'],
  ai: ['Computer Science & IT', 'Mathematics & Statistics'],
  'machine learning': ['Computer Science & IT', 'Mathematics & Statistics'],
  'data science': ['Computer Science & IT', 'Mathematics & Statistics'],
  'data analytics': ['Computer Science & IT', 'Mathematics & Statistics'],
  it: ['Computer Science & IT'],
  'information technology': ['Computer Science & IT'],
  'web development': ['Computer Science & IT'],
  networking: ['Computer Science & IT', 'Engineering Technology'],
  'game design': ['Computer Science & IT', 'Visual & Performing Arts'],
  'game development': ['Computer Science & IT'],
  fintech: ['Computer Science & IT', 'Business & Management'],

  engineering: ['Engineering', 'Engineering Technology'],
  'civil engineering': ['Engineering'],
  'mechanical engineering': ['Engineering'],
  'electrical engineering': ['Engineering', 'Engineering Technology'],
  'electronic engineering': ['Engineering', 'Engineering Technology'],
  'chemical engineering': ['Engineering'],
  'aerospace engineering': ['Engineering'],
  aerospace: ['Engineering'],
  'biomedical engineering': ['Engineering', 'Health Sciences & Medicine'],
  'environmental engineering': ['Engineering', 'Agriculture & Natural Resources'],
  'structural engineering': ['Engineering'],
  manufacturing: ['Engineering', 'Engineering Technology'],
  robotics: ['Engineering', 'Computer Science & IT'],
  mechatronics: ['Engineering'],
  'renewable energy': ['Engineering', 'Physical Sciences'],
  energy: ['Engineering', 'Physical Sciences'],
  'materials science': ['Physical Sciences', 'Engineering'],
  'materials engineering': ['Engineering'],
  construction: ['Engineering'],

  business: ['Business & Management'],
  management: ['Business & Management'],
  economics: ['Business & Management', 'Social Sciences'],
  finance: ['Business & Management'],
  accounting: ['Business & Management'],
  accountancy: ['Business & Management'],
  marketing: ['Business & Management', 'Communications & Media'],
  hr: ['Business & Management'],
  'human resources': ['Business & Management'],
  entrepreneurship: ['Business & Management'],
  'international business': ['Business & Management'],
  'supply chain': ['Business & Management'],
  logistics: ['Business & Management'],
  retail: ['Business & Management'],
  'real estate': ['Business & Management'],
  hospitality: ['Business & Management', 'Personal & Culinary Services', 'Leisure & Sport Management'],
  'hotel management': ['Business & Management', 'Leisure & Sport Management'],
  tourism: ['Business & Management', 'Leisure & Sport Management'],

  medicine: ['Health Sciences & Medicine'],
  medical: ['Health Sciences & Medicine'],
  health: ['Health Sciences & Medicine'],
  nursing: ['Health Sciences & Medicine'],
  pharmacy: ['Health Sciences & Medicine'],
  pharmacology: ['Health Sciences & Medicine', 'Biological Sciences'],
  dentistry: ['Health Sciences & Medicine'],
  dental: ['Health Sciences & Medicine'],
  veterinary: ['Health Sciences & Medicine', 'Agriculture & Natural Resources'],
  physiotherapy: ['Health Sciences & Medicine'],
  'occupational therapy': ['Health Sciences & Medicine'],
  'speech therapy': ['Health Sciences & Medicine'],
  nutrition: ['Health Sciences & Medicine', 'Agriculture & Natural Resources'],
  dietetics: ['Health Sciences & Medicine'],
  'public health': ['Health Sciences & Medicine', 'Social Sciences'],
  'biomedical science': ['Health Sciences & Medicine', 'Biological Sciences'],
  optometry: ['Health Sciences & Medicine'],
  radiography: ['Health Sciences & Medicine'],
  midwifery: ['Health Sciences & Medicine'],
  paramedicine: ['Health Sciences & Medicine'],
  osteopathy: ['Health Sciences & Medicine'],

  biology: ['Biological Sciences', 'Natural Sciences'],
  bioscience: ['Biological Sciences', 'Natural Sciences'],
  biosciences: ['Biological Sciences', 'Natural Sciences'],
  biochemistry: ['Biological Sciences', 'Natural Sciences', 'Physical Sciences'],
  'molecular biology': ['Biological Sciences', 'Natural Sciences'],
  genetics: ['Biological Sciences', 'Natural Sciences'],
  microbiology: ['Biological Sciences', 'Natural Sciences'],
  ecology: ['Biological Sciences', 'Agriculture & Natural Resources'],
  'marine biology': ['Biological Sciences', 'Natural Sciences'],
  zoology: ['Biological Sciences', 'Natural Sciences'],
  botany: ['Biological Sciences', 'Natural Sciences'],
  neuroscience: ['Biological Sciences', 'Health Sciences & Medicine', 'Natural Sciences'],
  'life sciences': ['Biological Sciences', 'Natural Sciences'],

  physics: ['Physical Sciences', 'Natural Sciences', 'Engineering'],
  chemistry: ['Physical Sciences', 'Natural Sciences'],
  astrophysics: ['Physical Sciences', 'Natural Sciences'],
  astronomy: ['Physical Sciences', 'Natural Sciences'],
  geology: ['Physical Sciences', 'Natural Sciences'],
  geoscience: ['Physical Sciences', 'Natural Sciences'],
  oceanography: ['Physical Sciences', 'Natural Sciences'],
  'climate science': ['Physical Sciences', 'Natural Sciences'],
  'earth science': ['Physical Sciences', 'Natural Sciences'],

  'natural sciences': ['Natural Sciences', 'Biological Sciences', 'Physical Sciences'],
  sciences: ['Natural Sciences', 'Biological Sciences', 'Physical Sciences', 'Mathematics & Statistics', 'Computer Science & IT', 'Engineering'],
  science: ['Natural Sciences', 'Biological Sciences', 'Physical Sciences'],

  mathematics: ['Mathematics & Statistics'],
  maths: ['Mathematics & Statistics'],
  math: ['Mathematics & Statistics'],
  statistics: ['Mathematics & Statistics'],
  'actuarial science': ['Mathematics & Statistics'],
  'quantitative finance': ['Mathematics & Statistics', 'Business & Management'],

  'social sciences': ['Social Sciences', 'Psychology', 'Area, Ethnic & Cultural Studies', 'Communications & Media'],
  sociology: ['Social Sciences'],
  politics: ['Social Sciences', 'Public Administration'],
  'political science': ['Social Sciences', 'Public Administration'],
  'international relations': ['Social Sciences'],
  'development studies': ['Social Sciences', 'Area, Ethnic & Cultural Studies'],
  'human geography': ['Social Sciences', 'Natural Sciences'],
  geography: ['Natural Sciences', 'Social Sciences'],
  anthropology: ['Area, Ethnic & Cultural Studies', 'Social Sciences'],
  'economics and politics': ['Social Sciences', 'Business & Management'],
  'social work': ['Social Sciences'],
  'public policy': ['Public Administration', 'Social Sciences'],
  'public administration': ['Public Administration'],
  governance: ['Public Administration', 'Social Sciences'],

  psychology: ['Psychology', 'Social Sciences'],
  'behavioural science': ['Psychology', 'Social Sciences'],
  'behavioral science': ['Psychology', 'Social Sciences'],
  counselling: ['Psychology', 'Health Sciences & Medicine'],
  counseling: ['Psychology', 'Health Sciences & Medicine'],
  'cognitive science': ['Psychology', 'Computer Science & IT'],
  'mental health': ['Psychology', 'Health Sciences & Medicine'],

  law: ['Legal Studies'],
  legal: ['Legal Studies'],
  'legal studies': ['Legal Studies'],
  criminology: ['Criminal Justice & Security', 'Legal Studies', 'Social Sciences'],
  'criminal justice': ['Criminal Justice & Security', 'Legal Studies'],
  'forensic science': ['Criminal Justice & Security', 'Physical Sciences'],
  forensics: ['Criminal Justice & Security', 'Physical Sciences'],
  policing: ['Criminal Justice & Security'],
  'security studies': ['Criminal Justice & Security', 'Social Sciences'],
  cybercrime: ['Criminal Justice & Security', 'Computer Science & IT'],

  arts: ['Visual & Performing Arts', 'Arts & Humanities'],
  humanities: ['Arts & Humanities', 'History', 'English & Literature', 'Languages & Linguistics', 'Philosophy & Religious Studies'],
  'liberal arts': ['Liberal Arts & Sciences', 'Arts & Humanities'],
  history: ['History', 'Arts & Humanities'],
  'ancient history': ['History', 'Arts & Humanities'],
  'art history': ['History', 'Visual & Performing Arts', 'Arts & Humanities'],
  classics: ['Arts & Humanities', 'History', 'Languages & Linguistics'],
  philosophy: ['Philosophy & Religious Studies', 'Philosophy & Religion', 'Arts & Humanities'],
  ethics: ['Philosophy & Religious Studies', 'Philosophy & Religion'],
  theology: ['Theology & Religious Vocations', 'Philosophy & Religious Studies', 'Philosophy & Religion'],
  'religious studies': ['Theology & Religious Vocations', 'Philosophy & Religious Studies'],
  divinity: ['Theology & Religious Vocations', 'Philosophy & Religious Studies'],

  english: ['English & Literature', 'Languages & Linguistics'],
  'english literature': ['English & Literature'],
  literature: ['English & Literature', 'Arts & Humanities'],
  'creative writing': ['English & Literature', 'Visual & Performing Arts'],
  writing: ['English & Literature'],

  languages: ['Languages & Linguistics', 'Arts & Humanities'],
  linguistics: ['Languages & Linguistics'],
  translation: ['Languages & Linguistics'],
  'modern languages': ['Languages & Linguistics', 'Arts & Humanities'],
  french: ['Languages & Linguistics'],
  spanish: ['Languages & Linguistics'],
  german: ['Languages & Linguistics'],
  japanese: ['Languages & Linguistics'],
  arabic: ['Languages & Linguistics'],
  italian: ['Languages & Linguistics'],
  korean: ['Languages & Linguistics'],

  'fine art': ['Visual & Performing Arts'],
  'fine arts': ['Visual & Performing Arts'],
  design: ['Visual & Performing Arts', 'Architecture & Design'],
  'graphic design': ['Visual & Performing Arts'],
  'product design': ['Visual & Performing Arts', 'Engineering'],
  fashion: ['Visual & Performing Arts'],
  'fashion design': ['Visual & Performing Arts'],
  'interior design': ['Visual & Performing Arts', 'Architecture & Design'],
  music: ['Visual & Performing Arts'],
  'music performance': ['Visual & Performing Arts'],
  theatre: ['Visual & Performing Arts'],
  drama: ['Visual & Performing Arts'],
  dance: ['Visual & Performing Arts'],
  film: ['Visual & Performing Arts', 'Communications & Media'],
  filmmaking: ['Visual & Performing Arts', 'Communications & Media'],
  photography: ['Visual & Performing Arts'],
  animation: ['Visual & Performing Arts', 'Computer Science & IT'],
  illustration: ['Visual & Performing Arts'],
  'performing arts': ['Visual & Performing Arts'],
  acting: ['Visual & Performing Arts'],
  'musical theatre': ['Visual & Performing Arts'],
  'game art': ['Visual & Performing Arts', 'Computer Science & IT'],

  architecture: ['Architecture & Design', 'Architecture & Urban Planning'],
  'urban planning': ['Architecture & Design', 'Architecture & Urban Planning'],
  'urban design': ['Architecture & Design', 'Architecture & Urban Planning'],
  'landscape architecture': ['Architecture & Design', 'Agriculture & Natural Resources'],
  'interior architecture': ['Architecture & Design'],

  communications: ['Communications & Media'],
  communication: ['Communications & Media'],
  media: ['Communications & Media', 'Visual & Performing Arts'],
  'media studies': ['Communications & Media'],
  journalism: ['Communications & Media'],
  'public relations': ['Communications & Media', 'Business & Management'],
  advertising: ['Communications & Media', 'Business & Management'],
  broadcasting: ['Communications & Media'],
  television: ['Communications & Media', 'Visual & Performing Arts'],
  'digital media': ['Communications & Media', 'Computer Science & IT'],

  sport: ['Leisure & Sport Management', 'Sports & Exercise Science'],
  sports: ['Leisure & Sport Management', 'Sports & Exercise Science'],
  'sports science': ['Leisure & Sport Management', 'Sports & Exercise Science'],
  'sport science': ['Leisure & Sport Management', 'Sports & Exercise Science'],
  'exercise science': ['Sports & Exercise Science', 'Leisure & Sport Management'],
  kinesiology: ['Sports & Exercise Science', 'Leisure & Sport Management'],
  'physical education': ['Education', 'Leisure & Sport Management', 'Sports & Exercise Science'],
  fitness: ['Leisure & Sport Management', 'Sports & Exercise Science'],
  coaching: ['Leisure & Sport Management', 'Sports & Exercise Science'],
  'sports management': ['Leisure & Sport Management', 'Business & Management'],
  esports: ['Computer Science & IT', 'Leisure & Sport Management'],

  education: ['Education'],
  teaching: ['Education'],
  'early childhood': ['Education'],
  'childhood studies': ['Education'],
  'special education': ['Education'],

  agriculture: ['Agriculture & Natural Resources'],
  'environmental science': ['Agriculture & Natural Resources', 'Natural Sciences', 'Physical Sciences'],
  'environmental studies': ['Agriculture & Natural Resources', 'Natural Sciences', 'Social Sciences'],
  environmental: ['Agriculture & Natural Resources', 'Natural Sciences', 'Physical Sciences'],
  sustainability: ['Agriculture & Natural Resources', 'Social Sciences'],
  forestry: ['Agriculture & Natural Resources'],
  horticulture: ['Agriculture & Natural Resources'],
  'food science': ['Agriculture & Natural Resources', 'Health Sciences & Medicine'],
  'animal science': ['Agriculture & Natural Resources'],
  conservation: ['Agriculture & Natural Resources', 'Natural Sciences'],

  'cultural studies': ['Area, Ethnic & Cultural Studies', 'Social Sciences'],
  'area studies': ['Area, Ethnic & Cultural Studies'],
  'gender studies': ['Area, Ethnic & Cultural Studies', 'Social Sciences'],
  interdisciplinary: ['Interdisciplinary Studies', 'Liberal Arts & Sciences'],
  'general studies': ['Liberal Arts & Sciences', 'Interdisciplinary Studies'],
};

// ── Field keyword fallback (for rows with blank field_of_study) ────────────

const FIELD_KEYWORDS: Record<string, Set<string>> = {
  'Computer Science & IT': new Set(['computer', 'computing', 'software', 'cybersecurity', 'data science', 'artificial intelligence', 'machine learning', 'web development', 'information technology', 'programming']),
  Engineering: new Set(['engineering', 'mechatronics', 'robotics', 'aerospace', 'aeronautic', 'automotive', 'manufacturing', 'civil eng', 'structural', 'renewable energy']),
  'Business & Management': new Set(['business', 'management', 'finance', 'accounting', 'marketing', 'economics', 'entrepreneurship', 'commerce', 'supply chain', 'logistics']),
  'Health Sciences & Medicine': new Set(['medicine', 'nursing', 'pharmacy', 'dentistry', 'physiotherapy', 'health science', 'biomedical', 'midwifery', 'paramedic', 'optometry', 'radiography']),
  'Biological Sciences': new Set(['biology', 'bioscience', 'biochemistry', 'genetics', 'microbiology', 'ecology', 'marine biology', 'zoology', 'neuroscience', 'life science']),
  'Physical Sciences': new Set(['physics', 'chemistry', 'astrophysics', 'astronomy', 'geology', 'geoscience', 'earth science']),
  'Mathematics & Statistics': new Set(['mathematics', 'statistics', 'actuarial', 'quantitative', 'maths']),
  'Social Sciences': new Set(['sociology', 'politics', 'political science', 'international relations', 'social science', 'development studies', 'human geography', 'geography', 'anthropology']),
  Psychology: new Set(['psychology', 'behavioural science', 'behavioral science', 'counselling', 'counseling', 'cognitive science', 'mental health']),
  'Legal Studies': new Set(['law', 'legal', 'llb', 'jurisprudence']),
  'Criminal Justice & Security': new Set(['criminology', 'criminal justice', 'forensic', 'security', 'policing', 'law enforcement', 'cybercrime']),
  History: new Set(['history', 'ancient history', 'medieval', 'heritage', 'archaeology']),
  'English & Literature': new Set(['english', 'literature', 'creative writing', 'writing']),
  'Languages & Linguistics': new Set(['linguistics', 'language', 'translation', 'modern languages']),
  'Visual & Performing Arts': new Set(['art', 'design', 'music', 'theatre', 'drama', 'dance', 'film', 'photography', 'animation', 'illustration', 'fashion', 'acting']),
  'Communications & Media': new Set(['journalism', 'media', 'communication', 'broadcasting', 'digital media', 'public relations', 'advertising']),
  'Architecture & Design': new Set(['architecture', 'interior design', 'urban planning', 'urban design']),
  Education: new Set(['education', 'teaching', 'early childhood', 'childhood studies']),
  'Agriculture & Natural Resources': new Set(['agriculture', 'environmental', 'forestry', 'horticulture', 'food science', 'conservation', 'sustainability']),
  'Leisure & Sport Management': new Set(['sport', 'sports', 'exercise', 'recreation', 'kinesiology', 'fitness', 'coaching', 'leisure']),
};

// ── Narrow ↔ broad field cross-matching ────────────────────────────────────

const NARROW_TO_BROAD: Record<string, Array<[string, Set<string>]>> = {
  'Leisure & Sport Management': [
    ['Social Sciences', new Set(['sport', 'sports', 'exercise', 'kinesiology', 'athletics', 'physical education', 'recreation', 'fitness', 'coaching', 'sport science', 'sports science'])],
  ],
  'Communications & Media': [
    ['Arts & Humanities', new Set(['journalism', 'media', 'communication', 'broadcasting', 'public relations', 'advertising', 'film', 'digital media', 'screen', 'television', 'radio'])],
    ['Visual & Performing Arts', new Set(['journalism', 'media', 'communication', 'digital media', 'film', 'screen', 'broadcasting', 'television'])],
    ['Social Sciences', new Set(['journalism', 'media studies', 'communication studies'])],
  ],
  'Architecture & Design': [
    ['Visual & Performing Arts', new Set(['architecture', 'interior design', 'urban design', 'landscape design'])],
  ],
  'Criminal Justice & Security': [
    ['Social Sciences', new Set(['criminology', 'criminal justice', 'forensic', 'policing', 'law enforcement'])],
    ['Legal Studies', new Set(['criminology', 'criminal law', 'forensic'])],
  ],
};

// ── Cluster → primary field_of_study labels ────────────────────────────────
// Maps directly to the field_of_study values in the CSV data.
// These are the PRIMARY fields only — no cross-pollination. The v4 matcher's
// keyword fallback and broad-field matching handle edge cases at match time.

const CLUSTER_TO_PRIMARY_FIELDS: Record<IntendedCluster, string[]> = {
  computer_science: ['Computer Science & IT'],
  maths: ['Mathematics & Statistics'],
  engineering: ['Engineering', 'Engineering Technology'],
  life_sciences_biochem: ['Biological Sciences', 'Natural Sciences', 'Physical Sciences'],
  medicine_dentistry: ['Health Sciences & Medicine', 'Biological Sciences'],
  economics_quant: ['Business & Management', 'Social Sciences'],
  business_non_quant: ['Business & Management'],
  law: ['Legal Studies', 'Criminal Justice & Security'],
  humanities: ['Arts & Humanities', 'History', 'English & Literature', 'Languages & Linguistics', 'Philosophy & Religious Studies', 'Social Sciences', 'Psychology', 'Area, Ethnic & Cultural Studies'],
  creative: ['Visual & Performing Arts', 'Architecture & Design', 'Architecture & Urban Planning', 'Communications & Media'],
};

// ── Resolve clusters → target field_of_study labels ────────────────────────

export const resolveTargetFields = (clusters: IntendedCluster[]): Set<string> | null => {
  if (!clusters.length) return null;
  const out = new Set<string>();
  for (const cluster of clusters) {
    const labels = CLUSTER_TO_PRIMARY_FIELDS[cluster] ?? [];
    labels.forEach((label) => out.add(label));
  }
  return out.size > 0 ? out : null;
};

const fieldKeywordMatch = (courseName: string, targetFields: Set<string>): boolean => {
  const nameLower = courseName.toLowerCase();
  for (const field of targetFields) {
    const kws = FIELD_KEYWORDS[field];
    if (kws && Array.from(kws).some((kw) => nameLower.includes(kw))) return true;
  }
  return false;
};

const broadFieldMatch = (fos: string, courseName: string, targetFields: Set<string>): boolean => {
  const cnameLower = courseName.toLowerCase();
  for (const tf of targetFields) {
    const entries = NARROW_TO_BROAD[tf];
    if (!entries) continue;
    for (const [broadField, keywords] of entries) {
      if (fos === broadField && Array.from(keywords).some((kw) => cnameLower.includes(kw))) return true;
    }
  }
  return false;
};

const matchesField = (fos: string | null, courseName: string, targetFields: Set<string> | null): boolean => {
  if (!targetFields) return true; // no field preference = show all
  if (fos && targetFields.has(fos)) return true;
  if (!fos && fieldKeywordMatch(courseName, targetFields)) return true;
  if (fos && broadFieldMatch(fos, courseName, targetFields)) return true;
  return false;
};

// ── Fee estimation (multi-currency) ────────────────────────────────────────

const estimateFeeUsd = (course: EnrichedCourseRecord & Record<string, any>): { feeUsd: number | null; estimated: boolean } => {
  const currency = course.program_currency ?? 'GBP';
  const intlTuition = course.yearly_international_tuition_fee_gbp;
  if (intlTuition != null && intlTuition > 0) {
    // This field is already in GBP (converted during import)
    return { feeUsd: toUsd(intlTuition, 'GBP'), estimated: false };
  }
  const domTuition = course.program_tuition;
  if (domTuition != null && domTuition > 0 && currency === 'GBP') {
    return { feeUsd: toUsd(domTuition * 2.5, 'GBP'), estimated: true };
  }
  if (domTuition != null && domTuition > 0) {
    return { feeUsd: toUsd(domTuition, currency), estimated: true };
  }
  return { feeUsd: null, estimated: false };
};

// ── Tier-implied IB minimum (linear interpolation) ─────────────────────────

const IB_BREAKPOINTS: [number, number][] = [[100, 45], [92, 42], [85, 38], [75, 34], [65, 30], [50, 26], [0, 22]];

const tierImpliedMinIb = (score: number | null): number => {
  if (score === null) return 28;
  for (let i = 0; i < IB_BREAKPOINTS.length - 1; i++) {
    const [sHi, ibHi] = IB_BREAKPOINTS[i];
    const [sLo, ibLo] = IB_BREAKPOINTS[i + 1];
    if (score >= sLo) {
      const t = sHi !== sLo ? (score - sLo) / (sHi - sLo) : 1.0;
      return Math.round(ibLo + t * (ibHi - ibLo));
    }
  }
  return 22;
};

// ── Admission probability (sigmoid 8–95%) ──────────────────────────────────

const admissionProbability = (effGap: number): number => {
  const raw = 1.0 / (1.0 + Math.exp(-0.35 * effGap));
  const prob = 8 + raw * 87;
  return Math.round(Math.min(95, Math.max(8, prob)));
};

// ── Classifier ─────────────────────────────────────────────────────────────

type Category = 'safety' | 'match' | 'reach' | 'excluded';

const classify = (
  studentIb: number,
  minIb: number | null,
  courseScore: number | null,
  selectivityScore: number | null
): { category: Category; admitPct: number } => {
  const sc = courseScore ?? 40;

  let effectiveMin: number;
  if (minIb !== null) {
    effectiveMin = minIb;
  } else if (selectivityScore !== null) {
    effectiveMin = Math.round(24 + (selectivityScore / 100) * 21);
  } else {
    effectiveMin = tierImpliedMinIb(sc);
  }

  const gap = studentIb - effectiveMin;
  const prestigePenalty = Math.max(0, (sc - 65) / 35) * 2.5;
  const effGap = gap - prestigePenalty;

  // Relax thresholds for lower IB students
  let excl: number, reach: number, match: number, safety: number;
  if (studentIb <= 27) {
    excl = -5; reach = -3; match = 0; safety = 4;
  } else if (studentIb <= 31) {
    excl = -4; reach = -3; match = 1; safety = 5;
  } else {
    excl = -3; reach = -2; match = 2; safety = 6;
  }

  const admitPct = admissionProbability(effGap);
  if (effGap < excl) return { category: 'excluded', admitPct };
  if (effGap >= safety) return { category: 'safety', admitPct };
  if (effGap >= match) return { category: 'match', admitPct };
  if (effGap >= reach) return { category: 'reach', admitPct };
  return { category: 'excluded', admitPct };
};

// ── Safety prestige floor ──────────────────────────────────────────────────

const minSafetyScore = (ib: number): number => {
  if (ib >= 40) return 68;
  if (ib >= 36) return 55;
  if (ib >= 33) return 45;
  if (ib >= 28) return 32;
  return 25;
};

// ── Dedup noise stripping ──────────────────────────────────────────────────

const DEDUP_NOISE = new RegExp(
  '\\s*(' +
    '[-–]\\s*(FT|PT|FT/PT|ONL|OL|Online|On-campus|On campus|Harbin)' +
    '|with\\s+(integrated\\s+)?foundation year' +
    '|with\\s+placement\\s+year' +
    '|with\\s+study\\s+abroad' +
    '|with\\s+year\\s+(in\\s+industry|abroad)' +
    '|with\\s+industrial\\s+(experience|placement)' +
    '|[-–(]\\s*20\\d\\d\\s*(Entry|Early Entry|Intake)?[-)]*' +
    '|\\(hons\\)|\\[hons\\]' +
    '|beng\\b|meng\\b' +
    ')\\s*',
  'gi'
);

const normCourse = (name: string): string =>
  name.replace(DEDUP_NOISE, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// ── Legacy preference filters (kept for backward compat) ───────────────────

const filterCourses = (courses: EnrichedCourseRecord[], filters?: PreferencesFilters) => {
  if (!filters) return courses;
  return courses.filter((course) => {
    if (filters.city_in?.length && course.city && !filters.city_in.includes(course.city)) return false;
    if (filters.max_yearly_fee_gbp !== undefined && course.yearly_international_tuition_fee_gbp !== null) {
      if (course.yearly_international_tuition_fee_gbp > filters.max_yearly_fee_gbp) return false;
    }
    if (filters.cost_of_life_in?.length && course.cost_of_life && !filters.cost_of_life_in.includes(course.cost_of_life)) return false;
    if (filters.min_nss_score_pct !== undefined && course.nss_score_pct !== null && course.nss_score_pct < filters.min_nss_score_pct) return false;
    if (filters.placement_year_required && course.placement_year !== null && (!course.placement_year || course.placement_year.toLowerCase() === 'no')) return false;
    return true;
  });
};

// ── Map category → tier_fit for type compatibility ─────────────────────────

const categoryToTierFit = (category: Category): RankedCourseMatch['tier_fit'] => {
  if (category === 'safety') return 'Safety';
  if (category === 'match') return 'Target';
  if (category === 'reach') return 'Reach';
  return 'Harder-than-reach';
};

const clampChance = (value: number) => Math.max(5, Math.min(95, Math.round(value)));

// ── Per-course chance classification (shared) ──────────────────────────────
//
// Single scoring path for both the ranked-matches pipeline and the on-demand
// scorer (explore page) — the two must produce identical numbers for the same
// course, so the metadata fallbacks and classify call live here, not inline.

export const classifyCourseChance = (
  studentIb: number,
  course: EnrichedCourseRecord
): { category: Category; admitPct: number; chancePercent: number } => {
  const meta = (course as any).metadata ?? {};
  const courseScore =
    course.total_course_score ??
    (typeof meta.total_course_score === 'number' ? meta.total_course_score : null);
  const selectivityScore =
    course.course_selectivity_score ??
    (typeof meta.selectivity_score === 'number' ? meta.selectivity_score : null);
  const { category, admitPct } = classify(studentIb, course.min_ib_score, courseScore, selectivityScore);
  return { category, admitPct, chancePercent: clampChance(admitPct) };
};

// ── A-level → IB equivalent conversion ────────────────────────────────────
//
// Used when a student has no ib_total_points (i.e. A-level pathway).
// Maps the top-3 A-level grades to an IB equivalent on a 24–43 scale,
// consistent with UCAS / Russell Group published conversion tables.
//
// Grade → IB subject-point proxy:
//   A* = 7,  A = 6,  B = 5,  C = 4,  D = 3,  E = 2
//
// Three subjects cap at max sum 21 (A*A*A*), min 6 (EEE).
// Linear interpolation: IB = 24 + ((sum - 6) / 15) × 19  →  24–43 range.
//
// Examples:
//   A*A*A  (20) → 42    A*AA  (19) → 41    AAA  (18) → 39
//   AAB   (17) → 38    ABB   (16) → 36    BBB  (15) → 35
//   BBC   (14) → 33    BCC   (13) → 32    CCC  (12) → 30

const A_LEVEL_GRADE_POINTS: Record<string, number> = {
  'A*': 7, A: 6, B: 5, C: 4, D: 3, E: 2, U: 1,
};

export const aLevelToIbEquivalent = (
  predictedGrades: Record<string, string> | null | undefined
): number => {
  if (!predictedGrades) return 33; // population median fallback
  const pts = Object.values(predictedGrades)
    .map((g) => A_LEVEL_GRADE_POINTS[g.trim().toUpperCase()] ?? 4)
    .sort((a, b) => b - a)   // descending
    .slice(0, 3);             // top 3 subjects
  if (pts.length === 0) return 33;
  const sum = pts.reduce((acc, v) => acc + v, 0);
  // Clamp to the documented 24–43 scale: with fewer than 3 predicted grades
  // the sum can fall below 6, which would otherwise extrapolate below 24 and
  // over-harshly exclude partially-filled profiles.
  return Math.min(43, Math.max(24, Math.round(24 + ((sum - 6) / 15) * 19)));
};

// ── ACT → IB equivalent conversion ────────────────────────────────────────
//
// Converts ACT composite to an IB-equivalent for the matching classifier.
// Calibrated against published US university middle-50% admit data (2024):
//   MIT/Harvard/Princeton  ACT 34-36 → typical IB admit 40-45
//   NYU Stern/UMich        ACT 32-33 → typical IB admit 37-40
//   McGill                 ACT ~32   → min IB ~36
//   Monash/UBC             ACT ~27   → min IB ~32
//
// ACT 36→45, 35→43, 34→41, 33→40, 32→38, 31→37, 30→35,
// 28-29→33, 26-27→31, 24-25→29, 21-23→27, 18-20→25, <18→24

export const actToIbEquivalent = (actScore: number | null | undefined): number => {
  if (!actScore) return 33; // population median fallback
  if (actScore >= 36) return 45;
  if (actScore >= 35) return 43;
  if (actScore >= 34) return 41;
  if (actScore >= 33) return 40;
  if (actScore >= 32) return 38;
  if (actScore >= 31) return 37;
  if (actScore >= 30) return 35;
  if (actScore >= 28) return 33;
  if (actScore >= 26) return 31;
  if (actScore >= 24) return 29;
  if (actScore >= 21) return 27;
  if (actScore >= 18) return 25;
  return 24;
};

// ── MAIN EXPORT ────────────────────────────────────────────────────────────

// Resolve student's academic level to an IB equivalent for the classifier.
// Priority: explicit IB total → A-level predicted grades → ACT score → population median (33).
// The wizard stores ib_total_points as the subject sum (/42) with core points
// (TOK + EE, max 3) in ib_core_points — course minima are on the /45 scale,
// so the two must be summed here, mirroring scoreStudentProfile.
export const resolveStudentIbEquivalent = (student: StudentProfilePayload): number => {
  const ibTotal =
    student.academic_input.ib_total_points != null
      ? Math.min(
          45,
          student.academic_input.ib_total_points + (student.academic_input.ib_core_points ?? 0)
        )
      : null;
  return (
    ibTotal ??
    (student.academic_input.a_level_predicted_grades
      ? aLevelToIbEquivalent(student.academic_input.a_level_predicted_grades)
      : student.academic_input.programme_type === 'ACT'
      ? actToIbEquivalent(student.lifestyle_preference.act_score)
      : 33)
  );
};

export const rankCourseMatches = (
  student: StudentProfilePayload,
  _score: StudentScoreResult,
  courses: EnrichedCourseRecord[],
  filters?: PreferencesFilters
): RankedCourseMatch[] => {
  const clusters = [
    ...(student.academic_input.intended_clusters ?? []),
    ...(student.academic_input.secondary_clusters ?? [])
  ];
  const targetFields = resolveTargetFields(clusters);

  const studentIb = resolveStudentIbEquivalent(student);

  // Budget in USD — from lifestyle preference or default to 45k
  // The current profile doesn't have a direct budget field, so we
  // derive it from the preference filters or use the v4 median default
  const budgetUsd = filters?.max_yearly_fee_gbp
    ? toUsd(filters.max_yearly_fee_gbp, 'GBP')
    : 999_999; // no budget cap if not specified in filters

  const minFloor = minSafetyScore(studentIb);

  // Apply legacy preference filters first
  const preFiltered = filterCourses(courses, filters);

  // Dedup map: (university, normalised course name) → best entry
  const seenBase = new Map<string, { match: RankedCourseMatch; courseScore: number }>();

  for (const course of preFiltered) {
    const cname = course.course ?? '';

    // Postgrad filter
    if (isPostgrad(cname)) continue;

    // Quality gate
    if (isSuspiciousScore(course)) continue;

    // Field matching
    if (!matchesField(course.field_of_study, cname, targetFields)) continue;

    // Budget filter
    const { feeUsd } = estimateFeeUsd(course as any);
    if (feeUsd !== null && feeUsd > budgetUsd * 1.12) continue;

    // Get scoring data from metadata (populated by our transform)
    const meta = (course as any).metadata ?? {};
    const courseScore = course.total_course_score ?? (typeof meta.total_course_score === 'number' ? meta.total_course_score : null);
    const courseTierRaw = course.course_tier ?? (typeof meta.course_tier === 'number' ? meta.course_tier : 5);
    const courseTier = (courseTierRaw >= 1 && courseTierRaw <= 5 ? courseTierRaw : 5) as 1 | 2 | 3 | 4 | 5;

    // Min IB from the course data
    const minIb = course.min_ib_score;

    // Classify (shared path with the on-demand scorer)
    const { category, admitPct, chancePercent } = classifyCourseChance(studentIb, course);

    if (category === 'excluded') continue;
    if (category === 'safety' && (courseScore ?? 0) < minFloor) continue;

    const tierFit = categoryToTierFit(category);

    const reasons: string[] = [];
    if (minIb !== null && studentIb < minIb) {
      reasons.push(`IB ${studentIb} below requirement ${minIb}`);
    }

    const entry: RankedCourseMatch = {
      university: course.university,
      course: cname,
      ucas_code: course.ucas_code ?? null,
      program_id: (course as any).program_id,
      university_id: (course as any).university_id,
      course_tier: courseTier,
      tier_fit: tierFit,
      chance_percent: chancePercent,
      chance_category:
        admitPct >= 80 ? 'Very likely'
          : admitPct >= 65 ? 'Likely'
          : admitPct >= 45 ? 'Possible'
          : admitPct >= 25 ? 'Stretch'
          : 'Unlikely',
      reasons,
      excluded: false,
    };

    // Dedup: keep highest-scoring variant per (uni, normalised course)
    const baseKey = `${course.university.trim().toLowerCase()}::${normCourse(cname)}`;
    const existing = seenBase.get(baseKey);
    if (!existing || (courseScore ?? 0) > existing.courseScore) {
      seenBase.set(baseKey, { match: entry, courseScore: courseScore ?? 0 });
    }
  }

  // Collect and sort
  const results = Array.from(seenBase.values()).map((entry) => entry.match);

  results.sort((a, b) => {
    if (b.chance_percent !== a.chance_percent) return b.chance_percent - a.chance_percent;
    if (a.course_tier !== b.course_tier) return a.course_tier - b.course_tier;
    return 0;
  });

  return results;
};
