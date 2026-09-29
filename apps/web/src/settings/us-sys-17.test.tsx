import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { EngineSection, EngineStatus } from './engine-section';

const overview =
  (over: Record<string, unknown> = {}) =>
  () => ({
    platform: 'darwin',
    status: 'running',
    active: { kind: 'colima', managedByHlabs: true, version: '27.3.1' },
    engines: [
      { kind: 'orbstack', availability: 'found' },
      { kind: 'docker-desktop', availability: 'notInstalled' },
      { kind: 'colima', availability: 'active' },
    ],
    ...over,
  });

describe('US-SYS-17', () => {
  it('the header says whether the engine is running', async () => {
    const { unmount } = renderScreen(EngineStatus, { 'settings.engine.get': overview() });
    expect(await screen.findByRole('status')).toHaveTextContent('Engine running');
    unmount();
    renderScreen(EngineStatus, { 'settings.engine.get': overview({ status: 'starting' }) });
    expect(await screen.findByRole('status')).toHaveTextContent('Starting…');
  });

  it('lists each engine with its status; Switch… waits for phase 9', async () => {
    renderScreen(EngineSection, { 'settings.engine.get': overview(), 'jobs.list': () => ({ items: [] }) });
    const list = await screen.findByRole('group', { name: 'Container engine' });
    const rows = [...list.querySelectorAll('.hl-list-row')] as HTMLElement[];
    expect(rows.map((r) => r.textContent)).toEqual([
      'OrbStackFound on this Mac',
      'Docker DesktopNot installed',
      'Colima, in useInstalled by hlabs · open sourceRestart engine',
    ]);
    expect(within(list).queryByRole('button', { name: 'Switch…' })).toBeNull();
  });
});
