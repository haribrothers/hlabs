// OnbWelcome (US-ONB-02): what hlabs is, how long setup takes, and one way forward. No Stepper here.
import { ArrowRight, iconDefaults } from '@hlabs/icons';
import { Button } from '@hlabs/ui';
import { useEffect, useRef } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { OnboardingLogo } from './onboarding-layout';

export interface WelcomeStepProps {
  onStart: () => void;
  pending?: boolean;
  failed?: boolean;
}

export function WelcomeStep({ onStart, pending = false, failed = false }: WelcomeStepProps) {
  const start = useRef<HTMLButtonElement>(null);
  // Keyboard users land on Get started, so Enter starts setup straight away.
  useEffect(() => start.current?.focus(), []);

  return (
    <>
      <OnboardingLogo />
      <h1 className="m-0 text-display">{onboardingCopy.welcomeTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{onboardingCopy.welcomeSubtitle}</p>
      <Button ref={start} size="lg" className="mt-6" onClick={onStart} disabled={pending} aria-busy={pending}>
        {onboardingCopy.getStarted}
        <ArrowRight aria-hidden {...iconDefaults} />
      </Button>
      <p className="m-0 mt-2 text-caption text-ink-muted">{onboardingCopy.setupTime}</p>
      {failed ? (
        <p role="alert" className="m-0 text-body-sm text-ink">
          {onboardingCopy.startFailed}
        </p>
      ) : null}
      {/* "Restore from a backup instead" arrives with phase 8 (restoreInOnboarding, D-036). */}
    </>
  );
}
