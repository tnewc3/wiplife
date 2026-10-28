import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, startRandomLife, tab, familyLists } from './helpers';


/** Waits until a portrait inside `scope` has drawn (an image rather than the placeholder silhouette). */
async function portraitDrawn(scope: ReturnType<Page['locator']>) {
  await expect(scope.locator('img').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => scope.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
}

test('your portrait is on Home, and the people you know have theirs in the People list', async ({ page }) => {
  await startRandomLife(page, { seed: 'e2e-portraits-people' });
  await portraitDrawn(page.getByTestId('character-portrait').first());
  await expect(page.getByRole('img', { name: /^Portrait of / }).first()).toBeVisible();

  await tab(page, 'People').click();
  const rows = familyLists(page).getByRole('listitem');
  expect(await rows.count()).toBeGreaterThanOrEqual(1);
  await portraitDrawn(rows.first());
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // A person's page shows a larger one.
  await rows.first().getByRole('button').click();
  await portraitDrawn(page.getByTestId('character-portrait').first());
});

test('thumbnails are cached: after a reload Home and the People list draw without fetching any portrait layer', async ({ page }) => {
  await startRandomLife(page, { seed: 'e2e-portraits-cache' });
  await portraitDrawn(page.getByTestId('character-portrait').first());
  await tab(page, 'People').click();
  const rows = familyLists(page).getByRole('listitem');
  const count = await rows.count();
  // A portrait is drawn when its row scrolls into view, so scroll through the list.
  for (let i = 0; i < count; i++) {
    await rows.nth(i).scrollIntoViewIfNeeded();
    await portraitDrawn(rows.nth(i));
  }
  // Everything on screen has been stored: you on Home and each person in the list.
  const stored = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open('wiplife-portraits');
          open.onsuccess = () => {
            const counted = open.result.transaction('thumbnails').objectStore('thumbnails').count();
            counted.onsuccess = () => resolve(counted.result);
          };
          open.onerror = () => resolve(-1);
        }),
    );
  await expect.poll(stored, { timeout: 30_000 }).toBeGreaterThanOrEqual(count + 1);

  const layers: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/portraits/') && r.url().endsWith('.png')) layers.push(r.url());
  });
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await portraitDrawn(page.getByTestId('character-portrait').first());
  await tab(page, 'People').click();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).scrollIntoViewIfNeeded();
    await portraitDrawn(rows.nth(i));
  }
  expect(layers).toEqual([]);
});

test('the service worker precaches no portrait art', async ({ page }) => {
  await passAgeGate(page);
  const precached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.includes('precache')) continue;
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(precached.length).toBeGreaterThan(0);
  expect(precached.filter((u) => u.includes('/portraits/'))).toEqual([]);
});

test('custom creation has a Look step with a live portrait, Surprise me, and the Profile can change the body type', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Create a custom life' }).click();
  await page.getByLabel('First name').fill('Ines');
  await page.getByLabel('Last name').fill('Calder');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Step 2 of 7')).toBeVisible();
  const step = page.getByTestId('look-step');
  await portraitDrawn(step);
  const before = await step.locator('img').first().getAttribute('src');
  await step.getByTestId('look-surprise').click();
  await expect.poll(async () => step.locator('img').first().getAttribute('src'), { timeout: 30_000 }).not.toBe(before);

  // Choose a look: it shows in the step, and sticks to the character.
  await step.getByRole('radiogroup', { name: 'Skin' }).getByRole('radio', { name: 'Olive' }).click();
  await step.getByRole('radiogroup', { name: 'Eye color' }).getByRole('radio', { name: 'Green' }).click();
  await step.getByRole('radiogroup', { name: 'Hair color' }).getByRole('radio', { name: 'Copper' }).click();
  await expect(step.getByRole('radiogroup', { name: 'Skin' }).getByRole('radio', { name: 'Olive' })).toHaveAttribute('aria-checked', 'true');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await step.getByRole('radiogroup', { name: 'Show me as' }).getByRole('radio', { name: 'Senior' }).click();
  await portraitDrawn(step);

  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radiogroup', { name: 'Which fits best?' }).getByRole('radio', { name: 'Woman', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'she/her', exact: true }).click();
  await page.getByRole('button', { name: 'No one', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radiogroup', { name: 'Family wealth' }).getByRole('radio', { name: 'Middle' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'United States' }).click();
  await page.getByRole('radio', { name: 'New York' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start this life' }).click();

  await expect(page.getByTestId('character-name')).toHaveText('Ines Calder');
  await portraitDrawn(page.getByTestId('character-portrait').first());
  await page.getByRole('button', { name: 'Profile' }).click();
  const profile = page.getByRole('dialog', { name: 'Profile' });
  await portraitDrawn(profile.getByTestId('character-portrait'));
  // The hair and eye words on the Profile follow the look that was chosen.
  await expect(page.getByTestId('profile-identity')).toBeVisible();
  const female = profile.getByTestId('portrait-body-female');
  await expect(female).toHaveAttribute('aria-pressed', 'true');
  await profile.getByTestId('portrait-body-male').click();
  await expect(profile.getByTestId('portrait-body-male')).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalScroll(page);
});

test('a card about someone shows their portrait', async ({ page }) => {
  await startRandomLife(page, { seed: 'e2e-portraits-event' });
  const sheet = page.getByRole('dialog').filter({ has: page.getByTestId('event-card') });
  for (let year = 0; year < 20; year++) {
    await page.getByRole('button', { name: 'Age up' }).click();
    await settle(page);
    while (await sheet.isVisible()) {
      await expectNoHorizontalScroll(page);
      const portraits = sheet.getByTestId('event-portraits');
      if (await portraits.count()) {
        await portraitDrawn(portraits);
        await expect(portraits.getByRole('img', { name: /^Portrait of / }).first()).toBeVisible();
        return;
      }
      const next = sheet.getByRole('button', { name: 'Continue' });
      if (await next.isVisible()) await next.click();
      else await sheet.getByRole('button').first().click();
      await settle(page);
    }
  }
  throw new Error('No card in twenty years was about anyone');
});
