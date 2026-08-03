# Ascenda — Domain Logic Audit (matching / scoring / tiering / business rules)

Scope: `src/lib/matching`, `src/lib/scoring`, `src/lib/tiering`, `src/lib/catalog`,
`src/lib/university-search`, `src/lib/applications`, `src/lib/profile`,
`src/lib/validation`, `src/lib/constants`, `src/lib/config`, `src/lib/chat`,
`src/lib/theme/categories.ts`, `src/lib/data/student-demo-data.ts`, and the tests
that cover them. Read-only audit; no code changed, no DB queried.

---

## Current state

### Module map

| Module | Owns | Purity |
|---|---|---|
| `src/lib/profile/intake-types.ts` (106) | `StudentProfilePayload` — the closest thing to a canonical student model | pure types |
| `src/lib/scoring/student_scoring.ts` (795) | Student *strength* score 0–200 + band + eligibility/readiness flags. Subject rules, rigour, grade→points, IB/A-level/ACT academic performance, tests & English | **pure** |
| `src/lib/scoring/activities_scoring.ts` (122) | Activities sub-score, capped 20. Exported tunable weights | **pure** |
| `src/lib/scoring/student_score_loader.ts` (158) | DB rows → `StudentProfilePayload` (`mapIntakeRowsToPayload`) + a Supabase fetcher | mixed (mapper is *nearly* pure — see F-11) |
| `src/lib/tiering/course_tiering.ts` (154) | `CourseRecord`/`EnrichedCourseRecord` shape; university score, selectivity score, `total_course_score`, `course_tier` 1–5 | **pure**, but the compute half is effectively **dead** (see F-12) |
| `src/lib/matching/matching_engine.ts` (567) | The real matcher: cluster→field resolution, postgrad/quality/budget gates, dedup, sigmoid admission probability, Safety/Target/Reach classification, A-level→IB and ACT→IB conversions | **pure** |
| `src/lib/matching/service.ts` (1023) | Orchestration: profile load, catalogue paging, `course_scoring_v1` batching, student-score persistence, ranking, per-tier capping, recognition pinning, **tier re-derivation**, recognition-boosted sort, cache write/read. Plus `scoreProgramsForProfile` for the search page | **impure throughout** |
| `src/lib/matching/types.ts` / `match-tier.ts` | `EnrichedMatch`, `MatchTier = 'Reach'\|'Match'\|'Safe'` | pure types |
| `src/lib/catalog/visibility.ts` (41) | Demo/hidden-programme filter | impure at module load (env) |
| `src/lib/university-search/search-params.ts` (345) | Search filter model + URL/chip serialisation | **pure**, well-tested |
| `src/lib/theme/categories.ts` (372) | Presentation tokens **plus** three real classifiers: `classifyFitTier`, `classifyDeadlineUrgency`, `classifyCompletion` | pure, but rules live in a *theme* file |
| `src/lib/profile/completion.ts`, `steps.ts`, `pathway-status.ts` | Profile completeness + flag→prose | pure |
| `src/lib/validation/profile.ts` (82) | Zod schemas for a *different, unused* profile model | **dead** (F-18) |
| `src/lib/applications/*` | Track/checklist server actions, due-date labels, optimistic status queue | impure by design (adapters) |
| `src/lib/chat/tools/*` + `registry.ts` | Agentic tool registry: read tools execute inline, write tools become confirm cards. Clean contract in `tools/types.ts` | adapters; the registry itself is a good boundary |
| `src/lib/data/student-demo-data.ts` (650) | Static fixtures for Toolbox / dashboard widgets / some counsellor tabs | fixtures, but leaking (F-15) |

### Call graph (ranked matches — `/matches`, `/dashboard`, `/api/match`)

```
page/route
  └─ loadMatchesForProfile(supabase, profileId, {resultLimit})      service.ts:246
       ├─ read student_academic_input / lifestyle / subjects / admissions_tests / activities
       ├─ read student_matches (cache) ──► if fresh: re-sort by recognition, slice, RETURN
       ├─ resolveTargetFields(clusters)                             matching_engine.ts:168
       ├─ page programs (per-field or offset), pool of 3            service.ts:496
       ├─ filterVisiblePrograms                                     catalog/visibility.ts:38
       ├─ batch course_scoring_v1 (200 ids × pool of 3)             service.ts:619
       ├─ mapCourseScoringRow (+ programs.metadata injection)       service.ts:137
       ├─ read universities.recognition_score
       ├─ mapIntakeRowsToPayload                                    student_score_loader.ts:31
       ├─ scoreStudentProfile ──► calculateActivitiesScore          student_scoring.ts:700
       ├─ WRITE student_scores (upsert)                             service.ts:707
       ├─ rankCourseMatches(payload, score, courses)                matching_engine.ts:463
       │     └─ per course: isPostgrad → isSuspiciousScore → matchesField
       │                    → estimateFeeUsd → classifyCourseChance → dedup
       │     └─ classifyCourseChance → classify() → admissionProbability()
       ├─ per-tier cap (computeLimit/3) + recognition≥9 pinning     service.ts:760
       ├─ assignTierFromFit  (Safety→Safe, Target→Match, else Reach) service.ts:793
       ├─ ⚠ percentile TIER REDISTRIBUTION when one tier >75%        service.ts:843
       ├─ recognition-boosted re-sort                               service.ts:857
       └─ WRITE student_matches (delete-all + batched insert)       service.ts:895
```

### Call graph (search-page fit scores — `/university-search/search`)

```
useSearchResults ──► POST /api/match/score ──► scoreProgramsForProfile   service.ts:929
                                                 ├─ mapIntakeRowsToPayload
                                                 ├─ resolveStudentIbEquivalent
                                                 ├─ batch course_scoring_v1
                                                 ├─ classifyCourseChance per row
                                                 └─ ⚠ null-course fallback for misses  service.ts:1012
mapRows ──► tierFromScore(score)  components/university-search/types.ts:46
              └─ classifyFitTier   theme/categories.ts:236   (≥80 Safe, ≥60 Match)
```

Note the two paths reach the **same** `chance_percent` number but attach **different tiers** to it
(see F-02).

### Downstream consumers of the persisted result

`student_matches.breakdown.tier` is read (never recomputed) by:
`lib/counsellor/data.ts:107`, `lib/parent/data.ts:179`, `lib/chat/context.ts:208`,
`lib/chat/tools/student-read.ts:207`. `lib/counsellor/data.ts:104` has its own
score→tier fallback with *different thresholds*.

---

## Findings

### [CRITICAL] A-level academic-performance table has 30 unreachable grade combinations; strong profiles score below weak ones
`src/lib/scoring/student_scoring.ts:480-540` (`calculateALevelProfileScore`), catch-all `return 8` at `:539`.

