# Colour system — instructions for the remaining PRs

Self-contained handoff. A fresh session should be able to execute any of these from this file
alone. Companion docs: [progress log](./colour-system-progress.md) (what has landed, measured
results, environment traps) and `~/.claude/plans/rippling-questing-starlight.md` (original plan).

Branch: `chore/tone-desaturation`, three commits in, **not pushed**.
`51b3bed` tone desaturation · `4d54604` Signal placement · `0d6d0a1` residual brand fills.

**Read first, in this order:** the progress log's "Decisions taken" and "Local environment
gotchas" sections. Several of these traps produce a green build and broken UI.

---

## Universal constraints — every PR below

1. **`npm run lint` has ZERO headroom.** Exactly 2 warnings against `--max-warnings 2`. Any
   orphaned import or variable fails CI. Delete what you strand.
2. **`lint:tokens` is a ratchet.** Counts may only fall. Current baseline after PR 1:
   `palette-literal 236 · hex 5 · dark-variant 108 · raw-z 68 · off-ladder-shadow 25 ·
   arbitrary-geometry 92 · template-classname 20 · subfloor-type 24 ·
   named-step-as-arbitrary 54 · dead-opacity 0`. `dead-opacity` at 0 is a hard error on any new
   occurrence. Introduce **no arbitrary values** (`h-[2px]`, `border-l-[3px]`, `bg-[#…]`).
   If counts fall, run `node scripts/check-design-tokens.mjs --update-baseline` and commit it.
3. **Tailwind does not error on an unknown colour — it emits nothing.** So deleting a token while
   a class still references it gives you invisible UI on a passing build. Always: replace all
   usages, prove it with a grep returning 0, *then* delete the token.
4. **A JSX comment cannot be a sibling in a `return (` or a ternary branch.** `{/* … */}`
   followed by an element is two children and a parse error. Put the comment above the `return`
   or above the `{cond ? (`. This broke the build twice during PR 1.
5. **Never `npm run build` then `npm run dev` on the same `.next`.** The dev server fails with
   "Cannot find the middleware module". `rm -rf .next` between them.
6. Verification set: `npm run typecheck && npm run lint && npm run test && npm run lint:tokens`,
   then `node scripts/tone-solver.mjs` (must exit 0), then `rm -rf .next && npm run build &&
   npm run check:bundle`.
7. **`check:bundle` fails locally on `/wizard-preview`** (241 kB > 150 kB). That route is in
   `.git/info/exclude` — untracked, absent in CI. To prove a clean pass, move
   `src/app/wizard-preview` aside, rebuild, check, move it back.

---

## ✅ PR 2 — DONE, commit `6bc4619`

Landed as **periwinkle on a true-neutral canvas**. Greg chose canvas **B (true neutral, chroma 0.000)**
over the recommended warm paper. See [colour-system-progress.md](./colour-system-progress.md) §2 for the
measured token table and the canvas comparison, and **[brand.md](./brand.md)** — now written — for the
durable guideline.

**Four instructions below turned out to be wrong or unsafe. Corrected, with reasons:**

1. **"Delete `--accent`" — DON'T, not yet.** The claim that its only remaining references are in
   `components/landing*` and therefore "PR 4 territory" missed that **`src/app/page.tsx` imports
   `landing-preview/` — that folder IS the live homepage**. Two of the four usages are
   `from-primary to-accent` under `bg-clip-text text-transparent`, and Tailwind emits nothing for an
   unknown colour, so deleting the token renders the **hero headline invisible in production** on a
   fully green build. It is instead redefined as *the brand, lighter*. Delete it **in PR 4**, with the
   call sites.
2. **"Collapse `--ring` and `--series-3` into aliases of the brand" — only `--ring`.** Pinning the chart
   ramp's middle step to the brand forces the ramp symmetric about it and measurably costs legibility:
   minimum adjacent step 1.32:1 → **1.21:1**, span L 0.275 → 0.190, against the 1.3–1.5:1 spacing
   `globals.css` documents as a property of the ramp. A focus ring genuinely *is* the brand; a chart ramp
   has its own job.
3. **The recorded brand hex was slightly off.** `#5a62f4` is OKLCH L 0.576 — an artefact of an earlier
   solver's lift loop. True L 0.58 is **`#5b64f6`** (4.58:1 under white). Dark `#8394ff` was correct.
