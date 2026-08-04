import { expect, test, type Page, type Locator } from '@playwright/test';
import { hasE2ECredentials, E2E_SKIP_REASON } from './credentials';

/**
 * THE gate `docs/audit/13-remaining-work.md` blocks the StudentIntakeForm
 * decomposition on: sign in → fill every screen → save → reload → confirm every
 * field round-trips.
 *
 * Why this shape and not a pile of small specs: F-A (the Radix bubble-input bug
 * that blanked hydrated `<Select>` values) presented in production as "fields I
 * already filled came back empty and the wizard won't let me continue". Nothing
 * short of a real browser writing to a real database and reading it back can
 * catch that class — jsdom cannot, because the bug lives in how Radix's hidden
 * native `<select>` behaves inside a `<form>` during hydration.
 *
 * The verification pass deliberately navigates to each screen by `?step=` rather
 * than clicking Next, because that is the path a RETURNING student takes
 * (`profile/wizard/page.tsx` resolves `?step=` against `WIZARD_SCREENS` and
 * otherwise lands on the first incomplete screen) and it is the exact path F-A
 * broke.
 *
 * ── STATUS ────────────────────────────────────────────────────────────────
 * FIRST EXECUTED AGAINST A LIVE ACCOUNT 2026-08-04, and it passed — the fill,
 * the save, and the full round trip after a reload with the draft dropped. Every
 * prior version of this header said "never executed"; CI does have E2E secrets,
 * so what was actually keeping it unrun was the `auth.setup` dependency, which
 * had been asserting a hero title that the redesign made conditional.
 *
 * It still skips where credentials are absent, so a local run without
 * `E2E_EMAIL`/`E2E_PASSWORD` proves nothing. That skip is honest, not decorative.
 *
 * The two findings from that first real run are recorded where they were fixed:
 * the milestone celebration intercepting every click (see
 * `dismissCelebrationIfOpen`), and the state-dependent title in
 * `auth.setup.e2e.ts`. Neither was a selector problem.
 *
 * ── REWRITTEN 2026-08-04 FOR THE EIGHT-SCREEN WIZARD ──────────────────────
 * The redesign did not just move selectors, it changed the SHAPE of the flow, so
 * a find-and-replace would have produced a spec that passed for the wrong
 * reasons. What actually changed, and what this spec now asserts:
 *
 *  1. SIX STEPS BECAME EIGHT SCREENS, AND THE ORDER INVERTED. `academic_input`
 *     is no longer a `?step=` value at all — it split into `subject_area` and
 *     `school`. Personal info moved from FIRST to FIFTH: the wizard now opens on
 *     "what do you want to study?" and defers the paperwork. `WIZARD_SCREENS` in
 *     `src/lib/profile/wizard-screens.ts` is the single source of truth for both
 *     the keys and the order; SCREEN below mirrors it.
 *
 *  2. THE TWO HERO QUESTIONS ARE RADIOGROUPS, NOT CHIPS. `ChoiceGroup` with
 *     `required` renders `role="radio"` + `aria-checked`. The old `chipIn`
 *     helper looked them up with `getByRole('button')` and asserted
 *     `aria-pressed`, and an ARIA radio matches NEITHER — so those lookups did
 *     not merely drift, they could never resolve. Selection is now addressed by
 *     `data-choice` (the option's stored value) inside the group's `data-field`,
 *     which is stable against label and note copy changes in a way a name regex
 *     is not.
 *
 *  3. EMOJI ARE GONE FROM EVERY CHOICE LABEL. `'🌆 Major city'` is now
 *     `'Major city'`. The emoji were replaced by Lucide icons carrying
 *     `aria-hidden`, so they no longer appear in any accessible name.
 *
 *  4. THE SUCCESS COPY MOVED AND CHANGED. `'Profile saved! Your matches are
 *     ready.'` is now `'Profile saved — your matches are ready'` (em dash, no
 *     terminal period) inside the post-save panel's own `role="status"`.
 *
 * Two things deliberately did NOT change, and are asserted as-is: a `Chip`'s
 * accessible name is still its label AND its description concatenated (so
 * `'Practical Project-based, hands-on'` and `'Medium 5–15k'` remain correct), and
 * the lifestyle groups are still clearable `aria-pressed` toggles rather than
 * radios — see the boundary argued in `choice-card.tsx`'s header.
 */

