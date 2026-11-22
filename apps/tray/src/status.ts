// tray.status, asked every 5 s while the menu is open and every 30 s while it's closed (only for the icon) (US-INST-05);
// every second while the menu is open on a running backup, so "Backing up… 34%" moves (US-INST-07).
import type { TrayStatus } from '@hlabs/api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';
import { daemon } from './daemon';
import { isLinux } from './native-menu';

export const OPEN_POLL_MS = 5_000;
export const CLOSED_POLL_MS = 30_000;
export const BACKUP_POLL_MS = 1_000;

/** Whether the menu is open: it has focus while it shows, and closes when it loses it. */
export function useMenuOpen(): boolean {
  // A Linux desktop doesn't say when its native menu opens (D-145), so it's treated as open: the status line changes
  // within 5 s (US-INST-26).
  const [open, setOpen] = useState(() => isLinux() || document.hasFocus());
  useEffect(() => {
    if (isLinux()) return;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => setOpen(payload));
    return () => void unlisten.then((stop) => stop()).catch(() => {});
  }, []);
  return open;
}

/** tray.status, and a way to ask again at once (after an action from the menu). */
export function useTrayStatus(enabled: boolean, open: boolean): [TrayStatus | null, () => void] {
  const [status, setStatus] = useState<TrayStatus | null>(null);
  const [nudge, setNudge] = useState(0);
  const backingUp = status?.backup?.running === true;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const read = () =>
      daemon
        .query('status')
        .then((s) => active && setStatus(s))
        .catch(() => {});
    void read();
    const timer = setInterval(read, !open ? CLOSED_POLL_MS : backingUp ? BACKUP_POLL_MS : OPEN_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled, open, nudge, backingUp]);
  return [status, useCallback(() => setNudge((n) => n + 1), [])];
}