The score is a hardcoded chain of 26 exact string comparisons against a sorted
grade signature. Enumerating all 56 distinct 3-grade signatures over
{A\*,A,B,C,D,E}: **30 of them (54%) hit the catch-all `8`.** Because
`academic_performance` is worth up to 80 of the 200-point total, this is the
single largest scoring component and it is wrong for over half its input domain.

Concrete inversions (verified by enumeration):

| Signature | Raw grade points | Score | Compare |
|---|---|---|---|
| `A*A*D` | 17 | **8** | `DDD` (raw 9) → 10 |
| `A*AD` | 16 | **8** | `ABD` (raw 14) → 40 |
| `AAD` | 15 | **8** | `BBC` (raw 14) → 36 |
| `ACC` | 14 | **8** | `CCD` (raw 11) → 16 |
| `BBD` | 13 | **8** | `CCC` (raw 12) → 24 |

Failure scenario: a student predicted **A\*A\*D** (a realistic Oxbridge-adjacent
profile with one weak third subject) scores 8 where a **DDD** student scores 10.
Their band drops from `Strong`/`Very strong` to `Weak`, `student_scores` is
persisted with that band, the counsellor cohort dashboard flags them, and — via
`resolveStudentIbEquivalent`, which uses a *different, correct* linear formula —
their programme matches don't move, so the profile page and the match page
contradict each other.

Fix: delete the table. Replace with the linear formula already proven in
`matching_engine.ts:393-407`:

```ts
const A_LEVEL_POINTS: Record<string, number> = { 'A*': 7, A: 6, B: 5, C: 4, D: 3, E: 2, U: 1 };
// top-3 sum ranges 3 (UUU) … 21 (A*A*A*)
const calculateALevelProfileScore = (grades: string[]): number => {
  const pts = grades.map(g => A_LEVEL_POINTS[g.trim().toUpperCase()]).filter(n => n !== undefined);
  if (pts.length === 0) return 0;
  const top3 = pts.sort((a, b) => b - a).slice(0, 3);
  const sum = top3.reduce((a, b) => a + b, 0);
  const scale = top3.length / 3;                    // partial profiles pro-rata
  return Math.round(clamp01((sum - 6 * scale) / (21 - 6)) * 80);
};
```
Then pin the current listed 26 signatures as a golden-file test so the change is
visible and intentional (it *will* move existing scores — see "Migration order").

---

### [HIGH] Two live `tierFromScore` implementations with different thresholds — same programme, different tier on different pages
- `src/components/university-search/types.ts:46` → `classifyFitTier` (`theme/categories.ts:236-241`): **Safe ≥ 80, Match ≥ 60, else Reach**
- `src/lib/counsellor/data.ts:104-105`: **Safe ≥ 70, Match ≥ 50, else Reach**
- `src/lib/matching/service.ts:388-390` (cache-read fallback): **Safe ≥ 70, Match ≥ 50** — agrees with counsellor, not with search
- `src/components/toolbox/chances-calculator.tsx:20-25`: a fifth rule entirely (`predicted − min ≥ 5` safety, `≥ 1` match)

`components/university-search/types.ts:37-39` literally claims "Single source of
truth for score→tier thresholds lives in `classifyFitTier`". It isn't.

Failure scenario: a programme scored **65**. `/university-search/search` shows
it as **Reach**; the counsellor's student detail tab shows the same programme as
**Match**; a cached `/matches` row that lost its stored `breakdown.tier` also
resolves to **Match**. The student's tier-pill filter (`tiers` in
`search-params.ts:41`) then hides a programme the counsellor is telling them is a
match.

Fix: one exported `classifyMatchTier(score: number): MatchTier` in a
`lib/matching/tiers.ts`, imported by all four sites; delete `classifyFitTier`'s
threshold logic and have it delegate. Pick one threshold pair deliberately —
they are not interchangeable, 70/50 keeps roughly 3× more programmes out of
Reach than 80/60.

---

### [HIGH] Programmes missing from `course_scoring_v1` are scored 90–95% and sorted/tiered as the *safest* results
`src/lib/matching/service.ts:1009-1020`.

```ts
const nullCourse = { min_ib_score: null, total_course_score: null, course_selectivity_score: null } …
const fallbackScore = classifyCourseChance(studentIb, nullCourse).chancePercent;
for (const id of ids) if (!(id in scores)) scores[id] = fallbackScore;
```

Tracing `classify()` (`matching_engine.ts:255-292`) with all-null inputs:
`sc = courseScore ?? 40` (`:261`) → `effectiveMin = tierImpliedMinIb(40) = 25`
→ `prestigePenalty = 0` → `effGap = studentIb − 25`. Computed:

| studentIb | chance | category |
|---|---|---|
| 24 | 44% | reach |
| 30 | 82% | safety |
| **33 (the default)** | **90%** | **safety** |
| 39 | 94% | safety |
| 45 | 95% | safety |

A programme we know **nothing** about is presented to a typical student as a
90% admit chance and, via `tierFromScore` (≥80), a **Safe** match. The same
batching path also swallows failed batches silently (`:982 if (error) continue;`),
so a `course_scoring_v1` timeout converts an entire page of results into
confident 90% Safes. The comment at `:1009-1011` frames this as "no card is ever
left blank" — the cure is worse than the disease.

Fix: return `null`/absent for unscored programmes and render "Fit unknown"
(`getFitScoreVisuals` at `theme/fit-score.ts:20-27` already has an `unknown`
tone and a null branch). If a number is required, floor the fallback at the
population median rather than deriving it from an assumed course score of 40.

---

### [HIGH] ACT students always score 0 on subject rigour — the `RigourTable.ACT` map is unreachable
`src/lib/scoring/student_scoring.ts:384-392`:

```ts
const relevantSubjects =
  programmeType === 'IB'   ? subjects.filter(s => s.level === 'HL')
: programmeType === 'ACT'  ? subjects.filter(s => s.level === 'AP')
:                            subjects.filter(s => s.level === 'A_LEVEL');
if (relevantSubjects.length === 0) return 0;
```

Nothing in the codebase ever produces `level === 'AP'`:
- `src/app/profile/_components/StudentIntakeForm.tsx:192` and `:752` default every non-IB subject to `'A_LEVEL'`.
- `StudentIntakeForm.tsx:1884-1886` — the level `<Select>` renders `HL`/`SL` for IB and **only `A_LEVEL`** otherwise, including ACT.
- `src/lib/scoring/student_score_loader.ts:37` — `level: subject.level ?? (programmeType === 'IB' ? 'HL' : 'A_LEVEL')`.

