import { Dock, UiStringsProvider } from '@hlabs/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uiStrings } from '../copy/shell';
import { navigationAreas, phoneAreas } from './areas';

describe('US-HOME-04', () => {
  it('areas wait for their phase: App Store 2, Usage 4, Files and Backups 5', () => {
    const labels = (phase: number) => navigationAreas({ shippedPhase: phase }).map((a) => a.label);
    expect(labels(1)).toEqual(['Home', 'Settings']);
    expect(labels(2)).toEqual(['Home', 'App Store', 'Settings']);
    expect(labels(4)).toEqual(['Home', 'App Store', 'Usage', 'Settings']);
    expect(labels(5)).toEqual(['Home', 'App Store', 'Files', 'Usage', 'Backups', 'Settings']);
    expect(phoneAreas({ shippedPhase: 1 }).map((a) => a.label)).toEqual(['Home', 'Settings']);
  });

  it('marks the current area, moves with the keyboard and names each tile', () => {
    const onSelect = vi.fn();
    render(
      <UiStringsProvider strings={uiStrings}>
        <Dock areas={navigationAreas({ shippedPhase: 5 })} active="files" onSelect={onSelect} search={false} />
      </UiStringsProvider>,
    );
    const dock = screen.getByRole('navigation', { name: 'Dock' });
    expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
    screen.getByRole('button', { name: 'Home' }).focus();
    fireEvent.keyDown(dock, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'App Store' })).toHaveFocus();
    fireEvent.keyDown(dock, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    fireEvent.keyDown(dock, { key: 'Home' });
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });
});
