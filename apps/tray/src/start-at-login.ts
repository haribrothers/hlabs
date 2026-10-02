// "Start at login" (US-INST-09, D-042). The tray owns it: the login item and the LaunchAgent's RunAtLoad, changed by the
// Rust side. The daemon keeps the saved choice (tray.status.startAtLogin); a change in the menu is confirmed with
// tray.setStartAtLogin, and a saved choice that differs from the OS (changed in Settings, or while the tray was closed)
// is applied and confirmed the same way. If the OS refuses, the item says so for 3 s and nothing changes.
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { daemon } from './daemon';

export const FAILED_MS = 3_000;

export function useStartAtLogin(saved: boolean | undefined, onSaved?: () => void) {
  const [actual, setActual] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  /** A choice made in the menu that the daemon hasn't reported back yet; the saved value isn't applied meanwhile. */
  const chosen = useRef<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  useEffect(() => {
    void invoke<boolean | null>('start_at_login_state')
      .then((on) => setActual(on))
      .catch(() => {});
  }, []);

  const apply = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      busy.current = true;
      try {
        await invoke('set_start_at_login', { enabled });
        setActual(enabled);
        await daemon.mutate('setStartAtLogin', { enabled }).catch(() => {});
        onSaved?.();
        return true;
      } catch {
        setFailed(true);
        timer.current = setTimeout(() => setFailed(false), FAILED_MS);
        return false;
      } finally {
        busy.current = false;
      }
    },
    [onSaved],
  );

  useEffect(() => {
    if (chosen.current !== null && saved === chosen.current) chosen.current = null;
    if (saved === undefined || actual === null || saved === actual || busy.current || failed) return;
    if (chosen.current !== null) return;
    void apply(saved);
  }, [saved, actual, apply, failed]);

  const checked = actual ?? saved ?? true;
  const toggle = () => {
    chosen.current = !checked;
    void apply(!checked).then((done) => {
      // Refused: nothing to wait for.
      if (!done) chosen.current = null;
    });
  };
  return { checked, failed, toggle };
}
