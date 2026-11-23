// The dashboard's side of "Can't reach hlabs" (US-STATE-04): /healthz is asked every 5 seconds; after 10 seconds of
// no good answer (and not while hlabs is updating) the page shows SysDaemonDown. When hlabs answers again the same
// route comes back and every query refetches. While hlabs updates (US-STATE-01) every route gives way to
// SysUpdating instead: /healthz saying "updating", the system.status event (SessionWatch) or the page's own flag; an
// update stuck for 10 minutes, or whose migrations failed, ends in "Can't reach hlabs" with that reason (US-STATE-03).
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkHealth, DaemonDownController, POLL_MS, type HealthCheck } from './daemon-down';
import { DaemonDownView } from './daemon-down-view';
import { updatingCopy } from '../copy/health';
import { browser } from '../lib/browser';
import { showToast } from '../lib/toasts';
import {
  clearUpdating,
  finishUpdating,
  firstToastFor,
  markUpdating,
  noteVersion,
  STUCK_AFTER_MS,
  takeUpdateResult,
  updatingNow,
  useUpdating,
} from './updating';
import { UpdatingView } from './updating-view';
import { clearRestarting, markResetting, markRestarting, useRestarting } from './restarting';
import { RestartingView } from './restarting-view';

/** How long /healthz may fail before the page says so. */
export const DOWN_AFTER_MS = 10_000;

/** The version answering, through the API (system.health is public), to confirm hlabs really is back. */
async function systemVersion(): Promise<string | null> {
  try {
    const res = await fetch('/trpc/system.health', { cache: 'no-store' });
    const body = (await res.json()) as { result?: { data?: { version?: unknown } } };
    const version = body.result?.data?.version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

export function HealthGate({
  children,
  check = checkHealth,
  confirmVersion = systemVersion,
  reload = () => window.location.reload(),
  go = (url: string) => browser.assign(url),
}: {
  children: ReactNode;
  check?: () => Promise<HealthCheck>;
  /** The version system.health reports, or null when it doesn't answer (US-STATE-02). */
  confirmVersion?: () => Promise<string | null>;
  reload?: () => void;
  /** Leaves for another page (onboarding, after a factory reset). */
  go?: (url: string) => void;
}) {
  const queryClient = useQueryClient();
  const updating = useUpdating();
  const restarting = useRestarting();
  const [down, setDown] = useState<{ reason: string | null } | null>(null);
  const failingSince = useRef<number | null>(null);

  // Watch while things are fine; the down view runs its own loop.
  useEffect(() => {
    if (down || updating || restarting) return;
    failingSince.current = null;
    let stopped = false;
    const tick = async () => {
      // Offline, the banner says so and the page stays (US-STATE-19); this is about hlabs, not the device.
      if (!navigator.onLine) {
        failingSince.current = null;
        return;
      }
      const result = await check();
      if (stopped) return;
      if (result.reason === 'updating') {
        markUpdating();
        return;
      }
      // Restarting or being reset from another page or device (US-SYS-31, US-SYS-38).
      if (result.reason === 'restarting') {
        markRestarting();
        return;
      }
      if (result.reason === 'resetting') {
        markResetting();
        return;
      }
      if (result.ok) {
        failingSince.current = null;
        if (result.version) noteVersion(result.version);
        return;
      }
      failingSince.current ??= Date.now();
      if (Date.now() - failingSince.current >= DOWN_AFTER_MS) setDown({ reason: result.reason });
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [down, updating, restarting, check]);

  // The version this page was loaded with, for after an update (US-STATE-02).
  useEffect(() => {
    // Offline there's nothing to ask (US-STATE-19); the regular checks note it once back.
    if (!navigator.onLine) return;
    void check().then((result) => {
      if (result.ok && result.version) noteVersion(result.version);
    });
  }, [check]);

  // After a reload for an update: "hlabs is up to date", once per browser session (US-STATE-02).
  useEffect(() => {
    const result = takeUpdateResult();
    if (result && result.to !== result.from && firstToastFor(result.to)) {
      showToast({ tone: 'success', title: updatingCopy.doneTitle, body: updatingCopy.doneBody(result.to) });
    }
  }, []);

  // The update is over when /healthz answers and system.health confirms it (one 200 alone may flap): reload the
  // route, so the new version's dashboard loads (US-STATE-02).
  const confirming = useRef(false);
  const onAnswer = useCallback(
    (result: HealthCheck) => {
      // It won't finish by waiting (US-STATE-03): a migration failed, or 10 minutes passed without hlabs back.
      const since = updatingNow()?.since ?? Date.now();
      if (result.reason === 'migration_failed' || (!result.ok && Date.now() - since >= STUCK_AFTER_MS)) {
        clearUpdating();
        setDown({ reason: result.reason === 'migration_failed' ? 'migration_failed' : 'update_stuck' });
        return;
      }
      if (!result.ok || confirming.current) return;
      confirming.current = true;
      void confirmVersion()
        .then((version) => {
          if (!version) return;
          finishUpdating(version);
          reload();
        })
        .finally(() => (confirming.current = false));
    },
    [confirmVersion, reload],
  );

  const controller = useMemo(
    () =>
      down
        ? new DaemonDownController({
            check,
            reason: down.reason,
            onBack: () => {
              setDown(null);
              void queryClient.invalidateQueries();
            },
          })
        : null,
    [down, check, queryClient],
  );

  // Back from a restart, the page loads again; after a reset, onboarding opens with the setup token this browser was
  // given (or at Home, which says where to finish setup).
  const onRestartBack = useCallback(() => {
    const token = restarting?.kind === 'resetting' ? restarting.setupToken : null;
    const kind = restarting?.kind;
    clearRestarting();
    if (kind === 'resetting') go(token ? `/setup?token=${encodeURIComponent(token)}` : '/');
    else reload();
  }, [restarting, go, reload]);
  const onRestartGiveUp = useCallback(() => {
    clearRestarting();
    setDown({ reason: null });
  }, []);

  if (updating) return <UpdatingView check={check} onAnswer={onAnswer} />;
  if (restarting && !down) {
    return <RestartingView state={restarting} check={check} onBack={onRestartBack} onGiveUp={onRestartGiveUp} />;
  }
  return controller ? <DaemonDownView controller={controller} /> : children;
}
