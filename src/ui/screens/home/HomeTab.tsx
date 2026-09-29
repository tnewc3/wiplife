import { content } from '../../../content';
import { getCharacterSummary, getFamily } from '../../../engine/selectors';
import type { LifeState, Stats } from '../../../engine/types';
import { Card } from '../../components/Card';
import { StatBar } from '../../components/StatBar';
import { ageLabel, LIFE_STAGE_LABELS, relativeLabel, STAT_LABELS } from '../../labels';

const HOUSING_LINES: Record<LifeState['housing']['kind'], string> = {
  with_parents: 'Living with family',
  renting: 'Renting',
  owned: 'Homeowner',
  homeless: 'Without a home',
  incarcerated: 'In jail',
};

/** The Life tab: who you are, how you're doing, your family and your story. */
export function HomeTab({ life }: { life: LifeState }) {
  const summary = getCharacterSummary(life, content);
  const family = getFamily(life);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]" data-testid="character-name">
          {summary.fullName}
        </h2>
        <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">
          {ageLabel(summary.age)} · {summary.cityName} · {summary.pronounLabel}
        </p>
        <p className="mt-1 text-sm text-muted">
          {LIFE_STAGE_LABELS[summary.lifeStage]} · {HOUSING_LINES[summary.housing]}
        </p>
      </Card>

      <Card>
        <h3 className="sr-only">Stats</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3" aria-label="Stats" role="group">
          {(Object.keys(STAT_LABELS) as (keyof Stats)[]).map((key) => (
            <StatBar key={key} label={STAT_LABELS[key]} value={life.character.stats[key]} />
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">Family</h3>
        {family.length === 0 ? (
          <p className="text-muted">No family.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" aria-label="Family">
            {family.map((member) => (
              <li key={member.person.id} className="flex min-w-0 flex-col py-2">
                <span className="font-semibold break-words [overflow-wrap:anywhere]">
                  {member.person.name.first} {member.person.name.last}
                </span>
                <span className="text-sm text-muted">
                  {relativeLabel(member)} · {ageLabel(member.age)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">Your story</h3>
        <p className="text-muted">Your story starts here.</p>
      </Card>
    </div>
  );
}
