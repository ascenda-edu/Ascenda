# Is Oxford the right palette? — research findings

> ## ⚠ SUPERSEDED — read [colour-system-progress.md](./colour-system-progress.md) §2 first
>
> This document rejected Oxford and recommended "Refined Indigo". The rejection of Oxford **stands**
> and its reasoning is still the best record of why. The recommendation does **not**: two later rounds
> found that
>
> 1. the axis that matters is **lightness, not hue** — Ascenda sits at L 0.48, below every one of the
>    ten apps teenagers actually use (floor 0.58), and
> 2. **Discord is the same hue** (274° vs 275°) at L 0.58, which defuses the "indigo looks AI" concern
>    entirely.
>
> The chosen direction is **Periwinkle**: hue 275°, chroma 0.215, L 0.58. Everything below is kept for
> the reasoning and the rejected options; do not act on its recommendation.

Written before PR 2, because PR 2 is the irreversible-feeling one: it is where the brand actually
changes. Question asked: is Oxford (deep navy on warm stone, gold as scarcity) right for a product
whose primary users are 16–18 year olds, and which should read modern, intuitive and effective?

**Short answer: the doctrine is validated, the hue is not. I now think Oxford is wrong for this
audience, and it is also weaker than it was when you approved it.**

---

## 1. The craft consensus validates the restraint, independent of hue

Every product renowned for interface craft runs a near-greyscale system with **one** accent used
sparingly:

- Stripe's dashboard is neutrals plus measured indigo. Linear's default theme is cool greys plus
  brand indigo. Vercel is near-monochrome plus context colour. Notion and Linear both run
  near-monochromatic core interfaces.
- The framing that matters: *"the identity is carried almost entirely by restrictions — the weights
  it never uses, the shadows it never casts, the second accent it never introduces."* And
  *"restraint reads as confidence."*
- Colour is for **meaning, not decoration**, which is the same rule Apple's HIG states: the power of
  colour to call attention is heightened when it is used sparingly.

**Conclusion:** the placement work already landed (PR 1, measured −55% light / −50% dark chromatic
area) is the part that makes this app read like a well-made product. That result does not depend on
which hue wins. Nothing here argues for changing course on the doctrine.

## 2. The "Gen Z wants maximalism" research does not apply to these screens

Sources report Gen Z gravitating to maximalism, saturated hues, neons, clashing palettes,
anti-design — and that bold, high-contrast palettes outperform muted ones *"by 67% in social
engagement."*

**That is a claim about social and marketing content, not about a utility tool.** The metric is
engagement with a feed, not comprehension of a deadline list. Ascenda's authenticated surfaces are
a profile form, an application board, a document tracker and a deadline monitor. Optimising those
for feed-style engagement would be a category error.

Where it *does* apply: the landing page (PR 4) and any future marketing. Worth remembering there —
the landing page is allowed to be louder than the app, and currently is (8.4% chromatic vs the app's
1.5%).

## 3. Duolingo — the best teen-facing comparator — already does what we did

Duolingo is super-saturated, and it is the obvious counter-example to restraint. Except:

1. **Every colour carries one specific meaning**: green success, red hearts, orange streaks,
   yellow XP, purple leagues. That is not decoration, it is a legend. It is the same discipline as
   our three tones, just with a bigger vocabulary earned by a bigger game layer.
2. **Critically:** *"the 'all-business' portions, like profile creation, are minimised and
   de-emphasized to an extreme."*

Ascenda is **almost entirely** the all-business portion. Duolingo spends its colour on the reward
layer and deliberately drains it from exactly the kind of screens Ascenda is made of. So the most
successful teen-facing product in the world supports the change we made, rather than contradicting
it.

**But it exposes a real gap — see §5.**

## 4. Navy is the wrong hue for this specific product

Colour-psychology sources are consistent, and consistently unhelpful for us:

