# Adversarial review — domain logic (`security/phase0-contain`)

Scope: `git diff origin/main...HEAD -- src/lib/scoring/ src/lib/matching/ src/lib/theme/categories.ts src/lib/counsellor/ __tests__/scoring/ __tests__/student_scoring.test.ts`

Every number below was recomputed independently from the two file versions
(`git show origin/main:…` vs `HEAD`). The author's stated figures were not used
as inputs. Working scripts and the mutation sandbox are in the session
scratchpad; the repository was not modified.

---

## Verdict

**The scoring model is more correct than `origin/main`** — the A-level repair is
real, large, and genuinely verified; the ACT rigour fix is real; the unscored-
programme fix is directionally right. Three of six headline claims hold as
stated.

But the branch ships **one new regression the author did not notice** (the `U`
grade), and **two confident numerical justifications that do not survive
recomputation** (the fit-error comparison, and the "identical rigour mapping"
premise). The commit message is more certain than the work supports.

| # | Claim | Verdict |
|---|---|---|
| 1 | A-level table: 0 inversions, was 34, originals preserved | **PARTLY** — the three counts are right; the *justification* is false and a new gap was opened |
| 2 | Tiers unified to 80/60 | **PARTLY** — unified across the three named modules, but two more implementations remain and stored tiers still win |
| 3 | ACT rigour heals existing data | **VERIFIED** (mechanism) / **FALSE** (the stated reason) |
| 4 | Unscored → `null`, render path unchanged | **PARTLY** — true for score display, false for the tier filter |
| 5 | Golden files honest | **VERIFIED** — with one real blind spot and stale prose |
| 6 | Lucas 39 → 44 | **VERIFIED** |

---

## Claim 1 — the A-level signature table

### The three counts are correct

Enumerating all 56 three-grade multisets over `{A*,A,B,C,D,E}`, computing strict
dominance (elementwise ≥ on sorted grade ranks, at least one >), and scoring both
the old if-chain and the new table:

| | old if-chain | new table |
|---|---|---|
| dominance-comparable ordered pairs | 1120 | 1120 |
| **strict inversions** (dominator scores *less*) | **34** ✓ | **0** ✓ |
| ties (dominator scores *equal*) | 299 | 9 |

- **"0 dominance inversions" — VERIFIED.**
- **"down from 34" — VERIFIED**, and my inversion list matches the author's worked
  examples exactly (`A*A*D(8) < ABD(40)`, `ACC(8) < CCC(24)`, `BBD(8) < CCD(16)`, …).
- **"all original values preserved" — VERIFIED.** All 26 signatures named in the old
  chain carry byte-identical values in the new table. (The commit says "25"; the
  chain names **26** signatures carrying **21** distinct values. Cosmetic, but it is
  a number stated three times and it is wrong each time.)

Two caveats the author did not state:

- **"0 inversions" uses the lenient definition.** 9 dominance-comparable pairs still
  score *equal* — `A*CD = A*CE = A*DD = A*DE = ACD = 28` is a five-way plateau in which
  a strictly better result earns nothing. That is down from 299, so it is a large
  improvement, but "zero inversions" is doing quiet work by counting only `<`, not `≤`.
- **28 of 56 signatures change score, every one upward.** (30 fell through the
  catch-all; `CEE` and `DDE` happen to land on 8 again.) Recomputed from the golden
  baseline, **19 of 56 signatures change `student_band`**, including `A*A*D` moving
  **Weak → Strong** — a two-band jump on the headline label a student sees. The commit
  message describes the direction but never quantifies the band movement.

### 🔴 NEW BUG — the `U` grade now scores 0, and the table is not exhaustive

`U` (Ungraded) is a **legal, user-selectable A-level grade**:

