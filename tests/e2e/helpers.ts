import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { parse } from 'yaml';

export interface OpenOptions {
  /** The next new life uses this seed (test builds only). */
  seed?: string;
  /** Load the test content pack (tests/e2e/content) instead of the real events. */
  testPack?: boolean;
  /** The next new life starts in this country (test builds only); a seeded life is a US life when left out. */
  country?: string;
}

/** Opens the app and confirms the age gate. */
export async function passAgeGate(page: Page, options: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams();
  if (options.testPack) params.set('content', 'test');
  if (options.seed) params.set('seed', options.seed);
  if (options.country) params.set('country', options.country);
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

export const ageUpButton = (page: Page) => page.getByRole('button', { name: 'Age up' });

/** The bottom navigation (U1): Job (School while enrolled), Assets, the Age button, People and Activities. */
export const gameNav = (page: Page) => page.getByRole('navigation', { name: 'Game sections' });
/** A main tab by its name: "Job" matches School while you are enrolled; "Work/School" is the old name for the same tab. */
export const tab = (page: Page, name: 'People' | 'Assets' | 'Activities' | 'Job' | 'Work/School' | 'Money') =>
  gameNav(page).getByRole('button', { name: name === 'Job' || name === 'Work/School' ? /^(Job|School|Career)$/ : name === 'Money' ? 'Assets' : name, exact: name !== 'Job' && name !== 'Work/School' });

/** The life log shows this age as a heading (Home). Age 0 is "Birth". */
export async function expectAge(page: Page, age: number): Promise<void> {
  await expect(page.getByTestId('life-log').getByRole('heading', { name: age === 0 ? /^Birth/ : new RegExp(`^Age ${age}\\b`) })).toBeVisible();
}

/** Every list of family on the People tab (parents, siblings, other family, children, grandchildren). */
export const familyLists = (page: Page) =>
  page.locator('ul[aria-label="Parents"], ul[aria-label="Siblings"], ul[aria-label="Other family"], ul[aria-label="Children"], ul[aria-label="Grandchildren"]');

/** Opens the profile sheet from the Home header. */
export async function openProfile(page: Page): Promise<void> {
  await goHome(page);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Profile' })).toBeVisible();
}

/** Back to Home from wherever you are (a page over a tab, a person, a tab). */
export async function goHome(page: Page): Promise<void> {
  await closeSheets(page);
  for (let i = 0; i < 4; i++) {
    if (await page.getByRole('button', { name: 'Menu', exact: true }).isVisible()) return;
    const back = page.getByRole('button', { name: /^Back to /, exact: false }).first();
    if (!(await back.isVisible())) return;
    await back.click();
  }
}

/** Where a page lives in the new layout (the move table in docs/portraits-and-ui.md). */
export type PageKey =
  | 'settings'
  | 'lifeHistory'
  | 'archive'
  | 'title'
  | 'newLife'
  | 'health'
  | 'later'
  | 'properties'
  | 'possessions'
  | 'will'
  | 'family'
  | 'groups'
  | 'social'
  | 'trip'
  | 'migration'
  | 'teen';

const MENU_ITEMS: Partial<Record<PageKey, string>> = { settings: 'menu-settings', lifeHistory: 'menu-life-history', archive: 'menu-archive', title: 'menu-title', newLife: 'menu-new-life' };
/** Which category of the Activities hub (U2) holds each activity, read from the registry itself, so the tests follow the content. */
const HUB_CATEGORY: Record<string, string> = Object.fromEntries(
  (parse(readFileSync(new URL('../../src/content/registries/activities.yaml', import.meta.url), 'utf8')) as { activities: { id: string; category: string }[] }).activities.map((a) => [a.id, a.category]),
);

/** Opens an activity of the Activities hub: the tab, its category, then the activity (a sheet of options, or the page it links to). */
export async function openHubActivity(page: Page, hubId: string): Promise<void> {
  const category = HUB_CATEGORY[hubId];
  if (!category) throw new Error(`no category for activity ${hubId}`);
  await goHome(page);
  await tab(page, 'Activities').click();
  await page.getByTestId(`activities-category-${category}`).click();
  await page.getByTestId(`activity-hub-${hubId}`).click();
}

/** Where a page lives: the tab, what to tap there, and (Assets) the in-screen tab that holds it. */
const TAB_PAGES: Partial<Record<PageKey, [Parameters<typeof tab>[1], string, string?]>> = {
  properties: ['Assets', 'assets-properties', 'assets-tab-home'],
  possessions: ['Assets', 'assets-possessions', 'assets-tab-things'],
  will: ['Assets', 'assets-will', 'assets-tab-things'],
  family: ['People', 'people-family-planning'],
};
/** Pages reached through an activity of the hub. */
const HUB_PAGES: Partial<Record<PageKey, string>> = { groups: 'clubs', social: 'social_media', migration: 'migration', teen: 'teen_years' };

/** Opens a page from Home: the menu for Settings and Life history, the profile for Health, the tab it lives under for the rest. */
export async function openPage(page: Page, key: PageKey): Promise<void> {
  await goHome(page);
  const menuItem = MENU_ITEMS[key];
  if (menuItem) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByTestId(menuItem).click();
    return;
  }
  if (key === 'health' || key === 'later') {
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    if (key === 'health') await page.getByRole('dialog', { name: 'Profile' }).getByRole('button', { name: 'Health', exact: true }).click();
    else await page.getByTestId('profile-later').click();
    return;
  }
  const hub = HUB_PAGES[key];
  if (hub) return openHubActivity(page, hub);
  if (key === 'trip') {
    await openHubActivity(page, 'vacation');
    await page.getByTestId('activity-plan-trip').click();
    return;
  }
  const [tabName, testId, inner] = TAB_PAGES[key]!;
  await tab(page, tabName).click();
  if (inner) await page.getByTestId(inner).click();
  await page.getByTestId(testId).click();
}
export const eventSheet = (page: Page) => page.getByRole('dialog').filter({ has: page.getByTestId('event-card') });

