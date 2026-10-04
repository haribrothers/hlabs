// "Pause all apps" and "Resume apps" (US-INST-08): a job in the daemon; the menu asks tray.status again at once and
// follows it from there (Paused, then Starting, then Running).
import { useCallback, useState } from 'react';
import { daemon } from './daemon';

export function useQuickAction(action: 'pauseAll' | 'resumeAll', onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      await daemon.mutate('quickAction', { action });
    } catch {
      // The status line shows what happened; nothing changed.
    } finally {
      setBusy(false);
      onDone?.();
    }
  }, [action, onDone]);
  return { run, busy };
}
