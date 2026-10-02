/**
 * The interaction menu (E1), on the test content pack (tests/e2e/content):
 * every interaction there goes the same way (neutral), a fight always ends
 * in an injury and a charge, and no other events get in the way.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUpTimes, createCustomLife, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, type CustomLifeData } from './helpers';

const CHARACTER: CustomLifeData = {
  first: 'Sam',
  last: 'Rivera',
  category: 'Man',
  pronouns: 'he/him',
  attractedTo: ['Women'],
  parents: 'Two parents',
  siblings: '3',
  wealth: 'Middle class',
  city: 'Chicago',
};

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });
const card = (page: Page) => page.getByTestId('interaction-card');

async function startLife(page: Page): Promise<void> {
  await passAgeGate(page, { testPack: true, seed: 'e2e-interactions' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await createCustomLife(page, CHARACTER);
  await expect(page.getByTestId('character-name')).toBeVisible();
}

/** Opens a living family member's page from the People tab: the first one, or the first whose line matches (a living person's line ends "N years old"). */
async function openRelative(page: Page, kind?: string): Promise<void> {
  await tab(page, 'People').click();
  const family = page.getByRole('list', { name: 'Family' });
  const button = kind ? family.getByRole('button', { name: new RegExp(`(${kind}) · \\d+ years old`) }) : family.getByRole('button', { name: /years old/ });
  await button.first().click();
  await expect(page.getByTestId('person-name')).toBeVisible();
}

const interact = (page: Page, id: string) => page.getByTestId(`interaction-${id}`).click();

test('the Interact sheet shows only what fits, an everyday interaction gives an outcome card, and it survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await startLife(page);
  await ageUpTimes(page, 10);
  await openRelative(page);

  await page.getByTestId('interact-button').click();
  const sheet = page.getByTestId('interact-sheet');
  await expect(sheet).toBeVisible();
  for (const group of ['Everyday', 'Conflict', 'Practical']) await expect(sheet.getByRole('heading', { name: group })).toBeVisible();
  // A ten-year-old has no romance menu, and can't ask a parent for... advice at this age, or flirt.
  await expect(sheet.getByRole('heading', { name: 'Romance' })).toHaveCount(0);
  await expect(page.getByTestId('interaction-flirt')).toHaveCount(0);
  await expect(page.getByTestId('interaction-be_intimate')).toHaveCount(0);
  await expect(page.getByTestId('interaction-chat')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  await interact(page, 'chat');
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-tier', 'neutral');
  await expect(page.getByTestId('interaction-outcome')).not.toBeEmpty();
  await expect(page.getByTestId('interaction-outcome')).not.toContainText(/[{}]/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The card is saved with the life: reload and it's still there.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(card(page)).toBeVisible();
  await expect(page.getByTestId('interaction-outcome')).not.toBeEmpty();
  await page.getByTestId('interaction-done').click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(card(page)).toHaveCount(0);
});

test('close people show a mood, everyone else does not', async ({ page }) => {
  test.setTimeout(120_000);
  await startLife(page);
  await ageUpTimes(page, 3);
  await tab(page, 'People').click();
  // Family is close: each has a mood word in the list and on their page.
  const family = page.getByRole('list', { name: 'Family' });
  // The living (those with bars) show a mood; someone who has died doesn't.
  const members = await family.getByRole('listitem').filter({ has: page.getByRole('meter') }).count();
  expect(members).toBeGreaterThan(0);
  await expect(family.getByTestId('person-row-mood')).toHaveCount(members);
  await expect(family.getByTestId('person-row-mood').first()).toHaveText(
    /^(in a great mood|in good spirits|doing okay|stressed|having a rough time|annoyed with you)$/,
  );
  await family.getByRole('button').first().click();
  await expect(page.getByTestId('person-mood')).toHaveText(/ is (in a great mood|in good spirits|doing okay|stressed|having a rough time|annoyed with you)\.$/);
  await expectNoHorizontalScroll(page);
});

test('a gift takes real money and shows your new balance; a fight can escalate into an injury and a charge', async ({ page }) => {
  test.setTimeout(240_000);
  await startLife(page);
  await ageUpTimes(page, 16);
  // Gig work from 16 gives you something to spend.
  await tab(page, 'Work/School').click();
  await page.getByRole('button', { name: 'Start gig work' }).click();
  await ageUpTimes(page, 3);

  await openRelative(page);
  await page.getByTestId('interact-button').click();
  await interact(page, 'give_gift');
  const savings = Number(((await page.getByTestId('gift-savings').textContent()) ?? '').replace(/[^0-9]/g, ''));
  expect(savings).toBeGreaterThan(0);
  await expect(page.getByTestId('gift-tier-small')).toBeVisible();
  await expect(page.getByTestId('gift-tier-medium')).toContainText('$');
  await expect(page.getByTestId('gift-tier-big')).toContainText('$');
  await expectTouchTargets(page);
  await page.getByTestId('gift-tier-small').click();

  await expect(card(page)).toBeVisible();
  const moneyLine = (await page.getByTestId('interaction-money').textContent()) ?? '';
  expect(moneyLine).toMatch(/^−\$[\d,]+ · Savings now \$[\d,]+$/);
  const [spent, now] = (moneyLine.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
  expect(spent).toBeGreaterThan(0);
  expect(now).toBe(savings - spent!);
  await page.getByTestId('interaction-done').click();

  // The Money tab agrees.
  await tab(page, 'Money').click();
  await expect(page.getByText(`$${now!.toLocaleString('en-US')}`).first()).toBeVisible();

  // Picking a fight with a sibling: a tense stand-off opens a choice.
  await openRelative(page, 'Brother|Sister');
  await page.getByTestId('interact-button').click();
  await interact(page, 'pick_a_fight');
  await expect(card(page)).toBeVisible();
  await expect(page.getByTestId('interaction-prompt')).toBeVisible();
  await expect(page.getByTestId('interaction-done')).toHaveCount(0);
  await expect(page.getByTestId('interaction-choice-back_down')).toBeVisible();
  await page.getByTestId('interaction-choice-swing').click();
  await expect(page.getByTestId('interaction-result')).toContainText('You swing');
  await expect(page.getByTestId('interaction-notes')).toContainText('You broke a bone in the fight.');
  await expect(page.getByTestId('interaction-notes')).toContainText('charged with assault');
  await expect(page.getByTestId('interaction-changes')).toContainText('less fond of you');
  await page.getByTestId('interaction-done').click();

  // The injury is on your health page, through the health system.
  await tab(page, 'More').click();
  await page.getByRole('button', { name: /Health/ }).first().click();
  await expect(page.getByText('Broken bone').first()).toBeVisible();
});
