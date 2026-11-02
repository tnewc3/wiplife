/**
 * Fame in arts and media (E6b), at phone size: the Work tab's Fame card, the
 * Fame screen (the ladder with your rung and the next milestone, bars and
 * words for fame, image and fan mood, commitment, agent and contract,
 * projects, awards), the creative choices step, the ways in, young stars and
 * the tabloid headline in the news feed. Lives are built with the engine on the
 * test content pack (tests/e2e/fameFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { fameLife, type FameLife } from './fameFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, goTab } from './helpers';


async function open(page: Page, options: FameLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, fameLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

const openScreen = async (page: Page) => {
  await goTab(page, 'Job');
  await page.getByTestId('fame-open').click();
  await expect(page.getByTestId('fame-screen')).toBeVisible();
};

test('the Career tab shows your craft with a Fame bar, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-1' });
  await goTab(page, 'Job');
  const row = page.getByTestId('role-fame');
  await expect(row).toBeVisible();
  await expect(row.getByRole('meter', { name: 'Fame' })).toBeVisible();
  await expect(page.getByTestId('fame-open')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('the Fame screen shows the ladder, the bars, the agent and what you have released', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-2' });
  await openScreen(page);
  const ladder = page.getByRole('list', { name: 'Music ladder' });
  await expect(ladder.getByRole('listitem')).toHaveCount(7);
  await expect(ladder.locator('[aria-current="step"]')).toContainText('First-release artist');
  await expect(page.getByTestId('next-music')).toContainText('Get signed by a label');
  await expect(page.getByTestId('fame-screen').getByRole('meter', { name: 'Fame' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Public image' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Fan mood' })).toBeVisible();
  await expect(page.getByTestId('screen-mood')).toContainText(/fans/);
  await expect(page.getByTestId('agent-line')).toContainText('Quill & Marlow');
  const row = page.getByTestId('project-row').first();
  await expect(row).toContainText('Critics’ darling');
  await expect(row).toContainText(/Critics: (liked|loved)/);
  await expect(row).toContainText(/Fans: (mixed|liked|panned)/);
  await expect(page.getByTestId('fame-screen')).not.toContainText(/\b\d{2,3}\/100\b/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('commitment changes with one tap, and the project step takes the creative choices', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-3' });
  await openScreen(page);
  await expect(page.getByTestId('commitment-steady')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('commitment-all').click();
  await expect(page.getByTestId('commitment-all')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('plan-open').click();
  const sheet = page.getByRole('dialog', { name: 'Line up a project' });
  await expect(sheet).toBeVisible();
  // A kind your rung doesn't allow is greyed out; the choices are radios.
  await expect(sheet.getByTestId('project-kind-album')).toBeEnabled();
  await sheet.getByTestId('project-kind-ep').click();
  await sheet.getByTestId('project-style-artistic').click();
  await sheet.getByTestId('project-risk-bold').click();
  // Batch 4: no tour box on a project (tours are booked on their own); the press run stays.
  await expect(sheet.getByTestId('project-tour')).toHaveCount(0);
  await sheet.getByTestId('project-press').check();
  await expectTouchTargets(page);
  await sheet.getByTestId('project-save').click();
  await expect(page.getByTestId('plan-summary')).toContainText(/An EP called “.+”: .*artistic, bold, with a press run/);
});

test('with no career the Fame screen shows the ways in, and starting one puts you on the ladder', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-4', none: true });
  await goTab(page, 'Job');
  await page.getByTestId('fame-open').click();
  await expect(page.getByTestId('entry')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Music routes' }).getByRole('listitem')).toHaveCount(4);
  await page.getByTestId('enter-music-open_mic').click();
  await expect(page.getByRole('list', { name: 'Music ladder' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Music ladder' }).locator('[aria-current="step"]')).toContainText('Open-mic regular');
  await expectNoHorizontalScroll(page);
});

test('a young star has a parent sign, cannot go all in, and has no scene to spend on', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-5', age: 14 });
  await openScreen(page);
  await expect(page.getByTestId('fame-screen')).toContainText('A parent signs your contracts');
  await expect(page.getByTestId('commitment-all')).toBeDisabled();
  await expect(page.getByTestId('scene')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a tabloid headline appears in the news feed on the Life tab', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-6', headline: true });
  await expect(page.getByTestId('tabloid-headline')).toContainText('In the tabloids: Rising Star Caught Out Until Dawn');
  await expectNoHorizontalScroll(page);
});

test('a retired star can go back to work', async ({ page }) => {
  await open(page, { seed: 'e2e-fame-7', retired: true });
  await goTab(page, 'Job');
  await page.getByTestId('fame-open').click();
  await page.getByTestId('return-fame').click();
  await expect(page.getByRole('list', { name: 'Music ladder' })).toBeVisible();
});
