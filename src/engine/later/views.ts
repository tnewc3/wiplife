/**
 * What the UI needs about later life (L1), read through selectors: your
 * grandchildren and any you are raising, how you are looked after near the
 * end (and who could do it), and, when a death is coming, your final wishes
 * and the people you could ask. Nothing here changes the life.
 */
import type { ContentBundle, GenderCategory } from '../../content/schemas';
import { HOSPICE_CHOICES, SERVICE_STYLES } from '../../content/schemas';
import { funeralCost } from '../estate/settle';
import { canMoveToAssisted } from '../housing';
import { ageOf } from '../relationships';
import type { CareOption, HospiceChoice, Id, LifeState, RelationshipKind, ServiceStyle } from '../types';
import { careProviders } from './care';
import { grandchildren, raisedGrandchildren, willOutOfDate } from './query';
import { canSetWishes, canSpeak } from './terminal';
import { wholeDollars } from '../finance';

export interface LaterPersonView {
  id: Id;
  name: string;
  kind: RelationshipKind;
  genderCategory: GenderCategory;
  age: number;
  estranged: boolean;
  /** Affection plus trust, 0–200. */
  closeness: number;
}

export interface CareView {
  since: number;
  option: CareOption | null;
  /** Who looks after you (family care). */
  provider: LaterPersonView | null;
  /** Who could look after you now (family care), the likeliest first. */
  family: (LaterPersonView & { returning: boolean })[];
  paidCost: number;
  assistedCost: number;
  canAssisted: boolean;
}

export interface TerminalView {
  since: number;
  years: number;
  hospice: HospiceChoice | null;
  service: ServiceStyle | null;
  speakerId: Id | null;
  letters: Id[];
  visitors: { id: Id; came: boolean }[];
  wishesSet: boolean;
  hospiceOptions: { id: HospiceChoice; cost: number }[];
  serviceOptions: { id: ServiceStyle; funeral: number }[];
  /** Everyone you could ask to be with you, write to, or speak: alive and still in your life. */
  people: (LaterPersonView & { canSpeak: boolean })[];
  maxVisitors: number;
  maxLetters: number;
  canSet: boolean;
}

export interface LaterView {
  grandchildren: LaterPersonView[];
  raising: LaterPersonView[];
  care: CareView | null;
  terminal: TerminalView | null;
  hasWill: boolean;
  willOutOfDate: boolean;
  /** Anything to show: the More entry appears. */
  active: boolean;
}

function personView(state: LifeState, id: Id): LaterPersonView {
  const person = state.people[id]!;
  const rel = state.relationships[id]!;
  return {
    id,
    name: `${person.name.first} ${person.name.last}`,
    kind: rel.kind,
    genderCategory: person.identity.genderCategory,
    age: ageOf(state, person),
    estranged: rel.status === 'estranged',
    closeness: rel.affection + rel.trust,
  };
}

export function getLaterView(state: LifeState, content: ContentBundle): LaterView {
  const kids = grandchildren(state).map((p) => personView(state, p.id));
  const raising = raisedGrandchildren(state).map((p) => personView(state, p.id));
  const c = state.later.care;
  const care: CareView | null =
    c === null
      ? null
      : {
          since: c.since,
          option: c.option,
          provider: c.providerId !== undefined && state.people[c.providerId] && state.relationships[c.providerId] ? personView(state, c.providerId) : null,
          family: careProviders(state, content).map((p) => ({ ...personView(state, p.id), returning: p.returning })),
          paidCost: wholeDollars(content.balance.later.care.cost.paid * (content.cities[state.character.cityId]?.costOfLiving ?? 1)),
          assistedCost: wholeDollars(content.balance.later.care.cost.assisted * (content.cities[state.character.cityId]?.costOfLiving ?? 1)),
          canAssisted: canMoveToAssisted(state, content) || state.housing.assisted !== undefined,
        };
  const t = state.later.terminal;
  const b = content.balance.later.terminal;
  const city = content.cities[state.character.cityId]?.costOfLiving ?? 1;
  const terminal: TerminalView | null =
    t === null
      ? null
      : {
          since: t.since,
          years: state.currentYear - t.since,
          hospice: t.hospice,
          service: t.service,
          speakerId: t.speakerId ?? null,
          letters: t.letters,
          visitors: t.visits,
          wishesSet: t.wishesYear !== undefined,
          hospiceOptions: HOSPICE_CHOICES.map((id) => ({ id, cost: wholeDollars(b.hospice[id].cost * city) })),
          serviceOptions: SERVICE_STYLES.map((id) => ({ id, funeral: funeralCost({ ...state, later: { ...state.later, terminal: { ...t, service: id } } }, content) })),
          people: Object.keys(state.relationships)
            .sort((x, y) => x.localeCompare(y, 'en', { numeric: true }))
            .filter((id) => state.people[id]?.alive && state.relationships[id]!.status !== 'ended')
            .map((id) => ({ ...personView(state, id), canSpeak: canSpeak(state, id, content) }))
            .sort((x, y) => y.closeness - x.closeness),
          maxVisitors: b.maxVisitors,
          maxLetters: b.maxLetters,
          canSet: canSetWishes(state),
        };
  return {
    grandchildren: kids,
    raising,
    care,
    terminal,
    hasWill: state.will !== null,
    willOutOfDate: willOutOfDate(state),
    active: kids.length > 0 || raising.length > 0 || care !== null || terminal !== null,
  };
}
