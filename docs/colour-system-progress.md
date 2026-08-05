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

## 2b. PR 3 — the alpha ladder (commit `4d18a23`)

147 files swept by four parallel agents partitioned by file, six shared files owned by the lead,
~1000 class-value edits. Gates: typecheck 0 · lint exactly 2/2 · 2036 tests / 89 suites ·
tone-solver 92/92 · `lint:tokens` no regressions · build green · all routes in budget.

**The sweep found seven errors in the rules it was given** — every one of which passes all of the above.
Full list in the commit message and the traps are in [brand.md](./brand.md) §7. The three worth knowing:

1. **The ladder must never touch text.** `text-muted-foreground` is 1.50:1 at `/30`, 2.44:1 at `/60`,
   2.92:1 at `/70` — every rung fails AA; only solid passes at 5.36:1.
2. **A tint carrying ink caps at `/10`.** `text-primary-ink` on `bg-primary/N` over white: `/10` = 4.73:1
   pass, `/20` = 4.14 fail, `/30` = 3.60 fail. The prescribed `/20 → /30` mapping *created* a failure.
3. **Rule A itself created a hierarchy inversion.** An inactive row's `hover:bg-muted/60` sat at
   L\* ~96 — subordinate to a `bg-primary/10` active state at L\* 95.7. Forcing it solid took it to
   L\* 94.3, so the **inactive hover became heavier than the active row**; `bg-border` widened the gap to
   L\* 87.2. It cannot be fixed from the neutral side, because an ink-bearing tint caps at `/10` and every
   usable neutral is heavier. `bg-muted/60` is therefore a measured exception at 17 sites: ΔE 28 clears
   the JND of 23, so it is visible *and* subordinate.

**Two dead ends, recorded so they are not retried:** `bg-secondary` cannot separate two states (it is
byte-identical to `--muted` in dark), and `bg-border` looks right at 1.24:1 from muted but that measures
the wrong thing — it is the heaviest neutral in both themes.

**Ruled outside the ladder rather than forced:** dimming a solid fill (`hover:bg-series-N/85`, 19 chart
marks), and gradient stops / `inset-0` scrims, where alpha is the mechanism not a tint.

⚠ **`bg-muted/60` is now load-bearing in two opposite directions** — as the hover above a transparent
rest, and as the rest below a solid hover. A future mechanical pass reading only "surface tokens take no
alpha except `/60`" will flatten them again. Check the sibling state first.

---

## 2c. G8 — type (Outfit → Schibsted Grotesk)

The durable version of all of this is **[brand.md](./brand.md) §9**. This is the working record.

**The scan came first, and it changed the recommendation.** There are exactly two ways to get the heading
face — a semantic `<h1>`–`<h6>` tag, or a literal `font-heading` class. `font-heading` appears **once** in
`globals.css` (line 488, the base rule). No utility or component class sets a family. So:

- Outfit reached 66 semantic headings + 38 explicit classes; **~110 heading-shaped elements rendered in
  Inter** purely because they were a `<p>` or `<span>`.
- **The wordmark shipped in both faces** — Inter in `navbar.tsx`, Outfit in `LandingFooter.tsx`.
- The **largest type in the app proper was Inter** (a 30px score readout in `chances-calculator.tsx`).
- The **PageHero stat value is Inter**, inches from its own Outfit `<h1>`, on every student page.
- Stat numbers split **4 Outfit / 22 Inter**; bold 14px titles **6 / 60**. No rule was in force.
- Outfit also leaked *down* to an 11px bar label and one button.
- **The primitives were all correct** — CardTitle, DialogTitle, PageHero, EmptyState, HubCard all reach the
  heading face via a semantic tag. Every failure was at a call site. That is what made the swap safe.

**The measured case against Outfit** (from the font binaries at weight 600, the house weight): x-height
0.483 vs Inter's 0.546 (−11.5%), lowercase 6.9% narrower. At 18px — every card title, the app's most common
heading — its lowercase sat **+6.1%** above the 15px Inter body beneath it, where Inter semibold at the same
size gives **+20%**. **The second font was a net negative at the size it was used most.** Schibsted measures
**+15.8%** at Inter's own width: presence gained, nothing reflowed.

**Two rules now decide which face an element gets** (both in brand.md §9):
1. **The heading face is for words, not figures.** Stat values, scores, percentages, counts, currency stay
   Inter regardless of size — they are data, and nearly all carry `tabular-nums`.
2. **The heading face applies at 16px and up.** Below `text-base` the faces are not tellable apart anyway,
   and tight heading tracking hurts at 11–13px. So 14px card titles, eyebrows, labels and **buttons** are
   Inter.

Together these meant most of the ~110 Inter sites were *correct*; only ~14 genuine word-titles needed the
heading face. Net: 13 `font-heading` removals, 16 additions, 3 `font-sans` opt-outs on semantic headings kept
for their document outline.

⚠ **A weak heading face masks a coverage problem.** When two faces look alike, using the wrong one costs
nothing visible — which is how the wordmark came to ship in both. Re-run the coverage scan whenever the face
changes.

