import { expect, type Page } from '@playwright/test';

/**
 * Opens the app and confirms the age gate. `seed` makes the next new life use
 * that seed (test builds only), so a test can count on how long it lives.
 */
export async function passAgeGate(page: Page, seed?: string): Promise<void> {
  await page.goto(seed ? `/?seed=${encodeURIComponent(seed)}` : '/');
  await expect(page.getByRole('heading', { name: 'Content notice' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m 18 or older' }).click();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();
}

export async function htmlTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.dataset.theme ?? null);
}

export interface CustomLifeData {
  first: string;
  last: string;
  /** "Man", "Woman" or "Nonbinary". */
  category: string;
  /** A preset label like "she/her", or all five forms for custom pronouns. */
  pronouns:
    | string
    | { subject: string; object: string; possessive: string; possessivePronoun: string; reflexive: string; plural: boolean };
  attractedTo: string[];
  parents: 'One parent' | 'Two parents';
  /** "None", "1", "2"... */
  siblings: string;
  wealth: string;
  city: string;
}

export const LONG_NAME_LIFE: CustomLifeData = {
  first: 'Maximilian-Alexander',
  last: 'Wolfeschlegelsteinhausen',
  category: 'Nonbinary',
  pronouns: { subject: 'ey', object: 'em', possessive: 'eir', possessivePronoun: 'eirs', reflexive: 'emself', plural: false },
  attractedTo: ['Women', 'Nonbinary people'],
  parents: 'Two parents',
  siblings: '3',
  wealth: 'Working class',
  city: 'Houston',
};

/**
 * Fills every custom creation step and starts the life. `onStep` runs on each
 * step before moving on (for layout checks).
 */
export async function createCustomLife(page: Page, data: CustomLifeData, onStep?: () => Promise<void>): Promise<void> {
  const next = async () => {
    if (onStep) await onStep();
    await page.getByRole('button', { name: 'Next' }).click();
  };

  await page.getByRole('button', { name: 'Create a custom life' }).click();

  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await page.getByLabel('First name').fill(data.first);
  await page.getByLabel('Last name').fill(data.last);
  await next();

  await expect(page.getByText('Step 2 of 6')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Which fits best?' }).getByRole('radio', { name: data.category }).click();
  const pronouns = page.getByRole('radiogroup', { name: 'Pronouns' });
  if (typeof data.pronouns === 'string') {
    await pronouns.getByRole('radio', { name: data.pronouns, exact: true }).click();
  } else {
    await pronouns.getByRole('radio', { name: 'Custom' }).click();
    await page.getByLabel('Subject', { exact: true }).fill(data.pronouns.subject);
    await page.getByLabel('Object', { exact: true }).fill(data.pronouns.object);
    await page.getByLabel('Possessive', { exact: true }).fill(data.pronouns.possessive);
    await page.getByLabel('Possessive pronoun', { exact: true }).fill(data.pronouns.possessivePronoun);
    await page.getByLabel('Reflexive', { exact: true }).fill(data.pronouns.reflexive);
    const verbs = page.getByRole('radiogroup', { name: 'Verbs' });
    await verbs.getByRole('radio', { name: data.pronouns.plural ? `${data.pronouns.subject} are` : `${data.pronouns.subject} is` }).click();
  }
  for (const who of data.attractedTo) await page.getByRole('button', { name: who, exact: true }).click();
  await next();

  await expect(page.getByText('Step 3 of 6')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Parents' }).getByRole('radio', { name: data.parents }).click();
  await page.getByRole('radiogroup', { name: 'Older siblings' }).getByRole('radio', { name: data.siblings, exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Family wealth' }).getByRole('radio', { name: data.wealth }).click();
  await next();

  await expect(page.getByText('Step 4 of 6')).toBeVisible();
  await page.getByRole('radio', { name: data.city }).click();
  await next();

  await expect(page.getByText('Step 5 of 6')).toBeVisible();
  await next();

  await expect(page.getByText('Step 6 of 6')).toBeVisible();
  if (onStep) await onStep();
  await page.getByRole('button', { name: 'Start this life' }).click();
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent?.trim(), h: r.height, w: r.width };
      })
      .filter((b) => b.h < 44 || b.w < 44),
  );
  expect(small).toEqual([]);
}
