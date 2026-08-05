# Ascenda — the colour guideline

**This is the durable document.** [colour-system-progress.md](./colour-system-progress.md) is a working
record of how we got here and [colour-system-remaining-prs.md](./colour-system-remaining-prs.md) is
delivery mechanics; both will go stale. This one is meant to be the answer to "what colour should this
be?" without reading either.

Every number here is **measured**, not modelled, and is verified by `node scripts/tone-solver.mjs`
(92 checks, exits non-zero on failure).

---

## 1. Positioning

Ascenda helps a sixteen-to-eighteen-year-old get into university. It is the tool in their hand, not the
institution they are applying to — which is why it does not use crest navy, and why nothing here is
decorated to look reassuring.

The three words the visual system has to earn, each tied to a rule rather than an adjective:

| word | what it actually means here |
|---|---|
| **elevated** | Restraint, not ornament. One accent, one hue per screen, chrome that recedes. If a screen looks expensive it is because almost nothing on it is competing. |
| **simple** | A student can tell what needs them in under a second. Colour is load-bearing, so it is spent only where it changes what someone does next. |
| **effective** | Every tone is solved for AA in both themes and re-verified by a script. An inaccessible interface is not a stylistic position. |

The audience constraint that overrides taste arguments, from NN/g: *teenagers don't want overly childish
content… ease up on heavy animations and garish colour schemes.* Do not infantilise them, and do not
address them as adults in a bank either.

---

## 2. The instrument ladder

**The governing idea: area is inversely proportional to how routine the meaning is.** The more ordinary
the information, the less surface it may occupy. A level is a licence, not a suggestion — most elements
in this app are licensed for level 0 or 1.

| level | instrument | area | use for |
|---|---|---|---|
| **0** | nothing | — | The default. Position, order, and a label already carry most meaning. |
| **1** | muted ink (`text-muted-foreground`) | glyph-sized | Secondary copy, metadata, "Complete". |
| **2** | brand ink (`text-primary-ink`) | glyph-sized | A link, an active label, one emphasised number. |
| **3** | outline chip (`border-*` + tone text) | a chip | A status that needs to be scannable in a list. |
| **4** | small tinted fill (`bg-*-subtle`, `bg-primary/10`) | a chip or a strip | A state that applies to a *region*, not a page. |
| **5** | solid fill (`bg-primary`, `bg-*-fill`) | one element | The primary action. A chart mark. Nothing else. |

**Climbing a level requires a reason you can say out loud.** "It looked flat" is not one — flatness is
fixed with the border and shadow ladders, which exist for exactly that and cost no colour.

---

## 3. The three caps

Conventions we chose, deliberately, to keep the system honest. **These are house rules, not sourced
research figures** — say so if anyone asks.

1. **One chromatic element per card.** A chart is *one* decision, not five marks — a five-series stacked
   bar is a single chromatic element because the reader parses it as one object.
2. **One solid fill per viewport.** If two things are both level 5, one of them is not the primary action.
3. **Non-neutral fill under 10% of a screen.** Measured, not estimated: `scratchpad/measure.py`, OKLab
   chroma > 0.045.

Where we actually are, measured from real screenshots across 20 screens × 2 themes:

| | light before → after | dark before → after |
|---|---|---|
| `/profile` | **11.08% → 1.14%** (−90%) | 1.61% → 1.11% |
| `/applications` | 9.27% → 1.30% | 9.38% → 1.40% |
| `/scholarships` | 6.71% → 0.86% | 6.82% → 1.40% |
| **20-screen mean** | **3.38% → 1.53%** (−55%) | **2.96% → 1.47%** (−50%) |

> An earlier artifact reported 36.5% → 2.95% from a layout model. The **ratio** was right; the absolute
> level was ~3× overstated. Use the measured figures above.

---

## 4. The three semantic rules

1. **`danger` and `warning` may not appear in the same comparison set.** Under deuteranopia they collapse
   to one olive at ΔE 6. **Do not fix this by darkening gold** — the lightness-solved answer is `#4a361c`,
   a mud brown, which is trap 1 in `tone-solver.mjs` wearing a disguise. It is handled *semantically*:
   red and gold never share a legend, a tier ladder, or a filter row.
2. **Selection is not status.** A selected row, an active tab, a chosen filter — these describe *the
   user's own pointer*, not the state of the data. They may tint (level 4) and they use the brand, never
   a tone.
