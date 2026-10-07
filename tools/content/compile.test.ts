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
carDependence: 0.5
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

/** A small valid interaction, to break one thing at a time (E1). */
const interaction = (id = 'test_move') => `id: ${id}
name: Test move
blurb: A move for tests.
group: everyday
profile: warm
inPerson: false
availability:
  kinds: [friend]
  you: { min: 8 }
  them: { min: 8 }
outcomes:
  good:
    text: ["{person.name} smiles.", "{person.name} nods and {person:smiles|smile}."]
    affection: 2
  neutral:
    text: ["Nothing much.", "{person.name} shrugs."]
  bad:
    text: ["{person.name} frowns.", "{person.name} looks away."]
    affection: -2
`;

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

  it('has no consistency warnings left unreviewed (C1, docs/consistency-review.md)', async () => {
    const result = await compileContent({ contentDir: realContentDir, appVersion: '1.2.3' });
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(result.warnings.map((w) => w.message)).toEqual([]);
  });
});

describe('content build with fixture files', { timeout: 90_000 }, () => {
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
    });

    it('warns on money talk without money, past claims without evidence, and fixed gaps in follow-ups (C1)', async () => {
      // Money: the label lends money, the outcome changes none.
      await write(file, event().replace('label: Wave back', 'label: Lend {npc.them} $50'));
      let result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(result.warnings.map((w) => [w.eventId, w.kind])).toEqual([['test_event', 'money']]);
      // Justified: no warning.
      await write(file, `${event().replace('label: Wave back', 'label: Lend {npc.them} $50')}justified: { money: "A test of the justification field." }\n`);
      result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(result.warnings).toEqual([]);
      // Past: a claim with no flag, memory or earlier event behind it.
      await write(file, event().replace("'{npc.name} waves.'", "'{npc.name} waves, the way you used to.'"));
      result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(result.warnings.map((w) => w.kind)).toEqual(['past']);
      // A justification nothing needs is an error.
      await write(file, `${event()}justified: { past: "Nothing here needs this at all." }\n`);
      expect(await expectErrors()).toContain('justified.past is set, but nothing is flagged');
    });

    it('warns on a fixed time gap in a follow-up (C1)', async () => {
      await write(
        file,
        event()
          .replace("'{npc.name} waves.'", "'Years later, {npc.name} waves.'")
          .replace('weight: { base: 5 }', 'weight: { base: 5 }\nfollowUpOnly: true')
          .replace('tag: lent_money }', 'tag: lent_money }\n        - { type: schedule, eventId: test_event, inYears: [1, 2], cast: [npc] }'),
      );
      const result = await compile();
      if (!result.ok) throw new Error(formatErrors(result.errors));
      expect(result.warnings.map((w) => w.message)).toEqual([expect.stringContaining('fixed time phrase "Years later"')]);
    });

    it('keeps {since} to scheduled follow-ups and checks cost items (C1)', async () => {
      await write(file, event().replace("'{npc.name} waves.'", "'{npc.name} waves, {since} on.'"));
      expect(await expectErrors()).toContain('{since} is only for follow-ups another event schedules');
      await write(file, event().replace('tag: lent_money }', 'tag: lent_money }\n        - { type: cost, item: yacht }'));
      expect(await expectErrors()).toContain('unknown cost item "yacht"');
      await write(file, `${event()}once: true\nrecurring: true\n`);
      expect(await expectErrors()).toContain('a recurring event can’t also be once');
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
      expect(await expectErrors()).toContain('a role needs one of kind or support');
      await write(romanceFile, romance(adultOnly).replace('kind: acquaintance, romantic: true, createIfMissing: true', 'romantic: true'));
      expect(await expectErrors()).toContain('a role needs one of kind or support');
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
      expect(text).toContain('add needs kind and either amount or item');
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
        `actions:\n${['ask_out', 'propose', 'move_in', 'marry', 'break_up', 'divorce', 'cut_contact', 'reconcile', 'try_for_baby'].map((a) => `  ${a}: { events: [only_action] }`).join('\n')}\n`,
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
        path.join(overlay, 'registries/interactions.yaml'),
        'infidelity:\n  flirt: { events: [only_identity] }\n  intimate: { events: [only_identity] }\n',
      );
      await writeFile(
        path.join(overlay, 'registries/health.yaml'),
        'doctor:\n  clean: { events: [only_doctor] }\n  treated: { events: [only_doctor] }\n  managed: { events: [only_doctor] }\n  diagnosed: { events: [only_doctor] }\n',
      );
      await writeFile(path.join(overlay, 'registries/mental.yaml'), 'therapist:\n  talked: { events: [only_doctor] }\n  diagnosed: { events: [only_doctor] }\n');
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

describe('interactions (E1)', () => {
  const file = 'interactions/test_move.yaml';

  it('accepts a valid interaction, and the real content has about twenty with enough variants', { timeout: 90_000 }, async () => {
    await write(file, interaction());
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(Object.keys(result.bundle.interactions)).toContain('test_move');
    const real = await compileContent({ contentDir: realContentDir, appVersion: '1.2.3' });
    if (!real.ok) throw new Error(formatErrors(real.errors));
    const defs = Object.values(real.bundle.interactions);
    expect(defs.length).toBeGreaterThanOrEqual(19);
    expect(defs.length).toBeLessThanOrEqual(32);
    for (const def of defs) {
      for (const tier of Object.values(def.outcomes)) {
        if (!tier) continue;
        expect(tier.text.length).toBeGreaterThanOrEqual(2);
        expect(tier.text.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('has at least ten events that check memories written by interactions', { timeout: 90_000 }, async () => {
    const real = await compileContent({ contentDir: realContentDir, appVersion: '1.2.3' });
    if (!real.ok) throw new Error(formatErrors(real.errors));
    const written = new Set<string>();
    for (const def of Object.values(real.bundle.interactions)) {
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (typeof node === 'object' && node !== null) {
          const o = node as Record<string, unknown>;
          if (o.type === 'memory' && typeof o.tag === 'string') written.add(o.tag);
          if (o.type === 'moneyFromPerson') ['lent_you_money', 'gave_you_money'].forEach((t) => written.add(t));
          if (o.type === 'infidelity') ['cheated_on_them', 'affair_with_you', 'flirted_behind_their_back'].forEach((t) => written.add(t));
          Object.values(o).forEach(walk);
        }
      };
      walk(def.outcomes);
    }
    const checking = Object.values(real.bundle.events).filter((def) => {
      const text = JSON.stringify(def.requires ?? {});
      return [...written].some((tag) => text.includes(`"tag":"${tag}"`)) && !def.retired;
    });
    expect(checking.length).toBeGreaterThanOrEqual(10);
  });

  it('rejects a romance interaction that does not require both people to be adults', { timeout: 90_000 }, async () => {
    const romance = interaction().replace('group: everyday', 'group: romance\nromance: true');
    await write(file, romance);
    expect(await expectErrors()).toContain('romance: availability.you.min must be at least 18');
    await write(file, romance.replace('you: { min: 8 }', 'you: { min: 18 }'));
    expect(await expectErrors()).toContain('romance: availability.them.min must be at least 18');
    await write(file, romance.replace('you: { min: 8 }', 'you: { min: 18 }').replace('them: { min: 8 }', 'them: { min: 17 }'));
    expect(await expectErrors()).toContain('availability.them.min must be at least 18');
    // Adults on both sides is fine.
    await write(file, romance.replace('you: { min: 8 }', 'you: { min: 18 }').replace('them: { min: 8 }', 'them: { min: 18 }'));
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
  });

  it('rejects romance or intimacy with family, and romance that is not marked', { timeout: 90_000 }, async () => {
    const adults = interaction().replace('you: { min: 8 }', 'you: { min: 18 }').replace('them: { min: 8 }', 'them: { min: 18 }');
    const romance = adults.replace('group: everyday', 'group: romance\nromance: true');
    await write(file, romance.replace('kinds: [friend]', 'kinds: [friend, sibling]'));
    expect(await expectErrors()).toContain("romance: can't be available with family (sibling)");
    await write(file, romance.replace('kinds: [friend]', 'kinds: [parent]'));
    expect(await expectErrors()).toContain("can't be available with family (parent)");
    // The romance group, and being intimate, must be marked romance: true (the schema says so).
    await write(file, adults.replace('group: everyday', 'group: romance'));
    expect(await expectErrors()).toContain('must be marked romance: true');
    await write(file, adults.replace('group: everyday', 'group: everyday\nintimate: true'));
    expect(await expectErrors()).toContain('an intimate interaction must be marked romance: true');
    // Nothing else may be unfaithful or change a relationship kind.
    await write(file, adults.replace('affection: 2', 'affection: 2\n    effects: [{ type: infidelity, role: person, act: flirt }]'));
    expect(await expectErrors()).toContain('only a romance interaction can be unfaithful');
  });

  it('rejects bad references, hardcoded pronouns, money talk without money and the wrong roles', { timeout: 90_000 }, async () => {
    await write(file, interaction().replace('profile: warm', 'profile: nonsense'));
    expect(await expectErrors()).toContain('unknown reaction profile "nonsense"');
    await write(file, interaction().replace('affection: 2', 'affection: 2\n    effects: [{ type: memory, role: person, tag: no_such_memory }]'));
    expect(await expectErrors()).toContain('memory "no_such_memory" is not in registries/memories.yaml');
    await write(file, interaction().replace('affection: 2', 'affection: 2\n    effects: [{ type: flag, key: no_such_flag, value: true }]'));
    expect(await expectErrors()).toContain('flag "no_such_flag" is not in registries/flags.yaml');
    await write(file, interaction().replace('affection: 2', 'affection: 2\n    effects: [{ type: health, conditionId: no_such_condition, severity: 5 }]'));
    expect(await expectErrors()).toContain('unknown health condition "no_such_condition"');
    await write(file, interaction().replace('"{person.name} smiles."', '"She smiles at {person.name}."'));
    expect(await expectErrors()).toContain('hardcoded pronoun');
    await write(file, interaction().replace('"Nothing much."', '"{person.name} lends you some money."'));
    expect(await expectErrors()).toContain('mentions money');
    await write(file, interaction().replace('"Nothing much."', '"{stranger.name} waves."'));
    expect(await expectErrors()).toContain('unknown role "stranger"');
    await write(file, interaction().replace('affection: 2', 'affection: 2\n    effects: [{ type: memory, role: other, tag: apologized }]'));
    expect(await expectErrors()).toContain('the only role is "person"');
    await write(file, interaction().replace('affection: 2', 'affection: 2\n    effects: [{ type: job, action: fire }]'));
    expect(await expectErrors()).toContain('interactions may only use these effects');
  });

  it('needs 2–3 wordings per tier and the three tiers every interaction has', { timeout: 90_000 }, async () => {
    await write(file, interaction().replace('["Nothing much.", "{person.name} shrugs."]', '["Nothing much."]'));
    expect(await expectErrors()).toContain('text');
    await write(file, interaction().replace(/ {2}bad:[\s\S]*$/, ''));
    expect(await expectErrors()).toContain('outcomes.bad');
  });
});


describe('children and parenting (E2a)', () => {
  it('accepts the real content', { timeout: 90_000 }, async () => {
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(result.bundle.registries.family.decision).toEqual(['unplanned_pregnancy']);
  });

  it('never allows romance or sexual wording in an event that involves a child', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/parenting/kid_recital.yaml'), 'utf8');
    await write('events/any/parenting/kid_recital.yaml', real.replace('{kid.name} finds you in the crowd', '{kid.name} has a crush, and finds you in the crowd'));
    expect(await expectErrors()).toContain('involves a child but uses romantic or sexual wording ("crush")');
    await write('events/any/parenting/kid_recital.yaml', real.replace('  kid: { kind: child, presence: household, age: { min: 5, max: 14 } }', '  kid: { kind: child, presence: household, age: { min: 5, max: 14 } }\n  mate: { kind: partner, presence: nearby, optional: true }'));
    expect(await expectErrors()).toContain("involves a child, so it can't be a romance event");
  });

  it('never allows a romance interaction with a child, or romantic wording in one a child can have', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'interactions/hug.yaml'), 'utf8');
    await write('interactions/hug.yaml', real.replace('A good, long hug.', 'A good, long kiss.'));
    expect(await expectErrors()).toContain('is available with a child but uses romantic or sexual wording ("kiss")');
    const flirt = await readFile(path.join(dir, 'interactions/flirt.yaml'), 'utf8');
    await write('interactions/flirt.yaml', flirt.replace('kinds: [friend,', 'kinds: [child, friend,'));
    expect(await expectErrors()).toContain("can't be available with family (child)");
  });

  it('requires an unplanned pregnancy to offer all three choices', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/pregnancy/unplanned_pregnancy.yaml'), 'utf8');
    await write('events/any/pregnancy/unplanned_pregnancy.yaml', real.replace('choice: end', 'choice: keep'));
    expect(await expectErrors()).toContain('"end" is missing');
  });

  it('keeps registry events to the roles the engine passes in, and a child’s death to a deceased role', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/pregnancy/birth_you.yaml'), 'utf8');
    await write('events/any/pregnancy/birth_you.yaml', real.replace('cast:\n  baby:', 'cast:\n  friend: { kind: friend, presence: city }\n  baby:'));
    expect(await expectErrors()).toContain('its cast can only be');
    const death = await readFile(path.join(dir, 'events/any/grief/child_dies_young.yaml'), 'utf8');
    await write('events/any/grief/child_dies_young.yaml', death.replace(', deceased: true', ''));
    expect(await expectErrors()).toContain('casts the child as a deceased role');
  });

  it('only lets the right event start each process, and custody effects name an ex', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/building/ivf_start.yaml'), 'utf8');
    await write('events/any/building/ivf_start.yaml', real.replace('process: ivf', 'process: adoption'));
    expect(await expectErrors()).toContain('only the adoption start event');
    const custody = await readFile(path.join(dir, 'events/any/custody/custody_hearing.yaml'), 'utf8');
    await write('events/any/custody/custody_hearing.yaml', custody.replace('other: { kind: ex,', 'other: { kind: friend,'));
    expect(await expectErrors()).toContain('must be cast as an ex');
  });
});

