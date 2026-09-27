import { cn } from '../lib/cn';
import { useUiStrings } from '../lib/strings';

export interface StepperProps {
  steps: string[];
  /** Zero-based. */
  current: number;
  label?: string;
}

/** Onboarding progress: "Step N of M" and one bar per enabled step (D-041). */
export function Stepper({ steps, current, label }: StepperProps) {
  const t = useUiStrings();
  const name = steps[current];
  return (
    <nav className="hl-stepper" aria-label={label ?? t.setupProgress}>
      <span className="hl-stepper-count">
        {t.step(current + 1, steps.length)}
        {name ? ` · ${name}` : ''}
      </span>
      <ol className="hl-stepper-bars">
        {steps.map((step, i) => (
          <li
            key={step}
            className={cn('hl-stepper-bar', i < current && 'is-done', i === current && 'is-current')}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="hl-sr">{step + (i < current ? ` (${t.done})` : '')}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
