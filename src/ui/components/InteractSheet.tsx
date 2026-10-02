import { content } from '../../content';
import type { GiftTier } from '../../content/schemas';
import { getInteractionMenu } from '../../engine/selectors';
import type { LifeState } from '../../engine/types';
import { useAppStore } from '../../store/appStore';
import { GIFT_TIER_LABELS, INTERACTION_GROUP_LABELS, money } from '../labels';
import { Button } from './Button';
import { Sheet } from './Sheet';

/**
 * The Interact sheet (E1): everything that makes sense with this person
 * right now, grouped into Everyday, Conflict, Romance and Practical. A gift
 * opens a second view with its price tiers and what it would cost you.
 */
export function InteractSheet({ life }: { life: LifeState }) {
  const sheet = useAppStore((s) => s.interactSheet);
  const busy = useAppStore((s) => s.aging);
  const close = useAppStore((s) => s.closeInteractions);
  const setView = useAppStore((s) => s.setInteractView);
  const interact = useAppStore((s) => s.interact);

  const person = sheet ? life.people[sheet.personId] : undefined;
  if (!sheet || !person) return null;
  const menu = getInteractionMenu(life, sheet.personId, content);
  const gift = menu.flatMap((g) => g.items).find((item) => item.gift);

  if (sheet.view === 'gift' && gift?.gift) {
    return (
      <Sheet
        open
        title={`Give ${person.name.first} a gift`}
        onClose={close}
        footer={
          <Button variant="secondary" block disabled={busy} onClick={() => setView('menu')}>
            Back
          </Button>
        }
      >
        <p className="mb-3 text-muted" data-testid="gift-savings">
          You have {money(life.finances.savings)} in savings.
        </p>
        <ul className="flex flex-col gap-2" aria-label="Gift price tiers">
          {gift.gift.map((tier) => (
            <li key={tier.tier}>
              <GiftTierButton
                tier={tier.tier}
                price={tier.price}
                affordable={tier.affordable}
                borrow={Math.max(0, tier.price - life.finances.savings)}
                disabled={busy}
                onPick={() => void interact(gift.id, sheet.personId, tier.tier)}
              />
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }

  return (
    <Sheet open title={`Interact with ${person.name.first}`} onClose={close}>
      {menu.length === 0 ? (
        <p className="text-muted">There's nothing you can do with {person.name.first} right now.</p>
      ) : (
        <div className="flex flex-col gap-4" data-testid="interact-sheet">
          {menu.map((group) => (
            <section key={group.group} aria-labelledby={`interact-${group.group}`}>
              <h3 id={`interact-${group.group}`} className="mb-1 text-sm font-semibold tracking-wide text-muted uppercase">
                {INTERACTION_GROUP_LABELS[group.group]}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-testid={`interaction-${item.id}`}
                      disabled={busy}
                      onClick={() => (item.gift ? setView('gift') : void interact(item.id, sheet.personId))}
                      className="flex min-h-11 w-full flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50"
                    >
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-sm text-muted">{item.blurb}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function GiftTierButton({
  tier,
  price,
  affordable,
  borrow,
  disabled,
  onPick,
}: {
  tier: GiftTier;
  price: number;
  affordable: boolean;
  borrow: number;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`gift-tier-${tier}`}
      disabled={disabled || !affordable}
      onClick={onPick}
      className="flex min-h-11 w-full flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50"
    >
      <span className="flex w-full justify-between gap-3">
        <span className="font-semibold">{GIFT_TIER_LABELS[tier]}</span>
        <span className="font-semibold">{money(price)}</span>
      </span>
      <span className="text-sm text-muted">
        {!affordable ? "You can't afford this." : borrow > 0 ? `${money(borrow)} of it would go on credit.` : 'Paid from your savings.'}
      </span>
    </button>
  );
}
