import { isOnboardingStep, type OnboardingStep } from '@hlabs/shared';
import type { ComponentType } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { onboardingCopy } from '../copy/onboarding';
import { StepFrame } from '../onboarding/step-frame';
import { SystemStep } from '../onboarding/system-step';

// One route for every step after welcome (/setup/<step>). The first-run gate has already sent unknown,
// disabled and later-than-saved steps back to the saved step. Each step's content arrives with its story
// (US-ONB-04 system is built; 08 account, 11 two-factor, 14 storage, 21 done).
export const Route = createFileRoute('/setup/$step')({ component: Step });

/** Each step's content below its heading, added as its story ships. */
const CONTENT: Partial<Record<OnboardingStep, ComponentType>> = { system: SystemStep };

function Step() {
  const { step } = Route.useParams();
  if (!isOnboardingStep(step) || step === 'welcome') return null;
  const title = onboardingCopy.titles[step as keyof typeof onboardingCopy.titles] ?? '';
  const Content = CONTENT[step];
  return (
    <StepFrame key={step} step={step} title={title}>
      {Content ? <Content /> : null}
    </StepFrame>
  );
}
