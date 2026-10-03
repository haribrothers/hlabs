// The dashboard's side of "Can't reach hlabs" (US-STATE-04): /healthz is asked every 5 seconds; after 10 seconds of
// no good answer (and not while hlabs is updating) the page shows SysDaemonDown. When hlabs answers again the same
// route comes back and every query refetches. While hlabs updates (US-STATE-01) every route gives way to
// SysUpdating instead: /healthz saying "updating", the system.status event (SessionWatch) or the page's own flag.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkHealth, DaemonDownController, POLL_MS, type HealthCheck } from './daemon-down';
import { DaemonDownView } from './daemon-down-view';
import { clearUpdating, markUpdating, useUpdating } from './updating';
import { UpdatingView } from './updating-view';

/** How long /healthz may fail before the page says so. */
export const DOWN_AFTER_MS = 10_000;

export function HealthGate({
  children,
  check = checkHealth,
}: {
  children: ReactNode;
  check?: () => Promise<HealthCheck>;
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

  // The update is over when hlabs answers again (US-STATE-02 reloads the page for the new version).
  const onAnswer = useCallback(
    (result: HealthCheck) => {
      if (!result.ok) return;
      clearUpdating();
      void queryClient.invalidateQueries();
    },
    [queryClient],
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
