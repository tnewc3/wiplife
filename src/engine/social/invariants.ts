/**
 * Invariants for social media (Batch 8): every account is on a platform that
 * exists, has a handle that is allowed, a niche that exists and numbers that
 * make sense; nobody opened an account under the platform's age, and an
 * account opened under 18 was set up by a parent; the year's posts stay inside
 * the platform's biggest budget; the pay set aside adds up and was earned by
 * accounts that can be paid; the totals are whole numbers.
 */
import { SOCIAL_TRIGGERS, type ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { handleIssue } from './query';

export function socialFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const s = state.social;
  const adult = content.balance.economy.independenceAge;
  for (const [key, a] of Object.entries(s.accounts)) {
    const platform = content.platforms[key];
    if (!platform) {
      fail(`an account is on an unknown platform "${key}"`);
      continue;
    }
    if (a.platform !== key) fail(`the account kept under "${key}" says it is on "${a.platform}"`);
    if (handleIssue(a.handle, content) !== null || a.handle !== a.handle.toLowerCase()) fail(`the handle "${a.handle}" on ${platform.name} is not an allowed handle`);
    if (!content.niches[a.niche]) fail(`the account on ${platform.name} is about an unknown niche "${a.niche}"`);
    if (!Number.isInteger(a.followers) || a.followers < 0) fail(`the account on ${platform.name} has ${a.followers} followers`);
    if (a.peak < a.followers) fail(`the account on ${platform.name} has more followers than its peak`);
    for (const [name, value] of [['engagement', a.engagement], ['quality', a.quality]] as const) if (!Number.isFinite(value) || value < 0 || value > 100) fail(`the account on ${platform.name} has ${name} ${value}`);
    if (a.since > state.currentYear || a.since < state.birthYear) fail(`the account on ${platform.name} was opened outside the life`);
    if (a.since - state.birthYear < platform.minAge) fail(`the account on ${platform.name} was opened at ${a.since - state.birthYear}, under the platform's age ${platform.minAge}`);
    if (a.since - state.birthYear < adult && !a.byParent) fail(`the account on ${platform.name} was opened under ${adult} without a parent`);
    if (a.monetized > state.currentYear || a.demonetized < 0 || a.earned < 0 || a.posts < 0) fail(`the account on ${platform.name} has an impossible pay record`);
  }
  if (s.year.year > state.currentYear) fail('social.year is from the future');
  for (const [id, n] of Object.entries(s.year.posts)) {
    const platform = content.platforms[id];
    if (!platform) fail(`this year's posts name an unknown platform "${id}"`);
    else if (!Number.isInteger(n) || n < 0 || n > content.balance.social.growth[platform.growth].posts) fail(`${n} posts on ${platform.name} in a year (the budget is ${content.balance.social.growth[platform.growth].posts})`);
  }
  const i = s.income;
  if (i.year > state.currentYear) fail('social.income is from the future');
  const byPlatform = Object.values(i.byPlatform).reduce((a, n) => a + n, 0);
  const byModel = Object.values(i.byModel).reduce((a, n) => a + n, 0);
  if (i.gross < 0 || i.agent < 0 || i.trust < 0 || i.agent + i.trust > i.gross) fail('the pay set aside from the platforms does not add up');
  if (byPlatform !== i.gross || byModel !== i.gross) fail(`the platforms paid ${byPlatform} by platform and ${byModel} by model, but ${i.gross} in all`);
  for (const id of Object.keys(i.byPlatform)) if (!content.platforms[id]) fail(`pay is set aside from an unknown platform "${id}"`);
  for (const [k, n] of Object.entries(s.totals)) if (!Number.isInteger(n) || n < 0) fail(`social.totals.${k} is ${n}`);
  for (const t of s.happened.triggers) if (!(SOCIAL_TRIGGERS as readonly string[]).includes(t)) fail(`social.happened names an unknown trigger "${t}"`);
  if (s.streak < 0) fail('social.streak is negative');
  return failures;
}
