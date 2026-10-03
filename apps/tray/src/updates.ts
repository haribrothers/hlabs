// Checking for hlabs updates in the tray (US-INST-19): the Tauri updater, on the channel tray.status gives, once 2
// minutes after launch and then 6 hours after each check. "Check for updates…" checks now: the item says "Checking…",
// then "hlabs is up to date" or "Couldn't check for updates" for 3 s, unless an update was found (the menu then shows
// it). Automatic checks that fail say nothing.
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export const FIRST_CHECK_MS = 2 * 60_000;
export const CHECK_EVERY_MS = 6 * 60 * 60_000;
export const FEEDBACK_MS = 3_000;

export interface FoundUpdate {
  version: string;
  notes: string | null;
}
export type CheckFeedback = 'checking' | 'upToDate' | 'failed' | null;

export function useUpdateCheck(channel: 'stable' | 'beta' | null) {
  const [found, setFound] = useState<FoundUpdate | null>(null);
  const [feedback, setFeedback] = useState<CheckFeedback>(null);
  const next = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(
    async (manual: boolean) => {
      if (!channel) return;
      if (manual) setFeedback('checking');
      let result: CheckFeedback;
      try {
        const update = await invoke<FoundUpdate | null>('check_update', { channel });
        setFound(update);
        result = update ? null : 'upToDate';
      } catch {
        result = 'failed';
      }
      // The next automatic check is 6 hours after this one, whichever started it.
      if (next.current) clearTimeout(next.current);
      next.current = setTimeout(() => void check(false), CHECK_EVERY_MS);
      if (!manual) return;
      setFeedback(result);
      if (clear.current) clearTimeout(clear.current);
      if (result) clear.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    },
    [channel],
  );

  useEffect(() => {
    if (!channel) return;
    next.current = setTimeout(() => void check(false), FIRST_CHECK_MS);
    return () => {
      if (next.current) clearTimeout(next.current);
      if (clear.current) clearTimeout(clear.current);
    };
  }, [channel, check]);

  return { found, feedback, checkNow: () => void check(true) };
}
