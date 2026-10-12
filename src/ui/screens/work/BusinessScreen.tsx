import { useState } from 'react';
import { content } from '../../../content';
import { BUSINESS_STYLES, MARKETING_LEVELS, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, type BusinessStyle } from '../../../content/schemas';
import { getBusinessScreen, type BusinessView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { BUSINESS_DECISION_HINTS, BUSINESS_DECISION_LABELS, BUSINESS_END_LABELS, BUSINESS_HOW_LABELS, BUSINESS_ROLE_BLURBS, BUSINESS_ROLE_LABELS, BUSINESS_TITLES, businessStakeLine, money, rateLabel } from '../../labels';
import { MarketSheet } from './MarketSheet';
import { StartBusinessSheet } from './StartBusinessSheet';

const LEVELS = {
  prices: { list: PRICE_LEVELS, labels: content.balance.business.levels.price },
  marketing: { list: MARKETING_LEVELS, labels: content.balance.business.levels.marketing },
  qualityInvest: { list: QUALITY_LEVELS, labels: content.balance.business.levels.quality },
  pay: { list: PAY_LEVELS, labels: content.balance.business.levels.pay },
  staffing: { list: STAFFING_LEVELS, labels: content.balance.business.levels.staffing },
} as const;

function Row({ label, value, strong = false, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'font-semibold' : ''}`}>
      <dt className="min-w-0 break-words">{label}</dt>
      <dd className="shrink-0 tabular-nums" {...(testId ? { 'data-testid': testId } : {})}>
        {value}
      </dd>
    </div>
  );
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-5" aria-label={title} {...(testId ? { 'data-testid': testId } : {})}>
      <h4 className="text-base font-bold">{title}</h4>
      {children}
    </section>
  );
}

function HireSheet({ b, open, onClose }: { b: BusinessView; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [licensed, setLicensed] = useState(false);
  return (
    <Sheet open={open} title="Hire someone" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="hire-sheet">
        <p className="text-sm text-muted">
          {b.staffRoom > 0 ? `You can take on ${b.staffRoom} more named ${b.staffRoom === 1 ? 'person' : 'people'}. Hiring costs ${money(b.hireCost)} up front. Everyone else the place needs is crew, paid the market rate.` : 'You have as many named staff as you can manage.'}
        </p>
        {b.needsLicense && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} className="size-5" data-testid="hire-licensed" />
            <span>Someone with the {b.needsLicense}’s licence</span>
          </label>
        )}
        <Button block disabled={busy || b.staffRoom <= 0} data-testid="hire-new" onClick={() => void act('hire_staff', { biz: { businessId: b.id, licensed } }).then(onClose)}>
          Meet someone new
        </Button>
        <h4 className="font-bold">People you know</h4>
        {b.hireable.filter((h) => !licensed || h.licensed).length === 0 ? (
          <p className="text-sm text-muted">Nobody you know is free to work here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {b.hireable
              .filter((h) => !licensed || h.licensed)
              .map((h) => (
                <li key={h.personId}>
                  <Button variant="secondary" block disabled={busy || b.staffRoom <= 0} data-testid={`hire-${h.personId}`} onClick={() => void act('hire_staff', { biz: { businessId: b.id, personId: h.personId, licensed: licensed && h.licensed } }).then(onClose)}>
                    {h.name}, {h.age}
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function ExpandSheet({ b, life, open, onClose }: { b: BusinessView; life: LifeState; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [cityId, setCityId] = useState(b.cityId);
  const [style, setStyle] = useState<BusinessStyle>(b.style);
  const [funding, setFunding] = useState<'savings' | 'loan'>('savings');
  const cost = b.expandCosts[style];
  const afford = funding === 'loan' || life.finances.savings >= cost;
  return (
    <Sheet open={open} title="Open a new location" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="expand-sheet">
        <label htmlFor="expand-city" className="font-bold">
          City
        </label>
        <select id="expand-city" data-testid="expand-city" value={cityId} onChange={(e) => setCityId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
          {Object.keys(content.cities)
            .sort()
            .map((id) => (
              <option key={id} value={id}>
                {content.cities[id]!.name}
              </option>
            ))}
        </select>
        <div role="radiogroup" aria-label="Style" className="flex flex-col gap-2">
          {BUSINESS_STYLES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)} data-testid={`expand-style-${s}`} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${style === s ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {content.businesses[b.defId]?.styles[s].label ?? s} · {money(b.expandCosts[s])}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Pay with" className="flex gap-2">
          {(['savings', 'loan'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={funding === f} onClick={() => setFunding(f)} data-testid={`expand-funding-${f}`} className={`min-h-11 flex-1 rounded-xl border px-3 ${funding === f ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {f === 'savings' ? 'Your savings' : 'A business loan'}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted" role="status">
          {funding === 'savings' ? (afford ? `${money(cost)} from savings. Savings now: ${money(life.finances.savings)}.` : 'You don’t have enough savings.') : `A loan for ${money(cost)} at the business loan rate, subject to the bank.`}
        </p>
        <Button block disabled={busy || !afford} data-testid="expand-confirm" onClick={() => void act('open_location', { biz: { businessId: b.id, cityId, style, funding } }).then(onClose)}>
          Open it
        </Button>
      </div>
    </Sheet>
  );
}

function BusinessPanel({ b, life }: { b: BusinessView; life: LifeState }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [hire, setHire] = useState(false);
  const [expand, setExpand] = useState(false);
  const [confirm, setConfirm] = useState<'sell' | 'close' | { buyout: string; name: string; price: number } | { fire: string; name: string } | null>(null);
  const r = b.report;
  const between = life.phase === 'yearStart';
  const disabled = busy || !between;
  return (
    <Card data-testid={`business-${b.id}`} className="mt-3">
      <h3 className="text-lg font-bold break-words [overflow-wrap:anywhere]">{b.name}</h3>
      <p className="text-sm text-muted">
        {b.styleLabel} · {b.kind} · {b.city}
        {b.chain ? ` · ${b.chain}` : ''} · {BUSINESS_HOW_LABELS[b.how]} {b.founded}
      </p>
      <p className="mt-1 text-sm" data-testid={`worth-${b.id}`}>
        Worth about {money(b.value)}. Your share ({b.yourShare}%): {money(b.yourEquity)}.
      </p>
      {b.needsLicense && (
        <p className={`mt-1 text-sm ${b.licensed ? 'text-muted' : 'font-semibold text-danger'}`} data-testid={`license-${b.id}`}>
          {b.licensed ? `Someone here holds the ${b.needsLicense}’s licence.` : `Nobody here holds the ${b.needsLicense}’s licence, so no jobs can be taken.`}
        </p>
      )}

      <Section title={BUSINESS_TITLES.report} testId={`report-${b.id}`}>
        {!r ? (
          <p className="mt-1 text-sm text-muted">It hasn’t had a full year yet. Its first report comes when the year turns.</p>
        ) : (
          <>
            <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid={`report-words-${b.id}`}>
              <li>{r.customers}</li>
              <li>{r.money}</li>
              <li>{r.staff}</li>
              <li>{r.quality}</li>
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <dl className="mt-2 flex flex-col" aria-label="The year in numbers">
              <Row label="Customers" value={r.numbers.customers.toLocaleString('en-US')} />
              <Row label="Sales" value={money(r.numbers.revenue)} />
              <Row label="Rent" value={money(-r.numbers.rent)} />
              <Row label="Wages" value={money(-r.numbers.wages)} />
              <Row label="Supplies" value={money(-r.numbers.supplies)} />
              {r.numbers.marketing > 0 && <Row label="Marketing" value={money(-r.numbers.marketing)} />}
              {r.numbers.quality > 0 && <Row label="Quality" value={money(-r.numbers.quality)} />}
              <Row label="Insurance, utilities and the rest" value={money(-r.numbers.other)} />
              <div className="mt-1 border-t border-border pt-1">
                <Row label="Profit" value={money(r.numbers.profit)} strong testId={`profit-${b.id}`} />
              </div>
              {r.numbers.paidOut > 0 && <Row label="Paid out to the owners" value={money(r.numbers.paidOut)} />}
              {r.numbers.draw > 0 && <Row label="Paid to you" value={money(r.numbers.draw)} testId={`draw-${b.id}`} />}
              {r.numbers.injected > 0 && <Row label="You put in to cover the loss" value={money(r.numbers.injected)} testId={`injected-${b.id}`} />}
              {r.numbers.loanPayments > 0 && <Row label="Loan payments (paid with your own money)" value={money(r.numbers.loanPayments)} />}
              <Row label="Cash in the business" value={money(b.cash)} />
            </dl>
          </>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <StatBar label="Reputation" value={b.reputation} />
          <StatBar label="Quality" value={b.quality} />
          <StatBar label="Staff morale" value={b.morale} />
        </div>
      </Section>

      <Section title={BUSINESS_TITLES.decisions} testId={`decisions-${b.id}`}>
        <div className="mt-2 flex flex-col gap-3">
          {(Object.keys(LEVELS) as (keyof typeof LEVELS)[]).map((key) => (
            <div key={key}>
              <p className="text-sm font-semibold">{BUSINESS_DECISION_LABELS[key]}</p>
              <p className="text-xs text-muted">{BUSINESS_DECISION_HINTS[key]}</p>
              <div role="radiogroup" aria-label={BUSINESS_DECISION_LABELS[key]} className="mt-1 flex flex-wrap gap-2">
                {(LEVELS[key].list as readonly string[]).map((level) => {
                  const checked = b.decisions[key] === level;
                  const label = (LEVELS[key].labels as Record<string, { label: string }>)[level]!.label;
                  return (
                    <button key={level} type="button" role="radio" aria-checked={checked} disabled={disabled} data-testid={`decision-${b.id}-${key}-${level}`} onClick={() => void act('set_business_decisions', { biz: { businessId: b.id, decisions: { [key]: level } } })} className={`min-h-11 rounded-xl border px-3 text-sm ${checked ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Who runs it" testId={`role-${b.id}`}>
        <div role="radiogroup" aria-label="Who runs it" className="mt-2 flex flex-col gap-2">
          {(['self', 'manager'] as const).map((role) => (
            <button key={role} type="button" role="radio" aria-checked={b.role === role} disabled={disabled || b.role === role} data-testid={`role-${b.id}-${role}`} onClick={() => void act('set_business_role', { biz: { businessId: b.id, role } })} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${b.role === role ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {BUSINESS_ROLE_LABELS[role]}
              <span className="block text-sm font-normal text-muted">{role === 'manager' && !b.hasManager ? `${BUSINESS_ROLE_BLURBS[role]} Hiring one costs ${money(b.managerHireCost)}.` : BUSINESS_ROLE_BLURBS[role]}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={BUSINESS_TITLES.staff} testId={`staff-${b.id}`}>
        {b.staff.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nobody you know works here yet. Crew fill the shifts at the market wage.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {b.staff.map((s) => (
              <li key={s.personId} className="rounded-xl border border-border p-3" data-testid={`staff-${b.id}-${s.personId}`}>
                <p className="font-semibold break-words">
                  {s.name} <span className="font-normal text-muted">· {s.title}</span>
                </p>
                <p className="text-sm text-muted">
                  {s.mood} · skill {s.skill} · {money(s.wage)} a year{s.location ? ` · ${s.location}` : ''}
                  {s.licensed ? ' · licensed' : ''}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" disabled={disabled} className="flex-1" onClick={() => void act('raise_staff', { biz: { businessId: b.id, personId: s.personId } })} data-testid={`raise-${s.personId}`}>
                    Give a raise
                  </Button>
                  <Button variant="ghost" disabled={disabled} className="flex-1" onClick={() => setConfirm({ fire: s.personId, name: s.name })} data-testid={`fire-${s.personId}`}>
                    Let go
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" block className="mt-2" disabled={disabled} onClick={() => setHire(true)} data-testid={`hire-open-${b.id}`}>
          Hire someone
        </Button>
      </Section>

      <Section title={BUSINESS_TITLES.locations} testId={`locations-${b.id}`}>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {b.locations.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-2 py-1">
              <span className="min-w-0 break-words">
                {l.city} · {l.style} · since {l.opened}
              </span>
              <span className="shrink-0 tabular-nums">{l.profit === null ? '—' : money(l.profit)}</span>
              {b.locations.length > 1 && (
                <Button variant="ghost" disabled={disabled} onClick={() => void act('close_location', { biz: { businessId: b.id, locationId: l.id } })} data-testid={`close-location-${l.id}`}>
                  Close
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button variant="secondary" block className="mt-2" disabled={disabled || !b.canExpand} onClick={() => setExpand(true)} data-testid={`expand-open-${b.id}`}>
          Open a new location
        </Button>
      </Section>

      {b.owners.length > 1 && (
        <Section title={BUSINESS_TITLES.owners} testId={`owners-${b.id}`}>
          <ul className="mt-1 flex flex-col gap-2">
            {b.owners.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 break-words">
                  {o.id === 'you' ? 'You' : o.name} <span className="text-sm text-muted">· {businessStakeLine(o.share, o.role)}</span>
                </span>
                {o.id !== 'you' && (
                  <Button variant="secondary" disabled={disabled || life.finances.savings < o.buyout} onClick={() => setConfirm({ buyout: o.id, name: o.name, price: o.buyout })} data-testid={`buyout-${o.id}`}>
                    Buy out · {money(o.buyout)}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.loans.length > 0 && (
        <Section title={BUSINESS_TITLES.loans} testId={`loans-${b.id}`}>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {b.loans.map((l) => (
              <li key={l.debtId} className="flex justify-between gap-2">
                <span>
                  {money(l.balance)} at {rateLabel(l.rate)}
                </span>
                <span className="text-muted">{money(l.due)} due this year</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">You are personally on the hook for these. They are paid from your own money each year.</p>
        </Section>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="secondary" block disabled={disabled} onClick={() => setConfirm('sell')} data-testid={`sell-${b.id}`}>
          Sell it · about {money(b.salePrice)}
        </Button>
        <Button variant="ghost" block disabled={disabled} onClick={() => setConfirm('close')} data-testid={`close-${b.id}`}>
          Close it
        </Button>
      </div>

      <HireSheet b={b} open={hire} onClose={() => setHire(false)} />
      <ExpandSheet b={b} life={life} open={expand} onClose={() => setExpand(false)} />
      <ConfirmSheet
        open={confirm !== null}
        title={confirm === 'sell' ? `Sell ${b.name}?` : confirm === 'close' ? `Close ${b.name}?` : confirm && 'buyout' in confirm ? `Buy ${confirm.name} out?` : confirm && 'fire' in confirm ? `Let ${confirm.name} go?` : ''}
        confirmLabel={confirm === 'sell' ? 'Sell it' : confirm === 'close' ? 'Close it' : confirm && 'buyout' in confirm ? 'Buy out' : 'Let go'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c === 'sell') void act('sell_business', { biz: { businessId: b.id } });
          else if (c === 'close') void act('close_business', { biz: { businessId: b.id } });
          else if (c && 'buyout' in c) void act('buyout_owner', { biz: { businessId: b.id, ownerId: c.buyout } });
          else if (c && 'fire' in c) void act('fire_staff', { biz: { businessId: b.id, personId: c.fire } });
        }}
        body={
          confirm === 'sell'
            ? `The loans on it are paid off from the price first, and what is left is shared by who owns it. You would get about ${money(b.salePrice)} before that.`
            : confirm === 'close'
              ? 'The equipment and stock are sold off cheaply, the loans come out of that first, and everyone who works there is let go. Anything still owed stays with you.'
              : confirm && 'buyout' in confirm
                ? `It costs ${money(confirm.price)} from your savings. The share becomes yours.`
                : confirm && 'fire' in confirm
                  ? 'They get a little severance. They will remember how you did it.'
                  : ''
        }
      />
    </Card>
  );
}

/**
 * W3: the Business screen from the Work tab: each business's yearly report (in words and numbers), the
 * decisions for the year (prices, marketing, quality, pay, staffing), who runs it, its staff, locations,
 * owners and loans; and the ways in: start one, or buy one that is for sale.
 */
export function BusinessScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getBusinessScreen(life, content);
  const [start, setStart] = useState(false);
  const [market, setMarket] = useState(false);
  const busy = useAppStore((s) => s.aging);
  const between = life.phase === 'yearStart';
  return (
    <>
      <Sheet open={open && !start && !market} title={BUSINESS_TITLES.screen} onClose={onClose}>
        <div data-testid="business-screen">
          {!between && <p className="mt-1 text-sm text-muted">Choices wait until the year is over.</p>}
          {view.blocked === 'age' && <p className="mt-1">You can run a business from {content.balance.business.limits.minAge}.</p>}
          {view.blocked === 'away' && <p className="mt-1">You can’t run a business from where you are.</p>}
          {view.owned.length === 0 && view.blocked === null && <p className="mt-1 text-muted">{BUSINESS_TITLES.none}</p>}
          {view.owned.map((b) => (
            <BusinessPanel key={b.id} b={b} life={life} />
          ))}
          {view.canOwn && (
            <div className="mt-4 flex flex-col gap-2">
              <Button block disabled={busy || !between || view.full} onClick={() => setStart(true)} data-testid="start-open">
                Start a business
              </Button>
              <Button block variant="secondary" disabled={busy || !between || view.full} onClick={() => setMarket(true)} data-testid="market-open">
                See what’s for sale
              </Button>
              {view.full && <p className="text-sm text-muted">You own as many as you can manage.</p>}
            </div>
          )}
          {view.past.length > 0 && (
            <Section title={BUSINESS_TITLES.past} testId="business-past">
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {view.past.map((p) => (
                  <li key={`${p.name}-${p.fromYear}`}>
                    {p.name} · {content.businesses[p.defId]?.noun ?? 'business'} · {p.fromYear}–{p.toYear} · {BUSINESS_END_LABELS[p.end]} · {p.net >= 0 ? 'you came out ahead by' : 'you lost'} {money(Math.abs(p.net))}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </Sheet>
      <StartBusinessSheet life={life} open={open && start} onClose={() => setStart(false)} />
      <MarketSheet life={life} open={open && market} onClose={() => setMarket(false)} />
    </>
  );
}
