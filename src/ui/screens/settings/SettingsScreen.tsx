import { useCallback, useState } from 'react';
import { content } from '../../../content';
import type { Theme } from '../../../persistence';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ContentNotice } from '../../components/ContentNotice';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemePicker() {
  const theme = useAppStore((s) => s.settings.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
      {themeOptions.map((o) => {
        const selected = o.value === theme;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => void setTheme(o.value)}
            className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${
              selected ? 'bg-surface text-text shadow-sm' : 'text-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsScreen() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const resetAllData = useAppStore((s) => s.resetAllData);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const closeNotice = useCallback(() => setNoticeOpen(false), []);
  const closeReset = useCallback(() => setResetOpen(false), []);

  const confirmReset = async () => {
    setResetting(true);
    try {
      await resetAllData();
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  };

  return (
    <Screen title="Settings" onBack={closeSettings}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2" aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="text-sm font-semibold tracking-wide text-muted uppercase">
            Appearance
          </h2>
          <ThemePicker />
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="settings-content">
          <h2 id="settings-content" className="text-sm font-semibold tracking-wide text-muted uppercase">
            Content
          </h2>
          <Button variant="secondary" block onClick={() => setNoticeOpen(true)}>
            View content notice
          </Button>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="settings-data">
          <h2 id="settings-data" className="text-sm font-semibold tracking-wide text-muted uppercase">
            Data
          </h2>
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-muted">Your lives are saved only on this device.</p>
            <Button variant="danger" block onClick={() => setResetOpen(true)}>
              Reset all data
            </Button>
          </Card>
        </section>

        <section className="text-center text-xs text-muted" aria-label="About">
          <p>WIPlife {__APP_VERSION__}</p>
          <p>Content {content.contentVersion}</p>
        </section>
      </div>

      <Sheet open={noticeOpen} title="Content notice" onClose={closeNotice} footer={<Button block onClick={closeNotice}>Close</Button>}>
        <ContentNotice />
      </Sheet>

      <Sheet
        open={resetOpen}
        title="Reset all data?"
        onClose={closeReset}
        footer={
          <>
            <Button variant="danger" block onClick={confirmReset} disabled={resetting}>
              Delete everything
            </Button>
            <Button variant="secondary" block onClick={closeReset} disabled={resetting}>
              Cancel
            </Button>
          </>
        }
      >
        <p>
          This permanently deletes every life, your archive and your settings on this device. It can’t be undone.
        </p>
      </Sheet>
    </Screen>
  );
}
