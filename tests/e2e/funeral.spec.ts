/**
 * The funeral (W1), at phone size on the test content pack: after a death the
 * eulogy and who didn't come, before the obituary and the estate (and so
 * before an heir's "Previously" card); a life with no one close has no
 * eulogy and says so; the eulogy is kept in the archive; and an archived life
 * from before eulogies says none was recorded. Lives are built with the engine
 * and put in the app's database (see heirFixtures); the funeral shown is checked
 * against the engine's own, so a change to the text never breaks these.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { writeFuneral } from '../../src/engine/eulogy';
import { archiveEntry } from '../../src/engine/archive';
import type { LifeState } from '../../src/engine/types';
import { makeArchiveEnvelope } from '../../src/persistence/archive';
import { deadLife, familyLife, loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, passFuneral } from './helpers';

const OPEN = { testPack: true };
const pack = () => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

/** A family life in which a sibling you cut off stays away (the first seed where that is how it turns out). */
function lifeWithAbsence(): { life: LifeState; seed: string } {
  const content = pack();
  for (let i = 0; i < 40; i++) {
    const seed = `e2e-funeral-${i}`;
    const base = familyLife({ seed, kids: [9, 30], spouse: true });
    const sibling = Object.values(base.relationships).find((r) => r.kind === 'sibling' && base.people[r.personId]?.alive);
    if (!sibling) continue;
    const life = deadLife(
      produce(base, (d) => {
        const rel = d.relationships[sibling.personId]!;
        rel.status = 'estranged';
        rel.affection = 20;
        rel.trust = 20;
        rel.memories.push({ tag: 'you_cut_them_off', year: d.currentYear - 5 });
      }),
    );
    const funeral = writeFuneral(life, content);
    if (funeral?.eulogy && funeral.notAttending.length > 0) return { life, seed };
  }
  throw new Error('no seed with someone staying away');
}

test('the funeral comes first: the eulogy, who stayed away and why, then the obituary and who carries on', async ({ page }) => {
  test.setTimeout(120_000);
  const { life } = lifeWithAbsence();
  const funeral = writeFuneral(life, pack())!;
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, life);

  await expect(page.getByText('The funeral', { exact: true })).toBeVisible();
  // Before the obituary, the estate and the heirs.
  await expect(page.getByText('In memoriam')).toHaveCount(0);
  await expect(page.getByTestId('previously-card')).toHaveCount(0);
  await expect(page.getByTestId('eulogy-speaker')).toContainText(`Spoken by ${funeral.eulogy!.speakerName}, your ${funeral.eulogy!.relation}`);
  await expect(page.getByTestId('eulogy-text')).toContainText(funeral.eulogy!.paragraphs[0]!);
  await expect(page.getByTestId('eulogy-text').locator('p')).toHaveCount(funeral.eulogy!.paragraphs.length);

  const absent = page.getByTestId('funeral-absent-list').getByRole('listitem');
  await expect(absent).toHaveCount(funeral.notAttending.length);
  for (const [i, guest] of funeral.notAttending.entries()) {
    await expect(absent.nth(i)).toContainText(guest.name);
    await expect(absent.nth(i)).toContainText(guest.relation);
    await expect(absent.nth(i)).toContainText(guest.reason);
  }
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // On to the obituary, the estate and the choice of heir.
  await page.getByTestId('funeral-continue').click();
  await expect(page.getByText('In memoriam')).toBeVisible();
  await expect(page.getByTestId('death-heirs')).toBeVisible();

  // The eulogy goes into the archive when the life is left.
  await page.getByRole('button', { name: 'Open the archive' }).click();
  const lives = page.getByRole('list', { name: /^Generations of the/ }).getByRole('listitem');
  await lives.first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Past life' })).toBeVisible();
  await expect(page.getByTestId('eulogy-speaker')).toContainText(funeral.eulogy!.speakerName);
  await expect(page.getByTestId('funeral-absent-list').getByRole('listitem')).toHaveCount(funeral.notAttending.length);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('for an heir, the funeral comes before the "Previously" card', async ({ page }) => {
  test.setTimeout(120_000);
  const { life } = lifeWithAbsence();
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, life);
  await expect(page.getByTestId('eulogy')).toBeVisible();
  await expect(page.getByTestId('previously-card')).toHaveCount(0);
  await passFuneral(page);
  await page.getByTestId('death-heirs').getByRole('button').filter({ hasText: '9 years old' }).click();
  await expect(page.getByTestId('previously-card')).toBeVisible();
});

test('a life with no one close enough has no eulogy, and the screen says so', async ({ page }) => {
  const lonely = deadLife(
    produce(familyLife({ seed: 'e2e-funeral-none', kids: [], spouse: true }), (d) => {
      for (const rel of Object.values(d.relationships)) {
        rel.affection = 10;
        rel.trust = 10;
      }
    }),
  );
  expect(writeFuneral(lonely, pack())!.eulogy).toBeNull();
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, lonely);
  await expect(page.getByText('The funeral', { exact: true })).toBeVisible();
  await expect(page.getByTestId('eulogy-none')).toHaveText('No one was close enough to speak for you.');
  await expect(page.getByTestId('eulogy-text')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByTestId('funeral-continue').click();
  await expect(page.getByText('In memoriam')).toBeVisible();
  await expect(page.getByText('This life has been saved to your archive.')).toBeVisible();
});

test('a life archived before eulogies says no funeral was recorded', async ({ page }) => {
  const content = pack();
  const entry = { ...archiveEntry(deadLife(familyLife({ seed: 'e2e-funeral-old', kids: [], spouse: true })), content), funeral: null };
  await passAgeGate(page, OPEN);
  // An archive entry as version 3 stored it (no funeral at all): it is upgraded when it is read.
  const { funeral: _funeral, review: _review, ...v3 } = entry;
  const envelope = { ...makeArchiveEnvelope(entry, content.contentVersion), schemaVersion: 3, data: v3 };
  await page.evaluate(
    (row) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wiplife');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('archive', 'readwrite');
          tx.objectStore('archive').put(row);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id: entry.id, envelope: JSON.parse(JSON.stringify(envelope)) as unknown },
  );
  await page.reload();
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('list', { name: /^Generations of the/ }).getByRole('listitem').first().getByRole('button').click();
  await expect(page.getByTestId('funeral-none')).toContainText('No funeral was recorded for this life');
  await expect(page.getByTestId('obituary')).toBeVisible();
});
