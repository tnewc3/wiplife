/**
 * Social media (Batch 8), at phone size: More → Social media lists the platforms and opens an account with a typed,
 * validated handle; posts on two platforms inside the yearly budget; an account passes its platform's threshold and
 * starts to pay (shown on the Money tab); a post a person did not mean for their boss reaches it and the event
 * shows; a teen's account needs a parent and starts private. Lives are built with the engine on the test content pack
 * (tests/e2e/socialFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { ageUp, expectNoHorizontalScroll, expectTouchTargets, goHome, openPage, passAgeGate, settle, openRow, goTab } from './helpers';
import { socialLife, type SocialLife } from './socialFixtures';


async function open(page: Page, options: SocialLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, socialLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function openSocial(page: Page): Promise<void> {
  await openPage(page, 'social');
  await expect(page.getByTestId('social-summary')).toBeVisible();
}

test('creates an account with a typed handle: the handle is checked as you type, and the account shows its followers in words and numbers', async ({ page }) => {
  await open(page, { seed: 'e2e-social-1' });
  await openSocial(page);
  await expect(page.getByTestId('social-open')).toBeVisible();
  await page.getByTestId('platform-tiktok').click();
  await page.getByTestId('niche-gaming').click();
  const input = page.getByTestId('handle-input');
  await input.fill('no good!');
  await expect(page.getByText('Use only letters, numbers, dots and underscores.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('open-account')).toBeDisabled();
  await input.fill('admin');
  await expect(page.getByText('That handle is kept for the platform.')).toBeVisible();
  await input.fill('@Quiet_Fox');
  await expect(page.getByTestId('open-account')).toBeEnabled();
  await page.getByTestId('open-account').click();
  const account = page.getByTestId('account-tiktok');
  await expect(account).toContainText('TikTok · @quiet_fox');
  await expect(page.getByTestId('followers-tiktok')).toHaveText(/\(\d[\d,]*\)/);
  await expect(page.getByTestId('budget-tiktok')).toContainText('left this year');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('posts on two platforms inside the yearly budget, and runs out of posts', async ({ page }) => {
  await open(page, {
    seed: 'e2e-social-2',
    accounts: [
      { platform: 'instagram', handle: 'photo_fox', followers: 200 },
      { platform: 'youtube', handle: 'video_fox', followers: 200 },
    ],
  });
  await openSocial(page);
  const insta = page.getByTestId('budget-instagram');
  const yt = page.getByTestId('budget-youtube');
  await expect(insta).toContainText('6 photos left this year');
  await expect(yt).toContainText('4 videos left this year');
  await page.getByTestId('post-instagram').click();
  await expect(page.getByTestId('social-last')).toBeVisible();
  await expect(insta).toContainText('5 photos left this year');
  await page.getByTestId('post-youtube').click();
  await expect(yt).toContainText('3 videos left this year');
  for (let i = 0; i < 3; i++) await page.getByTestId('post-youtube').click();
  await expect(yt).toContainText('No videos left this year');
  await expect(page.getByTestId('post-youtube')).toBeDisabled();
  await expectTouchTargets(page);
});

test('an account passes its threshold, the platform starts to pay, and the Money tab shows the income by platform', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, { seed: 'e2e-social-3', accounts: [{ platform: 'youtube', handle: 'paid_fox', followers: 4_000 }] });
  await openSocial(page);
  await expect(page.getByTestId('account-youtube')).toContainText('Shares its ad money with you once you pass 1,000 followers.');
  for (let i = 0; i < 4; i++) await page.getByTestId('post-youtube').click();
  await goHome(page);
  await ageUp(page);
  await openSocial(page);
  await expect(page.getByTestId('account-youtube')).toContainText('The platform pays you for this account (Ad share).');
  await goTab(page, 'Assets');
  const card = page.getByTestId('social-money');
  await expect(card).toBeVisible();
  await expect(card).toContainText('YouTube');
  await expect(card).toContainText('Ad share');
  await expect(card).toContainText('$');
});

test('a post meant for friends reaches the boss, and the event is about it', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, { seed: 'e2e-social-4', job: true, accounts: [{ platform: 'tiktok', handle: 'friends_only', followers: 300 }] });
  await openSocial(page);
  await page.getByTestId('tone-bold').click();
  await page.getByTestId('post-tiktok').click();
  await goHome(page);
  await page.getByRole('button', { name: 'Age up' }).click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByTestId('event-card') });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('printed screenshot of a post you put on TikTok');
  await expect(sheet).toContainText('@friends_only');
  await sheet.getByRole('button', { name: /Own it/ }).click();
});

test('under 18 an account starts private and a parent is in it', async ({ page }) => {
  await open(page, { seed: 'e2e-social-5', age: 14 });
  await openSocial(page);
  await page.getByTestId('platform-instagram').click();
  await page.getByTestId('niche-music').click();
  await page.getByTestId('handle-input').fill('teen_fox');
  await page.getByTestId('open-account').click();
  await expect(page.getByTestId('account-instagram')).toContainText('Private.');
  await expect(page.getByTestId('social-summary')).toContainText('A parent keeps an eye on your accounts');
  await expectNoHorizontalScroll(page);
});

test('creators reach the Social screen from the Work tab and come back to it', async ({ page }) => {
  await open(page, { seed: 'e2e-social-6', creator: true });
  await goTab(page, 'Job');
  await openRow(page, 'special-social');
  await expect(page.getByTestId('work-social')).toBeVisible();
  await page.getByTestId('work-open-social').click();
  await expect(page.getByTestId('social-summary')).toBeVisible();
  await expect(page.getByTestId('account-tiktok')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Back to Career' }).click();
  await openRow(page, 'special-social');
  await expect(page.getByTestId('work-social')).toBeVisible();
});
