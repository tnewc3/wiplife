/**
 * Mini-games (G1), at phone size: each of the seven opens from the place it belongs (a sports big moment, a heist, a run,
 * the casino), shows its game and an Auto button, takes a played result or Auto, and hands the result back to the event
 * or activity. Reduced motion offers Auto first. Lives are built with the engine on the test content pack
 * (tests/e2e/g1Fixtures.ts). `SCREENSHOTS=1 npx playwright test g1` also writes the 390×844 screenshots to docs/screenshots/g1.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { caughtLife, casinoLife, momentLife } from './g1Fixtures';
import { expectNoHorizontalScroll, expectTouchTargets, openHubActivity, passAgeGate, settle } from './helpers';
import type { LifeState } from '../../src/engine/types';

const SHOTS = process.env.SCREENSHOTS === '1';

async function open(page: Page, life: LifeState): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync('docs/screenshots/g1', { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `docs/screenshots/g1/${name}.png` });
}

const game = (page: Page) => page.getByTestId('minigame');

/** Waits until the timing marker is inside the zone, then taps Stop. */
async function stopInZone(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const marker = document.querySelector('[data-testid="timing-marker"]');
    const zone = document.querySelector('[data-testid="timing-zone"]');
    if (!marker || !zone) return false;
    const p = Number(marker.getAttribute('data-position'));
    const from = Number(zone.getAttribute('data-from'));
    const to = Number(zone.getAttribute('data-to'));
    const mid = (from + to) / 2;
    return Math.abs(p - mid) < (to - from) * 0.25;
  }, undefined, { timeout: 15_000, polling: 'raf' });
  await page.getByTestId('timing-stop').click();
}

async function expectGameFits(page: Page): Promise<void> {
  await expect(game(page)).toBeVisible();
  await expect(game(page).getByTestId('minigame-auto')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
}

test.describe('sports big moments', () => {
  test('the last shot: a timing bar, played, then the event answers', async ({ page }) => {
    await open(page, momentLife({ seed: 'e2e-g1-shot', sport: 'basketball', eventId: 'big_game_basketball' }));
    await expect(page.getByTestId('choice-minigame').first()).toBeVisible();
    await page.getByRole('button', { name: /Take the shot yourself/ }).click();
    await expectGameFits(page);
    await expect(game(page)).toContainText('The last shot');
    await shot(page, 'last-shot');
    await stopInZone(page);
    await expect(page.getByTestId('minigame-result')).toBeVisible();
    await shot(page, 'last-shot-result');
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('event-outcome')).toBeVisible();
    await expect(game(page)).toHaveCount(0);
  });

  test('the penalty kick: pick a corner, then the power', async ({ page }) => {
    await open(page, momentLife({ seed: 'e2e-g1-pen', sport: 'soccer', eventId: 'big_game_soccer' }));
    await page.getByRole('button', { name: /Take it yourself/ }).click();
    await expectGameFits(page);
    await shot(page, 'penalty-kick');
    await page.getByTestId('penalty-spot-left').click();
    await expect(page.getByTestId('timing-bar')).toBeVisible();
    await shot(page, 'penalty-kick-power');
    await stopInZone(page);
    await expect(page.getByTestId('penalty-keeper')).toBeVisible();
    await expect(page.getByTestId('minigame-result')).toBeVisible();
    await shot(page, 'penalty-kick-result');
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('event-outcome')).toBeVisible();
  });

  test('the swing: power, then contact', async ({ page }) => {
    await open(page, momentLife({ seed: 'e2e-g1-swing', sport: 'baseball', eventId: 'big_game_baseball' }));
    await page.getByRole('button', { name: /Swing at the first good pitch/ }).click();
    await expectGameFits(page);
    await shot(page, 'swing');
    await stopInZone(page);
    await expect(game(page).getByTestId('timing-bar')).toContainText('Contact');
    await stopInZone(page);
    await expect(page.getByTestId('minigame-result')).toBeVisible();
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('event-outcome')).toBeVisible();
  });

  test('a playoff series offers the game of the sport, and Auto plays it without a tap', async ({ page }) => {
    await open(page, momentLife({ seed: 'e2e-g1-playoff', sport: 'soccer', eventId: 'playoffs_opening_series' }));
    await page.getByRole('button', { name: /Take the game on yourself/ }).click();
    await expect(game(page)).toContainText('Penalty kick');
    await page.getByTestId('minigame-auto').click();
    await expect(game(page)).toHaveCount(0);
    await expect(page.getByTestId('event-card')).toContainText('first round');
  });

  test('a sport with no game for it plays the choice as before', async ({ page }) => {
    await open(page, momentLife({ seed: 'e2e-g1-hockey', sport: 'hockey', eventId: 'playoffs_opening_series' }));
    await expect(page.getByTestId('choice-minigame')).toHaveCount(0);
    await page.getByRole('button', { name: /Take the game on yourself/ }).click();
    await expect(game(page)).toHaveCount(0);
  });
});