**The variable is `--font-heading`, not `--font-outfit`/`--font-schibsted`.** Bind to the role: the old name
had to be find-and-replaced through `tailwind.config.ts` *and* its `typography` prose block, and a missed copy
fails silently. Hand-synced copies that moved: `layout.tsx`, `tailwind.config.ts` (×5),
`src/components/landing/CLAUDE.md` (×2).

## 2d. G6 — the mobile audit (findings only, NOT fixed)

**The bottom nav is already right** — `mobile-nav.tsx:110` gives 4 destinations + "More" = exactly 5 for
every role, ~52×67px items, and it uses `pb-[env(safe-area-inset-bottom,8px)]`. Viewport meta allows zoom.

Everything else fails. Ranked by call-sites × severity:

1. **`Button size="sm"` is `h-9` = 36px, 100 call sites** (`ui/button.tsx:49`). `default` is 40px, `xs` 28px.
2. **`.nav-pill` computes to 34px** (`globals.css:653`) and is the shared geometry for SectionNav *and* every
   `TabsTrigger` — top-of-screen sub-nav on ~35 pages. It also overflows invisibly
   (`overflow-x-auto scrollbar-none`, items `shrink-0`).
3. **The Toast dismiss X is 16×16 unpadded** (`ui/toast.tsx:98`) and the viewport is `fixed bottom-4 right-4`
   with no safe-area inset — inside the mobile nav's band, under the home indicator, on every route.
4. **`Dialog` ships no close button**, so 12+ call sites hand-roll one and 10 land at 24–32px.
5. **Hover-gated row actions with no touch fallback** make three features unreachable on a phone:
   `student-card.tsx:127`, `conversation-rail.tsx:213`, `ComparisonModal.tsx:414`. The correct pattern is one
   file away at `cross-application-tasks.tsx:415` (`[@media(hover:hover)]:opacity-0`).

Two things worth knowing before fixing: the 44px hit-box escape hatch (`after:-inset-2.5`) is already proven
at `filter-pill.tsx:52` and `RangeSlider.tsx:148` and ~60 icon buttons could adopt it verbatim — **but
expanding hit boxes on targets already 2px apart makes overlap worse, not better**, so the `gap-0.5` clusters
need spacing first. And `100vh` is used everywhere with `100dvh` nowhere, because Tailwind is pinned at 3.3.5
and `dvh` landed in 3.4; the assistant panes are `h-[calc(100vh-220px)] min-h-[480px]`, which overflows the
visual viewport on a 390×664 iPhone and pushes the composer under the bottom nav.

## 2e. The reward layer — progress is a quantity

**49 progress/completion indicators inventoried. There is no `Progress` primitive** — every bar in the app
is hand-rolled, and only three carry a real `role="progressbar"` with `aria-value*`.

### The defect, three errors deep

`/profile`'s bar was `COMPLETION_VISUAL[classifyCompletion(pct)].bar`:

