/**
 * The social web (E4), at phone size on the test content pack: Connections on
 * a person's page, "What they've heard" on a close person's page, introducing
 * two people you know through a picker, and setting the record straight or
 * asking someone to keep it quiet. In the pack the web is still and every
 * interaction goes neutral (tests/e2e/content/balance).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';
import { webLife } from './webFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });
const OPEN = { testPack: true };

async function openFixture(page: Page): Promise<void> {
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, webLife('e2e-web'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function openPerson(page: Page, list: 'Family' | 'Friends', name: RegExp): Promise<void> {
  await tab(page, 'People').click();
  await page.getByRole('list', { name: list }).getByRole('button', { name }).click();
}

test("a person's page shows who they are close to and who they are feuding with", async ({ page }) => {
  await openFixture(page);
  await openPerson(page, 'Family', /Dolores/);
  const card = page.getByTestId('connections');
  await expect(card.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(card).toContainText('Frank Rivera, your father');
  await expect(card).toContainText('Married · Close');
  await expect(card).toContainText('Rae Rivera, your sister');
  await expect(card).toContainText('Parent and child · Close');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The same tie from the other side, and a feud.
  await page.getByRole('button', { name: 'Back to People' }).click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Marcus/ }).click();
  await expect(page.getByTestId('connections')).toContainText('Jo Rivera, your friend');
  await expect(page.getByTestId('connections')).toContainText('Friends · Feuding');
});

test("a close person's page shows what they have heard about you, their version of the story", async ({ page }) => {
  await openFixture(page);
  await openPerson(page, 'Friends', /Marcus/);
  const heard = page.getByTestId('heard');
  await expect(heard.getByRole('heading', { name: "What they've heard" })).toBeVisible();
  await expect(heard).toContainText('Marcus has heard that you were fired for stealing.');
  await expect(heard).toContainText("They heard it from someone else, and it isn't how it was.");
  await page.getByRole('button', { name: 'Back to People' }).click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Jo/ }).click();
  await expect(page.getByTestId('heard')).toContainText('Jo has heard that you did something illegal and got away with it.');
  await expect(page.getByTestId('heard')).toContainText('They saw it for themselves.');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // Family and people with nothing to say have no such card.
  await page.getByRole('button', { name: 'Back to People' }).click();
  await page.getByRole('list', { name: 'Family' }).getByRole('button', { name: /Rae/ }).click();
  await expect(page.getByTestId('heard')).toHaveCount(0);
});

test('introducing two people you know: pick who, and they have a tie', async ({ page }) => {
  await openFixture(page);
  await openPerson(page, 'Family', /Rae/);
  await expect(page.getByTestId('connections')).not.toContainText('Marcus');
  await page.getByTestId('interact-button').click();
  await page.getByTestId('interaction-introduce').click();
  const picker = page.getByTestId('interact-picker');
  await expect(picker).toBeVisible();
  await expect(picker).toContainText('Marcus Rivera');
  await expect(picker).toContainText('Jo Rivera');
  // Rae already has ties to the parents, so they aren't offered.
  await expect(picker).not.toContainText('Frank');
  await expectTouchTargets(page);
  await expectNoHorizontalScroll(page);
  await page.getByTestId('pick-frd').click();
  const card = page.getByTestId('interaction-card');
  await expect(card).toContainText(/polite|pleasant/);
  await page.getByTestId('interaction-done').click();
  await expect(page.getByTestId('connections')).toContainText('Marcus Rivera, your friend');
  await expect(page.getByTestId('connections')).toContainText('Friends');
});

test('setting the record straight and asking for quiet pick which story it is about', async ({ page }) => {
  await openFixture(page);
  await openPerson(page, 'Friends', /Marcus/);
  await page.getByTestId('interact-button').click();
  // Marcus knows only a twisted version of something that is not a secret: set it straight, but nothing to keep quiet.
  await expect(page.getByTestId('interaction-keep_it_quiet')).toHaveCount(0);
  await page.getByTestId('interaction-set_record_straight').click();
  const picker = page.getByTestId('interact-picker');
  await expect(picker).toContainText('…that you were fired for stealing');
  await page.getByTestId('pick-k1').click();
  const card = page.getByTestId('interaction-card');
  await expect(card).toContainText('Marcus heard that you were fired for stealing.');
  await page.getByTestId('interaction-done').click();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Jo knows the true version of a secret: you can ask Jo to keep it quiet, and there is nothing to set straight.
  await page.getByRole('button', { name: 'Back to People' }).click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Jo/ }).click();
  await page.getByTestId('interact-button').click();
  await expect(page.getByTestId('interaction-set_record_straight')).toHaveCount(0);
  await page.getByTestId('interaction-keep_it_quiet').click();
  await expect(page.getByTestId('interact-picker')).toContainText('…that you did something illegal and got away with it');
  await page.getByTestId('pick-k2').click();
  await expect(page.getByTestId('interaction-card')).toContainText('Jo');
});
