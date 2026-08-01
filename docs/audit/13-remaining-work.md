# Remaining work — what was deliberately NOT done, and why

**Date:** 2026-08-01 · **Branch:** `security/phase0-contain` · 7 commits, nothing pushed

Phases 0–4 of `SYNTHESIS.md` §9 are complete except for two items. Both were
started as analysis, both were stopped before implementation, and this file
records the reasoning so the decision can be overturned with full information
rather than re-derived.

---

## 1. StudentIntakeForm decomposition — NOT DONE (prerequisites now met, verification still missing)

**What it is.** `src/app/profile/_components/StudentIntakeForm.tsx`, 2,553 lines:
one ~1,900-line component body, 26 `useState`, 14 `useRef`, 16 `useEffect`, five
hand-rolled validators, all six wizard steps inline. The plan
(`04-react-components.md`) takes it to ~12 files, none over 250 lines, on
`react-hook-form` + `zodResolver` with a `FormProvider`, six stateless step
components binding via `useFormContext()`, `useFieldArray` for the dynamic rows,
and `buildPayload`/`applyPayload` absorbed into a schema module reusable by the
server action.

**What is now in place that was not before:**

- **149 characterization tests** (`__tests__/profile/intake-form/`), written
  against the untouched component. The `buildPayload`/`applyPayload` round trip
  on both the IB and A-Level paths is the load-bearing part: it is step-agnostic,
  so it survives the JSX being cut into six files, and it will catch essentially
  any way that logic can drift when it moves.
- **F-A is fixed** — the Radix bubble-input bug that blanked hydrated `<Select>`
  values. This was a hard blocker: the decomposition would have inherited it, and
  the harness had to route most step-2/3 tests through navigation to work around
  it.

**Why it was still not attempted:**

1. **jsdom cannot vouch for what this component actually does.** The harness
   author said so explicitly: `AnimatePresence` exit timing, `mode="wait"`
   ordering, real focus movement and the `beforeunload` draft flush are all
   unpinnable in jsdom. There is **no Playwright in this repo**. A six-step
   wizard rewrite verified only in jsdom is not verified.
2. **The blast radius is the entire onboarding funnel.** If this breaks, no new
   student can complete a profile — and the failure mode F-A demonstrated
   (fields silently blanked, wizard refusing to advance on data the student had
   already entered) is exactly the kind that passes a smoke test and fails a real
   user.
3. **Every inline comment in the file documents a past regression.** That is a
   direct signal about how much undocumented behaviour is load-bearing.

**Do this before starting:**

1. Add Playwright and a single end-to-end happy path: sign in → six steps → save
   → reload → confirm every field round-trips. This is the missing gate, and it
   is worth having regardless of the decomposition.
2. Fix the four bugs the harness found and pinned but did not fix — they are
   cheap now and confusing later:
   - `focusFirstError` (`:1294`) schedules a 50 ms `setTimeout` nothing cancels
     on unmount, then focuses whatever `[data-field]` it finds in the live DOM.
   - `restoreSavedProfile` (`:1337`) sets "Restored last saved progress." then
     navigates to step 1 — but that status block only exists inside the Review
     step's JSX (`:2493`), so the message is unreachable.
   - `FieldError` renders **inside** the `<label>`, so an errored input's
     accessible name becomes `"First nameFirst name is required."`.
   - Nationality and subject remove buttons have no accessible name (activity
     rows do).
3. Then decompose in the plan's order, running `npm run test:intake` after each
   step. A failure there means "you changed behaviour", not necessarily "you
   broke it" — read the diff before re-baselining.

**Expected signal:** six tests in the `F-A` block assert the *repair*. If an RHF
rewrite changes hydration timing they may go red; that is information, not
failure.

---

## 2. Feature-slice restructure — NOT DONE (deliberately, and arguably should stay that way for now)

**What it is.** `SYNTHESIS.md` §6.1: `app/` shrinks to routing;
`features/<slice>/{api,model,ui,hooks,index.ts}` owns each domain end-to-end;
`shared/` holds what is genuinely cross-cutting; one dependency direction,
enforced by dependency-cruiser.

**Why it was not attempted:**

1. **The problem it solves is already fenced.** The architecture audit measured
   all 1,350 import edges and found `lib→components`, `lib→app` and
   `components→app` are **all zero**. `lint:boundaries` now enforces that on
   every PR, and was verified non-vacuous by probing the inverted direction (548
   violations). The layering is clean *and* guarded. Moving files improves
   discoverability, not correctness.
2. **It would move hundreds of files and bury everything else.** These seven
   commits contain a scoring-model repair, a privilege-escalation fix and a data-
   loss fix. A rename-everything commit on top makes all of that
   unreviewable — and this branch is going into a review pass, not a merge queue.
3. **Two of its highest-value pieces are already delivered**, without the moves:
   `src/lib/auth/` (one identity point, one policy module) and `src/lib/data/`
   (columns, errors, one repo). Those were the parts that removed duplication.
   The rest is directory layout.

**When it becomes worth doing:** when a second engineer joins and the "where does
this go?" cost starts being paid repeatedly, or when a slice needs to be extracted
or deleted wholesale. Pilot it on `counsellor` — the largest slice at 59 files —
and only repeat if the pilot actually pays.

**Prerequisite already met:** the fence is installed at today's shape, so any move
that breaks the direction fails CI immediately.

---

## 3. Still outstanding for the repo owner — not doable from here

| Action | Why it cannot be automated |
|---|---|
| **Rotate `SUPABASE_SERVICE_ROLE_KEY`** | It is in git history, unrotated, byte-identical to the key in use (`823b0a7`, `e1382bf`, both ancestors of `origin/main`). Needs the Supabase dashboard. **Most urgent item in this repo.** |
| **Rotate both demo passwords** | Removed from all 9 files here, but still live in Supabase Auth. |
| **Enable GitHub secret scanning + push protection** | Repo settings. |
| **Apply the migrations, in order** | Production DB writes. `20260801110000_profiles_insert_guard` **first** — everything else depends on `profiles.role`, and until that lands any user can self-promote to admin. Then `20260801120000` (⚠️ BREAKING: ends open-counsellor). Then `20260801122000` (assignment table). |
| **Buy GitHub Team and turn on branch protection** | Requires a paid plan. Require the single `ci-ok` check. |
| **Promote the `database` CI job to required** | It is written and runs, but has never been observed green — there is no Postgres in the authoring environment. Promote it the first time it passes. |

---

## 4. Follow-ups the agents identified, in priority order

1. `lib/chat/context.ts`, `lib/chat/tools/student-read.ts`, `student-write.ts` →
   the shared applications columns. (Two of these three the original audit missed.)
2. The **25 remaining sites that discard `error`** — the four admin role checks
   are the security-relevant ones.
3. `counsellor/data.ts` + `counsellor/decks.ts` → the shared `unwrap`;
   `tierFromMatchRow` → `loadTierByProgram`.
4. Once `.from(` is confined to `src/lib/data/`, add the `no-restricted-syntax`
   rule that makes it structural rather than conventional.
5. `PARENT_PORTAL_OPEN_TO_ALL` cannot be flipped until `'parent'` exists as a
   `profiles.role` value — it is not in the enum, so closing it today would lock
   out everyone including the demo. Gated on migration step 5.
6. ~38 hand-rolled pills and ~34 inline empty states remain. Check each native
   `title=` cluster against the measured **+9 kB per route** Popper cost before
   converting it to a Tooltip.
7. Bounded list reads — `.limit()`/`.range()` in the data-layer functions. Left
   off deliberately so that pass stayed behaviour-preserving.
