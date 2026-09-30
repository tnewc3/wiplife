import type { LifeState } from '../../../engine/types';
import { useAppStore, type TabId } from '../../../store/appStore';
import { AgeUpButton } from '../../components/AgeUpButton';
import { Button } from '../../components/Button';
import { EventSheet } from '../../components/EventSheet';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { HomeTab } from '../home/HomeTab';
import { PeopleTab } from '../people/PeopleTab';
import { PersonScreen } from '../people/PersonScreen';

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'life', label: 'Life', icon: '◉' },
  { id: 'people', label: 'People', icon: '♥' },
  { id: 'work', label: 'Work/School', icon: '✎' },
  { id: 'money', label: 'Money', icon: '$' },
  { id: 'more', label: 'More', icon: '⋯' },
];

function BottomNav() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  return (
    <nav aria-label="Game sections" className="pb-safe border-t border-border bg-surface">
      <ul className="flex">
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <li key={t.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {t.icon}
                </span>
                <span className="w-full truncate text-center">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The in-game layout, with Age Up above the navigation. Work/School and Money fill in with later stages. */
export function GameScreen({ life }: { life: LifeState }) {
  const tab = useAppStore((s) => s.tab);
  const navigate = useAppStore((s) => s.navigate);
  const openSettings = useAppStore((s) => s.openSettings);
  const openLifeHistory = useAppStore((s) => s.openLifeHistory);
  const personId = useAppStore((s) => s.personId);
  const closePerson = useAppStore((s) => s.closePerson);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0]!;
  const person = tab === 'people' && personId !== null && life.people[personId] ? personId : null;

  return (
    <Screen
      title={current.label}
      {...(person ? { onBack: closePerson, backLabel: 'Back to People' } : {})}
      footer={
        <>
          <AgeUpButton />
          <BottomNav />
        </>
      }
    >
      {tab === 'life' ? (
        <HomeTab life={life} />
      ) : tab === 'people' ? (
        person ? (
          <PersonScreen key={person} life={life} personId={person} />
        ) : (
          <PeopleTab life={life} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="text-center">
            <p className="text-sm font-semibold tracking-wide text-accent uppercase">Coming soon</p>
            <p className="mt-1 text-muted">This part of your life isn’t written yet.</p>
          </Card>
          {tab === 'more' && (
            <div className="flex flex-col gap-2">
              <Button variant="secondary" block onClick={openLifeHistory}>
                Life history
              </Button>
              <Button variant="secondary" block onClick={openSettings}>
                Settings
              </Button>
              <Button variant="ghost" block onClick={() => navigate('title')}>
                Back to title
              </Button>
            </div>
          )}
        </div>
      )}
      <EventSheet life={life} />
    </Screen>
  );
}
