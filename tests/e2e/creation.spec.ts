import { expect, test, type Page } from '@playwright/test';
import { createCustomLife, passAgeGate, type CustomLifeData } from './helpers';

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

  // Home: name, age, six stat bars with no numbers, and family.
  await expect(page.getByText(/^Newborn · /)).toBeVisible();
  const meters = page.getByRole('group', { name: 'Stats' }).getByRole('meter');
  await expect(meters).toHaveCount(6);
  await expect(page.getByRole('group', { name: 'Stats' })).not.toContainText(/\d/);
  const family = page.getByRole('list', { name: 'Family' }).getByRole('listitem');
  expect(await family.count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Your story starts here.')).toBeVisible();
});

test('the life can be continued after closing and reopening', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const name = await homeName(page);
  const family = await page.getByRole('list', { name: 'Family' }).innerText();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText(`${name} · Newborn`)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await homeName(page)).toBe(name);
  expect(await page.getByRole('list', { name: 'Family' }).innerText()).toBe(family);
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
  await expect(page.getByText('Newborn · New York · she/her')).toBeVisible();
  const family = page.getByRole('list', { name: 'Family' }).getByRole('listitem');
  await expect(family).toHaveCount(3);
  await expect(family.filter({ hasText: /Sister|Brother|Sibling/ })).toHaveCount(2);
  await expect(family.filter({ hasText: 'Nguyễn' })).toHaveCount(3);

  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await homeName(page)).toBe('Zoë Nguyễn');
});

test('custom creation validates each step', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Create a custom life' }).click();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await expect(page.getByText('Enter a first name')).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('First name').fill('x'.repeat(31));
  await page.getByLabel('Last name').fill('Lee');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Use 30 characters or fewer')).toBeVisible();

  await page.getByLabel('First name').fill('Sam');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 6')).toBeVisible();

  // Custom pronouns need all five forms.
  await page.getByRole('radio', { name: 'Nonbinary' }).click();
  await page.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'Custom' }).click();
  await page.getByLabel('Reflexive', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 6')).toBeVisible();
  await expect(page.getByText(/Enter the reflexive form/)).toBeVisible();

  // Back keeps what was entered.
  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(page.getByLabel('First name')).toHaveValue('Sam');
});

test('starting a new life over an existing one asks first', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const first = await homeName(page);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Back to title' }).click();
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
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset all data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('button', { name: 'I’m 18 or older' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
});

test('a damaged save is restored from the backup, with a notice once', async ({ page }) => {
  // A seed that survives its first year.
  await passAgeGate(page, 'e2e-0');
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const first = await homeName(page);

  // Aging up autosaves after each step of the year, so earlier saves become backups.
  await page.getByRole('button', { name: 'Age Up' }).click();
  await expect(page.getByText(/^1 year old · /)).toBeVisible();

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
  expect(await homeName(page)).toBe(first);

  // The restored life is saved, so the notice doesn't come back.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('Your last save was damaged.')).toHaveCount(0);
});
