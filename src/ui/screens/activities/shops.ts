import type { ActivityHubView } from '../../../engine/selectors';

/** Which activities of the hub are shops: the Shopping section of a category (stores, fine goods, outdoor gear, the luxury shops) and the black market. */
export function isShop(hub: Pick<ActivityHubView, 'id' | 'section' | 'kind'>): boolean {
  return hub.kind === 'options' && (hub.section === 'shopping' || hub.id === 'black_market');
}

