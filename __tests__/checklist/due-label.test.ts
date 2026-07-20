import { dueLabel } from '@/lib/applications/due-label';

// Fixed "today" = local noon on 2026-07-18 (constructed from local components
// so startOfToday() lands on 2026-07-18 regardless of the runner's timezone).
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 6, 18, 12, 0, 0));
});

afterAll(() => {
  jest.useRealTimers();
});

describe('dueLabel', () => {
  it('returns null for null/undefined', () => {
    expect(dueLabel(null)).toBeNull();
    expect(dueLabel(undefined)).toBeNull();
  });

  it('marks overdue dates urgent with a day count', () => {
    expect(dueLabel('2026-07-15')).toEqual({ label: '3d overdue', urgent: true });
  });

  it('labels today as Today (urgent)', () => {
    expect(dueLabel('2026-07-18')).toEqual({ label: 'Today', urgent: true });
  });

  it('labels tomorrow (not urgent)', () => {
    expect(dueLabel('2026-07-19')).toEqual({ label: 'Tomorrow', urgent: false });
  });

  it('labels near dates as "In N days"', () => {
    expect(dueLabel('2026-07-23')).toEqual({ label: 'In 5 days', urgent: false });
    expect(dueLabel('2026-08-01')).toEqual({ label: 'In 14 days', urgent: false });
  });

  it('formats dates beyond two weeks without the year when it matches this year', () => {
    const badge = dueLabel('2026-08-05');
    expect(badge?.urgent).toBe(false);
    expect(badge?.label).toBe('5 Aug');
    expect(badge?.label).not.toContain('2026');
  });

  it('includes the year for a date in a different year', () => {
    const badge = dueLabel('2027-02-01');
    expect(badge?.label).toContain('2027');
  });
});