1. **Semantic.** `classifyCompletion` bands at 100/75/50 and mapped **both** 50–74 and 75–99 to amber.
   The card's own comment defended it — *"so a profile at 20% still reads as urgent at a glance"* — which
   is the error stated out loud. `warning` means "act soon", implying a deadline an unfinished profile has
   none of. Note `classifyProgress`, immediately below it in the same file, already argued the opposite for
   its own callers (*"told a brand-new student they were failing at something they had not been asked to do
   yet"*) — **the bug was found once and fixed only locally.**
2. **Colour.** Light `warning-fill` is OKLCH **L 0.673 / C 0.126 / hue 80°** — yellow turning green at
   little over half the brand's chroma. Dark is L 0.396 at **1.55:1 against the track**, i.e. a 60%-complete
   profile drew a nearly invisible bar.
3. **Form.** Completion moves in 20-point steps (5 sections), so only six values are reachable and two of
   them were amber — yet the bar spring-animated to arbitrary widths, implying precision the data lacks.

`brand.md` §5 already prescribed the answer ("Progress bar — level 5 — Brand"). The code predated the
register rather than violating a new rule.

### The constraint that shapes the fix

⚠ **The series ramp is only legal on a SEGMENTED bar.** `--series-5` measures **2.57:1 (light) / 2.70:1
(dark)** against a `bg-muted` track — under the 3:1 a non-text mark needs. It clears 3:1 against the
*card*, which is what it sits on once the 2px card-coloured gap is there. A continuous ramp bar fails its
whole first band in both themes. Separately, `text-series-4` is **4.11:1** and fails AA as text — which is
why `CHART_SERIES` sets `text: 'text-foreground'` on every step. **The ramp lives on marks, never on type.**

### What landed

New constants in `src/lib/theme/categories.ts`: `PROGRESS_SEGMENT_FILL`, `PROGRESS_SEGMENT_GAP`,
`PROGRESS_TRACK`, `PROGRESS_FILL`. `COMPLETION_VISUAL` retoned to **brand/neutral only**, `full` neutral
(rule 3: "done" is silent). Swept by three parallel agents partitioned by file, lead owning the helper.

- `/profile` bar is now **5 segments walking `series-1…5`**, driven off `stepCompletion` (not the rounded
  percentage, so completing step 4 before step 3 shows the truth), with a real `role="progressbar"`.
- **Continuous bars → `PROGRESS_FILL`**: counsellor roster, student detail, application tasks, parent
  progress board, rec-letter, requirements categories, toolbox rings.
- **Ordinal buckets → `chartPaletteAt(idx)`**: the analytics completion breakdown and its drill-down.
  ⚠ The ramp index runs by **completion magnitude, not array position** — both arrays print 100% first, so
  indexing as-written inverts the encoding. Two hand-synced copies: `analytics-charts.tsx` and
  `_analytics-client.tsx`.
- **The celebration now fires on the TRANSITION, once.** It keyed on `isComplete` from a *server-rendered
  prop*, and `/profile` is a server component, so an already-complete student got confetti **every visit and
  refresh**. A `useRef` cannot fix this — the component remounts fresh each navigation — so it uses a
  `localStorage` latch (`ascenda-profile-complete-celebrated`), cleared if the student regresses.
- Confetti went `from-primary via-muted to-success` → `from-primary to-series-4`. It was the only place in
  the app mixing the brand with a status tone in one gradient.
- The permanent `bg-success-subtle` 100% panel on `/profile` is now neutral. At 100% the screen said "done"
  four times; it now says it once.

`task-list.tsx` and `quests/_quests-client.tsx` inherited the fix through the helper with no edit.

### Two traps found during the sweep

1. **Do NOT use `.bar` from `COMPLETION_VISUAL`.** Because `full` → `neutral` (`bg-muted-foreground/30`)
   while `low`/`mid`/`high` → `primary`, banding a *bar* through the table draws a **100% bar in the faintest
   grey and a 99% bar in full brand** — paler the closer you get to done, which is worse than the olive it
   replaced. The table drives the icon and chip only. Documented at the source.
2. **`gap-[2px]` broke the `arbitrary-geometry` ratchet** (92 → 93, and that rule may only fall). Fixed with
   **`gap-0.5`** — 0.125rem is exactly 2px at the 16px root, is a named scale step, and being rem-based it
   participates in the fluid root scaling a hard 2px would not.

### Kept on status tones, deliberately

**Match tiers stay.** `brand.md` §4 explicitly maps `danger`=reach, `warning`=match, `success`=safety, so
every fit-score ring and tier bar is correct doctrine — do not "fix" them. Also kept: the essay length meter
(a real limit you can exceed), the deadline urgency bar and the toolbox countdown (genuinely dated),
per-requirement and per-letter status registries (a missing requirement really is a thing to do), the
outcome-dashboard result tiles (keyed to result *category*, not magnitude), and the admin simulation
pass-rate (a build-health signal — a failing batch is actionable, like CI red).

### Still owed

**No gate catches any of this.** `lint:tokens` reads `bg-warning-fill` as a legal semantic token, and the
tone solver checks the tokens' own contrast, not which one you picked. A quantity-vs-status rule — and a
shared `Progress` primitive — are what stop it recurring.

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
| G6 | Thumb reach, 44pt targets, bottom nav ≤5 | ⚠ **AUDITED, not fixed** — bottom nav passes; tap targets fail broadly. See §2d |
| G7 | Motion carries meaning, interruptible | ✓ |
| G8 | Type decides credibility before colour | ✓ **Outfit → Schibsted Grotesk**, + the two type rules. See §2c |
| G9 | Colour never alone; each tone owns a shape | ✓ |
| G10 | Do not infantilise a sixteen-year-old | ✓ |

**G8 matters more than the palette.** *"Layout hierarchy and typography consistency are the two most
critical visual elements influencing whether a user perceives a brand as credible within the first two
seconds."* Cheapest meaningful change: **replace Outfit, keep Inter for body** — one swap, no
body-text risk.

---

## 4. Next actions, in order

✅ Done: the canvas question (§2) · PR 2 · PR 3 · `docs/brand.md` · **G8 type (§2c)** ·
**the reward layer / progress (§2e)** · **G6 audited (§2d)**.

Still open, in order:

1. **G6 — actually fix the tap targets.** The audit is §2d; nothing is fixed. Start with
   `Button size="sm"` (one line, 100 call sites) and `.nav-pill` (one line, ~35 pages). Read the
   hit-box-overlap warning in §2d before sweeping — expanding hit areas on the `gap-0.5` clusters makes
   mis-taps worse, so those need spacing first.
2. **A shared `Progress` primitive.** All 49 bars are hand-rolled and only 3 carry a real
   `role="progressbar"`. §2e fixed the colours; a primitive is what stops it recurring.
3. **A `lint:tokens` rule for quantity-vs-status.** Nothing currently catches a status tone on a
   percentage — `bg-warning-fill` reads as a legal semantic token, and the tone solver only checks the
   tokens' own contrast, not which one you picked. This is the gate that would have caught §2e at
   authoring time.
4. **PR 4** — the 236 landing literals, and delete `--accent` with its four call sites.
5. **The `100vh` → `100dvh` question**, which needs a Tailwind 3.3.5 → 3.4 bump. See §2d.

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
