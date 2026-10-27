import { expect, test, type Page } from '@playwright/test';
import { ageUp, createCustomLife, expectAge, goHome, openPage, passAgeGate, tab, type CustomLifeData } from './helpers';

async function homeName(page: Page): Promise<string> {
  return (await page.getByTestId('character-name').textContent())?.trim() ?? '';
}

test('a random life starts in one tap, in under a second', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();

  const started = Date.now();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  await expect(page.getByTestId('character-name')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(1000);

  // Home: name, the story so far, four stat bars with percentages; the family is on the People tab.
  await expectAge(page, 0);
  const meters = page.getByTestId('stat-panel').getByRole('meter');
  await expect(meters).toHaveCount(4);
  await expect(page.getByTestId('stat-panel')).toContainText(/\d+%/);
  await expect(page.getByText('Your story starts here.')).toBeVisible();
  await tab(page, 'People').click();
  const parents = page.getByRole('list', { name: 'Parents' }).getByRole('listitem');
  expect(await parents.count()).toBeGreaterThanOrEqual(1);
});

test('the life can be continued after closing and reopening', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const name = await homeName(page);
  await tab(page, 'People').click();
  const family = await page.getByRole('list', { name: 'Parents' }).innerText();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText(`${name} · Newborn`)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await homeName(page)).toBe(name);
  await tab(page, 'People').click();
  expect(await page.getByRole('list', { name: 'Parents' }).innerText()).toBe(family);
});

const CUSTOM: CustomLifeData = {
  first: 'Zoë',
  last: 'Nguyễn',
  category: 'Woman',
  pronouns: 'she/her',
  attractedTo: ['Women'],
  parents: 'One parent',
  siblings: '2',
  wealth: 'Affluent',
  city: 'New York',
};

test('a custom life uses every choice and persists', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await createCustomLife(page, CUSTOM);

  expect(await homeName(page)).toBe('Zoë Nguyễn');
  await expect(page.getByRole('banner')).toContainText('New York');
  await expectAge(page, 0);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-identity')).toContainText('she/her/hers');
  await page.keyboard.press('Escape');
  await tab(page, 'People').click();
  // One parent, two siblings and (C1) the parent's two parents.
  await expect(page.getByRole('list', { name: 'Parents' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Siblings' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Other family' }).getByRole('listitem').filter({ hasText: /Grand/ })).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Parents' }).getByRole('listitem').filter({ hasText: 'Nguyễn' })).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Siblings' }).getByRole('listitem').filter({ hasText: 'Nguyễn' })).toHaveCount(2);

  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await homeName(page)).toBe('Zoë Nguyễn');
});

test('custom creation validates each step', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Create a custom life' }).click();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 1 of 7')).toBeVisible();
  await expect(page.getByText('Enter a first name')).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('First name').fill('x'.repeat(31));
  await page.getByLabel('Last name').fill('Lee');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Use 30 characters or fewer')).toBeVisible();

  await page.getByLabel('First name').fill('Sam');
  await page.getByRole('button', { name: 'Next' }).click();
  // P1: the Look step comes next; it always has a look to show, so it asks for nothing.
  await expect(page.getByText('Step 2 of 7')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 7')).toBeVisible();

  // Custom pronouns need all five forms.
  await page.getByRole('radio', { name: 'Nonbinary' }).click();
  await page.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'Custom' }).click();
  await page.getByLabel('Reflexive', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 7')).toBeVisible();
  await expect(page.getByText(/Enter the reflexive form/)).toBeVisible();

  // B1: "Attracted to" must be chosen; "No one" is a valid choice, and choosing someone clears it.
  await page.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'they/them' }).click();
  await page.getByRole('radiogroup', { name: 'Can you carry a pregnancy?' }).getByRole('radio', { name: 'No', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 7')).toBeVisible();
  await expect(page.getByText('Choose who you are attracted to (or No one)')).toBeVisible();
  const noOne = page.getByRole('button', { name: 'No one', exact: true });
  await noOne.click();
  await expect(noOne).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Women', exact: true }).click();
  await expect(noOne).toHaveAttribute('aria-pressed', 'false');
  await noOne.click();
  await expect(page.getByRole('button', { name: 'Women', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 4 of 7')).toBeVisible();

  // Back keeps what was entered.
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(page.getByLabel('First name')).toHaveValue('Sam');
});

test('starting a new life over an existing one asks first', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const first = await homeName(page);

  await openPage(page, 'title');
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const sheet = page.getByRole('dialog', { name: 'Start a new life?' });
  await expect(sheet).toContainText(first);

  await sheet.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await homeName(page)).toBe(first);
});

test('reset all data removes the saved life', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  await openPage(page, 'settings');
  await page.getByRole('button', { name: 'Reset all data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('button', { name: 'I’m 18 or older' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
});

test('a damaged save is restored from the backup, with a notice once', async ({ page }) => {
  // The test content pack, so the first year plays the same whatever real events exist.
  await passAgeGate(page, { testPack: true, seed: 'e2e-pack' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const first = await homeName(page);

  // Aging up autosaves after each step of the year, so earlier saves become backups.
  await ageUp(page);
  await expectAge(page, 1);

  // Damage the active save: an empty first name.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wiplife');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction('lives', 'readwrite').objectStore('lives');
          const get = store.get('active');
          get.onsuccess = () => {
            const row = get.result as { envelope: { data: { character: { name: { first: string } } } } };
            row.envelope.data.character.name.first = '';
            const put = store.put(row);
            put.onsuccess = () => {
              open.result.close();
              resolve();
            };
            put.onerror = () => reject(put.error);
          };
        };
      }),
  );

  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Your last save was damaged.' })).toBeVisible();
  await expect(page.getByText(`${first} · 1 year old`)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await goHome(page);
  expect(await homeName(page)).toBe(first);

  // The restored life is saved, so the notice doesn't come back.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('Your last save was damaged.')).toHaveCount(0);
});
