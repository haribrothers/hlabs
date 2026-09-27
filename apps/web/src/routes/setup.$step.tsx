import { onboardingStepSchema } from '@hlabs/api/schemas';
import { createFileRoute } from '@tanstack/react-router';
import { onboardingCopy } from '../copy/onboarding';
import { StepFrame } from '../onboarding/step-frame';

// One route for every step after welcome (/setup/<step>). The first-run gate has already sent unknown,
// disabled and later-than-saved steps back to the saved step. Each step's content arrives with its story
// (US-ONB-04 system, 08 account, 11 two-factor, 14 storage, 21 done).
export const Route = createFileRoute('/setup/$step')({ component: Step });

function Step() {
  const parsed = onboardingStepSchema.safeParse(Route.useParams().step);
  if (!parsed.success || parsed.data === 'welcome') return null;
  const step = parsed.data;
  const title = onboardingCopy.titles[step as keyof typeof onboardingCopy.titles] ?? '';
  return <StepFrame key={step} step={step} title={title} />;
}
