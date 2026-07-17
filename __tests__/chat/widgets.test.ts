import {
  isChatWidget,
  mergeWidgets,
  wrapLegacyToolResults,
  WIDGET_ITEM_CAPS,
  type ChatWidget,
} from '@/lib/chat/widgets';
import type { ProgramHit } from '@/lib/chat/tools';

const program = (id: string): ProgramHit => ({
  id,
  course: `Course ${id}`,
  university: 'Uni',
  country: 'UK',
  city: null,
  level: null,
});

describe('isChatWidget', () => {
  it('accepts every kind with a valid first item', () => {
    const widgets: ChatWidget[] = [
      { kind: 'programs', items: [program('p1')] },
      { kind: 'universities', items: [{ id: 'u1', name: 'Oxford', city: null, country: 'UK', programs: [] }] },
      { kind: 'deadlines', items: [{ label: 'UCAS', date: '2026-10-15', daysUntil: 90 }] },
      {
        kind: 'matches',
        items: [
          {
            id: 'p1',
            course: 'CS',
            university: 'Oxford',
            score: 82,
            tier: 'Match',
            factors: { eligibility: 100, academicFit: 80, preferenceFit: 0, outcomes: 70 },
          },
        ],
      },
      { kind: 'tasks', items: [{ id: 't1', name: 'Draft essay', status: 'todo', application: 'CS', applicationId: 'a1' }] },
      { kind: 'cohort_stats', items: [{ label: 'Students', value: '24' }] },
      { kind: 'at_risk', items: [{ id: 's1', name: 'Ada', urgency: 'high', reason: 'Overdue tasks' }] },
    ];
    for (const w of widgets) expect(isChatWidget(w)).toBe(true);
  });

  it('accepts an empty items array', () => {
    expect(isChatWidget({ kind: 'programs', items: [] })).toBe(true);
  });

  it('rejects junk', () => {
    expect(isChatWidget(null)).toBe(false);
    expect(isChatWidget({ kind: 'nonsense', items: [] })).toBe(false);
    expect(isChatWidget({ kind: 'programs', items: 'nope' })).toBe(false);
    expect(isChatWidget({ kind: 'programs', items: [{ notAProgram: true }] })).toBe(false);
    expect(isChatWidget({ kind: 'deadlines', items: [{ label: 'x' }] })).toBe(false); // missing date/daysUntil
  });
});

describe('wrapLegacyToolResults', () => {
  it('wraps bare ProgramHit rows as a programs group', () => {
    const rows = [program('p1'), program('p2')] as unknown as Record<string, unknown>[];
    expect(wrapLegacyToolResults(rows)).toEqual([
      { kind: 'programs', items: [program('p1'), program('p2')] },
    ]);
  });

  it('passes through already-tagged groups, filtering invalid ones', () => {
    const rows = [
      { kind: 'programs', items: [program('p1')] },
      { kind: 'bogus', items: [] },
    ] as unknown as Record<string, unknown>[];
    expect(wrapLegacyToolResults(rows)).toEqual([{ kind: 'programs', items: [program('p1')] }]);
  });

  it('filters junk legacy rows and returns [] when nothing survives', () => {
    expect(wrapLegacyToolResults([{ foo: 'bar' }])).toEqual([]);
    expect(wrapLegacyToolResults([])).toEqual([]);
  });
});

describe('mergeWidgets', () => {
  it('appends new kinds preserving first-appearance order', () => {
    const merged = mergeWidgets(
      [{ kind: 'programs', items: [program('p1')] }],
      [{ kind: 'deadlines', items: [{ label: 'UCAS', date: '2026-10-15', daysUntil: 90 }] }]
    );
    expect(merged.map((w) => w.kind)).toEqual(['programs', 'deadlines']);
  });

  it('merges same-kind groups and dedupes by id', () => {
    const merged = mergeWidgets(
      [{ kind: 'programs', items: [program('p1')] }],
      [{ kind: 'programs', items: [program('p1'), program('p2')] }]
    );
    expect(merged).toEqual([{ kind: 'programs', items: [program('p1'), program('p2')] }]);
  });

  it('dedupes deadlines by label+date+student', () => {
    const d = { label: 'UCAS', date: '2026-10-15', daysUntil: 90 };
    const merged = mergeWidgets(
      [{ kind: 'deadlines', items: [d] }],
      [
        {
          kind: 'deadlines',
          items: [d, { ...d, studentName: 'Ada' }],
        },
      ]
    );
    expect(merged[0].items).toHaveLength(2);
  });

  it('enforces per-kind caps', () => {
    const many = Array.from({ length: 20 }, (_, i) => program(`p${i}`));
    const merged = mergeWidgets([], [{ kind: 'programs', items: many }]);
    expect(merged[0].items).toHaveLength(WIDGET_ITEM_CAPS.programs);

    const more = mergeWidgets(merged, [
      { kind: 'programs', items: [program('p99')] },
    ]);
    expect(more[0].items).toHaveLength(WIDGET_ITEM_CAPS.programs); // full — no growth
  });

  it('does not mutate its inputs', () => {
    const existing: ChatWidget[] = [{ kind: 'programs', items: [program('p1')] }];
    mergeWidgets(existing, [{ kind: 'programs', items: [program('p2')] }]);
    expect(existing[0].items).toHaveLength(1);
  });
});
