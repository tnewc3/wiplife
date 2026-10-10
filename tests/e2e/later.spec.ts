/**
 * Later life (L1), at phone size on the test content pack: More → Later life
 * shows your grandchildren, lets you arrange care when you need it, and, once
 * a death is foreseen, set your final wishes; the funeral then tells the last
 * days. Lives are built with the engine (tests/e2e/laterFixtures.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { ContentBundle } from '../../src/content/schemas';
import { writeFuneral } from '../../src/engine/eulogy';
import { deadLife, loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';
import { laterLife, type LaterLife } from './laterFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: LaterLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, laterLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'More').click();
  await page.getByTestId('more-later').click();
}

test('Later life lists your grandchildren and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-later-1' });
  await expect(page.getByTestId('later-grandchildren')).toContainText('Nova');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('when you need looking after you can arrange paid care', async ({ page }) => {
  await open(page, { seed: 'e2e-later-2', needsCare: true });
  await expect(page.getByTestId('later-care-status')).toContainText('nothing is arranged');
  await expectTouchTargets(page);
  await page.getByTestId('care-paid').click();
  await expect(page.getByTestId('later-care-status')).toContainText('Arranged');
  await expect(page.getByTestId('care-paid')).toBeDisabled();
});

test('with a death foreseen you can set your final wishes', async ({ page }) => {
  await open(page, { seed: 'e2e-later-3', terminal: true });
  await expect(page.getByTestId('later-wishes')).toBeVisible();
  await page.getByTestId('wish-hospice-home').click();
  await page.getByTestId('wish-service-simple').click();
  await expect(page.getByTestId('wish-hospice-home')).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('wishes-save').click();
  await expect(page.getByTestId('later-message')).toContainText('Your wishes are set');
});

test('the funeral tells the last days and the review looks back', async ({ page }) => {
  test.setTimeout(120_000);
  const life = deadLife(laterLife({ seed: 'e2e-later-4', terminal: true, wishes: true }));
  const pack = JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
  const funeral = writeFuneral(life, pack)!;
  expect(funeral.lastDays?.foreseen).toBe(true);
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await expect(page.getByTestId('funeral-last-days')).toContainText(funeral.lastDays!.lines[0]!);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
