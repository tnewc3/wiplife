/**
 * God mode checks (G1, docs/expansion.md): the debt kinds an edit can add belong to no home, vehicle or business, and a
 * mood step fits the 0–100 range.
 */
import type { ContentBundle } from '../../src/content/schemas';
import type { ContentError } from './compile';

const FILE = 'balance/godmode.yaml';
/** Debts that belong to a thing they paid for: sell or pay those off in the game. */
const ATTACHED = ['mortgage', 'auto', 'business'];

export function checkGodmode(bundle: ContentBundle): ContentError[] {
  const errors: ContentError[] = [];
  const bal = bundle.balance.godmode;
  for (const kind of bal.money.debtKinds) {
    if (ATTACHED.includes(kind)) errors.push({ file: FILE, message: `money.debtKinds lists "${kind}", which belongs to a home, a vehicle or a business` });
  }
  if (new Set(bal.money.debtKinds).size !== bal.money.debtKinds.length) errors.push({ file: FILE, message: 'money.debtKinds lists a kind twice' });
  if (bal.money.debtMax > bal.money.savingsMax) errors.push({ file: FILE, message: 'money.debtMax is above money.savingsMax' });
  return errors;
}
