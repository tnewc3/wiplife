import type { CollectionKey, Condition, ContentBundle } from '../../src/content/schemas';
import type { ContentError } from './compile';
export function checkTravel(bundle: ContentBundle, fileOf: (key: CollectionKey, id: string) => string, partial: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  for (const d of Object.values(bundle.destinations)) {
    const file = fileOf('destinations', d.id);
    if (!bundle.languages[d.languageId]) err(file, 'unknown destination language');
    // Batch 10: the name pool and heritage for locals, and the valuable a pricey souvenir is.
    if (d.locals && !bundle.names[d.locals.pool]?.heritages[d.locals.heritage]) err(file, `unknown name pool or heritage for locals (${d.locals.pool}/${d.locals.heritage})`);
    if (d.souvenir && !bundle.valuables[d.souvenir]) err(file, `unknown souvenir valuable ${d.souvenir}`);
    if (d.kind === 'cruise' && (d.cityId || d.locals || d.souvenir)) err(file, 'a cruise has no city, locals or souvenir');
    if (d.cityId) {
      const city = bundle.cities[d.cityId];
      if (!city || bundle.countries[city.countryId]?.name !== d.country) err(file, 'destination city and country must agree');
    }
  }
  for (const c of Object.values(bundle.cities).filter((c) => !c.retired)) if (!Object.values(bundle.destinations).some((d) => d.cityId === c.id && !d.retired)) err('destinations/', `missing city ${c.id}`);
  const visit = (c: Condition | undefined, file: string): void => {
    if (!c) return;
    if ('all' in c) c.all.forEach((p) => visit(p, file));
    if ('any' in c) c.any.forEach((p) => visit(p, file));
    if ('not' in c) visit(c.not, file);
    if ('travel' in c && c.travel.destinationId && !bundle.destinations[c.travel.destinationId]) err(file, 'unknown travel destination');
  };
  const reg = bundle.registries.travel;
  // Batch 10: the registries nest: the old lists (a receipt first, then stories), the stories of each activity and kind of trip, and the souvenir and family stories.
  const groups: [string, string[], boolean][] = [
    ['trips', reg.trips, true], ['study', reg.study, true], ['work', reg.work, true],
    ...Object.entries(reg.activity).map(([k, ids]): [string, string[], boolean] => [`activity.${k}`, ids, false]),
    ...Object.entries(reg.style).map(([k, ids]): [string, string[], boolean] => [`style.${k}`, ids, k === 'business']),
    ['souvenir', reg.souvenir, false], ['family', reg.family, false],
  ];
  for (const [group, ids, hasReceipt] of groups) {
    const file = 'registries/travel.yaml';
    if (new Set(ids).size !== ids.length) err(file, `duplicate event in ${group}`);
    for (const id of ids) {
      const e = bundle.events[id];
      if (!e) { if (!partial) err(file, `unknown travel event ${id}`); continue; }
      if (!e.followUpOnly || e.category !== 'travel') err(file, `${id} must be a follow-up travel event`);
      visit(e.requires, fileOf('events', id));
      if (Object.values(e.cast ?? {}).some((c) => c.romantic) && !JSON.stringify(e.requires).includes('"gte":18')) err(file, `${id} must require adult age`);
    }
    if (hasReceipt) {
      const receipt = bundle.events[ids[0]!];
      if (receipt && (receipt.cast || !receipt.autoOutcome)) err(file, `${group} needs a cast-free automatic receipt first`);
      if (!partial && ids.length < 2) err(file, `${group} needs a story after its receipt`);
    }
  }
  return errors;
}
