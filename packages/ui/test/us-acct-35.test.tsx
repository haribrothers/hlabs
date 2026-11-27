// US-ACCT-35 · Reduce motion in the design system: useReduceMotion and Framer Motion follow <html data-motion>
// ("reduced" or "full", the person's choice) over the device's setting.
import { render, screen, waitFor } from '@testing-library/react';
import { useReducedMotionConfig } from 'framer-motion';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionPreference, useReduceMotion } from '../src/index';

const root = () => document.documentElement;

function osReducesMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => {
  delete root().dataset.motion;
  vi.unstubAllGlobals();
});

function Probe() {
  return (
    <>
      <span data-testid="hook">{String(useReduceMotion())}</span>
      <span data-testid="framer">{String(useReducedMotionConfig())}</span>
    </>
  );
}

describe('US-ACCT-35', () => {
  it('data-motion="reduced": reduced, Framer Motion included, whatever the device says', async () => {
    osReducesMotion(false);
    root().dataset.motion = 'reduced';
    render(
      <MotionPreference>
        <Probe />
      </MotionPreference>,
    );
    expect(screen.getByTestId('hook')).toHaveTextContent('true');
    expect(screen.getByTestId('framer')).toHaveTextContent('true');
    // Turned off: full motion straight away, though the device asks for less.
    root().dataset.motion = 'full';
    await waitFor(() => expect(screen.getByTestId('framer')).toHaveTextContent('false'));
    expect(screen.getByTestId('hook')).toHaveTextContent('false');
  });
});
