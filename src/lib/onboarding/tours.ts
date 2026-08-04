/**
 * The per-section tour registry — every script Ascendi can walk someone through.
 *
 * WHY THIS TAXONOMY IS NOT `NavItem['segment']`
 * ---------------------------------------------
 * The obvious move is to key tours off the `segment` union in
 * `components/layout/navigation.ts`, and it is wrong. `segment` lumps
 * `/university-search`, `/matches`, `/course/*` and `/shortlist` together under
 * `'explore'` because they share ONE nav pill — which is correct for a nav pill
 * and useless for a tour. Search and matches have no anchors in common; a single
 * `'explore'` tour would drop most of its steps on whichever page you happened
 * to open it from, and `ProductTour`'s missing-anchor skip would hide the bug.
 *
 * So tours have their own ids, resolved by longest-prefix match below. The cost
 * is one more list to keep in step with the routes; the test suite pins it
 * (`__tests__/onboarding/tours.test.ts` asserts every anchor named here exists
 * in the codebase, so renaming a `data-tour` in a component fails CI rather than
 * silently shortening a tour).
 *
 * WRITING A STEP
 * --------------
 * Ascendi is the narrator, so copy is FIRST PERSON and says what the thing is
 * for — not what it is called. "I rank these by what you can realistically get
 * into" beats "This is the matches list". Three to five steps. This orients
 * someone; the getting-started checklist is what walks them through the work.
 *
 * Every `anchor` must match a `data-tour="…"` attribute that some component on
 * that route actually renders.
 */

/**
 * One spotlight step.
 *
 * Defined HERE rather than in `components/onboarding/product-tour.tsx`, even
 * though that is the only component that consumes it. This module is imported by
 * server components (`dashboard/page.tsx` reads it to decide what to mount) and
 * `product-tour.tsx` is `'use client'` — a type-only import across that boundary
 * is erased at compile time and therefore harmless today, but it points the
 * dependency arrow from server code at a client module, which is the direction
 * that eventually drags a `useState` into a server bundle when someone adds a
 * value export next to the type. The arrow now runs the correct way.
 */
export interface TourStep {
  /** Matched against `[data-tour="…"]`. A step whose anchor is absent is skipped. */
  anchor: string;
  title: string;
  body: string;
}

export const TOUR_IDS = [
  'dashboard',
  'search',
  'matches',
  'applications',
  'profile',
  'scholarships',
  'toolbox',
  'inbox',
  'counsellor',
  'parent'
] as const;

export type TourId = (typeof TOUR_IDS)[number];

export interface Tour {
  id: TourId;
  /** Shown on the invitation bubble: "I can show you around <label>". */
  label: string;
  steps: TourStep[];
}

/**
 * The exact routes each tour belongs to.
 *
 * EXACT PATHS, NOT PREFIXES — and this is the one decision in this file most
 * likely to look like an oversight.
 *
 * Prefix matching is the obvious implementation and it quietly destroys tours. A
 * tour's steps are anchored to elements on ONE page. Match `/applications` as a
 * prefix and a visit to `/applications/tasks` resolves to the applications tour,
 * whose anchors are all on the board — so every step is dropped, the tour closes
 * instantly, and `ascendi-coach.tsx` records it as settled. The user has now
 * permanently lost a tour they never saw, and nothing anywhere reports an error.
 * The same trap covers `/university-search/quests` versus `/university-search/search`
 * and `/counsellor/inbox` versus `/counsellor`.
 *
 * Exact matching makes the failure impossible: a route with no entry has no tour,
 * so the coach stays silent. The cost is that a new sub-route needs a line here —
 * which is the right amount of friction, because a new sub-route needs its own
 * anchors before it can have a tour at all.
 *
 * This also means a section layout can safely mount `<AscendiCoachMount />` once
 * and have it be inert on every route in that section that has no tour, which is
 * how `/university-search` and `/toolbox` are wired.
 */
const TOUR_ROUTES: Record<TourId, readonly string[]> = {
  dashboard: ['/dashboard'],
  // NOT `/university-search/results` — that route is a server-side `redirect()` to
  // this one and never renders in a browser, so a coach could not mount there anyway.
  search: ['/university-search/search'],
  matches: ['/matches'],
  applications: ['/applications'],
  profile: ['/profile'],
  scholarships: ['/scholarships'],
  toolbox: ['/toolbox'],
  inbox: ['/inbox'],
  counsellor: ['/counsellor'],
  parent: ['/parent']
};

