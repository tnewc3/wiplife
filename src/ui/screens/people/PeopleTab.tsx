import { content } from '../../../content';
import { getFindDateView, getPeople, getPortrait, getPets, PEOPLE_GROUPS, type PeopleGroupId, type PersonRow } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { BondBars } from '../../components/BondBars';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CharacterPortrait } from '../../portraits/CharacterPortrait';
import { FIND_DATE_LABELS, money, bondWords, moodPhrase, PEOPLE_GROUP_EMPTY, PEOPLE_GROUP_LABELS, PET_PERSONALITY_LABELS, personLine, petHealthWords, yearsOld } from '../../labels';

/** Groups always shown, even when empty; the others appear once someone is in them. */
const ALWAYS_SHOWN: readonly PeopleGroupId[] = ['family', 'friends'];

function PersonButton({ row, life }: { row: PersonRow; life: LifeState }) {
  const openPerson = useAppStore((s) => s.openPerson);
  return (
    <button
      type="button"
      onClick={() => openPerson(row.id)}
      className="flex min-h-11 w-full min-w-0 items-start gap-3 py-3 text-left active:bg-surface-2"
    >
      <CharacterPortrait portrait={getPortrait(life, row.id, content)} size={48} label={`Portrait of ${row.fullName}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
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
      </span>
    </button>
  );
}

/** B1: "Find a date": a dating app, a friend's set-up or a night out, for single adults who are attracted to someone. */
function FindDateCard({ life }: { life: LifeState }) {
  const view = getFindDateView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  if (!view.shown) return null;
  return (
    <Card role="region" aria-labelledby="find-a-date" data-testid="find-date">
      <h2 id="find-a-date" className="mb-1 text-lg font-bold">
        Find a date
      </h2>
      <p className="mb-3 text-sm text-muted">
        Looking for someone new. Each try this year is a little less likely to turn anyone up ({view.tries} of {view.max} used).
      </p>
      <div className="flex flex-col gap-2">
        {view.options.map((o) => (
          <div key={o.way} className="flex flex-col gap-1">
            <Button variant="secondary" block disabled={busy || o.block !== null} data-testid={`find-date-${o.way}`} onClick={() => void act('find_date', { dateWay: o.way })}>
              {FIND_DATE_LABELS[o.way].label}
              {o.cost > 0 ? ` · ${money(o.cost)}` : ''}
            </Button>
            <p className="text-sm text-muted">{o.block ?? FIND_DATE_LABELS[o.way].blurb}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The People tab: everyone in your life, grouped into family, love, friends and work. */
export function PeopleTab({ life }: { life: LifeState }) {
  const groups = getPeople(life, content);
  const pets = getPets(life, content);
  const openPet = useAppStore((s) => s.openPet);
  return (
    <div className="flex flex-col gap-4">
      <FindDateCard life={life} />
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
                  <PersonButton row={row} life={life} />
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