/** `?step=` values, in screen order. Mirrors `WIZARD_SCREENS`. */
const SCREEN = {
  subjectArea: 'subject_area',
  school: 'school',
  grades: 'academic_details',
  tests: 'tests',
  personal: 'personal_information',
  activities: 'activities_ambitions',
  lifestyle: 'lifestyle_preferences',
  review: 'review'
} as const;

/**
 * Each screen's `<h2>`, which is its `question` — NOT its `railLabel`. The old
 * spec waited on step titles ("Your studies", "Review & confirm") that the
 * redesign does not render anywhere.
 */
const HEADING = {
  subjectArea: 'What do you want to study?',
  school: 'Where are you studying?',
  grades: 'Your subjects and predicted grades',
  tests: 'English and admissions tests',
  personal: 'Now the boring bit',
  activities: 'What do you do outside class?',
  lifestyle: 'What should university feel like?',
  review: 'Does this all look right?'
} as const;

/** Distinct, greppable values so a mis-mapped column is obvious in a diff. */
const PROFILE = {
  firstName: 'E2E',
  lastName: 'Roundtrip',
  email: 'e2e.roundtrip@ascenda.test',
  nationality: 'Nigeria',
  residentCountry: 'Thailand',
  city: 'Bangkok',
  age: '17',
  schoolName: 'Northgate International School',
  schoolCountry: 'Thailand',
  schoolCity: 'Bangkok',
  schoolType: 'International school',
  careerAspiration: 'Structural engineer',
  subjects: [
    { name: 'Mathematics', grade: '7' },
    { name: 'Physics', grade: '6' },
    { name: 'Chemistry', grade: '6' },
    { name: 'English Literature', grade: '5' },
    { name: 'History', grade: '5' },
    { name: 'Economics', grade: '4' }
  ],
  corePoints: '2',
  tokGrade: 'A',
  eeGrade: 'B',
  mathsPathway: 'AA HL',
  englishTest: 'IELTS',
  englishStatus: 'Met',
  englishScore: '7.5',
  activity: {
    category: 'Coding / Hackathon',
    level: 'National',
    duration: '3–4 years',
    highlight: 'Won the national schools hackathon'
  },
  ambition: 'I want to build bridges that outlast me.',
  // The chip's accessible name is its label AND its description, concatenated.
  teachingStyle: 'Practical Project-based, hands-on',
  locationType: 'Major city',
  campusSize: 'Medium 5–15k',
  extracurricular: 'Student societies'
} as const;

/**
 * Stored VALUES, not labels, for the two radiogroups — `data-choice` carries
 * `option.value`. `'engineering'` is a `CLUSTER_OPTIONS` value; `'IB'` is a
 * `programme_type`.
 */
const CHOICE = {
  cluster: 'engineering',
  programme: 'IB'
} as const;

/** The graduation-year `<Select>` offers currentYear-2 … currentYear+5. */
const GRADUATION_YEAR = String(new Date().getFullYear() + 1);

// ── Interaction helpers ──────────────────────────────────────────────────────

/**
 * Close the milestone celebration if it is showing.
 *
 * This is not defensive padding — without it the spec cannot click anything. The
 * celebration is a real `aria-modal` dialog with a `fixed inset-0 z-modal`
 * backdrop, and Playwright reports it as "intercepts pointer events" against
 * every button underneath.
 *
 * The timing is the part worth writing down. It fires from an effect gated on
 * `essentialsComplete`, once per page load, and "the essentials are complete" is
 * evaluated against the state HYDRATED FROM THE SERVER — not against what this
 * run has typed. So for the E2E account, which finishes the wizard on every run,
 * it opens IMMEDIATELY ON EVERY LOAD, including all seven navigations of the
 * round-trip pass. Only on a genuinely fresh account does it appear where you
 * would expect it, part-way through screen five.
 *
 * `isVisible()` is a snapshot rather than an auto-waiting assertion on purpose —
 * the question is "is it in the way right now", and waiting 15s for a dialog that
 * legitimately is not coming would turn every Next into a timeout.
 *
 * "Keep going" is the dismissal that stays put. The other action is "Continue",
 * which jumps to the first booster screen — correct for a student, but it would
 * silently move this spec off the screen it was working on.
 */
const dismissCelebrationIfOpen = async (page: Page) => {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Keep going' }).click();
    await expect(dialog).toBeHidden();
  }
};

