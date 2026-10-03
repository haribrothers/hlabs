// The dashboard's side of "Can't reach hlabs" (US-STATE-04): /healthz is asked every 5 seconds; after 10 seconds of
// no good answer (and not while hlabs is updating) the page shows SysDaemonDown. When hlabs answers again the same
// route comes back and every query refetches. While hlabs updates (US-STATE-01) every route gives way to
// SysUpdating instead: /healthz saying "updating", the system.status event (SessionWatch) or the page's own flag.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkHealth, DaemonDownController, POLL_MS, type HealthCheck } from './daemon-down';
import { DaemonDownView } from './daemon-down-view';
import { updatingCopy } from '../copy/health';
import { showToast } from '../lib/toasts';
import { finishUpdating, firstToastFor, markUpdating, noteVersion, takeUpdateResult, useUpdating } from './updating';
import { UpdatingView } from './updating-view';

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
}: {
  children: ReactNode;
  check?: () => Promise<HealthCheck>;
  /** The version system.health reports, or null when it doesn't answer (US-STATE-02). */
  confirmVersion?: () => Promise<string | null>;
  reload?: () => void;
}) {
  const queryClient = useQueryClient();
  const updating = useUpdating();
  const [down, setDown] = useState<{ reason: string | null } | null>(null);
  const failingSince = useRef<number | null>(null);

  // Watch while things are fine; the down view runs its own loop.
  useEffect(() => {
    if (down || updating) return;
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
  }, [down, updating, check]);

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

  if (updating) return <UpdatingView check={check} onAnswer={onAnswer} />;
  return controller ? <DaemonDownView controller={controller} /> : children;
}
