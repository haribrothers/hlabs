// Whether onboarding is still to do (US-INST-02): tray.setupUrl is null once it's complete. Checked every 5 s while the
// daemon is up, so the tray leaves its first-launch state within 5 s of completion (05 "From 02 · Onboarding").
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { daemon } from './daemon';

export const SETUP_POLL_MS = 5_000;

export function useSetupPending(enabled: boolean): boolean | null {
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const check = () =>
      daemon
        .query('setupUrl')
        .then((r) => active && setPending(r.url !== null))
        .catch(() => {});
    void check();
    const timer = setInterval(check, SETUP_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled]);
  return pending;
}

/** "Open setup": the Rust side fetches tray.setupUrl again and opens it. */
export function useOpenSetup() {
  return useCallback(() => invoke<boolean>('open_setup').catch(() => false), []);
}
