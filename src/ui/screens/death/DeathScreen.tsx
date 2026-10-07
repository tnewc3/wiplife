import { useAppStore } from '../../../store/appStore';
import type { DeathView } from '../../../engine/selectors';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Obituary } from '../../components/Obituary';
import { Screen } from '../../components/Screen';
import { ESTATE_RELATION_LABELS, estateHomeLine, money } from '../../labels';

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'font-semibold' : ''}`}>
      <dt className="min-w-0 break-words">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

/** How the estate was settled: costs and debts first, then each share (E2b). */
function EstateCard({ view }: { view: DeathView }) {
  const home = estateHomeLine(view.home, view.homeValue, view.mortgagePaid);
  return (
    <Card role="region" aria-labelledby="estate-title" data-testid="death-estate">
      <h2 id="estate-title" className="text-lg font-bold">
        The estate
      </h2>
      <p className="mt-1 text-sm text-muted">{view.source === 'will' ? 'Settled by the will.' : 'There was no will, so the default shares applied.'}</p>
      <dl className="mt-2 flex flex-col" aria-label="Costs and debts">
        {view.costs > 0 && <Row label="Funeral and settlement costs" value={money(-view.costs)} />}
        {view.debtsPaid > 0 && <Row label="Debts paid first" value={money(-view.debtsPaid)} />}
        {view.tax > 0 && <Row label="Estate tax" value={money(-view.tax)} />}
        {view.saleCosts > 0 && <Row label="Selling costs" value={money(-view.saleCosts)} />}
        {view.writtenOff > 0 && <Row label="Debts the estate couldn’t pay (not passed on)" value={money(view.writtenOff)} />}
      </dl>
      {home && <p className="mt-1 text-sm">{home}</p>}
      {view.possessionSales > 0 && (
        <p className="mt-1 text-sm" data-testid="estate-possession-sales">
          A vehicle or vacation home nobody could take was sold, and {money(view.possessionSales)} went into the estate.
        </p>
      )}
      {view.possessions.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="Pets, vehicles and homes that passed on" data-testid="estate-possessions">
          {view.possessions.map((p) => (
            <li key={`${p.what}-${p.to}`}>
              {p.what} went to {p.to}
              {p.loan > 0 ? `, with ${money(p.loan)} still owed on it` : ''}.
            </li>
          ))}
        </ul>
      )}
      {view.lines.length === 0 ? (
        <p className="mt-2 font-semibold" data-testid="estate-nothing">
          {view.netEstate > 0 || view.unclaimed > 0 ? 'No one was left to inherit.' : 'Nothing was left to pass on.'}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Who received what">
          {view.lines.map((l) => (
            <li key={`${l.relation}-${l.name}`} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold break-words [overflow-wrap:anywhere]">{l.name}</span>
                <span className="block text-sm text-muted">
                  {ESTATE_RELATION_LABELS[l.relation]} · {l.percent}%
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {money(l.cash)}
                {l.home && <span className="block text-sm text-muted">and the home</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Shown when the character dies: the obituary, the estate being settled, and (E2b) who carries on. */
export function DeathScreen() {
  const entry = useAppStore((s) => s.lastDeath);
  const view = useAppStore((s) => s.deathView);
  const waiting = useAppStore((s) => s.deadLife !== null);
  const busy = useAppStore((s) => s.aging);
  const chooseHeir = useAppStore((s) => s.chooseHeir);
  const leave = useAppStore((s) => s.leaveDeath);

  return (
    <Screen
      footer={
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button size="lg" block disabled={busy} variant={waiting ? 'secondary' : 'primary'} onClick={() => void leave('newLife')} data-testid="death-new-life">
            Start a new life
          </Button>
          <Button variant="secondary" block disabled={busy} onClick={() => void leave('archive')}>
            Open the archive
          </Button>
          <Button variant="ghost" block disabled={busy} onClick={() => void leave('title')}>
            Back to title
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">In memoriam</p>
        {entry ? (
          <>
            <Obituary life={entry} headingLevel={1} />
            {view && <EstateCard view={view} />}
            {waiting && view && view.heirs.length > 0 ? (
              <Card role="region" aria-labelledby="heir-title" data-testid="death-heirs">
                <h2 id="heir-title" className="text-lg font-bold">
                  Who carries on?
                </h2>
                <p className="mt-1 text-sm text-muted">Continue as one of your children, at whatever age they are, or start a new life.</p>
                <ul className="mt-3 flex flex-col gap-3" aria-label="Your children">
                  {view.heirs.map((h) => (
                    <li key={h.id}>
                      <Button block variant="secondary" disabled={busy} onClick={() => void chooseHeir(h.id)} data-testid={`heir-${h.id}`} className="h-auto flex-col items-start gap-0.5 py-3 text-left">
                        <span className="w-full break-words [overflow-wrap:anywhere]">Continue as {h.name}</span>
                        <span className="text-sm font-normal text-muted">
                          {h.age === 0 ? 'Newborn' : `${h.age} years old`}
                          {h.minor ? ' · will live with a guardian' : ''}
                        </span>
                        <span className="text-sm font-normal text-muted">
                          {h.trust > 0
                            ? `${money(h.trust)} held in trust until 18`
                            : h.cash > 0 || h.home
                              ? `Inherits ${h.cash > 0 ? money(h.cash) : ''}${h.cash > 0 && h.home ? ' and ' : ''}${h.home ? `the home (${money(h.home.value)})` : ''}`
                              : 'Inherits nothing'}
                        </span>
                        {h.possessions.length > 0 && <span className="text-sm font-normal text-muted">And {h.possessions.join(', ')}</span>}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-center text-sm text-muted">This life has been saved to your archive.</p>
            )}
          </>
        ) : (
          <h1 className="text-center text-2xl font-bold">This life has ended.</h1>
        )}
      </div>
    </Screen>
  );
}
