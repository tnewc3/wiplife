import type { LifeState } from '../../../engine/types';
import { useAppStore, type TabId } from '../../../store/appStore';
import { AgeUpButton } from '../../components/AgeUpButton';
import { EventSheet } from '../../components/EventSheet';
import { InteractionCard } from '../../components/InteractionCard';
import { Screen } from '../../components/Screen';
import { HomeTab } from '../home/HomeTab';
import { MoneyTab } from '../money/MoneyTab';
import { HousingScreen } from '../more/HousingScreen';
import { HealthScreen } from '../more/HealthScreen';
import { FamilyScreen } from '../more/FamilyScreen';
import { WillScreen } from '../more/WillScreen';
import { LegalBanner } from '../../components/LegalBanner';
import { MoreTab } from '../more/MoreTab';
import { WorkTab } from '../work/WorkTab';
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

/** The in-game layout, with Age Up above the navigation. */
export function GameScreen({ life }: { life: LifeState }) {
  const tab = useAppStore((s) => s.tab);
  const personId = useAppStore((s) => s.personId);
  const closePerson = useAppStore((s) => s.closePerson);
  const moreView = useAppStore((s) => s.moreView);
  const closeHome = useAppStore((s) => s.closeHome);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0]!;
  const person = tab === 'people' && personId !== null && life.people[personId] ? personId : null;
  const home = tab === 'more' && moreView === 'home';
  const health = tab === 'more' && moreView === 'health';
  const family = tab === 'more' && moreView === 'family';
  const will = tab === 'more' && moreView === 'will';
  const back = person
    ? { onBack: closePerson, backLabel: 'Back to People' }
    : home || health || family || will
      ? { onBack: closeHome, backLabel: 'Back to More' }
      : {};

  return (
    <Screen
      title={home ? 'Home' : health ? 'Health' : family ? 'Family' : will ? 'Your will' : current.label}
      {...back}
      footer={
        <>
          <AgeUpButton />
          <BottomNav />
        </>
      }
    >
      <LegalBanner life={life} />
      {tab === 'life' ? (
        <HomeTab life={life} />
      ) : tab === 'people' ? (
        person ? (
          <PersonScreen key={person} life={life} personId={person} />
        ) : (
          <PeopleTab life={life} />
        )
      ) : tab === 'work' ? (
        <WorkTab life={life} />
      ) : tab === 'money' ? (
        <MoneyTab life={life} />
      ) : home ? (
        <HousingScreen life={life} />
      ) : health ? (
        <HealthScreen life={life} />
      ) : family ? (
        <FamilyScreen life={life} />
      ) : will ? (
        <WillScreen life={life} />
      ) : (
        <MoreTab />
      )}
      <EventSheet life={life} />
      <InteractionCard life={life} />
    </Screen>
  );
}
