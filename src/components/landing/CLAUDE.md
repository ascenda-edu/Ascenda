# Landing page (pre-login) — premium design rules

Scope: `src/components/landing-preview/` (where the live landing page's own components live — the folder keeps its build-time name), this directory (`src/components/landing/`, now shared sections and widget mocks only) and `src/app/page.tsx`. These rules bias the public marketing/hero page toward a premium agency feel — editorial typography, scroll-triggered motion, restraint over decoration. Target: looks like a $2k+ client site, not a template.

These are design rules layered on top of the root CLAUDE.md — project conventions (Framer Motion, Outfit/Inter fonts, existing card/button patterns, `@/*` alias) still apply.

## Hero section

The hero is the first 100% of the viewport. It carries the entire feel of the site.

- Video background (looped, muted, autoplay, `playsInline`) when one exists; otherwise an animated gradient or a single high-quality image with subtle motion.
- Always add a 25–35% dark overlay between a media background and foreground text for readability.
- Headline: 5–9 words max, large display font (`font-heading`), tight letter spacing.
- ONE primary CTA. Never two competing ones.

## Motion

Project uses **Framer Motion** (`framer-motion`), wrapped in `<MotionConfig reducedMotion="user">` — keep using it (do not install the `motion` package).

Default scroll-triggered reveal:

```jsx
<motion.div
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-100px" }}
  transition={{ duration: 0.45, ease: "easeOut" }}
>
```

Rules:
- Subtle over loud. 24px translation max, **0.4–0.5s duration** (was 0.6–0.8 — the page reads as sluggish at that length now that every section reveals; the polish pass tightened the whole reveal band).
- Always `viewport={{ once: true }}` — no replay on scroll-back.
- Animate `transform` and `opacity` only, never layout properties.
- Stagger siblings at ~0.08s, not 0.12 — the group should land together, not queue up.
- Scroll-driven scrubs are **one-way**. Pipe the raw `useScroll` progress through `useLatchedProgress` (`landing-preview/ascent-scroll.tsx`) before springing or transforming it: the value only ever climbs, so nothing un-reveals when the visitor scrolls back. This is the scrub-side equivalent of `once: true`.
- Pinned bands release their pin once completed — `PinnedStage` (`landing-preview/pinned-stage.tsx`) handles it, so anything built on it inherits the behaviour. Never hand-roll a band that re-scrubs (or rewinds) on the way back up.
- A pinned band whose settled frame differs from its final scrubbed frame must supply a `settled` tree. `PinnedStage`'s default re-renders the scrubbed tree un-gated, which is right only when the resting frame IS the last frame of the scrub — a stepper or a swapper ends on a frame that hides most of the section, and leaving a visitor on it loses content.
- A pin must never arm on a section the visitor has already reached. Arming grows the document; doing that under someone, or swapping the presentation in front of them, is a visible jump. `PinnedStage` samples this once at mount (still below the fold, `pinQuery` matches) and otherwise keeps the settled tree for the session.
- If motion feels jerky rather than fast: soften easing to `ease: [0.22, 1, 0.36, 1]` (cinematic) and cut the travel distance. Reach for a longer duration only for a deliberate hero moment, never for a section reveal.

Patterns to reach for: word-by-word headline reveal on first paint, parallax on hero background (`useScroll` + `useTransform`), slow push-in baked into the video file (not CSS).

## Typography

Project fonts stay: **Outfit** for headings (`font-heading`), **Inter** for body. Never load extra weights when 2 will do; max 3 fonts on a page.

Sizes:
- Display headline: 72–96px desktop, 40–48px mobile — never below 40px on desktop.
- Section heading: 40–56px desktop, 28–32px mobile.
- Body: 16–18px desktop, 16px mobile, line-height 1.55–1.65.

## Color

- Never pure black `#000000` or pure white `#FFFFFF` backgrounds — use near-black (`#0A0A0F`) / warm off-white (`#F8F7F4`) equivalents within the existing Ascenda palette.
- Muted text: `#5A5A66`-class greys on light, `#9C9CA8` on dark.
- ONE saturated accent per composition. Never two competing accents.

## Anti-patterns (never on the landing page)

- Stock-photo backgrounds (prefer AI-generated or product-real visuals)
- Two competing CTAs in the hero
- Auto-playing carousels
- Pop-ups before the user has scrolled
- Loading spinners longer than 1 second
- Animations on every element
- Generic Tailwind starter-template look

## Component hygiene

One file per section; if a section grows past ~80 lines of JSX, split it. Imported/inspired components get restyled to match the Ascenda palette and fonts — components are inspiration material, not locked-in templates.

## Visual asset generation (Nano Banana 2 / Google AI Studio)

When Greg wants a hero image, illustration, or any visual asset for the landing page, **write the generation prompt for him** — never ask him to write it. He gives a casual one-line brief; expand it into a complete prompt covering:

- **Subject** — the focal object
- **Lighting** — direction, hardness, color temperature
- **Mood** — cinematic, editorial, gritty, soft
- **Composition** — rule of thirds, centered, off-center, depth of field
- **Aspect ratio** — 16:9 for hero, 1:1 for square, 9:16 for mobile-vertical
- **Style cues** — "cinematic film still", "editorial photography", "matte 3D render"

He pastes it into Google AI Studio with Nano Banana 2 selected and generates 3–4 variations.

**Settings vs prompt:** aspect ratio and resolution are controlled by the **right-side panel** in Google AI Studio, not the prompt. Always remind him to (1) set the aspect ratio in the panel to match the prompt, and (2) bump resolution to **4K** (default is lower). Keep the aspect ratio in the prompt too — it's honored better when reinforced — but the selector controls the actual output dimensions.

## Motion / video prompts (Kling AI)

Same pattern for animating a still into a video. He uploads the image to Kling; you write the **motion prompt**:

- **One motion only** per prompt (multiple motions confuse the model)
- Duration: 5 seconds, looped
- Camera move in plain words (slow push-in, gentle pan-right, subtle parallax)
- State "make it loop" explicitly

For ambitious shots (scene morph, start frame + end frame), use Kling's "Image-to-Video with End Frame" — generate a second image as the end frame, then stitch the clips together inside the project, no external editor needed.