- Navy signals *authority, tradition, stability, heritage, academic rigour, institutional gravitas*,
  and *"that almost old-fashioned sense of discipline."*
- It is *"the go-to shade for corporate and institutional sites where users expect seriousness"* and
  is *"strongly associated with conservative politics, finance, and traditional education."*
- **Universities adopt navy specifically to signify heritage** — in crests and official seals.

That last point is the problem. **Ascenda is not a university. It is the tool that helps a
seventeen-year-old get into one.** Dressing the helper in the target institution's visual language
makes the ally look like the gatekeeper — and for a teenager, navy-and-gold is the prospectus, the
admissions office, the thing that might reject them. It is the wrong side of the desk.

Trust matters here — this is a high-stakes decision — but the edtech research locates trust in
*consistency, transparency and predictability*, not in institutional colour: consistency across
screens builds trust, and *"trust grows when learners feel supported, not overwhelmed."* We get the
credibility from the system we just built, not from navy.

## 5. And Oxford is weaker than when it was approved

Oxford's premium read was substantially carried by **Source Serif 4**. That was ruled out — Outfit
stays — which is a reasonable call on bundle and scope, but it removes roughly half of what made
Oxford distinctive. What remains is navy on warm stone with a gold accent: perfectly decent, and no
longer the thing that was presented.

Two further costs already known: it is the only direction that flips neutral temperature between
themes (warm light, cool dark), and gold is doing double duty as both warning and achievement.

## 6. The gap nobody asked about: there is now no reward anywhere

Duolingo's lesson is not "use lots of colour", it is **"spend colour on progress."** Visible progress
is among the strongest motivators measured (Amabile; Kivetz on the goal-gradient effect), and this is
a five-step form a student is meant to finish.

PR 1 removed the green completion flood — correctly, it was inverted against attention. But it did
not add anything in its place, and it also neutralised the completion card's celebration. The
progress bar and step count survive at full strength, which was the argument at the time, and that
is genuinely the mechanism. Still: **there is now no moment of delight in the product at all.**

That is a product gap, not a palette gap, and it should not be solved by re-tinting cards. Options
worth considering separately: a brief celebratory moment on the *transition* to complete (the
`celebrate` state already exists in `ProfileProgressCard`), a streak or momentum signal, or making
the progress bar itself more expressive. Deliberate, bounded, and on the reward layer — not on
resting surfaces.

---

## Recommendation

**Keep the doctrine. Change the hue to something modern rather than institutional.**

The strongest candidate is now **Refined Indigo** — the direction previously framed as the control:

- Indigo/violet is the dominant hue of contemporary software (Linear, Stripe, Discord, Notion
  accents). To a teenager it reads *modern app*, which is what Ascenda is, rather than *institution*,
  which it is not.
- The loudness problem was **placement, and placement is already fixed** — measured, not asserted.
  So the hue no longer has to compensate for anything.
- It keeps Ascendi the mascot, the landing gradients and existing brand recognition, which makes
  PR 2 dramatically smaller: retune saturation, apply the APCA dark lifts, collapse
  `--accent`/`--ring`/`--series-3`, and stop. No mascot recolour, no landing rework.
- Its original weakness — *"it will not feel like a new brand"* — is much less of an objection now,
  because PR 1 already delivered the felt change.

**Worth testing before committing:** whether the indigo should be tuned *younger* (a touch brighter
and cooler, more electric) rather than merely quieter. The originally solved Refined Indigo dropped
saturation 65 → 46, which was calibrated to fight a loudness problem that no longer exists. With
placement solved, it may want to be more vivid than that, not less.

**Not recommended:** Quiet Ascent (teal). It is distinctive, but its central idea — "done" is the
brand colour — now collides with the implemented rule that `success` means terminal positive
outcomes and completion goes silent. It would need re-deriving.

**Graphite** remains the most Apple-correct and the coldest; it is the right answer for a pure tool
and the wrong one for a product a nervous teenager opens.