test.describe('heists, runs and escapes', () => {
  test('lockpick: set pins when the needle is in the arc (a burglary)', async ({ page }) => {
    await open(page, casinoLife('e2e-g1-lock'));
    await openHubActivity(page, 'crime');
    await expect(page.getByTestId('entry-minigame').first()).toBeVisible();
    await page.getByTestId('do-burglary').click();
    await expectGameFits(page);
    await expect(game(page)).toContainText('Lockpick');
    await shot(page, 'lockpick');
    // Tap Set pin when the needle is inside the arc, until the pins are set or the time is out.
    for (let i = 0; i < 40 && !(await page.getByTestId('minigame-result').isVisible()); i++) {
      try {
        await page.waitForFunction(() => {
          const arc = document.querySelector('[data-testid="lockpick-arc"]');
          const needle = document.querySelector('[data-testid="lockpick-needle"]');
          if (!arc || !needle) return true;
          const gap = Math.abs(((Number(needle.getAttribute('data-angle')) - Number(arc.getAttribute('data-sweet')) + 540) % 360) - 180);
          return gap < Number(arc.getAttribute('data-half')) * 0.5;
        }, undefined, { timeout: 4_000, polling: 'raf' });
        if (await page.getByTestId('lockpick-set').isVisible()) await page.getByTestId('lockpick-set').click();
      } catch {
        break;
      }
    }
    await expect(page.getByTestId('minigame-result')).toBeVisible({ timeout: 20_000 });
    await shot(page, 'lockpick-result');
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('activity-receipt')).toBeVisible();
  });

  test('the getaway: dodge barriers by changing lane', async ({ page }) => {
    await open(page, caughtLife('e2e-g1-run'));
    await page.getByRole('button', { name: /Run for it/ }).click();
    await expectGameFits(page);
    await expect(game(page)).toContainText('The getaway');
    await shot(page, 'getaway');
    await page.getByTestId('getaway-left').click();
    await expect(page.getByTestId('getaway-runner')).toHaveAttribute('data-lane', '0');
    await page.getByTestId('getaway-right').click();
    await page.getByTestId('getaway-right').click();
    await expect(page.getByTestId('getaway-runner')).toHaveAttribute('data-lane', '2');
    await expect(page.getByTestId('minigame-result')).toBeVisible({ timeout: 20_000 });
    await shot(page, 'getaway-result');
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('event-outcome')).toBeVisible();
  });
});

test.describe('the casino', () => {
  test('blackjack: hit or stand for three hands, then the stake moves through the ledger', async ({ page }) => {
    await open(page, casinoLife('e2e-g1-bj'));
    await openHubActivity(page, 'casino');
    await page.getByTestId('do-play_blackjack-medium').click();
    await expectGameFits(page);
    await expect(game(page)).toContainText('Hand 1 of 3');
    await shot(page, 'blackjack');
    // Stand on everything; the hands run out in three taps at the most (a natural ends a hand without a tap).
    for (let i = 0; i < 3 && !(await page.getByTestId('bj-collect').isVisible()); i++) {
      if (await page.getByTestId('bj-stand').isVisible()) await page.getByTestId('bj-stand').click();
    }
    await expect(page.getByTestId('bj-collect')).toBeVisible();
    await expect(page.getByTestId('bj-hand')).toHaveCount(3);
    await shot(page, 'blackjack-result');
    await page.getByTestId('bj-collect').click();
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('activity-receipt')).toBeVisible();
    await expect(page.getByTestId('receipt-money')).toContainText('$');
  });

  test('slots: stop three reels, then the receipt shows the money and the new balance', async ({ page }) => {
    await open(page, casinoLife('e2e-g1-slots'));
    await openHubActivity(page, 'casino');
    await page.getByTestId('do-play_the_slots-medium').click();
    await expectGameFits(page);
    await shot(page, 'slots');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('slots-stop').click();
      await page.waitForTimeout(120);
    }
    await expect(page.getByTestId('minigame-result')).toBeVisible();
    await shot(page, 'slots-result');
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('activity-receipt')).toBeVisible();
    await expect(page.getByTestId('receipt-money')).toContainText('$');
  });

  test('Auto plays a casino game from your stats, and the receipt still shows the money', async ({ page }) => {
    await open(page, casinoLife('e2e-g1-auto'));
    await openHubActivity(page, 'casino');
    await page.getByTestId('do-play_blackjack-low').click();
    await page.getByTestId('minigame-auto').click();
    await expect(game(page)).toHaveCount(0);
    await expect(page.getByTestId('activity-receipt')).toBeVisible();
    await expect(page.getByTestId('receipt-money')).toContainText('$');
  });

  test('not now closes the game and nothing is spent', async ({ page }) => {
    await open(page, casinoLife('e2e-g1-cancel'));
    await openHubActivity(page, 'casino');
    await page.getByTestId('do-play_the_slots-low').click();
    await page.getByTestId('minigame-cancel').click();
    await expect(game(page)).toHaveCount(0);
    await expect(page.getByTestId('activity-receipt')).toHaveCount(0);
  });
});

test.describe('accessibility', () => {
  test('reduced motion offers Auto first and slows the game', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, momentLife({ seed: 'e2e-g1-rm', sport: 'basketball', eventId: 'big_game_basketball' }));
    await page.getByRole('button', { name: /Take the shot yourself/ }).click();
    await expect(game(page)).toContainText('Reduced motion is on');
    await shot(page, 'reduced-motion');
    await page.getByTestId('minigame-auto').click();
    await expect(page.getByTestId('event-outcome')).toBeVisible();
  });

  test('at desktop size the games fit and play', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, momentLife({ seed: 'e2e-g1-desk', sport: 'basketball', eventId: 'big_game_basketball' }));
    await page.getByRole('button', { name: /Take the shot yourself/ }).click();
    await expect(game(page)).toBeVisible();
    await stopInZone(page);
    await page.getByTestId('minigame-continue').click();
    await expect(page.getByTestId('event-outcome')).toBeVisible();
  });
});
