import { useState } from 'react';
import type { BusinessView, TeamPersonView } from '../../../../engine/selectors';
import { useAppStore } from '../../../../store/appStore';
import { Button } from '../../../components/Button';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { Sheet } from '../../../components/Sheet';
import { HEADCOUNT_RANGE, RUNNER_WORDS, TRANSFER_BLOCK_LABELS, WILLING_WORDS, money } from '../../../labels';
import { HireSheet } from './HireSheet';

function MoveSheet({ b, p, onClose }: { b: BusinessView; p: TeamPersonView | null; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  return (
    <Sheet open={p !== null} title={p ? `Move ${p.name}` : 'Move'} onClose={onClose}>
      <ul className="flex flex-col gap-2" data-testid="move-sheet">
        {(p?.moves ?? []).map((m) => (
          <li key={m.locationId}>
            <Button variant="secondary" block disabled={m.block !== null} data-testid={`move-${p!.personId}-${m.locationId}`} onClick={() => void act('transfer_staff', { biz: { businessId: b.id, personId: p!.personId, locationId: m.locationId } }).then(onClose)}>
              {m.label} · {money(m.cost)}
              {m.willing ? ` · ${WILLING_WORDS[m.willing]}` : ''}
            </Button>
            {m.block !== null && <p className="mt-1 text-xs text-muted">{TRANSFER_BLOCK_LABELS[m.block] ?? ''}</p>}
          </li>
        ))}
        {(p?.moves.length ?? 0) === 0 && <li className="text-sm text-muted">There is no other place to move to.</li>}
      </ul>
    </Sheet>
  );
}

/** B2: the Team tab: headcount by location and role with steppers, location managers, named people, and hiring. */
export function TeamTab({ b, disabled }: { b: BusinessView; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const [hire, setHire] = useState(false);
  const [move, setMove] = useState<TeamPersonView | null>(null);
  const [fire, setFire] = useState<{ id: string; name: string } | null>(null);
  const d = b.depth;
  const staffBy = new Map(b.staff.map((s) => [s.personId, s]));
  return (
    <div data-testid={`team-${b.id}`}>
      <p className="mt-3 text-sm text-muted">
        Named people: {d.namedAll} of {d.namedCap} across your businesses. Everyone else is crew, counted by place and role.
      </p>
      {d.team.map((t) => (
        <section key={t.id} className="mt-4 rounded-xl border border-border p-3" aria-label={`${t.city} team`} data-testid={`team-loc-${t.id}`}>
          <h4 className="font-bold break-words">
            {t.city} · {t.style}
          </h4>
          <p className="text-sm text-muted" data-testid={`team-heads-${t.id}`}>
            {t.heads} {t.heads === 1 ? 'person' : 'people'} (up to {t.capHeads}) · run by {RUNNER_WORDS[t.runner].toLowerCase()}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {t.roles.map((r) => (
              <li key={r.roleId} className="flex items-center justify-between gap-2" data-testid={`hc-row-${t.id}-${r.roleId}`}>
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{r.title}</span>
                  <span className="block text-muted">
                    {r.named} named · {r.crew} crew{r.crewMorale !== null ? ` (${r.crewMorale >= 60 ? 'steady' : r.crewMorale >= 40 ? 'uneasy' : 'unhappy'})` : ''} · about {money(r.wage)} each
                  </span>
                  <span className="block text-xs text-muted">Range {HEADCOUNT_RANGE(r.min, r.max)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={`Fewer ${r.title}`} disabled={disabled || !r.canLess} data-testid={`hc-minus-${t.id}-${r.roleId}`} onClick={() => void act('set_headcount', { biz: { businessId: b.id, locationId: t.id, roleId: r.roleId, count: r.target - 1 } })} className="min-h-11 min-w-11 rounded-xl border border-border text-lg">
                    −
                  </button>
                  <span className="min-w-8 text-center font-semibold tabular-nums" data-testid={`hc-count-${t.id}-${r.roleId}`}>
                    {r.target}
                  </span>
                  <button type="button" aria-label={`More ${r.title}`} disabled={disabled || !r.canMore} data-testid={`hc-plus-${t.id}-${r.roleId}`} onClick={() => void act('set_headcount', { biz: { businessId: b.id, locationId: t.id, roleId: r.roleId, count: r.target + 1 } })} className="min-h-11 min-w-11 rounded-xl border border-border text-lg">
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm" data-testid={`team-manager-${t.id}`}>
            {t.manager ? `Manager: ${t.manager.name}` : 'No manager of its own.'}
            {t.manager && (
              <button type="button" disabled={disabled} data-testid={`remove-manager-${t.id}`} onClick={() => void act('remove_manager', { biz: { businessId: b.id, locationId: t.id } })} className="ml-2 min-h-11 rounded-xl border border-border px-3 text-sm">
                Step them back
              </button>
            )}
          </p>
        </section>
      ))}

      <h4 className="mt-5 text-base font-bold">Named people</h4>
      {d.people.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nobody you know works here yet. Crew fill the shifts at the market wage.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2" data-testid={`staff-${b.id}`}>
          {d.people.map((p) => {
            const s = staffBy.get(p.personId);
            return (
              <li key={p.personId} className="rounded-xl border border-border p-3" data-testid={`staff-${b.id}-${p.personId}`}>
                <p className="font-semibold break-words">
                  {p.name} <span className="font-normal text-muted">· {p.roleTitle}{p.isLocationManager ? ' (manager)' : ''}</span>
                </p>
                {s && (
                  <p className="text-sm text-muted">
                    {s.mood} · skill {s.skill} · {money(s.wage)} a year{s.location ? ` · ${s.location}` : ''}
                    {s.licensed ? ' · licensed' : ''}
                  </p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant="secondary" disabled={disabled} onClick={() => void act('raise_staff', { biz: { businessId: b.id, personId: p.personId } })} data-testid={`raise-${p.personId}`}>
                    Give a raise
                  </Button>
                  <Button variant="ghost" disabled={disabled} onClick={() => setFire({ id: p.personId, name: p.name })} data-testid={`fire-${p.personId}`}>
                    Let go
                  </Button>
                  <Button variant="secondary" disabled={disabled || d.team.length < 2} onClick={() => setMove(p)} data-testid={`move-open-${p.personId}`}>
                    Move to another place
                  </Button>
                  {!p.isLocationManager && (
                    <Button variant="secondary" disabled={disabled || p.canAppoint !== null} onClick={() => p.locationId && void act('appoint_manager', { biz: { businessId: b.id, personId: p.personId, locationId: p.locationId } })} data-testid={`appoint-${p.personId}`}>
                      Make manager · {money(p.appointFee)}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" block className="mt-3" disabled={disabled} onClick={() => setHire(true)} data-testid={`hire-open-${b.id}`}>
        Hire someone
      </Button>
      <HireSheet b={b} open={hire} onClose={() => setHire(false)} />
      <MoveSheet b={b} p={move} onClose={() => setMove(null)} />
      <ConfirmSheet open={fire !== null} title={fire ? `Let ${fire.name} go?` : ''} confirmLabel="Let go" onCancel={() => setFire(null)} onConfirm={() => {
        const f = fire;
        setFire(null);
        if (f) void act('fire_staff', { biz: { businessId: b.id, personId: f.id } });
      }} body="They get a little severance. They will remember how you did it." />
    </div>
  );
}