describe('heir play and inheritance (E2b)', () => {
  it('accepts the real content, with its causes, heir events and heir text', { timeout: 90_000 }, async () => {
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(Object.keys(result.bundle.registries.estate.causes).length).toBeGreaterThan(0);
    expect(result.bundle.registries.heir.will).toEqual(['will_is_read']);
    expect(result.bundle.text.heir.previously.died.length).toBeGreaterThan(0);
    expect(result.bundle.balance.family.estate.default.spouseWithChildren).toBeLessThanOrEqual(100);
  });

  it('only lets a heir event happen for heirs: its category needs it, and so does anything casting a dead parent', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/legacy/name_opens_doors.yaml'), 'utf8');
    await write('events/any/legacy/name_opens_doors.yaml', real.replace('    - { family: { heir: true, reputation: { gte: 62 } } }', '    - { family: { reputation: { gte: 62 } } }'));
    expect(await expectErrors()).toContain('category "legacy" requires {"family":{"heir":true}}');
    const remember = await readFile(path.join(dir, 'events/any/legacy/remember_warm_home.yaml'), 'utf8');
    await write('events/any/legacy/remember_warm_home.yaml', remember.replace('    - { family: { heir: true } }\n', ''));
    const errors = await expectErrors();
    expect(errors).toContain('category "legacy" requires');
    expect(errors).toContain('which only heirs have, so it must require { family: { heir: true } }');
  });

  it('keeps the heir registry to follow-up events that cast what the engine passes in', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/estate/will_is_read.yaml'), 'utf8');
    await write('events/any/estate/will_is_read.yaml', real.replace('followUpOnly: true\n', ''));
    expect(await expectErrors()).toContain('answers will, so it must be followUpOnly');
    await write('events/any/estate/will_is_read.yaml', real.replace('parent: { kind: parent, presence: anywhere, deceased: true }', 'parent: { kind: parent, presence: anywhere }'));
    expect(await expectErrors()).toContain('must cast "parent" as a deceased role');
    const dispute = await readFile(path.join(dir, 'events/any/estate/siblings_dispute_the_will.yaml'), 'utf8');
    await write('events/any/estate/siblings_dispute_the_will.yaml', dispute.replace('sibling: { kind: sibling,', 'sibling: { kind: friend,'));
    expect(await expectErrors()).toContain('must cast "sibling" as a sibling');
    const guardian = await readFile(path.join(dir, 'events/any/guardianship/guardian_parent_new_normal.yaml'), 'utf8');
    await write('events/any/guardianship/guardian_parent_new_normal.yaml', guardian.replace('guardian: { kind: parent, presence: household }', 'guardian: { kind: parent, presence: household }\n  gone: { kind: parent, presence: anywhere, deceased: true }'));
    expect(await expectErrors()).toContain('a deceased role is only passed in for guardian.parent');
  });

  it('checks the heir balance, the memories and flags the engine writes, and the heir text', { timeout: 90_000 }, async () => {
    const family = await readFile(path.join(dir, 'balance/family.yaml'), 'utf8');
    await write('balance/family.yaml', family.replace('    minAge: 21\n    maxAge: 78', '    minAge: 55\n    maxAge: 45'));
    expect(await expectErrors()).toContain('heir.guardian: minAge is greater than maxAge');
    await write('balance/family.yaml', family.replace('filed_bankruptcy: { delta: -3, deed: bankruptcy }', 'not_a_flag: { delta: -3, deed: bankruptcy }'));
    expect(await expectErrors()).toContain('unknown flag "not_a_flag"');
    await write('balance/family.yaml', family.replace('deed: bankruptcy }\n      unfaithful', 'deed: mystery }\n      unfaithful'));
    expect(await expectErrors()).toContain('unknown deed "mystery"');
    await write('balance/family.yaml', family);
    const memories = await readFile(path.join(dir, 'registries/memories.yaml'), 'utf8');
    await write('registries/memories.yaml', memories.replace('  heir_warm_home: Made a warm home for you\n', ''));
    expect(await expectErrors()).toContain('heir_warm_home: the heir system writes this memory');
    await write('registries/memories.yaml', memories);
    const text = await readFile(path.join(dir, 'text/heir.yaml'), 'utf8');
    await write('text/heir.yaml', text.replace('{parent.name} died at {age}, of {cause}. It is {year}', '{stranger.name} died at {age}, of {cause}. It is {year}'));
    expect(await expectErrors()).toContain('unknown role "stranger"');
  });

  it('requires a memory event to read the memory its registry slot answers', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/legacy/remember_warm_home.yaml'), 'utf8');
    await write('events/any/legacy/remember_warm_home.yaml', real.replace('tag: heir_warm_home', 'tag: heir_cold_home'));
    expect(await expectErrors()).toContain('so it must require the memory "heir_warm_home" from the parent');
  });
});

