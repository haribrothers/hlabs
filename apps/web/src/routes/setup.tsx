import { createFileRoute, Outlet } from '@tanstack/react-router';
import { OnboardingLayout } from '../onboarding/onboarding-layout';

// Onboarding: /setup is the welcome screen and each step lives at /setup/<step>.
export const Route = createFileRoute('/setup')({
  component: () => (
    <OnboardingLayout>
      <Outlet />
    </OnboardingLayout>
  ),
});
