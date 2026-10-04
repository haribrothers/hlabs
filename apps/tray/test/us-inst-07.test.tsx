// US-INST-07 · Back up now from the menu: hidden until backups ship in phase 5 (D-036); its criteria are tested then.
import { FEATURE_PHASE, isFeatureEnabled, SHIPPED_PHASE } from '@hlabs/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunningMenu, runningItems } from '../src/menu';

describe('US-INST-07 · Back up now from the menu', () => {
  it('is not in the menu before backups ship', () => {
    expect(FEATURE_PHASE.backups).toBe(5);
    expect(SHIPPED_PHASE).toBeLessThan(5);
    expect(isFeatureEnabled('backups')).toBe(false);
    render(<RunningMenu status={null} />);
    expect(screen.queryByRole('menuitem', { name: /Back up now/ })).not.toBeInTheDocument();
    expect(runningItems().some((i) => i.label === 'Back up now')).toBe(false);
  });
});
