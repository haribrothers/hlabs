import { describe, expect, it } from 'vitest';
import { enabledOnboardingSteps, nextOnboardingStep, stepperOnboardingSteps } from './onboarding';

describe('onboarding step registry (D-041)', () => {
  it('leaves out steps whose phase has not shipped', () => {
    expect(enabledOnboardingSteps(1)).toEqual(['welcome', 'system', 'account', 'twoFactor', 'storage', 'done']);
    expect(enabledOnboardingSteps(3)).toEqual([
      'welcome',
      'system',
      'account',
      'twoFactor',
      'storage',
      'remote',
      'apps',
      'done',
    ]);
  });

  it('counts only the real steps in the Stepper', () => {
    expect(stepperOnboardingSteps(1)).toEqual(['system', 'account', 'twoFactor', 'storage']);
    expect(stepperOnboardingSteps(3)).toHaveLength(6);
  });

  it('moves to the next enabled step', () => {
    expect(nextOnboardingStep('welcome', 1)).toBe('system');
    expect(nextOnboardingStep('storage', 1)).toBe('done');
    expect(nextOnboardingStep('storage', 3)).toBe('remote');
    expect(nextOnboardingStep('done', 1)).toBe('done');
  });
});