- `src/lib/profile/intake-options.ts:184` — `A_LEVEL_GRADES = ['A*','A','B','C','D','E','U']`
- `src/lib/profile/intake-schema.ts:80` — `z.enum(['A*','A','B','C','D','E','U'])`
- `src/lib/profile/intake-types.ts:77` — the payload type includes `'U'`
- `src/lib/counsellor/data.ts:45` — `GRADE_ORDER` ranks it
- `src/lib/scoring/student_scoring.ts:333` — `mapAlevelGradeToRank` ranks it

The legal domain is therefore **84** signatures, not 56. The new table has 56 entries,
so all **28 signatures containing a `U` miss the table** and fall to `?? 0`
(`student_scoring.ts:583`). Under `origin/main` they hit the catch-all and scored **8**.

This falsifies the table's own doc comment:

> *"A missing entry is now unrepresentable: the table is exhaustive over the grade set,
> so a signature cannot silently fall through."*

It is not exhaustive over the grade set, and a signature does still silently fall
through — into a value that is **worse than what it replaced**:

```
A*A*U  →  0        (origin/main: 8)
AAU    →  0        while  AAA = 70,  EEE = 5,  DDD = 10
EEU    →  0        (origin/main: 8)
```

A student with two A\* grades and one ungraded subject now scores **0 of 80** on
`academic_performance` — below `EEE`. This is not a dominance inversion (a `U`
signature can never dominate a non-`U` one), which is precisely why the author's
exhaustive dominance check could not see it. It is the "monotone but absurd" failure
mode, arrived at from the opposite direction.

Two further consequences:

- Over the **full legal domain** the old chain had **42** inversions, not 34. The
  author's baseline was computed over a truncated space that silently excluded a
  legal grade — so "34 → 0" is measured against the wrong denominator.
- The golden file records `rank_vector (A*=6 … E=1)`, a 6-value scale, while the
  scorer's own `mapAlevelGradeToRank` is a 7-value scale reserving 1 for `U`. The
  test harness encodes the same blind spot as the fix.

**Fix:** either add the 28 `U` entries, or make the fallback `8` rather than `0`,
or reject `U` at intake. Silently scoring a fail as "worse than three E grades" is
the least defensible of the three.

### 🔴 The 1.2 : 1 : 0.8 fit-error claim — FALSE as stated

> *"chosen because it reproduces the original table best: fit error 22.0 vs 36.7
> equal-weight and 55.0 for 3:2:1"*

I reconstructed the comparison across 5 grade scales × 10 error metrics.

**Under every standard measure of "reproduces the original table", equal weighting
fits *better* than the chosen weighting:**

| metric (26 original points) | 1.2:1:0.8 | equal | 3:2:1 | best |
|---|---|---|---|---|
| OLS sum \|residual\| | 120.2 | **114.0** | 139.7 | equal |
| OLS RMSE | 6.0 | **5.6** | 7.0 | equal |
| min-max-scaled sum \|error\| | 149.2 | **138.0** | 180.7 | equal |
| leave-one-out piecewise-linear sum \|error\| | 87.1 | **75.5** | 140.7 | equal |
| rank discordances | 7 | **1** | 10 | equal |
| all-pairs order violation | 32 | **2** | 58 | equal |

Exactly **one** metric in the battery reproduces the author's `22.0`: the
**adjacent-monotonicity violation** — sort the 26 originals by weighted score, sum
the downward steps. It gives 1.2:1:0.8 → **22.0** ✓.

But that metric is **degenerate under ties**, and this is the crux:

| weighting | distinct weighted scores (of 26) | adjacent-violation range over tie orderings | author reported |
|---|---|---|---|
| 1.2 : 1 : 0.8 | **26 / 26** (no ties) | [22, 22] — well-defined | 22.0 ✓ |
| equal | **14 / 26** (12 tied groups) | **[2, 32]** — arbitrary | 36.7 ✗ *(outside the range)* |
| 3 : 2 : 1 | 21 / 26 | [30, 54] | 55.0 ✗ *(outside the range)* |

