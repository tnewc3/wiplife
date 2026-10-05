import { useState } from 'react';
import { content } from '../../../content';
import { getBelongingsView, type AdoptOption, type BelongingsView, type RenovationOption, type VacationOption, type VehicleOption } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import {
  bondWords,
  conditionWords,
  money,
  PET_BLOCK_LABELS,
  PET_PERSONALITY_LABELS,
  petHealthWords,
  RENOVATION_BLOCK_LABELS,
  VACATION_BLOCK_LABELS,
  VEHICLE_BLOCK_LABELS,
  yearsOld,
} from '../../labels';

type Sheeted =
  | { kind: 'adopt'; species?: AdoptOption }
  | { kind: 'vehicle'; option?: VehicleOption; used?: boolean }
  | { kind: 'vacation' }
  | { kind: 'renovate'; site?: string }
  | null;

type Confirming =
  | { kind: 'sell_vehicle'; id: string; name: string; net: number }
  | { kind: 'sell_vacation_home'; id: string; city: string; net: number }
  | { kind: 'vet'; id: string; name: string; cost: number }
  | { kind: 'service'; id: string; name: string; cost: number }
  | { kind: 'insurance_off' }
  | { kind: 'buy_vacation'; option: VacationOption }
  | { kind: 'renovate'; target: string; label: string; option: RenovationOption; cost: number; gain: number }
  | null;

const btn = 'flex min-h-11 w-full min-w-0 flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50';

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="min-w-0 break-words text-muted">{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">{value}</dd>
    </div>
  );
}

