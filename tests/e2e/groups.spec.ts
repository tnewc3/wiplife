/**
 * Belonging (W2), at phone size on the test content pack: More → Groups lists
 * the groups of your city, lets you join one (casual or committed), shows your
 * role and standing, lets you change how committed you are and leave; and the
 * Profile sheet shows your faith, your groups and what you value. Custom
 * creation offers a faith. Lives are built with the engine (tests/e2e/groupsFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, openHubActivity, openPage, passAgeGate, settle } from './helpers';
import { aClubOf, groupsLife, type GroupsLife } from './groupsFixtures';


async function open(page: Page, options: GroupsLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, groupsLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await openPage(page, 'groups');
}

test('Faith shows your faith and Groups lists the clubs of your city, and both fit a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-groups-1' });
  // Clubs: nothing joined yet, so it opens on what you can join.
  await expect(page.getByTestId('groups-club')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clubs and hobby groups', level: 1 })).toBeVisible();
  await page.getByTestId('groups-tab-yours').click();
  await expect(page.getByTestId('groups-screen')).toContainText('You don’t belong to any group yet.');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // Faith is its own section of Activities, not part of People.
  await openHubActivity(page, 'faith_yours');
  await expect(page.getByTestId('groups-your-faith')).toContainText('Buddhism');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('groups-tab-join').click();
  await expect(page.getByTestId('groups-faith')).toBeVisible();
});

test('you can join a club, see your role, change how committed you are, and leave', async ({ page }) => {
  const life = groupsLife({ seed: 'e2e-groups-2' });
  const club = aClubOf(life);
  await open(page, { seed: 'e2e-groups-2' });
  await page.getByTestId(`group-${club.id}`).click();
  await expect(page.getByRole('dialog')).toContainText(club.name);
  await expectTouchTargets(page);
  await page.getByTestId('join-casual').click();
  const card = page.getByTestId(`membership-${club.id}`);
  await expect(card).toContainText(club.name);
  await expect(card.getByTestId('membership-role')).toContainText('Member');
  await expect(card).toContainText('Casual');
  await page.getByTestId(`commit-${club.id}`).click();
  await expect(card).toContainText('Committed');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId(`leave-${club.id}`).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).last().click();
  await expect(page.getByTestId(`membership-${club.id}`)).toHaveCount(0);
});

test('the Profile sheet shows your faith, your groups and your values', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, groupsLife({ seed: 'e2e-groups-3', member: true }));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByTestId('profile-faith')).toContainText('Buddhism');
  await expect(page.getByTestId('profile-membership').first()).toContainText('Member');
  await expect(page.getByTestId('profile-belonging').getByRole('group', { name: 'Values' })).toBeVisible();
  await expectTouchTargets(page);
});
