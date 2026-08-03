# Lane D — domain logic: scoring, tiers, matching

## Summary

All six Lane D items done. **5 findings: 0 P0, 0 P1, 2 P2, 3 P3.** No P0/P1.

**Claims executed vs inferred: 41 of 44.** Every number below came from a script or a
test run, not from reading. The three inferred claims are named in *Not verified*.

**Item 1 — monotonicity. Exhaustive, not spot-checked. 25,789 dominance-comparable
ordered pairs across every supported system; 0 strict inversions in the three-grade
A-level table and everywhere else — but 95 in the *partial*-profile branch (D-01).**
Per-domain: A-level 3-grade 2436/0 · A-level 4-grade 13650/0 · A-level 3-grade with
grades also in `subject_list` 2436/0 · A-level + ACT best-of 3024/0 · IB HL 3-subject
2436/0 · IB totals 48/0 · IB core 184/0 · ACT 1–36 70/0 · LNAT 42/0 · UCAT 100/0 ·
IELTS 18/0 · rigour ×3 programme types 120/0. Grade 4 of a 3-grade set is correctly
ignored (588/588 extensions equal their top-3 signature). The `A_LEVEL_SIGNATURE_SCORE`
table was parsed from source: **84 keys, 0 duplicates, 0 missing, 0 extra** — the
`?? 0` is unreachable for any in-enum signature.

**Item 2 — one tier rule. Confirmed: exactly 1.** My own 3-line-window scan over 469
`.ts/.tsx` files in `src/`, `scripts/` and `e2e/` found 2 candidate sites, both false
positives (they *count* tiers, they do not decide one). `__tests__/tiering/tier-rule-singularity.test.ts`
does read the tree rather than a hardcoded list — but its regexes have real blind spots
(D-03).

**Item 3 — boundaries.** Every threshold at exactly the boundary and ±1: tier 80/60
(and the fit-tier map, `tierFromScore`, and the fit-score colour tone all flip at the
same two numbers), ACT 18/21/24/27/30/32/34/36, IB 24/27/29/31/33/35/37/39/41/43, LNAT
19/23/26/29/31, UCAT p50/70/80/90, IELTS 6.5/7.5/8, IB HL grades 4–7. `mapBand` pinned
exactly by a 92,000-payload sweep producing 169 distinct totals over 0..182: cuts land
on **90 / 110 / 130 / 150 / 168** with the total below each in the lower band, and **0
totals map to two bands**.

**Item 4 — goldens. 0 unexplained values.** No golden changed against `origin/main`
(the suite is new on this branch), so I accounted for the two in-branch re-baselines.
Of the 56 baseline signatures, **28 changed `academic_performance` and all 28 had the
old catch-all value 8**; zero non-catch-all values moved; zero moved twice. Exactly
**19 of 56 change `contextual_band`** — matching HANDOFF §Product-decisions to the
signature. `ba73c97` added 28 rows, all U-bearing, and changed nothing else but
`rank_vector` (renumbered because U joined the grade list). `act-composite` and
`act-rigour-paths` changed only `rigour_score` and its dependent totals (F-04).
`student-profiles` changed 4 profiles: 2 A-level (F-01), 2 ACT (F-04). The three IB
goldens are byte-identical to baseline.

**Item 5 — nulls and edges.** `U` grades, empty/absent predicted-grade maps, empty
subject lists, cross-system payloads (IB programme + A_LEVEL subjects, A-level
programme + HL subjects, string vs numeric `grade_value`), ACT/AP. One hole found: the
`?? 0` is reachable through an off-enum grade *string* (D-02).

**Item 6 — `?? 'Reach'`.** The reasoning at `counsellor/data.ts:114-141` still holds
and both premises check out. Left alone, as instructed.

`npx jest __tests__/scoring/ __tests__/tiering/ __tests__/matching/ __tests__/student_scoring.test.ts`
→ **354 passed, 6 suites, exit 0** (`VERBOSE_SCORING=1`).

---

## Findings

### D-01 — 95 strict dominance inversions survive in the partial A-level branch, and the comment beside them says there are none
Severity: **P2** latent risk
Location: `src/lib/scoring/student_scoring.ts:585-600` (the claim is at `:587-592`)
Regression?: **NO** (pre-existing — `origin/main` has the identical predicate)

Evidence — exhaustive enumeration over the same-length grade multisets, scoring through
the public `scoreStudentProfile` and reading `breakdown.academic_performance`:

```
[1 A-level subject in subject_list]  pairs=21   strict-inversions=5
  table: A*:0 A:0 B:0 C:0 D:0 E:5 U:0
[2 A-level subjects in subject_list] pairs=308  strict-inversions=90
  table: A*A*:0 A*A:0 A*B:0 A*C:0 A*D:0 A*E:5 A*U:0 AA:0 … DD:0 DE:5 DU:0 EE:5 EU:5 UU:0
   ! A*A*=0 < A*E=5
   ! A*A*=0 < EE=5
   ! A*A=0  < AE=5
   … 87 more
[3 A-level subjects] pairs=2436 strict-inversions=0
[4 A-level subjects] pairs=13650 strict-inversions=0
```

The cause is `if (sorted.join('').includes('E')) return 5;` with `return 0` otherwise:
inside the partial branch an `E` is the *only* grade worth anything, so two A\*s score
0 and two Es score 5.

The comment directly above asserts the opposite:

> `note the policy is harsh: two A* grades score 0 here while a full DDD scores 10
> below. That compares different profile SHAPES rather than the same shape, so it is
> not a dominance inversion`

`A*A*` (0) and `A*E` (5) are the **same shape** — two grades each — and `A*A*` strictly
dominates `A*E`. The comment's own example (`A*A*` vs `DDD`) is indeed cross-shape; the
90 pairs inside the two-grade shape are not.

The reason nothing caught this is structural and is the same failure mode the U-grade
regression had: `buildSignatureRows`/`buildMonotonicity` in
`__tests__/scoring/scoring-golden.test.ts:280-350` enumerate `threeGradeSignatures()`
only, so the harness that certifies "zero inversions" never evaluates the branch that
has them. It is a missing *region*, not a wrong row.

Note the branch is reachable only via `subject_list` — `calculateALevelProfileScore`
ignores `a_level_predicted_grades` entirely when the map has fewer than 3 keys
(verified: predicted `{Maths:'A*', Physics:'A*'}` + `subject_list` EEE → 5).

Repro: `subject_list = [{Sociology, A_LEVEL, 'A*'}, {Philosophy, A_LEVEL, 'A*'}]`,
no predicted-grade map → `academic_performance = 0`. Change both grades to `'E'` →
`academic_performance = 5`.

Reachability: `intake-validation.ts:56` requires ≥3 A-level subjects, so the *complete
wizard* path cannot produce it. `academicInputSchema` (`intake-schema.ts:144`) has no
`min()` on `subject_list`, and `mapIntakeRowsToPayload` reads whatever rows are in
`student_subjects`, so a partially-populated or imported profile does.

Fix (smallest): score the partial branch off the same table, e.g. pad the signature to
three grades with `U` and look it up — `A*A*` → `A*A*U` = 52, `EE` → `EEU` = 5,
monotone by construction because the table is. Any change here moves student-visible
scores, so per §6 this is a **stop-and-ask**, not an autonomous fix. At minimum the
false sentence in the comment should go.

Test: extend `threeGradeSignatures()` to a `gradeMultisets(n)` for n ∈ {1,2,3,4} and
assert `violation_count === 0` for each. That assertion is red today for n ∈ {1,2}.

---

### D-02 — the `?? 0` fallback is still reachable, through a grade string the schema does not constrain
Severity: **P2** latent risk
Location: `src/lib/scoring/student_scoring.ts:607`; schema at `src/lib/profile/intake-schema.ts:89`; column at `supabase/schema.sql:120`
Regression?: **NEW** (on `origin/main` the same input hit `return 8`)

Evidence:

```
[off-enum grade strings reaching `?? 0` via subject_list]
  A* A* A* (control)                    academic_performance=80  total=89
  U U U   (worst legal signature)       academic_performance=5   total=14
  A* A* 'A-'                            academic_performance=0   total=9
  A* A* 'A* ' (trailing space)          academic_performance=0   total=9
  A* A* 'Pass'                          academic_performance=0   total=9
  A* A* '1'                             academic_performance=0   total=9
  A* A* a*   (lowercase — handled)      academic_performance=80  total=89

[does zod constrain subject grade_value to the 7 A-level grades?]
  grade_value="A*"   -> zod ACCEPTS
  grade_value="A-"   -> zod ACCEPTS
  grade_value="Pass" -> zod ACCEPTS
  grade_value="zzz"  -> zod ACCEPTS
  a_level_predicted_grades {Maths:'A-'} -> zod rejects (enum-guarded)
```