/**
 * Click, surviving the celebration landing mid-action.
 *
 * A snapshot check before the click is not sufficient on its own: the celebration
 * is rendered through `next/dynamic` (`wizard-overlays-lazy.tsx`), so its chunk
 * can arrive AFTER the check and steal the click that follows. The retry is the
 * part that actually closes that window; the pre-check is what stops the common
 * case from costing a timeout first.
 *
 * Deliberately not a global `page.addLocatorHandler` for the dialog: that would
 * dismiss the celebration invisibly anywhere it appeared, including in the one
 * place a future test might want to assert it.
 */
const guardedClick = async (target: Locator) => {
  const page = target.page();
  await dismissCelebrationIfOpen(page);
  try {
    await target.click({ timeout: 15_000 });
  } catch {
    await dismissCelebrationIfOpen(page);
    await target.click();
  }
};

/**
 * Radix `<Select>`: open by aria-label, choose by visible option text.
 *
 * The close assertion is on THIS TRIGGER's `aria-expanded`, not on
 * `getByRole('listbox')).toHaveCount(0)`.
 *
 * That previous form was a race and it flaked in CI (PR #66: this spec failed, then
 * passed on Playwright's retry, so the job was green only because of the retry).
 * Radix keeps the portalled listbox MOUNTED through its exit animation, so a
 * page-wide "no listbox exists" assertion waits on animation timing rather than on
 * state — and it polls for the full 15s timeout before failing. `aria-expanded` on
 * the trigger flips with the component's open state, synchronously, so there is
 * nothing to race.
 *
 * Scoping to the trigger also means a second Select left open elsewhere on the step
 * can no longer make this helper fail for a reason that has nothing to do with the
 * field it was asked to set.
 */
const chooseFromSelect = async (page: Page, label: string, option: string) => {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await guardedClick(trigger);
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
};

/** Hand-rolled country/subject combobox: type, then click the filtered option. */
const chooseFromCombobox = async (page: Page, input: Locator, value: string) => {
  await guardedClick(input);
  await input.fill(value);
  await page.getByRole('option', { name: value, exact: true }).first().click();
  await expect(input).toHaveValue(value);
};

const chipIn = (scope: Locator | Page, name: string) =>
  scope.getByRole('button', { name, exact: true }).first();

/**
 * A `ChoiceGroup` card, addressed by the group's `data-field` and the option's
 * `data-choice`.
 *
 * Not `getByRole('radio', { name })`: a card's accessible name is its label plus
 * its `note` ("IB Diploma Six subjects, three at Higher Level, scored out of 45"),
 * so an exact-name lookup fails and a partial one silently re-pins the test to
 * marketing copy. `data-choice` is the stored value — the thing actually being
 * asserted about.
 */
const choiceIn = (page: Page, fieldKey: string, value: string) =>
  page.locator(`[data-field="${fieldKey}"] [data-choice="${value}"]`);

/**
 * Pick a radio card, rather than toggling it.
 *
 * ARIA radios have no unchecked state reachable by re-activating them, so unlike
 * `selectChip` this needs no already-selected guard for correctness — but it keeps
 * one anyway, because clicking an already-checked radio is a wasted event that can
 * still close a soft keyboard on the mobile projects.
 */
const selectChoice = async (card: Locator) => {
  if ((await card.getAttribute('aria-checked')) !== 'true') {
    await guardedClick(card);
  }
  await expect(card).toHaveAttribute('aria-checked', 'true');
};

/**
 * Select a chip, rather than toggling it.
 *
 * Chips are TOGGLES — `Chip` in `chip.tsx` renders `aria-pressed={selected}` and
 * its onClick flips the value. So a bare `.click()` is NOT idempotent: on a fresh
 * account it selects, and on an account that already holds this profile it
 * DESELECTS.
 *
 * That is precisely why this spec passed the first time it ever ran in CI and
 * failed every run after. Each run completes the wizard and SAVES, so the next
 * run reloads with the value already set, the bare click turned it back off, and
 * the screen's own validation refused to advance — leaving the spec waiting 15s
 * for a heading that could never appear. The app was right; the spec was assuming
 * an empty form.
 *
 * Asserting the end state also means a chip that is disabled (a group at its cap
 * disables the rest) fails here, naming the chip, instead of surfacing as a
 * timeout two screens later.
 */
const selectChip = async (chip: Locator) => {
  if ((await chip.getAttribute('aria-pressed')) !== 'true') {
    await guardedClick(chip);
  }
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
};

const gotoScreen = async (page: Page, screen: string) => {
  await page.goto(`/profile/wizard?step=${screen}`);
  // The screen heading and the screen body are separate AnimatePresence blocks;
  // waiting on a nav button rather than the heading avoids the one-frame gap.
  await expect(page.getByRole('button', { name: /^(Next|Submit & see matches)$/ })).toBeVisible();
  await dismissCelebrationIfOpen(page);
};

