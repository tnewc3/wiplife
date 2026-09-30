import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate } from './helpers';

async function startRandomLife(page: Page): Promise<string> {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  return (await page.getByTestId('character-name').textContent())?.trim() ?? '';
}

const ageUpButton = (page: Page) => page.getByRole('button', { name: 'Age Up' });

/** Taps Age Up and waits until the year has finished (or the life has ended). */
async function ageUp(page: Page): Promise<void> {
  await ageUpButton(page).click();
  await page.waitForFunction(() => {
    if (document.body.textContent?.includes('In memoriam')) return true;
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Age Up');
    return button !== undefined && !button.disabled;
  });
}

async function ageUpTimes(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    if (await page.getByText('In memoriam').isVisible()) return;
    await ageUp(page);
  }
}

async function liveToDeath(page: Page): Promise<void> {
  for (let i = 0; i < 125 && !(await page.getByText('In memoriam').isVisible()); i++) await ageUp(page);
  await expect(page.getByText('In memoriam')).toBeVisible();
}

test('Age Up advances a year with a recap, and life stages change', async ({ page }) => {
  await startRandomLife(page);
  await expect(ageUpButton(page)).toBeInViewport({ ratio: 1 });
  await ageUp(page);
  await expect(page.getByText(/^1 year old · /)).toBeVisible();
  await expect(page.getByRole('region', { name: /· 1 year old$/ })).toBeVisible();

  await ageUpTimes(page, 12);
  if (await page.getByText('In memoriam').isVisible()) return; // A rare early death; covered below.
  await expect(page.getByText(/^13 years old · /)).toBeVisible();
  await expect(page.getByText(/Teen years/)).toBeVisible();
  const story = page.getByRole('list', { name: 'Your story' });
  await expect(story).toContainText(/teenager/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('rapid taps on Age Up advance only one year', async ({ page }) => {
  await startRandomLife(page);
  // Three clicks in the same moment, before the screen can update.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Age Up')!;
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByText(/^1 year old · /)).toBeVisible();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Age Up');
    return button !== undefined && !button.disabled;
  });
  await expect(page.getByText(/^1 year old · /)).toBeVisible();
});

test('the Life history screen shows the whole timeline', async ({ page }) => {
  await startRandomLife(page);
  await ageUpTimes(page, 6);
  if (await page.getByText('In memoriam').isVisible()) return;
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Life history' }).click();
  await expect(page.getByRole('heading', { name: 'Life history' })).toBeVisible();
  const timeline = page.getByRole('list', { name: 'Life history' });
  await expect(timeline).toContainText('Age 5');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
});

test('a full life ends in an obituary, goes into the archive, and a new life starts', async ({ page }) => {
  test.setTimeout(180_000);
  const name = await startRandomLife(page);
  await liveToDeath(page);

  // Death and Obituary screen.
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const obituary = page.getByTestId('obituary');
  await expect(obituary).toContainText(name);
  await expect(obituary).toContainText(/died/);
  await expect(page.getByText('This life has been saved to your archive.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Archive list and detail.
  await page.getByRole('button', { name: 'Open the archive' }).click();
  const lives = page.getByRole('list', { name: 'Past lives' }).getByRole('listitem');
  await expect(lives).toHaveCount(1);
  await expect(lives.first()).toContainText(name);
  await expect(lives.first()).toContainText(/Died of /);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await lives.first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Past life' })).toBeVisible();
  await expect(page.getByTestId('obituary')).toContainText(name);
  await expect(page.getByRole('group', { name: 'Final stats' }).getByRole('meter')).toHaveCount(6);
  await expect(page.getByRole('list', { name: 'Timeline' })).toContainText(/You died of/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The archive survives a reload; there is nothing to continue.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('list', { name: 'Past lives' }).getByRole('listitem')).toHaveCount(1);

  // Start again.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  await expect(page.getByText(/^Newborn · /)).toBeVisible();
});

test('starting over moves the current life into the archive, unfinished', async ({ page }) => {
  const name = await startRandomLife(page);
  await ageUpTimes(page, 2);
  if (await page.getByText('In memoriam').isVisible()) return;

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const sheet = page.getByRole('dialog', { name: 'Start a new life?' });
  await expect(sheet).toContainText(`${name}’s life will move to your archive, marked unfinished.`);
  await sheet.getByRole('button', { name: 'Start a new life' }).click();
  await expect(page.getByText(/^Newborn · /)).toBeVisible();

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const item = page.getByRole('list', { name: 'Past lives' }).getByRole('listitem').first();
  await expect(item).toContainText(name);
  await expect(item).toContainText('Unfinished');
  await item.getByRole('button').click();
  await expect(page.getByTestId('obituary')).toContainText(/unfinished/);
});

test('an empty archive says so', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('No past lives yet.')).toBeVisible();
});
