import { expect, test, type Page, type Locator } from '@playwright/test';
import { hasE2ECredentials, E2E_SKIP_REASON } from './credentials';

/**
 * THE gate `docs/audit/13-remaining-work.md` blocks the StudentIntakeForm
 * decomposition on: sign in → fill all six steps → save → reload → confirm every
 * field round-trips.
 *
 * Why this shape and not a pile of small specs: F-A (the Radix bubble-input bug
 * that blanked hydrated `<Select>` values) presented in production as "fields I
 * already filled came back empty and the wizard won't let me continue". Nothing
 * short of a real browser writing to a real database and reading it back can
 * catch that class — jsdom cannot, because the bug lives in how Radix's hidden
 * native `<select>` behaves inside a `<form>` during hydration.
 *
 * The verification pass deliberately navigates to each step by `?step=` rather
 * than clicking Next, because that is the path a RETURNING student takes
 * (`profile/wizard/page.tsx` computes `initialStep` from completion state) and
 * it is the exact path F-A broke.
 *
 * ── STATUS ────────────────────────────────────────────────────────────────
 * As committed this has NEVER BEEN EXECUTED against a live account: the
 * authoring environment had no E2E credentials (see playwright.config.ts). The
 * skip below is honest, not decorative. First human run should expect to fix
 * selector drift, and may legitimately surface fields that do not survive the
 * server round trip — that finding is the point of the gate.
 */

const STEP = {
  personal: 'personal_information',
  studies: 'academic_input',
  grades: 'academic_details',
  activities: 'activities_ambitions',
  lifestyle: 'lifestyle_preferences'
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
  cluster: 'Engineering',
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
  locationType: '🌆 Major city',
  campusSize: 'Medium 5–15k',
  extracurricular: 'Student societies'
} as const;

/** The graduation-year `<Select>` offers currentYear-2 … currentYear+5. */
const GRADUATION_YEAR = String(new Date().getFullYear() + 1);

// ── Interaction helpers ──────────────────────────────────────────────────────

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
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
};

/** Hand-rolled country/subject combobox: type, then click the filtered option. */
const chooseFromCombobox = async (page: Page, input: Locator, value: string) => {
  await input.click();
  await input.fill(value);
  await page.getByRole('option', { name: value, exact: true }).first().click();
  await expect(input).toHaveValue(value);
};

const chipIn = (scope: Locator | Page, name: string) =>
  scope.getByRole('button', { name, exact: true }).first();

/**
 * Select a chip, rather than toggling it.
 *
 * Chips are TOGGLES — `Chip` in StudentIntakeForm.tsx renders
 * `aria-pressed={selected}` and its onClick flips the value. So a bare `.click()`
 * is NOT idempotent: on a fresh account it selects, and on an account that
 * already holds this profile it DESELECTS.
 *
 * That is precisely why this spec passed the first time it ever ran in CI and
 * failed every run after. Each run completes the wizard and SAVES, so the next
 * run loads step 2 with `intended_clusters` already set, the bare click turned it
 * back off, and step 2's own validation refused to advance
 * ("Select at least one subject area") — leaving the spec waiting 15s for a
 * "Grades & tests" heading that could never appear. The app was right; the spec
 * was assuming an empty form.
 *
 * Asserting the end state also means a chip that is disabled (the primary
 * cluster group disables the others once one is chosen) fails here, naming the
 * chip, instead of surfacing as a timeout two steps later.
 */
const selectChip = async (chip: Locator) => {
  if ((await chip.getAttribute('aria-pressed')) !== 'true') {
    await chip.click();
  }
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
};

const gotoStep = async (page: Page, step: string) => {
  await page.goto(`/profile/wizard?step=${step}`);
  // The step heading and the step body are separate AnimatePresence blocks;
  // waiting on a field rather than the heading avoids the one-frame gap.
  await expect(page.getByRole('button', { name: /^(Next|Submit & see matches)$/ })).toBeVisible();
};

// ── The spec ─────────────────────────────────────────────────────────────────