`a_level_predicted_grades` is enum-guarded (`aLevelGradeSchema`, `intake-schema.ts:80`).
`subject_list[].grade_value` is not — it is `z.union([finiteNumber(), z.string().max(50)]).nullable()`,
and the column is bare `text` with no check constraint. The subject-list branch is the
one `calculateALevelProfileScore` uses whenever the predicted map has <3 keys, and
`mapIntakeRowsToPayload` (`student_score_loader.ts:83`) casts DB rows straight through.

This is precisely the class the `U` fix was written for and is documented against at
`student_scoring.ts:504-517` — *"a missing ROW is not an inversion between rows. The
domain was assumed rather than read off the type."* The domain was read off
`A_LEVEL_GRADES`, which is what the *form* offers; it was not read off the type the
*scorer* actually accepts. The exhaustive dominance check cannot see this either.

Two policies now exist for the same unknown-grade input: `?? 0` here, and
`?? 4` (a `C`) in `matching_engine.aLevelToIbEquivalent:422`.

Repro: any `student_subjects` row for an A-level student with `grade_value = 'A* '`
(trailing space) or an imported value like `'A-'` → the whole 80-point academic
component collapses to 0, below `UUU`'s 5.

Fix (smallest, no score movement for valid data): normalise and validate at the seam —
trim + uppercase, and map anything not in the 7-grade set to `'U'` before building the
signature. Belt-and-braces: tighten `studentSubjectSchema.grade_value` to
`z.union([finiteNumber(), aLevelGradeSchema])` for non-IB rows, and add a check
constraint to `student_subjects.grade_value`.

Test: `expect(ap(['A*','A*','A- '])).toBeGreaterThanOrEqual(ap(['U','U','U']))` — red
today (0 vs 5).

---

### D-03 — the gate that keeps the tier rule singular misses the most idiomatic fifth implementation
Severity: **P3** quality
Location: `__tests__/tiering/tier-rule-singularity.test.ts:174-177` (`TIER_FROM_LITERAL`) and `:206` (`DECLARES_TIER_FN`)
Regression?: **NEW** (the gate is new on this branch)

The suite's substantive claim is true — there is exactly one implementation today, which
I confirmed independently. This finding is against the gate's ability to *keep* it true.
`TIER_FROM_LITERAL` requires the comparison and the tier literal within 60 characters
**on the same line**; `DECLARES_TIER_FN` requires an explicit `: MatchTier` / `: FitTier`
return annotation. Probed against the committed patterns:

```
CAUGHT   one-line ternary (the known shape)
MISSED   multi-line if/return       if (score >= 80) { \n return 'Safe'; \n }
MISSED   if/return on two lines, no braces
MISSED   named const threshold      const SAFE_AT = 80; if (score >= SAFE_AT) …
MISSED   switch (true) { case score >= 80: … }
MISSED   lookup table by bucket     const B = [[80,'Safe'],[60,'Match']];
MISSED   >60 chars between comparison and literal

SEEN      (): MatchTier =>            /   (): MatchTier {
INVISIBLE inferred return type       (s) => (s >= 80 ? 'Safe' : 'Reach')
INVISIBLE MatchTier | undefined
INVISIBLE Promise<MatchTier>
```

The header says both halves "were confirmed to go red before being committed" — by
reverting the `chances-calculator` fix and the fit-score band, both of which are
one-line ternaries. The gate is verified against the shape it was written from, not
against the shape a future author is most likely to write.

Fix: match across a small line window (strip comments, join 3 lines) rather than within
one line; widen `DECLARES_TIER_FN` to `MatchTier|FitTier` anywhere in a return position
including `Promise<>` and `| undefined`; and add a `SAFE_AT`-style named-constant probe.

Test: add a fixture file containing the multi-line `if (score >= 80) { return 'Safe'; }`
shape to the scanned set and assert the scan reports it. Red today.

---

### D-04 — match-tier.ts documents a permanent data contradiction that the code does not have, and proposes a production migration on that premise
Severity: **P3** quality (a doc/code disagreement, per §8)
Location: `src/lib/matching/match-tier.ts:70-97`
Regression?: **NEW**

The comment states:

> `loadTierByProgram` has **NO** recompute path and no TTL, so a row written under the
> old 70/50 rule keeps its old tier on /applications, the parent progress board and the
> cost explorer **FOREVER** … An earlier version of this comment called that "a window
> until the cache is rebuilt". It is not; nothing rebuilds it.