/** Waits until the screen is ready for the next tap: Age Up, an event card, or the funeral that follows a death. */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (document.body.textContent?.includes('The funeral') || document.body.textContent?.includes('In memoriam')) return true;
    const sheet = document.querySelector('[aria-labelledby="event-title"]');
    if (sheet) return [...sheet.querySelectorAll('button')].every((b) => !b.disabled);
    const button = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Age up');
    return button !== undefined && !button.disabled;
  });
}

/** Answers every event card with its first choice, through to the end of the recap. */
export async function playThroughEvents(page: Page): Promise<void> {
  for (;;) {
    while (await eventSheet(page).isVisible()) {
      const sheet = eventSheet(page);
      const next = sheet.getByRole('button', { name: 'Continue' });
      if (await next.isVisible()) await next.click();
      else await sheet.getByRole('button').first().click();
      await settle(page);
    }
    // On a slow machine the next card can open a moment after the last closes: look once more before stopping.
    await page.waitForTimeout(400);
    if (!(await eventSheet(page).isVisible())) return;
  }
}

/** Taps Age Up and plays the year out (events answered with their first choice). */
export async function ageUp(page: Page): Promise<void> {
  await closeSheets(page);
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
  /** The country's name; the United States when left out. */
  country?: string;
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

  await expect(page.getByText('Step 1 of 7')).toBeVisible();
  await page.getByLabel('First name').fill(data.first);
  await page.getByLabel('Last name').fill(data.last);
  await next();

  // P1: the Look step: a live portrait to leave as it is.
  await expect(page.getByText('Step 2 of 7')).toBeVisible();
  await expect(page.getByTestId('look-step')).toBeVisible();
  await next();

  await expect(page.getByText('Step 3 of 7')).toBeVisible();
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

  await expect(page.getByText('Step 4 of 7')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Parents' }).getByRole('radio', { name: data.parents }).click();
  await page.getByRole('radiogroup', { name: 'Older siblings' }).getByRole('radio', { name: data.siblings, exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Family wealth' }).getByRole('radio', { name: data.wealth }).click();
  await next();

  await expect(page.getByText('Step 5 of 7')).toBeVisible();
  await page.getByRole('radio', { name: data.country ?? 'United States' }).click();
  await page.getByRole('radio', { name: data.city }).click();
  await next();

  await expect(page.getByText('Step 6 of 7')).toBeVisible();
  await next();

  await expect(page.getByText('Step 7 of 7')).toBeVisible();
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

/** After a death: the funeral comes first (W1). Continues from it to the Death screen (the obituary, the estate and who carries on). */
export async function passFuneral(page: Page): Promise<void> {
  await expect(page.getByText('The funeral', { exact: true })).toBeVisible();
  await page.getByTestId('funeral-continue').click();
  await expect(page.getByText('In memoriam')).toBeVisible();
}

/** C2: opens one of the Career tab's rows (its screen opens over the tab): `role-school`, `find-jobs`, `find-gigs`, `find-education`, `find-abroad`, `special-business`, `special-crime`, `special-social`, `sports-open`, `fame-open`. */
export async function openRow(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).click();
}

/** C2: opens every collapsed group of the open screen (the Sports screen's Overview keeps its details in groups). */
export async function expandGroups(page: Page): Promise<void> {
  for (;;) {
    const closed = page.locator('[data-testid^="grp-"] > button[aria-expanded="false"]').first();
    if ((await closed.count()) === 0) return;
    await closed.click();
  }
}

/** C2: closes screens opened over a tab from the Career tab (sheets that are not an event). */
export async function closeSheets(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const sheet = page.locator('[role="dialog"]').filter({ hasNot: page.getByTestId('event-card') }).last();
    if (!(await sheet.isVisible())) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

/** Goes to a main tab, closing a screen left open over the one before. */
export async function goTab(page: Page, name: Parameters<typeof tab>[1]): Promise<void> {
  await closeSheets(page);
  await tab(page, name).click();
}