export const TOURS: Record<TourId, Tour> = {
  dashboard: {
    id: 'dashboard',
    label: 'your home page',
    steps: [
      {
        anchor: 'getting-started',
        title: 'Start here',
        body: 'I keep the single most useful next thing in this card, and I retire it once you have worked through the list.'
      },
      {
        anchor: 'next-up',
        title: 'What actually needs you',
        body: 'Deadlines, unfinished tasks and unanswered questions from everything you are tracking. I order these by urgency, not by when you added them.'
      },
      {
        anchor: 'profile-progress',
        title: 'Why I keep asking about your profile',
        body: 'Every section you fill in changes how I score programmes against you. The last two steps are optional, but they do move things.'
      },
      {
        anchor: 'matches-peek',
        title: 'Your ranked matches',
        body: 'I score the whole catalogue against you and group the results by how realistic they are. Open one and I will show you exactly why it ranked there.'
      },
      {
        anchor: 'counsellor-card',
        title: 'Help that arrives with context',
        body: 'Ask from any page and your counsellor sees where you were and what you were looking at. You never have to re-explain yourself.'
      }
    ]
  },

  search: {
    id: 'search',
    label: 'programme search',
    steps: [
      {
        anchor: 'search-bar',
        title: 'Ask in plain English',
        body: 'Describe what you want — "affordable engineering in the Netherlands" works. I read it as intent, not keywords.'
      },
      {
        anchor: 'search-filters',
        title: 'Narrow it down',
        body: 'Country, tuition, subject and entry requirements. I remember these while you browse, so you are not rebuilding a search every time.'
      },
      {
        anchor: 'search-results',
        title: 'Every result is scored against you',
        body: 'These are not catalogue order. Each card carries how well it fits your grades and budget, so you can tell a reach from a safe bet at a glance.'
      }
    ]
  },

  matches: {
    id: 'matches',
    label: 'your matches',
    steps: [
      {
        anchor: 'match-list',
        title: 'Ranked, not filtered',
        body: 'I scored every programme in the catalogue against your grades, subjects and budget, then sorted what came back.'
      },
      {
        anchor: 'match-tiers',
        title: 'Reach, target, safe',
        body: 'A healthy list has some of each. If everything here is a reach, that usually means your profile is missing something rather than that your options are.'
      }
    ]
  },

  applications: {
    id: 'applications',
    label: 'your application board',
    steps: [
      {
        anchor: 'application-next-actions',
        title: 'The short list',
        body: 'What is due soonest across every application you are tracking. If you only look at one thing on this page, look here.'
      },
      {
        anchor: 'application-list',
        title: 'One row per application',
        body: 'Move a programme onto this board and its deadlines, tasks and documents start tracking themselves.'
      }
    ]
  },

  profile: {
    id: 'profile',
    label: 'your profile',
    steps: [
      {
        anchor: 'profile-progress-card',
        title: 'What is left',
        body: 'The first three sections are what I need before I can rank anything. The last two sharpen the ranking rather than unlock it.'
      },
      {
        anchor: 'profile-sections',
        title: 'Edit any section, any time',
        body: 'Nothing here is one-shot. Change a predicted grade and I re-score your matches against it.'
      }
    ]
  },

  scholarships: {
    id: 'scholarships',
    label: 'scholarships',
    steps: [
      {
        anchor: 'scholarship-explorer',
        title: 'Filtered to what you could win',
        body: 'Funding you are plausibly eligible for, based on your nationality, subjects and grades — not every award that exists.'
      }
    ]
  },

  toolbox: {
    id: 'toolbox',
    label: 'the toolbox',
    steps: [
      {
        anchor: 'toolbox-tools',
        title: 'The practical bits',
        body: 'Essay drafting, entry-requirement checks and a deadline timeline. Use these when you have a specific job to do.'
      }
    ]
  },

  inbox: {
    id: 'inbox',
    label: 'your inbox',
    steps: [
      {
        anchor: 'inbox-list',
        title: 'Your threads with your counsellor',
        body: 'Every question you have asked, with the page you asked it from attached. Replies land here.'
      }
    ]
  },

  counsellor: {
    id: 'counsellor',
    label: 'your counsellor dashboard',
    steps: [
      {
        anchor: 'counsellor-widgets',
        title: 'Your cohort, by what needs you',
        body: 'Stalled applications, missed deadlines and unanswered questions first. You can reorder and hide these panels.'
      },
      {
        anchor: 'counsellor-help-requests',
        title: 'Questions with context',
        body: 'Each request arrives attached to the student, the programme and the stage they are stuck on.'
      }
    ]
  },

  parent: {
    id: 'parent',
    label: 'the parent portal',
    steps: [
      {
        anchor: 'parent-progress',
        title: 'Where things stand',
        body: 'Your child’s applications and deadlines, without the parts they would rather keep to themselves.'
      },
      {
        anchor: 'parent-messages',
        title: 'A direct line',
        body: 'Message the counsellor guiding the applications, in the same place you check progress.'
      }
    ]
  }
};

/**
 * Which tour belongs to a pathname, or `null` when none does.
 *
 * `null` is the common case, not an error — `/assistant`, `/admin`, `/welcome`,
 * `/role-select`, `/appointment`, every sub-route of a section whose tour lives on
 * the section root, and every dynamic route. Callers must all handle it: the
 * invitation stays silent, and the development chip says there is nothing to run.
 *
 * A trailing slash is normalised away, because Next will happily serve
 * `/dashboard/` and a user who types it should not silently lose the tour.
 */
export const resolveTourForPath = (pathname: string): TourId | null => {
  const normalised = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  for (const id of TOUR_IDS) {
    if (TOUR_ROUTES[id].includes(normalised)) return id;
  }

  return null;
};

/** Every route with a tour. Exported for the registry test, which walks them all. */
export const tourRoutes = (): ReadonlyArray<{ id: TourId; route: string }> =>
  TOUR_IDS.flatMap((id) => TOUR_ROUTES[id].map((route) => ({ id, route })));

export const isTourId = (value: unknown): value is TourId =>
  typeof value === 'string' && (TOUR_IDS as readonly string[]).includes(value);