So an ACT student loses the whole rigour component (up to 15 pts of 200, ~1
band) unconditionally, and the carefully-written `RigourTable.ACT` block at
`student_scoring.ts:206-222` is dead configuration.

Fix (either): accept `'A_LEVEL'` as the ACT bucket, or add `AP` to the intake
form's level select. The first preserves current data; the second is more
correct long-term. Both change ACT scores, so gate behind a golden-file test.

---

### [HIGH] The engine's tier is thrown away and replaced by a percentile split whenever one tier dominates
`src/lib/matching/service.ts:839-853`.

```ts
const dominantTierPct = Math.max(...Object.values(tierCounts)) / (matches.length || 1);
if (dominantTierPct > 0.75 && matches.length >= 6) {
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  matches = sorted.map((m, i) => {
    const pct = i / sorted.length;
    return { ...m, tier: pct < 0.35 ? 'Safe' : pct < 0.65 ? 'Match' : 'Reach' };
  });
}
```

The comment concedes this is "common when catalog programs lack real selectivity
data" — i.e. this is the normal path for most of the 119k catalogue, not an edge
case. When it fires:

1. The per-tier cap immediately above (`:760-788`) has *already* selected a
   balanced Reach/Target/Safety set using **engine** tiers, then pinned
   recognition≥9 Reaches. The redistribution overwrites all of that, so the
   pinning work is silently discarded.
2. The redistributed tier is what gets **persisted** into
   `student_matches.breakdown.tier` (`:869`), which is then the authoritative
   tier for the counsellor dashboard, the parent portal, and the chat assistant.
3. "Reach" now means "bottom 35% of *this student's shortlist*" rather than
   "admission is a stretch" — but the copy shown to students
   (`lib/constants/text.ts:42-44`) still says "Highly competitive programs where
   admission is a stretch". A student whose whole result set is safeties is told
   a third of them are stretches.

Fix: drop the redistribution. If a balanced spread is a product requirement,
express it as a *display* grouping ("Your best 10 / next 10 / long shots"), never
as the tier that gets persisted and quoted back by the counsellor and the
assistant.

---

### [MEDIUM] `EnrichedMatch.breakdown` is 3/4 placeholder
`src/lib/matching/service.ts:826-832`:

```ts
breakdown: {
  eligibility: match.excluded ? 0 : 100,          // always 100 — excluded rows filtered at :719
  academicFit: Math.min(100, Math.round(studentScore.total_score / 2)),  // identical for every match
  preferenceFit: 0,                                // literal zero, always
  outcomes: course.total_course_score
}
```

Three of the four components carry no per-programme signal, yet the shape is
persisted into `student_matches.breakdown` and is a public field of the
`EnrichedMatch` domain type. `preferenceFit: 0` is particularly bad — the
`lifestyle_preference` data (`campus_size`, `desired_location_type`,
`teaching_style`, `extracurricular_interests`) is loaded, mapped, and then never
consulted by the matcher at all. `PreferencesFilters`
(`matching_engine.ts:26-37`) exists and `filterCourses` (`:326-338`) implements
it, but `rankCourseMatches` is only ever called **without** a `filters` argument
(`service.ts:718`, `batch_runner.ts:124`, `matching_demo.ts:242`).

Fix: either populate the fields or delete them from the type. Wire
`lifestyle_preference` → `PreferencesFilters` at the `service.ts:718` call site
to give `preferenceFit` a meaning.

---

### [MEDIUM] Missing academic data silently becomes a median-strength student
Every conversion has a confident default rather than an "unknown" state:

| Site | Default | Effect |
|---|---|---|
| `matching_engine.ts:459` | `33` (population median IB) when a student has no IB, no A-level grades and isn't ACT | matched as if mid-strong |
| `matching_engine.ts:396` | `33` when `predictedGrades` is null | same |
| `matching_engine.ts:398` | `?? 4` (a grade of **C**) for any unrecognised grade string | a typo'd/blank grade becomes a C |
| `matching_engine.ts:422` | `33` when `actScore` is falsy — note `0` is falsy, so ACT 0 → 33 | same |
| `matching_engine.ts:261` | `sc = courseScore ?? 40` | unknown course treated as mid-tier |
| `matching_engine.ts:231` | `return 28` when score is null | |
| `service.ts:429`, `:778`, `:858`, `:888` | `recognition_score ?? 3` | unknown universities get a fixed mid boost |

The composition of these is what produces F-03. There is no way for the domain
to express "we cannot score this yet", so the UI can never say so either.

Fix: make the return type `number | null` through the classifier chain and let
the *adapter* decide the display fallback. At minimum, distinguish
`aLevelToIbEquivalent`'s "no grades" (should be `null`) from its "grades present
but unparseable" (should be an error/flag, not a silent C).

---

### [MEDIUM] `scoreStudentProfile` ignores `secondary_clusters`; the matcher uses them
- `student_scoring.ts:704` — `const clusters = academic_input.intended_clusters;` (primary only). Feeds eligibility, preferred alignment, key-subject grades, admissions-test requirements, and the EE/EPQ relevance bonus.
- `matching_engine.ts:469-473` — `[...intended_clusters, ...secondary_clusters]`. Feeds field targeting.
- `service.ts:454-457` — same, for the DB-level field filter.

Failure scenario: a student with primary `humanities`, secondary
`medicine_dentistry` is *shown* medicine programmes but is never flagged for the
missing UCAT (`ADMISSIONS_TEST_REQUIREMENTS` at `student_scoring.ts:296-307`) and
never gets `required_subjects_missing:medicine_dentistry`. The
`summarisePathwayStatus` pill on `/profile` says "Pathways open" while their
match list is full of programmes they are ineligible for.

Fix: one `resolveClusters(payload)` helper used by both; decide explicitly
whether secondary clusters gate eligibility (they should, at reduced weight).

---

### [MEDIUM] Rounded breakdown components don't sum to the rounded total
`student_scoring.ts:758-786`. `totalRaw` is the sum of **unrounded** floats
(`preferredAlignment = avg*4`, `rigourScore = avg*3`, `ibHlStrength = sum/60*16`
are all non-integral); `total_score = Math.round(totalRaw)` while each
`breakdown.*` field is separately `Math.round`ed.

Failure scenario: a breakdown of `{18, 14, 8, 60, 11, 10, 0, 12, 8}` displays as
summing to 141 while `total_score` reads 140. The counsellor student-detail tab
and the batch runner both show the components alongside the total. The batch
runner's `withoutActivities = result.total_score - b.activities.total`
(`batch_runner.ts:95`) mixes the two scales directly.

