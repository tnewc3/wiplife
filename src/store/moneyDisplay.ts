/**
 * How money is shown right now (W4a): the currency of the country the active life is lived in. Money is kept in one base
 * currency; the UI's `money()` writes it in this one. The store sets it whenever the active life changes
 * (src/store/appStore.ts), so every screen shows the same currency without passing it around.
 */
import type { MoneyDisplay } from '../engine/country';

/** The base currency, until a life says otherwise. */
export const BASE_MONEY_DISPLAY: MoneyDisplay = { code: 'USD', symbol: '$', rate: 1, locale: 'en-US', name: 'dollar', plural: 'dollars' };

let current: MoneyDisplay = BASE_MONEY_DISPLAY;

export function getMoneyDisplay(): MoneyDisplay {
  return current;
}

export function setMoneyDisplay(display: MoneyDisplay): void {
  current = display;
}
