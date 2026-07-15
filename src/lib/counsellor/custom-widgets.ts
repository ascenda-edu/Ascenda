// Custom analytics widgets — user-defined count widgets over cohort data.
//
// A widget definition is a small serializable descriptor (what to count, how
// to group it, how to draw it). Definitions live in localStorage on the
// counsellor's browser (see _components/use-custom-widgets.ts); aggregation
// happens client-side over the CounsellorStudent[] the analytics page already
// loads, so no extra data fetching is involved. The curated dimension registry
// below is the whole "query language": every custom widget is a count of rows
// from one source, grouped by one dimension.

import type {
  CounsellorApplication,
  CounsellorDeadline,
  CounsellorMatch,
  CounsellorStudent
} from '@/lib/counsellor/types';

export type CustomWidgetId = `custom:${string}`;
export type CustomWidgetSource = 'students' | 'applications' | 'matches' | 'deadlines';
export type CustomWidgetViz = 'bars' | 'stacked' | 'kpi';

export interface CustomWidgetDef {
  id: CustomWidgetId;
  title: string;
  source: CustomWidgetSource;
  dimension: string;
  viz: CustomWidgetViz;
  createdAt: string;
}

export interface CustomWidgetStudentRef {
  student: CounsellorStudent;
  /** One entry per counted row for this student, e.g. "Oxford — PPE". */
  details: string[];
}

export interface CustomWidgetBucket {
  key: string;
  label: string;
  count: number;
  students: CustomWidgetStudentRef[];
}

export interface CustomWidgetResult {
  buckets: CustomWidgetBucket[];
  /** Sum of bucket counts — the geometric total (stacked-bar widths). */
  total: number;
  /**
   * Number of rows counted. Differs from `total` only for multi-label
   * dimensions (a student with two risk flags is one row but two bucket
   * increments); "% of <unit>" displays must divide by this, not `total`.
   */
  rowTotal: number;
  unitSingular: string;
  unitPlural: string;
}

interface DimensionDef<T> {
  key: string;
  label: string;
  /** Bucket label(s) for a row; null drops the row from this dimension. */
  values: (item: T, student: CounsellorStudent) => string | string[] | null;
  /** Fixed display order (zero-count buckets included). Otherwise count desc. */
  orderedLabels?: string[];
  /** Sort buckets by label (numeric-aware) instead of by count. */
  sortLabels?: boolean;
}

interface SourceDef<T> {
  key: CustomWidgetSource;
  label: string;
  unitSingular: string;
  unitPlural: string;
  rows: (students: CounsellorStudent[]) => { item: T; student: CounsellorStudent }[];
  rowDetail: (item: T, student: CounsellorStudent) => string;
  dimensions: DimensionDef<T>[];
}

const COMPLETION_ORDER = ['100%', '75–99%', '50–74%', '<50%'];

const completionBucket = (pct: number): string => {
  if (pct === 100) return '100%';
  if (pct >= 75) return '75–99%';
  if (pct >= 50) return '50–74%';
  return '<50%';
};

const FLAG_LABELS: Record<CounsellorStudent['flags'][number], string> = {
  profile_incomplete: 'Profile incomplete',
  deadline_urgent: 'Urgent deadline',
  no_matches: 'No matches',
  stalled: 'Stalled'
};

const STUDENT_SOURCE: SourceDef<CounsellorStudent> = {
  key: 'students',
  label: 'Students',
  unitSingular: 'student',
  unitPlural: 'students',
  rows: (students) => students.map((student) => ({ item: student, student })),
  rowDetail: (student) => student.academic.subjects.slice(0, 3).join(', '),
  dimensions: [
    {
      key: 'nationality',
      label: 'Nationality',
      values: (s) => (s.personal.nationality ? `${s.personal.flagEmoji} ${s.personal.nationality}`.trim() : 'Unknown')
    },
    {
      key: 'programmeType',
      label: 'Programme type',
      values: (s) => (s.academic.programmeType === 'IB' ? 'IB' : 'A-Level'),
      orderedLabels: ['IB', 'A-Level']
    },
    {
      key: 'graduationYear',
      label: 'Graduation year',
      values: (s) => (s.academic.graduationYear ? String(s.academic.graduationYear) : 'Unknown'),
      sortLabels: true
    },
    {
      key: 'englishStatus',
      label: 'English test status',
      values: (s) => ({ met: 'Met', booked: 'Test booked', missing: 'Missing' }[s.academic.englishStatus] ?? 'Unknown'),
      orderedLabels: ['Met', 'Test booked', 'Missing']
    },
    {
      key: 'completion',
      label: 'Profile completion',
      values: (s) => completionBucket(s.profile.completionPct),
      orderedLabels: COMPLETION_ORDER
    },
    {
      key: 'schoolCountry',
      label: 'School country',
      values: (s) => s.personal.schoolCountry || 'Unknown'
    },
    {
      key: 'teachingStyle',
      label: 'Teaching style',
      values: (s) => ({ academic: 'Academic', practical: 'Practical', mixed: 'Mixed' }[s.lifestyle.teachingStyle] ?? 'Unknown'),
      orderedLabels: ['Academic', 'Practical', 'Mixed']
    },
    {
      key: 'campusSize',
      label: 'Campus size preference',
      values: (s) => ({ small: 'Small', medium: 'Medium', large: 'Large', no_preference: 'No preference' }[s.lifestyle.campusSize] ?? 'Unknown'),
      orderedLabels: ['Small', 'Medium', 'Large', 'No preference']
    },
    {
      key: 'flags',
      label: 'Risk flags',
      values: (s) => (s.flags.length ? s.flags.map((flag) => FLAG_LABELS[flag] ?? flag) : 'No flags')
    }
  ]
};

