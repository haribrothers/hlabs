import { createFileRoute } from '@tanstack/react-router';
import { onboardingCopy } from '../copy/onboarding';
import { OnboardingLayout, OnboardingLogo } from '../onboarding/onboarding-layout';

// OnbWelcome. "Get started" and the steps after it arrive with US-ONB-02 onward.
export const Route = createFileRoute('/setup')({
  component: () => (
    <OnboardingLayout>
      <OnboardingLogo />
      <h1 className="m-0 text-display">{onboardingCopy.welcomeTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{onboardingCopy.welcomeSubtitle}</p>
    </OnboardingLayout>
  ),
});