3. **`success` is for terminal positive outcomes, never for "done".** An offer is `success`. A finished
   profile section is silent — it needs nothing from the reader, so it gets level 1 at most. Marking
   completion green is how five finished sections came to shout louder than the one unfinished one.

**Three tones, and do not add a fourth.** The test: *does this ask the reader to do something, or confirm
they no longer need to?* A position in a sequence, a type of thing, and a section of a form all fail it.
`info` and `feature` were deleted for failing it — `info` meant "in progress", which is the absence of a
state, and `feature` marked a category in a status hue.

```
danger  = urgent / overdue / reach       warning = todo / pending / match
success = done-and-good / submitted / safety
```

`--destructive` is separate and stays separate: it is for destructive **actions** (delete), not the rose
status tone. `danger` is still the tone for error *feedback*. They are not interchangeable.

---

## 5. The element register

Level licensed per element group. The exhaustive 81-row version lives in the artifact
`https://claude.ai/code/artifact/e677a474-96dd-4e43-942e-4c0b9d664dff`; this is the same doctrine at
category resolution, which is what you need at the keyboard.

### Surfaces
| element | level | note |
|---|---|---|
| Page background, card, subcard, popover | **0** | Neutral, always. A tinted card says "this whole thing is a state". |
| Modal / sheet / drawer | **0** | Elevation is the shadow ladder's job. |
| Card in a "needs action" state | **4**, left rail only | `border-l-4 border-l-primary` + one inset strip. Not a tinted surface. |
| Empty state | **0** | |

### Structure
| element | level | note |
|---|---|---|
| Border, divider, rule | **0** | `--border` is 1.47:1 on a card — an edge that exists without being a line. |
| Focus ring | **5** | `--ring`, an alias of `--primary`. The one place a loud brand is mandatory. |
| Category rail / ordinal registry | **0** | A category is not a status. Monochrome since PR 1. |
| Section nav, tab bar, breadcrumb | **0–2** | Active item gets brand *ink* + an underline, not a fill. |

### Type
| element | level | note |
|---|---|---|
| Body, heading | **0** | `--foreground`. |
| Secondary copy, metadata, caption | **1** | `--muted-foreground`. |
| Link, active label, one emphasised figure | **2** | `--primary-ink`. **Never `text-primary`** — see §7. |
| Eyebrow / uppercase label | **1** | |

### Icons and marks
| element | level | note |
|---|---|---|
| Utility icon (search, chevron, close) | **0–1** | |
| Icon inside a bubble | **0** | Bubbles are neutral. The icon is the signal, the container is not. |
| Status icon | **matches its tone's level** | Never colour an icon a tone the adjacent text does not also carry. |
| Mascot (Ascendi, rocket) | **exempt** | Fixed character colours, deliberately not `currentColor`. Allow-listed in `lint:tokens`. Do not tokenise — it would make the mascot change colour with the theme. |

### Status and badges
| element | level | note |
|---|---|---|
| Status chip in a list | **3** | Outline + tone text. Scannable without becoming a colour field. |
| Status chip needing more weight | **4** | `bg-{tone}-subtle`. |
| Solid tone badge | **5** | One per card. |
| "Complete" / terminal-neutral state | **1** | Silent. |
| Count / notification dot | **5**, glyph-sized | Area is the cap here, not level. |

### Controls
| element | level | note |
|---|---|---|
| Primary button | **5** | `bg-primary`. **Light: white label. Dark: near-black ink label.** |
| Secondary / ghost / tertiary button | **0–2** | |
| Destructive button | **5** | `--destructive`. |
| Input, select, textarea | **0** | `--input` boundary clears 3:1 (WCAG 1.4.11); `--border` deliberately does not and is not held to it. |
| Segmented control, filter pill, nav pill | **0** unselected, **4–5** selected | Selection, so brand — never a tone. |
| Toggle / switch | **5** when on | |

### States
| element | level | note |
|---|---|---|
| Hover | **0** | Solid `bg-muted`. ΔE 46 and visible; `bg-muted/60` measures ΔE 28, barely over the JND of 23. |
| Selected row | **4** | `bg-primary/10`. |
| Disabled | **0** | Opacity, not colour. |
| Loading / skeleton | **0** | |
| Error / validation | **3–4** | `danger`, and always with text — never colour alone. |

