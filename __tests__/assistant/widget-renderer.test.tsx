/**
 * Smoke + behaviour tests for the assistant widget registry.
 * jsdom is the default jest env (see jest.config.ts) — no docblock needed.
 *
 * tsconfig has `jsx: "preserve"` (Next.js), and jest.config.ts is owned by the
 * plumbing phase — so this file uses React.createElement (aliased `h`) rather
 * than JSX to stay transformable under the shared ts-jest config.
 */
import { createElement as h } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { WidgetRenderer } from '@/components/assistant/widgets';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ChatWidget } from '@/lib/chat/widgets';

const renderWidget = (widget: ChatWidget, mode: ChatMode) =>
  render(h(WidgetRenderer, { widget, mode }));

const FIXTURES: Record<ChatWidget['kind'], ChatWidget> = {
  programs: {
    kind: 'programs',
    items: [
      { id: 'p1', course: 'BSc Computer Science', university: 'Imperial', country: 'UK', city: 'London', level: 'Undergraduate' },
    ],
  },
  universities: {
    kind: 'universities',
    items: [
      {
        id: 'u1',
        name: 'Imperial College London',
        city: 'London',
        country: 'UK',
        rankOverall: 6,
        rankSource: 'QS',
        acceptanceRatePct: 14,
        tuitionLow: 35000,
        tuitionHigh: 45000,
        currency: 'GBP',
        students: 20000,
        programs: [
          { id: 'prog1', course: 'BSc Computing', level: 'Undergraduate' },
          { id: 'prog2', course: 'MSc AI', level: 'Postgraduate' },
        ],
      },
    ],
  },
  deadlines: {
    kind: 'deadlines',
    items: [
      { label: 'UCAS application', university: 'Imperial', date: '2030-01-15', daysUntil: 20 },
      { label: 'Scholarship essay', studentName: 'Amara', studentFlag: '🇳🇬', date: '2020-01-01', daysUntil: -5 },
    ],
  },
  matches: {
    kind: 'matches',
    items: [
      {
        id: 'm1',
        course: 'BSc Economics',
        university: 'LSE',
        score: 82,
        tier: 'Safe',
        factors: { eligibility: 90, academicFit: 75, preferenceFit: 0, outcomes: 60 },
      },
      {
        id: 'm2',
        course: 'BA History',
        university: 'Oxford',
        score: 40,
        tier: null,
        factors: { eligibility: 30, academicFit: 40, preferenceFit: 0, outcomes: 50 },
      },
    ],
  },
  tasks: {
    kind: 'tasks',
    items: [
      { id: 't1', name: 'Draft personal statement', status: 'todo', dueDate: '2030-02-01', application: 'Imperial', applicationId: 'a1' },
      { id: 't2', name: 'Request reference', status: 'done', dueDate: null, application: 'LSE', applicationId: 'a2' },
    ],
  },
  cohort_stats: {
    kind: 'cohort_stats',
    items: [
      { label: 'Students', value: '42', tone: 'neutral' },
      { label: 'Avg completion', value: '78%', tone: 'positive' },
      { label: 'Flagged', value: '5', tone: 'warning' },
    ],
  },
  at_risk: {
    kind: 'at_risk',
    items: [
      { id: 's1', name: 'Jin Park', flag: '🇰🇷', urgency: 'critical', reason: 'No activity in 3 weeks; two deadlines overdue.' },
    ],
  },
};

describe('WidgetRenderer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders every widget kind without throwing', () => {
    (Object.keys(FIXTURES) as ChatWidget['kind'][]).forEach((kind) => {
      const { unmount } = renderWidget(FIXTURES[kind], 'student');
      unmount();
    });
  });

  it('programs: renders a course-detail link in student mode', () => {
    renderWidget(FIXTURES.programs, 'student');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/course/p1');
  });

  it('programs: renders no link in counsellor mode', () => {
    renderWidget(FIXTURES.programs, 'counsellor');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('university: programme rows link in student mode but not counsellor mode', () => {
    const { unmount } = renderWidget(FIXTURES.universities, 'student');
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/university-search/university/prog1',
      '/university-search/university/prog2',
    ]);
    unmount();

    renderWidget(FIXTURES.universities, 'counsellor');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('at_risk: rows link to the student detail page in counsellor mode', () => {
    renderWidget(FIXTURES.at_risk, 'counsellor');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/counsellor/students/s1');
  });

  it('at_risk: renders no link outside counsellor mode', () => {
    renderWidget(FIXTURES.at_risk, 'student');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('tasks: student-mode toggle fires a PATCH to /api/checklist with status done', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWidget(FIXTURES.tasks, 'student');
    // t1 starts 'todo' → labelled "Mark as done".
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/checklist');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ id: 't1', status: 'done' });
    // Optimistic flip: t1 is now "Mark as not done" too (t2 already was) → two.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Mark as not done' })).toHaveLength(2)
    );
    expect(screen.queryByRole('button', { name: 'Mark as done' })).toBeNull();
  });

  it('tasks: reverts the optimistic flip when the PATCH fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    renderWidget(FIXTURES.tasks, 'student');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    // After the failed request the status reverts, so the label returns to "Mark as done".
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Mark as done' }).length).toBeGreaterThan(0)
    );
  });

  it('tasks: renders no toggle buttons in counsellor mode', () => {
    renderWidget(FIXTURES.tasks, 'counsellor');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('matches: renders the stored tier chip and no chip when tier is null', () => {
    renderWidget(FIXTURES.matches, 'student');
    // Stored tier 'Safe' is shown verbatim (never re-classified from score).
    expect(screen.getByText('Safe')).toBeInTheDocument();
    // The tier-null card (m2) links but shows no Reach/Match/Safe chip of its own.
    const m2 = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/course/m2')!;
    expect(within(m2).queryByText(/Reach|Match|Safe/)).toBeNull();
  });

  it('matches/deadlines/tasks: render no links in counsellor mode', () => {
    for (const kind of ['matches', 'deadlines', 'tasks'] as const) {
      const { unmount } = renderWidget(FIXTURES[kind], 'counsellor');
      expect(screen.queryByRole('link')).toBeNull();
      unmount();
    }
  });

  it('parent mode: every widget kind renders fully static (no links, no buttons)', () => {
    // Parent has no read tools, but a crafted DB row could attach widgets to a
    // parent conversation — they must be inert.
    for (const widget of Object.values(FIXTURES)) {
      const { unmount } = renderWidget(widget, 'parent');
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      unmount();
    }
  });

  it('a widget that throws is contained by the error boundary (no workspace crash)', () => {
    // Simulate a crafted row that slipped past validation: tier is a number,
    // so tierKeyOf would call .toLowerCase() on it and throw.
    const poisoned = {
      kind: 'matches',
      items: [
        {
          id: 'x',
          course: 'CS',
          university: 'U',
          score: 50,
          tier: 5,
          factors: { eligibility: 1, academicFit: 1, preferenceFit: 0, outcomes: 1 },
        },
      ],
    } as unknown as ChatWidget;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderWidget(poisoned, 'student')).not.toThrow();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
