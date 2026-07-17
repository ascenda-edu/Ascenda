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

  it('validates EVERY item — junk at index ≥1 rejects the group', () => {
    expect(
      isChatWidget({ kind: 'programs', items: [program('p1'), { junk: true }] })
    ).toBe(false);
  });

  it('rejects renderer-crashing field values (crafted rows)', () => {
    const base = {
      id: 'p1',
      course: 'CS',
      university: 'Oxford',
      score: 80,
      factors: { eligibility: 1, academicFit: 1, preferenceFit: 0, outcomes: 1 },
    };
    // tier must be Reach/Match/Safe or null — a truthy non-string would throw
    // in tier.toLowerCase().
    expect(isChatWidget({ kind: 'matches', items: [{ ...base, tier: 5 }] })).toBe(false);
    expect(isChatWidget({ kind: 'matches', items: [{ ...base, tier: null }] })).toBe(true);
    // factors must carry all four numbers.
    expect(
      isChatWidget({ kind: 'matches', items: [{ ...base, tier: 'Match', factors: {} }] })
    ).toBe(false);
    // urgency indexes a visual map.
    expect(
      isChatWidget({ kind: 'at_risk', items: [{ id: 's1', name: 'A', urgency: 'nope', reason: 'r' }] })
    ).toBe(false);
    // task status is an enum.
    expect(
      isChatWidget({
        kind: 'tasks',
        items: [{ id: 't1', name: 'x', status: 'weird', application: 'CS', applicationId: 'a1' }],
      })
    ).toBe(false);
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

  it('collapses crafted duplicate same-kind groups on restore (kind stays a unique key)', () => {
    const rows = [
      { kind: 'programs', items: [program('p1')] },
      { kind: 'programs', items: [program('p1'), program('p2')] },
    ] as unknown as Record<string, unknown>[];
    expect(wrapLegacyToolResults(rows)).toEqual([
      { kind: 'programs', items: [program('p1'), program('p2')] },
    ]);
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

  it('keeps same-date deadlines at different universities (UCAS 15 Oct case)', () => {
    const ucas = { label: 'UCAS deadline', date: '2026-10-15', daysUntil: 90 };
    const merged = mergeWidgets(
      [{ kind: 'deadlines', items: [{ ...ucas, university: 'Oxford' }] }],
      [{ kind: 'deadlines', items: [{ ...ucas, university: 'Cambridge' }] }]
    );
    expect(merged[0].items).toHaveLength(2);
  });

  it('keeps multiple at-risk alerts for the same student (identity is id+reason)', () => {
    const base = { id: 's1', name: 'Ada', urgency: 'high' as const };
    const merged = mergeWidgets(
      [{ kind: 'at_risk', items: [{ ...base, reason: 'Profile 45% complete' }] }],
      [
        {
          kind: 'at_risk',
          items: [
            { ...base, reason: 'Profile 45% complete' }, // duplicate — dropped
            { ...base, reason: 'No activity for 20 days' }, // second alert — kept
          ],
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