Fix: round once, at the component level, and define `total = Σ components`.
Changes some totals by ±1–2 — pin with golden files first.

---

### [MEDIUM] `tests_and_english` takes the max, not the sum — English proficiency is invisible for law/medicine students
`student_scoring.ts:640-688`. LNAT (0–20), UCAT (0–20) and English (0–18) are all
pushed onto one `testScores` array and reduced with
`Math.max(...testScores)` (`:686`).

A law applicant with an Oxford-tier LNAT (20) and IELTS 8 (18) scores **20**, the
same as one with the LNAT and no English evidence at all. A medicine applicant
with a 95th-percentile UCAT gets zero credit for English. Meanwhile
`english_required === false` (native speaker) awards a flat 18 (`:670-671`), so a
native-speaking student with *no* admissions test outscores a non-native student
with a 90th-percentile UCAT and IELTS 7 by 2 points.

Also in this function: UCAT scoring reads only `percentile` (`:658`), so a student
who enters the raw 900–3600 score with no percentile gets 0; and
`english_required === null` (the "Not sure" answer, per
`profile/completion.ts:44-52`) falls through to status-based scoring and
typically yields 0.

Fix: name the intent. If it's "best evidence of test readiness", separate the
English component out and sum the two. Either way document the cap.

---

### [MEDIUM] Cached and freshly-computed match orders differ for tied scores
- Fresh: `rankCourseMatches` sorts by `(chance_percent desc, course_tier asc)` and returns `0` on full ties (`matching_engine.ts:560-564`), then `service.ts:857-860` re-sorts by `score + rec/10*5`. Both are stable over Map-insertion order (which is deterministic given deterministic paging).
- Cached: rows come back from PostgREST `.order('score', {ascending:false})` (`service.ts:345`) — **no unique tiebreaker** — then are re-sorted by the same recognition key (`:432-436`).

`chance_percent` is an integer clamped to 5–95, so across a 300-row set ties are
the norm, not the exception. Postgres is free to return tied rows in any order,
and the pagination at `:338-357` compounds it (a tied row can appear on two
pages or none).

Failure scenario: a student loads `/matches`, sees programme X third; reloads
within the 24h TTL and sees X seventh. Nothing changed. Worse, the paginated
cache read can *drop* rows across page boundaries.

Fix: add `.order('program_id', { ascending: true })` as a unique secondary sort
on the cache read, and make the in-memory comparators total by falling back to
`program_id`.

---

### [MEDIUM] `resolveStudentIbEquivalent` double-counts core points if `ib_total_points` was ever written on the /45 scale
`matching_engine.ts:445-452` and `student_scoring.ts:726-729` both compute
`ib_total_points + ib_core_points`, on the documented assumption that
`ib_total_points` is the /42 subject sum. That holds for the current wizard
(`StudentIntakeForm.tsx:1140` writes `ibSubjectSum`) and the profile page label
says `/42` (`app/profile/page.tsx:120`). But nothing enforces it: the column is a
plain integer, `persist-intake.ts:65` passes it straight through, and
`validation/profile.ts:30` (dead, but indicative) validates `ibTotal` as
`max(45)`.

Any row written by an import, an admin edit, or an older client with a /45 total
is over-counted by up to 3 points on both the matching and the scoring path. The
matcher clamps at 45 (`matching_engine.ts:448`); `calculateIbTotalScore` does not.

Fix: add a CHECK constraint or a normalising accessor
(`ibTotalOn45(academic_input)`) used by both call sites, and rename the column
comment/label to make the scale unambiguous.

---

### [MEDIUM] `mapIntakeRowsToPayload` is impure — `new Date().getFullYear()`
`src/lib/scoring/student_score_loader.ts:69`:
`graduation_year: academic.graduation_year ?? new Date().getFullYear()`.

This is the one impurity inside what is otherwise the pure row→payload mapper
shared by both the score loader and `service.ts:698`. It makes any snapshot test
over the payload time-dependent, and it silently backfills a nonsense value
(a graduation year equal to *this* year) rather than leaving it null.
`lib/counsellor/data.ts:476` has a second, *different* default for the same
field (`new Date().getFullYear() + 1`).

Fix: take `now` as an argument (defaulted at the adapter), or leave the field
`null` and let consumers decide.

---

### [MEDIUM] `course_tiering.ts` compute functions are dead; the real tier comes from a DB view + a JSON blob
`src/lib/tiering/course_tiering.ts:71-154` exports `computeUniversityScore`,
`mapIbRequirementScore`, `mapALevelRequirementScore`,
`computeCourseSelectivityScore`, `computeCourseTier`, `enrichCourseRecord`,
`enrichCourseRecords`. **None is called anywhere in `src/`** — only the *types*
(`CourseRecord`, `EnrichedCourseRecord`) are imported.

The values actually used come from three competing sources resolved in
`service.ts:137-158`:
1. `programs.metadata.{total_course_score, selectivity_score, course_tier, university_score}` (injected at `service.ts:657-675`)
2. the `course_scoring_v1` view's computed columns
3. an inline recomputation `Math.round(uni*0.6 + sel*0.4)` (`service.ts:150`) — which duplicates `enrichCourseRecord`'s formula at `course_tiering.ts:133`

Meanwhile `computeCourseTier` (85/75/65/50 → tiers 1–5, `:122-128`) has no
counterpart in the view or the metadata, so a tier arriving from either source is
on an *unverified* scale, and `toTier` (`service.ts:125-129`) silently coerces
anything unrecognised to **5** (worst).

Fix: decide where tiering lives. If the DB owns it, delete the TS compute
functions and keep only the types; if TS owns it, call `enrichCourseRecord` and
stop reading `metadata`. Today it's both and neither.

---

### [MEDIUM] `/university-search/search`'s default "fit" sort does not sort by fit
`src/hooks/use-search-results.ts:796-819`. The `switch (f.sort)` has real
`.order()` calls for `tuition-asc`, `tuition-desc` and `name`; `case 'fit'` falls
through to `default: break;` and the only ordering applied is
`query.order('id', { ascending: true })` (`:826`).

Fit scores are fetched *after* the page of rows arrives
(`/api/match/score` → `mapRows` at `:445-446`) and are pure annotation. So the
sort control's default option is labelled "fit" and produces primary-key order.
Combined with F-03, the highest-"fit" (90%) rows are the *unscored* ones, and
they are scattered arbitrarily through the list.

Fix: either rename the option ("Recommended", with an honest tooltip) or push the
fit score to the DB (a materialised per-profile score column / RPC) so it can be
ordered on. The comment at `:794-795` documents the constraint but the UI label
doesn't.

---