### Data
| element | level | note |
|---|---|---|
| Chart series | **5** | The `--series-1…5` ramp. One hue, five lightnesses. |
| Progress bar | **5** | Brand. Green only at a genuine terminal outcome. |
| Sparkline, meter | **2–5** | One mark emphasised, the rest level 1. |
| Table zebra striping | **0** | |

**Rule 9, which sits under all of the above: colour is never alone.** Every tone also owns a shape — a
rail, a chip outline, an icon, a rule. Roughly 8% of male users cannot separate two of our three tones;
the shape is what carries the meaning for them, and for anyone on a bad screen in sunlight.

---

## 6. The tokens

Both themes, in the exact format `src/app/globals.css` stores (`H S% L%`), so this is transcribable
without reinterpretation. Ratios are WCAG 2 against the **card** unless stated.

### Neutrals — achromatic, hue 0, saturation 0

| token | light | hex | dark | hex |
|---|---|---|---|---|
| `--background` | `0 0% 95.9%` | `#f4f4f4` | `0 0% 8.3%` | `#151515` |
| `--foreground` | `0 0% 10.7%` | `#1b1b1b` | `0 0% 93.4%` | `#eeeeee` |
| `--card` | `0 0% 100%` | `#ffffff` | `0 0% 12.5%` | `#202020` |
| `--popover` | `0 0% 100%` | `#ffffff` | `0 0% 19.7%` | `#323232` |
| `--secondary` | `0 0% 90.8%` | `#e7e7e7` | `0 0% 16.3%` | `#2a2a2a` |
| `--muted` | `0 0% 92.5%` | `#ececec` | `0 0% 16.3%` | `#2a2a2a` |
| `--muted-foreground` | `0 0% 41.8%` | `#6b6b6b` | `0 0% 70%` | `#b3b3b3` |
| `--border` | `0 0% 83.4%` | `#d5d5d5` | `0 0% 23.4%` | `#3b3b3b` |
| `--input` | `0 0% 55.5%` | `#8e8e8e` | `0 0% 41.5%` | `#6a6a6a` |
| `--shadow` | `0 0% 8%` | | `0 0% 1%` | |

Light `--muted-foreground` is 41.8% and not 42%: at 42% it measures 4.4993:1 on `--muted`, i.e. it fails.
Dark `--muted-foreground` is lifted to 70% from a solved floor of 60.1% — WCAG 2 overstates contrast at
the dark end, and at the floor this measured APCA **Lc 45** against a Lc 60 body-text requirement. At 70%
it is Lc 57 / WCAG 6.62:1 and still a clear step down from `--foreground`.

### Brand — periwinkle, OKLCH hue 275, chroma 0.215

| token | light | hex | ratio | dark | hex | ratio |
|---|---|---|---|---|---|---|
| `--primary` | `236.8 89.5% 66.1%` | `#5b64f6` | 4.58:1 vs white label | `232 100% 75.7%` | `#8394ff` | 6.82:1 vs ink label |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` | | `0 0% 6.9%` | `#111111` | |
| `--primary-ink` | `237.8 77.9% 61.8%` | `#5358ea` | 5.37:1 | `232.2 100% 75.2%` | `#8091ff` | 5.75:1 |
| `--ring` | *alias of `--primary`* | | | *alias of `--primary`* | | |
| `--accent` | `232.8 100% 73.9%` | | | `229.5 100% 85.4%` | | ⚠ see §7 |

**Lightness 0.58 light / 0.70 dark is not a taste call.** White text on this hue clears AA only at
L ≤ 0.58 — 4.58:1 at 0.58, 4.20 at 0.60, 3.53 at 0.64. It is also Discord's exact lightness, and the
floor of the range measured across the ten apps teenagers actually use (chroma 0.19–0.26, lightness
0.58–0.96, in OKLCH). The previous brand sat at L 0.48, below every app measured. **Weight is what reads
as corporate — not the hue, and not the saturation.**

### Chart ramp

| | light | ratio | dark | ratio |
|---|---|---|---|---|
| `--series-1` | `241.3 55.6% 42.3%` | 9.89:1 | `228.5 100% 93.3%` | 12.85:1 |
| `--series-2` | `241.1 60.2% 52.8%` | 7.45:1 | `229.5 100% 85.4%` | 9.38:1 |
| `--series-3` | `238.1 75.7% 61.1%` | 5.51:1 | `231.2 100% 78%` | 6.67:1 |
| `--series-4` | `236.1 100% 69.2%` | 4.11:1 | `234.5 100% 71.1%` | 4.52:1 |
| `--series-5` | `232.8 100% 73.9%` | 3.04:1 | `235.7 62.4% 58.6%` | 3.05:1 |

