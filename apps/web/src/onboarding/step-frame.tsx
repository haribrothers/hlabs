// Steps 1–6: the Stepper centred above a level-2 card whose heading takes focus when the step opens (US-ONB-03).
import { stepperOnboardingSteps, type OnboardingStep } from '@hlabs/shared';
import { GlassCard, Stepper } from '@hlabs/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { onboardingCopy } from '../copy/onboarding';

export function StepFrame({ step, title, children }: { step: OnboardingStep; title: string; children?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);
  const steps = stepperOnboardingSteps();
  const current = steps.indexOf(step);

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-8 text-left">
      {current >= 0 ? (
        <Stepper
          steps={steps.map((s) => onboardingCopy.stepNames[s as keyof typeof onboardingCopy.stepNames])}
          current={current}
          showName={false}
        />
      ) : null}
      <GlassCard level={2} className="w-full p-10">
        <h1 ref={heading} tabIndex={-1} className="m-0 text-title-1 outline-none">
          {title}
        </h1>
        {children}
      </GlassCard>
    </div>
  );
}
