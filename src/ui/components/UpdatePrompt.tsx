import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './Button';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and offers new versions. The new worker waits
 * until the player taps Update, so an old build is never served after they
 * accept, and a running game is never replaced mid-turn without asking.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = async () => {
        if (registration.installing || !navigator.onLine) return;
        try {
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (res.status === 200) await registration.update();
        } catch {
          // Offline or blocked; try again later.
        }
      };
      setInterval(() => void check(), UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check();
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="px-safe pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-[max(env(safe-area-inset-top),0.75rem)]"
    >
      <div className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg">
        <p className="flex-1 text-sm font-medium">A new version of WIPlife is ready.</p>
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button onClick={() => void updateServiceWorker(true)}>Update</Button>
      </div>
    </div>
  );
}
