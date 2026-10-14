import { useState } from 'react';
import { content } from '../../../content';
import type { RouteId, Tier } from '../../../content/schemas';
import { getMigrationView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { APPLICATION_KIND_LABELS, APPLICATION_STATUS_LABELS, BASIS_LABELS, ENTRY_BLOCK_LABELS, MOVE_BLOCK_LABELS, money, approvalLabel, PERMIT_LABELS, REMIT_LABELS, ROUTE_BLURBS, ROUTE_LABELS, STATUS_BLOCK_LABELS, STATUS_LABELS } from '../../labels';

const select = 'mt-2 min-h-11 w-full rounded border border-border bg-surface px-2';
const TIERS: Tier[] = ['community', 'state', 'elite'];

/** More → Move abroad and citizenship (W6). Availability, prices and odds all come from the engine's rules. */
export function MigrationScreen({ life }: { life: LifeState }) {
  const [countryId, setCountry] = useState('');
  const [cityId, setCity] = useState('');
  const [route, setRoute] = useState<RouteId>('work_sponsor');
  const [majorId, setMajor] = useState('');
  const [tier, setTier] = useState<Tier>('state');
  const [confirmEntry, setConfirmEntry] = useState(false);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const view = getMigrationView(life, { countryId: countryId as never, cityId, route, majorId, tier }, content);
  if (!view.adult) return <Card><p>You can think about moving abroad when you are grown.</p></Card>;
  const chosen = view.routes.find((r) => r.route === route) ?? view.routes[0];
  const app = view.application;
  const permit = view.permit;
  return (
    <div className="flex flex-col gap-4" data-testid="migration-screen">
      <Card>
        <h2 className="text-lg font-bold">Where you stand</h2>
        <p data-testid="migration-citizenships">Citizen of {view.citizenships.join(' and ')}</p>
        <p data-testid="migration-status">Living in {view.country} · {STATUS_LABELS[view.status]}</p>
        {permit && permit.type !== 'permanent_resident' && permit.type !== 'undocumented' && <p>{PERMIT_LABELS[permit.type]} until {permit.endYear}</p>}
        {view.undocumented && <p className="mt-1 text-sm">Without papers since {view.undocumented.since}. Regular jobs, loans and licenses are closed to you; informal work pays less. There is a risk each year that you are made to leave{view.undocumented.risk >= 0.08 ? ', and it is higher now' : ''}.</p>}
        {view.removed.map((r) => <p key={r.country} className="mt-1 text-sm">{r.country} will not take an application from you until {r.until}.</p>)}
      </Card>

      {app && (
        <Card>
          <h2 className="text-lg font-bold">Your application</h2>
          <p data-testid="migration-application">{APPLICATION_KIND_LABELS[app.kind]} {app.country}{app.route ? ` · ${ROUTE_LABELS[app.route]}` : ''}{app.basis ? ` · ${BASIS_LABELS[app.basis]}` : ''} · {APPLICATION_STATUS_LABELS[app.status]}</p>
          {app.status === 'pending' && <p className="text-sm">A decision is due in {app.decisionYear}. {approvalLabel(app.odds)}.</p>}
          {app.expiresYear !== null && <p className="text-sm">Use this approval by {app.expiresYear}.</p>}
          {view.canWithdraw && <Button className="mt-3" variant="secondary" block disabled={busy} onClick={() => void act('withdraw_application', {})}>Withdraw the application</Button>}
        </Card>
      )}

      {view.move && (
        <Card>
          <h2 className="text-lg font-bold">Move to {view.move.cityName}</h2>
          <p className="text-sm">Moving costs about {money(view.move.cost)}. Your partner and children who live with you come too; everyone else stays where they are.</p>
          <Button className="mt-3" block disabled={busy || !view.move.can} onClick={() => void act('move_abroad', {})} data-testid="migration-move">Move now</Button>
          {view.move.block && <p className="mt-2 text-sm">{MOVE_BLOCK_LABELS[view.move.block] ?? view.move.block}</p>}
        </Card>
      )}

      {view.permanent && (
        <Card>
          <h2 className="text-lg font-bold">Stay for good</h2>
          <p className="text-sm">Permanent residence has no end date. Cost {money(view.permanent.fee)} · {approvalLabel(view.permanent.odds)}.</p>
          <Button className="mt-3" block disabled={busy || !view.permanent.can} onClick={() => void act('apply_status', { status: { kind: 'permanent' } })} data-testid="migration-permanent">Ask for permanent residence</Button>
          {view.permanent.block && <p className="mt-2 text-sm">{STATUS_BLOCK_LABELS[view.permanent.block]}</p>}
        </Card>
      )}

      {view.citizenship && (
        <Card>
          <h2 className="text-lg font-bold">Citizenship</h2>
          <p className="text-sm">After {view.citizenship.years} years, with enough of the language, a clean record and a test. Cost {money(view.citizenship.fee)}. Holding another citizenship is allowed.</p>
          <Button className="mt-3" block disabled={busy || !view.citizenship.can} onClick={() => void act('apply_status', { status: { kind: 'naturalization' } })} data-testid="migration-citizenship">Apply for citizenship</Button>
          {view.citizenship.block && <p className="mt-2 text-sm">{STATUS_BLOCK_LABELS[view.citizenship.block]}</p>}
        </Card>
      )}

      {view.regular.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">Routes to status</h2>
          <p className="text-sm">None is certain, and applying draws attention to you. A refusal can raise the risk you are made to leave.</p>
          {view.regular.map((r) => (
            <div key={r.basis} className="mt-3">
              <p className="font-medium">{BASIS_LABELS[r.basis]}</p>
              <p className="text-sm">Cost {money(r.fee)} · {approvalLabel(r.odds)}</p>
              <Button className="mt-2" variant="secondary" block disabled={busy || !r.can} onClick={() => void act('apply_status', { status: { kind: 'regularization', basis: r.basis } })}>Apply on this basis</Button>
              {r.block && <p className="mt-1 text-sm">{STATUS_BLOCK_LABELS[r.block]}</p>}
            </div>
          ))}
        </Card>
      )}

      {view.settled && (
        <Card>
          <h2 className="text-lg font-bold">Money sent home</h2>
          <p className="text-sm">{view.remit.relatives > 0 ? 'A share of your income goes to relatives in another country each year, from what is left after housing and living costs.' : 'No relatives of yours live in another country.'}{view.remit.sent > 0 ? ` Sent so far: ${money(view.remit.sent)}.` : ''}</p>
          <div className="mt-2 flex gap-2">
            {view.remit.options.map((o) => (
              <Button key={o.id} variant={view.remit.level === o.id ? 'primary' : 'secondary'} disabled={busy || !o.can} onClick={() => void act('set_remittance', { remit: o.id })}>{REMIT_LABELS[o.id]}</Button>
            ))}
          </div>
        </Card>
      )}

      {view.returnCities.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">Go home</h2>
          <p className="text-sm">You can always return to a country whose citizen you are.</p>
          {view.returnCities.slice(0, 4).map((c) => (
            <Button key={c.id} className="mt-2" variant="secondary" block disabled={busy || !view.canReturn(c.id)} onClick={() => void act('return_home', { cityId: c.id })}>Return to {c.name}, {c.country}</Button>
          ))}
        </Card>
      )}

      {!app && view.destinations.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">Move to another country</h2>
          <label className="mt-2 block" htmlFor="mig-country">Country</label>
          <select id="mig-country" className={select} value={view.pick.countryId ?? ''} onChange={(e) => { setCountry(e.target.value); setCity(''); }}>
            {view.destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <label className="mt-3 block" htmlFor="mig-route">Route</label>
          <select id="mig-route" className={select} value={route} onChange={(e) => setRoute(e.target.value as RouteId)}>
            {view.routes.map((r) => <option key={r.route} value={r.route}>{ROUTE_LABELS[r.route]}</option>)}
          </select>
          <label className="mt-3 block" htmlFor="mig-city">City</label>
          <select id="mig-city" className={select} value={view.pick.cityId} onChange={(e) => setCity(e.target.value)}>
            {view.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {route === 'study_work' && (
            <>
              <label className="mt-3 block" htmlFor="mig-major">Program</label>
              <select id="mig-major" className={select} value={view.pick.majorId} onChange={(e) => setMajor(e.target.value)}>
                {view.majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <label className="mt-3 block" htmlFor="mig-tier">Kind of school</label>
              <select id="mig-tier" className={select} value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
                {TIERS.map((t) => <option key={t} value={t}>{content.countries[view.pick.countryId ?? 'us']?.words.tiers[t] ?? t}</option>)}
              </select>
            </>
          )}
          {chosen && (
            <div className="mt-3" data-testid="migration-route">
              <p className="text-sm">{ROUTE_BLURBS[chosen.route]}</p>
              <p className="mt-1 text-sm">Application cost {money(chosen.fee)}{chosen.held > 0 ? ` and ${money(chosen.held)} held until the decision` : ''} · decision in about {chosen.wait} {chosen.wait === 1 ? 'year' : 'years'} · {approvalLabel(chosen.odds)}</p>
              {chosen.route === 'family' && <p className="text-sm">{view.sponsor ? `Sponsor: ${view.sponsor}` : 'No relative of yours there can sponsor you.'}</p>}
              <Button className="mt-3" block disabled={busy || !chosen.can} onClick={() => void act('apply_entry', { entry: chosen.input })} data-testid="migration-apply">Apply</Button>
              {chosen.block && <p className="mt-2 text-sm" data-testid="migration-block">{ENTRY_BLOCK_LABELS[chosen.block] ?? chosen.block}</p>}
            </div>
          )}
          {view.withoutPapers && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="font-medium">Without papers</p>
              <p className="text-sm">You can go without permission to stay. It costs about {money(view.withoutPapers.cost)} and you may be turned back. If you arrive, you cannot hold a regular job, borrow or get licenses, informal work pays less, and each year there is a risk you will be made to leave. You may find help in a community group.</p>
              {!confirmEntry ? (
                <Button className="mt-3" variant="secondary" block disabled={busy || !view.withoutPapers.can} onClick={() => setConfirmEntry(true)} data-testid="migration-without-papers">Think about going without papers</Button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" disabled={busy} onClick={() => { setConfirmEntry(false); void act('move_without_papers', { cityId: view.pick.cityId }); }} data-testid="migration-without-papers-confirm">Go anyway</Button>
                  <Button variant="ghost" onClick={() => setConfirmEntry(false)}>Not now</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
