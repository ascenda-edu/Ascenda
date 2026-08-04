'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy wrappers for the two wizard overlays that are NOT on the first-paint path.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `/profile/wizard` is budgeted at 245 kB of First Load JS
 * (`scripts/check-bundle-budget.mjs`), and the redesign landed it at 244 — inside
 * the cap but with one kilobyte of headroom, which is the same as no headroom: the
 * next change to the route would have been the one that had to explain a budget
 * raise. Splitting these two moves them out of First Load and buys real room back.
 *
 * They are the right two to split, and the reason is WHEN they render, not how big
 * they are:
 *
 *   - the milestone celebration appears once, after the essentials validate, and
 *     never at all for a student who leaves early;
 *   - Ascendi's aside appears only in response to an answer.
 *
 * ── THE GUARD AT THE CALL SITE IS PART OF THE FIX ────────────────────────────
 * `next/dynamic` fetches a chunk when the component is first RENDERED, not when it
 * first shows something. Both of these return `null` while idle, so mounting them
 * unconditionally would fetch both chunks on mount and save nothing. `StudentIntakeForm`
 * therefore renders them only once there is something to show — see the `ascendi.message`
 * and `celebrationOpen` guards there. Remove either guard and the split silently
 * stops working while every test still passes.
 *
 * `ssr: false` is safe here because this file is `'use client'`. In a Server
 * Component it is a build error — see `chatbot-widget-lazy.tsx` and
 * `essay-workshop-lazy.tsx`, which exist for the same reason.
 */

export const LazyMilestoneCelebration = dynamic(
  () => import('./milestone-celebration').then((m) => m.MilestoneCelebration),
  { ssr: false }
);

export const LazyAscendiAside = dynamic(
  () => import('./ascendi-aside').then((m) => m.AscendiAside),
  { ssr: false }
);
