/**
 * What Ascendi says when a student answers something.
 *
 * ── EVERY LINE IS AUTHORED COPY, AND THAT IS THE DESIGN ──────────────────────
 * Nothing here is computed. That is the direct lesson of `be04bab`: the reverted
 * live preview tried to say something *derived* about the student's answers and
 * ended up telling a straight-7 IB candidate their profile was "Weak", because the
 * band it read was mathematically unreachable before the optional screens. A
 * sentence written by a person, keyed to a choice, cannot be wrong about data —
 * it makes no claim about data.
 *
 * Three rules for anything added here:
 *
 *   1. **True of the subject, not of the student.** "Medicine means an admissions
 *      test and an early deadline" is a fact about applications. "Your grades are
 *      strong" is a judgement, and a form has not earned the right to make it.
 *   2. **Never discouraging.** These fire while someone is halfway through a form
 *      about their future. There is no line here that a 17-year-old could read as
 *      "you are not good enough", and there must never be one.
 *   3. **Name a next action where there is one.** The reaction is worth more if it
 *      tells them what happens because of what they just said.
 *
 * The grade reactions deliberately do NOT grade. They acknowledge that a total
 * exists and say something true about predictions; the highest band mentions
 * selectivity without implying the lower ones are failures.
 */

import type { IntendedCluster, ProgrammeType } from '@/lib/profile/intake-types';

/** Fired once per cluster, when the student picks their main subject area. */
export const CLUSTER_REACTIONS: Record<IntendedCluster, string> = {
  medicine_dentistry:
    "Medicine means an admissions test and an October deadline — a full month before everyone else. I'll put both on your board.",
  law: "Law offers lean hard on the personal statement. When you get to the toolbox, that's where to start.",
  computer_science:
    'Computer science is the most oversubscribed subject in the UK right now, so a couple of safer choices are worth having.',
  engineering:
    "Engineering wants Maths almost everywhere, and usually Physics. Let's see if they're already on your list.",
  maths:
    "Maths courses at the top end often ask for Further Maths or a test like TMUA. I'll flag which ones do.",
  life_sciences_biochem:
    "Chemistry is the gatekeeper for most life sciences courses — I'll check for it on the next step.",
  economics_quant:
    "Quantitative economics almost always needs Maths, so I'll only show you courses you can actually apply to.",
  business_non_quant:
    'Business is taught nearly everywhere, which means you can afford to be picky about the city.',
  humanities:
    'Humanities give you the widest subject freedom of anything on this list. Good place to be.',
  creative:
    "For creative courses your portfolio usually outweighs your grades. Grades still help — they just aren't the whole story."
};

/**
 * `ProgrammeType` has a third member, `ACT`, that the wizard never offers. Covered
 * so the `Record` stays exhaustive rather than silently partial.
 */
export const PROGRAMME_REACTIONS: Record<ProgrammeType, string> = {
  IB: "IB — so I'll read your 45-point scale, not the UCAS tariff. Six subjects next, three at Higher Level.",
  A_LEVEL:
    "A-levels — I'll score you on the UCAS tariff. Three subjects is the usual shape, four if you're taking it.",
  ACT: "Noted — I'll read your grades on that scale."
};

/**
 * Reaction to a COMPLETE IB subject total.
 *
 * Note what the bands do and do not do. The top band names selectivity, which is
 * useful and true. The middle band says the set is workable. The lowest band says
 * nothing about the number at all — it points out that predictions change, which is
 * both true and the only honest thing to say to someone who has just typed a total
 * they may not be happy with. There is no band that reports a verdict.
 */
export const ibTotalReaction = (total: number): { id: string; message: string } => {
  if (total >= 38) {
    return {
      id: 'ib-high',
      message: `A predicted ${total} is in range for the most selective courses on our list.`
    };
  }
  if (total >= 30) {
    return {
      id: 'ib-mid',
      message: "That's a realistic set of predictions to build a shortlist on."
    };
  }
  return {
    id: 'ib-low',
    message: 'Predictions move a lot between now and results. Update these whenever they change.'
  };
};

export const SKIP_BOOSTERS_REACTION =
  "Fine by me — those two only sharpen the ranking, and they'll be waiting on your profile page.";

export const SUGGESTION_APPLIED_REACTION =
  'Filled in three to start you off — swap any of them, and add your grades when you have them.';

/*
 * There is deliberately NO greeting constant here.
 *
 * An on-mount hello is not a reaction to anything, and a DEFERRED one is worse: a
 * student who picks a subject inside the delay gets the reaction they earned
 * overwritten by a generic greeting. Ascendi speaks when the student does something.
 */
