// Another device opened hlabs before setup finished and has no setup token (US-ONB-01).
import { onboardingCopy } from '../copy/onboarding';
import { OnboardingLayout, OnboardingLogo } from './onboarding-layout';

export function FinishSetupElsewhere() {
  return (
    <OnboardingLayout>
      <OnboardingLogo />
      <h1 className="m-0 max-w-md text-title-1">{onboardingCopy.finishOnHost}</h1>
    </OnboardingLayout>
  );
}
