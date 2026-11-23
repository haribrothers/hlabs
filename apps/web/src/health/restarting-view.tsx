// "Restarting hlabs…" (US-SYS-31) and "Resetting hlabs…" (US-SYS-38): full screen, in place of every route, while
// hlabs is away. It asks /healthz every 2 seconds; when hlabs answers it's back (the restart reloads the page, the reset
// opens onboarding); a reset shows the step it's on. Not back in time (2 minutes for a restart): "Can't reach hlabs".
import { LogoMark } from '@hlabs/icons';
import { useEffect, useState } from 'react';
import { restartingCopy as copy } from '../copy/health';
import type { HealthCheck } from './daemon-down';
import { RESET_GIVE_UP_MS, RESTART_GIVE_UP_MS, RESTART_POLL_MS, type Restarting } from './restarting';

const LOGO = 44;

export function RestartingView({
  state,
  check,
  onBack,
  onGiveUp,
  now = Date.now,
}: {
  state: Restarting;
  check: () => Promise<HealthCheck>;
  /** hlabs answers again. */
  onBack: () => void;
  /** It didn't come back in time. */
  onGiveUp: () => void;
  now?: () => number;
}) {
  const resetting = state.kind === 'resetting';
  const [step, setStep] = useState<{ step: number; steps: number; label: string }>({
    step: 1,
    steps: copy.resetSteps.length,
    label: copy.resetSteps[0],
  });
  const title = resetting ? copy.resetTitle : copy.restartTitle;

  useEffect(() => {
    document.title = title;
    let stopped = false;
    const tick = async () => {
      const result = await check();
      if (stopped) return;
      if (result.ok) {
        stopped = true;
        onBack();
        return;
      }
      if (result.reason === 'resetting' && result.step) {
        const steps = result.steps ?? copy.resetSteps.length;
        setStep({ step: result.step, steps, label: result.stepLabel ?? copy.resetSteps[result.step - 1] ?? '' });
      }
      if (now() - state.since >= (resetting ? RESET_GIVE_UP_MS : RESTART_GIVE_UP_MS)) {
        stopped = true;
        onGiveUp();
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), RESTART_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [check, onBack, onGiveUp, now, state.since, resetting, title]);

  const line = resetting ? copy.stepLine(step.step, step.steps, step.label) : copy.restartBody;
  const done = resetting ? ((step.step - 1) / step.steps) * 100 : null;
  return (
    <main className="hl-wall flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <span className="grid size-20 place-items-center rounded-lg border border-border-glass bg-surface-control">
        <LogoMark size={LOGO} title="" simplified={false} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-display">{title}</h1>
        <p aria-live="polite" className="m-0 max-w-md text-body text-ink-muted">
          {line}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(done === null ? {} : { 'aria-valuenow': Math.round(done), 'aria-valuetext': line })}
        className="relative h-1.5 w-full max-w-md overflow-hidden rounded-pill bg-surface-control"
      >
        {done === null ? (
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-pill bg-fill-primary opacity-60 motion-safe:animate-pulse" />
        ) : (
          <>
            <span className="absolute inset-y-0 left-0 rounded-pill bg-fill-primary" style={{ width: `${done}%` }} />
            <span
              className="absolute inset-y-0 rounded-pill bg-fill-primary opacity-40 motion-safe:animate-pulse motion-reduce:hidden"
              style={{ left: `${done}%`, width: `${100 / step.steps}%` }}
            />
          </>
        )}
      </div>
      {resetting ? <p className="m-0 max-w-md text-body-sm text-ink-muted">{copy.resetBody}</p> : null}
    </main>
  );
}
