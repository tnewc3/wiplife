import { expect, type Page } from '@playwright/test';

export interface OpenOptions {
  /** The next new life uses this seed (test builds only). */
  seed?: string;
  /** Load the test content pack (tests/e2e/content) instead of the real events. */
  testPack?: boolean;
}

/** Opens the app and confirms the age gate. */
export async function passAgeGate(page: Page, options: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams();
  if (options.testPack) params.set('content', 'test');
  if (options.seed) params.set('seed', options.seed);
  const query = params.toString();
  await page.goto(query ? `/?${query}` : '/');
  await expect(page.getByRole('heading', { name: 'Content notice' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m 18 or older' }).click();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();
}

/** Starts a random life and returns the character's name. */
export async function startRandomLife(page: Page, options: OpenOptions = {}): Promise<string> {
  await passAgeGate(page, options);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  return (await page.getByTestId('character-name').textContent())?.trim() ?? '';
}

export const ageUpButton = (page: Page) => page.getByRole('button', { name: 'Age Up' });
export const eventSheet = (page: Page) => page.getByRole('dialog').filter({ has: page.getByTestId('event-card') });

/** Waits until the screen is ready for the next tap: Age Up, an event card, or the Death screen. */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (document.body.textContent?.includes('In memoriam')) return true;
    const sheet = document.querySelector('[aria-labelledby="event-title"]');
    if (sheet) return [...sheet.querySelectorAll('button')].every((b) => !b.disabled);
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Age Up');
    return button !== undefined && !button.disabled;
  });
}

/** Answers every event card with its first choice, through to the end of the recap. */
export async function playThroughEvents(page: Page): Promise<void> {
  while (await eventSheet(page).isVisible()) {
    const sheet = eventSheet(page);
    const next = sheet.getByRole('button', { name: 'Continue' });
    if (await next.isVisible()) await next.click();
    else await sheet.getByRole('button').first().click();
    await settle(page);
  }
}

/** Taps Age Up and plays the year out (events answered with their first choice). */
export async function ageUp(page: Page): Promise<void> {
  await ageUpButton(page).click();
  await settle(page);
  await playThroughEvents(page);
}

export async function ageUpTimes(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await ageUp(page);
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
  await page.getByRole('radiogroup', { name: 'Which fits best?' }).getByRole('radio', { name: data.category, exact: true }).click();
  // A nonbinary character is asked whether they can carry a pregnancy.
  if (data.category === 'Nonbinary') {
    await page.getByRole('radiogroup', { name: 'Can you carry a pregnancy?' }).getByRole('radio', { name: 'No', exact: true }).click();
  }
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

/** Touch targets are at least 44px (docs/design.md, section K). */
const MIN_TOUCH_TARGET = 44;
/**
 * Measured sizes can come out a hair under their CSS size (43.9999px) from
 * subpixel rounding, for example while a sheet slides in; that's not a
 * smaller target.
 */
const SUBPIXEL_TOLERANCE = 0.5;

export async function expectTouchTargets(page: Page): Promise<void> {
  const min = MIN_TOUCH_TARGET - SUBPIXEL_TOLERANCE;
  const small = await page.evaluate(
    (limit) =>
      [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { text: b.textContent?.trim(), h: r.height, w: r.width };
        })
        .filter((b) => b.h < limit || b.w < limit),
    min,
  );
  expect(small).toEqual([]);
}