const APPLICATION_SOURCE: SourceDef<CounsellorApplication> = {
  key: 'applications',
  label: 'Applications',
  unitSingular: 'application',
  unitPlural: 'applications',
  rows: (students) => students.flatMap((student) => student.applications.map((item) => ({ item, student }))),
  rowDetail: (app) => `${app.university} — ${app.program}`,
  dimensions: [
    {
      key: 'status',
      label: 'Stage',
      values: (a) =>
        ({ planning: 'Planning', in_progress: 'In progress', submitted: 'Submitted', decision: 'Decision received' }[a.status] ?? 'Unknown'),
      orderedLabels: ['Planning', 'In progress', 'Submitted', 'Decision received']
    },
    {
      key: 'platform',
      label: 'Platform',
      values: (a) => a.platform ?? 'No platform'
    },
    {
      key: 'country',
      label: 'Country',
      values: (a) => a.country ?? 'Unknown'
    },
    {
      key: 'university',
      label: 'University',
      values: (a) => a.university.trim() || 'Unknown'
    }
  ]
};

const MATCH_SOURCE: SourceDef<CounsellorMatch> = {
  key: 'matches',
  label: 'Matches',
  unitSingular: 'match',
  unitPlural: 'matches',
  rows: (students) => students.flatMap((student) => student.matches.map((item) => ({ item, student }))),
  rowDetail: (match) => `${match.university} (${match.score}%)`,
  dimensions: [
    {
      key: 'tier',
      label: 'Tier',
      values: (m) => m.tier,
      orderedLabels: ['Reach', 'Match', 'Safe']
    },
    {
      key: 'country',
      label: 'Country',
      values: (m) => m.country || 'Unknown'
    },
    {
      key: 'university',
      label: 'University',
      values: (m) => m.university.trim() || 'Unknown'
    }
  ]
};

const DEADLINE_SOURCE: SourceDef<CounsellorDeadline> = {
  key: 'deadlines',
  label: 'Deadlines',
  unitSingular: 'deadline',
  unitPlural: 'deadlines',
  rows: (students) => students.flatMap((student) => student.deadlines.map((item) => ({ item, student }))),
  rowDetail: (deadline) => `${deadline.university} — ${deadline.program}`,
  dimensions: [
    {
      key: 'type',
      label: 'Deadline type',
      values: (d) =>
        ({ early_decision: 'Early decision', regular: 'Regular', scholarship: 'Scholarship', interview: 'Interview' }[d.type] ?? 'Unknown'),
      orderedLabels: ['Early decision', 'Regular', 'Scholarship', 'Interview']
    },
    {
      key: 'university',
      label: 'University',
      values: (d) => d.university.trim() || 'Unknown'
    }
  ]
};

// Dimension callbacks are contravariant in T, so the per-source defs can't be
// stored as SourceDef<unknown>; `any` at this one seam keeps each SourceDef
// fully typed where it's defined.
const SOURCES: Record<CustomWidgetSource, SourceDef<any>> = {
  students: STUDENT_SOURCE,
  applications: APPLICATION_SOURCE,
  matches: MATCH_SOURCE,
  deadlines: DEADLINE_SOURCE
};

/** Keep bar lists readable: everything past the top 7 folds into "Other". */
const MAX_BUCKETS = 8;

export interface CustomWidgetDimensionMeta {
  key: string;
  label: string;
}

export interface CustomWidgetSourceMeta {
  key: CustomWidgetSource;
  label: string;
  unitSingular: string;
  unitPlural: string;
  dimensions: CustomWidgetDimensionMeta[];
}

export const CUSTOM_WIDGET_SOURCE_META: CustomWidgetSourceMeta[] = (
  ['students', 'applications', 'matches', 'deadlines'] as const
).map((key) => {
  const source = SOURCES[key];
  return {
    key,
    label: source.label,
    unitSingular: source.unitSingular,
    unitPlural: source.unitPlural,
    dimensions: source.dimensions.map((dim) => ({ key: dim.key, label: dim.label }))
  };
});

export function getCustomWidgetSourceMeta(source: CustomWidgetSource): CustomWidgetSourceMeta {
  return CUSTOM_WIDGET_SOURCE_META.find((meta) => meta.key === source) ?? CUSTOM_WIDGET_SOURCE_META[0];
}

