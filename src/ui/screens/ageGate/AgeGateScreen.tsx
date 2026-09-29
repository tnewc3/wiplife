import { useState } from 'react';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ContentNotice } from '../../components/ContentNotice';
import { Screen } from '../../components/Screen';

/** First-launch age check and content notice. Shown until confirmed once. */
export function AgeGateScreen() {
  const confirmAge = useAppStore((s) => s.confirmAge);
  const [underage, setUnderage] = useState(false);
  const [saving, setSaving] = useState(false);

  if (underage) {
    return (
      <Screen centered>
        <div className="flex flex-col gap-6 text-center">
          <h1 className="text-3xl font-bold">WIPlife is for adults</h1>
          <p className="text-muted">Thanks for being honest. This game is meant for players 18 and older.</p>
          <Button variant="secondary" block onClick={() => setUnderage(false)}>
            Go back
          </Button>
        </div>
      </Screen>
    );
  }

  const confirm = async () => {
    setSaving(true);
    try {
      await confirmAge();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button size="lg" block onClick={confirm} disabled={saving}>
            I’m 18 or older
          </Button>
          <Button variant="ghost" block onClick={() => setUnderage(true)}>
            I’m under 18
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">WIPlife</h1>
          <p className="mt-1 text-muted">Before you begin</p>
        </div>
        <Card>
          <h2 className="mb-3 text-lg font-bold">Content notice</h2>
          <ContentNotice />
        </Card>
        <p className="text-sm text-muted">
          By continuing, you confirm you are 18 or older. You can read this notice again any time in Settings.
        </p>
      </div>
    </Screen>
  );
}
