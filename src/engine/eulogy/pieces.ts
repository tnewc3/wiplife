/**
 * Every piece of eulogy text with the id the builder records when it uses
 * it, so a run can say how much of the content actually appears.
 */
import type { ContentBundle } from '../../content/schemas';

export interface EulogyPiece {
  id: string;
  template: string;
}

/** All the pieces the eulogy and the reasons for staying away can use. */
export function eulogyPieces(content: ContentBundle): EulogyPiece[] {
  const t = content.text.eulogy;
  const out: EulogyPiece[] = [];
  const variants = (path: string, list: readonly string[]) => list.forEach((template, i) => out.push({ id: `${path}#${i}`, template }));
  for (const [group, tones] of Object.entries(t.opening)) for (const [tone, list] of Object.entries(tones)) variants(`opening.${group}.${tone}`, list);
  variants('bare', t.bare);
  for (const [tag, m] of Object.entries(t.memories)) out.push({ id: `memory.${tag}`, template: m.line });
  for (const [kind, template] of Object.entries(t.beliefs.true)) out.push({ id: `belief.true.${kind}`, template });
  for (const [version, template] of Object.entries(t.beliefs.twisted)) out.push({ id: `belief.twisted.${version}`, template });
  for (const [kind, template] of Object.entries(t.unknown)) out.push({ id: `unknown.${kind}`, template });
  for (const [m, template] of Object.entries(t.milestones)) out.push({ id: `milestone.${m}`, template });
  for (const [tone, list] of Object.entries(t.closing)) variants(`closing.${tone}`, list);
  // L1: what a speaker says about your last days.
  for (const [kind, list] of Object.entries(content.text.later.eulogy)) variants(`later.eulogy.${kind}`, list);
  return out;
}

/** The reasons for staying away or not coming (they are shown in the list, not in the eulogy). */
export function reasonPieces(content: ContentBundle): EulogyPiece[] {
  const a = content.text.eulogy.absent;
  const out: EulogyPiece[] = [];
  const variants = (path: string, list: readonly string[]) => list.forEach((template, i) => out.push({ id: `${path}#${i}`, template }));
  variants('absent.estranged.generic', a.estranged.generic);
  for (const [tag, template] of Object.entries(a.estranged.memory)) out.push({ id: `absent.estranged.${tag}`, template });
  variants('absent.feud.sided', a.feud.sided);
  variants('absent.feud.speaker', a.feud.speaker);
  variants('absent.feud.generic', a.feud.generic);
  variants('absent.ex.generic', a.ex.generic);
  for (const [tag, template] of Object.entries(a.ex.memory)) out.push({ id: `absent.ex.${tag}`, template });
  variants('absent.rumor', a.rumor);
  variants('absent.distrust', a.distrust);
  variants('absent.distant', a.distant);
  variants('absent.far', a.far);
  for (const [why, list] of Object.entries(content.text.eulogy.couldNot)) variants(`couldNot.${why}`, list);
  variants('later.declinedReason', content.text.later.lastDays.declinedReason);
  return out;
}
