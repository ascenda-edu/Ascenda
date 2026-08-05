# Colour system — live progress log

**Single source of truth for this work.** Read this first; it supersedes the conclusions in
[colour-palette-research.md](./colour-palette-research.md) where they disagree. PR mechanics are in
[colour-system-remaining-prs.md](./colour-system-remaining-prs.md).

Branch `chore/tone-desaturation` — **not pushed**.
`51b3bed` tone desaturation · `4d54604` Signal placement · `0d6d0a1` residual brand fills ·
`6bc4619` **PR 2 — periwinkle on a true-neutral canvas**.

---

## 1. What has shipped

**PR 0 + PR 1 are committed and green.** Placement is done: colour no longer lands on card surfaces,
category rails, or icon bubbles; "done" is silent; `info` and `feature` are deleted; the nav pill, tab
fill, segmented control and search tint are all neutral.

**Verified at `0d6d0a1`:** typecheck 0 · lint exactly 2/2 warnings (zero headroom) · 2036 tests / 89
suites · tone-solver **92/92** · production build green · all routes within bundle budget ·
`lint:tokens` ratchet fell (`dark-variant` 109→108, `template-classname` 25→20) and the baseline is
tightened and committed.

**Measured from real screenshots** (`scratchpad/measure.py`, OKLab chroma > 0.045):

| screen | light before → after | dark before → after |
|---|---|---|
| **profile** | **11.08% → 1.14%** (−90%) | 1.61% → 1.11% |
| applications | 9.27% → 1.30% | 9.38% → 1.40% |
| scholarships | 6.71% → 0.86% | 6.82% → 1.40% |
| **all 20 screens, mean** | **3.38% → 1.53% (−55%)** | **2.96% → 1.47% (−50%)** |

Before-set preserved at `~/Desktop/ascenda-before-signal`, after-set at `~/Desktop/ascenda-current-state`.

> The artifact figure of "36.5% → 2.95%" came from a layout model and was ~3× overstated in absolute
> terms; the ratio (−90%) was right. **Use the measured numbers.**

---

## 2. The palette decision — where it landed

Four rounds of exploration. **The conclusion reversed twice**, so read the reasoning, not just the answer.

### The finding that settled it

Brand colour of the ten apps teenagers actually use (Pew Dec 2025 usage; Piper Sandler Fall 2025
favourites), measured in OKLCH:

```
chromatic brands:  L 0.58 – 0.96  (mean 0.66)   C 0.19 – 0.26  (mean 0.22)
Discord            L 0.58   C 0.209   H 274°
Ascenda today      L 0.48   C 0.220   H 275°
```

**Ascenda's chroma is the mean. Its hue is Discord's hue. Its lightness is below every app measured.**
Weight is what reads as corporate — not the hue, and not the saturation. Two earlier conclusions were
wrong and are superseded:

- ❌ *"Oxford navy"* — navy is what universities use in crests for heritage. Ascenda is the tool
  helping someone get in, not the institution. Also lost most of its distinctiveness when the serif
  was ruled out.
- ❌ *"Avoid indigo, it looks AI-generated"* — fighting the gamut. Indigo holds chroma 0.285 at L 0.48
  and teal tops out near 0.15 anywhere, which is *why* software clusters in blue-violet. And Discord
  is the same hue.

### Chosen direction: **Periwinkle**

Hue **275°**, chroma **~0.215**, lightness **0.58** in light / **0.70** in dark.
Light `#5a62f4` · dark `#8394ff`. All 26 contrast checks pass.

**Why L 0.58 exactly:** white text on a solid brand at this hue clears AA only at L ≤ 0.58
(4.57:1 at 0.58; 4.20 at 0.60; 3.53 at 0.64). Greg wants white labels on brand pills, so 0.58 is the
ceiling — and it is Discord's exact lightness, the floor of the teen range. One rule, no exceptions:
**every solid brand fill carries a white label.**

