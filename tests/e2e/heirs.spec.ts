/**
 * Heir play and inheritance (E2b), at phone size on the test content pack: write
 * a will under More, the Death screen with the estate and the choice of heir,
 * the "Previously" card, money held in trust, family lines in More → Family and the archive.
 */
import { expect, test, type Page } from '@playwright/test';
import { deadLife, familyLife, loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });
const OPEN = { testPack: true };

test('write a will under More: shares in steps of 5, a total that must reach 100, saved and kept', async ({ page }) => {
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, familyLife({ seed: 'e2e-heir-will', kids: [9, 30], spouse: true }));
  await page.getByRole('button', { name: 'Continue' }).click();
  await tab(page, 'More').click();
  await page.getByTestId('more-will').click();
  await expect(page.getByRole('heading', { name: 'Write a will' })).toBeVisible();
  await expect(page.getByTestId('will-defaults')).toContainText('Without a will:');
  await expect(page.getByTestId('will-total')).toContainText('Total: 0%');
  await expect(page.getByTestId('will-save')).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Name your spouse and both children, then split it evenly.
  for (const name of ['Sam Spouse']) await page.getByRole('button', { name: `More for ${name}`, exact: true }).click();
  const kids = page.getByRole('list', { name: 'Who could inherit' }).getByRole('listitem').filter({ hasText: 'Child' });
  await expect(kids).toHaveCount(2);
  for (let i = 0; i < 2; i++) await kids.nth(i).getByRole('button', { name: /^More for/ }).click();
  await expect(page.getByTestId('will-total')).toContainText('Total: 15%');
  await expect(page.getByTestId('will-total')).toContainText('85% still to give out');
  await page.getByRole('button', { name: 'Split evenly between those chosen' }).click();
  await expect(page.getByTestId('will-total')).toHaveText('Total: 100%');
  await expect(page.getByTestId('will-save')).toBeEnabled();
  // A minor's share is marked as held in trust.
  await expect(page.getByRole('list', { name: 'Who could inherit' })).toContainText('under 18, held in trust');
  await page.getByTestId('will-save').click();
  await expect(page.getByTestId('will-message')).toHaveText('Your will is saved.');

  // It is kept: leave and come back, and after a reload.
  await page.getByRole('button', { name: 'Back to More' }).click();
  await page.getByTestId('more-will').click();
  await expect(page.getByTestId('will-total')).toHaveText('Total: 100%');
  await expect(page.getByTestId('will-defaults')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await tab(page, 'More').click();
  await page.getByTestId('more-will').click();
  await expect(page.getByTestId('will-total')).toHaveText('Total: 100%');
  await page.getByTestId('will-clear').click();
  await expect(page.getByTestId('will-message')).toContainText('cleared');
  await expect(page.getByTestId('will-total')).toContainText('Total: 0%');
});

test('a child cannot write a will', async ({ page }) => {
  await passAgeGate(page, { ...OPEN, seed: 'e2e-heir-child' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  await tab(page, 'More').click();
  await expect(page.getByTestId('more-will')).toHaveCount(0);
});

test('death settles the estate; continue as a child of 9: Previously, trust, family line, and the archive groups the generations', async ({ page }) => {
  test.setTimeout(120_000);
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, deadLife(familyLife({ seed: 'e2e-heir-death', kids: [9, 30], spouse: true })));

  // The Death screen: obituary, the estate being settled, and who can carry on.
  await expect(page.getByText('In memoriam')).toBeVisible();
  const estate = page.getByTestId('death-estate');
  await expect(estate).toContainText('There was no will, so the default shares applied.');
  await expect(estate).toContainText('Funeral and settlement costs');
  await expect(page.getByRole('list', { name: 'Who received what' })).toContainText('Spouse · 50%');
  await expect(page.getByRole('list', { name: 'Who received what' })).toContainText('Child · 25%');
  const heirs = page.getByTestId('death-heirs');
  await expect(heirs).toContainText('Who carries on?');
  await expect(heirs.getByRole('button')).toHaveCount(2);
  await expect(heirs).toContainText('9 years old · will live with a guardian');
  await expect(heirs).toContainText('held in trust until 18');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // A reload keeps the choice waiting.
  await page.reload();
  await expect(page.getByTestId('death-heirs')).toBeVisible();

  // Continue as the nine-year-old.
  await page.getByTestId('death-heirs').getByRole('button').filter({ hasText: '9 years old' }).click();
  await expect(page.getByTestId('previously-card')).toBeVisible();
  await expect(page.getByTestId('previously-card')).toContainText('Sam');
  await expect(page.getByTestId('previously-card')).toContainText('held in trust for you until you turn 18');
  await expect(page.getByTestId('character-name')).not.toBeEmpty();
  await expect(page.getByText('Living with Sam Spouse')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Their story begins with the childhood recap.
  await page.getByRole('button', { name: 'See your whole life' }).click();
  await expect(page.getByRole('heading', { name: 'Life history' })).toBeVisible();
  await expect(page.getByText(/died at 52/)).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();

  // The money is held in trust.
  await tab(page, 'Money').click();
  await expect(page.getByTestId('trust-card')).toContainText('Held in trust');
  await expect(page.getByTestId('trust-balance')).toContainText('$');
  await expect(page.getByTestId('savings')).toHaveText('$0');
  await expectNoHorizontalScroll(page);

  // More → Family shows the family line: generation two.
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(page.getByTestId('family-line')).toContainText('family');
  await expect(page.getByTestId('family-line-facts')).toContainText('Generation 2');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Back to More' }).click();

  // The first year ends the "Previously" card.
  await tab(page, 'Life').click();
  await page.getByRole('button', { name: 'Age Up' }).click();
  await expect(page.getByRole('button', { name: 'Age Up' })).toBeVisible({ timeout: 15_000 });

  // Settings → Back to title → Archive: the parent's life is kept in a family line, with its heir.
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const lines = page.getByRole('list', { name: 'Family lines' });
  await expect(lines.getByRole('listitem').first()).toContainText('Generation 1');
  await expect(lines).toContainText('Carried on by');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await lines.getByRole('button').first().click();
  await expect(page.getByTestId('archived-line')).toContainText('Generation 1');
});

test('a life with no living children is archived at once, and the estate still shows (a spouse, and parents and siblings by the default shares)', async ({ page }) => {
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, deadLife(familyLife({ seed: 'e2e-heir-none', kids: [], spouse: true })));
  await expect(page.getByText('In memoriam')).toBeVisible();
  await expect(page.getByTestId('death-estate')).toContainText('Spouse · 80%');
  await expect(page.getByTestId('death-heirs')).toHaveCount(0);
  await expect(page.getByText('This life has been saved to your archive.')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
