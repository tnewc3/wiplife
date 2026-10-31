/**
 * God mode (G1), on the test content pack: switch it on in Settings, edit your stats and a friend's attraction, have a refused
 * edit explained, reload and see the edits kept, and switch it off to see the buttons gone.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { godmodeLife } from './godmodeFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, goHome, openPage, passAgeGate, settle, goTab } from './helpers';

const SEED = 'e2e-godmode';
const happiness = (page: Page) => page.getByRole('meter', { name: 'Happiness' });

async function openLife(page: Page): Promise<void> {
  await passAgeGate(page, { testPack: true, seed: SEED });
  await loadSavedLife(page, godmodeLife(SEED));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function setGodMode(page: Page, on: boolean): Promise<void> {
  await openPage(page, 'settings');
  const toggle = page.getByTestId('god-mode-switch');
  await expect(toggle).toHaveAttribute('aria-checked', String(!on));
  await toggle.click();
  if (on) {
    const sheet = page.getByRole('dialog', { name: 'Switch on God mode?' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Switch it on' }).click();
  }
  await expect(toggle).toHaveAttribute('aria-checked', String(on));
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await goHome(page);
}

test('god mode: off by default, switched on in Settings, edits kept after a reload, and switched off again', async ({ page }) => {
  test.setTimeout(150_000);
  await openLife(page);

  // Off by default: no Edit button on the Profile.
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByTestId('god-edit-self')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await setGodMode(page, true);

  // Edit your stats.
  await expect(happiness(page)).toHaveAttribute('aria-valuenow', '40');
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByTestId('god-edit-self').click();
  await expect(page.getByRole('heading', { name: 'Edit you' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  const slider = page.getByRole('slider', { name: 'Happiness', exact: true });
  await slider.fill('90');
  await expect(page.getByTestId('god-save')).toHaveText('Save changes (1)');
  await page.getByTestId('god-save').click();
  await expect(page.getByTestId('god-saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(happiness(page)).toHaveAttribute('aria-valuenow', '90');

  // A refused edit is explained, and changes nothing: savings above the cap.
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByTestId('god-edit-self').click();
  await page.getByRole('button', { name: 'Money', exact: true }).click();
  await page.getByLabel('Savings').fill('2000000000');
  await page.getByTestId('god-save').click();
  const panel = page.getByTestId('god-refusals');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'alert');
  await expect(panel).toContainText('Can’t save that');
  await expect(panel).toContainText('Between');
  await expectNoHorizontalScroll(page);
  await page.getByTestId('god-revert').click();
  await expect(panel).toHaveCount(0);
  // Your age is never editable: it says why.
  await page.getByRole('button', { name: 'Age', exact: true }).click();
  await expect(page.getByTestId('god-age-fixed')).toContainText('can’t be edited');
  await page.getByRole('button', { name: 'Back' }).click();

  // A friend's attraction: Ben is attracted to women only; make it men too.
  await goTab(page, 'People');
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Ben Rivera/ }).click();
  await page.getByTestId('god-edit-person').click();
  await expect(page.getByRole('heading', { name: 'Edit Ben' })).toBeVisible();
  await page.getByRole('button', { name: 'Identity', exact: true }).click();
  const men = page.getByRole('button', { name: 'Men', exact: true });
  await expect(men).toHaveAttribute('aria-pressed', 'false');
  await men.click();
  await page.getByTestId('god-save').click();
  await expect(page.getByTestId('god-saved')).toBeVisible();
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Back' }).click();

  // The refusal for a minor as a partner is explained beside the choice, before it is tried; and it can't be chosen.
  await page.getByRole('button', { name: 'Back to People' }).click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Kit Rivera/ }).click();
  await page.getByTestId('god-edit-person').click();
  await page.getByRole('button', { name: 'Relationship', exact: true }).click();
  await expect(page.getByTestId('god-kind-partner')).toBeDisabled();
  await expect(page.getByTestId('god-kind-partner-why')).toContainText('Kit is under 18');
  await expect(page.getByTestId('god-kind-ex')).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Back' }).click();

  // Reload: the edits are kept.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await expect(happiness(page)).toHaveAttribute('aria-valuenow', '90');
  await goTab(page, 'People');
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Ben Rivera/ }).click();
  await page.getByTestId('god-edit-person').click();
  await page.getByRole('button', { name: 'Identity', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Men', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back' }).click();

  // Switch it off: the buttons are gone.
  await goHome(page);
  await setGodMode(page, false);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByTestId('god-edit-self')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await goTab(page, 'People');
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Ben Rivera/ }).click();
  await expect(page.getByTestId('god-edit-person')).toHaveCount(0);
});
