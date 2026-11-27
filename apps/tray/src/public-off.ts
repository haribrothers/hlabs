// "Turn off public access…" (US-SYS-44, TrayPublic): the OS confirms the person at the computer first (Touch ID or the
// login password on a Mac, polkit on Linux, as US-INST-18 does), then `tray.publicOff` makes every public app private
// in the same `public_off_all` job as Settings (the dashboard too, US-SYS-45), followed with `tray.job` until it ends.
// Cancelling changes nothing.
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trayCopy as t } from './copy';
import { daemon } from './daemon';

export const PUBLIC_JOB_POLL_MS = 1_000;
/** How long "Couldn't turn off public access" stays in place of the item. */
export const PUBLIC_FAILED_MS = 4_000;

const ENDED = new Set(['succeeded', 'failed', 'cancelled']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PublicOffPhase = 'idle' | 'busy' | 'failed';

export function usePublicOff(onDone?: () => void, pollMs = PUBLIC_JOB_POLL_MS, dashboard = false) {
  const [phase, setPhase] = useState<PublicOffPhase>('idle');
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const fail = useCallback(() => {
    setPhase('failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase('idle'), PUBLIC_FAILED_MS);
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      let confirmed: boolean;
      try {
        confirmed = await invoke<boolean>('confirm_public_off');
      } catch {
        // The OS couldn't ask: nothing is changed without it.
        fail();
        return;
      }
      if (!confirmed) return;
      setPhase('busy');
      try {
        const { jobId } = await daemon.mutate('publicOff');
        let job = await daemon.query('job', { jobId });
        while (!ENDED.has(job.state)) {
          await sleep(pollMs);
          job = await daemon.query('job', { jobId });
        }
        if (job.state !== 'succeeded') {
          fail();
          return;
        }
        setPhase('idle');
        const body = dashboard ? t.publicOffBodyDashboard : t.publicOffBody;
        void invoke('notify', { title: t.publicOffTitle, body }).catch(() => {});
      } catch {
        fail();
      }
    } finally {
      running.current = false;
      onDone?.();
    }
  }, [fail, onDone, pollMs, dashboard]);

  return { run: () => void run(), phase };
}
