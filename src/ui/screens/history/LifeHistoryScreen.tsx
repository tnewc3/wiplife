import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Card } from '../../components/Card';
import { HistoryTimeline } from '../../components/HistoryTimeline';
import { Screen } from '../../components/Screen';

/** More → Life history: the full timeline of the current life. */
export function LifeHistoryScreen({ life }: { life: LifeState }) {
  const close = useAppStore((s) => s.closeLifeHistory);
  return (
    <Screen title="Life history" onBack={close}>
      <Card>
        <h2 className="mb-3 text-xl font-bold break-words [overflow-wrap:anywhere]">
          {life.character.name.first} {life.character.name.last}
        </h2>
        <HistoryTimeline history={life.history} label="Life history" />
      </Card>
    </Screen>
  );
}