### [MEDIUM] Demo fixtures drive a live, personalised surface: the Chances calculator
`src/app/toolbox/(shell)/chances/page.tsx:10` passes `DEMO_STUDENT_GRADES` (a
hardcoded IB 39 for a fictional "Alex Morgan",
`student-demo-data.ts:489-500`) into `ChancesClient`. The client then mixes it
with the user's **real** shortlist (`chances-client.tsx:50-73`) and reverse-
engineers a minimum score from the fit score:

```ts
const minimumScore = fitScore !== null
  ? Math.max(24, Math.min(45, Math.round(grades.predicted - (fitScore - 60) / 5)))
  : Math.max(28, grades.predicted - 4);
```

So the tool tells a real student, about their real shortlisted programmes,
"you're predicted 39 IB, this is a Safety" — using someone else's grades and a
made-up requirement derived by inverting a score that was itself derived from a
requirement. `chances-calculator.tsx:20-35` then applies a *fifth* tier rule and
a *third* chance-percent model. The disclaimer at `chances-calculator.tsx:231-233`
covers the percentages but not the fact that the predicted score is fictional.

The rest of `student-demo-data.ts` is a clean seam (type-only imports, or
fixtures for genuinely unbuilt features — Toolbox requirements/timeline/essay,
rec letters, outcomes, nudges). This one file is the leak.

Fix: load `student_academic_input` server-side in `chances/page.tsx` and pass the
real payload through `resolveStudentIbEquivalent`; keep `DEMO_STUDENT_GRADES`
only as the signed-out/incomplete-profile fallback, clearly labelled.

---

### [LOW] `pathway-status.ts` cluster labels don't match any real cluster id
`src/lib/profile/pathway-status.ts:16-27`. `CLUSTER_LABEL` keys are
`medicine`, `business_economics`, `natural_sciences`, `arts`, `architecture`,
`social_sciences` — none of which is in the `IntendedCluster` union
(`intake-types.ts:2-12`: `medicine_dentistry`, `business_non_quant`,
`economics_quant`, `life_sciences_biochem`, `creative`, `humanities`, …).

Only `computer_science`, `engineering` and `law` overlap. Every other cluster
falls to the `split('_')` title-caser at `:32-35`, so `/profile` renders
"Current subjects close pathways into **Medicine Dentistry** and **Business Non
Quant**." to users.

Fix: type the map as `Record<IntendedCluster, string>` — TypeScript will then
catch it at compile time.

---

### [LOW] `MatchTier` declared twice; ACT collapsed to A-level in the counsellor model
- `src/lib/matching/match-tier.ts:1` and `src/lib/counsellor/types.ts:8` both declare `export type MatchTier = 'Reach' | 'Match' | 'Safe'`. Structurally identical today; nothing stops them diverging.
- `src/lib/counsellor/types.ts:62` — `programmeType: 'IB' | 'A_LEVEL'`, dropping `'ACT'` from `ProgrammeType` (`intake-types.ts:1`). `src/lib/counsellor/data.ts:118-119` enforces the loss: `s === 'IB' ? 'IB' : 'A_LEVEL'`. So every ACT student is reported as A-level in the cohort roster and in `programmeBreakdown` (`data.ts:611-614`).

Fix: `import type { MatchTier } from '@/lib/matching/match-tier'` in
`counsellor/types.ts`; widen `programmeType` to `ProgrammeType`.

---

### [LOW] `src/lib/validation/profile.ts` is dead and describes a different domain
82 lines of Zod schemas (`profilePersonalSchema`, `profileAcademicsSchema`,
`profilePreferencesSchema`, `profileAspirationsSchema`) with **zero importers**
outside the file. It also encodes a contradictory model:
`CURRICULUM_OPTIONS` includes `'A Levels'`/`'Advanced Placement'`/`'High School
Diploma'`/`'Other'` (vs `ProgrammeType = 'IB'|'A_LEVEL'|'ACT'`) and
`DESTINATION_COUNTRIES = ['United Kingdom', 'Australia']` — a two-country world
that no longer matches the 119k multi-country catalogue.

Fix: delete. If validation is wanted, generate it from `intake-types.ts`.

---

### [LOW] `catalog/visibility.ts` reads env at module load
`src/lib/catalog/visibility.ts:14-18` — `flaggedProgramIds` is a module-level
const built from `process.env` at import time. `isProgramFlagged` and
`getFlaggedProgramIds` therefore can't be unit-tested against different flag sets
without `jest.resetModules()`, and the value is frozen for the process lifetime
(so a Vercel env change needs a redeploy, not a restart).

Fix: `getFlaggedProgramIds(env = process.env)`, memoised at the call site.

---

### [LOW] Five different `recognition_score` thresholds
`≥5` (`api/search/suggestions/route.ts:116`, `chat/tools.ts:119`), `≥6`
(comment at `suggestions/route.ts:104`), `≥8` (`topTier`,
`search-params.ts:35`), `≥9` (Reach pinning, `service.ts:779`), and default `3`
for unknown (`service.ts:429,778,858,888`). Plus the boost formula
`score + (rec/10)*5` (`service.ts:434,858`) and the pin cap of 3 per university
(`service.ts:781`).

Fix: one `RECOGNITION` config object.

---

### [LOW] Stale hardcoded FX rates in the matcher
`src/lib/matching/matching_engine.ts:55` —
`FX_TO_USD = { USD: 1.0, GBP: 1.27, AUD: 0.65, CAD: 0.74 }`, and any other
currency silently becomes 1.0 (`:58`). Also `estimateFeeUsd` (`:209-224`)
multiplies domestic GBP tuition by a magic `2.5` to guess international fees
(`:218`). These only affect the budget gate, which is currently unreachable
(budget defaults to `999_999` at `:482` because no caller passes `filters`) — so
today it's inert, but it will silently mis-filter the moment budget filtering is
wired up.

---

## Answers to the specific questions

**1. Duplication / drift.** Confirmed and worse than the "unified once" note suggests.
Five tier rules (F-02), three chance-percent models (`matching_engine.ts:245`
sigmoid; `chances-calculator.tsx:27-35` step function;
`service.ts:843-853` percentile), two A-level→points tables
(`student_scoring.ts:316-324` on a 0–5 scale vs `matching_engine.ts:389-391` on a
1–7 scale), two `MatchTier` declarations, two grade-signature formatters
(`student_scoring.ts:507-512` vs `counsellor/data.ts:121-126`), two
graduation-year defaults, and a dead tiering module shadowing a DB view (F-12).

