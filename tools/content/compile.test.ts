import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'wiplife-content-'));
  await mkdir(path.join(dir, 'cities'));
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
  it('compiles the five cities from the design doc', async () => {
    const result = await compileContent({ contentDir: realContentDir, appVersion: '1.2.3' });
    if (!result.ok) throw new Error(formatErrors(result.errors));
    expect(Object.keys(result.bundle.cities)).toEqual(['chicago', 'houston', 'los_angeles', 'nyc', 'small_town']);
    expect(result.bundle.contentVersion).toMatch(/^1\.2\.3\+[0-9a-f]{10}$/);
    for (const city of Object.values(result.bundle.cities)) expect(city.countryId).toBe('us');
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

  it('rejects aliases that collide with an existing id', async () => {
    await write('cities/test_city.yaml', `${validCity}aliases: [second]\n`);
    await write('cities/second.yaml', validCity.replace('id: test_city', 'id: second'));
    const text = await expectErrors();
    expect(text).toContain('alias "second"');
  });
});