describe("people's own lives (E3)", () => {
  it('accepts the real content: about forty request events and about sixty news lines', { timeout: 90_000 }, async () => {
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    const registered = new Set(Object.values(result.bundle.registries.people.requests).flatMap((r) => r.events));
    const followUps = Object.values(result.bundle.events).filter((e) => !e.retired && (e.category === 'lives' || e.category === 'care'));
    expect(followUps.length).toBeGreaterThanOrEqual(40);
    expect(followUps.length).toBeLessThanOrEqual(50);
    expect([...registered].every((id) => result.bundle.events[id])).toBe(true);
    const lines = Object.values(result.bundle.text.news.lines).reduce((sum, l) => sum + l.length, 0);
    expect(lines).toBeGreaterThanOrEqual(55);
    expect(lines).toBeLessThanOrEqual(70);
    expect(result.warnings).toEqual([]);
  });

  it('keeps request events to follow-ups that cast the person whose life changed', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/lives/wedding_invitation.yaml'), 'utf8');
    await write('events/any/lives/wedding_invitation.yaml', real.replace('followUpOnly: true\n', ''));
    expect(await expectErrors()).toContain('answers wedding, so it must be followUpOnly');
    await write('events/any/lives/wedding_invitation.yaml', real.replace('npc: { support: true, presence: anywhere }', 'person: { support: true, presence: anywhere }'));
    expect(await expectErrors()).toContain('casts the person whose life changed as "npc"');
    await write('events/any/lives/wedding_invitation.yaml', real.replace('npc: { support: true, presence: anywhere }', 'npc: { support: true, presence: anywhere }\n  stranger: { kind: friend, presence: anywhere }'));
    expect(await expectErrors()).toContain('its cast can only be npc, partner or sibling (not "stranger")');
    const funeral = await readFile(path.join(dir, 'events/any/lives/funeral_parent.yaml'), 'utf8');
    await write('events/any/lives/funeral_parent.yaml', funeral.replace('npc: { kind: parent, presence: anywhere, deceased: true }', 'npc: { kind: parent, presence: anywhere }'));
    expect(await expectErrors()).toContain('a death casts "npc" as a deceased role');
  });

  it('needs the situation that makes {npc.partner} and {npc.job} true', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/lives/engagement_news.yaml'), 'utf8');
    await write('events/any/lives/engagement_news.yaml', real.replace(', life: { partner: [engaged] }', ''));
    expect(await expectErrors()).toContain('{npc.partner} needs requires: role npc with life');
    const promotion = await readFile(path.join(dir, 'events/any/lives/promotion_dinner.yaml'), 'utf8');
    await write('events/any/lives/promotion_dinner.yaml', promotion.replace('text: >-\n  {npc.name} got the promotion.', 'text: >-\n  {npc.name} got the promotion as {npc.job}.').replace(', life: { employed: true }', ''));
    expect(await expectErrors()).toContain('{npc.job} needs requires: role npc with life: { employed: true }');
    const toast = await readFile(path.join(dir, 'events/any/lives/wedding_toast.yaml'), 'utf8');
    await write('events/any/lives/wedding_toast.yaml', toast.replace('text: >-\n  "Would you give a toast?"', 'text: >-\n  {self.city} "Would you give a toast?"'));
    expect(await expectErrors()).toContain("{self.city} isn't available");
  });

  it('keeps news lines to the values they are given, short, and without a hardcoded pronoun', { timeout: 90_000 }, async () => {
    const news = await readFile(path.join(dir, 'text/news.yaml'), 'utf8');
    await write('text/news.yaml', news.replace('    - "Your {npc.relation} {npc.name} retired."', '    - "Your {npc.relation} {npc.name} retired from {employer}."'));
    expect(await expectErrors()).toContain('lines.retired[0]');
    await write('text/news.yaml', news.replace('    - "Your {npc.relation} {npc.name} retired."', '    - "Your {npc.relation} {npc.name} retired, and she is glad."'));
    expect(await expectErrors()).toContain('hardcoded pronoun');
    await write('text/news.yaml', news.replace('    - "Your {npc.relation} {npc.name} retired."', `    - "Your {npc.relation} {npc.name} retired ${'and so on '.repeat(20)}."`));
    expect(await expectErrors()).toContain('news lines are short');
    await write('text/news.yaml', news.replace(/ {2}care_needed:\n.*\n.*\n/s, ''));
    expect(await expectErrors()).toContain('care_needed');
  });

  it('checks the people balance against itself and the pacing cap', { timeout: 90_000 }, async () => {
    const people = await readFile(path.join(dir, 'balance/people.yaml'), 'utf8');
    await write('balance/people.yaml', people.replace('partnerAgeOffset: { min: -5, max: 7 }', 'partnerAgeOffset: { min: 9, max: 7 }'));
    expect(await expectErrors()).toContain('love.partnerAgeOffset: min is greater than max');
    const pacing = await readFile(path.join(dir, 'balance/pacing.yaml'), 'utf8');
    await write('balance/pacing.yaml', pacing.replace('cap: 6', 'cap: 1'));
    expect(await expectErrors()).toContain('requests.maxPerYear is above the pacing cap');
    await write('balance/pacing.yaml', pacing);
    await write('balance/people.yaml', people.replace('  far: [love, children, trouble]', '  far: [love, children, trouble, career]'));
    expect(await expectErrors()).toContain('each tier follows a subset of the tier above it');
  });

  it('has the costs, memories and flags the events use', { timeout: 90_000 }, async () => {
    const economy = await readFile(path.join(dir, 'balance/economy.yaml'), 'utf8');
    await write('balance/economy.yaml', economy.replace('  cosigned_debt: { amount: 7000, familyHelp: false }\n', ''));
    expect(await expectErrors()).toContain('cosigned_debt');
  });
});

