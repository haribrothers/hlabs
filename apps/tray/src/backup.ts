// "Back up now" (US-INST-07): the same manual run as Backups' "Back up now". The item says when the last good backup
// finished ("Last: 2h ago"), or that the last one failed; while a run goes it reads "Backing up… 34%" and can't be chosen.
// With no destination it opens the dashboard's Backups page instead; while a restore or another exclusive task runs it
// says "Busy, try later" for 3 s.
import type { TrayStatus } from '@hlabs/api';
import type { MenuItem } from '@hlabs/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trayCopy as t } from './copy';
import { daemon, DaemonCallError } from './daemon';

export const BUSY_MS = 3_000;
/** Where "Back up now" goes when no destination is set up. */
export const BACKUPS_PATH = '/settings/backups';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Last: never", "Last: just now", "Last: 5m ago", "Last: 2h ago", "Last: 3d ago". */
export function lastBackupText(lastSucceededAt: number | null, now = Date.now()): string {
  if (lastSucceededAt === null) return t.lastNever;
  const ago = Math.max(0, now - lastSucceededAt);
  if (ago < MINUTE) return t.lastJustNow;
  if (ago < HOUR) return t.lastAgo(`${Math.floor(ago / MINUTE)}m ago`);
  if (ago < DAY) return t.lastAgo(`${Math.floor(ago / HOUR)}h ago`);
  return t.lastAgo(`${Math.floor(ago / DAY)}d ago`);
}

export interface BackUpNow {
  run: () => void;
  /** Asked the daemon, not yet seen running in tray.status. */
  starting: boolean;
  /** Another task holds it off: "Busy, try later" for 3 s. */
  busy: boolean;
}

export function useBackUpNow(
  backup: TrayStatus['backup'] | undefined,
  openDashboard: (path: string) => void,
  onStarted?: () => void,
): BackUpNow {
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const run = useCallback(() => {
    if (!backup?.configured) {
      openDashboard(BACKUPS_PATH);
      return;
    }
    setStarting(true);
    daemon
      .mutate('quickAction', { action: 'backupNow' })
      .then(() => onStarted?.())
      .catch((err: unknown) => {
        const code = err instanceof DaemonCallError && err.failure.kind === 'api' ? err.failure.hlabsCode : null;
        if (code === 'JOB_EXCLUSIVE_RUNNING') {
          setBusy(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setBusy(false), BUSY_MS);
        } else if (code === 'NOT_FOUND') {
          // The last destination was removed since the menu last asked.
          openDashboard(BACKUPS_PATH);
        }
      })
      .finally(() => setStarting(false));
  }, [backup?.configured, openDashboard, onStarted]);

  return { run, starting, busy };
}

/** The menu item for the state: running, held off, failed, or ready with when the last good backup was. */
export function backupItem(backup: TrayStatus['backup'] | undefined, action: BackUpNow, now = Date.now()): MenuItem {
  if (backup?.running || action.starting) {
    const percent = Math.round((backup?.progress ?? 0) * 100);
    return { label: t.backingUp(percent), disabled: true };
  }
  if (action.busy) return { label: t.busyTryLater, disabled: true };
  if (!backup?.configured) return { label: t.backUpNow, onSelect: action.run };
  return {
    label: t.backUpNow,
    detail: backup.lastFailed ? t.lastBackupFailed : lastBackupText(backup.lastSucceededAt, now),
    onSelect: action.run,
  };
}
