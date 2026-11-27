// US-SYS-47 · Some changes only work at home: the design system's "At home only" pill (a house and the words), its
// control (the label dimmed with the pill inside, opening the explanation), and a Home tile's line under its name on
// the public dashboard (HomePublicAddress).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppIcon, HomeOnlyButton, HomeOnlyPill } from '../src';

describe('US-SYS-47', () => {
  it('the pill is a house and the words, never colour alone', () => {
    const { container } = render(<HomeOnlyPill label="At home only" />);
    const pill = container.querySelector('.hl-home-only')!;
    expect(pill).toHaveTextContent('At home only');
    expect(pill.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('the control keeps its label, adds the pill, says it opens a dialog and runs only its explanation', () => {
    const explain = vi.fn();
    render(
      <HomeOnlyButton pill="At home only" aria-label="Remove, at home only" onClick={explain}>
        Remove…
      </HomeOnlyButton>,
    );
    const button = screen.getByRole('button', { name: 'Remove, at home only' });
    expect(button).toHaveTextContent('Remove…At home only');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveClass('hl-btn', 'hl-btn-home-only', 'hl-btn-sm');
    fireEvent.click(button);
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it('the pill alone can be a control too (beside a switch)', () => {
    render(<HomeOnlyButton pill="At home only" aria-label="Require two-factor, at home only" />);
    expect(screen.getByRole('button', { name: 'Require two-factor, at home only' })).toHaveClass(
      'hl-btn-home-only-bare',
    );
  });

  it('a tile can say what is under its name, drawn only (its accessible name says it)', () => {
    render(
      <AppIcon
        name="Vaultwarden"
        ariaLabel="Vaultwarden, at home only"
        below={<HomeOnlyPill label="At home only" />}
      />,
    );
    const tile = screen.getByRole('button', { name: 'Vaultwarden, at home only' });
    expect(tile).toHaveTextContent('VaultwardenAt home only');
    expect(tile.querySelector('.hl-app-below')).toHaveAttribute('aria-hidden', 'true');
  });
});