Every step clears 3:1 against its own card, or a stacked segment reads as a hole. Adjacent steps sit
**1.32–1.48:1** apart, which is about as good as one hue gets across five steps; the 2px surface-coloured
gap between segments is what separates them, not the colour delta. `--series-3` is deliberately **not**
an alias of `--primary` — pinning it forces the ramp symmetric about the brand and drops the minimum
adjacent step to 1.21:1.

### Status tones — unchanged by the palette change

A warning must not change meaning because the brand changed.

| tone | light text | ratio | light fill | ratio | light tint | dark text | ratio | dark tint |
|---|---|---|---|---|---|---|---|---|
| `success` | `156 75% 27.4%` `#117a50` | 5.33 | `156 65% 40%` `#24a873` | 3.02 | `158 96% 91%` `#d2feee` | `156 65% 50%` `#2dd290` | 8.37 | `156 61% 20.5%` |
| `warning` | `26 75% 37%` `#a55518` | 5.37 | `40 65% 45.2%` `#be8c28` | 3.00 | `47 94% 90%` `#fdf3ce` | `38 65% 61%` `#dcad5b` | 7.90 | `48 62% 20%` |
| `danger` | `356 75% 44.4%` `#c61c28` | 5.83 | `348 65% 62.2%` `#dd6079` | 3.48 | `348 100% 92.5%` `#ffd9e0` | `348 65% 69%` `#e37d91` | 5.90 | `353 43% 24%` |

`--{tone}-foreground` is `0 0% 10.7%` in both themes — tone fills are light surfaces in both.

**Text and tint hues are allowed to differ, and `warning` is why.** A dark yellow is olive at every
saturation, so the text sits at 26° while the tint stays a clean amber at 48°. Do not "correct" them into
agreement; that reintroduces the mud.

---

## 7. Do / don't, with real class strings

**Never put text on a solid `bg-primary` other than `--primary-foreground`.** That pair measured
**3.94:1** in dark under the old palette — a live AA failure on every solid button, invisible to the
verifier because its check hard-coded white and then short-circuited with `|| mode === 'dark'`.

```diff
- <button className="bg-primary text-white">          // fails in dark
+ <button className="bg-primary text-primary-foreground">
```

**Never use `text-primary` for text. Use `text-primary-ink`.** `--primary` is tuned for the *fill*. In
light it clears AA on a white card at 4.58:1 but measures **3.88:1 on `bg-muted`**, so it breaks the
moment the surface underneath changes.

```diff
- <span className="text-primary">{avg}% avg</span>    // 3.88:1 on a muted surface
+ <span className="text-primary-ink">{avg}% avg</span>
```

**Hover with a solid, not an alpha.** Alpha is a distance-from-surface multiplier, and `muted` is
surface-adjacent, so alpha on it does almost nothing: `bg-muted/10` is ΔE 5 and `bg-muted/40` is ΔE 19 —
both under the JND of 23, i.e. invisible.

```diff
- hover:bg-muted/40      // ΔE 19, under the JND — not there at all
+ hover:bg-muted         // ΔE 46
```

⚠ **The one exception, and it is the most important rule on this page.** When the hover sits on a row
that also has a **brand-tinted active/selected state**, keep `hover:bg-muted/60`. Measured as OKLCH L\*
on a white card: `bg-primary/10` is **95.7**, `bg-muted` **94.3**, `bg-border` **87.2**. Lower is heavier,
so a solid `bg-muted` hover is *heavier than the active state it is supposed to sit under* — hovering an
inactive row makes it look more selected than the selected one. `bg-muted/60` sits at roughly L\* 96,
above the active tint, and at **ΔE 28** it is still over the JND, so it is visible *and* subordinate.

This is not a taste call and it cannot be fixed from the neutral side: every usable neutral is heavier
than `bg-primary/10`, because a tint that carries text is capped at `/10` (see above). Either the hover
stays at `/60`, or the active state needs a second, non-fill signal — `ring-1 ring-primary/30` alongside
its tint, which is the shape `chip.tsx` uses.

**Do not reach for `bg-border` to fix this.** It is 1.24:1 from `bg-muted` and looks like a good
separator, but that measures distance from `muted`, not position relative to the active tint — it is the
heaviest neutral in both themes and makes the inversion worse, not better.

