'use client';

import { ProductTour, type TourStep } from './product-tour';

/**
 * The dashboard tour's script.
 *
 * Every `anchor` must match a `data-tour` attribute rendered by
 * `src/app/dashboard/page.tsx`. `ProductTour` drops any step whose anchor is
 * missing or has a zero-size box, so a card that does not render for this
 * student (no counsellor assigned, no applications yet) silently shortens the
 * tour rather than spotlighting empty space. That is why these are attributes
 * on the real cards and not a separate list of selectors — the tour cannot
 * point at something that is not there.
 *
 * Five steps, not fifteen. This orients; the getting-started checklist is what
 * actually walks someone through the work.
 */
const DASHBOARD_TOUR: TourStep[] = [
  {
    anchor: 'getting-started',
    title: 'Your next step lives here',
    body: 'This card always shows the one thing worth doing next, and disappears once you have worked through it.'
  },
  {
    anchor: 'next-up',
    title: 'What needs you today',
    body: 'Deadlines, unfinished tasks and unanswered questions across everything you are tracking — ordered by urgency, not by date added.'
  },
  {
    anchor: 'profile-progress',
    title: 'Better profile, sharper ranking',
    body: 'Each section you fill in changes how programmes are scored against you. The last two steps are optional but they move things.'
  },
  {
    anchor: 'matches-peek',
    title: 'Your ranked matches',
    body: 'Scored against the whole catalogue and grouped by how realistic they are. Open one to see exactly why it ranked where it did.'
  },
  {
    anchor: 'counsellor-card',
    title: 'Help, with context attached',
    body: 'Ask from any page and your counsellor sees where you were and what you were looking at. No re-explaining.'
  }
];

export function DashboardTour({ autoStart }: { autoStart: boolean }) {
  return <ProductTour steps={DASHBOARD_TOUR} autoStart={autoStart} />;
}
