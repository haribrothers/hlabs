// AppOffline, "Can't reach hlabs" for hlabs opened where it can't be reached (US-INST-29): the installed app (or a tab)
// started from its saved shell while offline, away from home without Tailscale, or with hlabs's computer off. At
// start, a /healthz that gets no answer at all shows it at once; it asks again every 10 seconds (or now, on Try
// again) and loads the page when hlabs answers. An error page from Caddy (hlabs's computer is reachable but hlabs
// isn't) is HealthGate's "Can't reach hlabs" as before (US-STATE-04).
import { WifiOff, iconDefaults } from '@hlabs/icons';
import { Button, GlassCard } from '@hlabs/ui';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { healthCopy } from '../copy/health';
import { checkHealth, type HealthCheck } from './daemon-down';

const copy = healthCopy;
/** Seconds between checks. */
export const OFFLINE_POLL_SECONDS = 10;

export function OfflineGate({
  children,
  check = checkHealth,
  reload = () => window.location.reload(),
}: {
  children: ReactNode;
  check?: () => Promise<HealthCheck>;
  reload?: () => void;
}) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let stopped = false;
    void check().then((r) => {
      if (!stopped && r.noAnswer) setOffline(true);
    });
    return () => {
      stopped = true;
    };
  }, [check]);
  if (!offline) return children;
  return <AppOffline check={check} onBack={reload} />;
}

export function AppOffline({ check, onBack }: { check: () => Promise<HealthCheck>; onBack: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(OFFLINE_POLL_SECONDS);
  const [checking, setChecking] = useState(false);
  const tryNow = useCallback(async () => {
    setChecking(true);
    const r = await check();
    setChecking(false);
    setSecondsLeft(OFFLINE_POLL_SECONDS);
    // Anything that answers (even "starting") means hlabs's computer is reachable: the page takes it from there.
    if (!r.noAnswer) onBack();
  }, [check, onBack]);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          void tryNow();
          return OFFLINE_POLL_SECONDS;
        }
        return s - 1;
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [tryNow]);
  useEffect(() => {
    document.title = copy.title;
  }, []);
  return (
    <main className="hl-wall fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-scrim-strong" aria-hidden />
      <section
        aria-labelledby="app-offline-title"
        className="relative flex w-full max-w-[460px] flex-col items-center gap-6 text-center"
      >
        <span className="flex size-20 items-center justify-center rounded-pill border border-warning/50 bg-warning/15">
          <WifiOff aria-hidden {...iconDefaults} className="size-9 text-warning" />
        </span>
        <div className="flex flex-col gap-2.5">
          <h1 id="app-offline-title" className="m-0 text-title-1 font-bold">
            {copy.title}
          </h1>
          <p role="status" className="m-0 text-body text-ink-muted">
            {checking ? copy.trying : copy.tryingIn(secondsLeft)}
          </p>
        </div>
        <GlassCard level={1} className="w-full p-0 text-left">
          <ol className="m-0 list-none p-0">
            {copy.offline.checks.map((line, i) => (
              <li key={line} className="flex items-start gap-3 border-hairline px-4 py-3.5 text-body [&+&]:border-t">
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-control text-caption font-bold"
                >
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </GlassCard>
        <Button size="lg" disabled={checking} onClick={() => void tryNow()}>
          {copy.offline.tryAgain}
        </Button>
      </section>
    </main>
  );
}