describe('the social web (E4)', () => {
  it('accepts the real content: about forty events, versions with twists for every kind, and no warnings', { timeout: 90_000 }, async () => {
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    const web = Object.values(result.bundle.events).filter((e) => !e.retired && e.category === 'web');
    expect(web.length).toBeGreaterThanOrEqual(35);
    expect(web.length).toBeLessThanOrEqual(45);
    const kinds = Object.entries(result.bundle.registries.web.kinds);
    expect(kinds).toHaveLength(10);
    for (const [kind, def] of kinds) {
      expect(Object.keys(def.versions).length, kind).toBeGreaterThanOrEqual(3);
      expect(Object.values(def.versions).some((v) => v.twists.length > 0), kind).toBe(true);
    }
    expect(result.warnings).toEqual([]);
  });

  it('checks the web balance against itself and the pacing cap', { timeout: 90_000 }, async () => {
    const web = await readFile(path.join(dir, 'balance/web.yaml'), 'utf8');
    await write('balance/web.yaml', web.replace('  start: 16\n', '  start: 45\n'));
    expect(await expectErrors()).toContain('a feud ends above where it starts');
    await write('balance/web.yaml', web.replace('status: { close: 70, strained: 40 }', 'status: { close: 30, strained: 40 }'));
    expect(await expectErrors()).toContain('strained must be below close');
    const pacing = await readFile(path.join(dir, 'balance/pacing.yaml'), 'utf8');
    await write('balance/web.yaml', web);
    await write('balance/pacing.yaml', pacing.replace('cap: 6', 'cap: 1'));
    expect(await expectErrors()).toContain('events.maxPerYear is above the pacing cap');
  });

  it('keeps each tie event to a follow-up that casts a and b and requires the tie', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/web/feud_siblings_side.yaml'), 'utf8');
    await write('events/any/web/feud_siblings_side.yaml', real.replace('followUpOnly: true\n', ''));
    expect(await expectErrors()).toContain('answers trigger feudBegan, so it must be followUpOnly');
    await write('events/any/web/feud_siblings_side.yaml', real.replace('  b: { support: true, presence: anywhere }\n', ''));
    expect(await expectErrors()).toContain('its cast is exactly a and b');
    await write('events/any/web/feud_siblings_side.yaml', real.replace('    - { tie: { a: a, b: b, kind: [siblings], status: [feuding] } }\n', ''));
    expect(await expectErrors()).toContain('must require the tie between "a" and "b"');
    await write('events/any/web/feud_siblings_side.yaml', real.replace('{ type: tie, a: a, b: b, action: side, with: a }', '{ type: tie, a: a, b: z, action: side, with: a }'));
    expect(await expectErrors()).toContain('role "z" is not in the cast');
  });

  it('needs a reaction to cast the person who heard and require what they heard, and {heard} only where they have', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/web/rumor_job_loss.yaml'), 'utf8');
    await write('events/any/web/rumor_job_loss.yaml', real.replace('heard: { kinds: [jobLoss], light: false, learned: [gossip] }', 'heard: { kinds: [arrest], learned: [gossip] }'));
    expect(await expectErrors()).toContain('must require that "npc" has heard about jobLoss');
    await write('events/any/web/rumor_job_loss.yaml', real.replace(', heard: { kinds: [jobLoss], light: false, learned: [gossip] }', ''));
    expect(await expectErrors()).toContain('{heard} needs requires');
  });

  it('keeps the versions of every story reachable, written without a hardcoded pronoun, and secrets serious', { timeout: 90_000 }, async () => {
    const reg = await readFile(path.join(dir, 'registries/web.yaml'), 'utf8');
    await write('registries/web.yaml', reg.replace('twists: [{ to: affair_serial, weight: 2 }, { to: affair_close, weight: 1 }]', 'twists: [{ to: affair_serial, weight: 2 }, { to: nowhere, weight: 1 }]'));
    expect(await expectErrors()).toContain('twists to "nowhere", which is not a version');
    await write('registries/web.yaml', reg.replace('        twists: [{ to: affair, weight: 1 }]\n        affection: -3', '        twists: [{ to: affair, weight: 1 }]\n        light: true\n        affection: -3'));
    expect(await expectErrors()).toContain('a secret is never played for laughs');
    await write('registries/web.yaml', reg.replace('heard: "that you were laid off"', 'heard: "that she was laid off"'));
    expect(await expectErrors()).toContain('hardcoded pronoun');
    await write('registries/web.yaml', reg.replace('heard: "that you were laid off"', 'heard: "you were laid off"'));
    expect(await expectErrors()).toContain('starts with "that"');
    await write('registries/web.yaml', reg.replace('        heardAbout: "that {about.name} was laid off"\n', ''));
    expect(await expectErrors()).toContain('heardAbout is missing');
    await write('registries/web.yaml', reg.replace("flags: [shoplifted, joyrode, tagged_bridge, ran_package, cooked_books, stole_from_work]", "flags: [shoplifted, not_a_flag]"));
    expect(await expectErrors()).toContain('flag "not_a_flag" is not in registries/flags.yaml');
  });

  it('keeps the new interactions to what they are about', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'interactions/introduce.yaml'), 'utf8');
    await write('interactions/introduce.yaml', real.replace('other: true\n', ''));
    expect(await expectErrors()).toContain('an introduction is an interaction with other: true');
    const straight = await readFile(path.join(dir, 'interactions/set_record_straight.yaml'), 'utf8');
    await write('interactions/set_record_straight.yaml', straight.replace('topic: distorted\n', ''));
    expect(await expectErrors()).toContain('knowledge effects are for an interaction with a topic');
  });
});

