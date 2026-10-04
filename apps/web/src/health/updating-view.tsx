// SysUpdating (US-STATE-01): "Updating hlabs", the step it's on and a progress bar, in place of every route. It asks
// /healthz every 2 seconds for the step (2–4 come from the restarted daemon); while nothing answers it stays on the
// step it knew (step 1, "Installing update", while the files are replaced). Needs no session. "Go to Home" reloads at
// /, where the same state shows again until the update is over.
import { LogoMark } from '@hlabs/icons';
import { Button } from '@hlabs/ui';
import { useEffect, useState } from 'react';
import { updatingCopy as copy } from '../copy/health';
import type { HealthCheck } from './daemon-down';
import { UPDATE_POLL_MS } from './updating';

const LOGO = 44;

export interface UpdateStep {
  step: number;
  steps: number;
  label: string;
}

export const FIRST_STEP: UpdateStep = { step: 1, steps: copy.steps.length, label: copy.steps[0] };

/** The step a /healthz answer gives, or null when it doesn't say (no answer, or not updating). */
export function stepOf(result: HealthCheck): UpdateStep | null {
  if (result.reason !== 'updating' || !result.step) return null;
  const steps = result.steps ?? copy.steps.length;
  return { step: result.step, steps, label: result.stepLabel ?? copy.steps[result.step - 1] ?? copy.steps[0] };
}

export function UpdatingView({
  check,
  onAnswer,
}: {
  check: () => Promise<HealthCheck>;
  /** Every answer, for what comes after (back, failed, stuck: US-STATE-02, US-STATE-03). */
  onAnswer?: (result: HealthCheck) => void;
}) {
  const [step, setStep] = useState<UpdateStep>(FIRST_STEP);

  useEffect(() => {
    document.title = copy.title;
    let stopped = false;
    const tick = async () => {
      const result = await check();
      if (stopped) return;
      const next = stepOf(result);
      if (next) setStep(next);
      onAnswer?.(result);
    };
    void tick();
    const timer = setInterval(() => void tick(), UPDATE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [check, onAnswer]);

  const line = copy.stepLine(step.step, step.steps, step.label);
  const done = ((step.step - 1) / step.steps) * 100;
  return (
    <main className="hl-wall flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <span className="grid size-20 place-items-center rounded-lg border border-border-glass bg-surface-control">
        <LogoMark size={LOGO} title="" simplified={false} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-display">{copy.title}</h1>
        <p aria-live="polite" className="m-0 text-body text-ink-muted">
          {line}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={copy.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done)}
        aria-valuetext={line}
        className="relative h-1.5 w-full max-w-md overflow-hidden rounded-pill bg-surface-control"
      >
        <span className="absolute inset-y-0 left-0 rounded-pill bg-fill-primary" style={{ width: `${done}%` }} />
        {/* The current step moves gently, unless reduce motion is on. */}
        <span
          className="absolute inset-y-0 rounded-pill bg-fill-primary opacity-40 motion-safe:animate-pulse motion-reduce:hidden"
          style={{ left: `${done}%`, width: `${100 / step.steps}%` }}
        />
      </div>
      <p className="m-0 flex flex-wrap items-center justify-center gap-x-2 text-body-sm text-ink-muted">
        {copy.body}
        <Button variant="link" onClick={() => window.location.assign('/')}>
          {copy.goHome}
        </Button>
      </p>
    </main>
  );
}