Something does. `service.ts:41` sets `PROGRAM_CACHE_TTL_MS = 24h`; `service.ts:325-327`
recomputes when the cache is older than that **or** when the profile changed; and
`service.ts:905-919` does `delete().eq('profile_id', profileId)` followed by a full
re-insert with `breakdown.tier = match.tier`, computed by `matchTierFromScore`.
`loadTierByProgram` (`lib/data/applications.ts:229-252`) reads that same
`student_matches` table. `loadMatchesForProfile` is called from `/matches`,
`dashboard/_components/matches-peek.tsx` (the post-login home) and `/api/match`.

So for any student who loads the dashboard or `/matches`, a stale 70/50 tier survives at
most 24 hours, not forever. The earlier version of the comment was correct and was
replaced with a stronger, wrong one. The residual case is a student who visits only
`/applications` or the parent portal and never a page that recomputes.

This matters because the comment proposes a production `update student_matches …`
migration and frames it as the only way to close a permanent contradiction. It is at
most an accelerator for a self-healing window.

Fix: restore the accurate framing — bounded by `PROGRAM_CACHE_TTL_MS` and by whether the
student visits a recomputing surface — and demote the migration to optional.

Test: an assertion that the cache write path deletes and reinserts
(`expect(service).toMatch(/student_matches'\)\.delete\(\)\.eq\('profile_id'/)`) beside
the existing singularity assertions, so the comment and the code cannot drift again.

---

### D-05 — five golden-file headers still describe the pre-fix behaviour, beside the post-fix values
Severity: **P3** quality
Location: `__tests__/scoring/golden/{a-level-signatures,act-rigour-paths,student-profiles}.golden.json` (strings generated from literals in `scoring-golden.test.ts`)
Regression?: **NEW**

`scoring-golden.test.ts:17-20` instructs every future reader:

> THESE FILES ENCODE BUGS ON PURPOSE. Do not "correct" a value because it looks wrong.
> The known-wrong values are catalogued in the `_known_bugs` block of each golden file.

Those blocks were not updated when the values were:

| File | Header | Says | Actually |
|---|---|---|---|
| `a-level-signatures` | `_known_bugs` | "30 of the 56 signatures are absent from the lookup table and return the catch-all 8, producing strict-dominance inversions" | 84 signatures, table complete, 0 inversions |
| `a-level-signatures` | `_columns` | "rank_vector (A\*=6 … E=1…)" | `A*=7 … U=1` since `ba73c97` |
| `a-level-signatures` | `_source` | "student_scoring.ts:480" | the function is at `:570` |
| `act-rigour-paths` | `_known_bugs` + the A_LEVEL row's `note` | "the A_LEVEL row is what every real ACT student gets … rigour 0" | that row reads `"rigour_score":13` on the same line as the note |
| `student-profiles` | `_known_bugs` | still lists F-01 and F-04 as live bugs | both fixed; the profile values were re-baselined for them |

A reader following the file's own instructions concludes 30 signatures are still broken
and that the ACT `A_LEVEL` row is still scoring 0.

Fix: update the five literal strings in `scoring-golden.test.ts` and regenerate. This is
the one place `UPDATE_GOLDEN=1` is the right tool, and the resulting diff should touch
only header strings.

Test: n/a — a header-string edit. If it needs a guard, assert that no `_known_bugs`
entry names a finding ID that `docs/audit/` records as fixed.

---

## What I checked and found clean

- **Exhaustive monotonicity, 25,789 dominance-comparable ordered pairs, 0 strict
  inversions** outside D-01's partial branch. Every domain listed in the Summary.
  Enumerated, not sampled; every score obtained by calling the public
  `scoreStudentProfile`, so the private helpers are exercised through the real path.
- **`A_LEVEL_SIGNATURE_SCORE` integrity**, parsed from source: 84 literal entries, 84
  distinct keys, 0 duplicates (a duplicate key would silently win-last), and the key set
  is exactly the 84 multisets of `['A*','A','B','C','D','E','U']` — none missing, none
  extra. The lowest value is 5 (`UUU` and friends), so no in-enum signature reaches
  `?? 0`.
- **U grades are genuinely fixed.** `A*A*U` = 52, `UUU` = 5, all 28 U-bearing rows
  present, and U-bearing signatures participate in the dominance check as first-class
  members.