Rejected alternative: periwinkle at L 0.64 with a separate darker pill so white could sit on it. That
means two solid brand fills at two lightnesses with **opposite label colours on one card** — reads as
an accident. Do not do this.

### Also decided: the action strip is BRAND, not gold

Greg disliked the yellow "Finish this step" strip, and it was a semantic error rather than a taste one:

- `warning` means "act soon", which **implies a deadline**. An unfinished profile section has none —
  it is simply the next thing to do, which makes it a **primary action**, and that is the brand's job.
- Gold was doing two jobs on one screen: the strip *and* "Due Fri" two cards below, which genuinely is
  dated. Same colour, two meanings — the exact ambiguity the three-tone system exists to prevent.
- The icon changed too: a clock says *hurry*, an arrow says *go*. Label is now **"Next up"**, not
  "Needs you" — same information without the reproach, on a screen anxious students open.

Result: the profile screen carries **one hue**. Gold and red stay in "Next up" where items are dated.

### ✅ RESOLVED — the canvas is a TRUE NEUTRAL (chroma 0.000)

Rendered 5 Aug 2026: periwinkle on four canvases, brand held fixed, all four passing 26/26 contrast
checks. Artifact `https://claude.ai/code/artifact/b5a00ec8-83f0-4116-8ee8-5af171e143b2`; JPGs in
`~/Desktop/ascenda-canvas/` (`COMPARE-all-four.jpg` is the side-by-side — the only view that makes a
chroma-0.010 difference judgeable, because the eye adapts within a second of looking at one alone).

| | canvas | light page / card | verdict |
|---|---|---|---|
| — | paper at the brand's hue, H 275 C 0.006 | `#f5f6fb` / `#fdfdff` | the incumbent — the defect |
| A | warm paper, H 70 C 0.010 | `#f8f2ec` / `#fff9f3` | recommended, not chosen |
| **B** | **true neutral, C 0.000** | **`#f3f3f3` / `#fafafa`** | **CHOSEN** |
| C | warmer paper, H 70 C 0.018 | `#f7ede2` / `#fff5ea` | the ceiling, ruled out on purpose |

**Greg chose B over the recommendation of A.** B fixes the hue collision without committing the
product to warmth — the correction without the taste bet.

**Two findings from the render worth keeping:**

1. **A white card cannot be warm — the sRGB gamut forbids it.** At OKLCH lightness 0.995, where the
   card sat, the maximum achievable chroma is **0.004 at every hue**. Request 0.006 or 0.026 and you
   get the identical `#fffdfb`; the request is silently clipped. Card 0.985 is the highest lightness
   that delivers 0.010, and 0.975 the highest that delivers 0.018. So chroma and card lightness are
   not independent dials, and "warmer paper" necessarily means "further off white".
2. **Therefore B shipped at the SHIPPED lightness architecture, not the rendered plate.** The
   comparison rendered B at card 0.985 (the plate the warm options needed). On an achromatic canvas
   that 1.5% drop buys nothing and costs real gates: measured, light `success-fill` fell to 2.90:1 and
   `warning-fill` to 2.88:1 against the card, both under the required 3:1, because a `#fafafa` card
   has less contrast with a mid-tone fill than `#ffffff`. Fixing that would have meant re-solving the
   status tones, which PR 2 deliberately holds fixed. **B's decision was the hue; the hue is what
   moved.** Shipped card is `#ffffff`, page `#f4f4f4`.

### What PR 2 actually landed (commit `6bc4619`)

Full verification: typecheck 0 · lint **exactly 2/2** · 2036 tests / 89 suites · tone-solver **92/92** ·
`lint:tokens` no regressions · production build green · all routes within bundle budget.

- **The neutral is achromatic.** Hue 232 → hue 0, saturation 0. Only the hue moved.
- **The brand is periwinkle.** Light `--primary: 236.8 89.5% 66.1%` (`#5b64f6`), dark
  `232 100% 75.7%` (`#8394ff`). Note `#5b64f6`, not the `#5a62f4` recorded earlier — that hex was
  OKLCH L 0.576, an artefact of an earlier solver's lift loop. True L 0.58 is `#5b64f6` at 4.58:1
  under white.
