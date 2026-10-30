import { Skull } from 'lucide-react';
import { content } from '../../../content';
import { getFindDateView, getGroupTimeView, getPeople, getPets, getPortrait, getCharacterSummary, type PersonRow } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CollapsibleGroup } from '../../components/CollapsibleGroup';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { Sheet } from '../../components/Sheet';
import { CharacterPortrait } from '../../portraits/CharacterPortrait';
import {
  FIND_DATE_LABELS,
  GROUP_TIME_LABELS,
  money,
  moodPhrase,
  OUTCOME_TIER_LABELS,
  PEOPLE_SECTION_EMPTY,
  PEOPLE_SECTION_LABELS,
  type PeopleSectionId,
  PET_PERSONALITY_LABELS,
  personLine,
  petHealthWords,
  romanceLine,
  yearsOld,
  yearsSince,
} from '../../labels';

/** Sections always shown, even when empty; the others appear once someone is in them. */
const ALWAYS_SHOWN: readonly PeopleSectionId[] = ['friends'];

/** The living, split into the sections of the People tab; everyone who has died goes under "Late relationships". */
function sectionsOf(groups: ReturnType<typeof getPeople>): { living: Record<Exclude<PeopleSectionId, 'late' | 'pets'>, PersonRow[]>; late: PersonRow[] } {
  const living: Record<Exclude<PeopleSectionId, 'late' | 'pets'>, PersonRow[]> = { love: [], parents: [], siblings: [], family: [], children: [], grandchildren: [], friends: [], school: [], work: [] };
  const late: PersonRow[] = [];
  const place = (row: PersonRow, section: Exclude<PeopleSectionId, 'late' | 'pets'>) => (row.alive ? living[section].push(row) : late.push(row));
  for (const row of groups.romance) place(row, 'love');
  for (const row of groups.family) place(row, row.kind === 'parent' || row.kind === 'stepparent' ? 'parents' : row.kind === 'sibling' ? 'siblings' : 'family');
  for (const row of groups.children) place(row, 'children');
  for (const row of groups.grandchildren) place(row, 'grandchildren');
  for (const row of groups.friends) place(row, 'friends');
  for (const row of groups.school) place(row, 'school');
  for (const row of groups.work) place(row, 'work');
  return { living, late };
}

