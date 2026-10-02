// The running menu follows the TrayMenu design: its groups and order, shortcuts, and later phases' items hidden.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrayMenu } from '@hlabs/ui';
import { runningItems } from '../src/menu';

describe('TrayMenu design', () => {
  it("lists the actions in the design's groups, with Back up now and Uninstall hidden until their phases", () => {
    render(<TrayMenu statusText="Running" items={runningItems()} />);
    const menu = screen.getByRole('menu', { name: 'hlabs' });
    const labels = [...menu.querySelectorAll('.hl-menu-item')].map((el) => el.textContent);
    expect(labels).toEqual([
      'Open Dashboard⌘D',
      'Copy dashboard address',
      'Start at login',
      'Pause all apps',
      'Check for updates…',
      'Reset a password…',
      'Quit hlabs⌘Q',
    ]);
    // A line under the stats, and between the groups.
    expect(within(menu).getAllByRole('separator')).toHaveLength(3);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Start at login' })).toHaveAttribute('aria-checked', 'true');
  });

  it('lines labels up in the check column from the toggles on, not before', () => {
    const { container } = render(<TrayMenu statusText="Running" items={runningItems()} />);
    const rows = [...container.querySelectorAll('.hl-menu-item')];
    const hasColumn = rows.map((r) => r.querySelector('.hl-menu-check') !== null);
    expect(hasColumn).toEqual([false, false, true, true, true, true, true]);
  });
});
