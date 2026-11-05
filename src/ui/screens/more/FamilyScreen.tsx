import { PageInfo } from '../../components/PageInfo';
import { useState } from 'react';
import { content } from '../../../content';
import { getFamilyLineView, getFamilyView, type FamilyOptionView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { ListRow, RowList } from '../../components/ListRow';
import { CompactList, CompactRow, SectionLabel } from '../../components/SectionLabel';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { CUSTODY_LABELS, money, oddsWords, PROCESS_BLOCK_LABELS, PROCESS_LABELS, pregnancyLine, reputationWords, waitWords } from '../../labels';

const ACTION = { adoption: 'start_adoption', ivf: 'start_ivf', surrogacy: 'start_surrogacy' } as const;

/** More → Family: where your family stands, and adoption, IVF and surrogacy with their costs and odds in words. */
export function FamilyScreen({ life }: { life: LifeState }) {
  const view = getFamilyView(life, content);
  const line = getFamilyLineView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [confirming, setConfirming] = useState<FamilyOptionView | null>(null);

  const status = view.pregnancy ? pregnancyLine(view.pregnancy, life.currentYear) : view.process ? `${PROCESS_LABELS[view.process.kind].name} is under way. ${view.process.yearsLeft <= 1 ? 'An answer is due next year.' : `An answer is due in ${view.process.yearsLeft} years.`}` : 'Nothing under way right now.';
  return (
    <div className="flex flex-col gap-3">
      <PageInfo>
        <p>To try for a baby, open your partner’s page in People. A natural pregnancy needs a couple where one of you can carry one.</p>
        <p>Your family’s name goes before you: it shapes how people treat you, and it passes to whoever carries on.</p>
      </PageInfo>
      <HeroCard lead={<Icon id="hugging_face" size={44} />} title={`The ${line.familyName} family`} status={status} testId="family-line">
        <StatCell label="Generation" value={line.generation} />
        <StatCell label="Name" value={reputationWords(line.reputation)} />
      </HeroCard>
      <span className="sr-only" data-testid="family-line-facts">
        Generation {line.generation} · {reputationWords(line.reputation)}
      </span>
      {(view.pregnancy || view.process) && (
        <span className="sr-only" data-testid={view.pregnancy ? 'family-pregnancy' : 'family-process'}>
          {status}
        </span>
      )}
      {line.deeds.length > 0 && <p className="px-1 text-sm text-muted">Known for {line.deeds.join(', ')}.</p>}
      <ActionTileRow label="Ways to a family">
        {view.options.map((o) => {
          const label = PROCESS_LABELS[o.kind];
          return (
            <ActionTile key={o.kind} label={label.name} icon="red_heart" tone="family" status={o.blocks[0] && !o.available ? PROCESS_BLOCK_LABELS[o.blocks[0]] : money(o.cost)} disabled={busy || !o.available} onClick={() => setConfirming(o)} testId={`family-${o.kind}-start`} />
          );
        })}
      </ActionTileRow>
      {view.options.map((o) => (
        <span key={o.kind} className="sr-only" data-testid={`family-${o.kind}-facts`}>
          Costs about {money(o.cost)} in all · takes {waitWords(o.waitYears)}
          {o.odds !== undefined ? ` · ${oddsWords(o.odds)}` : ''}
        </span>
      ))}
      {view.options.filter((o) => o.blocks.length > 0).map((o) => (
        <CompactList key={o.kind} label={`Why not ${PROCESS_LABELS[o.kind].name}`}>
          {o.blocks.map((b) => (
            <CompactRow key={b} muted label={PROCESS_BLOCK_LABELS[b]} />
          ))}
        </CompactList>
      ))}
      {view.children.length > 0 && (
        <>
          <SectionLabel trailing={view.children.length}>Your children</SectionLabel>
          <RowList label="Your children">
            {view.children.map((c) => (
              <ListRow key={c.id} title={c.name} subtitle={`${c.age <= 0 ? 'Newborn' : c.age} · ${c.stepchild ? 'Stepchild' : CUSTODY_LABELS[c.custody]}`} />
            ))}
          </RowList>
        </>
      )}

      <ConfirmSheet
        open={confirming !== null}
        title={confirming ? `${PROCESS_LABELS[confirming.kind].name}?` : ''}
        body={
          confirming
            ? `It costs about ${money(confirming.cost)} in all, and the first part is due now. ${confirming.odds !== undefined ? `It has ${oddsWords(confirming.odds)}. ` : ''}You’ll decide on the next card.`
            : ''
        }
        confirmLabel={confirming ? PROCESS_LABELS[confirming.kind].confirm : ''}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const c = confirming;
          setConfirming(null);
          if (c) void act(ACTION[c.kind]);
        }}
      />
    </div>
  );
}
