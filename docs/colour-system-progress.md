# Colour system — live progress log

Working doc for the Signal (Option C) colour rollout. **Update this as work lands** so a
context compaction or a new session can pick up without re-deriving anything.

Branch: `chore/tone-desaturation` (off `main`). Plan: `~/.claude/plans/rippling-questing-starlight.md`.
Artifacts: placement `https://claude.ai/code/artifact/e677a474-96dd-4e43-942e-4c0b9d664dff` ·
palette directions `https://claude.ai/code/artifact/0660ff1c-0536-4ad7-8af1-b30d087db012`

---

## Decisions taken (do not re-litigate)

- **Signal (Option C)** chosen: neutral surfaces + a `border-l-4` state edge + a small tinted
  action strip on the one card that wants work.
- **Done goes silent.** Completion gets a muted check and the word, no tone, no fill.
- **Category colour deleted.** Colour marks a state, never a category, a type, or a section.
- **Three tones only** — `danger`, `warning`, `success`. `info` and `feature` deleted outright.
- **Red and gold may not co-occur** (ΔE 6 under deuteranopia). Gold takes "act" states; red keeps
  error feedback *and* destructive actions. `ui/toast.tsx` documents that split — do not "fix" it.
- **Selection is not status** — it may tint a surface (transient, one at a time).
- **`success` is for terminal positive outcomes** ("Offer received"), never for "done".
- Placement ships **before** the palette. Source Serif 4 is **out** (Outfit stays). Counsellor
  differentiates by density + label, not hue. The 236 landing literals are a later PR.
- **Solid brand fills that carry text use `--primary-ink`, not `--primary`.** `bg-primary` +
  `text-primary-foreground` is 3.94:1 in dark; ink is 7.00:1 light / 6.73:1 dark.
- Alpha ladder (PR 3, not yet started): contrasting tokens `/10 /30 /60` + solid;
  surface-adjacent tokens (`muted`, `border`, `card`) take **no alpha** — used solid.

## Commits so far

| commit | what |
|---|---|
| `51b3bed` | PR 0 — desaturate the five tones, nominal registries monochrome. Was uncommitted work sitting on `main`; landed first so there is a baseline. |
| `4d54604` | PR 1 — Signal placement. 93 files, +688/−581. |

## Verified state at `4d54604`

typecheck 0 · lint exactly 2/2 warnings (zero headroom, pre-existing) · 2036 tests / 89 suites pass ·
tone-solver **92/92** (was 128 with five tones) · production build green · all routes within bundle
budget · `lint:tokens` ratchet **fell**: `dark-variant` 109→108, `template-classname` 25→20, baseline
tightened and committed.

## Measured outcome (real screenshots, not a model)

`scratchpad/measure.py` counts pixels with OKLab chroma > 0.045 straight from the PNGs.
Before-set preserved at `~/Desktop/ascenda-before-signal`, after-set at `~/Desktop/ascenda-current-state`.

| screen | light before → after | dark before → after |
|---|---|---|
| **profile** | **11.08% → 1.14%** (−90%) | 1.61% → 1.11% |
| applications | 9.27% → 1.30% (−86%) | 9.38% → 1.40% |
| scholarships | 6.71% → 0.86% (−87%) | 6.82% → 1.40% |
| counsellor-analytics | 10.90% → 4.54% | 13.21% → 4.18% |
| counsellor | 3.14% → 0.94% | 3.44% → 1.14% |
| landing (deferred, PR 4) | 8.36% → 8.23% | 2.65% → 2.56% |
| **all 20 screens, mean** | **3.38% → 1.53% (−55%)** | **2.96% → 1.47% (−50%)** |

**Correction to the earlier claim.** The artifact modelled "36.5% → 2.95%" from a hand-built layout
spec. Measured reality on `/profile` is **11.08% → 1.14%**. The *ratio* matches almost exactly (−90%
modelled, −90% measured) but the absolute levels were ~3× overstated, because the model assumed a
viewport-sized screen while the real capture is full-page and includes a large empty region below the
fold. **The measured numbers are the true ones** — correct the artifact, not the screen.

Also note a metric trap: a first pass used a chroma threshold of 0.030 and reported dark mode as ~40%
chromatic and barely changed. That was measuring the **dark theme's own deliberately brand-tinted
canvas** (dark neutrals sit at chroma 0.017–0.028). Threshold 0.045 excludes every neutral in both
themes and catches every real tint (light `-subtle` 0.050, dark `-subtle` 0.070).

## PR 1 — what landed

- Tone tints off card surfaces (33 sites). Kept where a tint is genuinely right: toasts,
  `ui/error-state.tsx`, chat inline confirmations, and the terminal "you're done" panels
  (`profile/page.tsx:419`, `appointment/page.tsx:153`, `StudentIntakeForm.tsx:2821`).
- New component classes in `globals.css`: `.surface-card--action` (the `border-l-4` state edge) and
  `.surface-action-strip` (small tinted footer band). **Padding-agnostic** — an earlier version used
  `-mx-6 -mb-6`, which assumed `.surface-card`'s `p-6` and overhung the `p-5` / `px-4 py-4` cards that
  need it most.
