/**
 * Invariants for the lives of the people you know (E3): romance only between
 * adults, partners that make sense (nobody who is your partner has another),
 * jobs and levels that exist, children born to adults, troubles that refer to
 * real conditions and offenses, care that fits, and a news log that stays
 * within its caps. (The People list's cap is measured in the simulation, at
 * the point the yearly pruning has run: events add people between years.)
 */
import type { ContentBundle } from '../../content/schemas';
import { isPartnerKind } from '../relationships';
import type { LifeState } from '../types';

export function livesFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const { adultAge } = content.balance.relationships;
  const bal = content.balance.people;

  for (const id of Object.keys(state.people).sort()) {
    const person = state.people[id]!;
    const life = person.life;
    if (!life) continue;
    const label = `person ${id}`;
    const age = (person.deathYear ?? state.currentYear) - person.birthYear;
    const rel = state.relationships[id];

    if (!['close', 'near', 'far'].includes(life.tier)) fail(`${label}: tier "${life.tier}" is not a tier`);
    // Work: a job that exists, a level on its track, and no level without a job (someone who has faded from your life isn't followed any more).
    if (rel?.status === 'ended') {
      // Nobody follows their job.
    } else if (person.occupation === undefined) {
      if (life.level !== 0) fail(`${label}: level ${life.level} without a job`);
    } else {
      const job = content.jobs[person.occupation];
      if (!job) fail(`${label}: job "${person.occupation}" does not exist`);
      else if (!Number.isInteger(life.level) || life.level < 1 || life.level > job.levels.length) fail(`${label}: level ${life.level} is not on the ${person.occupation} track`);
    }

    // Love: adults only, in every direction.
    const partner = life.partner;
    if (partner) {
      if (partner.since - person.birthYear < adultAge) fail(`${label}: began a relationship under ${adultAge}`);
      if (partner.since - partner.birthYear < adultAge) fail(`${label}: began a relationship with someone under ${adultAge}`);
      if (age < adultAge) fail(`${label}: is under ${adultAge} and has a partner`);
      if (partner.statusSince < partner.since || partner.statusSince > state.currentYear) fail(`${label}: partner status year is out of order`);
      if (rel && isPartnerKind(rel.kind) && rel.status === 'active') fail(`${label}: is your partner and has a partner of their own`);
    }
    if (age < adultAge && (life.ended !== undefined || life.children.length > 0)) fail(`${label}: is under ${adultAge} with a love life`);
    if (life.children.length > bal.children.max) fail(`${label}: has more than ${bal.children.max} children`);
    for (const kid of life.children) {
      if (kid.birthYear - person.birthYear < adultAge) fail(`${label}: a child born when they were under ${adultAge}`);
      if (kid.birthYear > state.currentYear) fail(`${label}: a child born in the future`);
      if (kid.first.trim().length === 0) fail(`${label}: a child without a name`);
    }

    // Trouble.
    const crimes = life.troubles.filter((t) => t.kind === 'crime');
    if (crimes.length > 1) fail(`${label}: more than one crime case`);
    if (life.troubles.length - crimes.length > bal.trouble.maxTroubles) fail(`${label}: more than ${bal.trouble.maxTroubles} illnesses or addictions`);
    for (const t of life.troubles) {
      if (t.kind === 'crime') {
        if (!content.offenses[t.refId]) fail(`${label}: offense "${t.refId}" does not exist`);
        if (t.stage === undefined) fail(`${label}: a crime without a stage`);
        if ((t.stage === 'probation' || t.stage === 'jail') && t.until === undefined) fail(`${label}: a sentence without an end`);
      } else {
        const def = content.conditions[t.refId];
        if (!def) fail(`${label}: condition "${t.refId}" does not exist`);
        else if ((def.kind === 'addiction') !== (t.kind === 'addiction')) fail(`${label}: ${t.refId} is filed under the wrong kind of trouble`);
        if (!Number.isInteger(t.severity) || t.severity < 1 || t.severity > 100) fail(`${label}: severity ${t.severity} is out of range`);
      }
    }
    // Care: someone you've taken in lives with you and is alive.
    if (life.care === 'home' && person.alive && person.cityId !== state.character.cityId) fail(`${label}: cared for at your home but not living there`);
    if (!Number.isInteger(life.gossip) || life.gossip < 0 || life.gossip > 100) fail(`${label}: gossip tendency is out of range`);
  }

  // The news log: a few years, each within its cap, each change once.
  if (state.news.length > bal.news.keepYears) fail(`the news keeps ${state.news.length} years (at most ${bal.news.keepYears})`);
  let previous = -Infinity;
  for (const year of state.news) {
    if (year.year <= previous || year.year > state.currentYear) fail(`news year ${year.year} is out of order`);
    previous = year.year;
    if (year.lines.length === 0) fail(`news year ${year.year} is empty`);
    if (year.lines.length > bal.news.maxPerYear) fail(`news year ${year.year} has ${year.lines.length} lines (at most ${bal.news.maxPerYear})`);
    const seen = new Set<string>();
    for (const line of year.lines) {
      const key = `${line.personId}:${line.kind}`;
      if (seen.has(key)) fail(`news year ${year.year} tells "${line.kind}" about ${line.personId} twice`);
      seen.add(key);
      if (!state.people[line.personId]) fail(`news names ${line.personId}, who is not in the life`);
      if (line.text.trim().length === 0) fail('a news line is empty');
    }
  }

  return failures;
}