Equal weighting makes the score a plain rank-sum, so half the points tie and the
metric's value is entirely an artefact of sort order. **Under a best-case tie-break,
equal weighting scores 2 — eleven times better than the chosen weighting's 22.**
The author's reported 36.7 and 55.0 are not reproducible under *any* tie ordering.

So: the comparison was **not fair**, and two of its three numbers do not reproduce.
The weighting was selected by the one metric that flatters it because irrational
weights break ties that the alternative cannot.

**Mitigating:** because every fill is then clamped into the dominance-permitted
range, the weighting choice has less influence on the output than the prose implies.
The damage is to the justification, not (mostly) to the values.

### The invented values — mostly defensible, one undisclosed hand-edit

I reimplemented the stated method (weighted score → piecewise-linear interpolation
over the 26 originals → clamp to `[max value dominated, min value dominating]`).
It reproduces **23 of 30 fills exactly**, 29 of 30 within ±3. The method description
is broadly honest.

**One value does not follow the stated derivation:**

| signature | table | my reconstruction of the stated method | diff |
|---|---|---|---|
| `AAE` | **40** | 28 (raw 28.0, clamp [5, 50]) | **+12** |

`AAE = 40` is not *indefensible* — it equals `ABD = 40`, and both are 112 UCAS tariff
points, so it is arguably better calibrated than the method's own output. But it is a
hand-set value presented as the product of a documented procedure, and it is the
single largest discretionary judgement in the table. It should be called out.

**Spot-checks the reviewer asked for:**

- **`A*A*D = 67`** — defensible. It sits below `A*AB = 68` and `AAA = 70`, above
  `A*AC = 64`. By UCAS tariff `A*A*D` (136) ties `A*AC` (136), and the table gives
  67 vs 64. The original table was already top-heavy (`A*A*C = 74` > `AAA = 70`
  despite equal tariff), so 67 follows a curve a human tuned. **Reasonable.**
- **`AEE = 15`** — sane. Between `BEE = 12` and `ADE = 22`, and above `DDD = 10`,
  which UCAS tariff agrees with (80 vs 72). **Reasonable.**

**The real structural weakness is an *original* value, not an invented one.**
`A*CD = 28` is a severe outlier: at 112 tariff points its peers score 36–44
(`A*BE = 44`, `AAE = 40`, `ABD = 40`, `ACC = 38`, `BBC = 36`) — a 16-point spread.
Because the clamping is anchored to it, that anomaly propagates into **four** more
cells (`A*CE`, `A*DD`, `A*DE`, `ACD` all forced to 28), producing the five-way plateau.

This directly undercuts the load-bearing premise:

> *"The 25 originally-listed values were checked and found internally perfectly
> monotonic — the calibration was sound, only the gaps were broken."*

Monotonic, yes — I confirm **0 strict inversions among the 26 originals** (276
comparable pairs, 2 ties). But *monotonic* ≠ *well-calibrated*, and the author used
the former to license assuming the latter. A genuine kink in the original was
faithfully propagated into five cells rather than questioned.

---

## Claim 2 — tier thresholds unified to 80/60

**PARTLY.** True of the three implementations named in `match-tier.ts`; false as a
statement about the codebase. `match-tier.ts` says *"**The** thresholds — there are
no others."* There are others.

**Two implementations were not migrated:**

1. **`src/lib/matching/matching_engine.ts:255-291` (`classify`) → `service.ts:796-800`
   (`assignTierFromFit`) → `service.ts:808`.** This is the rule that produces the tier
   on `/matches` for every freshly-computed match. It thresholds on an **IB-points gap**,
   not a 0-100 score, and is wholly independent of `TIER_THRESHOLDS`. The `score` on the
   same card is `chance_percent` — a *different* function of the same inputs. `/matches`
   can render **"87% · Reach"** while `/university-search/results` renders that same 87
   as **Safe**. That divergence spans the whole range and is larger than the 70-79 band
   the change fixed.
