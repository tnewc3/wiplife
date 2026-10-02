import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileContent, formatErrors, type CompileResult } from './compile';

const realContentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/content');

const validCity = `
id: test_city
countryId: us
name: Test City
blurb: A place for tests
costOfLiving: 1.0
baseRent: 12000
baseHomePrice: 200000
salaryMultiplier: 1.0
jobMarket:
  professional: 50
  trade: 50
  gig: 50
schools:
  high: Test High School
  community: Test Community College
  state: Test State University
  elite: Test University
  trade: Test Trade School
  grad: Test Graduate School
`;

let dir: string;

beforeEach(async () => {
  // Start from a copy of the real content, then break one thing per test.
  dir = await mkdtemp(path.join(os.tmpdir(), 'wiplife-content-'));
  await cp(realContentDir, dir, { recursive: true, filter: (src) => !src.includes('compiled') });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await writeFile(path.join(dir, file), text);
}

async function compile(): Promise<CompileResult> {
  return compileContent({ contentDir: dir, appVersion: '0.0.0' });
}

async function expectErrors(): Promise<string> {
  const result = await compile();
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('unreachable');
  return formatErrors(result.errors);
}

describe('content build with the real content', () => {
  it('compiles every content type', async () => {
    const result = await compileContent({ contentDir: realContentDir, appVersion: '1.2.3' });
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(Object.keys(result.bundle.cities)).toEqual(['chicago', 'houston', 'los_angeles', 'nyc', 'small_town']);
    expect(result.bundle.contentVersion).toMatch(/^1\.2\.3\+[0-9a-f]{10}$/);
    for (const city of Object.values(result.bundle.cities)) expect(city.countryId).toBe('us');
    expect(Object.keys(result.bundle.names)).toEqual(['us']);
    expect(Object.keys(result.bundle.pronouns)).toContain('they_them');
    expect(Object.keys(result.bundle.talents).length).toBeGreaterThan(0);
    expect(result.bundle.balance.creation.family.siblingWeights.length).toBeGreaterThan(0);
    expect(result.bundle.character.appearance.groups.length).toBeGreaterThan(0);
    expect(Object.keys(result.bundle.causes)).toContain('natural_causes');
    expect(result.bundle.balance.mortality.maxAge).toBe(120);
    expect(result.bundle.text.obituary.opening.finished.mixed.length).toBeGreaterThan(0);
  });
});

describe('content build with fixture files', () => {
  it('accepts a valid city and produces a stable content version', async () => {
    await write('cities/test_city.yaml', validCity);
    const a = await compile();
    const b = await compile();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.bundle.cities.test_city?.name).toBe('Test City');
    expect(a.bundle.contentVersion).toBe(b.bundle.contentVersion);
  });

  it('changes the content version when content changes', async () => {
    await write('cities/test_city.yaml', validCity);
    const before = await compile();
    await write('cities/test_city.yaml', validCity.replace('baseRent: 12000', 'baseRent: 13000'));
    const after = await compile();
    if (!before.ok || !after.ok) throw new Error('expected both builds to pass');
    expect(after.bundle.contentVersion).not.toBe(before.bundle.contentVersion);
  });

  it('rejects a city with a wrong type, naming the file and field', async () => {
    await write('cities/test_city.yaml', validCity.replace('costOfLiving: 1.0', 'costOfLiving: expensive'));
    const text = await expectErrors();
    expect(text).toContain('cities/test_city.yaml');
    expect(text).toContain('costOfLiving');
    expect(text).toMatch(/expected number/i);
  });

  it('rejects a city with a missing field', async () => {
    await write('cities/test_city.yaml', validCity.replace('baseHomePrice: 200000\n', ''));
    const text = await expectErrors();
    expect(text).toContain('cities/test_city.yaml: baseHomePrice');
  });

  it('rejects out-of-range and non-integer values', async () => {
    await write(
      'cities/test_city.yaml',
      validCity.replace('professional: 50', 'professional: 150').replace('baseRent: 12000', 'baseRent: 1200.5'),
    );
    const text = await expectErrors();
    expect(text).toContain('jobMarket.professional');
    expect(text).toContain('baseRent');
  });

  it('rejects unknown keys so typos are caught', async () => {
    await write('cities/test_city.yaml', `${validCity}costOfLivng: 2\n`);
    const text = await expectErrors();
    expect(text).toContain('costOfLivng');
  });

  it('rejects an id that does not match the file name', async () => {
    await write('cities/other_name.yaml', validCity);
    const text = await expectErrors();
    expect(text).toContain('cities/other_name.yaml: id "test_city" must match the file name ("other_name")');
  });

  it('rejects ids that are not snake_case', async () => {
    await write('cities/TestCity.yaml', validCity.replace('id: test_city', 'id: TestCity'));
    const text = await expectErrors();
    expect(text).toContain('snake_case');
  });

  it('rejects malformed YAML with a line number', async () => {
    await write('cities/test_city.yaml', 'id: test_city\nname: [unclosed\n');
    const text = await expectErrors();
    expect(text).toContain('cities/test_city.yaml: invalid YAML');
    expect(text).toMatch(/line \d+/);
  });

  it('rejects duplicate keys', async () => {
    await write('cities/test_city.yaml', `${validCity}name: Again\n`);
    const text = await expectErrors();
    expect(text).toContain('invalid YAML');
  });

  it('rejects duplicate ids across folders of the same type', async () => {
    await write('cities/test_city.yaml', validCity);
    await write('cities/nested/test_city.yaml', validCity);
    const text = await expectErrors();
    expect(text).toContain('duplicate id "test_city"');
  });

  it('rejects YAML files outside a known content folder', async () => {
    await write('citys/test_city.yaml', validCity);
    const text = await expectErrors();
    expect(text).toContain('citys/test_city.yaml: not inside a known content folder');
  });

  it('uses YAML 1.2, so "no" is a string rather than false', async () => {
    await write('cities/test_city.yaml', validCity.replace('name: Test City', 'name: no'));
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(result.bundle.cities.test_city?.name).toBe('no');
  });

  it('reports every broken file in one run', async () => {
    await write('cities/test_city.yaml', validCity.replace('countryId: us', 'countryId: ca'));
    await write('cities/second.yaml', validCity.replace('id: test_city', 'id: second').replace('gig: 50', 'gig: -1'));
    const result = await compile();
    if (result.ok) throw new Error('expected failure');
    expect(new Set(result.errors.map((e) => e.file))).toEqual(new Set(['cities/test_city.yaml', 'cities/second.yaml']));
  });

  it('reports a missing required file', async () => {
    await rm(path.join(dir, 'balance', 'creation.yaml'));
    expect(await expectErrors()).toContain('balance/creation.yaml: required file is missing');
  });

  it('rejects unknown files in a single-file folder', async () => {
    await write('balance/creatoin.yaml', 'a: 1\n');
    expect(await expectErrors()).toContain('balance/creatoin.yaml: unknown file in balance/');
  });

  it('rejects a pronoun preset missing a form', async () => {
    const file = path.join(dir, 'pronouns', 'xe_xem.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace(/^reflexive: .*$/m, ''));
    expect(await expectErrors()).toContain('pronouns/xe_xem.yaml: reflexive');
  });

  it('rejects a balance reference to an unknown pronoun preset', async () => {
    const file = path.join(dir, 'balance', 'creation.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('he_him: 97', 'hee_him: 97'));
    expect(await expectErrors()).toContain('pronouns.man: unknown pronoun preset "hee_him"');
  });

  it('rejects a heritage weight for a heritage the name pool lacks', async () => {
    const file = path.join(dir, 'balance', 'creation.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('    general: 56', '    general: 56\n    atlantean: 3'));
    expect(await expectErrors()).toContain('heritage "atlantean" is not in names/us.yaml');
  });

  it('rejects a city whose country has no name pool', async () => {
    await rm(path.join(dir, 'names', 'us.yaml'));
    expect(await expectErrors()).toContain('no name pool for country "us"');
  });

  it('rejects ranges whose min is above max', async () => {
    const file = path.join(dir, 'balance', 'creation.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('personalityShift: { min: 25, max: 50 }', 'personalityShift: { min: 60, max: 50 }'));
    expect(await expectErrors()).toContain('latent.personalityShift: min (60) is greater than max (50)');
  });

  it('rejects aliases that collide with an existing id', async () => {
    await write('cities/test_city.yaml', `${validCity}aliases: [second]\n`);
    await write('cities/second.yaml', validCity.replace('id: test_city', 'id: second'));
    const text = await expectErrors();
    expect(text).toContain('alias "second"');
  });

  it('rejects a template placeholder its section does not provide', async () => {
    const file = path.join(dir, 'text', 'obituary.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('May {self.they} rest in peace.', 'May {npc.they} rest in {place}.'));
    const text = await expectErrors();
    expect(text).toContain('text/obituary.yaml: closing.finished.mixed[1]: {npc.they}: unknown role "npc"');
    expect(text).toContain('{place}: unknown value');
  });

  it('rejects a malformed template placeholder', async () => {
    const file = path.join(dir, 'text', 'history.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('Your {relation}, {npc.name}', 'Your {relation}, {npc.nickname}'));
    expect(await expectErrors()).toContain('unknown field "nickname"');
  });

  it('rejects an unknown cause of death in the mortality bands', async () => {
    const file = path.join(dir, 'balance', 'mortality.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('natural_causes: 5', 'old_age: 5'));
    expect(await expectErrors()).toContain('unknown cause "old_age"');
  });

  it('rejects cause bands that stop before the maximum age', async () => {
    const file = path.join(dir, 'balance', 'mortality.yaml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('\nmaxAge: 120\n', '\nmaxAge: 130\n'));
    expect(await expectErrors()).toContain('the last causes band must reach maxAge (130)');
  });

  it('rejects life stages out of order and curves out of order', async () => {
    const file = path.join(dir, 'balance', 'aging.yaml');
    const text = (await readFile(file, 'utf8')).replace('teen: 13', 'teen: 19').replace('{ at: 50, x: 0.4 }', '{ at: 10, x: 0.4 }');
    await writeFile(file, text);
    const errors = await expectErrors();
    expect(errors).toContain('points must be in increasing "at" order');
    await writeFile(file, text.replace('{ at: 10, x: 0.4 }', '{ at: 50, x: 0.4 }'));
    expect(await expectErrors()).toContain('lifeStages.youngAdult (18) must be after teen (19)');
  });

  describe('events', () => {
    const event = (extra = '') => `
id: test_event
title: A test
text: '{npc.name} waves.'
tone: light
category: family
rarity: common
lifeStages: [adult]
weight: { base: 5 }
cast:
  npc: { kind: friend, createIfMissing: true, presence: city }
choices:
  - id: wave
    label: Wave back
    outcome:
      effects:
        - { type: memory, role: npc, tag: lent_money }
  - id: ignore
    label: Ignore {npc.them}
    outcome: {}
${extra}`;
    const file = 'events/adult/family/test_event.yaml';

    it('accepts a valid event', async () => {
      await write(file, event());
      const result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(result.bundle.events.test_event?.title).toBe('A test');
    });

    it('rejects a placeholder for a role not in the cast', async () => {
      await write(file, event().replace("'{npc.name} waves.'", "'{stranger.name} waves.'"));
      expect(await expectErrors()).toContain('text: {stranger.name}: unknown role "stranger"');
    });

    it('rejects unregistered memories and flags, and unknown events and causes', async () => {
      await write(
        file,
        event().replace('tag: lent_money', 'tag: made_up_memory') +
          `requires: { all: [{ flag: made_up_flag }, { fired: made_up_event }] }
`,
      );
      const text = await expectErrors();
      expect(text).toContain('memory "made_up_memory" is not in registries/memories.yaml');
      expect(text).toContain('flag "made_up_flag" is not in registries/flags.yaml');
      expect(text).toContain('unknown event "made_up_event"');
      await write(file, event().replace('{ type: memory, role: npc, tag: lent_money }', '{ type: death, cause: old_age_x }'));
      expect(await expectErrors()).toContain('unknown cause "old_age_x"');
    });

    it('rejects unknown effect types and invalid conditions', async () => {
      await write(file, event().replace('{ type: memory, role: npc, tag: lent_money }', '{ type: teleport, where: mars }'));
      expect(await expectErrors()).toContain('test_event.yaml');
      await write(file, `${event()}requires: { age: 18 }
`);
      expect(await expectErrors()).toContain('requires');
    });

    it('rejects a schedule of an unknown event or of roles the follow-up lacks', async () => {
      await write(file, event().replace('{ type: memory, role: npc, tag: lent_money }', '{ type: schedule, eventId: friend_repays, inYears: [1, 2], cast: [npc] }'));
      expect(await expectErrors()).toContain('"friend_repays" has no role "npc"');
      await write(file, event().replace('{ type: memory, role: npc, tag: lent_money }', '{ type: schedule, eventId: nothing_here, inYears: [1, 2] }'));
      expect(await expectErrors()).toContain('unknown event "nothing_here"');
    });

    it('rejects an event in the wrong folder or with the wrong id', async () => {
      await write('events/teen/family/test_event.yaml', event());
      expect(await expectErrors()).toContain('lifeStages must include its folder\'s stage "teen"');
      await rm(path.join(dir, 'events/teen'), { recursive: true });
      await write('events/adult/money/test_event.yaml', event());
      expect(await expectErrors()).toContain('must match its folder ("money")');
      await rm(path.join(dir, 'events/adult/money'), { recursive: true });
      await write('events/adult/family/other_name.yaml', event());
      expect(await expectErrors()).toContain('must match the file name ("other_name")');
    });

    it('rejects a follow-up nothing schedules, a legendary event without history, and creating family', async () => {
      await write(file, `${event()}followUpOnly: true
`);
      expect(await expectErrors()).toContain('followUpOnly, but no event schedules it');
      await write(file, event().replace('rarity: common', 'rarity: legendary'));
      expect(await expectErrors()).toContain('a legendary event must write a history entry');
      await write(file, event().replace('kind: friend, createIfMissing: true', 'kind: sibling, createIfMissing: true'));
      expect(await expectErrors()).toContain('only friend, classmate, acquaintance can be created');
    });

    it('enforces category contracts and presence declarations (C1)', async () => {
      const schoolFile = 'events/teen/school/test_event.yaml';
      const school = event().replace('category: family', 'category: school').replace('lifeStages: [adult]', 'lifeStages: [teen]');
      await write(schoolFile, school);
      expect(await expectErrors()).toContain('category "school" requires');
      await write(schoolFile, school.replace('weight:', 'requires: { education: { program: [high] } }\nweight:'));
      const result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      await rm(path.join(dir, schoolFile));
      await write(file, event().replace(', presence: city', ''));
      expect(await expectErrors()).toContain('presence');
      await write(file, event().replace('presence: city', 'presence: household'));
      expect(await expectErrors()).toContain("presence household can't create someone new");
      await write(file, event().replace("'{npc.name} waves.'", "'{npc.name} waves, {since} on.'"));
      expect(await expectErrors()).toContain('{since} is only for follow-ups another event schedules');
    });

    it('rejects a chain file whose name does not match its chain id', async () => {
      await write('events/any/family/wrong.chain.yaml', `chain: right\nevents:\n${[event(), event().replace('id: test_event', 'id: test_event_2')].map((e) => e.trim().split('\n').map((l, i) => (i === 0 ? `  - ${l}` : `    ${l}`)).join('\n')).join('\n')}\n`);
      expect(await expectErrors()).toContain('chain "right" must match the file name ("wrong")');
    });
  });

  describe('relationships', () => {
    const romance = (extra = '') => `
id: test_romance
title: A date
text: '{date.name} smiles.'
tone: light
category: romance
rarity: common
lifeStages: [adult]
weight: { base: 5 }
cast:
  date: { kind: acquaintance, romantic: true, createIfMissing: true, presence: city }
autoOutcome:
  effects:
    - { type: relationship, role: date, kind: partner }
${extra}`;
    const romanceFile = 'events/adult/romance/test_romance.yaml';
    const adultOnly = 'requires: { age: { gte: 18 } }\n';

    it('accepts a romance event that requires adults', async () => {
      await write(romanceFile, romance(adultOnly));
      const result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(result.bundle.events.test_romance).toBeDefined();
    });

    it('rejects a romance event without an adult-only requirement', async () => {
      await write(romanceFile, romance());
      expect(await expectErrors()).toContain('a romance event must require { age: { gte: 18 } } in requires (adults only)');
      await write(romanceFile, romance('requires: { age: { gte: 16 } }\n'));
      expect(await expectErrors()).toContain('a romance event must require');
      // Only in one branch of an "any" is not a requirement.
      await write(romanceFile, romance('requires: { any: [{ age: { gte: 18 } }, { stat: happiness, gt: 10 }] }\n'));
      expect(await expectErrors()).toContain('a romance event must require');
    });

    it('treats any event that starts a romance as a romance event, whatever its category', async () => {
      await write(
        'events/adult/family/test_romance.yaml',
        romance().replace('category: romance', 'category: family').replace('romantic: true, ', ''),
      );
      const text = await expectErrors();
      expect(text).toContain('a romance event must require');
      expect(text).toContain('cast.date: in a romance event every role must be an adult');
    });

    it('rejects a romance event with a role that is not guaranteed to be an adult, or in a young life stage', async () => {
      const withFriend = romance(adultOnly).replace(
        '  date: { kind: acquaintance, romantic: true, createIfMissing: true, presence: city }',
        '  date: { kind: acquaintance, romantic: true, createIfMissing: true, presence: city }\n  friend: { kind: friend, presence: city }',
      );
      await write(romanceFile, withFriend);
      expect(await expectErrors()).toContain('cast.friend: in a romance event every role must be an adult');
      await write(romanceFile, withFriend.replace('friend: { kind: friend, presence: city }', 'friend: { kind: friend, age: { min: 18, max: 90 }, presence: city }'));
      expect((await compile()).ok).toBe(true);
      await write(
        romanceFile,
        withFriend.replace(adultOnly, 'requires: { all: [{ age: { gte: 18 } }, { role: friend, age: { gte: 18 } }] }\n'),
      );
      expect((await compile()).ok).toBe(true);
      await write(romanceFile, romance(adultOnly).replace('lifeStages: [adult]', 'lifeStages: [teen, adult]'));
      expect(await expectErrors()).toContain("a romance event can't be in life stages teen");
    });

    it('rejects a romantic role that is family, and a role with both or neither of kind and support', async () => {
      await write(romanceFile, romance(adultOnly).replace('kind: acquaintance, romantic: true, createIfMissing: true', 'kind: sibling, romantic: true'));
      expect(await expectErrors()).toContain('a romantic role finds a potential partner, never family');
      await write(romanceFile, romance(adultOnly).replace('kind: acquaintance, romantic: true, createIfMissing: true', 'kind: friend, support: true'));
      expect(await expectErrors()).toContain('exactly one of kind or support');
      await write(romanceFile, romance(adultOnly).replace('kind: acquaintance, romantic: true, createIfMissing: true', 'romantic: true'));
      expect(await expectErrors()).toContain('exactly one of kind or support');
    });

    it('only lets an optional role appear in choices that require it', async () => {
      const crisis = (choiceExtra: string, text = 'Everything goes wrong.') => `
id: test_crisis
title: A crisis
text: '${text}'
tone: serious
category: health
rarity: common
lifeStages: [adult]
weight: { base: 5 }
cast:
  helper: { support: true, optional: true, presence: anywhere }
choices:
  - id: call
    label: Call {helper.name}
${choiceExtra}    outcome:
      effects:
        - { type: memory, role: helper, tag: stood_by_you }
  - id: alone
    label: Cope alone
    outcome: {}
`;
      const crisisFile = 'events/adult/health/test_crisis.yaml';
      await write(crisisFile, crisis('    visibleIf: { role: helper }\n'));
      expect((await compile()).ok).toBe(true);
      await write(crisisFile, crisis(''));
      expect(await expectErrors()).toContain('choices.call: uses optional role "helper" without visibleIf: { role: helper }');
      await write(crisisFile, crisis('    visibleIf: { role: helper }\n', '{helper.name} is worried.'));
      expect(await expectErrors()).toContain('optional role "helper" can\'t appear in the title or text');
    });

    it('rejects a check that reads the feelings of a role not in the cast', async () => {
      await write(
        romanceFile,
        romance(adultOnly).replace(
          'autoOutcome:\n  effects:\n    - { type: relationship, role: date, kind: partner }',
          'choices:\n  - id: ask\n    label: Ask\n    check:\n      base: 50\n      stats: [{ role: ghost, key: affection, weight: 0.5 }]\n      success: {}\n      failure: {}\n  - id: leave\n    label: Leave\n    outcome: {}',
        ),
      );
      expect(await expectErrors()).toContain('choices.ask.check: role "ghost" is not in the cast');
    });

    it('checks memory texts as templates about {npc}', async () => {
      const memories = await readFile(path.join(dir, 'registries/memories.yaml'), 'utf8');
      await write('registries/memories.yaml', memories.replace('tags:', 'tags:\n  test_memory: You met {stranger.name}'));
      expect(await expectErrors()).toContain('tags.test_memory: {stranger.name}: unknown role "stranger"');
    });

    it('checks the events that answer management actions', async () => {
      const actions = await readFile(path.join(dir, 'registries/actions.yaml'), 'utf8');
      await write('registries/actions.yaml', actions.replace('propose: { events: [proposal] }', 'propose: { events: [proposal, no_such_event] }'));
      expect(await expectErrors()).toContain('propose: unknown event "no_such_event"');
      // friend_repays is scheduled by another event, casts "friend" and happens on its own schedule.
      await write('registries/actions.yaml', actions.replace('propose: { events: [proposal] }', 'propose: { events: [friend_repays] }'));
      let text = await expectErrors();
      expect(text).toContain('answers the "propose" action, so no event may schedule it');
      expect(text).toContain('answers the "propose" action, so its cast is exactly the role "person"');
      await write('registries/actions.yaml', actions.replace('propose: { events: [proposal] }', 'propose: { events: [road_trip] }'));
      text = await expectErrors();
      expect(text).toContain('so it must be followUpOnly');
      await write('registries/actions.yaml', actions);
      const proposal = await readFile(path.join(dir, 'events/any/partner/proposal.yaml'), 'utf8');
      await write('events/any/partner/proposal.yaml', proposal.replace('- { type: money, delta: -200 }', '- { type: death, cause: natural_causes }'));
      expect(await expectErrors()).toContain("a management action's result can't kill");
    });

    it('checks the events that answer money trouble', async () => {
      const triggers = await readFile(path.join(dir, 'registries/triggers.yaml'), 'utf8');
      await write('registries/triggers.yaml', triggers.replace('eviction: { events: [eviction_notice] }', 'eviction: { events: [no_such_event] }'));
      let text = await expectErrors();
      expect(text).toContain('eviction: unknown event "no_such_event"');
      expect(text).toContain('eviction: needs at least one active event');
      await write('registries/triggers.yaml', triggers.replace('eviction: { events: [eviction_notice] }', 'eviction: { events: [eviction_notice, road_trip] }'));
      text = await expectErrors();
      expect(text).toContain('answers the "eviction" trigger, so it must be followUpOnly');
      await write('registries/triggers.yaml', triggers);
      // A trigger event doesn't need anything to schedule it.
      expect((await compile()).ok).toBe(true);
    });

    it('keeps debt and housing effects to adults', async () => {
      const file = 'events/teen/money/test_loan.yaml';
      const loan = (requires: string) => `id: test_loan
title: A loan
text: Someone offers you a loan.
tone: neutral
category: money
rarity: common
lifeStages: [teen, youngAdult]
${requires}weight: { base: 1 }
choices:
  - id: take
    label: Take it
    outcome:
      effects:
        - { type: debt, action: add, kind: personal, amount: 500 }
  - id: leave
    label: Leave it
    outcome: {}
`;
      await write(file, loan(''));
      expect(await expectErrors()).toContain('debt and housing effects are for adults');
      await write(file, loan('requires: { age: { gte: 18 } }\n'));
      expect((await compile()).ok).toBe(true);
    });

    it('rejects a malformed debt effect and an empty money condition', async () => {
      const file = 'events/adult/money/test_debt.yaml';
      await write(
        file,
        'id: test_debt\ntitle: Debt\ntext: Debt.\ntone: neutral\ncategory: money\nrarity: common\nlifeStages: [adult]\nrequires: { finances: {} }\nweight: { base: 1 }\nautoOutcome:\n  effects:\n    - { type: debt, action: add, kind: personal }\n',
      );
      const text = await expectErrors();
      expect(text).toContain('add needs kind and amount');
      expect(text).toContain('requires');
    });
  });

  describe('health, legal and self-discovery (Stage 9)', () => {
    const event = (category: string, stages: string, effects: string, text = 'It happens.') => `
id: test_event
title: A test
text: Something happens.
tone: serious
category: ${category}
rarity: common
lifeStages: [${stages}]
weight: { base: 5 }
choices:
  - id: one
    label: One
    outcome:
      text: '${text}'
      effects: [${effects}]
  - id: two
    label: Two
    outcome: {}
`;

    it('accepts legal, health, identity, inner conflict and talent effects', async () => {
      await write(
        'events/adult/justice/test_event.yaml',
        event(
          'justice',
          'adult',
          '{ type: legal, offenseId: theft, outcome: sentence }, { type: health, conditionId: depression, severity: 10 }, { type: identity, field: attraction, value: fromLatent }, { type: innerConflict, delta: 5 }, { type: talent }',
          'You get {sentence}, {self.name}.',
        ),
      );
      const result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
    });

    it('rejects unknown offenses, conditions and pronoun presets, and {sentence} without a legal effect', async () => {
      await write(
        'events/adult/justice/test_event.yaml',
        event(
          'justice',
          'adult',
          '{ type: legal, offenseId: jaywalking, outcome: sentence }, { type: health, conditionId: the_vapors, severity: 10 }, { type: identity, field: pronouns, value: zz_zim }',
        ).replace("outcome: {}", "outcome: { text: 'You get {sentence}.', effects: [] }"),
      );
      const text = await expectErrors();
      expect(text).toContain('unknown offense "jaywalking"');
      expect(text).toContain('unknown health condition "the_vapors"');
      expect(text).toContain('unknown pronoun preset "zz_zim"');
      expect(text).toContain('{sentence} needs a legal effect in the same outcome');
    });

    it('keeps prison events for adults, and "self" for you', async () => {
      await write('events/teen/prison/test_event.yaml', event('prison', 'teen', ''));
      expect(await expectErrors()).toContain('a prison event can’t be in life stages'.replace('’', "'"));
      await rm(path.join(dir, 'events/teen/prison/test_event.yaml'));
      await write('events/adult/justice/test_event.yaml', `${event('justice', 'adult', '')}cast:\n  self: { kind: friend, presence: city }\n`);
      expect(await expectErrors()).toContain('"self" is always you in event text');
    });

    it('requires a target rate for every condition and offense, and registry events that only happen that way', async () => {
      const targets = path.join(dir, 'balance', 'targets.yaml');
      await writeFile(targets, (await readFile(targets, 'utf8')).replace(/\n {4}cancer: \{[^}]*\}/, ''));
      const file = path.join(dir, 'events', 'any', 'justice', 'release_day.yaml');
      await writeFile(file, (await readFile(file, 'utf8')).replace('followUpOnly: true\n', ''));
      const text = await expectErrors();
      expect(text).toContain('health.conditions: no target for "cancer"');
      expect(text).toContain('release_day: answers triggers.released, so it must be followUpOnly');
    });

    it('treats an admirer as a romance role: adults only', async () => {
      const kiss = path.join(dir, 'events', 'youngAdult', 'romance', 'unexpected_kiss.yaml');
      await writeFile(kiss, (await readFile(kiss, 'utf8')).replace('    - { age: { gte: 18 } }\n', ''));
      expect(await expectErrors()).toContain('unexpected_kiss: a romance event must require { age: { gte: 18 } }');
    });
  });

  describe('education', () => {
    it('keeps dropping out to the dropout age, and checks education conditions and effects', async () => {
      const file = 'events/teen/school/test_quit.yaml';
      const quit = (requires: string, effect = '{ type: education, action: drop_out }') => `id: test_quit
title: Quit
text: You could quit school.
tone: serious
category: school
rarity: common
lifeStages: [teen]
${requires}weight: { base: 1 }
choices:
  - id: quit
    label: Quit
    outcome:
      effects:
        - ${effect}
  - id: stay
    label: Stay
    outcome: {}
`;
      await write(file, quit('requires: { education: { program: [high] } }\n'));
      expect(await expectErrors()).toContain('drop_out and expel happen from the dropout age');
      await write(file, quit('requires: { all: [{ age: { gte: 16 } }, { education: { program: [high], major: [alchemy] } }] }\n'));
      expect(await expectErrors()).toContain('unknown major "alchemy"');
      await write(file, quit('requires: { age: { gte: 16 } }\n', '{ type: education, action: grades, value: 3 }'));
      expect(await expectErrors()).toContain('grades needs a value from -1 to 1');
      await write(file, quit('requires: { all: [{ age: { gte: 16 } }, { education: { program: [high], final: false } }] }\n'));
      expect((await compile()).ok).toBe(true);
    });

    it('needs tuition and an admission model for every trade and grad program, and real majors', async () => {
      await write('trades/stonemason.yaml', 'id: stonemason\nname: Stonemason\nsubject: stonework\nlicense: mason card\nblurb: Stone.\ncareers: Building\nyears: 2\ndifficulty: 2\n');
      await write(
        'grad/divinity.yaml',
        'id: divinity\nname: Divinity school\nsubject: divinity\ndegree: a divinity degree\nblurb: Faith.\ncareers: Ministry\nyears: 3\ndifficulty: 3\nmajors: [theology]\n',
      );
      const text = await expectErrors();
      expect(text).toContain('stonemason: no tuition in balance/education.yaml');
      expect(text).toContain('divinity: no tuition in balance/education.yaml');
      expect(text).toContain('divinity: no admission model');
      expect(text).toContain('divinity: unknown major "theology"');
    });

    it('rejects balance entries for unknown programs and flags', async () => {
      const balance = await readFile(path.join(dir, 'balance/education.yaml'), 'utf8');
      await write(
        'balance/education.yaml',
        balance.replace('    electrician: 7500', '    electrician: 7500\n    juggler: 100').replace('{ research_assistant: 8 }', '{ research_assistant: 8, made_up_flag: 3 }'),
      );
      const text = await expectErrors();
      expect(text).toContain('tuition.trade: unknown trade "juggler"');
      expect(text).toContain('flag "made_up_flag" is not in registries/flags.yaml');
    });

    it('requires every city to name its schools', async () => {
      const chicago = await readFile(path.join(dir, 'cities/chicago.yaml'), 'utf8');
      await write('cities/chicago.yaml', chicago.replace(/schools:[\s\S]*$/, ''));
      expect(await expectErrors()).toContain('schools');
    });
  });

  it('lays an overlay folder over the content: its events replace every real event', async () => {
    const overlay = await mkdtemp(path.join(os.tmpdir(), 'wiplife-overlay-'));
    try {
      await mkdir(path.join(overlay, 'events/adult/family'), { recursive: true });
      await writeFile(
        path.join(overlay, 'events/adult/family/only_event.yaml'),
        'id: only_event\ntitle: Only\ntext: Hi.\ntone: light\ncategory: family\nrarity: common\nlifeStages: [adult]\nweight: { base: 1 }\nautoOutcome: {}\n',
      );
      // The overlay's events replace the real ones, so it brings its own action and trigger events too.
      await mkdir(path.join(overlay, 'events/any/money'), { recursive: true });
      await writeFile(
        path.join(overlay, 'events/any/money/only_trouble.yaml'),
        'id: only_trouble\ntitle: Trouble\ntext: Money is tight.\ntone: serious\ncategory: money\nrarity: common\nlifeStages: [adult]\nweight: { base: 1 }\nfollowUpOnly: true\nautoOutcome: {}\n',
      );
      await mkdir(path.join(overlay, 'events/any/people'), { recursive: true });
      await writeFile(
        path.join(overlay, 'events/any/people/only_action.yaml'),
        'id: only_action\ntitle: Act\ntext: You act.\ntone: light\ncategory: people\nrarity: common\nlifeStages: [adult]\nweight: { base: 1 }\nfollowUpOnly: true\ncast:\n  person: { kind: friend, presence: anywhere }\nautoOutcome: {}\n',
      );
      await mkdir(path.join(overlay, 'registries'), { recursive: true });
      await writeFile(
        path.join(overlay, 'registries/actions.yaml'),
        `actions:\n${['ask_out', 'propose', 'move_in', 'marry', 'break_up', 'divorce', 'cut_contact', 'reconcile'].map((a) => `  ${a}: { events: [only_action] }`).join('\n')}\n`,
      );
      await writeFile(
        path.join(overlay, 'registries/triggers.yaml'),
        `triggers:\n${['foreclosure', 'eviction', 'collections', 'garnishment', 'missed_payment'].map((t) => `  ${t}: { events: [only_trouble] }`).join('\n')}\n`,
      );
      await mkdir(path.join(overlay, 'events/any/work'), { recursive: true });
      await mkdir(path.join(overlay, 'events/any/career'), { recursive: true });
      await writeFile(
        path.join(overlay, 'events/any/career/only_work.yaml'),
        'id: only_work\ntitle: Work\ntext: Work.\ntone: light\ncategory: career\nrarity: common\nlifeStages: [adult]\nweight: { base: 1 }\nfollowUpOnly: true\nautoOutcome: {}\n',
      );
      await writeFile(
        path.join(overlay, 'events/any/work/only_boss.yaml'),
        'id: only_boss\ntitle: Boss\ntext: Boss.\ntone: light\ncategory: work\nrarity: common\nlifeStages: [adult]\nrequires: { career: { employed: true } }\nweight: { base: 1 }\nfollowUpOnly: true\ncast:\n  boss: { kind: boss, presence: city }\nautoOutcome: {}\n',
      );
      await writeFile(
        path.join(overlay, 'registries/work.yaml'),
        'results:\n  hired: { events: [only_boss] }\n  rejected: { events: [only_work] }\n  raise: { events: [only_boss] }\n',
      );
      // ...and its own health, legal and self-discovery events (Stage 9).
      const followUp = (id: string, category: string) =>
        `id: ${id}\ntitle: ${id}\ntext: Hi.\ntone: light\ncategory: ${category}\nrarity: common\nlifeStages: [adult]\n${
          category === 'prison' ? 'requires: { legal: { incarcerated: true } }\n' : ''
        }weight: { base: 1 }\nfollowUpOnly: true\nautoOutcome: {}\n`;
      for (const [folder, id, category] of [
        ['health', 'only_doctor', 'health'],
        ['prison', 'only_prison', 'prison'],
        ['justice', 'only_justice', 'justice'],
        ['identity', 'only_identity', 'identity'],
      ] as const) {
        await mkdir(path.join(overlay, `events/any/${folder}`), { recursive: true });
        await writeFile(path.join(overlay, `events/any/${folder}/${id}.yaml`), followUp(id, category));
      }
      await writeFile(
        path.join(overlay, 'registries/health.yaml'),
        'doctor:\n  clean: { events: [only_doctor] }\n  treated: { events: [only_doctor] }\n  managed: { events: [only_doctor] }\n',
      );
      await writeFile(
        path.join(overlay, 'registries/legal.yaml'),
        'triggers:\n  jailed: { events: [only_prison] }\n  released: { events: [only_justice] }\n  probation: { events: [only_justice] }\n',
      );
      const kinds = ['attraction', 'gender', 'expression', 'personality'];
      const each = (list: string[]) => list.map((k) => `  ${k}: { events: [only_identity] }`).join('\n');
      await writeFile(
        path.join(overlay, 'registries/discovery.yaml'),
        `surfacing:\n${each([...kinds, 'talent'])}\nresurfacing:\n${each(kinds)}\ncrisis: { events: [only_identity] }\ncomingOut: { events: [only_identity] }\n`,
      );
      await mkdir(path.join(overlay, 'balance'), { recursive: true });
      const pacing = (await readFile(path.join(dir, 'balance/pacing.yaml'), 'utf8')).replace('cap: 6', 'cap: 3');
      await writeFile(path.join(overlay, 'balance/pacing.yaml'), pacing);
      const result = await compileContent({ contentDir: dir, appVersion: '0.0.0', overlayDir: overlay });
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(Object.keys(result.bundle.events).sort()).toEqual(
        ['only_action', 'only_boss', 'only_doctor', 'only_event', 'only_identity', 'only_justice', 'only_prison', 'only_trouble', 'only_work'].sort(),
      );
      expect(result.bundle.balance.pacing.cap).toBe(3);
      expect(Object.keys(result.bundle.cities).length).toBeGreaterThan(0);
    } finally {
      await rm(overlay, { recursive: true, force: true });
    }
  });
});