- **The dark button AA failure is fixed at the token** — 3.94:1 → **6.82:1**, dark ink on the lighter
  L 0.70 fill.
- **The verifier's blind spot is closed.** Its button check hard-coded white and then short-circuited
  with `|| mode === 'dark'`, so the dark pair was *never measured* while the gate reported success.
  It now tests the actual `--primary-foreground` in both modes. Still 92 checks. **Never write a gate
  that exempts a mode.**
- **The action rail and strip are the brand**, not `warning`; badge reads "Next up" with an arrow.
- **`--ring` is an alias of `--primary`. `--series-3` deliberately is NOT** — pinning the ramp's
  middle step to the brand forces it symmetric and measurably costs legibility: minimum adjacent step
  1.32:1 → 1.21:1, span L 0.275 → 0.190, against the 1.3–1.5:1 spacing `globals.css` documents.
- **Dark `--muted-foreground` took the APCA lift**, 60.1% → 70% (Lc 45 → 57, WCAG 4.79 → 6.62:1).
- Light `--muted-foreground` 41.8% and `--primary-ink` 61.8% sit one tenth below their 41.9/61.9
  floors on purpose, so a later half-point surface tweak cannot silently drop them under AA.

### ⚠ `--accent` was NOT deleted — and must not be, yet

The remaining-PRs doc says delete it in PR 2. **Doing so would have taken down the live homepage.**
`--accent` is still used four times in `src/components/landing-preview/`, and `src/app/page.tsx`
imports that folder — landing-preview *is* the live `/` (the Ascent). Two of those usages are
`from-primary to-accent` under **`bg-clip-text text-transparent`**: Tailwind emits nothing for an
unknown colour rather than erroring, so deleting the token renders the hero **headline invisible in
production** on a green build. It is instead redefined as *the brand, lighter* (byte-identical to
`--series-5` light / `--series-2` dark), so it is no longer a second indigo ΔE 37 away. **Delete it in
PR 4**, with those four call sites.

### Superseded note — the old canvas diagnosis

**The final periwinkle renders used `paper: { H: 275, C: 0.006 }` — the same hue as the brand.** That
was deliberate, to isolate the lightness variable, but it reproduces the defect diagnosed earlier:

> Shipped brand is OKLCH H 275°; shipped canvas is H 279° at chroma 0.006. **The greys are desaturated
> indigo**, so the screen reads monotone rather than accented — and the accent takes the blame. This is
> most of the "too much indigo" feeling.

An earlier round tested **warm paper** (H 70, C 0.010, card a warm off-white rather than `#ffffff`),
per the 2026 shift away from cool greys — *"minimalism isn't white, it's off white"*, and warm neutrals
*"let accent colors shine"*. It is also the single change no generated app makes: the template tell is
*"accept the default theme, accept the default radius, accept the default Inter font"*.

**Periwinkle-on-warm-paper has never been rendered.** That is the first thing to do in a fresh session:
combine the two decisions and look at it. Generator: `scratchpad/build-white.mjs`, change `paper` to
`{ H: 70, C: 0.010 }` and re-run.

---

## 3. Guidelines derived from the top teen apps

Ten checkable rules, each with its evidence and Ascenda's current status. Artifact:
`https://claude.ai/code/artifact/4ca97d79-2f6f-4a36-8898-22d7ac4c402c`
JPGs: `~/Desktop/ascenda-teen-guidelines/` (per-section, per-rule, and full page).

