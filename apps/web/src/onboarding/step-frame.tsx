// Steps 1–6: the Stepper centred above a level-2 card whose heading takes focus when the step opens (US-ONB-03).
import { stepperOnboardingSteps, VISIBLE_PHASE, type OnboardingStep } from '@hlabs/shared';
import { GlassCard, Stepper } from '@hlabs/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { onboardingCopy } from '../copy/onboarding';

export function StepFrame({
  step,
  title,
  badge,
  children,
  shippedPhase = VISIBLE_PHASE,
  wide = false,
}: {
  step: OnboardingStep;
  title: string;
  /** Shown beside the heading, outside it ("Recommended"). */
  badge?: ReactNode;
  children?: ReactNode;
  /** Which steps the Stepper counts (D-092: the previewed phase on the dev server). */
  shippedPhase?: number;
  /** A wider card, for a grid (OnbApps' tiles). */
  wide?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);
  const steps = stepperOnboardingSteps(shippedPhase);
  const current = steps.indexOf(step);

  return (
    <div className={`flex w-full ${wide ? 'max-w-2xl' : 'max-w-xl'} flex-col items-center gap-8 text-left`}>
      {current >= 0 ? (
        <Stepper
          steps={steps.map((s) => onboardingCopy.stepNames[s as keyof typeof onboardingCopy.stepNames])}
          current={current}
          showName={false}
        />
      ) : null}
      <GlassCard level={2} className="w-full p-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 ref={heading} tabIndex={-1} className="m-0 text-title-1 outline-none">
            {title}
          </h1>
          {badge}
        </div>
        {children}
      </GlassCard>
    </div>
  );
}
