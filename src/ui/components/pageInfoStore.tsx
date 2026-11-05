import { Fragment, useSyncExternalStore, type ReactNode } from 'react';

const items = new Map<string, ReactNode>();
let snapshot: ReactNode[] = [];
const listeners = new Set<() => void>();
function publish() {
  snapshot = [...items.entries()].map(([id, node]) => <Fragment key={id}>{node}</Fragment>);
  listeners.forEach((l) => l());
}
export const setPageInfo = (id: string, node: ReactNode) => {
  items.set(id, node);
  publish();
};
export const clearPageInfo = (id: string) => {
  items.delete(id);
  publish();
};

/** What the open page put behind its ⓘ (null when nothing). */
export function usePageInfo(): ReactNode {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
  return list.length > 0 ? list : null;
}