test.describe('profile wizard — six-step happy path round trip', () => {
  test.skip(!hasE2ECredentials(), E2E_SKIP_REASON);

  test('every field survives save + reload', async ({ page }) => {
    // ── 1. Personal ────────────────────────────────────────────────────────
    await gotoStep(page, STEP.personal);

    await page.getByLabel('First name').fill(PROFILE.firstName);
    await page.getByLabel('Last name').fill(PROFILE.lastName);
    await page.getByLabel('Email').fill(PROFILE.email);
    await chooseFromCombobox(page, page.getByPlaceholder('Search nationality…'), PROFILE.nationality);
    await chooseFromCombobox(page, page.getByLabel('Country of residence'), PROFILE.residentCountry);
    await page.getByLabel(/^City/).fill(PROFILE.city);
    await page.getByLabel(/^Age/).fill(PROFILE.age);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your studies' })).toBeVisible();

    // ── 2. Studies ─────────────────────────────────────────────────────────
    await selectChip(chipIn(page.locator('[data-field="academic_input.programme_type"]'), 'IB Diploma'));
    await page.getByLabel('School name').fill(PROFILE.schoolName);
    await chooseFromCombobox(page, page.getByLabel('School country'), PROFILE.schoolCountry);
    await page.getByLabel(/^School city/).fill(PROFILE.schoolCity);
    await chooseFromSelect(page, 'School type', PROFILE.schoolType);
    await chooseFromSelect(page, 'Graduation year', GRADUATION_YEAR);
    await selectChip(
      page
        .locator('[data-field="academic_input.intended_clusters"]')
        .getByRole('button', { name: new RegExp(PROFILE.cluster) })
    );
    await page.getByLabel(/^Career aspiration/).fill(PROFILE.careerAspiration);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Grades & tests' })).toBeVisible();

    // ── 3. Grades & tests ──────────────────────────────────────────────────
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

    await selectChip(chipIn(page.locator('[data-field="academic_input.english_required"]'), 'Yes'));
    await chooseFromSelect(page, 'Test type', PROFILE.englishTest);
    await selectChip(chipIn(page.locator('[data-field="academic_input.english_status"]'), PROFILE.englishStatus));
    await page.getByLabel(/^Overall score/).fill(PROFILE.englishScore);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Activities & ambitions' })).toBeVisible();

    // ── 4. Activities ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Add activity' }).click();
    await selectChip(chipIn(page, PROFILE.activity.category));
    await selectChip(chipIn(page, PROFILE.activity.level));
    await selectChip(chipIn(page, PROFILE.activity.duration));
    await page.getByPlaceholder(/hackathon|Best delegate|award/i).first().fill(PROFILE.activity.highlight);
    await page.getByPlaceholder(/biomedical sciences/).fill(PROFILE.ambition);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Life at university' })).toBeVisible();

    // ── 5. Lifestyle ───────────────────────────────────────────────────────
    await selectChip(chipIn(page, PROFILE.teachingStyle));
    await selectChip(chipIn(page, PROFILE.locationType));
    await selectChip(chipIn(page, PROFILE.campusSize));
    await selectChip(chipIn(page, PROFILE.extracurricular));

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review & confirm' })).toBeVisible();

    // ── 6. Review & submit ─────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Submit & see matches' }).click();
    await expect(page.getByText('Profile saved! Your matches are ready.')).toBeVisible({ timeout: 60_000 });

    // ── Round trip ─────────────────────────────────────────────────────────
    // Drop the localStorage draft FIRST. Without this the reload could be
    // satisfied by the draft rather than by the server, and the test would prove
    // nothing about persistence. (A successful submit clears it already; this
    // makes the guarantee explicit rather than incidental.)
    await page.evaluate(() => window.localStorage.removeItem('ascenda-intake-draft'));

    await gotoStep(page, STEP.personal);
    await expect(page.getByLabel('First name')).toHaveValue(PROFILE.firstName);
    await expect(page.getByLabel('Last name')).toHaveValue(PROFILE.lastName);
    await expect(page.getByLabel('Email')).toHaveValue(PROFILE.email);
    await expect(page.getByPlaceholder('Search nationality…').first()).toHaveValue(PROFILE.nationality);
    await expect(page.getByLabel('Country of residence')).toHaveValue(PROFILE.residentCountry);
    await expect(page.getByLabel(/^City/)).toHaveValue(PROFILE.city);
    await expect(page.getByLabel(/^Age/)).toHaveValue(PROFILE.age);

    await gotoStep(page, STEP.studies);
    await expect(
      chipIn(page.locator('[data-field="academic_input.programme_type"]'), 'IB Diploma')
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('School name')).toHaveValue(PROFILE.schoolName);
    await expect(page.getByLabel('School country')).toHaveValue(PROFILE.schoolCountry);
    await expect(page.getByLabel(/^School city/)).toHaveValue(PROFILE.schoolCity);
    // These two are the F-A regression surface: Radix Selects rendered BEFORE
    // the hydration effect ran. They used to come back blank.
    await expect(page.getByRole('combobox', { name: 'School type' })).toHaveText(PROFILE.schoolType);
    await expect(page.getByRole('combobox', { name: 'Graduation year' })).toHaveText(GRADUATION_YEAR);
    await expect(
      page
        .locator('[data-field="academic_input.intended_clusters"]')
        .getByRole('button', { name: new RegExp(PROFILE.cluster) })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/^Career aspiration/)).toHaveValue(PROFILE.careerAspiration);

    await gotoStep(page, STEP.grades);
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
    await expect(page.getByRole('combobox', { name: 'Test type' })).toHaveText(PROFILE.englishTest);
    await expect(
      chipIn(page.locator('[data-field="academic_input.english_status"]'), PROFILE.englishStatus)
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/^Overall score/)).toHaveValue(PROFILE.englishScore);

    await gotoStep(page, STEP.activities);
    await expect(chipIn(page, PROFILE.activity.category)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.activity.level)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.activity.duration)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByPlaceholder(/biomedical sciences/)).toHaveValue(PROFILE.ambition);

    await gotoStep(page, STEP.lifestyle);
    await expect(chipIn(page, PROFILE.teachingStyle)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.locationType)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.campusSize)).toHaveAttribute('aria-pressed', 'true');
    await expect(chipIn(page, PROFILE.extracurricular)).toHaveAttribute('aria-pressed', 'true');
  });
});
