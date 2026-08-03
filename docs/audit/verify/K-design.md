# Lane K — design system, accessibility, UX

Branch: `security/phase0-contain` @ `40cb781`. Read-only lane; no file under `src/`,
`supabase/` or `__tests__/` was touched. No `git checkout`/`stash`/`reset`. No
`npm test` / `npm run build` / dev server.

## Summary

**Counts: 1 × P1, 4 × P2, 8 × P3. One regression.**

**Executed vs inferred: 54 of 63 claims executed** — `lint:tokens`, 13 probes against
the *compiled* stylesheet `.next/static/css/014142ebf9a61743.css` (built 12:10, after
HEAD's 11:40 commit, so it reflects this branch), a glob-orphan script, ~25 `rg`
sweeps, per-finding `git diff origin/main...HEAD` provenance, package version reads.
Inferred: the *visual* consequence of the missing CSS, the PageHero clipping geometry,
contrast ratios (from `globals.css`'s own verified table), screen-reader behaviour.
Two breadth sweeps went to sub-agents for *location* only, every claim re-verified by
me; one — "no skip link targets `#main-content`" — was **refuted**
(`app/layout.tsx:76` + `shell.tsx:61` are both correct), filed under "found clean".

**The headline is K-1.** `tailwind.config.ts` is byte-identical to `origin/main`, but
the branch moved six `.tsx` files out of `src/app/parent/` (covered by `./src/app/**`)
into `src/features/parent/ui/` — which appears in no content glob, in no config file
at all. Five utilities used only there are provably absent from the compiled CSS:
parent-portal chat bubbles lose their 75 % width cap and the composer's focus ring
falls back to Tailwind's default blue. Trap #8, and the second time this exact bug has
landed here — the `./src/lib/**` entry carries a comment describing the identical
failure. `lint:tokens` cannot see it: it walks `src/` recursively, so it lints files
Tailwind never compiles.

Otherwise the system is healthy, mostly *pre-existing* healthy — `globals.css`,
`tailwind.config.ts` and `lib/utils.ts` are all unchanged here. The branch added
**zero** palette literals, `dark:` colour variants, `text-primary`-as-copy and
`rounded-[Npx]`; it net-*removed* z-index debt (−5 `z-10`) and added one
`min-h-[44px]` tap-target floor. Of the eight traps, seven are clean — opacity scale
(independently re-derived, matching `dead-opacity: 0`), class/colour collisions,
tailwind-merge, layer specificity (**actively defended** in `section-nav.tsx`),
`space-y`, Radix controlled-ness (all 13 `<Dialog>` sites pass `open` *and*
`onOpenChange`), and overflow clipping bar one hit (K-2). Accessibility beats
expectations: correct landmarks, a working skip link, a `DialogTitle` on all 13
dialogs, hand-wired focus-restore in `DialogContent`, `prefers-reduced-motion` in
three independent layers, all 23 icon-only controls named, **not one** `onClick` on a
non-interactive element. The two real gaps are **K-10** (four unlabelled controls in
the profile intake wizard — the core student flow) and **K-3** (no combobox/listbox
ARIA on the command palette).

**`<Select>` call-site count: 10 importing files, 17 `<Select>` JSX roots.** The "10"
in the code comment and the lane spec counts *files*. No `<SelectItem value="">`
exists, and **nothing would fail loudly** if one were added — see K-6.

---

## Findings

### K-1 — `src/features/**` is outside every Tailwind `content` glob, so five utilities used only by the parent portal are absent from the compiled CSS
Severity: **P1** (wrong behaviour visible to a user on five routes)
Location: `/Users/gregfranck/Ascenda/tailwind.config.ts:63-74` (the `content` array);
consumers `/Users/gregfranck/Ascenda/src/features/parent/ui/parent-thread.tsx:114,131,139,143,182`
and `/Users/gregfranck/Ascenda/src/features/parent/ui/child-switcher.tsx:92`
Regression?: **YES** — every one of these classes compiled on `origin/main`.

Evidence:

`tailwind.config.ts` is unchanged by this branch, and lists only four globs:

```
$ git diff --stat origin/main...HEAD -- tailwind.config.ts src/app/globals.css src/lib/utils.ts
(no output — all three unchanged)

$ rg -n 'features' tailwind.config.ts next.config.mjs postcss.config.mjs tsconfig.json
(no matches)

$ find . -maxdepth 2 -name 'tailwind*' -not -path './node_modules/*'
./tailwind.config.ts            # single config; tailwindcss 3.3.5; postcss.config.mjs has no overrides
```

The branch moved six class-bearing `.tsx` files out of the covered `./src/app/**`
glob:

```
$ git diff --name-status origin/main...HEAD -- src/app/parent src/features
R097  src/app/parent/_components/child-switcher.tsx   -> src/features/parent/ui/child-switcher.tsx
R098  src/app/parent/finances/_cost-explorer.tsx      -> src/features/parent/ui/cost-explorer.tsx
R098  src/app/parent/deadlines/_deadline-groups.tsx   -> src/features/parent/ui/deadline-groups.tsx
R100  src/app/parent/_components/no-linked-children.tsx -> src/features/parent/ui/no-linked-children.tsx
R098  src/app/parent/messages/_parent-thread.tsx      -> src/features/parent/ui/parent-thread.tsx
R093  src/app/parent/progress/_progress-board.tsx     -> src/features/parent/ui/progress-board.tsx
```

A script (`scratchpad/glob-check.mjs`) that extracts Tailwind candidates from every
file outside the globs and subtracts every candidate that also appears anywhere in
the 423 covered files returns exactly five real utilities (the other five hits —
`lowercase`, `order-of-magnitude`, `static-rate`, `text-matched`, `text-search` —
are prose/identifiers in `.ts` files with no JSX):

```
covered files: 423 | orphan files: 23 | candidates appearing ONLY outside the globs: 10
  focus:ring-ring                src/features/parent/ui/parent-thread.tsx
  max-w-[75%]                    src/features/parent/ui/parent-thread.tsx
  min-w-[180px]                  src/features/parent/ui/child-switcher.tsx
  sm:min-h-[560px]               src/features/parent/ui/parent-thread.tsx
  text-primary-foreground/60     src/features/parent/ui/parent-thread.tsx
```

Confirmed against the **compiled stylesheet**, not inferred. `.next/static/css/`
is dated 12:10, after the HEAD commit at 11:40:

```
$ CSS=.next/static/css/014142ebf9a61743.css   # 152,421 bytes
focus\:ring-ring                         0 occurrence(s)   <-- dead
focus\:ring-2                            1 occurrence(s)   <-- compiles (used elsewhere)
focus-visible\:ring-ring                 2 occurrence(s)   <-- compiles (used elsewhere)
max-w-\[75\%\]                           0 occurrence(s)   <-- dead
min-w-\[180px\]                          0 occurrence(s)   <-- dead
min-w-\[200px\]                          3 occurrence(s)   <-- control: compiles
min-h-\[560px\]                          0 occurrence(s)   <-- dead
min-h-\[480px\]                          1 occurrence(s)   <-- control: SAME source line, compiles
text-primary-foreground\/60              0 occurrence(s)   <-- dead
text-primary-foreground                  9 occurrence(s)   <-- control: compiles
```

The `min-h-[480px]` / `min-h-[560px]` pair is the decisive control: both are on
`parent-thread.tsx:114`, in one `className`. The first compiles because
`min-h-[480px]` also appears under `src/app`; the second does not appear anywhere
else and is dead. Tailwind is not scanning the file.

The same classes on `origin/main`, where they *were* inside `./src/app/**`:

```
$ git show origin/main:src/app/parent/messages/_parent-thread.tsx | grep -n 'max-w-\[75%\]\|focus:ring-ring\|sm:min-h-\[560px\]\|text-primary-foreground/60'
114:  ... rounded-2xl border border-border bg-card sm:min-h-[560px]">
131:  'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
139:  <span className={cn('text-label', isParent ? 'text-primary-foreground/60' : ...
143:  <CheckCheck className="h-3 w-3 text-primary-foreground/60" aria-hidden />
182:  ... focus:outline-none focus:ring-2 focus:ring-ring"
$ git show origin/main:src/app/parent/_components/child-switcher.tsx | grep -n 'min-w-\[180px\]'
92:   ... z-sticky mt-1 min-w-[180px] overflow-hidden rounded-xl ...
```

Repro: sign in as a parent, open `/parent/messages`.
- `parent-thread.tsx:131` — every message bubble loses its 75 % width cap and spans
  the full column, so the sender-side `justify-end` / `justify-start` distinction
  that carries "who said this" collapses. This is the visible one.
- `parent-thread.tsx:182` — the composer has `focus:outline-none focus:ring-2`
  (both compile) but not `focus:ring-ring`. The native outline is removed and the
  ring falls back to Tailwind's preflight default `--tw-ring-color`
  (`rgb(59 130 246 / 0.5)`, blue-500/50) instead of `--ring` indigo. Focus is still
  *visible*, so this is off-token rather than an a11y failure — but it is precisely
  the failure mode `tailwind.config.ts:67-72` already documents having shipped once
  (`ring-primary/25` falling back to default blue).
- `parent-thread.tsx:114` — panel min-height stays 480 px at `sm`+ instead of 560 px.
- `parent-thread.tsx:139,143` — timestamp and read-receipt inherit the bubble's full
  `text-primary-foreground` instead of 60 % opacity; cosmetic de-emphasis lost.
- `child-switcher.tsx:92` — the switcher dropdown loses its 180 px floor and shrinks
  to content width (compounds K-2).

Fix: add `'./src/features/**/*.{js,ts,jsx,tsx,mdx}'` to `content` in
`tailwind.config.ts`. Given `src/features` is described in
`src/features/parent/README.md` as a pilot for further slices, prefer collapsing the
four entries to `'./src/**/*.{js,ts,jsx,tsx,mdx}'` so the next `git mv` cannot
reintroduce this.

Test: the gap is structural, so gate it structurally rather than per-class. Add to
`scripts/check-design-tokens.mjs` (which already walks all of `src/`) a rule that
fails when a file it scans is not matched by any glob in `tailwind.config.ts`'s
`content` array. Break it by deleting the `./src/lib/**` entry and confirm red.
A unit-test form: assert that the set of directories under `src/` containing a file
with a `className=` attribute is a subset of the directories the `content` globs
match. Either fails today and passes after the one-line config change.

---

### K-2 — the child-switcher dropdown is clipped by `PageHero`'s `overflow-hidden`
Severity: **P2** (a control is unusable, but only for parents with ≥2 linked children)
Location: `/Users/gregfranck/Ascenda/src/components/layout/page-hero.tsx:112` and
`:165-169`; `/Users/gregfranck/Ascenda/src/features/parent/ui/child-switcher.tsx:71,92`
Regression?: **NO** — identical structure on `origin/main`.

Evidence: `PageHero`'s root carries `surface-card` *and* an explicit
`overflow-hidden`:

```
page-hero.tsx:112   'surface-card text-foreground overflow-hidden p-5 sm:p-6',
```

`.surface-card` itself already sets `overflow-hidden`
(`src/app/globals.css:386`). The `actions` slot renders **inside** that element,
in the left column below the description:

```
page-hero.tsx:165-169
  {actions ? (
    <motion.div className="flex flex-wrap gap-2 pt-1" variants={fadeUp}>
      {actions}
```

and all five parent routes pass `ChildSwitcher` through it:

```
$ rg -n 'ChildSwitcher' src/app/parent
parent/page.tsx:111            <ChildSwitcher .../>          (inside actions={<>…</>})
parent/finances/page.tsx:69    actions={<ChildSwitcher .../>}
parent/messages/page.tsx:58    actions={<ChildSwitcher .../>}
parent/deadlines/page.tsx:63   actions={<ChildSwitcher .../>}
parent/progress/page.tsx:57    actions={<ChildSwitcher .../>}
```

The dropdown's containing block is `child-switcher.tsx:71` (`<div className="relative">`),
which is a descendant of the hero — so the hero's `overflow-hidden` clips it.
`z-sticky` does not help; `z-index` has no effect on overflow clipping.

Repro: a parent with two or more `guardian_links` rows opens `/parent` and clicks
the child chip. The listbox opens `top-full mt-1` from a row that sits ~20 px
(`p-5`) above the hero's bottom edge, so only a few pixels of the first option are
painted. The parent cannot switch child from any of the five parent routes.
Pre-existing, but K-1 makes it worse: `min-w-[180px]` is also dead, so what little
shows is also narrower than intended.

Fix: portal the listbox (the app already depends on `@radix-ui/react-dialog` and
`@radix-ui/react-select`; `@radix-ui/react-popover` or a `SelectPrimitive`-based
rewrite would inherit the portal, the focus management and the arrow-key roving for
free). Minimal alternative: drop `overflow-hidden` from `page-hero.tsx:112` and give
the decorative children their own clipping wrapper.

Test: render `<PageHero actions={<ChildSwitcher …/>} />` with two children, open the
dropdown, and assert the nearest scroll/overflow ancestor of the `role="listbox"`
node is not the hero — i.e. walk `parentElement` up to the hero and assert no
ancestor has computed `overflow` other than `visible`. Fails now, passes portalled.

---

### K-3 — the command palette drives a virtual cursor with no combobox/listbox ARIA
Severity: **P2** (feature is unusable with a screen reader)
Location: `/Users/gregfranck/Ascenda/src/components/layout/command-palette-dialog.tsx:262-272`
(the input) and `:278-330` (the results list)
Regression?: **NO** — `origin/main:src/components/layout/command-palette.tsx` had the
same gap. The file is new on this branch (360 insertions, split out for lazy
loading) but the ARIA shape was carried over unchanged.

Evidence:

```
$ rg -n 'role=|aria-|activeIndex' src/components/layout/command-palette-dialog.tsx
168:  const [activeIndex, setActiveIndex] = useState(0);
240:      const cmd = flat[activeIndex];
251:  ...comment: Radix wires aria-labelledby...
261:  <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
269:  aria-label="Search commands"
295:  const isActive = flatIndex === activeIndex;
314:  <Icon className="h-3.5 w-3.5" aria-hidden />
```

There is no `role="combobox"`, no `aria-expanded`, no `aria-controls`, no
`role="listbox"`, no `role="option"`, no `aria-selected`, no `aria-activedescendant`
and no `aria-live` result count. Focus stays in the `<input>` while `activeIndex`
moves a purely visual highlight over `<button>` elements.

For comparison, `origin/main`'s version had the same absence
(`role="dialog"`/`aria-modal`/`aria-label` on the wrapper and `aria-label` on the
input, nothing on the list) — so this is carried-over debt, not new. The team clearly
knows the pattern: `child-switcher.tsx:89-99` does use `role="listbox"` /
`role="option"` / `aria-selected`.

Repro: open Cmd/Ctrl+K with VoiceOver, type `mat`, press ↓ twice, press Enter. The
screen reader announces nothing between keystrokes and the user activates a command
they were never told about.

Fix: `role="combobox" aria-expanded aria-controls="cmdk-list"
aria-activedescendant={activeId}` on the input; `role="listbox" id="cmdk-list"` on
the scroll container at `:278`; `role="option" id={…} aria-selected={isActive}` on
each result button. Keep them `<button>`s or make them `<div role="option">` — either
works, but `aria-activedescendant` requires stable per-item `id`s.

Test: render the palette, type a query, fire two `ArrowDown`s, and assert
`input.getAttribute('aria-activedescendant')` equals the `id` of the element with
`aria-selected="true"`, and that exactly one option has it. Fails now.

---

### K-4 — `hover-lift` on the non-interactive PageHero stat tiles, on every student-facing page
Severity: **P2** (false affordance, app-wide)
Location: `/Users/gregfranck/Ascenda/src/components/layout/page-hero.tsx:190`
Regression?: **NO** — `page-hero.tsx` is not in this branch's diff.

Evidence:

```
page-hero.tsx:186-191
  <motion.div
    key={stat.label}
    // surface-stat + hover-lift, not a hand-rolled copy of both.
    className="surface-stat hover-lift min-w-0 !p-3"
    variants={statVariants}
  >
```

The element is a `motion.div` with no `onClick`, no `href`, no `role`, no `tabIndex`,
and no interactive descendant — its children are three `<p>`s. `.hover-lift` is
defined as the *opt-in for cards that are actually clickable*
(`src/app/globals.css:330-335`), and the rule of record is "`surface-card` STATIC by
default; add `hover-lift` only if clickable."

`PageHero` is the shared header on every student-facing page (`CLAUDE.md`), so every
stat tile in the app lifts and casts `shadow-e-2` on hover while doing nothing when
clicked.

Repro: hover any stat tile in any page hero — it lifts 2 px and gains elevation;
clicking does nothing.

Fix: delete `hover-lift` from `page-hero.tsx:190`.

Test: a DOM assertion in the `PageHero` test — render with `stats`, and assert no
element carrying `hover-lift` also lacks `onclick`/`href`/`role="button"`. Better as
a lint rule so it holds for the whole tree (see K-8, same class of defect).

Note: `page-hero.tsx:190` also uses `!p-3`, an `!important` override, while
`:107-111` carries a comment explaining at length that `!important` is *not* needed
because utilities outrank components. The comment and the code disagree; the comment
is right (`!p-3` and `p-3` behave identically here). P3 tidy-up, folded in here.

---

### K-5 — a retracted claim about Radix is still asserted in five source files and two test files, including one test's name
Severity: **P3** (a future author will trust it and ship K-6's failure mode)
Location: `/Users/gregfranck/Ascenda/__tests__/profile/intake-options.test.ts:116`;
`/Users/gregfranck/Ascenda/__tests__/profile/intake-form/intake-form.characterization.test.tsx:1983-1986`;
`/Users/gregfranck/Ascenda/src/components/scholarships/scholarship-explorer.tsx:191`;
`/Users/gregfranck/Ascenda/src/components/toolbox/deadline-timeline-tool.tsx:~208`;
`/Users/gregfranck/Ascenda/src/app/counsellor/universities/_universities-client.tsx:491,503`;
`/Users/gregfranck/Ascenda/src/components/chat/shared.tsx:327,344`;
`/Users/gregfranck/Ascenda/src/app/profile/_components/StudentIntakeForm.tsx:~1327`
Regression?: **NEW** — `select.tsx`'s corrected docblock was written by this branch
(commit `da1f438`), and the correction was not propagated.

Evidence: `src/components/ui/select.tsx:63-68`, added by this branch, states the
claim is false and says a reviewer disproved it:

> An earlier version of this comment claimed Radix forbids an empty-string
> `SelectItem` value, making `''` unreachable "by construction". **That is false**
> for the installed `@radix-ui/react-select@2.3.7`: no such invariant exists, and
> `hasEmptyValueOption` in its source exists precisely to SUPPORT empty-value items.

Installed version confirmed: `node -p "require('./node_modules/@radix-ui/react-select/package.json').version"` → `2.3.7`.

Yet the retracted claim survives verbatim elsewhere, most damagingly as an assertion
*name*:

```
__tests__/profile/intake-options.test.ts:116
  it("never offers '' as a value — Radix forbids it on SelectItem", () => {

__tests__/profile/intake-form/intake-form.characterization.test.tsx:1983-1986
  * FIXED. `src/components/ui/select.tsx` now swallows `onValueChange('')` at the
  * wrapper, for every Select in the app. That is safe by construction: Radix
  * itself forbids an empty-string `SelectItem` value, so `''` is unreachable
  * through user interaction and every such event is this artefact.
```

Per AUDIT-PROMPT §8, "where a document and the code disagree, the code is the fact —
and the disagreement is itself a finding."

Repro: an author reads `_universities-client.tsx:491` ("Radix refuses an empty item
value"), concludes a sentinel is unnecessary in their new component, ships
`<SelectItem value="">`, and it silently does nothing.

Fix: reword the seven sites to the accurate reason — *this app uses a sentinel
because the wrapper swallows `''`* — and rename the test to what it actually checks:
`"never offers '' as a value — the Select wrapper swallows onValueChange('')"`.

Test: none needed; this is comment/name accuracy. The enforcement gap is K-6.

---

### K-6 — nothing fails loudly if `<SelectItem value="">` is added; the only guard covers 3 tables in 1 file
Severity: **P3** (latent; the recorded decision explicitly accepts it)
Location: `/Users/gregfranck/Ascenda/src/components/ui/select.tsx:92-95`;
guard at `/Users/gregfranck/Ascenda/__tests__/profile/intake-options.test.ts:116-122`
Regression?: **NO** — this is the recorded known-open item. **Not fixed, as instructed.**

**Answer to the two questions this lane was asked to settle:**

**1. Call-site count.** It is **10 importing files** and **17 `<Select>` JSX roots**.
The comment's "all 10 current call sites" and the lane spec's "10 current call sites"
are counting *files*. Given this audit's history with counts (the ratchet that
claimed 166 when the truth was 198), the ambiguity is worth resolving in the comment.

```
$ rg -l "from '@/components/ui/select'" src        -> 10 files
src/app/admin/_components/import-panel.tsx
src/app/appointment/page.tsx
src/app/counsellor/universities/_universities-client.tsx
src/app/profile/_components/StudentIntakeForm.tsx
src/components/applications/cross-application-tasks.tsx
src/components/applications/documents-manager.tsx
src/components/chat/shared.tsx
src/components/scholarships/scholarship-explorer.tsx
src/components/toolbox/deadline-timeline-tool.tsx
src/features/parent/ui/cost-explorer.tsx

$ rg -n '<Select$|<Select ' src --glob '!src/components/ui/select.tsx' | grep -v 'SelectTrigger|SelectContent|…'
-> 17 roots (StudentIntakeForm 7, scholarship-explorer 2, the other 8 files 1 each)
```

No `<SelectItem value="">` exists anywhere in `src/` — the only two matches are the
prose in `select.tsx`'s own docblock. Every empty option uses a sentinel: `CLEAR`
(`= '__clear'`, `StudentIntakeForm.tsx:91`), `'all'`, or `'any'`. The premise of the
recorded decision still holds.

**2. Would anything fail loudly?** **No.** There is no ESLint rule, no entry in
`scripts/check-design-tokens.mjs`, no `dependency-cruiser` rule, no `knip` rule and
no test that inspects `SelectItem` values:

```
$ rg -n 'SelectItem|value=""' scripts/ eslint.config.mjs .dependency-cruiser.cjs knip.json
(no matches)
$ rg -ln 'ui/select|SelectItem|onValueChange' __tests__
__tests__/profile/intake-options.test.ts
__tests__/profile/intake-form/intake-form.characterization.test.tsx
```

The single guard is `intake-options.test.ts:116-122`, which loops over exactly three
arrays — `ENGLISH_TEST_OPTIONS`, `ENGLISH_STATUS_OPTIONS`, `ADMISSIONS_TEST_OPTIONS`
— in `src/lib/profile/intake-options.ts`. It cannot see the other 14 `<Select>`
roots, and its own comment concedes the TypeScript union already excludes `''` for
those three tables, so even there it is near-vacuous. A new
`<SelectItem value="">` anywhere else compiles, typechecks, passes all nine gates,
mounts fine, and is silently unclickable.

The sharper residual risk is a **runtime**-empty value, not a literal. Three call
sites defend against it explicitly and two do not:

```
defended:
  _universities-client.tsx:504  countries.filter(Boolean).map(...)
  chat/shared.tsx:346           (field.options ?? []).filter(Boolean).map(...)
  chat/shared.tsx:341           {values[field.key] && !options.includes(...) && <SelectItem …>}
undefended:
  scholarship-explorer.tsx:203  {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
  scholarship-explorer.tsx:220  {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
```

`countries` / `levels` are `useMemo`s derived from scholarship rows
(`scholarship-explorer.tsx:88,92`). A row with a null/empty country or level yields
`<SelectItem value="">`, which under the wrapper renders a blank, permanently
unclickable row.

Fix (do **not** apply — recorded decision): if it is ever revisited, the cheapest
loud failure is a dev-mode invariant inside `SelectItem` —
`if (process.env.NODE_ENV !== 'production' && props.value === '') throw new Error(…)`
— which turns the silent swallow into a test-time crash for all 17 roots at once.
Adding `.filter(Boolean)` at `scholarship-explorer.tsx:203,220` is a separate,
independently-safe one-liner that matches what its two sibling call sites already do.

Test: a `SelectItem` rendered with `value=""` should throw in test env. Fails today
(it renders happily).

---

### K-7 — the token gate's `hex` rule is named for a syntax, so `rgb()`/`rgba()` colour literals are un-ratcheted
Severity: **P3** (gate gap; AUDIT-PROMPT §1 criterion 6)
Location: `/Users/gregfranck/Ascenda/scripts/check-design-tokens.mjs:82-88`
Regression?: **NO**

Evidence: the rule matches only `#`-prefixed values:

```js
id: 'hex',
re: /(?<![\w#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])/g,
msg: 'Raw hex. Colour lives in globals.css custom properties only.',
```

`rgb()`, `rgba()` and bare `hsl()` triples are invisible to it:

```
$ rg -o 'rgba?\([0-9][^)]*\)' src --glob '*.tsx' --glob '*.ts' | wc -l
7
$ rg -c 'rgba?\([0-9]' src --glob '*.tsx'
src/components/university-search/ComparisonModal.tsx:1
src/components/landing-preview/preview-nav.tsx:1
src/components/landing-preview/preview-hero.tsx:1
src/components/landing-preview/preview-cta.tsx:1
src/components/landing-preview/altitude-wash.tsx:1
```

e.g. `ComparisonModal.tsx:400`:
`bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.14),transparent_36%),…]`
— `rgba(79,70,229)` is the brand indigo hard-coded, so it will not follow `--primary`
and does not flip in dark mode.

The gate's ratchet freezes existing debt and blocks new debt *per rule*. Because no
rule covers `rgba()`, this is not frozen at 7 — it is unbounded. The `hex` count is
baselined at 5, so a author who writes `rgba(…)` instead of `#4f46e5` passes a gate
that was intended to stop exactly that.

Fix: extend the `hex` rule's regex (and rename it `raw-colour`) to also match
`\brgba?\(\s*\d` and `\bhsla?\(\s*\d` outside `globals.css`, then
`--update-baseline` to record today's 7.

Test: per ground rule 5 — add the alternation, add one `rgba(1,2,3,0.4)` to a scratch
file under `src/`, run `npm run lint:tokens`, confirm it goes **red**, then revert.

---

### K-8 — two `hover-lift` conformance breaks in the touched set (both pre-existing)
Severity: **P3**
Location: `/Users/gregfranck/Ascenda/src/components/university-search/ComparisonModal.tsx:399`;
`/Users/gregfranck/Ascenda/src/app/counsellor/_components/application-overview.tsx:162`
Regression?: **NO** — `git diff origin/main...HEAD` touches neither line.

Evidence:

```
ComparisonModal.tsx:399  (ProgramHeaderCard)
  <article className="group relative flex flex-col overflow-hidden rounded-4xl border
    border-border bg-card/80 p-5 shadow-e-1 backdrop-blur-xl hover-lift dark:bg-muted/20 …">
```
The `<article>` has no `onClick`, no `href`, no `role`. Its only interactive child is
the remove `<button>` at `:408`. Lift on a static card — the inverse of K-4, same rule.

```
application-overview.tsx:160-162
  <Link href={`/counsellor/students/${studentId}`}
        className={cn('block surface-subcard p-3 border-l-4 transition-colors hover:bg-muted/30 group', cfg.borderLeft)}>
```
A `surface-*` card that *is* clickable and does not opt into `hover-lift`. It does
have a `hover:bg-muted/30` affordance, so this is inconsistency rather than a missing
affordance — noted for completeness.

Every other `hover-lift` in the branch-touched set is on a genuine control
(`_analytics-client.tsx:621`, `analytics-charts.tsx:68,78,336`,
`analytics-drilldown.tsx:298`, `sidebar.tsx:140`, `deadline-groups.tsx:103`), and
there are **no** hand-rolled lifts on a `surface-*` element and **no** uses of the
near-dead `.panel` class anywhere.

Fix: drop `hover-lift` from `ComparisonModal.tsx:399`; add it to
`application-overview.tsx:162` (or leave the `hover:bg` and accept the variance).

Test: this rule is currently unenforced anywhere, which is why K-4 and K-8 both
exist. The durable fix is a rule in `check-design-tokens.mjs`: flag any `className`
containing `hover-lift` on a JSX element whose attributes include none of `onClick`,
`href`, `role="button"`, `asChild`, and whose tag is not `button`/`a`/`Link`. Break
it by adding `hover-lift` to a `<p>` and confirm red.

---

### K-9 — `.nav-pill-active` has zero call sites while `ui/tabs.tsx`'s docblock says the tabs use it
Severity: **P3** (dead CSS + misleading doc)
Location: `/Users/gregfranck/Ascenda/src/app/globals.css:417-419` (definition);
`/Users/gregfranck/Ascenda/src/components/ui/tabs.tsx:18` (the claim)
Regression?: **NO** — `globals.css` and `tabs.tsx` are both unchanged by this branch.

Evidence:

```
$ rg -n 'nav-pill' src --glob '!src/app/globals.css'
components/ui/tabs.tsx:18       * ... `.nav-pill` triggers, `.nav-pill-active` colours. A tab row and a
components/ui/tabs.tsx:118        'nav-pill shrink-0 disabled:pointer-events-none disabled:opacity-50',
components/layout/section-nav.tsx:104   className={cn('nav-pill shrink-0', PILL_FOCUS, PILL_ACTIVE)}
… (all other hits are comments or an unrelated framer `layoutId="previewnav-pill"`)
```

`nav-pill-active` never appears in a `className`. `section-nav.tsx:26-38` explains
why it was dropped (it carries `bg-primary`, which would double-paint the `layoutId`
slider) and `tabs.tsx` independently reached the same design — but `tabs.tsx:18`
still tells the next reader that changing `.nav-pill-active` in `globals.css` will
"follow for free". It will not.

Positive note from the same area, verified: the specificity trap `section-nav.tsx`
documents is **correctly handled in both consumers**. `.nav-pill:hover` is (0,2,0) in
`@layer components`; `section-nav`'s `aria-[current=page]:…` and `tabs`'
`data-[state=active]:…` are both (0,2,0) in `@layer utilities`, so they tie on
specificity and win on layer order. A bare `text-primary-foreground` (0,1,0) would
have lost. This is trap #4 handled properly, with a correct written explanation.

Fix: delete `.nav-pill-active` from `globals.css:417-419` and correct `tabs.tsx:18`.

Test: `knip`/`lint:deadcode` does not cover CSS classes. A cheap assertion:
`expect(rg('nav-pill-active', 'src', {exclude: 'globals.css'})).toHaveLength(0)`
paired with the class not existing — i.e. just remove it.

---

### K-10 — four form controls in the profile intake wizard have no accessible name
Severity: **P2** (a screen-reader or voice-control user cannot complete the core student flow)
Location: `/Users/gregfranck/Ascenda/src/app/profile/_components/StudentIntakeForm.tsx:1439-1441`,
`:1462-1466`, `:1917`; `/Users/gregfranck/Ascenda/src/app/counsellor/universities/_universities-client.tsx:610`
Regression?: **NO** — all four predate the branch.

Evidence: 58 `input`/`textarea`/`SelectTrigger` sites were inventoried; 54 are
correctly associated. The four that are not:

**1 + 2. The subject row — a label that is both unassociated *and* hidden on desktop.**

```jsx
StudentIntakeForm.tsx:1438-1441
  <label className="md:hidden text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
  <SubjectCombobox value={subj.subject_name} onChange={…} error={…} />

StudentIntakeForm.tsx:1461-1466
  <label className="md:hidden text-xs font-medium text-muted-foreground mb-1 block">Grade</label>
  {programmeType === 'IB'
    ? <input type="number" min={1} max={7} … placeholder="1–7" />
```

Both `<label>`s have **no `htmlFor`** and do not wrap their control, so no
association exists at any viewport — and `md:hidden` removes them visually above
640 px as well. `a11yError()` supplies only `aria-invalid`/`aria-describedby`, not a
name. `SubjectCombobox` cannot be fixed at the call site because it accepts no `id`:

```
StudentIntakeForm.tsx:311-313
function SubjectCombobox({ value, onChange, error, errorId }: { value: string; … })
```

…whereas the sibling `CountryCombobox` *does* accept and apply `id={id}` (`:228`).

This is an inconsistency inside a single row, not a systemic gap: the two
`SelectTrigger`s beside these inputs are labelled correctly —
`aria-label={\`Level for subject ${i+1}\`}` (`:1453`) and
`aria-label={\`Grade for subject ${i+1}\`}` (`:1471`).

**3. The ambition statement textarea has no label element at all.**

```jsx
StudentIntakeForm.tsx:1911-1920
  <SectionCard>
    <SectionTitle label="Where do you want to go?" hint="Optional — 2–3 sentences…" why="…" />
    <textarea rows={3} className={cn(inputCls, 'h-auto py-3 resize-none')}
      value={activities.ambition_statement} onChange={…} placeholder="e.g. I want to study…" />
```

`SectionTitle` takes a `label: string` **prop**, but the component
(`StudentIntakeForm.tsx:118`) renders a heading/paragraph, not a `<label htmlFor>` —
verified by reading its body. So the only cue is the placeholder, which disappears
on first keystroke.

**4. The deck-name input.**

```jsx
_universities-client.tsx:610-615
  <input value={newDeckName} onChange={…} onKeyDown={…}
    placeholder='Deck name — e.g. "UK Reach Raid"' className="form-input rounded-full py-2" />
```

No `id`, no `aria-label`, no label. Again inconsistent rather than systemic: the
radiogroup two lines below carries `aria-label="Deck emblem"` (`:617`).

Repro: with VoiceOver on `/profile`, tab into the subject grade field — it announces
"edit text, 1–7" with no field name; with five subject rows, five identical
anonymous fields. Voice control ("click Grade") cannot target any of them.

Fix: add an `id?: string` prop to `SubjectCombobox` and forward it (mirroring
`CountryCombobox`), then give the four `<label>`s an `htmlFor` and drop `md:hidden`
in favour of `sr-only md:not-sr-only` so the name survives on desktop. For the
textarea and the deck input, an `id` + `<label htmlFor>` or an `aria-label`.

Test: render the wizard on step 3 with two subject rows and assert
`screen.getByRole('textbox', { name: 'Grade for subject 1' })` resolves — it throws
today. The existing characterization suite already queries
`getByRole('combobox', { name: 'Level for subject 1' })`
(`intake-form.characterization.test.tsx:1996`), so the harness and the naming
convention both exist; this extends them to the two raw inputs in the same row.

---

### K-11 — four dialogs render no `DialogDescription`, so Radix logs a warning and they expose no `aria-describedby`
Severity: **P3**
Location: `/Users/gregfranck/Ascenda/src/components/assistant/assistant-workspace.tsx:807`;
`/Users/gregfranck/Ascenda/src/components/university-search/ComparisonModal.tsx:213`;
`/Users/gregfranck/Ascenda/src/app/counsellor/universities/_universities-client.tsx:836,914`
Regression?: **NO**

Evidence: `ui/dialog.tsx:188-190` notes `DialogDescription` is "optional, and wired
to `aria-describedby` when present". Radix's `Dialog` logs a `Missing Description
or aria-describedby={undefined}` warning in development for every `DialogContent`
without one. Eight in-scope `DialogContent`s: all have a `DialogTitle`, four have a
`DialogDescription` (`command-palette-dialog.tsx:254`,
`help-thread-drawer-impl.tsx:270`, `analytics-drilldown.tsx:107`, plus
`assistant-workspace.tsx:809` — which *does* render one, so it is the other three
that warn), four do not.

Note this also means the dev console carries recurring Radix warnings, which is how
a *real* warning gets missed.

Fix: add an `sr-only` `DialogDescription` (the pattern `command-palette-dialog.tsx:255-257`
already uses), or pass `aria-describedby={undefined}` to silence the warning
deliberately where there genuinely is no description.

Test: render each dialog with `jest.spyOn(console, 'warn')` and assert it is not
called. Fails today for the three.

---

### K-12 — heading levels jump h1 → h3 app-wide, and `ErrorState` emits a second `<h1>`
Severity: **P3**
Location: `/Users/gregfranck/Ascenda/src/components/ui/card.tsx:41` (`CardTitle` → `<h3>`);
`/Users/gregfranck/Ascenda/src/components/ui/empty-state.tsx:90` (`<h3>`);
`/Users/gregfranck/Ascenda/src/app/counsellor/_components/application-overview.tsx:152`;
`/Users/gregfranck/Ascenda/src/components/ui/error-state.tsx:69`
Regression?: **NO**

Evidence: `PageHero` supplies the page `<h1>` (`page-hero.tsx:158`). Pages that then
render a `Card`/`EmptyState` with no intervening `<h2>` produce h1 → h3 — verified on
`/dashboard`, `/inbox`, `/scholarships`, `/matches` and
`/counsellor/applications` (whose `application-overview.tsx:152` hard-codes `<h3>`
under a page containing no `h2`). Screen-reader heading navigation reports a missing
level throughout.

The sharper one is `error-state.tsx:69`:

```jsx
<h1 className={cn('text-lg font-semibold text-foreground', scope ? 'mt-2' : 'mt-5')}>{title}</h1>
```

`ErrorState` is rendered by route-segment `error.tsx` boundaries, which mount
**inside** `<main>` while the surrounding layout (including `PageHero`'s `<h1>`) is
still mounted. A subtree error therefore yields two `<h1>`s on one page.

Fix: make `CardTitle`/`EmptyState` heading level a prop (default `h2`), or insert an
`h2` section heading on the affected pages. Change `error-state.tsx:69` to `<h2>`
and let the full-page error boundaries pass a level prop if they need `h1`.

Test: render each affected page and assert
`getAllByRole('heading')` levels form a non-skipping sequence, and that
`getAllByRole('heading', { level: 1 })` has length ≤ 1.

---

### K-13 — three unlabelled `<nav>` landmarks on one page, and the nav label is on the wrong element
Severity: **P3**
Location: `/Users/gregfranck/Ascenda/src/components/layout/navbar.tsx:83`;
`/Users/gregfranck/Ascenda/src/components/layout/mobile-nav.tsx:99`;
`/Users/gregfranck/Ascenda/src/components/layout/sidebar.tsx:38-43,61`;
`/Users/gregfranck/Ascenda/src/components/layout/side-switcher.tsx:74`
Regression?: **NO**

Evidence: an authenticated page mounts up to four navigation landmarks —
`navbar.tsx:83`, `sidebar.tsx:61`, `mobile-nav.tsx:99`, `section-nav.tsx:83`. Only
`SectionNav`'s Suspense fallback carries an `aria-label`. With multiple same-role
landmarks and no accessible names, a screen reader's landmark list reads
"navigation, navigation, navigation".

Separately, `sidebar.tsx:38-43` puts `aria-label="Primary navigation"` on the
`<aside>` — a *complementary* landmark — naming it as navigation, while the actual
`<nav>` it contains (`:61`) is unlabelled:

```jsx
sidebar.tsx:38-43
  <aside className={cn('sticky top-28 hidden self-start rounded-2xl …')}
         aria-label="Primary navigation" data-collapsed={…}>
```

And `side-switcher.tsx:74` renders the portal-switch control group as a bare
`<div className={cn('space-y-0.5', className)}>` with no `role="group"` and no group
label.

Fix: move `aria-label="Primary navigation"` from the `<aside>` to `sidebar.tsx:61`'s
`<nav>`; add `aria-label` to `navbar.tsx:83` ("Main") and `mobile-nav.tsx:99`
("Mobile"); give `side-switcher.tsx:74` `role="group" aria-label="Switch portal"`.

Test: render `DashboardShell` and assert every `getAllByRole('navigation')` entry has
a distinct accessible name. Fails today (three unnamed).

Adjacent, folded in rather than filed separately — three hand-rolled popovers have
partial keyboard handling. `notification-bell.tsx:178-190` has Escape, focus-in and
focusout-close and **documents its lack of a focus trap as deliberate** at `:93-102`
(accepted). `mobile-nav.tsx:110-160` is a `role="menu"` with Escape + focus-first but
no arrow-key handling on its `role="menuitem"` children, and its scrim is a
full-viewport focusable `<button aria-label="Close menu">` (`:100-106`) sitting in
the tab order. `child-switcher.tsx:89-99` is a `role="listbox"` with no
`aria-activedescendant` and no arrow keys (K-2 already proposes replacing it with a
Radix primitive, which resolves this too).

---

## What I checked and found clean

Do not redo these.

**Token / design-system rules**
- `npm run lint:tokens` — exits 0. Recorded counts, 449 files: `palette-literal` 245,
  `hex` 5, `dark-variant` 116, `raw-z` 73, `off-ladder-shadow` 25,
  `arbitrary-geometry` 92, `template-classname` 25, `subfloor-type` 24,
  `named-step-as-arbitrary` 54, `dead-opacity` 0.
- **Branch-added debt is zero** across every category I could attribute. Running the
  regexes over only `^+` lines of `git diff origin/main...HEAD -- src/components src/app src/features`:
  0 palette literals added, 0 `dark:` colour variants added, 0 `text-primary`-as-copy
  added. Raw z-index went **down** (−5 `z-10`, `z-50` net 0). One arbitrary geometry
  added: `min-h-[44px]`, a tap-target floor — an improvement.
- `rounded-[Npx]`: **0 occurrences in all of `src/`**. Radius ladder is clean.
- All 34 template-literal `className={\`…\`}` sites are pre-existing; the four
  branch-touched files carrying them (`admin/simulation/page.tsx`,
  `_analytics-client.tsx`, `application-funnel.tsx`, `comparison-settle.tsx`) had
  them before the branch.
- `.panel` (the near-dead class): **0 real call sites**. Every textual hit is an
  identifier (`ImportPanel`, `NotesPanel`, `RebuttalPanel`), a DOM id
  (`notification-bell-panel`), the `z-panel` token, or a comment.
- No inline `style={{}}` sets colour, `borderRadius`, `boxShadow` or `fontFamily`
  anywhere in the touched set — every inline style is layout-only (`width`, `left`,
  `minWidth`, `gridTemplateColumns`, `display:'contents'`).
- Fonts: no heading overrides `font-heading`, no body copy sets it. The two
  `font-sans` uses are on a `<form>` and on `<kbd>` elements resetting the mono
  default — both correct.

**The eight silent-failure traps**
1. *Tailwind opacity scale* — **clean**, independently re-derived rather than trusting
   the gate. Every opacity denominator present in `src/` is
   `3 5 8 10 15 20 25 30 40 45 50 60 70 75 80 85 90 95`, all inside the legal set
   (`tailwind.config.ts:199-205` extends the default with 3/8/15/45/85). Matches the
   gate's `dead-opacity: 0`.
2. *Class/colour name collisions* — **clean**. Cross-checked every component class
   defined in `globals.css` + `tailwind.config.ts` (`panel`, `form-*`, `navbar-brand`,
   `text-gradient`, `scrollbar-*`, `hover-lift`, `text-body-sm`, `text-label`,
   `eyebrow`, `eyebrow-accent`, `helper-text`, `shell-gutter`, `surface-*`,
   `nav-pill*`, `page-soft-bg`, `section-fade`) against every colour token
   (`border input ring background foreground primary secondary destructive muted
   accent popover card success warning danger info feature series-1..5`). No
   collision. The documented `.text-secondary` hazard is not present; `label` is not
   a colour token, so `.text-label` is safe as the comment claims.
3. *tailwind-merge* — **clean and correctly configured**. `src/lib/utils.ts:26-32`
   registers `text-label` and `text-body-sm` in the `font-size` group, which is the
   right fix and prevents them fighting tone colours. `.eyebrow` needs no entry (no
   `text-` prefix), as its comment says. No element carries two `shadow-e-*` or two
   named `z-*` classes (the two shapes `cn()` cannot arbitrate, since neither custom
   scale is known to tailwind-merge).
4. *Layer specificity* — **clean, and actively defended**. See the positive note in
   K-9. `page-hero.tsx:107-111`'s claim that utilities outrank `surface-card`'s
   `p-6 sm:p-7` at every breakpoint is correct (both are (0,1,0); `@layer utilities`
   is emitted after `@layer components`, and the `sm:` blocks preserve that order).
5. *Overflow clipping* — one hit, K-2. Everything else is right: `DialogContent` is
   `overflow-hidden` but each consumer that needs to escape it does so correctly —
   `MobileFilterSheet.tsx:43` uses `min-h-0 flex-1 overflow-y-auto`,
   `command-palette-dialog.tsx:278` uses `max-h-[60vh] overflow-y-auto
   overscroll-contain`, and `help-request-modal.tsx:124` /
   `send-message-modal.tsx:160` opt out with `overflow-visible` (which `cn()` merges
   correctly, same group). Radix `SelectContent` is portalled, so no Select inside a
   card is clipped.
6. *`space-y` siblings* — **clean**. The six `space-y-*`-on-a-flex/grid hits in the
   touched set are all `flex-1 space-y-*` on a *column* child (correct usage) or
   `md:space-y-0` cancelling at a breakpoint (`StudentIntakeForm.tsx:1436`). No
   `space-y` container has an absolutely-positioned or conditionally-null direct
   child that would break the rhythm.
7. *Radix controlled-ness* — **clean**. All 13 `<Dialog>` call sites pass both `open`
   and `onOpenChange` (enumerated: `cross-application-tasks:414`,
   `help-thread-drawer-impl:250`, `help-request-modal:123`, `essay-workshop:461`,
   `ComparisonModal:212`, `MobileFilterSheet:18`, `command-palette-dialog:248`,
   `_universities-client:834,907`, `analytics-drilldown:90`,
   `custom-widget-builder:88`, `send-message-modal:159`, `assistant-workspace:806`).
   No dialog can flip uncontrolled→controlled. Every `<Select value=…>` passes a
   value that is always a string (`x || ''`, `x || 'all'`, `x || undefined` — the
   last is deliberate and commented at `chat/shared.tsx:327`), so no Select flips
   either. `ui/tabs.tsx:48-64` mirrors Radix's value into its own context for the
   indicator while leaving Radix the source of truth — correct for both the
   controlled and uncontrolled case.
8. *Tailwind content globs* — **broken**, K-1.

**Accessibility**
- **The skip link works — a sub-agent claim that it was missing is REFUTED.**
  `src/app/layout.tsx:76-79` renders `href="#main-content"` with the text
  "Skip to content", and `src/components/layout/shell.tsx:60-62` renders
  `<main id="main-content" tabIndex={-1}>`. The target, the `tabIndex={-1}` needed to
  make it focusable, and a comment explaining why it is `fixed` rather than
  `absolute` are all present. Do not re-file this.
- Landmarks present and correctly typed: `<main>` (`shell.tsx:60`), `<aside>`
  (`sidebar.tsx:38`), `<nav>` (`sidebar.tsx:61`, `navbar.tsx:83`,
  `mobile-nav.tsx:99`, `section-nav.tsx:83`), `<header>` (`navbar.tsx:63`). No
  bare-`div` page chrome anywhere. Their *labelling* is K-13.
- **Zero** `onClick` on a `<div>`/`<span>`/`<li>`/`<tr>`/`<td>`/`<section>`/`<p>`/
  `motion.div` across the branch-touched `.tsx` files — 64 by my own list, 71 with
  all of `src/components/ui/` folded in. Checked twice, independently, and both
  passes agree. All 123 handlers sit on `<button>` (88), `<Button>` (14), the local
  `Chip` (19, itself a `<button type="button">` at `StudentIntakeForm.tsx:286`),
  `<Link>` (3) or `<EmptyState>` (2).
- All 23 icon-only controls in scope carry `aria-label`, `title` or `sr-only` text —
  no misses. The one naming oddity is `_universities-client.tsx:619`, where seven
  emoji `role="radio"` buttons take a bare emoji glyph as their accessible name
  (their `role="radiogroup"` parent is labelled "Deck emblem").
- No `<img>`/`<Image>` without `alt` — the only one in scope is
  `navbar.tsx:74`, `alt="Ascenda logo"`.
- No `role=` is passed to any `Dialog*`, `Select*`, `Tabs*` or `Tooltip*` component
  anywhere, so nothing overrides a Radix-provided role. No `aria-describedby`
  pointing at a non-existent node: `a11yError()`
  (`StudentIntakeForm.tsx:954`) emits it only when `errors[key]` is truthy, and
  `FieldError` renders the matching `id` under the same condition (`:105-107`).
- All 13 `<Dialog>`-bearing files render a `DialogTitle` (verified per file; 8 of
  the 13 are in the branch-touched subset). `command-palette-dialog` and
  `assistant-workspace` correctly use `sr-only` titles + descriptions. Missing
  *descriptions* are K-11.
- `ui/dialog.tsx:67-116` implements its own focus-restore (stashing
  `document.activeElement` in `onOpenAutoFocus`, restoring in `onCloseAutoFocus` with
  an `isConnected` guard) because no consumer uses a `DialogTrigger` — a real bug
  class, correctly handled and correctly explained.
- Only two `outline-none` without a same-element ring, both container-level and both
  fine: `notification-bell.tsx:187` (a programmatic focus target) and
  `command-palette-dialog.tsx:268` (the input, whose focus is signalled by the
  parent's `focus-within:border-primary` at `:249`).
- `child-switcher.tsx:29-48` implements Escape (with focus returned to the trigger),
  outside-pointerdown dismissal, and correct listener cleanup; `:89-99` uses
  `role="listbox"` / `role="option"` / `aria-selected`. Only nit: `aria-haspopup="listbox"`
  without `aria-controls`.
- `MobileFilterSheet` and `ComparisonModal` close buttons carry `aria-label`; icons
  throughout carry `aria-hidden`.
- Form labelling on the Select call sites I inspected is correct — `<label htmlFor>`
  paired with `SelectTrigger id` (`scholarship-explorer.tsx:188/198`, `:207/215`),
  `aria-label` where there is no visible label (`_universities-client.tsx:496`),
  and an `sr-only` label on the parent composer (`parent-thread.tsx:176-178`).
- `prefers-reduced-motion` is honoured in **three** independent layers, all verified:
  `<MotionConfig reducedMotion="user">` (`providers.tsx:25`) for all Framer motion;
  the `@media (prefers-reduced-motion: reduce)` block (`globals.css:443-452`) which
  also forces `scroll-behavior: auto`; and an explicit
  `matchMedia('(prefers-reduced-motion: reduce)')` gate with a live `change` listener
  on Lenis (`smooth-scroll.tsx:155`), which is the one path `MotionConfig` cannot
  reach. `tailwindcss-animate` classes on the dialogs are covered by the CSS block.
- Contrast: `globals.css` is unchanged by this branch and carries its own recorded
  AA verification table for both themes (`:165-176`), and the branch added no colour
  utilities at all, so there is no new contrast surface. `text-primary-ink` is used
  for copy; `text-primary`-as-copy appears twice
  (`analytics-charts.tsx:409`, `comparison-settle.tsx:182`), both pre-existing and
  neither added by this branch.

**Infrastructure facts worth not re-deriving**
- `tailwind.config.ts`, `src/app/globals.css` and `src/lib/utils.ts` are **all
  byte-identical to `origin/main`** on this branch.
- tailwindcss `3.3.5`; `@radix-ui/react-select` `2.3.7`; single tailwind config;
  `postcss.config.mjs` has no content overrides.
- `.next/static/css/` at the time of this lane was built at 12:10 on 2026-08-02,
  after HEAD (`40cb781`, 11:40), so it is a faithful artifact of this branch. Any
  later `npm run build` will replace it.

---

## Not verified

- **Rendered appearance in a browser, in either theme.** The lane is static-only and
  the dev server and `npm run build` were both out of scope, so every visual claim
  (K-1's bubble widths, K-2's clipping geometry) is derived from source plus the
  compiled stylesheet, not observed. K-1's *class absence* is executed fact; K-1's
  *visual consequence* is inferred. K-2 is inferred entirely from CSS semantics.
- **Measured contrast ratios.** I did not re-compute any WCAG ratio. The values in
  §"found clean" are `globals.css`'s own recorded table. Since the branch changed no
  colour token and added no colour utility, re-measuring would only re-audit
  `origin/main`. If the ratios themselves are ever doubted, that is a separate task.
- **Actual screen-reader behaviour.** K-3 is derived from missing ARIA attributes,
  not from a VoiceOver/NVDA session.
- **Keyboard traversal end-to-end.** Focus order, tab-trapping and roving-tabindex
  behaviour were read (and Radix supplies most of it) but not driven. Playwright was
  out of scope.
- **Whether K-1's five classes are also referenced from a non-`src` location** that
  a glob might pick up — I checked all four configured globs, `next.config.mjs`,
  `postcss.config.mjs` and `tsconfig.json`, and found `features` in none of them, but
  I did not exhaustively prove no other mechanism injects them.
- **`src/types/`** — outside every content glob like `src/features`, but it contains
  no `className`, so it is not a K-1 consumer. Not otherwise reviewed.
- **The seven deleted files** in the branch diff (`StepRoadmap.tsx`,
  `deadline-nudges.tsx`, `outcome-tracker.tsx`, `pulse-cards.tsx`, `stats-card.tsx`,
  `subject-grade-table.tsx`, `share-match-button.tsx`) have no content to review for
  design conformance. Whether their *capability* survived is Lane A's question, not
  this lane's.
- **`src/components/landing*`** beyond the branch-touched files. It is a second,
  un-migrated design system holding the bulk of the 245 palette-literal and 116
  `dark:`-variant baseline counts. Deliberately out of scope; the branch added
  nothing to it.
