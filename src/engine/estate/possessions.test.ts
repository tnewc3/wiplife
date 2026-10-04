import { describe, expect, it, vi } from 'vitest';
import { content } from '../../content';
import type { EstateLine, LifeState, PossessionTransfer } from '../types';

// E5 will fill the possessions hook in; here a stand-in passes one possession to the first person who inherits.
vi.mock('./possessions', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    passPossessions: vi.fn((_life: LifeState, lines: readonly EstateLine[]): PossessionTransfer[] => {
      const first = lines.find((l) => l.kind === 'person');
      return first ? [{ possessionId: 'old_dog', toPersonId: first.id }] : [];
    }),
    receivePossessions: vi.fn(),
  };
});

const { die, parentLife } = await import('./fixtures');
const { continueAsHeir, heirCandidates } = await import('./heir');
const possessions = await import('./possessions');

describe('the E5 possessions hook', () => {
  it('is asked, after the cash and home are shared, who each possession goes to, and the answer is kept on the estate', () => {
    const dead = die(parentLife({ kids: [20, 25], noRelatives: true }));
    expect(possessions.passPossessions).toHaveBeenCalled();
    const [call] = vi.mocked(possessions.passPossessions).mock.calls.slice(-1);
    expect(call![1].map((l) => l.id)).toEqual(dead.estate!.lines.map((l) => l.id));
    expect(dead.estate!.possessions).toEqual([{ possessionId: 'old_dog', toPersonId: dead.estate!.lines[0]!.id }]);
  });

  it('hands the heir only what was passed to them', () => {
    const dead = die(parentLife({ kids: [20, 25], noRelatives: true }));
    const [first, second] = dead.estate!.lines.map((l) => l.id);
    vi.mocked(possessions.receivePossessions).mockClear();
    continueAsHeir(dead, second!, content);
    expect(possessions.receivePossessions).toHaveBeenCalledWith(expect.anything(), [], content);
    continueAsHeir(dead, first!, content);
    expect(possessions.receivePossessions).toHaveBeenLastCalledWith(expect.anything(), [{ possessionId: 'old_dog', toPersonId: first }], content);
    expect(heirCandidates(dead)).toContain(first);
  });
});