describe('pets, vehicles and homes (E5)', () => {
  it('accepts the real content: eight pets, eight vehicles, six renovations, four pet interactions and about forty events, with no warnings', { timeout: 90_000 }, async () => {
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(Object.keys(result.bundle.pets)).toHaveLength(8);
    expect(Object.keys(result.bundle.vehicles)).toHaveLength(8);
    expect(Object.keys(result.bundle.renovations)).toHaveLength(6);
    expect(Object.keys(result.bundle.petInteractions)).toHaveLength(4);
    const events = Object.values(result.bundle.events).filter((e) => !e.retired && ['pets', 'vehicles', 'property'].includes(e.category));
    expect(events.length).toBeGreaterThanOrEqual(35);
    expect(events.length).toBeLessThanOrEqual(45);
    expect(result.warnings).toEqual([]);
  });

  it('needs an event that binds a pet to require that you own one, and an effect on a pet to bind it', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/pets/pet_bond_moment.yaml'), 'utf8');
    await write('events/any/pets/pet_bond_moment.yaml', real.replace('    - { belongings: { pets: { gte: 1 }, petBond: { gte: 70 } } }\n', '    - { age: { gte: 18 } }\n'));
    expect(await expectErrors()).toContain('binds a pet, so it must require that you own one');
    const ill = await readFile(path.join(dir, 'events/any/pets/pet_falls_ill.yaml'), 'utf8');
    await write('events/any/pets/pet_falls_ill.yaml', ill.replace('bind: [pet]\n', ''));
    expect(await expectErrors()).toContain('acts on a pet, so the event must bind it');
  });

  it('keeps the events the possessions step queues followUpOnly and bound to what they are about', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/vehicles/fender_bender.yaml'), 'utf8');
    await write('events/any/vehicles/fender_bender.yaml', real.replace('followUpOnly: true\n', ''));
    expect(await expectErrors()).toContain('so it must be followUpOnly');
    await write('events/any/vehicles/fender_bender.yaml', real.replace('bind: [vehicle]\n', ''));
    expect(await expectErrors()).toContain('so it must bind a vehicle');
  });

  it('checks species, vehicles and the roles an event may use', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/any/pets/pet_chews_something.yaml'), 'utf8');
    await write('events/any/pets/pet_chews_something.yaml', real.replace('species: [dog, cat, rabbit, guinea_pig]', 'species: [dog, unicorn]'));
    expect(await expectErrors()).toContain('unknown pet "unicorn"');
    await write('events/any/pets/pet_chews_something.yaml', real.replace('bind: [pet]\n', 'bind: [pet]\ncast:\n  pet: { kind: friend, presence: city }\n'));
    expect(await expectErrors()).toContain('is for the possession an event binds');
    await write('events/any/pets/pet_chews_something.yaml', real.replace('{pet.name}', '{pet.nickname}'));
    expect(await expectErrors()).toContain('unknown field');
  });

  it('checks the possessions balance against the offenses and conditions it names', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'balance/possessions.yaml'), 'utf8');
    await write('balance/possessions.yaml', real.replace('offenseId: dui', 'offenseId: not_an_offense'));
    expect(await expectErrors()).toContain('unknown offense "not_an_offense"');
    await write('balance/possessions.yaml', real.replace('conditions: [alcohol_addiction]', 'conditions: [not_a_condition]'));
    expect(await expectErrors()).toContain('unknown condition "not_a_condition"');
  });

  it('keeps pet interactions to the pet’s role, a real profile and no hardcoded pronoun', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'petInteractions/play.yaml'), 'utf8');
    await write('petInteractions/play.yaml', real.replace('profile: play', 'profile: nap'));
    expect(await expectErrors()).toContain('unknown profile "nap"');
    await write('petInteractions/play.yaml', real.replace('{pet.name} is wild with joy.', 'She is wild with joy.'));
    expect(await expectErrors()).toContain('never a hardcoded pronoun');
    await write('petInteractions/play.yaml', real.replace('{ type: stat, key: happiness, delta: 2 }', '{ type: money, delta: 5 }'));
    expect(await expectErrors()).toContain('pet interactions may only use these effects');
  });

  it('needs a jobs vehicle number in range and a city car dependence', { timeout: 90_000 }, async () => {
    const job = await readFile(path.join(dir, 'jobs/delivery_driver.yaml'), 'utf8');
    await write('jobs/delivery_driver.yaml', job.replace('vehicle: 1', 'vehicle: 3'));
    expect(await expectErrors()).toContain('vehicle');
    const city = await readFile(path.join(dir, 'cities/nyc.yaml'), 'utf8');
    await write('jobs/delivery_driver.yaml', job);
    await write('cities/nyc.yaml', city.replace(/carDependence: .*\n/, ''));
    expect(await expectErrors()).toContain('carDependence');
  });
});