- **Exactly one score→tier implementation.** Independent 3-line-window scan over 469
  files in `src/`, `scripts/`, `e2e/`: 2 hits, both counting tiers rather than deciding
  one (`counsellor/_analytics-client.tsx:348`, `chat/tools/counsellor-read.ts:120`).
  `assignTierFromFit`, the percentile reassignment, `tier_fit`, and
  `chances-calculator`'s `diff >= 5` chain are all gone. `classifyFitTier`,
  `tierFromScore` and the fit-score colour buckets all derive from `TIER_THRESHOLDS`.
- **Colour and label flip together.** `getFitScoreVisuals` tone changes at exactly 80
  and 60, the same two numbers as the tier pill; the old 75/45 mismatch is closed.
- **Every threshold at boundary and ±1** — the full list is in the Summary. Plus:
  `matchTierFromScore(null|undefined|NaN)` → `null` (unknown stays distinguishable from
  Reach), `79.5` → Match, `59.9` → Reach.
- **`mapBand` cuts pinned exactly** at 90/110/130/150/168 across 92,000 payloads and
  169 distinct totals; 0 totals map to two bands.
- **Golden accounting complete: 0 unexplained values.** Detail in Summary item 4. The
  three IB goldens are byte-identical to the pre-fix baseline, which is the right
  answer — nothing on the IB path was touched.
- **`matching_engine` rename is behaviour-neutral.** `tier_fit` → `admission_band` and
  `Category` → `AdmissionCategory` are pure renames; the four band values are preserved
  verbatim (they are persisted in `simulation_results.algorithm_result`);
  `chance_percent`, `classify`'s thresholds and `admissionProbability` are untouched.
- **`aLevelToIbEquivalent` is monotone** — `A*=7 … U=1`, top 3 summed, clamped 24..43.
- **Nothing else moved with the scoring change.** The whole non-comment diff of
  `service.ts` is: the 70/50 fallback → `matchTierFromScore`, the `tier_fit` rename,
  `assignTierFromFit` deleted, the percentile reassignment deleted, and the unscored-
  programme null/error-handling change. The per-band selection caps, the recognition-
  boosted sort and the cache shape are unchanged. Deleting the reassignment does not
  change result *ordering*: it sorted by score, and the recognition sort immediately
  after always overwrote that order.
- **`?? 'Reach'` (item 6).** Both premises hold: `matchTierFromScore` does return `null`
  for unknown, and `'Reach'` is the conservative direction — consistent with the same
  argument that chose 80/60. Left untouched, as instructed.
- **`tierFromBreakdown` validates.** A junk stored value (`'Bogus'`) yields `null`
  rather than passing through as a `MatchTier`, and the counsellor caller then falls
  back to the score-derived tier.
- **Suite green**: `__tests__/scoring/`, `__tests__/tiering/`, `__tests__/matching/`,
  `__tests__/student_scoring.test.ts` → 354 passed / 354, exit 0, `VERBOSE_SCORING=1`.

## Not verified

- **The "23 consumers" figure** in `counsellor/data.ts:132` and HANDOFF line 78. A
  `grep '\.tier'` over `src/app/counsellor` + `src/lib/counsellor` returns 30 lines, but
  that count includes `.tier` on types other than `CounsellorMatch`. The order of
  magnitude is right; I did not resolve each site to its declaring type, because the
  figure is rhetorical and item 6 says not to change the code.
- **Whether D-02's off-enum grades exist in the production `student_subjects` table.**
  Reading production is forbidden by §2.1. I verified the *type-level and schema-level*
  reachability (zod accepts any string ≤50; the column is bare `text` with no check
  constraint; the loader casts through) and the *behavioural* consequence, but not the
  current row population.
- **Whether the 80/60 numbers are right as admissions policy.** Out of scope by
  instruction, and HANDOFF §Product-decisions 2 already records that nobody with
  admissions knowledge has reviewed them.
- **Mutation testing of the gates.** I probed `tier-rule-singularity`'s regexes against
  synthetic snippets in the scratchpad rather than by editing `src/`, because this lane
  is read-only. The blind spots in D-03 are therefore demonstrated at the regex level,
  not by a live red run. Lane F owns mutation testing.
- **`__tests__/scoring_validation/batch_runner.ts` and `simulate-profiles.ts`** — the
  simulation harness is excluded from the jest run by `testPathIgnorePatterns` and I did
  not execute it.