2. **`src/lib/matching/service.ts:846-856`** — when one tier dominates >75% of results,
   tiers are reassigned by **rank percentile** (top 35% → `Safe`). A student whose best
   match is 41% gets a "Safe" badge. This runs *after* `assignTierFromFit` and *before*
   the cache write, so percentile-derived tiers are what get persisted.

**The persisted tier still wins, and there is no backfill.** `service.ts:422`
(`tier: cachedTier ?? fallbackTier`) and `counsellor/data.ts:136` both prefer the
stored `breakdown.tier`; `matchTierFromScore` only ever runs as a fallback for rows
missing the key. Nothing writes `breakdown.tier` from the unified rule. No migration
clears it.

**User-visible stored-vs-computed disagreement — yes, and the author flagged only
the transient case.** The commit says stored and fresh tiers "disagree in that band
until rebuild." But `loadTierByProgram` (`src/lib/data/applications.ts:229-252`) has
**no recompute path at all** — `/applications`, the parent portal's progress board,
and the cost explorer read the stored tier *permanently*. A programme stored as `Safe`
at score 75 shows **Safe** on the applications board and **Match** in search,
side by side, with no TTL that ever reconciles them. That is not a rebuild window;
it is a standing contradiction.

**Blast radius is smaller than claimed on demo data, and larger in the code.** Both
seed scripts write tiers that contradict the new rule (`scripts/seed-demo-user.ts:548-601`
stores `Safe` at scores 77/75/72; `scripts/seed-students.ts:289-294` stores `Reach` at
62-69) and neither was updated — so on the seeded cohort the unification is close to a
no-op. Where it does bite (rows with a score but no stored tier), it moves ~12 counsellor
surfaces including the "Safe coverage" stat, which can newly emit the advice
*"No Safe-tier options — consider adding safety schools."* Generating new counselling
advice is a bigger deal than a relabelled pill and is not mentioned.

**Undisclosed side effect:** `src/lib/theme/fit-score.ts:6-10` still bands score
*colour* at 75 while the tier now bands at 80. Scores 75-79 render a green "strong"
badge next to an amber "Match" pill on the same card — a new 5-point mixed-signal band.

**`?? 'Reach'` — wrong at one of the two sites.** `match-tier.ts:47-52` states the
whole purpose of returning `null` is that callers "must decide what unknown means for
them, rather than inheriting a `?? 0` that silently reads as Reach." Both callers then
did exactly that. `src/lib/counsellor/data.ts:118-119` is the harmful one: it puts an
unknown-fit programme into a Reach *bucket*, *count*, *filter*, rose *colouring* and
literal "Reach" *text* across ~10 counsellor surfaces — including a drilldown that
renders `Imperial (0%)` under a "Reach-Tier Matches" heading. `service.ts:393` is
mitigated (the card also shows `0%`, signalling the anomaly). `classifyFitTier`
propagates `null` correctly and its consumers honour it.

Also stale: `src/components/university-search/types.ts:36-38` still names
`classifyFitTier` the single source of truth — the exact prose assertion
`match-tier.ts` mocks, left pointing at the wrong module.

---

## Claim 3 — ACT rigour

**Mechanism VERIFIED. The stated justification is FALSE.**

**Does it change anyone other than ACT students?** No. The widened filter is inside
`programmeType === 'ACT'`. Confirmed empirically: Phase 2 regenerated 5 golden files
and **all three `ib-*.golden.json` are untouched**; the A-level goldens changed only
in `academic_performance`.

**Quantified.** From `act-rigour-paths.golden.json`, the row representing what the
form actually emits: `rigour_score 0 → 13`, `total_score 68 → 81` (+13 of 200).
In `act-composite.golden.json` every one of the 50 rows gains `rigour_score 13`.
In `student-profiles.golden.json` the two ACT profiles gain `rigour 0 → 13` and
`0 → 6`.

**But `RigourTable.ACT` and `RigourTable.A_LEVEL` are *not* identical**, and the
code comment asserting they are sits three lines below the proof:

