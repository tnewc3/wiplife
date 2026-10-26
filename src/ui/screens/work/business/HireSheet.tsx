import { useState } from 'react';
import type { BusinessView } from '../../../../engine/selectors';
import { useAppStore } from '../../../../store/appStore';
import { Button } from '../../../components/Button';
import { Sheet } from '../../../components/Sheet';
import { money } from '../../../labels';

/** B2: hire to a location and a role (a person you know or someone new), or add a head to the crew there. */
export function HireSheet({ b, open, onClose }: { b: BusinessView; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const team = b.depth.team;
  const craft = b.depth.hireRoles.find((r) => !r.lead && !r.licensed) ?? b.depth.hireRoles[0]!;
  const [locationId, setLocationId] = useState(team[0]!.id);
  const [roleId, setRoleId] = useState(craft.roleId);
  const [licensed, setLicensed] = useState(false);
  const here = team.find((t) => t.id === locationId) ?? team[0]!;
  const role = b.depth.hireRoles.find((r) => r.roleId === roleId) ?? craft;
  const row = here.roles.find((r) => r.roleId === role.roleId);
  const send = (extra: Record<string, unknown>) => void act('hire_staff', { biz: { businessId: b.id, locationId: here.id, roleId: role.roleId, ...extra } }).then(onClose);
  return (
    <Sheet open={open} title="Hire someone" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="hire-sheet">
        <label htmlFor="hire-location" className="font-bold">
          Where
        </label>
        <select id="hire-location" data-testid="hire-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.city} · {t.style}
            </option>
          ))}
        </select>
        <label htmlFor="hire-role" className="font-bold">
          Role
        </label>
        <select id="hire-role" data-testid="hire-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
          {b.depth.hireRoles.map((r) => (
            <option key={r.roleId} value={r.roleId}>
              {r.title}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted" data-testid="hire-room">
          {here.staffRoom > 0 ? `${here.city} can take ${here.staffRoom} more named ${here.staffRoom === 1 ? 'person' : 'people'}. ` : `${here.city} has as many named people as it can hold. `}
          Hiring one costs {money(b.hireCost)} up front. {row ? `It has ${row.crew} crew and ${row.named} named in this role now.` : ''}
        </p>
        {b.needsLicense && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} className="size-5" data-testid="hire-licensed" />
            <span>Someone with the {b.needsLicense}’s licence</span>
          </label>
        )}
        <Button block disabled={busy || here.staffRoom <= 0} data-testid="hire-new" onClick={() => send({ licensed })}>
          Meet someone new
        </Button>
        <Button block variant="secondary" disabled={busy || licensed || !row?.canMore} data-testid="hire-crew" onClick={() => send({ crew: true })}>
          Add a head to the crew
        </Button>
        <p className="text-xs text-muted">A head on the crew is hired and paid for when the year turns. A named person has ties, memories and a mood of their own.</p>
        <h4 className="font-bold">People you know</h4>
        {here.hireable.filter((h) => !licensed || h.licensed).length === 0 ? (
          <p className="text-sm text-muted">Nobody you know is free to work here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {here.hireable
              .filter((h) => !licensed || h.licensed)
              .map((h) => (
                <li key={h.personId}>
                  <Button variant="secondary" block disabled={busy || here.staffRoom <= 0} data-testid={`hire-${h.personId}`} onClick={() => send({ personId: h.personId, licensed: licensed && h.licensed })}>
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
