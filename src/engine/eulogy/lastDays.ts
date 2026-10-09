/**
 * The last days (L1): when a death was foreseen, the funeral also tells how
 * it went: how long you knew, where you spent the time, who you asked to be
 * with you and who came, the letters you wrote, who you asked to speak, and
 * what the service you asked for cost. Pure and deterministic, from a
 * generator of its own. A life that gave no warning has no account.
 */
import type { ContentBundle } from '../../content/schemas';
import { funeralCost } from '../estate/settle';
import { relationWord } from '../lives/model';
import { pick, type RngState } from '../rng';
import { renderText, type TextRole } from '../text';
import { lifeTextRole } from '../lives/model';
import type { FuneralGuest, Id, LastDays, LifeState } from '../types';

const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;

function roleOf(life: LifeState, id: Id, content: ContentBundle): TextRole {
  const person = life.people[id]!;
  return lifeTextRole(life, id, content) ?? { name: person.name, pronouns: person.identity.pronouns };
}

/** "Ana, Ben and Cal". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The people who came to your bedside, as guests. */
function bedsideGuests(life: LifeState, content: ContentBundle, rng: RngState): FuneralGuest[] {
  const t = life.later.terminal;
  if (t === null) return [];
  const reasons = content.text.later.lastDays.bedsideReason;
  return t.visits
    .filter((v) => v.came && life.people[v.id] && life.relationships[v.id])
    .map((v) => {
      const person = life.people[v.id]!;
      return {
        name: `${person.name.first} ${person.name.last}`,
        relation: relationWord(person, life.relationships[v.id]!, content),
        reason: renderText(pick(rng, reasons), { roles: { self: { name: life.character.name, pronouns: life.character.identity.pronouns }, npc: roleOf(life, v.id, content) } }),
      };
    });
}

/** The account of the last days, or null when the death was not foreseen. `speakerId` is who actually spoke. */
export function writeLastDays(life: LifeState, content: ContentBundle, speakerId: Id | undefined, rng: RngState): LastDays | null {
  const t = life.later.terminal;
  if (life.phase !== 'dead' || t === null) return null;
  const text = content.text.later.lastDays;
  const self: TextRole = { name: life.character.name, pronouns: life.character.identity.pronouns };
  const years = Math.max(0, life.currentYear - t.since);
  const say = (templates: readonly string[], values: Record<string, string | number> = {}, roles: Record<string, TextRole> = {}) =>
    renderText(pick(rng, templates), { roles: { self, ...roles }, values });
  const lines: string[] = [];
  lines.push(say(years <= 1 ? text.foreseen.short : text.foreseen.long, { years: years <= 1 ? 'a year' : `${years} years` }));
  if (t.hospice !== null) lines.push(say(text.hospice[t.hospice]));
  const bedside = bedsideGuests(life, content, rng);
  const invited = t.visits.length;
  if (bedside.length > 0) lines.push(say(text.bedside.some, { names: joinNames(bedside.map((g) => g.name.split(' ')[0]!)) }));
  else if (invited > 0) lines.push(say(text.bedside.none));
  const letters = t.letters.filter((id) => life.people[id]).map((id) => life.people[id]!.name.first);
  if (letters.length > 0) lines.push(say(text.letters, { names: joinNames(letters) }));
  if (t.speakerId !== undefined && life.people[t.speakerId]) {
    const asked = roleOf(life, t.speakerId, content);
    lines.push(say(speakerId === t.speakerId ? text.speaker.spoke : text.speaker.absent, {}, { npc: asked }));
  }
  if (t.service !== null) lines.push(say(text.service[t.service]), say(text.paid, { cost: dollars(funeralCost(life, content)) }));
  return { foreseen: true, hospice: t.hospice, service: t.service, lines, bedside };
}