/** One person as a 56px row (U2): a portrait, the name and who they are to you, how they feel about you as a bar, and a chevron to their page. */
function PersonRowItem({ row, life }: { row: PersonRow; life: LifeState }) {
  const openPerson = useAppStore((s) => s.openPerson);
  const diedAgo = row.deathYear !== undefined ? yearsSince(life.currentYear - row.deathYear) : null;
  const line = row.alive ? `${personLine(row)}${row.mood ? ` · ${moodPhrase(row.mood)}` : ''}` : `${personLine(row)}${diedAgo ? ` · Died ${diedAgo}` : ''}`;
  return (
    <ListRow
      lead={
        <span className="relative shrink-0">
          <CharacterPortrait portrait={getPortrait(life, row.id, content)} size={40} label={`Portrait of ${row.fullName}`} />
          {!row.alive && (
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-surface-2 text-muted" data-testid="memorial-icon" aria-hidden="true">
              <Skull size={12} />
            </span>
          )}
        </span>
      }
      title={row.fullName}
      subtitle={line}
      value={row.alive ? <MiniBar label={`How ${row.fullName} feels about you`} value={row.affection} /> : undefined}
      ending="chevron"
      muted={!row.alive}
      onClick={() => openPerson(row.id)}
    />
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

/** The results of "Spend time with everyone": one row per person, with how it went. */
function GroupTimeSheet() {
  const rows = useAppStore((s) => s.groupTime);
  const close = useAppStore((s) => s.closeGroupTime);
  return (
    <Sheet open={rows !== null} title={GROUP_TIME_LABELS.resultTitle} onClose={close} footer={<Button block onClick={close}>Done</Button>}>
      <ul className="flex flex-col divide-y divide-border" aria-label={GROUP_TIME_LABELS.resultTitle} data-testid="group-time-results">
        {rows?.map((r) => (
          <li key={r.personId} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0 break-words font-semibold">{r.name}</span>
            <span className={`shrink-0 text-sm font-bold ${r.affection < 0 ? 'text-negative' : r.affection > 0 ? 'text-positive' : 'text-muted'}`}>{OUTCOME_TIER_LABELS[r.tier]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">{GROUP_TIME_LABELS.diminishing}</p>
    </Sheet>
  );
}

/**
 * The People tab (U2): only people. Love, Parents, Siblings, other family, Children, Friends, School, Work and Pets, then "Late
 * relationships" (everyone who has died, with a memorial icon), each a collapsible group that remembers whether it is open.
 * A row is a portrait, the name, who they are to you and a bar for how they feel about you. Groups and faith are under
 * Activities now. "Spend time with everyone" at the bottom is a group interaction: it spends time with each person who can,
 * and every repeat in a year returns less.
 */
export function PeopleTab({ life }: { life: LifeState }) {
  const groups = getPeople(life, content);
  const { living, late } = sectionsOf(groups);
  const pets = getPets(life, content);
  const openPet = useAppStore((s) => s.openPet);
  const busy = useAppStore((s) => s.aging);
  const spend = useAppStore((s) => s.spendTimeWithEveryone);
  const openFamily = useAppStore((s) => s.openFamily);
  const group = getGroupTimeView(life, content);
  const summary = getCharacterSummary(life, content);
  const love = romanceLine(summary.romance.status, summary.romance.partnerName);
  const order = Object.keys(living) as Exclude<PeopleSectionId, 'late' | 'pets'>[];
  return (
    <div className="flex flex-col gap-3">
      {love && (
        <p className="font-semibold break-words" data-testid="romance-line">
          {love}
        </p>
      )}
      <FindDateCard life={life} />
      {order
        .filter((id) => living[id].length > 0 || ALWAYS_SHOWN.includes(id))
        .map((id) => (
          <CollapsibleGroup key={id} id={`people.${id}`} title={PEOPLE_SECTION_LABELS[id]} count={living[id].length} testId={`people-${id}`}>
            {living[id].length === 0 ? (
              <p className="px-1 text-sm text-muted">{PEOPLE_SECTION_EMPTY[id]}</p>
            ) : (
              <RowList label={PEOPLE_SECTION_LABELS[id]}>
                {living[id].map((row) => (
                  <PersonRowItem key={row.id} row={row} life={life} />
                ))}
              </RowList>
            )}
          </CollapsibleGroup>
        ))}
      {pets.length > 0 && (
        <CollapsibleGroup id="people.pets" title={PEOPLE_SECTION_LABELS.pets} count={pets.length} testId="people-pets">
          <RowList label={PEOPLE_SECTION_LABELS.pets}>
            {pets.map((p) => (
              <ListRow
                key={p.id}
                title={`${p.name} the ${p.species}`}
                subtitle={`${PET_PERSONALITY_LABELS[p.personality]} · ${yearsOld(p.age)} · ${petHealthWords(p.health, p.ill)}`}
                value={<MiniBar label={`How close ${p.name} is to you`} value={p.bond} />}
                ending="chevron"
                onClick={() => openPet(p.id)}
                testId={`pet-row-${p.id}`}
              />
            ))}
          </RowList>
        </CollapsibleGroup>
      )}
      {late.length > 0 && (
        <CollapsibleGroup id="people.late" title={PEOPLE_SECTION_LABELS.late} count={late.length} defaultOpen={false} testId="people-late">
          <RowList label={PEOPLE_SECTION_LABELS.late}>
            {late.map((row) => (
              <PersonRowItem key={row.id} row={row} life={life} />
            ))}
          </RowList>
        </CollapsibleGroup>
      )}
      <RowList label="Your family">
        <ListRow title="Family" subtitle={GROUP_TIME_LABELS.familyBlurb} ending="chevron" onClick={openFamily} testId="people-family-planning" />
      </RowList>
      <div className="flex flex-col gap-1">
        <Button size="lg" block disabled={busy || !group.available} onClick={() => void spend()} data-testid="spend-time-everyone">
          {GROUP_TIME_LABELS.button}
        </Button>
        <p className="text-center text-sm text-muted">{group.available ? GROUP_TIME_LABELS.hint(group.people.length) : GROUP_TIME_LABELS.none}</p>
      </div>
      <GroupTimeSheet />
    </div>
  );
}
