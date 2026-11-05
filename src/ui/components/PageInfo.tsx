import { useEffect, useId, type ReactNode } from 'react';
import { clearPageInfo, setPageInfo } from './pageInfoStore';

/**
 * The rules and tips of the page open over a tab (U3). A page renders <PageInfo> with its text (as many as it likes); the page
 * header shows one ⓘ that opens them all.
 */
export function PageInfo({ children }: { children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    setPageInfo(id, children);
  });
  useEffect(() => () => clearPageInfo(id), [id]);
  return null;
}