4. **The action strip's glyph and label didn't exist as described.** "A clock and 'Needs you'" was the
   *artifact replica*, not the app. In the real component the incomplete state had **no icon** and the
   badge read **"Action"**. Applied faithfully to the real DOM: badge → "Next up", plus an `ArrowRight`
   mirroring the `Check` on the complete state.

**Also worth carrying forward:** the plate you render a canvas on is not free. The comparison rendered
canvas B at card L 0.985 (the lightness warm paper *needs*, because at 0.995 the sRGB gamut caps chroma
at 0.004 and warmth is silently clipped). Shipping that 1.5% drop on an achromatic canvas would have put
light `success-fill` at 2.90:1 and `warning-fill` at 2.88:1, both under the required 3:1. **B's decision
was the hue; only the hue moved.**

<details>
<summary>Original PR 2 instructions, kept for the reasoning</summary>

## PR 2 — Oxford palette values

**The palette is decided: Periwinkle.** Oxford was rejected — see
[colour-system-progress.md](./colour-system-progress.md) §2 for why, and why "avoid indigo" was also
wrong.

    hue 275°   chroma ~0.215   L 0.58 light / 0.70 dark
    light #5a62f4    dark #8394ff    all 26 contrast checks pass

L 0.58 is not a taste call — white text on a solid brand at this hue clears AA only at L ≤ 0.58
(4.57:1 at 0.58, 4.20 at 0.60, 3.53 at 0.64). It is also Discord's exact lightness. **One rule: every
solid brand fill carries a white label.**

**One question remains open before this PR: the canvas.** The periwinkle renders used paper at the
brand's own hue, which reproduces the monotone defect (shipped brand H 275°, shipped canvas H 279° —
the greys are desaturated indigo). Warm paper at H 70 was tested separately and never combined with
periwinkle. Render that first: `scratchpad/build-white.mjs`, set `paper: { H: 70, C: 0.010 }`.

Regenerate values with `scratchpad/build-white.mjs`, which solves everything in OKLCH and prints the
HSL triplets. `oklch.mjs` alongside it carries the colour maths, WCAG and APCA.

Two further changes belong in this PR, decided after the plan was first written:

- **The action strip is the BRAND, not `warning`.** `warning` means "act soon", which implies a
  deadline an unfinished profile section does not have — it is a primary action. Gold was also doing
  double duty against the genuinely-dated "Due Fri" on the same screen. Update
  `.surface-action-strip` and `.surface-card--action` in `globals.css` to brand, change the glyph from
  a clock to an arrow, and the label from "Needs you" to "Next up".
- The **APCA dark lifts** (+10–12 lightness on dark text tokens, which *raises* WCAG to 6.58:1) still
  apply and are still worth taking.

**Four copies of the palette must move together.** Miss one and the failure is silent:

| file | what |
|---|---|
| `src/app/globals.css` | `:root` and `[data-theme='dark']` token blocks |
| `scripts/tone-solver.mjs` | the `TOKENS` table (~L70–124) — a **hand-synced duplicate**. Change only globals.css and the verifier validates the OLD palette while reporting success. |
| `src/app/layout.tsx:31-32` | `themeColor` hex — meta tags cannot read CSS vars |
| `src/components/theme/theme-provider.tsx:134-137` | `THEME_COLOR` hex, the client-side twin |

**Also in this PR:**

- **Delete `--accent`.** It is a second indigo ΔE 37 from `--primary` — close enough to read as a
  mistake. Remaining references after PR 1 are only in `components/landing*` (PR 4 territory) plus
  the token definition itself. Verify with
  `rg -n '(bg|border|to|from|via|ring|text)-accent' src | grep -v landing`.
- Collapse `--ring` and `--series-3` into **aliases** of the brand rather than three independent
  numbers that must be kept in step. They are currently byte-identical (`#4442d7`).
- **Fix `ui/button.tsx:17` properly.** `bg-primary text-primary-foreground` measures **3.94:1** in
  dark today. It was deliberately left alone in PR 1 because changing it per-call-site would
  recolour every primary button; the dark `--primary` lift fixes it at the token. After the lift,
  re-measure and confirm ≥4.5:1.
- **Do NOT darken gold to fix the CVD collapse.** Red and gold are one olive under deuteranopia
  (ΔE 6). The lightness-solved fix returns `#4a361c`, a mud brown — the exact trap
  `tone-solver.mjs` documents at its head. It is handled *semantically* instead: red and gold may
  not appear in the same comparison set. That rule is already implemented.

