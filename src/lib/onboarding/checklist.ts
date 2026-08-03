/**
 * The getting-started checklist — onboarding after the form.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Finishing the intake wizard is not the same as knowing how to use the app.
 * Ascenda has thirteen student-facing routes and nothing previously pointed a
 * new student at any of them: they submitted the form, landed on a dashboard
 * full of empty cards, and were left to guess. This is the bridge — a short,
 * ordered list of the things that actually turn an empty account into a useful
 * one, each linking to the page that does it.
 *
 * EVERY ITEM IS DERIVED, NEVER STORED
 * -----------------------------------
 * There is no "checklist item 3 = done" row anywhere. Each item is computed
 * from the state it describes — a shortlisted programme, an application row, a
 * help thread. That is deliberate and it is the difference between a checklist
 * that stays true and one that rots:
 *
 *   - A student who did the thing BEFORE the checklist existed sees it already
 *     ticked, rather than being asked to redo work.
 *   - A student who deletes their only application sees the item un-tick, which
 *     is honest; a stored flag would claim they still had one.
 *   - Nothing can drift, because there is no second copy of the truth.
 *
 * The one piece of stored state is `checklist_dismissed_at` — whether to show
 * the card at all. That is a UI preference, not a fact about their account.
 *
 * ORDERING IS THE PRODUCT DECISION
 * --------------------------------
 * The list runs in dependency order, not importance order: matches are useless
 * before the profile exists, an application is premature before a shortlist.
 * The card surfaces the first incomplete item as the primary call to action, so
 * this array IS the recommended path through the app. Reordering it changes
 * what every new student is told to do next.
 */

export interface ChecklistSignals {
  /** Steps 1-3 done — the bar `runMatching` needs. */
  essentialsComplete: boolean;
  /** All five steps, boosters included. */
  profileComplete: boolean;
  /** At least one row in `student_matches` — the ranking has actually run. */
  hasMatches: boolean;
  /**
   * At least one shortlisted programme, or `null` when the answer is unknowable.
   *
   * `shortlisted_programs` is declared in schema.sql but **may not exist on the
   * remote database** — the shortlist store feature-detects it and falls back to
   * localStorage (see components/university-search/shortlist-store.ts). On such
   * a deployment the server genuinely cannot tell whether a student has
   * shortlisted anything.
   *
   * `null` therefore means "do not ask", and `buildChecklist` omits the item
   * entirely. The alternative — defaulting to `false` — would pin an item that
   * can never tick to every student's checklist forever, and a checklist with a
   * permanently unreachable row teaches people to ignore the whole card.
   */
  hasShortlist: boolean | null;
  /** At least one row in `applications`. */
  hasApplication: boolean;
  /** At least one checklist task across their applications. */
  hasTask: boolean;
  /** At least one help request raised with a counsellor. */
  hasAskedForHelp: boolean;
}

export interface ChecklistItem {
  id: string;
  title: string;
  /** Why it is worth doing — one line, concrete, no marketing. */
  body: string;
  href: string;
  cta: string;
  done: boolean;
  /**
   * `true` when the item is worth doing but nothing breaks without it. Rendered
   * quieter, and never chosen as the primary call to action while a required
   * item is still outstanding.
   */
  optional: boolean;
}

export const buildChecklist = (signals: ChecklistSignals): ChecklistItem[] =>
  ([
  {
    id: 'profile-essentials',
    title: 'Finish the essentials',
    body: 'Your grades and subjects are what the ranking runs on. Nothing can be matched without them.',
    href: '/profile/wizard',
    cta: 'Complete setup',
    done: signals.essentialsComplete,
    optional: false
  },
  {
    id: 'review-matches',
    title: 'See your ranked matches',
    body: 'We score every programme in the catalogue against your profile and sort by what you can realistically get into.',
    href: '/matches',
    cta: 'View matches',
    done: signals.hasMatches,
    optional: false
  },
  signals.hasShortlist === null
    ? null
    : {
        id: 'build-shortlist',
        title: 'Shortlist three programmes',
        body: 'Save the ones worth a second look. Your shortlist is what deadlines and tasks get built from.',
        href: '/university-search/search',
        cta: 'Explore programmes',
        done: signals.hasShortlist,
        optional: false
      },
  {
    id: 'track-application',
    title: 'Track your first application',
    body: 'Move a programme onto the board and its deadlines, tasks and documents start tracking themselves.',
    href: '/applications',
    cta: 'Open the board',
    done: signals.hasApplication,
    optional: false
  },
  {
    id: 'plan-tasks',
    title: 'Plan what happens next',
    body: 'Break an application into the essays, references and forms it actually needs, with dates attached.',
    href: '/applications/tasks',
    cta: 'Add tasks',
    done: signals.hasTask,
    optional: true
  },
  {
    id: 'sharpen-ranking',
    title: 'Sharpen your ranking',
    body: 'Activities and study preferences move programmes up and down your list. Two short steps.',
    href: '/profile/wizard?step=activities_ambitions',
    cta: 'Add the extras',
    done: signals.profileComplete,
    optional: true
  },
  {
    id: 'ask-counsellor',
    title: 'Ask your counsellor something',
    body: 'Questions carry the page you asked from, so you never have to re-explain where you are stuck.',
    href: '/inbox',
    cta: 'Start a thread',
    done: signals.hasAskedForHelp,
    optional: true
  }
  ] as Array<ChecklistItem | null>).filter((item): item is ChecklistItem => item !== null);

export interface ChecklistSummary {
  items: ChecklistItem[];
  completed: number;
  total: number;
  percent: number;
  /**
   * The first outstanding REQUIRED item, falling back to the first outstanding
   * optional one. `null` once everything is done — which is the signal the card
   * uses to congratulate and retire itself.
   */
  next: ChecklistItem | null;
  allRequiredDone: boolean;
}

export const summariseChecklist = (signals: ChecklistSignals): ChecklistSummary => {
  const items = buildChecklist(signals);
  const completed = items.filter((item) => item.done).length;
  const outstanding = items.filter((item) => !item.done);

  return {
    items,
    completed,
    total: items.length,
    // Rounded, but never rounded UP to 100 while something is outstanding —
    // 6 of 7 done is 86%, and a card reading "100%" above an unticked row is
    // the kind of small dishonesty that makes people stop trusting the number.
    percent: outstanding.length === 0 ? 100 : Math.min(99, Math.round((completed / items.length) * 100)),
    next: outstanding.find((item) => !item.optional) ?? outstanding[0] ?? null,
    allRequiredDone: items.every((item) => item.optional || item.done)
  };
};
