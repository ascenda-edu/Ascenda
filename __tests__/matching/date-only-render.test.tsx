/** @jest-environment ./jest.environment-tz-west.js */
//
// `rec-letter-workflow` formatted `requestedDate` — a date-only 'YYYY-MM-DD'
// string produced by `relDate()` — with `new Date(iso)`. That parses as UTC
// midnight, so the label rendered one calendar day EARLY for every user west of
// Greenwich. CLAUDE.md documents this exact trap; `parseLocalDate` exists for it.
//
// The whole suite runs in America/Los_Angeles (see jest.environment-tz-west.js)
// because the bug is invisible in UTC — which is what CI runs in.

import { render, screen, cleanup } from '@testing-library/react';
import { RecLetterWorkflow } from '@/components/applications/rec-letter-workflow';
import type { RecLetterRequest } from '@/lib/data/student-demo-data';

// framer-motion's `whileInView` mounts an IntersectionObserver on commit, and
// jsdom has none. A no-op observer is enough — the cards render eagerly.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
  NoopIntersectionObserver;

jest.mock('@/hooks/useSupabase', () => ({
  useSupabase: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })
}));
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: jest.fn() })
}));
jest.mock('@/lib/demo/help-request-client', () => ({
  insertHelpRequest: jest.fn(async () => ({ id: 'help-1' }))
}));

// First of a month is the sharp edge: a UTC-midnight parse rolls it back into
// the previous month, so a wrong answer is unmistakable.
const REQUESTED_DATE = '2026-03-01';

const LETTER: RecLetterRequest = {
  id: 'rec-1',
  teacherName: 'Mrs. Sarah Mitchell',
  teacherEmail: 's.mitchell@example.edu',
  subject: 'Physics',
  relationship: 'Teacher — 2 years',
  status: 'uploaded',
  requestedDate: REQUESTED_DATE,
  universities: ['Imperial College London']
};

const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

describe('RecLetterWorkflow — date-only requestedDate', () => {
  afterEach(cleanup);

  it('runs west of Greenwich, so the assertions below cannot pass vacuously', () => {
    // getTimezoneOffset is POSITIVE for zones behind UTC.
    expect(new Date(2026, 2, 1).getTimezoneOffset()).toBeGreaterThan(0);
    // The counterfactual: this is exactly what the component used to render.
    expect(shortDate(new Date(REQUESTED_DATE))).toBe('28 Feb');
  });

  it('renders the calendar day that is in the string, not the UTC-shifted one', () => {
    render(<RecLetterWorkflow letters={[LETTER]} />);

    expect(screen.getByText('Requested 1 Mar')).toBeTruthy();
    expect(screen.queryByText('Requested 28 Feb')).toBeNull();
  });

  it('agrees with a locally-constructed date for the same calendar day', () => {
    render(<RecLetterWorkflow letters={[LETTER]} />);

    // new Date(y, m, d) is local midnight in every timezone, so this is the
    // timezone-independent statement of "the day in the string".
    const expected = `Requested ${shortDate(new Date(2026, 2, 1))}`;
    expect(screen.getByText(/^Requested /).textContent).toBe(expected);
  });
});