export const CUSTOM_WIDGET_VIZ_OPTIONS: { key: CustomWidgetViz; label: string; description: string }[] = [
  { key: 'bars', label: 'Bar list', description: 'Ranked horizontal bars' },
  { key: 'stacked', label: 'Stacked bar', description: 'One proportional bar with cards' },
  { key: 'kpi', label: 'Stat tiles', description: 'Big-number tiles per group' }
];

export function newCustomWidgetId(): CustomWidgetId {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom:${rand}`;
}

export function isValidCustomWidgetDef(value: unknown): value is CustomWidgetDef {
  if (!value || typeof value !== 'object') return false;
  const def = value as Partial<CustomWidgetDef>;
  if (typeof def.id !== 'string' || !def.id.startsWith('custom:')) return false;
  if (typeof def.title !== 'string' || !def.title.trim()) return false;
  const source = def.source ? SOURCES[def.source] : undefined;
  if (!source) return false;
  if (!source.dimensions.some((dim) => dim.key === def.dimension)) return false;
  return def.viz === 'bars' || def.viz === 'stacked' || def.viz === 'kpi';
}

export function suggestCustomWidgetTitle(source: CustomWidgetSource, dimension: string): string {
  const sourceDef = SOURCES[source];
  const dim = sourceDef?.dimensions.find((d) => d.key === dimension);
  if (!sourceDef || !dim) return 'Custom widget';
  return `${sourceDef.label} by ${dim.label.toLowerCase()}`;
}

export function describeCustomWidget(def: CustomWidgetDef): string {
  const sourceDef = SOURCES[def.source];
  const dim = sourceDef?.dimensions.find((d) => d.key === def.dimension);
  if (!sourceDef || !dim) return 'Custom widget';
  return `Custom · ${sourceDef.unitPlural} by ${dim.label.toLowerCase()}`;
}

export function aggregateCustomWidget(
  def: Pick<CustomWidgetDef, 'source' | 'dimension'>,
  students: CounsellorStudent[]
): CustomWidgetResult | null {
  const source = SOURCES[def.source];
  const dim = source?.dimensions.find((d) => d.key === def.dimension);
  if (!source || !dim) return null;

  const grouped = new Map<string, { count: number; perStudent: Map<string, CustomWidgetStudentRef> }>();
  let rowTotal = 0;
  for (const { item, student } of source.rows(students)) {
    const raw = dim.values(item, student);
    if (raw == null) continue;
    const labels = Array.isArray(raw) ? raw : [raw];
    if (!labels.length) continue;
    rowTotal += 1;
    const detail = source.rowDetail(item, student);
    for (const label of labels) {
      let bucket = grouped.get(label);
      if (!bucket) {
        bucket = { count: 0, perStudent: new Map() };
        grouped.set(label, bucket);
      }
      bucket.count += 1;
      let ref = bucket.perStudent.get(student.id);
      if (!ref) {
        ref = { student, details: [] };
        bucket.perStudent.set(student.id, ref);
      }
      if (detail) ref.details.push(detail);
    }
  }

  let buckets: CustomWidgetBucket[] = [...grouped.entries()].map(([label, data]) => ({
    key: label,
    label,
    count: data.count,
    students: [...data.perStudent.values()]
  }));

  if (dim.orderedLabels) {
    const leftover = buckets
      .filter((b) => !dim.orderedLabels!.includes(b.label))
      .sort((a, b) => b.count - a.count);
    buckets = [
      ...dim.orderedLabels.map(
        (label) => buckets.find((b) => b.label === label) ?? { key: label, label, count: 0, students: [] }
      ),
      ...leftover
    ];
  } else if (dim.sortLabels) {
    buckets.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  } else {
    buckets.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  // Folding is positional, so it only makes sense on count-desc lists: for
  // orderedLabels/sortLabels dimensions the tail is defined by the axis (e.g.
  // the most recent graduation years), not by insignificance — never fold it.
  if (!dim.orderedLabels && !dim.sortLabels && buckets.length > MAX_BUCKETS) {
    const head = buckets.slice(0, MAX_BUCKETS - 1);
    const tail = buckets.slice(MAX_BUCKETS - 1);
    const merged = new Map<string, CustomWidgetStudentRef>();
    for (const bucket of tail) {
      for (const ref of bucket.students) {
        const existing = merged.get(ref.student.id);
        if (existing) existing.details.push(...ref.details);
        else merged.set(ref.student.id, { student: ref.student, details: [...ref.details] });
      }
    }
    head.push({
      key: '__other__',
      label: 'Other',
      count: tail.reduce((acc, b) => acc + b.count, 0),
      students: [...merged.values()]
    });
    buckets = head;
  }

  return {
    buckets,
    total: buckets.reduce((acc, b) => acc + b.count, 0),
    rowTotal,
    unitSingular: source.unitSingular,
    unitPlural: source.unitPlural
  };
}