describe('the teen years (T1)', () => {
  it('accepts the real content: eight crowds, nine house rules, nine jobs, eight teams and clubs, about fifty-five events, and no warnings', { timeout: 90_000 }, async () => {
    const result = await compile();
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(Object.keys(result.bundle.cliques)).toHaveLength(8);
    expect(Object.keys(result.bundle.houseRules)).toHaveLength(9);
    expect(Object.keys(result.bundle.teenJobs)).toHaveLength(9);
    expect(Object.keys(result.bundle.activities)).toHaveLength(8);
    const categories = ['crowds', 'houserules', 'driving', 'teenwork', 'teamsclubs', 'future'];
    const events = Object.values(result.bundle.events).filter((e) => !e.retired && categories.includes(e.category));
    expect(events.length).toBeGreaterThanOrEqual(35);
    expect(result.warnings).toEqual([]);
  });

  it('keeps the events the teen step queues followUpOnly, and casting only what it passes in', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/teen/houserules/caught_curfew.yaml'), 'utf8');
    await write('events/teen/houserules/caught_curfew.yaml', real.replace('followUpOnly: true\n', ''));
    expect(await expectErrors()).toContain('so it must be followUpOnly');
    await write('events/teen/houserules/caught_curfew.yaml', real.replace('cast:\n  parent: { kind: parent, presence: household }\n', 'cast:\n  parent: { kind: parent, presence: household }\n  friend: { kind: friend, presence: city }\n'));
    expect(await expectErrors()).toContain('so its cast can only be: parent');
    await write('events/teen/houserules/caught_curfew.yaml', real.replace('    - { teen: { caught: [curfew] } }\n', ''));
    expect(await expectErrors()).toContain('must require { teen: { caught');
    const clash = await readFile(path.join(dir, 'events/teen/crowds/rival_prank.yaml'), 'utf8');
    await write('events/teen/houserules/caught_curfew.yaml', real);
    await write('events/teen/crowds/rival_prank.yaml', clash.replace('  member: { kind: classmate, crowd: yours, presence: city }\n', ''));
    expect(await expectErrors()).toContain('must cast "member"');
  });

  it('allows the crowd, rule, job and school values only where an event requires what they name', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/teen/crowds/crowd_notices_you.yaml'), 'utf8');
    await write('events/teen/crowds/crowd_notices_you.yaml', real.replace('    - { teen: { invited: true } }\n', ''));
    expect(await expectErrors()).toContain('uses {clique} without requiring a crowd');
    await write('events/teen/crowds/crowd_notices_you.yaml', real.replace('{clique} catches', '{clique} and {rule} and {job} catch'));
    const messages = await expectErrors();
    expect(messages).toContain('uses {rule} without requiring teen: caught');
    expect(messages).toContain('uses {job} without requiring a teen job');
  });

  it('refuses a crowd, team, job or rule that is not real, and a house rule whose id is not its domain', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/teen/crowds/rival_prank.yaml'), 'utf8');
    await write('events/teen/crowds/rival_prank.yaml', real.replace('    - { teen: { clash: true } }\n', '    - { teen: { clash: true, crowd: [nonexistent_crowd] } }\n'));
    expect(await expectErrors()).toContain('unknown crowd "nonexistent_crowd"');
    const job = await readFile(path.join(dir, 'events/teen/teenwork/who_is_hiring.yaml'), 'utf8');
    await write('events/teen/crowds/rival_prank.yaml', real);
    await write('events/teen/teenwork/who_is_hiring.yaml', job.replace('jobId: dog_walker', 'jobId: astronaut'));
    expect(await expectErrors()).toContain('unknown teen job "astronaut"');
    await write('events/teen/teenwork/who_is_hiring.yaml', job);
    const rule = await readFile(path.join(dir, 'houseRules/curfew.yaml'), 'utf8');
    await write('houseRules/curfew.yaml', rule.replace('domain: curfew', 'domain: chores'));
    expect(await expectErrors()).toContain("a house rule's id must be its domain");
  });

  it('checks the teen balance: ages, license ages, rule levels and enough crowds for a school', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'balance/teen.yaml'), 'utf8');
    await write('balance/teen.yaml', real.replace('permitAge: 15', 'permitAge: 17').replace('licenseAge: 16', 'licenseAge: 16'));
    expect(await expectErrors()).toContain('permitAge is greater than licenseAge');
    await write('balance/teen.yaml', real.replace('cliques: { min: 4, max: 5 }', 'cliques: { min: 4, max: 9 }'));
    expect(await expectErrors()).toContain('is more than the 8 crowds');
    await write('balance/teen.yaml', real.replace('levelAt: [53, 63]', 'levelAt: [63, 53]'));
    expect(await expectErrors()).toContain('the first number must be below the second');
    await write('balance/teen.yaml', real.replace('none: { grades: 0,', 'none: { grades: 0.3,'));
    expect(await expectErrors()).toContain('a year with no focus gives nothing');
  });

  it('never allows romance or sexual wording, a romance event or a romantic role where a teenager can meet it', { timeout: 90_000 }, async () => {
    const real = await readFile(path.join(dir, 'events/teen/crowds/crowd_inside_joke.yaml'), 'utf8');
    await write('events/teen/crowds/crowd_inside_joke.yaml', real.replace('one word from anyone', 'one flirty word from anyone'));
    expect(await expectErrors()).toContain('there is never romance or sexual content involving anyone under 18');
    await write('events/teen/crowds/crowd_inside_joke.yaml', real.replace('cast:\n  member: { kind: classmate, crowd: yours, presence: city }', 'cast:\n  member: { kind: classmate, crowd: yours, presence: city }\n  admirer: { kind: acquaintance, admirer: true, presence: city, createIfMissing: true }'));
    expect(await expectErrors()).toContain('is an admirer');
    await write('events/teen/crowds/crowd_inside_joke.yaml', real.replace('{ type: relationship, role: member, affection: 4 }', '{ type: relationship, role: member, kind: partner }'));
    expect(await expectErrors()).toContain('makes someone your partner');
    await write('events/teen/crowds/crowd_inside_joke.yaml', real);
    const cl = await readFile(path.join(dir, 'cliques/afterburn.yaml'), 'utf8');
    await write('cliques/afterburn.yaml', cl.replace('Thrill-seekers', 'Crush-hungry thrill-seekers'));
    expect(await expectErrors()).toContain('uses romantic or sexual wording');
    const rule = await readFile(path.join(dir, 'houseRules/screens.yaml'), 'utf8');
    await write('cliques/afterburn.yaml', cl);
    await write('houseRules/screens.yaml', rule.replace('Phones off at the table', 'No dating apps at the table'));
    expect(await expectErrors()).toContain('uses romantic or sexual wording');
  });

  it('keeps a crowd from reading as a stand-in for any real group', { timeout: 90_000 }, async () => {
    const cl = await readFile(path.join(dir, 'cliques/quiet_hours.yaml'), 'utf8');
    await write('cliques/quiet_hours.yaml', cl.replace('Readers, writers and night owls', 'Nerds, geeks and night owls'));
    expect(await expectErrors()).toContain('says nothing about race, religion, background or money');
  });
});