/** More → Belongings: everything you own, with its value and condition in words, and what you can buy, sell, care for and renovate. */
export function BelongingsScreen({ life }: { life: LifeState }) {
  const view = getBelongingsView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openPet = useAppStore((s) => s.openPet);
  const setTab = useAppStore((s) => s.setTab);
  const [sheet, setSheet] = useState<Sheeted>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const disabled = busy || !view.canAct;
  const close = () => setSheet(null);

  const confirmation = (() => {
    if (!confirming) return null;
    switch (confirming.kind) {
      case 'sell_vehicle':
        return {
          title: `Sell your ${confirming.name}?`,
          body:
            confirming.net >= 0
              ? `After any loan on it is paid off, ${money(confirming.net)} goes to your savings. You now have ${money(life.finances.savings)}.`
              : `It sells for ${money(-confirming.net)} less than you still owe on it. The rest becomes personal debt.`,
          label: 'Sell it',
        };
      case 'sell_vacation_home':
        return {
          title: `Sell your vacation home in ${confirming.city}?`,
          body:
            confirming.net >= 0
              ? `After selling costs and its mortgage, ${money(confirming.net)} goes to your savings. You now have ${money(life.finances.savings)}.`
              : `It sells for ${money(-confirming.net)} less than you owe on it. The rest becomes personal debt.`,
          label: 'Sell it',
        };
      case 'vet':
        return { title: `Take ${confirming.name} to the vet?`, body: `The visit costs ${money(confirming.cost)}. You have ${money(life.finances.savings)} saved.`, label: 'Go to the vet' };
      case 'service':
        return { title: `Service your ${confirming.name}?`, body: `A full service costs ${money(confirming.cost)}. You have ${money(life.finances.savings)} saved.`, label: 'Service it' };
      case 'insurance_off':
        return { title: 'Cancel your insurance?', body: 'You will pay nothing for it, but any accident, theft or damage comes out of your own pocket.', label: 'Cancel it' };
      case 'buy_vacation':
        return {
          title: `Buy a vacation home in ${confirming.option.city}?`,
          body: `It costs ${money(confirming.option.quote.price)}: ${money(confirming.option.quote.downPayment + confirming.option.quote.closingCosts)} now, from savings of ${money(life.finances.savings)}, and a mortgage of ${money(confirming.option.quote.yearlyPayment)} a year.`,
          label: 'Buy it',
        };
      case 'renovate':
        return {
          title: `${confirming.option.name}?`,
          body: `${confirming.label}: it costs ${money(confirming.cost)} from your savings of ${money(life.finances.savings)}, adds about ${money(confirming.gain)} to the home's value and makes it nicer to live in.`,
          label: 'Do it',
        };
    }
  })();

  const doConfirm = () => {
    const c = confirming;
    setConfirming(null);
    if (!c) return;
    switch (c.kind) {
      case 'sell_vehicle':
        void act('sell_vehicle', { possessionId: c.id });
        break;
      case 'sell_vacation_home':
        void act('sell_vacation_home', { possessionId: c.id });
        break;
      case 'vet':
        void act('vet_visit', { possessionId: c.id });
        break;
      case 'service':
        void act('service_vehicle', { possessionId: c.id });
        break;
      case 'insurance_off':
        void act('set_insurance', { insured: false });
        break;
      case 'buy_vacation':
        close();
        void act('buy_vacation_home', { cityId: c.option.cityId });
        break;
      case 'renovate':
        close();
        void act('renovate', { renovationId: c.option.id, target: c.target });
        break;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="belongings-title" data-testid="belongings-summary">
        <h2 id="belongings-title" className="text-2xl leading-tight font-bold">
          What you own
        </h2>
        {view.empty ? (
          <p className="mt-1 text-muted">Nothing yet beyond what you live in. Pets, cars and a place to get away to all start here.</p>
        ) : (
          <dl className="mt-2 flex flex-col" aria-label="What your belongings cost">
            {view.worth > 0 && <Line label="Vehicles and vacation homes are worth" value={money(view.worth)} />}
            <Line label="Upkeep each year" value={money(view.upkeep)} />
            <Line label="Insurance each year" value={money(view.insurance)} />
          </dl>
        )}
        {view.recentClaims > 0 && <p className="mt-1 text-sm text-muted">You made {view.recentClaims === 1 ? 'an insurance claim' : `${view.recentClaims} insurance claims`} recently, which raises what you pay.</p>}
        {view.hasInsurable && (
          <Button
            variant="secondary"
            block
            className="mt-3"
            disabled={disabled}
            data-testid="insurance-toggle"
            onClick={() => (view.allInsured ? setConfirming({ kind: 'insurance_off' }) : void act('set_insurance', { insured: true }))}
          >
            {view.allInsured ? 'Cancel your insurance' : 'Insure everything again'}
          </Button>
        )}
      </Card>

      <PetsCard view={view} disabled={disabled} onOpenPet={(id) => { setTab('people'); openPet(id); }} onAdopt={() => setSheet({ kind: 'adopt' })} onVet={(p) => setConfirming({ kind: 'vet', id: p.id, name: p.name, cost: p.vetCost })} />

      <Card role="region" aria-labelledby="vehicles-title" data-testid="belongings-vehicles">
        <h3 id="vehicles-title" className="text-lg font-bold">
          Vehicles
        </h3>
        {view.vehicles.length === 0 ? (
          <p className="mt-1 text-muted">You don’t own a vehicle. Some jobs need one, and how much depends on the city.</p>
        ) : (
          <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Your vehicles">
            {view.vehicles.map((v) => (
              <li key={v.id} className="flex min-w-0 flex-col gap-1 py-3" data-testid={`vehicle-${v.id}`}>
                <span className="flex justify-between gap-3 font-semibold">
                  <span className="min-w-0 break-words capitalize">{v.name}</span>
                  <span className="shrink-0 tabular-nums">{money(v.value)}</span>
                </span>
                <span className="text-sm text-muted">
                  {conditionWords(v.condition)} · {v.age === 0 ? 'new' : yearsOld(v.age)} · {v.insured ? `insured, ${money(v.premium)} a year` : 'not insured'}
                </span>
                {v.owed > 0 && <span className="text-sm text-muted">You still owe {money(v.owed)} on the car loan.</span>}
                <span className="mt-1 flex gap-2">
                  <Button variant="secondary" className="flex-1" disabled={disabled || !v.canService} data-testid={`service-${v.id}`} onClick={() => setConfirming({ kind: 'service', id: v.id, name: v.name, cost: v.serviceCost })}>
                    {v.serviceDone ? 'Serviced' : `Service · ${money(v.serviceCost)}`}
                  </Button>
                  <Button variant="secondary" className="flex-1" disabled={disabled || v.sellBlock !== null} data-testid={`sell-${v.id}`} onClick={() => setConfirming({ kind: 'sell_vehicle', id: v.id, name: v.name, net: v.saleNet })}>
                    Sell
                  </Button>
                </span>
                {v.sellBlock === 'job' && <span className="text-sm text-muted">Your job needs a vehicle here, so it can’t be your last one to sell.</span>}
              </li>
            ))}
          </ul>
        )}
        <Button block className="mt-2" disabled={disabled} data-testid="buy-vehicle" onClick={() => setSheet({ kind: 'vehicle' })}>
          Buy a vehicle
        </Button>
      </Card>

      <Card role="region" aria-labelledby="homes-title" data-testid="belongings-homes">
        <h3 id="homes-title" className="text-lg font-bold">
          Homes
        </h3>
        {view.mainHome ? (
          <div className="mt-1" data-testid="main-home">
            <p className="font-semibold">The home you live in · {money(view.mainHome.value)}</p>
            <p className="text-sm text-muted">{view.mainHome.renovations.length === 0 ? 'No renovations that still count.' : `Renovated: ${view.mainHome.renovations.join(', ')}.`}</p>
          </div>
        ) : (
          <p className="mt-1 text-muted">You don’t own the home you live in, so there is nothing to renovate there.</p>
        )}
        {view.vacationHomes.length > 0 && (
          <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Your vacation homes">
            {view.vacationHomes.map((h) => (
              <li key={h.id} className="flex min-w-0 flex-col gap-1 py-3" data-testid={`vacation-${h.id}`}>
                <span className="flex justify-between gap-3 font-semibold">
                  <span className="min-w-0 break-words">Vacation home in {h.city}</span>
                  <span className="shrink-0 tabular-nums">{money(h.value)}</span>
                </span>
                <span className="text-sm text-muted">
                  {conditionWords(h.condition)} · {h.insured ? 'insured' : 'not insured'}
                  {h.owed > 0 ? ` · mortgage ${money(h.owed)}` : ' · paid off'}
                </span>
                {h.renovations.length > 0 && <span className="text-sm text-muted">Renovated: {h.renovations.join(', ')}.</span>}
                <Button variant="secondary" block className="mt-1" disabled={disabled} onClick={() => setConfirming({ kind: 'sell_vacation_home', id: h.id, city: h.city, net: h.saleNet })}>
                  Sell it
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <Button block variant="secondary" disabled={disabled || (!view.mainHome && view.vacationHomes.length === 0)} data-testid="renovate" onClick={() => setSheet({ kind: 'renovate' })}>
            Renovate
          </Button>
          <Button block disabled={disabled} data-testid="buy-vacation" onClick={() => setSheet({ kind: 'vacation' })}>
            Buy a vacation home
          </Button>
        </div>
      </Card>

      <AdoptSheet view={view} sheet={sheet} close={close} act={act} busy={busy} setSheet={setSheet} />
      <VehicleSheet view={view} sheet={sheet} close={close} act={act} busy={busy} setSheet={setSheet} />

      <Sheet open={sheet?.kind === 'vacation'} title="Buy a vacation home" onClose={close}>
        <p className="mb-3 text-muted">A place to get away to, in any city. It has upkeep and insurance, and a mortgage if you need one. You have {money(life.finances.savings)} saved.</p>
        <ul className="flex flex-col gap-2" aria-label="Cities">
          {view.vacationOptions.map((o) => (
            <li key={o.cityId}>
              <button type="button" className={btn} disabled={busy || o.quote.blocked !== null} data-testid={`vacation-city-${o.cityId}`} onClick={() => setConfirming({ kind: 'buy_vacation', option: o })}>
                <span className="flex justify-between gap-3 font-semibold">
                  <span>{o.city}</span>
                  <span className="tabular-nums">{money(o.quote.price)}</span>
                </span>
                <span className="text-sm text-muted">
                  {money(o.quote.downPayment + o.quote.closingCosts)} down, then {money(o.quote.yearlyPayment)} a year
                </span>
                {o.quote.blocked && <span className="text-sm text-muted">{VACATION_BLOCK_LABELS[o.quote.blocked]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet?.kind === 'renovate'} title="Renovate" onClose={close}>
        <p className="mb-3 text-muted">Work done to a home you own raises its value and makes it nicer to live in. You have {money(life.finances.savings)} saved.</p>
        <ul className="flex flex-col gap-2" aria-label="Renovations">
          {view.renovationOptions.map((o) => (
            <li key={o.id} className="flex flex-col gap-1">
              <p className="font-semibold">{o.name}</p>
              <p className="text-sm text-muted">{o.blurb}</p>
              {o.sites.length === 0 ? (
                <p className="text-sm text-muted">{RENOVATION_BLOCK_LABELS.nowhere}</p>
              ) : (
                o.sites.map((s) => (
                  <button
                    key={s.target}
                    type="button"
                    className={btn}
                    disabled={busy || s.blocked !== null}
                    data-testid={`renovate-${o.id}-${s.target}`}
                    onClick={() => setConfirming({ kind: 'renovate', target: s.target, label: s.label, option: o, cost: s.cost, gain: s.gain })}
                  >
                    <span className="flex justify-between gap-3 font-semibold">
                      <span>{s.label}</span>
                      <span className="tabular-nums">{money(s.cost)}</span>
                    </span>
                    <span className="text-sm text-muted">{s.blocked ? RENOVATION_BLOCK_LABELS[s.blocked] : `Adds about ${money(s.gain)} in value`}</span>
                  </button>
                ))
              )}
            </li>
          ))}
        </ul>
      </Sheet>

      <ConfirmSheet open={confirmation !== null} title={confirmation?.title ?? ''} body={confirmation?.body ?? ''} confirmLabel={confirmation?.label ?? ''} busy={busy} onCancel={() => setConfirming(null)} onConfirm={doConfirm} />
    </div>
  );
}

function PetsCard({
  view,
  disabled,
  onAdopt,
  onVet,
  onOpenPet,
}: {
  view: BelongingsView;
  disabled: boolean;
  onAdopt: () => void;
  onVet: (p: BelongingsView['pets'][number]) => void;
  onOpenPet: (id: string) => void;
}) {
  return (
    <Card role="region" aria-labelledby="pets-title" data-testid="belongings-pets">
      <h3 id="pets-title" className="text-lg font-bold">
        Pets
      </h3>
      {view.pets.length === 0 ? (
        <p className="mt-1 text-muted">{view.canAdopt ? 'No pets right now.' : 'You’re too young to take a pet in yourself.'}</p>
      ) : (
        <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Your pets">
          {view.pets.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-col gap-1 py-3" data-testid={`pet-${p.id}`}>
              <span className="font-semibold break-words [overflow-wrap:anywhere]">
                {p.name} the {p.species}
              </span>
              <span className="text-sm text-muted">
                {PET_PERSONALITY_LABELS[p.personality]} · {yearsOld(p.age)} · {petHealthWords(p.health, p.ill)} · {bondWords(p.bond)}
              </span>
              <span className="mt-1 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => onOpenPet(p.id)} data-testid={`open-pet-${p.id}`}>
                  Spend time
                </Button>
                <Button variant="secondary" className="flex-1" disabled={disabled || !p.canVet} data-testid={`vet-${p.id}`} onClick={() => onVet(p)}>
                  {p.vetDone ? 'Seen this year' : `Vet · ${money(p.vetCost)}`}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button block className="mt-2" disabled={disabled || !view.canAdopt} data-testid="adopt-pet" onClick={onAdopt}>
        Adopt or buy a pet
      </Button>
    </Card>
  );
}

function AdoptSheet({ view, sheet, close, act, busy, setSheet }: { view: BelongingsView; sheet: Sheeted; close: () => void; act: ReturnType<typeof useAppStore.getState>['takeLifeAction']; busy: boolean; setSheet: (s: Sheeted) => void }) {
  const [name, setName] = useState('');
  const species = sheet?.kind === 'adopt' ? sheet.species : undefined;
  const clean = name.trim();
  const nameOk = /^[\p{L}][\p{L}' -]{0,19}$/u.test(clean);
  return (
    <Sheet
      open={sheet?.kind === 'adopt'}
      title={species ? `A ${species.name}` : 'Adopt or buy a pet'}
      onClose={() => {
        setName('');
        close();
      }}
      footer={species ? <Button variant="secondary" block onClick={() => setSheet({ kind: 'adopt' })}>Back</Button> : undefined}
    >
      {!species ? (
        <ul className="flex flex-col gap-2" aria-label="Kinds of pet">
          {view.adopt.map((o) => (
            <li key={o.id}>
              <button type="button" className={btn} data-testid={`species-${o.id}`} onClick={() => setSheet({ kind: 'adopt', species: o })}>
                <span className="font-semibold capitalize">{o.name}</span>
                <span className="text-sm text-muted">{o.blurb}</span>
                <span className="text-sm text-muted">
                  About {money(o.yearlyCost)} a year · lives {o.lifespan.min === o.lifespan.max ? `${o.lifespan.min}` : `${o.lifespan.min}–${o.lifespan.max}`} years
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted">{species.blurb}</p>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Its name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              data-testid="pet-name"
              className="min-h-11 rounded-xl border border-border bg-bg px-3"
              autoComplete="off"
            />
          </label>
          {(['shelter', 'breeder'] as const).map((source) => {
            const o = species[source];
            return (
              <Button
                key={source}
                block
                variant={source === 'shelter' ? 'primary' : 'secondary'}
                disabled={busy || !nameOk || o.block !== null}
                data-testid={`adopt-${source}`}
                onClick={() => {
                  close();
                  setName('');
                  void act('adopt_pet', { defId: species.id, source, name: clean });
                }}
              >
                {source === 'shelter' ? 'Adopt from a shelter' : 'Buy from a breeder'} · {money(o.price)}
              </Button>
            );
          })}
          {species.shelter.block && <p className="text-sm text-muted">{PET_BLOCK_LABELS[species.shelter.block]}</p>}
          {!nameOk && clean.length > 0 && <p className="text-sm text-muted">A name is letters, spaces, hyphens and apostrophes.</p>}
        </div>
      )}
    </Sheet>
  );
}

function VehicleSheet({ view, sheet, close, act, busy, setSheet }: { view: BelongingsView; sheet: Sheeted; close: () => void; act: ReturnType<typeof useAppStore.getState>['takeLifeAction']; busy: boolean; setSheet: (s: Sheeted) => void }) {
  const option = sheet?.kind === 'vehicle' ? sheet.option : undefined;
  const used = sheet?.kind === 'vehicle' ? sheet.used === true : false;
  const quote = option ? (used ? option.usedQuote : option.newQuote) : null;
  return (
    <Sheet
      open={sheet?.kind === 'vehicle'}
      title={option ? `A ${used ? 'used ' : 'new '}${option.name}` : 'Buy a vehicle'}
      onClose={close}
      footer={option ? <Button variant="secondary" block onClick={() => setSheet({ kind: 'vehicle' })}>Back</Button> : undefined}
    >
      {!option ? (
        <ul className="flex flex-col gap-2" aria-label="Vehicles">
          {view.vehicleOptions.map((o) => (
            <li key={o.id} className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold capitalize">{o.name}</p>
              <p className="text-sm text-muted">
                {o.blurb} About {money(o.upkeep)} a year to run.
              </p>
              <span className="flex gap-2">
                <Button variant="secondary" className="flex-1" data-testid={`vehicle-new-${o.id}`} onClick={() => setSheet({ kind: 'vehicle', option: o, used: false })}>
                  New · {money(o.newQuote.price)}
                </Button>
                {o.usedQuote && (
                  <Button variant="secondary" className="flex-1" data-testid={`vehicle-used-${o.id}`} onClick={() => setSheet({ kind: 'vehicle', option: o, used: true })}>
                    Used · {money(o.usedQuote.price)}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : quote ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            {option.blurb} {used ? 'Used: its age and condition are a surprise.' : 'Brand new.'} Fees come to {money(quote.fees)}. You have {money(view.savings)} saved.
          </p>
          <Button
            block
            disabled={busy || quote.cashBlock !== null}
            data-testid="buy-cash"
            onClick={() => {
              close();
              void act('buy_vehicle', { defId: option.id, used, loan: false });
            }}
          >
            Pay cash · {money(quote.cash)}
          </Button>
          {quote.cashBlock && <p className="text-sm text-muted">{VEHICLE_BLOCK_LABELS[quote.cashBlock]}</p>}
          <Button
            block
            variant="secondary"
            disabled={busy || quote.loan.block !== null}
            data-testid="buy-loan"
            onClick={() => {
              close();
              void act('buy_vehicle', { defId: option.id, used, loan: true });
            }}
          >
            Car loan · {money(quote.loan.down)} now, {money(quote.loan.yearlyPayment)} a year for {quote.loan.termYears} years
          </Button>
          {quote.loan.block && <p className="text-sm text-muted">{VEHICLE_BLOCK_LABELS[quote.loan.block]}</p>}
        </div>
      ) : null}
    </Sheet>
  );
}