const clickNext = (page: Page) =>
  guardedClick(page.getByRole('button', { name: 'Next', exact: true }));

// ── The spec ─────────────────────────────────────────────────────────────────

test.describe('profile wizard — eight-screen happy path round trip', () => {
  test.skip(!hasE2ECredentials(), E2E_SKIP_REASON);

  test('every field survives save + reload', async ({ page }) => {
    // ── 1. Subject area ────────────────────────────────────────────────────
    await gotoScreen(page, SCREEN.subjectArea);
    await expect(page.getByRole('heading', { name: HEADING.subjectArea })).toBeVisible();

    await selectChoice(choiceIn(page, 'academic_input.intended_clusters', CHOICE.cluster));
    await page.getByLabel(/^Career aspiration/).fill(PROFILE.careerAspiration);

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.school })).toBeVisible();

    // ── 2. School ──────────────────────────────────────────────────────────
    // Qualification first: it decides how many subject rows screen 3 seeds.
    await selectChoice(choiceIn(page, 'academic_input.programme_type', CHOICE.programme));
    await page.getByLabel('School name').fill(PROFILE.schoolName);
    await chooseFromCombobox(page, page.getByLabel('School country'), PROFILE.schoolCountry);
    await page.getByLabel(/^School city/).fill(PROFILE.schoolCity);
    await chooseFromSelect(page, 'School type', PROFILE.schoolType);
    await chooseFromSelect(page, 'Graduation year', GRADUATION_YEAR);

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.grades })).toBeVisible();

    // ── 3. Subjects & predicted grades ─────────────────────────────────────
    // Picking IB seeds exactly six rows: three HL then three SL.
    const subjectInputs = page.getByPlaceholder('Subject name');
    await expect(subjectInputs).toHaveCount(6);
    for (const [i, subject] of PROFILE.subjects.entries()) {
      await chooseFromCombobox(page, subjectInputs.nth(i), subject.name);
      await page.getByPlaceholder('1–7').nth(i).fill(subject.grade);
    }

    await selectChip(chipIn(page.locator('[data-field="academic_input.ib_math_pathway"]'), PROFILE.mathsPathway));
    await page.getByLabel(/^Core points/).fill(PROFILE.corePoints);
    await chooseFromSelect(page, 'TOK grade', PROFILE.tokGrade);
    await chooseFromSelect(page, 'EE grade', PROFILE.eeGrade);

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.tests })).toBeVisible();

    // ── 4. English & admissions tests ──────────────────────────────────────
    await selectChip(chipIn(page.locator('[data-field="academic_input.english_required"]'), 'Yes'));
    await chooseFromSelect(page, 'Test type', PROFILE.englishTest);
    await selectChip(chipIn(page.locator('[data-field="academic_input.english_status"]'), PROFILE.englishStatus));
    await page.getByLabel(/^Overall score/).fill(PROFILE.englishScore);

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.personal })).toBeVisible();

    // ── 5. About you ───────────────────────────────────────────────────────
    await page.getByLabel('First name').fill(PROFILE.firstName);
    await page.getByLabel('Last name').fill(PROFILE.lastName);
    await page.getByLabel('Email').fill(PROFILE.email);
    await chooseFromCombobox(page, page.getByPlaceholder('Search nationality…'), PROFILE.nationality);
    await chooseFromCombobox(page, page.getByLabel('Country of residence'), PROFILE.residentCountry);
    await page.getByLabel(/^City/).fill(PROFILE.city);
    await page.getByLabel(/^Age/).fill(PROFILE.age);

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.activities })).toBeVisible();

    // ── 6. Activities & ambitions (booster) ────────────────────────────────
    await guardedClick(page.getByRole('button', { name: 'Add activity' }));
    await selectChip(chipIn(page, PROFILE.activity.category));
    await selectChip(chipIn(page, PROFILE.activity.level));
    await selectChip(chipIn(page, PROFILE.activity.duration));
    await page.getByPlaceholder(/hackathon|Best delegate|award/i).first().fill(PROFILE.activity.highlight);
    await page.getByPlaceholder(/biomedical sciences/).fill(PROFILE.ambition);

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.lifestyle })).toBeVisible();

    // ── 7. Life at university (booster) ───────────────────────────────────
    await selectChip(chipIn(page, PROFILE.teachingStyle));
    await selectChip(chipIn(page, PROFILE.locationType));
    await selectChip(chipIn(page, PROFILE.campusSize));
    await selectChip(chipIn(page, PROFILE.extracurricular));

    await clickNext(page);
    await expect(page.getByRole('heading', { name: HEADING.review })).toBeVisible();

    // ── 8. Review & submit ─────────────────────────────────────────────────
    await guardedClick(page.getByRole('button', { name: 'Submit & see matches' }));
    await expect(page.getByText('Profile saved — your matches are ready')).toBeVisible({ timeout: 60_000 });

    // ── Round trip ─────────────────────────────────────────────────────────
    // Drop the localStorage draft FIRST. Without this the reload could be
    // satisfied by the draft rather than by the server, and the test would prove
    // nothing about persistence. (A successful submit clears it already; this
    // makes the guarantee explicit rather than incidental.)
    await page.evaluate(() => window.localStorage.removeItem('ascenda-intake-draft'));

    await gotoScreen(page, SCREEN.subjectArea);
    await expect(choiceIn(page, 'academic_input.intended_clusters', CHOICE.cluster))
      .toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel(/^Career aspiration/)).toHaveValue(PROFILE.careerAspiration);

    await gotoScreen(page, SCREEN.school);
    await expect(choiceIn(page, 'academic_input.programme_type', CHOICE.programme))
      .toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('School name')).toHaveValue(PROFILE.schoolName);
    await expect(page.getByLabel('School country')).toHaveValue(PROFILE.schoolCountry);
    await expect(page.getByLabel(/^School city/)).toHaveValue(PROFILE.schoolCity);
    // These two are the F-A regression surface: Radix Selects rendered BEFORE
    // the hydration effect ran. They used to come back blank.
    await expect(page.getByRole('combobox', { name: 'School type' })).toHaveText(PROFILE.schoolType);
    await expect(page.getByRole('combobox', { name: 'Graduation year' })).toHaveText(GRADUATION_YEAR);

    await gotoScreen(page, SCREEN.grades);
    for (const [i, subject] of PROFILE.subjects.entries()) {
      await expect(page.getByPlaceholder('Subject name').nth(i)).toHaveValue(subject.name);
      await expect(page.getByPlaceholder('1–7').nth(i)).toHaveValue(subject.grade);
      await expect(page.getByRole('combobox', { name: `Level for subject ${i + 1}` }))
        .toHaveText(i < 3 ? 'HL' : 'SL');
    }
    await expect(page.getByLabel(/^Core points/)).toHaveValue(PROFILE.corePoints);
    await expect(page.getByRole('combobox', { name: 'TOK grade' })).toHaveText(PROFILE.tokGrade);
    await expect(page.getByRole('combobox', { name: 'EE grade' })).toHaveText(PROFILE.eeGrade);
    await expect(
      chipIn(page.locator('[data-field="academic_input.ib_math_pathway"]'), PROFILE.mathsPathway)
    ).toHaveAttribute('aria-pressed', 'true');

    await gotoScreen(page, SCREEN.tests);
    await expect(page.getByRole('combobox', { name: 'Test type' })).toHaveText(PROFILE.englishTest);
    await expect(
      chipIn(page.locator('[data-field="academic_input.english_status"]'), PROFILE.englishStatus)
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/^Overall score/)).toHaveValue(PROFILE.englishScore);

    await gotoScreen(page, SCREEN.personal);
    await expect(page.getByLabel('First name')).toHaveValue(PROFILE.firstName);
    await expect(page.getByLabel('Last name')).toHaveValue(PROFILE.lastName);
    await expect(page.getByLabel('Email')).toHaveValue(PROFILE.email);
    await expect(page.getByPlaceholder('Search nationality…').first()).toHaveValue(PROFILE.nationality);
    await expect(page.getByLabel('Country of residence')).toHaveValue(PROFILE.residentCountry);
    await expect(page.getByLabel(/^City/)).toHaveValue(PROFILE.city);
    await expect(page.getByLabel(/^Age/)).toHaveValue(PROFILE.age);

    await gotoScreen(page, SCREEN.activities);
    await expect(chipIn(page, PROFILE.activity.category)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.activity.level)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.activity.duration)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByPlaceholder(/biomedical sciences/)).toHaveValue(PROFILE.ambition);

    await gotoScreen(page, SCREEN.lifestyle);
    await expect(chipIn(page, PROFILE.teachingStyle)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.locationType)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.campusSize)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.extracurricular)).toHaveAttribute('aria-pressed', 'true');
  });
});
