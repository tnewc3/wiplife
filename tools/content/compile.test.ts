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
    expect(result.bundle.text.obituary.opening.finished.length).toBeGreaterThan(0);
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
    expect(text).toContain('text/obituary.yaml: closing.finished[1]: {npc.they}: unknown role "npc"');
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
  npc: { kind: friend, createIfMissing: true }
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

    it('rejects a chain file whose name does not match its chain id', async () => {
      await write('events/any/family/wrong.chain.yaml', `chain: right\nevents:\n${[event(), event().replace('id: test_event', 'id: test_event_2')].map((e) => e.trim().split('\n').map((l, i) => (i === 0 ? `  - ${l}` : `    ${l}`)).join('\n')).join('\n')}\n`);
      expect(await expectErrors()).toContain('chain "right" must match the file name ("wrong")');
    });
  });
});

