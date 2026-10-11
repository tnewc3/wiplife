import { useMemo, useState } from 'react';
import { content } from '../../../content';
import type { BusinessStyle, OwnerRole } from '../../../content/schemas';
import type { FundingPlan } from '../../../engine/business/funding';
import { getFundingCheck, getStartOptions } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { TextField } from '../../components/TextField';
import { BUSINESS_BLOCK_LABELS, BUSINESS_ROLE_BLURBS, BUSINESS_ROLE_LABELS, money } from '../../labels';
import { FundingPicker } from './FundingPicker';

function Pick<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T | null; options: { id: T; title: string; detail?: string }[]; onChange: (id: T) => void; testId: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2" data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} data-testid={`${testId}-${o.id}`} onClick={() => onChange(o.id)} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${value === o.id ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
          {o.title}
          {o.detail && <span className="block text-sm font-normal text-muted">{o.detail}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * W3: start a business of your own: choose the kind, its style, the city, a name, who runs it and how it is
 * funded. The costs shown are for the city chosen; the funding picker says whether the plan can be carried out.
 */
export function StartBusinessSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [defId, setDefId] = useState<string | null>(null);
  const [style, setStyle] = useState<BusinessStyle | null>(null);
  const [cityId, setCityId] = useState(life.character.cityId);
  const [name, setName] = useState('');
  const [role, setRole] = useState<OwnerRole>('self');
  const [plan, setPlan] = useState<FundingPlan>({ source: 'savings' });
  const options = useMemo(() => getStartOptions(life, cityId, content), [life, cityId]);
  const option = options.find((o) => o.defId === defId) ?? null;
  const styleOption = option && style ? option.styles.find((s) => s.style === style) : undefined;
  const need = styleOption ? styleOption.total + (role === 'manager' ? styleOption.managerHiring : 0) : 0;
  const check = styleOption && option ? getFundingCheck(life, need, plan, option.defId, content) : null;
  const nameOk = name.trim().length >= 2 && name.trim().length <= content.balance.business.limits.nameLength && !life.business.items.some((b) => b.name.toLowerCase() === name.trim().toLowerCase());
  const ready = option !== null && styleOption !== undefined && nameOk && check !== null && check.block === null;
  const reason = !option ? BUSINESS_BLOCK_LABELS.type : !styleOption ? BUSINESS_BLOCK_LABELS.style : !nameOk ? BUSINESS_BLOCK_LABELS.name : (check?.block ? BUSINESS_BLOCK_LABELS[check.block] : null);
  return (
    <Sheet open={open} title="Start a business" onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="start-business">
        <section aria-label="Kind">
          <h3 className="mb-2 font-bold">What kind?</h3>
          <Pick label="Kind of business" testId="kind" value={defId} onChange={(id) => { setDefId(id); }} options={options.map((o) => ({ id: o.defId, title: o.name, detail: `${o.blurb}${o.license ? ` Needs a ${o.license}${o.youHoldLicense ? ' (you hold one)' : ' (you or someone you hire)'}.` : ''}` }))} />
        </section>
        {option && (
          <section aria-label="Style">
            <h3 className="mb-2 font-bold">What style?</h3>
            <Pick
              label="Style"
              testId="style"
              value={style}
              onChange={setStyle}
              options={option.styles.map((s) => ({ id: s.style, title: `${s.label} · ${money(s.total)} to start`, detail: `${s.blurb} A year once it is established: about ${money(s.typicalRevenue)} in sales. Suits this city: ${s.fit}%.` }))}
            />
          </section>
        )}
        <section aria-label="City">
          <label htmlFor="biz-city" className="mb-1 block font-bold">
            Which city?
          </label>
          <select id="biz-city" data-testid="biz-city" value={cityId} onChange={(e) => setCityId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
            {Object.keys(content.cities)
              .sort()
              .map((id) => (
                <option key={id} value={id}>
                  {content.cities[id]!.name}
                </option>
              ))}
          </select>
          {cityId !== life.character.cityId && <p className="mt-1 text-sm text-muted">It is not where you live, so you would not be there day to day. A manager makes more sense.</p>}
        </section>
        <section aria-label="Name">
          <TextField label="Name it" value={name} onChange={setName} maxLength={content.balance.business.limits.nameLength} data-testid="biz-name" hint="A made-up name, 2 to 40 characters." />
          {option && (
            <Button variant="ghost" className="mt-1" onClick={() => setName(option.names.find((n) => !life.business.items.some((b) => b.name === n)) ?? option.names[0]!)} data-testid="biz-suggest">
              Suggest a name
            </Button>
          )}
        </section>
        <section aria-label="Who runs it">
          <h3 className="mb-2 font-bold">Who runs it?</h3>
          <Pick label="Who runs it" testId="role" value={role} onChange={setRole} options={(['self', 'manager'] as const).map((r) => ({ id: r, title: BUSINESS_ROLE_LABELS[r], detail: BUSINESS_ROLE_BLURBS[r] }))} />
        </section>
        {styleOption && option && (
          <section aria-label="Funding">
            <h3 className="mb-2 font-bold">How will you pay for it?</h3>
            <p className="mb-2 text-sm text-muted" data-testid="start-need">
              {money(need)} in all: {money(styleOption.fitOut)} to fit it out, {money(styleOption.capital)} to keep it going{styleOption.hiring > 0 ? `, ${money(styleOption.hiring)} to hire someone with the licence` : ''}
              {role === 'manager' ? `, ${money(styleOption.managerHiring)} to hire a manager` : ''}.
            </p>
            <FundingPicker life={life} need={need} defId={option.defId} plan={plan} onChange={setPlan} />
          </section>
        )}
        {reason && !ready && <p className="text-sm text-muted" role="status" data-testid="start-reason">{reason}</p>}
        <Button
          block
          disabled={busy || !ready}
          data-testid="start-confirm"
          onClick={() => {
            if (!option || !style) return;
            void act('start_business', { biz: { defId: option.defId, name: name.trim(), cityId, style, plan, role } }).then(() => onClose());
          }}
        >
          Open {name.trim() || 'it'}
        </Button>
      </div>
    </Sheet>
  );
}
