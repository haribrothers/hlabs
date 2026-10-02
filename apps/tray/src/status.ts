// tray.status, asked every 5 s while the menu is open and every 30 s while it's closed (only for the icon) (US-INST-05).
import type { TrayStatus } from '@hlabs/api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';
import { daemon } from './daemon';

export const OPEN_POLL_MS = 5_000;
export const CLOSED_POLL_MS = 30_000;

/** Whether the menu is open: it has focus while it shows, and closes when it loses it. */
export function useMenuOpen(): boolean {
  const [open, setOpen] = useState(() => document.hasFocus());
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => setOpen(payload));
    return () => void unlisten.then((stop) => stop()).catch(() => {});
  }, []);
  return open;
}

/** tray.status, and a way to ask again at once (after an action from the menu). */
export function useTrayStatus(enabled: boolean, open: boolean): [TrayStatus | null, () => void] {
  const [status, setStatus] = useState<TrayStatus | null>(null);
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const read = () =>
      daemon
        .query('status')
        .then((s) => active && setStatus(s))
        .catch(() => {});
    void read();
    const timer = setInterval(read, open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled, open, nudge]);
  return [status, useCallback(() => setNudge((n) => n + 1), [])];
}
