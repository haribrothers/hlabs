import { createFileRoute } from '@tanstack/react-router';
import { onboardingCopy } from '../copy/onboarding';

// OnbSystem. The checks, Stepper and Continue arrive with US-ONB-03 and US-ONB-04.
export const Route = createFileRoute('/setup/system')({
  component: () => <h1 className="m-0 text-title-1">{onboardingCopy.systemTitle}</h1>,
});