**And `/60` does not tell you which side of the interaction it belongs on.** This is the trap for the next
person who sweeps these values. `bg-muted/60` is now load-bearing in *two opposite directions*:

- as the **hover**, above a transparent rest — an inactive row lifting under the cursor;
- as the **rest**, below a solid `hover:bg-muted` — a chip that darkens on hover.

Both are correct locally, and a mechanical pass reading only "surface tokens take no alpha except `/60`"
will flatten them again. So before changing any `bg-muted/60`, read what the *other* state on that element
is. If the sibling is solid, `/60` is the rest; if the sibling is transparent, `/60` is the hover.

**Don't tint a card to mean "state".** Use the rail.

```diff
- <div className="surface-card bg-warning-subtle">
+ <div className="surface-card surface-card--action">   // border-l-4 border-l-primary
```

**Don't reach for a tone because something looks flat.** Use the border and shadow ladders.

**Don't use `bg-secondary` to separate two states.** `--secondary` is byte-identical to `--muted` in dark
and 1.04:1 away in light, so the "fix" renders identically and reads as working. For a selection or
highlight use `bg-primary/10`. For a neutral separator use `bg-border` (1.24:1 light / 1.30:1 dark against
muted — the best available; `bg-card` is 1.18/1.14).

⚠ **`bg-border` is a separator for tracks and icon chips only.** At 83.4% lightness it cannot carry
`text-muted-foreground` at AA in light: that pair is **3.64:1**, where the same text on `bg-muted` is
4.51:1 and just passes. An icon is fine (3.64:1 clears the 3:1 non-text threshold). If you move a
text-bearing chip onto `bg-border`, promote its ink to `text-foreground` in the same edit.

```diff
- data-[state=selected]:bg-muted/40  hover:bg-muted/20   // both collapse to bg-muted
+ data-[state=selected]:bg-primary/10  hover:bg-muted    // selection is brand-eligible
```

**Keep a border or ring one rung above its own fill.** `border-primary/10 bg-primary/10` composites to the
same colour: the edge disappears and the element just reads 1px larger.

```diff
- border-primary/10 bg-primary/10
+ border-primary/30 bg-primary/10
```

**Alpha on a text token is a contrast cut with no upside.** `text-muted-foreground` measures 1.50:1 at
`/30`, 2.44:1 at `/60`, 2.92:1 at `/70` — every rung fails AA; only solid passes, at 5.36:1. Same for
`stroke-*` and `fill-*`. The alpha ladder governs **tints**, never text.

**A tint that carries text caps at `/10`.** `text-primary-ink` on `bg-primary/N` over a white card:
`/10` = 4.73:1 pass, `/20` = 4.14 fail, `/30` = 3.60 fail. If such an element needs a hover, move it to
the border — raising the fill breaks the label.

**Dimming a solid fill is outside the ladder.** `bg-series-1` + `hover:bg-series-1/85` is dimming, not
tinting; there is no rung above solid, and dropping the rest to `/60` would break both the legend-to-bar
colour identity and any white label on it. Leave those off-ladder.

**Never write a gate that exempts a mode.** The `|| mode === 'dark'` above is the whole lesson: the
palette was wrong *and* the verifier was structurally unable to see it, while reporting success.

⚠ **`--accent` is not a colour to use.** It is the brand, lighter, kept alive only because
`from-primary to-accent` in `landing-preview/preview-hero.tsx` sits under `bg-clip-text text-transparent`
on the live homepage. Deleting the token would not error — Tailwind emits nothing for an unknown colour —
it would render the hero **headline invisible in production**. Do not add usages; it goes away in PR 4.

### Geometry, since it travels with colour

- Radius: one ladder bound to `--radius` — `rounded-lg` 10 · `xl` 14 · `2xl` 18 · `3xl` 24 · `4xl` 28.
  Never `rounded-[Npx]`.
- Buttons: `rounded-full`, hover `-translate-y-0.5`.
- Cards: `surface-card`, static by default; add `hover-lift` only if the whole card is clickable.
- No arbitrary values. `lint:tokens` ratchets `arbitrary-geometry` and it may only fall.

---

## 8. How to add or change a colour

1. **Design it in OKLCH, emit HSL.** Hold chroma, walk lightness. Naive HSL mixing goes muddy at the
   extremes, which is why Tailwind, Radix and Material 3 all generate scales perceptually. Helpers:
   `scratchpad/oklch.mjs` (OKLCH ↔ sRGB with gamut mapping, WCAG and APCA).