> *"The rigour mapping is documented as identical to A-level's, so widening the
> filter changes which rows are considered, not how they are scored."*

`RigourTable.ACT` (`student_scoring.ts:~230`) carries two keys `A_LEVEL` does not:

| subject | ACT | A_LEVEL |
|---|---|---|
| `calculus` | `HIGH` (5) | *falls through to* `?? 'MEDIUM'` (3) |
| `statistics` | `HIGH` (5) | *falls through to* `?? 'MEDIUM'` (3) |

Neither is aliased away — `SUBJECT_ALIASES` (`student_scoring.ts:54-68`) does not
map `calculus` or `statistics` to `mathematics`. So the divergence is live:

```
subjects [Calculus, Statistics, Physics]
  scored as an ACT student      →  rigour 15 / 15
  scored as an A-level student  →  rigour 11 / 15
```

Same three subjects, same grades, **4 points of 200 apart purely on the credential
label**. Previously this was harmless because `RigourTable.ACT` was dead. The fix
makes dead config live, and the comment justifying the fix asserts an identity that
the file itself contradicts. The fix is still right — the alternative was 0 — but the
two tables should be reconciled, not asserted equal.

The "nothing writes `AP`" premise checks out: `'AP'` appears in the type, the zod
enum, and the scorer, and nowhere else in `src/`.

---

## Claim 4 — unscored programmes return `null`

**PARTLY.** The render-path claim is true for score *display* and false for the
tier *filter*.

**True:** every component rendering a fit score already had an explicit null branch —
`fit-score.ts:18-27` (`tone: 'unknown'`), `university-card.tsx:186-187` (ring omitted,
not zeroed), `shortlist/page.tsx:221` (`'Fit TBD'`), `ComparisonModal.tsx:42` (`'N/A'`).
No `{score}%` or `.toFixed()` is reachable from the changed function. **No `?? 0` /
`Number()` / `Math.round(null)` coercion anywhere on the path.**

**Sorts and aggregates are clean.** `sortByFit` (`use-search-results.ts:500-510`)
normalises null/NaN *before* comparison and pins null last with an `id` tiebreaker —
**nothing can sort unscored programmes to the top**, and there is no `a.score - b.score`
NaN hazard. The shortlist average filters to numbers before reducing. Both nullable
DB columns (`student_matches.score`, `shortlisted_programs.fit_score`) accept null,
so no constraint can fire.

**🟠 The one miss — the tier filter fails open.** `src/app/university-search/search/page.tsx:364`:

```ts
const matchesTier = result.tier ? filters.tiers.includes(result.tier) : true;
```

`null` tier passes **every** tier selection. Before the change, an unscored programme
got the ~90 fallback → `'Safe'` and filtered normally. Now a user narrowing to
"Reach only" sees Reach programmes **plus every unknown-fit programme on the page**.
This is in the render path, is user-visible, and was not changed.

**🔴 The partial-degradation path is dead code.** `src/app/api/match/score/route.ts:7`
caps at `MAX_PROGRAM_IDS = 100`; `service.ts:1004` chunks at 200. So there is always
exactly **one** batch, `failedBatches === batchResults.length` holds on any error, and
the function **always throws**. The documented behaviour — *"a failed batch degrades
only its own ids to `null`"* — is unreachable in production; only a 250-id unit test
exercises it. Net: a transient `course_scoring_v1` timeout now yields a 500 and zero
fit scores for the whole page. Directionally correct, but page-wide rather than
per-programme, and not what the comment says.

**🟠 The new "fit" sort is page-local.** `use-search-results.ts:884` sorts each
50-row page after the DB returns it by primary key, and `commitPage:1001-1005` appends
without reshuffling. On infinite scroll the fit score descends 91 → 72 → null, then
jumps back to 94 at each page boundary — a sawtooth. The true best-fit programme in a
119k-row catalogue only surfaces if it happens to fall in the first 50 rows *by id*.
The commit is candid that a globally-correct sort needs the score in Postgres, but the
shipped intermediate is arguably a worse artefact than the `.order('id')` it replaced.