- Done goes silent; category colour deleted (27 icon bubbles, 19 decorative rails removed, 3 urgency
  rails kept: `next-up-card`, `deadline-timeline`, `task-list`).
- `TONE.primary.swatch` and `TONE.neutral.swatch` untinted — those are exactly the tones the nominal
  registries resolve to. Ordinal tones keep their tinted swatch.
- `info`/`feature` removed from `CategoryTone`, the TONE table, `Badge` variants, `globals.css`,
  `tailwind.config.ts` and `tone-solver.mjs`'s `TOKENS`.
- 6 registry entries retoned (4 planned + 2 found): `PRIORITY_VISUAL.watch`,
  `APPLICATION_STATUS_VISUAL.planning` + `.decision`, `COMPLETION_VISUAL.high`, and — beyond plan —
  `DEADLINE_VISUAL.later` (was `emerald`, but a far-off deadline is not *done*) and
  `DEADLINE_VISUAL.this-month`.
- `--shadow` exposed as a Tailwind colour so the dialog scrim is `bg-shadow/60`, not `bg-black/50`.
- Coloured shadows removed everywhere (`shadow-primary/NN`, plus `shadow-destructive/15`,
  `shadow-secondary/15`). `off-ladder-shadow` ratchet unaffected — that rule counts geometry.
- `.text-gradient` moved off `--accent`; `select.tsx` + `button.tsx` `bg-accent/15` → brand.
- `deadline-monitor.tsx` `TYPE_COLORS` neutralised — scholarship/interview had been borrowing
  warning/success, so a scholarship six months out looked due Friday.
- Deck rarity: **one** AA-verified treatment, stars carry the ordinal. Four alpha rungs of gold were
  tried and rejected — the `/60` rung measured 3.78:1, and rank was already in the star count.

## OPEN — next actions

1. **Top navbar pill is still a solid brand fill.** `src/components/layout/nav-link.tsx:71` —
   `absolute inset-0 rounded-full bg-primary shadow-e-1`, a **third** nav implementation alongside
   `section-nav.tsx` and `ui/tabs.tsx`, both already converted to a 2px rule. Retarget its `layoutId`
   the same way. Note the ids are **module constants** (`TOP_NAV_INDICATOR`), deliberately, and
   desktop/mobile have separate ids — read the comment at `nav-link.tsx:15-32` before touching.
2. **The completion card still shouts green at 100%.** `profile-progress-card.tsx:55` has
   `border-l-4` fed by `COMPLETION_VISUAL[band]`, plus a green progress bar, a green `PROGRESS` chip
   and a green check — four chromatic marks on one card, against a cap of one. The progress *fill* is
   legitimate (a data mark, level 5); the rail, chip and check are not. Decide: at `full` the band
   should go neutral, since "done goes silent" applies to the card as much as to its chips.
3. `dashboard-skeletons.tsx:15` has an untokenised `via-white/5` shimmer. No ratchet rule catches it
   and `via-card/5` would be invisible in light mode. Needs a real decision.
4. `TONE.*.border` is still a full-border tint reachable by ordinal registries — flagged by an agent
   as still encoding category on toolbox/match/scholarship cards. Worth a look.
5. **PR 2** — Oxford palette values + APCA dark lifts. Values solved in
   `scratchpad/identities.json`. Remember `TOKENS` in `tone-solver.mjs` is a hand-synced duplicate,
   and `--background` also exists as hex in `layout.tsx:31-32` and `theme-provider.tsx:134-137`.
   Deleting `--accent` is part of this. **Do not darken gold to fix the CVD collapse** — the solved
   value is `#4a361c`, a mud brown, which is the trap `tone-solver.mjs` documents at its head.
6. **PR 3** — the per-role alpha ladder. 890 of 1,456 alpha occurrences need remapping (61%).
7. **PR 4** — the 236 palette literals in `components/landing*`.
8. `docs/brand.md` — the durable guideline. Write with the **measured** numbers above.

## Local environment gotchas (these cost real time)

- **`npm run build` then `npm run dev` on the same `.next` breaks the dev server** — "Cannot find the
  middleware module" + missing vendor chunks. `rm -rf .next` between them. Hit twice.
- A **cold route serves an unstyled 404** in dev because Next compiles per-route on first request.
  `scratchpad/shoot.mjs` warms every route first and gates each shot on `--primary` resolving.
- **`check:bundle` fails locally on `/wizard-preview`** (241 kB > 150 kB). That route is in
  `.git/info/exclude` — untracked, so it does not exist in CI. Verified: parking the directory and
  rebuilding gives "All routes within budget".
- `scratchpad/shoot.mjs` suppresses the onboarding tour with **CSS, not a click** — dismissing it
  calls `markOnboardingStep()`, a DB write.
- `.env.local` holds `E2E_EMAIL`/`E2E_PASSWORD` for `felix.mller.24+seed@ascenda.demo` — a **real
  account on the production project** whose password was set for this work. Rotate when done.