**Gate:** `node scripts/tone-solver.mjs` must exit 0. It runs **92 checks** with three tones
(it was 128 with five). It is a **manual** gate — not wired into CI — so run it deliberately.

**Expect the visible change here.** Everything so far has been placement on the existing indigo,
which is why the app reads calmer but not different. This is the PR where the brand changes.

</details>

---

## PR 3 — the per-role alpha ladder

The largest edit of the rollout. **Land it last** so it reviews separately from the values.

**The finding it implements:** alpha is a distance-from-surface multiplier, so one ladder cannot
serve every token. Measured against the card a tint sits on — `primary/10` is ΔE 58 and plainly
visible; `muted/10` is ΔE **5** and `muted/40` is ΔE 19, both under the JND of 23, i.e. invisible.

- **Contrasting tokens** (brand, `primary-ink`, `muted-foreground`, tone texts): `/10`, `/30`,
  `/60`, solid. All four verified visibly distinct.
- **Surface-adjacent tokens** (`muted`, `border`, `card`): **no alpha at all** — used solid.

**Consequence worth knowing:** `hover:bg-muted/60`, the app's standard hover across ~78 uses,
measures ΔE 28 — barely over the JND. Solid `bg-muted` is ΔE 46, a hover you can actually see.

**Scale: 890 of 1,456 alpha occurrences need remapping (61%).** Mechanical and greppable. Census:
`rg -o '\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|divide|outline)-[a-z0-9-]+/(\d+)'
-r '$1' src --glob '*.tsx' --glob '*.ts' --glob '*.css' | sort -n | uniq -c`.

Map each off-ladder value to the nearest rung. Known off-ladder values in current use include
`/3 /5 /8 /15 /20 /25 /40 /45 /50 /70 /75 /80 /85 /90 /95`.

**Also collapse the neutral pill**, currently duplicated verbatim in four places with
*disagreeing* border alphas (`/25` vs `/40`):
`globals.css` (`.surface-chip`), `lib/theme/categories.ts` (`TONE.neutral`),
`lib/theme/fit-score.ts`, `lib/counsellor/deck-theme.ts` — plus two open-coded copies in
`app/profile/wizard/_components/intake-step-meter.tsx` and
`components/layout/command-palette.tsx`, both using an off-ladder `hover:bg-primary/15`.

Consider partitioning across parallel subagents by **file** (disjoint sets, so no merge
conflicts) as PR 1 did — see the "How PR 1 was executed" note at the end.

---

## PR 4 — the landing pages

**236 palette-literal occurrences in 11 files**, all under `src/components/landing/` and
`src/components/landing-preview/`. They are the entire `palette-literal 236` ratchet count, and
the whole authenticated app has zero.

Worst offenders: `landing/mock-viz.tsx` (54), `landing/product-widgets.tsx` (53),
`landing-preview/step-shots.tsx` (29), `landing/TeamSection.tsx` (23),
`landing-preview/preview-cta.tsx` (20), `landing-preview/comparison-settle.tsx` (19).

The hue distribution maps almost 1:1 onto the token system — emerald→`success`, rose→`danger`,
amber→`warning`, slate→`background`/`foreground`/`muted`, indigo→`primary`. **But `sky`→`info` and
`violet`→`feature` no longer exist**: sky becomes neutral, violet becomes brand.

Light/dark pairs (`text-emerald-600 dark:text-emerald-400`) collapse to a single token each, which
should roughly halve the count *and* lower the `dark-variant` ratchet.

**Two exemptions — do not tokenise:**
- `landing-preview/rocket-art.tsx` (31 hex) and `profile/wizard/ascendi-mark.tsx` (5 hex) are the
  **mascot**. `ascendi-mark.tsx` states it explicitly: `currentColor` is deliberately not used
  because Ascendi is a character with fixed colours. Both are already allow-listed in
  `lint:tokens`. Tokenising them would make the mascot change colour with the theme.
- `src/app/layout.tsx` meta `theme-color` hex — a meta tag cannot read a CSS var.

Before starting, decide with Greg whether marketing pages are **in** the doctrine or deliberately
exempt. They are a different audience with different rules, and this was left open.

---

## `docs/brand.md` — the durable guideline (still owed)

This is the artefact the whole exercise was for, and it has **not** been written. The progress log
is a working record, not a guideline.

Contents, per the approved plan:

