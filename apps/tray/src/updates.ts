// Checking for hlabs updates in the tray (US-INST-19): the Tauri updater, on the channel tray.status gives, once 2
// minutes after launch and then 6 hours after each check. "Check for updates…" checks now: the item says "Checking…",
// then "hlabs is up to date" or "Couldn't check for updates" for 3 s, unless an update was found (the menu then shows
// it). Automatic checks that fail say nothing. An update that couldn't be installed (a bad signature, a broken archive)
// sends the menu back to normal, saying so for 10 s; only "Check for updates…" offers that version again.
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export const FIRST_CHECK_MS = 2 * 60_000;
export const CHECK_EVERY_MS = 6 * 60 * 60_000;
export const FEEDBACK_MS = 3_000;
export const INSTALL_FAILED_MS = 10_000;

export interface FoundUpdate {
  version: string;
  notes: string | null;
}
export type CheckFeedback = 'checking' | 'upToDate' | 'failed' | 'installFailed' | null;

export function useUpdateCheck(channel: 'stable' | 'beta' | null) {
  const [found, setFound] = useState<FoundUpdate | null>(null);
  const [feedback, setFeedback] = useState<CheckFeedback>(null);
  const next = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Versions that couldn't be installed in this run of the tray; automatic checks don't offer them again.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const failedRef = useRef(failed);
  failedRef.current = failed;

  const show = useCallback((result: CheckFeedback, ms: number) => {
    setFeedback(result);
    if (clear.current) clearTimeout(clear.current);
    if (result) clear.current = setTimeout(() => setFeedback(null), ms);
  }, []);

  const check = useCallback(
    async (manual: boolean) => {
      if (!channel) return;
      if (manual) setFeedback('checking');
      let result: CheckFeedback;
      try {
        const update = await invoke<FoundUpdate | null>('check_update', { channel });
        if (update && failedRef.current.has(update.version)) {
          if (!manual) return reschedule();
          // Asked for: try that version again.
          setFailed((was) => new Set([...was].filter((v) => v !== update.version)));
        }
        setFound(update);
        result = update ? null : 'upToDate';
      } catch {
        result = 'failed';
      }
      reschedule();
      if (manual) show(result, FEEDBACK_MS);
    },
    [channel, show],
  );
  // The next automatic check is 6 hours after this one, whichever started it.
  function reschedule() {
    if (next.current) clearTimeout(next.current);
    next.current = setTimeout(() => void check(false), CHECK_EVERY_MS);
  }

  useEffect(() => {
    if (!channel) return;
    next.current = setTimeout(() => void check(false), FIRST_CHECK_MS);
    return () => {
      if (next.current) clearTimeout(next.current);
      if (clear.current) clearTimeout(clear.current);
    };
  }, [channel, check]);

  /** The update couldn't be installed: back to the normal menu, which says so. */
  const installFailed = useCallback(
    (version: string) => {
      setFailed((was) => new Set([...was, version]));
      setFound(null);
      show('installFailed', INSTALL_FAILED_MS);
    },
    [show],
  );

  return { found, feedback, failed, installFailed, checkNow: () => void check(true) };
}

/**
 * Applying an update (US-INST-20): "Restart to update", or one the dashboard asked for (tray.status.updateRequested,
 * applied once per job). The Rust side replaces the app and relaunches the tray, so success never comes back here;
 * a failure calls `onFailed` with the version.
 */
export function useApplyUpdate(
  channel: 'stable' | 'beta' | null,
  requested: { jobId: string; version: string } | null,
  onFailed: (version: string) => void,
) {
  const [applying, setApplying] = useState(false);
  const handled = useRef<string | null>(null);
  const apply = useCallback(
    async (version: string) => {
      if (!channel) return;
      setApplying(true);
      try {
        await invoke('apply_update', { channel });
      } catch {
        setApplying(false);
        onFailed(version);
      }
    },
    [channel, onFailed],
  );
  useEffect(() => {
    if (!requested || handled.current === requested.jobId) return;
    handled.current = requested.jobId;
    void apply(requested.version);
  }, [requested, apply]);
  return { applying, apply: (version: string) => void apply(version) };
}
