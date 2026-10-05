import { content } from '../../../content';
import { getPeople, getPets, PEOPLE_GROUPS, type PeopleGroupId, type PersonRow } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { BondBars } from '../../components/BondBars';
import { Card } from '../../components/Card';
import { bondWords, moodPhrase, PEOPLE_GROUP_EMPTY, PEOPLE_GROUP_LABELS, PET_PERSONALITY_LABELS, personLine, petHealthWords, yearsOld } from '../../labels';

/** Groups always shown, even when empty; the others appear once someone is in them. */
const ALWAYS_SHOWN: readonly PeopleGroupId[] = ['family', 'friends'];

function PersonButton({ row }: { row: PersonRow }) {
  const openPerson = useAppStore((s) => s.openPerson);
  return (
    <button
      type="button"
      onClick={() => openPerson(row.id)}
      className="flex min-h-11 w-full min-w-0 flex-col gap-2 py-3 text-left active:bg-surface-2"
    >
      <span className="flex min-w-0 flex-col">
        <span className={`font-semibold break-words [overflow-wrap:anywhere] ${row.alive ? '' : 'text-muted'}`}>{row.fullName}</span>
        <span className="text-sm text-muted">{personLine(row)}</span>
        {row.mood && (
          <span className="text-sm font-medium" data-testid="person-row-mood">
            {moodPhrase(row.mood)}
          </span>
        )}
      </span>
      {row.alive && <BondBars affection={row.affection} trust={row.trust} label={`How ${row.fullName} feels about you`} />}
    </button>
  );
}

/** The People tab: everyone in your life, grouped into family, love, friends and work. */
export function PeopleTab({ life }: { life: LifeState }) {
  const groups = getPeople(life, content);
  const pets = getPets(life, content);
  const openPet = useAppStore((s) => s.openPet);
  return (
    <div className="flex flex-col gap-4">
      {PEOPLE_GROUPS.filter((g) => groups[g].length > 0 || ALWAYS_SHOWN.includes(g)).map((group) => (
        <Card key={group} role="region" aria-labelledby={`people-${group}`}>
          <h2 id={`people-${group}`} className="mb-1 text-lg font-bold">
            {PEOPLE_GROUP_LABELS[group]}
          </h2>
          {groups[group].length === 0 ? (
            <p className="text-muted">{PEOPLE_GROUP_EMPTY[group]}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border" aria-label={PEOPLE_GROUP_LABELS[group]}>
              {groups[group].map((row) => (
                <li key={row.id}>
                  <PersonButton row={row} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      {pets.length > 0 && (
        <Card role="region" aria-labelledby="people-pets" data-testid="people-pets">
          <h2 id="people-pets" className="mb-1 text-lg font-bold">
            Pets
          </h2>
          <ul className="flex flex-col divide-y divide-border" aria-label="Pets">
            {pets.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => openPet(p.id)} data-testid={`pet-row-${p.id}`} className="flex min-h-11 w-full min-w-0 flex-col py-3 text-left active:bg-surface-2">
                  <span className="font-semibold break-words [overflow-wrap:anywhere]">
                    {p.name} the {p.species}
                  </span>
                  <span className="text-sm text-muted">
                    {PET_PERSONALITY_LABELS[p.personality]} · {yearsOld(p.age)} · {petHealthWords(p.health, p.ill)} · {bondWords(p.bond)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
