/**
 * The People tab and person pages, played on the test content pack
 * (tests/e2e/content). In the pack, at 18 you meet someone you're attracted
 * to (and who is attracted to you); every management action answers with one
 * predictable event. With this seed the character is a woman attracted to
 * men, and meets a man.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, ageUpTimes, eventSheet, expectNoHorizontalScroll, expectTouchTargets, settle, startRandomLife } from './helpers';

const LOVE = { testPack: true, seed: 'e2e-love' };

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });
const actions = (page: Page) => page.getByRole('group', { name: 'Actions' });

/** Takes an action from the person page and plays its result card through. */
async function act(page: Page, action: string, choice = 'Continue'): Promise<string> {
  await actions(page).getByRole('button', { name: action, exact: true }).click();
  await settle(page);
  const sheet = eventSheet(page);
  await sheet.getByRole('button', { name: choice, exact: true }).click();
  await settle(page);
  const outcome = (await sheet.getByTestId('event-outcome').textContent()) ?? '';
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(eventSheet(page)).toHaveCount(0);
  return outcome;
}

test('the People tab groups people with bars, and a person page shows who they are', async ({ page }) => {
  await startRandomLife(page, LOVE);
  await ageUpTimes(page, 1);
  await tab(page, 'People').click();
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();

  const family = page.getByRole('list', { name: 'Family' });
  const members = await family.getByRole('listitem').count();
  expect(members).toBeGreaterThan(0);
  await expect(family.getByRole('meter')).toHaveCount(members * 2);
  await expect(family.getByRole('meter', { name: 'Affection' }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Friends' })).toContainText('No friends yet.');
  await expect(page.getByRole('region', { name: 'Love' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  await family.getByRole('button').first().click();
  await expect(page.getByTestId('person-name')).toBeVisible();
  await expect(page.getByTestId('person-line')).toContainText(/^(Mother|Father|Parent) · \d+ years old · /);
  await expect(page.getByRole('group', { name: /feels about you$/ }).getByRole('meter')).toHaveCount(2);
  await expect(page.getByText('No memories together yet.')).toBeVisible();
  // A one-year-old can't take any action with a parent.
  await expect(actions(page)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  await page.getByRole('button', { name: 'Back to People' }).click();
  await expect(page.getByRole('list', { name: 'Family' })).toBeVisible();
});

test('dating, engagement, moving in, marriage and divorce from the person page', async ({ page }) => {
  test.setTimeout(150_000);
  await startRandomLife(page, LOVE);
  // Gig work from 16 pays for the home you'll share later.
  await ageUpTimes(page, 16);
  await tab(page, 'Work/School').click();
  await page.getByRole('button', { name: 'Start gig work' }).click();
  await ageUpTimes(page, 2);

  // The person you met at 18 is an acquaintance, with a memory.
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button').first().click();
  const line = page.getByTestId('person-line');
  await expect(line).toContainText(/^Acquaintance · /);
  await expect(page.getByRole('list', { name: 'Memories' })).toContainText('Swapped numbers with you');
  const name = ((await page.getByTestId('person-name').textContent()) ?? '').trim();
  const first = name.split(' ')[0]!;
  await expect(actions(page).getByRole('button')).toHaveText(['Ask out', 'Cut contact']);

  // Ask out → dating. One action per person per year.
  expect(await act(page, 'Ask out', 'Ask')).toContain('says yes');
  await expect(line).toContainText(/^Boyfriend · /);
  await expect(actions(page)).toHaveCount(0);
  await tab(page, 'Life').click();
  await expect(page.getByTestId('romance-line')).toHaveText(`Dating ${name}`);

  // A year later: propose → engaged.
  await ageUp(page);
  await tab(page, 'People').click();
  await expect(page.getByRole('region', { name: 'Love' })).toContainText(name);
  await page.getByRole('list', { name: 'Love' }).getByRole('button').first().click();
  await expect(actions(page).getByRole('button')).toHaveText(['Propose', 'Move in together', 'Break up']);
  await act(page, 'Propose');
  await expect(line).toContainText(/^Fiancé · /);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // A year later: move in together. They pay their share of your home.
  await ageUp(page);
  await expect(actions(page).getByRole('button')).toHaveText(['Move in together', 'Get married', 'Break up']);
  await act(page, 'Move in together');
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('partner-line')).toHaveText(`Living with ${name}, who pays their share`);
  await expect(page.getByTestId('housing-line')).toContainText(/^Renting in /);
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Love' }).getByRole('button').first().click();

  // A year later: the wedding → married.
  await ageUp(page);
  await expect(actions(page).getByRole('button')).toHaveText(['Get married', 'Break up']);
  await act(page, 'Get married');
  await expect(line).toContainText(/^Husband · /);
  await expect(page.getByRole('list', { name: 'Memories' })).toContainText('Married you');
  await tab(page, 'Life').click();
  await expect(page.getByTestId('romance-line')).toHaveText(`Married to ${name}`);

  // A year later: divorce asks first, and can be cancelled.
  await ageUp(page);
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Love' }).getByRole('button').first().click();
  await expect(actions(page).getByRole('button')).toHaveText(['Divorce']);
  await actions(page).getByRole('button', { name: 'Divorce' }).click();
  const confirm = page.getByRole('dialog', { name: `Divorce ${first}?` });
  await expect(confirm).toContainText('This can’t be undone.');
  await expectTouchTargets(page);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(line).toContainText(/^Husband · /);

  await actions(page).getByRole('button', { name: 'Divorce' }).click();
  await page.getByRole('dialog', { name: `Divorce ${first}?` }).getByRole('button', { name: 'Divorce' }).click();
  await settle(page);
  const sheet = eventSheet(page);
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toContainText('The papers are signed.');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(line).toContainText(/^Ex-spouse · /);
  await expect(page.getByRole('list', { name: 'Memories' })).toContainText('Divorced you');

  await tab(page, 'Life').click();
  await expect(page.getByTestId('romance-line')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Your story' })).toContainText(`You and ${first} divorced.`);
  await expect(page.getByRole('list', { name: 'Your story' })).toContainText(`You married ${first}.`);
  // Divorced, they move out; you keep the home.
  await expect(page.getByRole('list', { name: 'Your story' })).toContainText(new RegExp(`${first} (packed .+ things and )?moved out\\.`));
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('partner-line')).toHaveCount(0);
  await expect(page.getByTestId('housing-line')).toContainText(/^Renting in /);

  // Everything survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await tab(page, 'People').click();
  await expect(page.getByRole('region', { name: 'Love' })).toContainText(name);
});