**2. Purity.** The rule *cores* are pure and testable:
`student_scoring.ts`, `activities_scoring.ts`, `course_tiering.ts`,
`matching_engine.ts`, `search-params.ts`, `profile/completion.ts`,
`profile/pathway-status.ts`, `theme/categories.ts` classifiers,
`applications/due-label.ts`. The impurities that block testing:
`service.ts` end-to-end (Supabase, `Date.now()` at `:324`, `console.*`,
`process.env.MATCH_DEBUG` at `:721`, and two DB **writes** inside a function named
`load*`); `student_score_loader.ts:69` (`new Date()`);
`catalog/visibility.ts:14` (module-load env). No React or `fetch` inside the rule
modules — that boundary is clean.

**3. Configuration vs code.** Everything is inline. The tunable surface that
should be a typed config module (and, for the weights, a DB row so tuning
doesn't need a deploy): band cutoffs `168/150/130/110/90`
(`student_scoring.ts:691-698`); the A-level signature table (`:514-539`); the IB
band table (`:435-448`); the ACT tables (`:467-478` and
`matching_engine.ts:421-436`); grade→point maps (`:309-330`); rigour points
(`:326-330`); test thresholds (`:645-684`); `RequiredSubjectsRules` /
`PreferredSubjectsRules` / `KeySubjectsRules` / `EE_RELEVANCE_RULES` /
`ADMISSIONS_TEST_REQUIREMENTS` (`:78-307`) — these are *reference data* and belong
in the DB; `ACTIVITIES_WEIGHTS` (`activities_scoring.ts:17-54`, already exported
as tunable — the right pattern, extend it); `CLUSTER_TO_PRIMARY_FIELDS`,
`FIELD_KEYWORDS`, `NARROW_TO_BROAD` (`matching_engine.ts:105-164`) — reference
data; sigmoid constants `0.35 / 8 / 87` (`:245-249`); `IB_BREAKPOINTS` (`:228`);
`minSafetyScore` (`:296-302`); the relaxation bands (`:278-284`);
`prestigePenalty` (`:273`); FX (`:55`); tier thresholds
(`course_tiering.ts:122-128`); recognition thresholds (F-20); cache TTL/window/
`FULL_CACHE_LIMIT` (`service.ts:40-49`).

**4. Correctness risks.** F-01 (A-level table), F-03 (null-course fallback),
F-04 (ACT rigour), F-05 (tier redistribution), F-07 (silent defaults), F-08
(clusters), F-10 (max-not-sum), F-11 (unstable ties), F-13 (IB scale). **Date
handling is compliant** — `parseLocalDate`/`daysUntil`/`startOfToday` are used
correctly in `theme/categories.ts:293`, `applications/due-label.ts:15-16`,
`counsellor/data.ts:444,590,635-637`, `chat/context.ts:175,182`,
`chat/tools/student-read.ts:109`, `chances-calculator.tsx:99,359`. Two nits:
`counsellor/data.ts:640` (`deriveAllDeadlines`) sorts with raw `new Date()` on
date-only strings — harmless for ordering but inconsistent; and
`student-demo-data.ts:12-16` `relDate` builds a date-only string via
`toISOString()`, which is UTC and can be off by one day for negative-offset
users. Floating point: the scoring components are floats summed before a single
round (F-09); no epsilon comparisons anywhere, and the classifier's `>=`
comparisons are against integers, so no FP hazard there.

**5. Types.** No single domain model. Side by side:

```
StudentProfilePayload   intake-types.ts:43       ← canonical-ish; 3 nested groups
CounsellorStudent       counsellor/types.ts:49   ← flattened, camelCase, loses ACT
ChildOverview           parent/data.ts           ← third student shape
DemoStudentGrades       student-demo-data.ts:469 ← fourth (system/predicted/subjects)

CourseRecord            course_tiering.ts:3      ← 42 UK-centric fields, all `| null`
EnrichedCourseRecord    course_tiering.ts:47     ← + 4 scores + explanations
CourseSource            service.ts:109           ← + 12 program_/university_ fields
ProgramSearchResult     university-search/types.ts:4 ← 30 display-shaped fields
ProgramHit              chat/tools.ts            ← fifth programme shape

RankedCourseMatch       matching_engine.ts:39    ← engine output (tier_fit, chance_percent)
EnrichedMatch           matching/types.ts:3      ← service output (tier, score, breakdown)
CounsellorMatch         counsellor/types.ts:16   ← {university, country, program, score, tier}
MatchesWidgetItem       chat/widgets.ts:~45      ← chat-card shape
```

Two independent `MatchTier` declarations (`match-tier.ts:1`,
`counsellor/types.ts:8`) and four names for "admission likelihood"
(`chance_percent`, `score`, `fitScore`, `chance`).

**6. Test coverage.** Real regression coverage exists for exactly two things:
`__tests__/search-params.test.ts` (183 lines, 21 cases — genuinely good:
round-trips, hardening, legacy tokens) and the five band assertions in
`__tests__/student_scoring.test.ts` (Sofia `164`, Daniel `111`, Lucas `39` are
real pinned values). `__tests__/scoring_validation/` is **half harness, half demo**:
`scoring_validation.test.ts:25-129` has six genuine assertions (bands, activity
cap, a with/without-activities delta) but `:133-138` is
`runBatch(); expect(true).toBe(true)`. `batch_runner.ts` and `phase1_profiles.ts`
are excluded from Jest via `testPathIgnorePatterns` (`jest.config.ts:14-16`) —
they are a print harness, not a suite. `__tests__/matching_demo.ts` asserts only
`expect(() => runDemo()).not.toThrow()` (`:266-268`) and runs the demo twice per
Jest run (`:264`, acknowledged in the comment). **No golden files / snapshots
anywhere for scoring output.** Nothing at all tests: `matching_engine.classify`
boundaries, `aLevelToIbEquivalent`, `actToIbEquivalent`,
`resolveStudentIbEquivalent`, `tierImpliedMinIb`, `admissionProbability`,
`isPostgrad`, `matchesField`/`resolveTargetFields`, dedup, `course_tiering.*`
(entirely untested), `classifyFitTier`/`classifyDeadlineUrgency`,
`calculateALevelProfileScore` per signature, or **any** of `service.ts`.

**7. Performance shape.** Hybrid, with the boundary in the wrong place for
correctness. Selection is DB-side (`programs` paged with `programLimit` default
**5000**, `service.ts:251`; per-cluster-field pagers at `:488-495`), scoring is
Node-side and O(n) over whatever was fetched — so the matcher never sees 119k
programmes, it sees a ≤5000-row *sample* biased by which fields the student
picked. Per request: ~10–20 catalogue pages (pool of 3) + `ceil(n/200)`
`course_scoring_v1` batches (pool of 3) + one `universities` lookup, then one
linear pass building a dedup Map, one sort, one 300-row delete + batched insert.
The 24h cache (`PROGRAM_CACHE_TTL_MS`, `:40`) is what makes it viable; the
comment block at `:42-49` shows how much design pressure the shared-cache-key
scheme is under. Structurally: the *expensive, correctness-critical* step
(scoring) is in Node over a truncated sample, while the *cheap* step (filtering)
is in the DB over the full catalogue. Inverting that — a Postgres function or
generated column computing `chance_percent` — would let `ORDER BY fit` work
(F-14) and remove the sampling bias.

**8. Demo data.** Only one true leak: F-15 (`chances/page.tsx` → real shortlist ×
fictional grades). Everything else is either a type-only import or a fixture for
a feature with no data layer, and the header comment at
`student-demo-data.ts:1-8` documents the seam honestly.

---

## Target domain design

Four layers, no Supabase or React below the adapter line.

```
src/lib/domain/
  model.ts          // ONE canonical model
  config.ts         // ALL weights/thresholds, typed, one object, loadable from DB
  rules/
    grades.ts       // grade → points → normalised credential (IB-equivalent)
    student.ts      // StudentProfile + RuleConfig -> StudentAssessment   (pure)
    programme.ts    // ProgrammeRecord + RuleConfig -> ProgrammeProfile   (pure)
    match.ts        // (StudentAssessment, ProgrammeProfile, RuleConfig) -> MatchAssessment  (pure)
    tiers.ts        // THE tier function. Nothing else classifies.
src/lib/matching/service.ts   // adapter only: fetch -> map -> call rules -> persist
```

### 1. One model

```ts
// domain/model.ts
export type Credential =
  | { kind: 'IB';      subjectPoints: number; corePoints: number }   // /42 + /3
  | { kind: 'A_LEVEL'; grades: ALevelGrade[] }
  | { kind: 'ACT';     composite: number }
  | { kind: 'UNKNOWN' };                       // ← the state that does not exist today

/** Normalised strength on the /45 IB scale. `null` means "cannot assess". */
export type IbEquivalent = number | null;

export interface StudentProfile {
  credential: Credential;
  subjects: Subject[];                 // { name, level: 'HL'|'SL'|'A_LEVEL'|'AP', grade }
  clusters: { primary: Cluster[]; secondary: Cluster[] };
  tests: { admissions: AdmissionsTest[]; english: EnglishEvidence };
  activities: Activity[];
  preferences: Preferences;            // finally consumed — see F-06
}

export interface ProgrammeProfile {
  id: string; universityId: string;
  name: string; field: string | null; level: string | null;
  requirement: { minIb: number | null; minALevel: string | null };
  quality: { universityScore: number | null; selectivity: number | null; total: number | null; tier: CourseTier | null };
  cost: { intlTuitionGbp: number | null; domesticTuition: number | null; currency: string | null };
  recognition: number | null;          // NOT `?? 3`
}

export interface MatchAssessment {
  programmeId: string;
  admitProbability: number | null;     // null = insufficient data. THE ONLY score.
  tier: MatchTier | null;
  factors: MatchFactor[];              // real per-programme reasons, replaces the placeholder breakdown
  excluded: { reason: ExclusionReason } | null;
}
```

The `| null` on `admitProbability` is the load-bearing change: it makes F-03 and
F-07 unrepresentable.

### 2. One config

```ts
// domain/config.ts
export interface RuleConfig {
  version: string;                                   // stamped into every persisted row
  bands: { exceptional: number; veryStrong: number; strong: number; solid: number; borderline: number };
  academic: { ibTable: Band[]; actTable: Band[]; aLevelPointsPerGrade: Record<ALevelGrade, number> };
  tiers: { safe: number; match: number };            // ONE pair — resolves F-02
  admission: { sigmoidK: number; floorPct: number; spanPct: number; prestigePenaltyPivot: number; prestigePenaltyMax: number };
  recognition: { unknownDefault: number | null; pinThreshold: number; maxPinsPerUniversity: number; boostMax: number };
  fx: Record<string, number>;                        // reloadable, not a 2024 snapshot
  clusters: ClusterReferenceData;                    // required/preferred/key subjects, fields, keywords
}
export const DEFAULT_RULE_CONFIG: RuleConfig = { … };   // ships in code
export const loadRuleConfig = async (db): Promise<RuleConfig> => …;  // DB override, later
```

Persist `config.version` alongside every `student_scores` / `student_matches`
row so a tuning change is auditable and old rows are identifiable as stale.

### 3. One rule engine

```ts
// domain/rules/tiers.ts — the ONLY tier function in the codebase
export const classifyTier = (p: number | null, c: RuleConfig): MatchTier | null =>
  p === null ? null : p >= c.tiers.safe ? 'Safe' : p >= c.tiers.match ? 'Match' : 'Reach';

// domain/rules/grades.ts
export const toIbEquivalent = (cred: Credential): IbEquivalent => {
  switch (cred.kind) {
    case 'IB':      return Math.min(45, cred.subjectPoints + cred.corePoints);
    case 'A_LEVEL': return cred.grades.length ? interpolateALevel(cred.grades) : null;
    case 'ACT':     return actBand(cred.composite);
    case 'UNKNOWN': return null;          // no more silent 33
  }
};

// domain/rules/match.ts
export const assessMatch = (s: StudentAssessment, p: ProgrammeProfile, c: RuleConfig): MatchAssessment => {
  const ib = s.ibEquivalent;
  const req = effectiveRequirement(p, c);            // null when genuinely unknown
  if (ib === null || req === null) {
    return { programmeId: p.id, admitProbability: null, tier: null, factors: [{ kind: 'insufficient_data' }], excluded: null };
  }
  …
};
```

### 4. Adapter boundary

`service.ts` shrinks to: fetch rows → `toStudentProfile(rows)` /
`toProgrammeProfile(rows)` → `assessStudent` / `assessMatch` → persist. No rule
lives there. In particular the percentile redistribution (F-05) and the
`breakdown` placeholder (F-06) both disappear, and `Date.now()` becomes an
injected `clock`.

### Migration order (output-preserving until step 6)

| # | Step | Output change |
|---|---|---|
| 1 | **Golden files first.** Snapshot `scoreStudentProfile` over ~60 synthetic profiles (all 56 A-level signatures × 3 clusters, IB 24–45, ACT 18–36) and `rankCourseMatches` over the `batch_runner.ts:38-67` catalogue. Commit as `__tests__/golden/*.json`. | none |
| 2 | Extract `domain/config.ts` with **exactly today's numbers**; rewrite the rule modules to read from it. | none — goldens prove it |
| 3 | Extract `domain/rules/tiers.ts`; point `theme/categories.ts:236`, `university-search/types.ts:46`, `counsellor/data.ts:104`, `service.ts:388` at it. **Choose 70/50 or 80/60 explicitly.** | **yes** — one of the two surfaces re-tiers. Quantify with a one-off count before merging. |
| 4 | Introduce `IbEquivalent = number \| null` and `admitProbability: number \| null`. Delete the `?? 33`, `?? 4`, `?? 40`, `?? 3` defaults and the `nullCourse` fallback (`service.ts:1012`). | **yes** — search cards that showed a bogus 90% now show "Fit unknown". This is the point. |
| 5 | Delete the percentile redistribution (`service.ts:839-853`) and the placeholder `breakdown` (`:826-832`); wire `Preferences → PreferencesFilters` at `:718`. | **yes** — tiers become engine tiers; `preferenceFit` becomes real |
| 6 | Replace `calculateALevelProfileScore` with the linear formula; accept `A_LEVEL` (or add `AP`) in `calculateRigourScore`; sum instead of max in `calculateTestsAndEnglish`; round once. | **yes, by design** — the goldens from step 1 become the diff report. Expect A-level and ACT students to move by up to 2 bands; IB students to move by ≤2 points. |
| 7 | Cache-read unique tiebreaker; `clock` injection; `getFlaggedProgramIds(env)`; delete `validation/profile.ts` and the dead `course_tiering` compute functions; unify `MatchTier`. | none |
| 8 | (Optional, larger) Push `admitProbability` into Postgres so `ORDER BY fit` is real and the 5000-row sampling bias goes away. | ordering only |

---

## Test strategy

**A. Golden files (the missing foundation).** `__tests__/golden/student-scores.json`
and `matches.json`, regenerated by `npm run test:golden -- --update`. Inputs: a
fixture matrix, not hand-written cases —
- all 56 A-level signatures × {law, engineering, creative}
- IB subject sums 20–42 × core 0–3
- ACT 15–36
- each × {no activities, max activities} × {English missing, met, waived}

Every rule change then produces a *reviewable diff of scores*, which is the only
way step 6 above is safe.

**B. Property tests** (`fast-check`) for the invariants the current suite can't express:
- monotonicity — strictly better grades never produce a lower `academic_performance` (this alone catches F-01)
- monotonicity — higher `ibEquivalent` never lowers `admitProbability` for a fixed programme
- range — `admitProbability ∈ [5,95] ∪ {null}`; `total_score ∈ [0,200]`
- `breakdown` components sum to `total_score` (catches F-09)
- `classifyTier` is total and order-preserving
- ranking is a total order — `sort` is deterministic under input permutation (catches F-11)

**C. Boundary tables** — one `it.each` per threshold, hitting `n-1, n, n+1`:
band cutoffs (168/150/130/110/90), tier cutoffs, `classify`'s
`excl/reach/match/safety` at the three `studentIb` relaxation bands (27/31),
`tierImpliedMinIb` at each breakpoint, `computeCourseTier` at 85/75/65/50,
`actToIbEquivalent` at every step.

**D. Null-handling matrix** — for each of `{minIb, courseScore, selectivity,
credential, subjects, activities}`, assert the *documented* behaviour for
present / null / malformed. This is the suite that would have caught F-03 and
F-04.

**E. Contract tests for the adapter** — `service.ts` against an in-memory
Supabase double (the chat suites already do this,
e.g. `__tests__/chat/counsellor-tools.test.ts`): cache hit vs miss produce the
same ordering; a failed `course_scoring_v1` batch does **not** silently degrade
to confident scores; a partial cache-insert failure clears the cache.

**F. Cross-surface consistency** — one test that asserts
`loadMatchesForProfile` and `scoreProgramsForProfile` return the same
`admitProbability` **and the same tier** for the same programme. That test is the
executable form of F-02 and F-03.

**G. Housekeeping** — make `matching_demo.ts` a fixture (add it to
`testPathIgnorePatterns` alongside `batch_runner.ts`, or give it real
assertions); remove the module-scope `runDemo()` at `:264`; replace
`expect(true).toBe(true)` at `scoring_validation.test.ts:136` with the golden
comparison.

---

## Effort

| # | Finding | Size | Risk |
|---|---|---|---|
| 01 | A-level table — 30 unreachable signatures, score inversions | **M** | **High** — every existing A-level `student_scores` row is wrong and will change |
| 02 | Five tier rules → one | **M** | **High** — re-tiers one of the two student-facing surfaces |
| 03 | 90% fallback for unscored programmes | **S** | **Medium** — visible on the search page immediately; "Fit unknown" is the honest replacement |
| 04 | ACT rigour always 0 (`level === 'AP'`) | **S** | Medium — moves every ACT score |
| 05 | Percentile tier redistribution overwrites engine tiers | **S** (delete) | **High** — changes the tier mix on `/matches` and everything reading the cache |
| 06 | `EnrichedMatch.breakdown` 3/4 placeholder; preferences never used | **L** | Medium — new signal, needs product sign-off on weighting |
| 07 | Silent `?? 33 / ?? 4 / ?? 40 / ?? 3` defaults → nullable model | **L** | Medium — touches every consumer, but mechanical once the type changes |
| 08 | `secondary_clusters` ignored by the scorer | **S** | Medium — adds eligibility flags for some students |
| 09 | Breakdown components don't sum to total | **S** | Low |
| 10 | `tests_and_english` max-not-sum; UCAT percentile-only | **S** | Medium — product decision, then a score shift |
| 11 | Unstable cached ordering on tied scores | **S** | Low |
| 12 | Dead `course_tiering` compute vs DB view vs `metadata` | **M** | Medium — needs a decision on where tiering lives |
| 13 | IB /42 vs /45 unenforced | **S** | Low |
| 14 | "fit" sort doesn't sort by fit | **S** (rename) / **XL** (DB-side scoring) | Low / High |
| 15 | Chances calculator: demo grades × real shortlist | **M** | Low |
| 16 | `mapIntakeRowsToPayload` impurity (`new Date()`) | **S** | Low |
| 17 | `pathway-status` cluster labels mismatch | **S** | Low |
| 18 | `MatchTier` × 2; ACT dropped in counsellor model | **S** | Low |
| 19 | `validation/profile.ts` dead | **S** | None |
| 20 | `visibility.ts` module-load env | **S** | Low |
| 21 | Recognition thresholds ×5, FX hardcoded → config | **S** | Low |
| — | **Golden-file + property test harness (prerequisite for 01/04/06/07/10)** | **M** | Low — pure addition, and it is what de-risks everything above |
| — | Full `domain/` extraction (steps 2–7) | **XL** | Medium, staged |