1. Positioning in a paragraph; elevated / simple / effective tied to concrete rules, not adjectives.
2. **The instrument ladder** — six levels, area inversely proportional to how routine the meaning
   is: 0 nothing · 1 muted ink · 2 brand ink · 3 outline chip · 4 small tinted fill · 5 solid fill.
3. **The three caps** — one chromatic element per card (a chart is one *decision*, not five marks);
   one solid fill per viewport; non-neutral fill under 10% of a screen, labelled as a **chosen
   convention, not a sourced figure**.
4. **The three semantic rules** — red and gold may not co-occur (ΔE 6 under deuteranopia); selection
   is not status and may tint; `success` is for terminal positive outcomes, never for "done".
5. **The element register** — 81 rows across Surfaces / Structure / Type / Icons & marks / Status &
   badges / Controls / States / Data, each with the level it is licensed for. Reproduce from the
   artifact `https://claude.ai/code/artifact/e677a474-96dd-4e43-942e-4c0b9d664dff`.
6. **The full token table** for the chosen palette, both themes, HSL + hex + measured ratio, in the
   exact format `globals.css` uses so it is transcribable without reinterpretation.
7. **Do / Don't with real class strings**, including the two recorded traps: `bg-primary` +
   `text-primary-foreground` is 3.94:1 in dark (never put text on a solid `bg-primary` — use
   `--primary-ink`), and `text-primary` fails AA in dark, which is why `--primary-ink` exists.
8. **How to add a colour** — `globals.css` first, `tone-solver.mjs` exits 0, `lint:tokens` does not
   regress. Plus the four-copies warning from PR 2.
9. Appendix: the rejected palette directions with their values, so nobody re-litigates from scratch.

**Use the MEASURED numbers, not the modelled ones.** The artifact says 36.5% → 2.95% from a layout
model; measured reality on `/profile` is **11.08% → 1.14%**, and the app-wide mean is 3.38% → 1.53%
light / 2.96% → 1.47% dark. The ratio was right, the absolute level was ~3× overstated.

---

## Smaller open items

- **`components/dashboard/dashboard-skeletons.tsx:15`** — untokenised `via-white/5` shimmer. No
  ratchet rule catches it, and `via-card/5` would be invisible in light mode. Needs a real
  decision rather than a mechanical substitution.
- **`TONE.*.border`** in `lib/theme/categories.ts` is still a full-border tint reachable by the
  ordinal registries. An agent flagged it as arguably still encoding category on toolbox tool
  cards, match-list tier blocks and scholarship cards. Worth a second look.
- **`showToast({ variant: 'info' })`** at ~4 call sites is `ui/toast.tsx`'s own `ToastVariant`
  union, not a Tailwind class — it renders neutral. Harmless, but the name now disagrees with a
  deleted tone. Rename if you want the vocabulary consistent.
- **Rotate the seed credential.** `.env.local` holds `E2E_EMAIL`/`E2E_PASSWORD` for
  `felix.mller.24+seed@ascenda.demo` — a **real account on the production project** whose password
  was set for the screenshot run.

---

## How PR 1 was executed (reuse this shape)

115 component files needed the same mechanical rules. What worked:

1. **Lead owns the shared, high-risk files** — `globals.css`, `tailwind.config.ts`,
   `lib/theme/categories.ts`, `scripts/tone-solver.mjs`, and the primitives (`ui/badge.tsx`,
   `ui/tabs.tsx`, `layout/section-nav.tsx`, `layout/page-hero.tsx`). These carry load-bearing
   comments and specificity workarounds that a mechanical pass will break.
2. **Write the rules to one file**, then partition the remaining files into **disjoint** lists and
   give each subagent the rules plus its own list. Partition by file, not by concern — otherwise
   two agents edit the same file.
3. **Tell agents to report summaries, not diffs.** Their findings are the valuable output; the
   diffs are already on disk.
4. **Expect them to find real problems in your rules.** In PR 1 they caught: a mapping that made
   contrast *worse* (`bg-feature-fill` → `bg-primary` at 3.94:1), a cross-file `ring-1` dependency
   that would have broken a sibling component, and an AA failure in a ladder the lead prescribed.
   Amend the rules mid-flight with SendMessage.
5. **Re-shoot and look at the screenshots.** `scratchpad/shoot.mjs` (20 screens × both themes) and
   `measure.py` (chroma > 0.045). Three solid brand fills and a card repeating itself five times
   were found *only* by looking at the output — no gate catches them.