2. **Solve to the floor, not past it.** A token should be exactly as dark as its requirement *forces* and
   no darker. Darkness past 4.5:1 is chroma thrown away, and thrown-away chroma is what "muddy" means.
3. **Never solve a tint on luminance.** Luminance is near-blind to chroma, so maximising it rewards dark,
   dull tints. Tints are solved to a *target* chroma, uniform across the tones, because a tint family is
   judged as a set — per-tint chroma-maximising returned a 2× spread and a highlighter yellow.
4. **Update all four hand-synced copies.** Miss one and the failure is silent:

   | file | what |
   |---|---|
   | `src/app/globals.css` | the `:root` and `[data-theme='dark']` blocks |
   | `scripts/tone-solver.mjs` | the `TOKENS` table — **a hand-synced duplicate**. Change only globals.css and the verifier validates the *old* palette while reporting success. |
   | `src/app/layout.tsx` | `themeColor` hex — a meta tag cannot read a CSS var |
   | `src/components/theme/theme-provider.tsx` | `THEME_COLOR` hex, the client-side twin |

5. **Run the gates.** `node scripts/tone-solver.mjs` must exit 0 (92 checks; it is **manual**, not wired
   into CI, so run it deliberately). Then `npm run typecheck && npm run lint && npm run test &&
   npm run lint:tokens`, then `rm -rf .next && npm run build && npm run check:bundle`.
6. **Then look at it.** No gate catches three solid brand fills on one screen, or a card saying the same
   thing five times. `scratchpad/shoot.mjs` (20 screens × both themes) and `measure.py`.

### Traps that produce a green build and broken UI

- **Tailwind emits nothing for a deleted or unknown colour** — no error. Replace all usages, grep to 0,
  *then* delete the token.
- **A JSX comment cannot be a sibling in a `return (` or a ternary branch.** Put it above the `return`.
- **Never `npm run build` then `npm run dev` on the same `.next`** — the dev server dies with "Cannot
  find the middleware module". `rm -rf .next` between them.
- **`check:bundle` fails locally on `/wizard-preview`** — untracked, absent in CI. Park the directory to
  prove a clean pass.
- **`npm run lint` has zero headroom** — exactly 2 warnings against `--max-warnings 2`. Any stranded
  import fails CI.

---

## 9. Appendix — rejected directions

Recorded with their values so nobody re-litigates from scratch.

| direction | values | why not |
|---|---|---|
| **Oxford navy** | ~H 265, L 0.32 | Navy is what universities put in crests for heritage. Ascenda is the tool helping someone get in, not the institution. Also lost most of its distinctiveness once the serif was ruled out. |
| **"Avoid indigo — it looks AI-generated"** | — | Fighting the gamut. Indigo holds chroma 0.285 at L 0.48; teal tops out near 0.15 anywhere. That is *why* software clusters in blue-violet — and Discord is this exact hue. |
| **Periwinkle at L 0.64 with a darker pill** | C 0.205, L 0.64 | Gives white labels on the pill, but at the cost of two solid brand fills at two lightnesses with **opposite label colours on one card**. Reads as an accident. |
| **Warm paper** | H 70, C 0.010, card L 0.985 | The recommendation, not the choice. Rejected in favour of a true neutral, which fixes the hue collision without committing the product to warmth. |
| **Warmer paper** | H 70, C 0.018, card L 0.975 | Unambiguously cream. At this chroma the paper has an opinion, and an opinion competes with content. |
| **Paper at the brand's hue** | H 275, C 0.006 | The incumbent, and the defect: canvas and accent 4° apart, so the greys *were* the brand desaturated 36×. The screen read as one colour at five strengths and the accent took the blame. |
| **Gold darkened to fix the CVD collapse** | `#4a361c` | A mud brown — trap 1 in disguise. Handled semantically instead (§4 rule 1). |

### One finding worth keeping, because it will come up again

**A white card cannot be warm — the sRGB gamut forbids it.** At OKLCH lightness 0.995, the maximum
achievable chroma is **0.004 at every hue**: ask for 0.006 or 0.026 and you get the identical `#fffdfb`,
silently clipped. Card 0.985 is the highest lightness that delivers 0.010, and 0.975 the highest that
delivers 0.018. So chroma and card lightness are not independent dials, and any future "let's warm the
surfaces slightly" will do nothing at all unless the card also comes off pure white.
