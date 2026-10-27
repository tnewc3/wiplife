import { content } from '../../content';
import { getPortrait } from '../../engine/selectors';
import { useAppStore } from '../../store/appStore';
import { CharacterPortrait } from './CharacterPortrait';

/** The portrait of someone in the current life, by id ('you' for the character), for rows that only know who they are. */
export function PersonPortrait({ personId, name, size }: { personId: string; name: string; size: number }) {
  const life = useAppStore((s) => s.life);
  if (!life || (personId !== 'you' && !life.people[personId])) return null;
  return <CharacterPortrait portrait={getPortrait(life, personId, content)} size={size} label={`Portrait of ${name}`} />;
}