---

## Claim 5 — are the golden files honest?

**VERIFIED, with one blind spot and stale prose.**

**Process is right.** The goldens were created in Phase 1 (`c620957`, capturing the
bugs) and regenerated in Phase 2 (`155ee88`, capturing the repair) — the honest
sequence. The suite passes on `HEAD` unmodified, so the JSONs match real output;
they were not hand-edited to fit.

**The Phase-2 regeneration is minimal and reviewable** — exactly the 4 profiles that
should have moved:

```
student-profiles.golden.json:
  A*A*D profile   academic_performance 8 → 67   band Weak → Strong    total  84 → 143
  AAD   profile   academic_performance 8 → 46   band Weak → Solid     total  80 → 118
  ACT   profile   rigour_score         0 → 13                         total 134 → 147
  ACT   profile   rigour_score         0 → 6                          total  32 →  38
```

**No assertion was weakened.** The five `toBeGreaterThan` calls at
`scoring-golden.test.ts:1067-1071` are *additional* property assertions layered on top
of exact `toBe` assertions of the same nine values at lines 1053-1062. Nothing was
downgraded from `toBe`.

**Mutation-proven.** I copied the tree to a sandbox and mutated one table value at a
time:

| mutation | result |
|---|---|
| `ACC: 38 → 37` (invented value) | **2 tests fail** |
| `AAA: 70 → 71` (original value) | **1 test fails** |
| `A*A*D: 67 → 5` (reintroduces inversions) | **4 tests fail** |
| `CDD: 13 → 12` (Lucas's signature) | **1 test fails** |
| `DDD: 10 → 9` | **2 tests fail** |
| revert the ACT filter to `AP`-only | **3 tests fail** |
| **`?? 0 → ?? 8` (the table-miss fallback)** | **🔴 suite stays GREEN — 13/13 pass** |

The suite is genuinely sensitive to every table value **and completely blind to the
fallback**, because it only ever enumerates the 56 signatures that hit. That is the
same blind spot as the `U` bug, confirmed from the test side.

**🟠 The prose metadata was not regenerated and now contradicts the data.** The
`_known_bugs` blocks are string literals in `scoring-golden.test.ts` emitted verbatim
into the JSON; Phase 2 updated the numbers and left every one of them asserting the
bug is still present. The starkest case, in a single object in
`act-rigour-paths.golden.json`:

```json
{"case":"act_subjects_as_the_form_emits_them","subject_level":"A_LEVEL",
 "rigour_score":13, ... ,"note":"F-04: what every real ACT student gets — rigour 0"}
```

The note says 0; the field next to it says 13. Likewise
`a-level-signatures.golden.json` still declares *"30 of the 56 signatures are absent
from the lookup table and return the catch-all 8"*, and `student-profiles.golden.json`
still declares *"profiles 11 and 12 (A\*A\*D and AAD) score academic_performance 8"* —
both now false. The test file header still reads *"captures CURRENT behaviour, bugs
included"* and *"THESE FILES ENCODE BUGS ON PURPOSE. Do not 'correct' a value because
it looks wrong."*

These files are explicitly designated as the change-review artefact
(*"`git diff __tests__/scoring/golden/` is the change review"*). Shipping them with
documentation that contradicts their own data undermines the mechanism.

---

## Claim 6 — Lucas re-baselined 39 → 44

**VERIFIED, and the re-baseline is a genuine repair, not accommodation.**

I ran the `origin/main` scorer and the `HEAD` scorer against the identical fixture:

```
origin/main total: 39  band: Weak          HEAD total: 44  band: Weak

  preferred_subjects_alignment     13 ->     13
  rigour_score                     15 ->     15
  key_subject_grades                3 ->      3
  academic_performance              8 ->     13   <<< the only change
  ib_hl_strength / ee_relevance / a_level_project / tests_and_english   0 -> 0
```

`13 + 15 + 3 + 13 = 44` ✓. Exactly one component moved, by exactly the table delta
for `CDD` (8 → 13). Flags and band are unchanged.

**The old value was wrong, and the test was asserting the bug.** Control run, same
fixture with grades D, D, D instead of C, D, D:

```
origin/main:  CDD → total 39      DDD → total 40
```

Under `origin/main`, Lucas scored **lower with C, D, D than he would have with
D, D, D** — a strict-dominance inversion that the fixture pinned in place as correct.
`13` is dominance-consistent with its neighbours (`CCD = 16` > `CDD = 13` > `DDD = 10`,
`CDE = 11`) and my independent reconstruction of the stated fill method lands within
±1 of it. **The author changed a test to match new behaviour, and here the old
behaviour was genuinely wrong.** I found no case on this branch where a test was
changed to accommodate a regression.

---

## Indefensible / undisclosed — the short list

1. **🔴 `U`-grade signatures now score 0 (was 8), below `EEE`.** New regression, not
   in any commit message, invisible to the dominance check and to the golden suite.
   `A*A*U` → 0 of 80. The table's "exhaustive over the grade set" claim is false.
2. **🔴 The 1.2:1:0.8 fit-error comparison is not reproducible** (2 of 3 numbers fall
   outside the achievable range) and is **reversed** under every tie-robust metric —
   equal weighting fits the original table better on all six I tried.
3. **🟠 `AAE = 40`** — a +12 hand-adjustment presented as the output of a documented
   procedure.
4. **🟠 "The rigour mapping is documented as identical to A-level's"** is false;
   `calculus` and `statistics` differ, worth 4 of 200 points.
5. **🟠 Golden `_known_bugs` and row `note`s were not regenerated** — one row reads
   `"rigour_score":13` beside `"note":"…rigour 0"`.
6. **🟠 Tier filter fails open on `null`** (`search/page.tsx:364`) — "Reach only" now
   also shows every unknown-fit programme.
7. **🟠 Two tier implementations untouched** (`matching_engine.ts` `classify`, the
   percentile reassignment) despite `match-tier.ts` claiming "there are no others";
   `/matches` and search still disagree across the whole score range.
8. **🟠 Colour bands at 75, tier bands at 80** — new mixed-signal band at 75-79.
9. **🟡 19 of 56 signatures change `student_band`**, `A*A*D` by two bands
   (Weak → Strong). Direction disclosed; magnitude not.
10. **🟡 The partial-degradation path in `scoreProgramsForProfile` is unreachable**
    (route caps at 100 ids, batch size 200) — every scoring error is a page-wide 500.
11. **🟡 "25 originally-listed values"** — there are 26 signatures / 21 distinct values.

## Recommended before merge

- Decide what `U` means and encode it (add the 28 entries, or change the fallback
  to 8, or reject `U` at intake). Add a golden row that exercises a table miss —
  the suite currently cannot see this class of bug at all.
- Delete or rewrite the fit-error sentence in the `A_LEVEL_SIGNATURE_SCORE` doc
  comment. The table is defensible on dominance-clamping alone; it does not need
  a fabricated fit statistic to justify it.
- Regenerate the `_known_bugs` literals and the `note` strings in
  `scoring-golden.test.ts`, and rewrite the file header now that the files no
  longer encode bugs.
- Fix `search/page.tsx:364` (`result.tier ? … : false`, or exclude unscored rows
  when a tier filter is active).
- Either migrate `matching_engine.classify` / the percentile pass onto
  `TIER_THRESHOLDS`, or soften `match-tier.ts`'s "there are no others" to name
  what it does and does not govern.
- Reconcile `RigourTable.ACT` with `RigourTable.A_LEVEL`, or document why
  `calculus`/`statistics` are worth more to an ACT student.
