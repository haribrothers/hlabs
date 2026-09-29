import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { EngineSection } from './engine-section';

const GIB = 2 ** 30;
const LIMITS = {
  maxCpus: 8,
  minMemoryBytes: 2 * GIB,
  maxMemoryBytes: 14 * GIB,
  minDiskBytes: 100 * GIB,
  maxDiskBytes: 150 * GIB,
};
const overview =
  (resources: unknown, active = { kind: 'colima', managedByHlabs: true, version: '27' }) =>
  () => ({
    platform: 'darwin',
    status: 'running',
    active,
    engines: [{ kind: active.kind, availability: 'active' }],
    resources,
  });

describe('US-SYS-19', () => {
  it("hlabs's Colima: CPU, memory and disk sliders with their ranges; a change offers Apply and restart engine", async () => {
    const apply = vi.fn(() => ({ jobId: 'j1' }));
    renderScreen(EngineSection, {
      'settings.engine.get': overview({
        editable: true,
        cpus: 4,
        memoryBytes: 8 * GIB,
        diskBytes: 100 * GIB,
        limits: LIMITS,
      }),
      'settings.engine.setResources': apply,
      'jobs.list': () => ({ items: [] }),
    });
    const cpus = await screen.findByLabelText('CPU cores');
    expect(cpus).toHaveValue('4');
    expect(cpus).toHaveAccessibleDescription('1 to 8 cores');
    expect(screen.getByLabelText('Memory')).toHaveAccessibleDescription('2 to 14 GB');
    expect(screen.getByLabelText('Disk')).toHaveAccessibleDescription('100 to 150 GB');
    expect(screen.queryByRole('button', { name: 'Apply and restart engine' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Memory'), { target: { value: '12' } });
    expect(screen.getByText('12 GB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply and restart engine' }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ cpus: 4, memoryBytes: 12 * GIB, diskBytes: 100 * GIB }));
  });

  it('OrbStack or Docker Desktop: read-only, change it in their settings', async () => {
    renderScreen(EngineSection, {
      'settings.engine.get': overview(
        { editable: false, cpus: 10, memoryBytes: 16 * GIB, diskBytes: null, limits: LIMITS },
        { kind: 'orbstack', managedByHlabs: false, version: '27' },
      ),
      'jobs.list': () => ({ items: [] }),
    });
    expect(await screen.findByText("Change this in OrbStack's settings")).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('16 GB')).toBeInTheDocument();
  });

  it('Linux: no resources section', async () => {
    renderScreen(EngineSection, {
      'settings.engine.get': () => ({
        platform: 'linux',
        status: 'running',
        active: { kind: 'docker-engine', managedByHlabs: false, version: '27' },
        engines: [{ kind: 'docker-engine', availability: 'active' }],
        resources: null,
      }),
      'jobs.list': () => ({ items: [] }),
    });
    await screen.findByText('Docker Engine');
    expect(screen.queryByText('Resources for apps')).toBeNull();
  });
});
