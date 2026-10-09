/**
 * Smoke test on the real content: plays years of a random life, answering
 * every event with its first choice, and only checks that nothing breaks.
 * Flow tests use the test content pack instead, so new events can't break them.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, eventSheet, settle, startRandomLife } from './helpers';

const ended = (page: Page) => page.getByTestId('funeral-continue').or(page.getByText('In memoriam')).first().isVisible();

test('thirty years of a real life play without errors', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await startRandomLife(page, { seed: 'smoke' });
  for (let year = 0; year < 30; year++) {
    if (await ended(page)) break;
    await ageUp(page);
    await settle(page);
    await expect(eventSheet(page)).toHaveCount(0);
  }
  const dead = await ended(page);
  if (!dead) await expect(page.getByTestId('character-name')).toBeVisible();
  expect(errors).toEqual([]);
});
