import { content } from '../../content';
import type { ArchivedLife } from '../../engine/types';
import { lifespanLabel } from '../labels';
import { Card } from './Card';

/** Name, dates and obituary text of an archived life. */
export function Obituary({ life, headingLevel = 2 }: { life: ArchivedLife; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const cityName = (id: string) => content.cities[id]?.name ?? id;
  const city = life.birthCityId === life.cityId ? cityName(life.cityId) : `${cityName(life.birthCityId)} → ${cityName(life.cityId)}`;
  return (
    <Card className="flex flex-col gap-2">
      <Heading className="text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]">{life.name}</Heading>
      <p className="text-muted">
        {lifespanLabel(life.birthYear, life.deathYear)} · {city}
      </p>
      {life.unfinished && (
        <p className="w-fit rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-muted">Unfinished</p>
      )}
      <p className="mt-1 leading-relaxed break-words [overflow-wrap:anywhere]" data-testid="obituary">
        {life.obituary}
      </p>
    </Card>
  );
}
