import { useState } from 'react';
import { content } from '../../../content';
import { MARKETING_LEVELS, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, TRAINING_LEVELS } from '../../../content/schemas';
import { getBusinessScreen, type BusinessView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { BUSINESS_DECISION_HINTS, BUSINESS_DECISION_LABELS, BUSINESS_END_LABELS, BUSINESS_HOW_LABELS, BUSINESS_ROLE_BLURBS, BUSINESS_ROLE_LABELS, BUSINESS_TABS, BUSINESS_TITLES, ECONOMY_TONES, SUPPLIER_ARROWS, SUPPLIER_MOODS, TRAINING_HINTS, businessStakeLine, money, rateLabel } from '../../labels';
import { FranchiseTab } from './business/FranchiseTab';
import { PlacesTab } from './business/PlacesTab';
import { ProductsTab } from './business/ProductsTab';
import { TeamTab } from './business/TeamTab';
import { MarketSheet } from './MarketSheet';
import { StartBusinessSheet } from './StartBusinessSheet';

const LEVELS = {
  prices: { list: PRICE_LEVELS, labels: content.balance.business.levels.price },
  marketing: { list: MARKETING_LEVELS, labels: content.balance.business.levels.marketing },
  qualityInvest: { list: QUALITY_LEVELS, labels: content.balance.business.levels.quality },
  pay: { list: PAY_LEVELS, labels: content.balance.business.levels.pay },
  staffing: { list: STAFFING_LEVELS, labels: content.balance.business.levels.staffing },
  training: { list: TRAINING_LEVELS, labels: content.balance.business.training },
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

type Tab = keyof typeof BUSINESS_TABS;

function ReportTab({ b, life, disabled }: { b: BusinessView; life: LifeState; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const r = b.report;
  const n = r?.numbers;
  const [confirm, setConfirm] = useState<'sell' | 'close' | { buyout: string; name: string; price: number } | null>(null);
  return (
    <>
      <Section title={BUSINESS_TITLES.decisions} testId={`decisions-${b.id}`}>
        <div className="mt-2 flex flex-col gap-3">
          {(Object.keys(LEVELS) as (keyof typeof LEVELS)[]).map((key) => (
            <div key={key}>
              <p className="text-sm font-semibold">{BUSINESS_DECISION_LABELS[key]}</p>
              <p className="text-xs text-muted">{key === 'training' ? TRAINING_HINTS[b.depth.training.level] : BUSINESS_DECISION_HINTS[key]}</p>
              <div role="radiogroup" aria-label={BUSINESS_DECISION_LABELS[key]} className="mt-1 flex flex-wrap gap-2">
                {(LEVELS[key].list as readonly string[]).map((level) => {
                  const current = key === 'training' ? b.depth.training.level : b.decisions[key];
                  const checked = current === level;
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

      <Section title={BUSINESS_TITLES.report} testId={`report-${b.id}`}>
        {!r || !n ? (
          <p className="mt-1 text-sm text-muted">It hasn’t had a full year yet. Its first report comes when the year turns.</p>
        ) : (
          <>
            <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid={`report-words-${b.id}`}>
              <li>{r.customers}</li>
              <li>{r.money}</li>
              <li>{r.staff}</li>
              <li>{r.quality}</li>
              {r.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <dl className="mt-2 flex flex-col" aria-label="The year in numbers">
              <Row label="Customers" value={n.customers.toLocaleString('en-US')} />
              <Row label="Sales" value={money(n.revenue)} />
              {(n.royalties ?? 0) > 0 && <Row label="Royalties from franchises" value={money(n.royalties ?? 0)} testId={`royalties-${b.id}`} />}
              {(n.support ?? 0) > 0 && <Row label="Support for franchises" value={money(-(n.support ?? 0))} />}
              <Row label="Rent" value={money(-n.rent)} />
              <Row label="Wages" value={money(-n.wages)} />
              <Row label="Supplies" value={money(-n.supplies)} />
              {n.goodsCost !== undefined && (
                <>
                  <Row label="  of which goods sold" value={money(-n.goodsCost)} testId={`goods-${b.id}`} />
                  <Row label="  of which spoiled or wasted" value={money(-(n.waste ?? 0))} testId={`waste-${b.id}`} />
                  <Row label="Sales lost to empty shelves" value={money(n.lostSales ?? 0)} testId={`lost-${b.id}`} />
                </>
              )}
              {(n.hiring ?? 0) > 0 && <Row label="Hiring, to replace people who left" value={money(-(n.hiring ?? 0))} testId={`hiring-${b.id}`} />}
              {(n.training ?? 0) > 0 && <Row label="Training" value={money(-(n.training ?? 0))} />}
              {n.marketing > 0 && <Row label="Marketing" value={money(-n.marketing)} />}
              {n.quality > 0 && <Row label="Quality" value={money(-n.quality)} />}
              <Row label="Insurance, utilities and the rest" value={money(-n.other)} />
              <div className="mt-1 border-t border-border pt-1">
                <Row label="Profit" value={money(n.profit)} strong testId={`profit-${b.id}`} />
              </div>
              {n.paidOut > 0 && <Row label="Paid out to the owners" value={money(n.paidOut)} />}
              {n.draw > 0 && <Row label="Paid to you" value={money(n.draw)} testId={`draw-${b.id}`} />}
              {n.injected > 0 && <Row label="You put in to cover the loss" value={money(n.injected)} testId={`injected-${b.id}`} />}
              {n.loanPayments > 0 && <Row label="Loan payments (paid with your own money)" value={money(n.loanPayments)} />}
              <Row label="Cash in the business" value={money(b.cash)} />
              {b.depth.stockValue > 0 && <Row label="Stock on the shelves, at cost" value={money(b.depth.stockValue)} testId={`stock-value-${b.id}`} />}
            </dl>
            {n.supplierMoves !== undefined && n.supplierMoves.length > 0 && (
              <p className="mt-2 text-sm text-muted" data-testid={`report-suppliers-${b.id}`}>
                Suppliers that year: {n.supplierMoves.map(([cat, idx]) => `${content.registries.business.suppliers[cat]?.label ?? cat} ${idx > 1.05 ? 'dearer than usual' : idx < 0.95 ? 'cheaper than usual' : 'at the usual price'}`).join(', ')}.
                {n.economy ? ` The economy was ${content.balance.business.economy.phases[n.economy as keyof typeof content.balance.business.economy.phases]?.label.toLowerCase() ?? n.economy}.` : ''}
              </p>
            )}
            {n.heads !== undefined && (
              <p className="mt-2 text-sm text-muted" data-testid={`report-heads-${b.id}`}>
                {n.heads} people worked there at the year’s end{(n.turnover ?? 0) > 0 ? `, and ${n.turnover} left from the crew` : ''}.
              </p>
            )}
          </>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <StatBar label="Reputation" value={b.reputation} />
          <StatBar label="Quality" value={b.quality} />
          <StatBar label="Staff morale" value={b.morale} />
        </div>
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
      <ConfirmSheet
        open={confirm !== null}
        title={confirm === 'sell' ? `Sell ${b.name}?` : confirm === 'close' ? `Close ${b.name}?` : confirm && 'buyout' in confirm ? `Buy ${confirm.name} out?` : ''}
        confirmLabel={confirm === 'sell' ? 'Sell it' : confirm === 'close' ? 'Close it' : 'Buy out'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c === 'sell') void act('sell_business', { biz: { businessId: b.id } });
          else if (c === 'close') void act('close_business', { biz: { businessId: b.id } });
          else if (c && 'buyout' in c) void act('buyout_owner', { biz: { businessId: b.id, ownerId: c.buyout } });
        }}
        body={
          confirm === 'sell'
            ? `The loans on it are paid off from the price first, and what is left is shared by who owns it. You would get about ${money(b.salePrice)} before that.`
            : confirm === 'close'
              ? 'The equipment and stock are sold off cheaply, the loans come out of that first, and everyone who works there is let go. Anything still owed stays with you.'
              : confirm && 'buyout' in confirm
                ? `It costs ${money(confirm.price)} from your savings. The share becomes yours.`
                : ''
        }
      />
    </>
  );
}

function BusinessPanel({ b, life }: { b: BusinessView; life: LifeState }) {
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<Tab>('report');
  const between = life.phase === 'yearStart';
  const disabled = busy || !between;
  const showFranchise = b.depth.franchise.eligible || b.depth.franchise.count > 0;
  const tabs = (Object.keys(BUSINESS_TABS) as Tab[]).filter((t) => t !== 'franchise' || showFranchise);
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
      <div role="tablist" aria-label={`${b.name} sections`} className="mt-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} data-testid={`tab-${b.id}-${t}`} onClick={() => setTab(t)} className={`min-h-11 rounded-xl border px-3 text-sm ${tab === t ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
            {BUSINESS_TABS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={BUSINESS_TABS[tab]}>
        {tab === 'report' && <ReportTab b={b} life={life} disabled={disabled} />}
        {tab === 'products' && <ProductsTab b={b} disabled={disabled} />}
        {tab === 'team' && <TeamTab b={b} disabled={disabled} />}
        {tab === 'places' && <PlacesTab b={b} life={life} disabled={disabled} />}
        {tab === 'franchise' && <FranchiseTab b={b} life={life} disabled={disabled} />}
      </div>
    </Card>
  );
}

/** The economy as one word with a line of explanation, and the suppliers' mood. */
function WorldStrip({ owned }: { owned: BusinessView[] }) {
  const first = owned[0];
  if (!first) return null;
  const phase = first.depth.economy.phase;
  const moods = new Map<string, { label: string; mood: 'up' | 'down' | 'steady' }>();
  for (const b of owned) for (const l of b.depth.lines) if (l.on && l.supplier.category && !moods.has(l.supplier.category)) moods.set(l.supplier.category, { label: l.supplier.label, mood: l.supplier.mood });
  for (const b of owned) for (const p of b.depth.pools) if (!moods.has(p.supplier.category)) moods.set(p.supplier.category, { label: p.supplier.label, mood: p.supplier.mood });
  return (
    <div className="mt-2 rounded-xl border border-border p-3" data-testid="economy-strip" aria-label="The economy and your suppliers">
      <p className={`font-semibold ${ECONOMY_TONES[phase]}`} data-testid="economy-phase">
        Economy: {first.depth.economy.label}
      </p>
      <p className="text-sm text-muted">{content.text.business.report.economy[phase]}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="supplier-moods">
        {[...moods.entries()].slice(0, 6).map(([id, m]) => (
          <li key={id}>
            {SUPPLIER_ARROWS[m.mood]} {m.label} {SUPPLIER_MOODS[m.mood]}
          </li>
        ))}
      </ul>
    </div>
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
          <WorldStrip owned={view.owned} />
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