| | rule | status |
|---|---|---|
| G1 | Brand lightness 0.58–0.75, chroma 0.19–0.24 | ✗ → fixed by Periwinkle |
| G2 | The label is chosen, never lifted | ✓ implemented |
| G3 | One accent, and it has to be earned | ✓ PR 1 |
| G4 | Dark mode is first-class, not an inversion | ⚠ card L 0.24 is media-dark; chat/utility sit 0.28–0.34 |
| G5 | Chrome recedes; content leads | ✓ PR 1 |
| G6 | Thumb reach, 44pt targets, bottom nav ≤5 | **✗ never audited — likely the biggest usability win** |
| G7 | Motion carries meaning, interruptible | ✓ |
| G8 | Type decides credibility before colour | **✗ highest-leverage item still open** |
| G9 | Colour never alone; each tone owns a shape | ✓ |
| G10 | Do not infantilise a sixteen-year-old | ✓ |

**G8 matters more than the palette.** *"Layout hierarchy and typography consistency are the two most
critical visual elements influencing whether a user perceives a brand as credible within the first two
seconds."* Cheapest meaningful change: **replace Outfit, keep Inter for body** — one swap, no
body-text risk.

---

## 4. Next actions, in order

1. **Render periwinkle on warm paper** (see §2). Decide the canvas. This is the last open palette question.
2. **PR 2** — apply the values. Four hand-synced copies must move together; see the remaining-PRs doc.
   The dark-button 3.94:1 AA failure is fixed by the same edit.
3. **PR 3** — the per-role alpha ladder. 890 of 1,456 occurrences (61%).
4. **Type (G8)** — replace Outfit.
5. **Mobile audit (G6)** — thumb reach and tap targets, entirely unchecked.
6. **PR 4** — the 236 landing literals.
7. **`docs/brand.md`** — still owed. The durable guideline: instrument ladder, three caps, three
   semantic rules, the 81-row element register, the token table, do/don't. Use the **measured** numbers.
8. **The reward layer.** PR 1 removed the green completion flood correctly but added nothing back, so
   there is now no moment of delight anywhere. Duolingo's lesson is "spend colour on progress", not
   "use more colour" — a bounded celebratory moment on the *transition* to complete. The `celebrate`
   state already exists in `ProfileProgressCard`.

---

## 5. Artifacts and exports

| what | where |
|---|---|
| Colour placement system (81-element register, doctrine, audit) | `claude.ai/code/artifact/e677a474-96dd-4e43-942e-4c0b9d664dff` |
| Teen-app guidelines G1–G10 | `claude.ai/code/artifact/4ca97d79-2f6f-4a36-8898-22d7ac4c402c` |
| Periwinkle / white-label comparison | `~/Desktop/ascenda-white-label/` |
| The lightness lift, four levels | `~/Desktop/ascenda-the-lift/` |
| Guidelines JPGs | `~/Desktop/ascenda-teen-guidelines/` |
| Before / after screenshots | `~/Desktop/ascenda-before-signal/`, `~/Desktop/ascenda-current-state/` |

**Scratchpad generators** (session dir — copy anything you want to keep):
`oklch.mjs` (OKLCH↔sRGB with gamut mapping, WCAG + APCA) · `build-white.mjs` (current recommendation) ·
`build-guidelines.mjs` · `shoot.mjs` (20 screens × 2 themes) · `measure.py` (chromatic area) ·
`export-options.mjs` (JPG export) · `solve-identities.mjs`, `audit.mjs`, `solve-fixes.mjs`.

---

## 6. Local environment traps (these cost real time)

- **`npm run build` then `npm run dev` on the same `.next` breaks the dev server** — "Cannot find the
  middleware module". `rm -rf .next` between them. Hit twice.
- A **cold route serves an unstyled 404** in dev; `shoot.mjs` warms every route and gates each shot on
  `--primary` resolving.
- **`check:bundle` fails locally on `/wizard-preview`** — that route is in `.git/info/exclude`,
  untracked, absent in CI. Park the directory to prove a clean pass.
- **A JSX comment cannot be a sibling in a `return (` or a ternary branch.** Broke the build twice.
- **Tailwind emits nothing for a deleted token** — no error. Replace usages, grep to 0, then delete.
- `.env.local` holds `E2E_EMAIL`/`E2E_PASSWORD` for `felix.mller.24+seed@ascenda.demo` — a **real
  production account** whose password was set for the screenshot run. **Rotate it.**
