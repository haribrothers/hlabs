// US-APP-21 · Per-container usage.
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppLogs } from './app-logs';
import { AppSettings } from './app-settings';
import { AppUsage } from './app-usage';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 7) => shared.isFeatureEnabled(f, p) };
});

const MB = 1e6;
const never = () => new Promise(() => {});
const later = <T,>(value: T, ms = 30) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const app = appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running', services: ['server', 'database'] });
const container = (service: string, status: string, values = true) => ({
  name: `vaultwarden-${service}`,
  service,
  status,
  memBytes: values ? 64 * MB : null,
  cpu: values ? 1 : null,
  netRx: values ? 1000 : null,
});
const detail = (containers: unknown[]) => ({
  appId: 'vaultwarden',
  installedAt: 1,
  current: null,
  cpuAvgToday: null,
  memPeak24h: null,
  disk: null,
  containers,
});
const handlers = (containers: () => unknown[]) => ({
  'usage.appDetail': () => detail(containers()),
  'usage.history': () => ({ scope: 'vaultwarden', range: '24h', resolution: '1m', points: [], peak: null }),
  'events.stream': never,
});
const list = async () => within(await screen.findByRole('group', { name: 'Containers' }));

describe('US-APP-21', () => {
  it('each container shows its name and "64 MB · 1% CPU · ↓ 1 KB/s"', async () => {
    renderScreen(
      () => <AppUsage app={app} onOpenLogs={() => {}} />,
      handlers(() => [container('server', 'running')]),
    );
    const rows = await list();
    expect(rows.getByText('vaultwarden-server')).toBeInTheDocument();
    expect(rows.getByText('64 MB · 1% CPU · ↓ 1 KB/s')).toBeInTheDocument();
  });

  it('updates with each 5 s sample', async () => {
    let memory = 64 * MB;
    renderScreen(() => <AppUsage app={app} onOpenLogs={() => {}} />, {
      ...handlers(() => [{ ...container('server', 'running'), memBytes: memory }]),
      'events.stream': () => {
        memory = 80 * MB;
        return later({ id: 'e1', data: { type: 'usage.sample', data: { ts: 2, host: {}, apps: [] } } });
      },
    });
    const rows = await list();
    await waitFor(() => expect(rows.getByText('80 MB · 1% CPU · ↓ 1 KB/s')).toBeInTheDocument());
  });

  it('a container that isn’t running says "Stopped" or "Exited", with a status dot', async () => {
    renderScreen(
      () => <AppUsage app={app} onOpenLogs={() => {}} />,
      handlers(() => [container('server', 'stopped', false), container('database', 'exited', false)]),
    );
    const rows = await list();
    expect(rows.getByText('Stopped')).toBeInTheDocument();
    expect(rows.getByText('Exited')).toBeInTheDocument();
    const dot = rows.getByText('vaultwarden-server').closest('.hl-status')!;
    expect(dot).toHaveClass('hl-status-stopped');
  });

  it('pressing a row opens the logs filtered to that container', async () => {
    const onOpenLogs = vi.fn();
    renderScreen(
      () => <AppUsage app={app} onOpenLogs={onOpenLogs} />,
      handlers(() => [container('server', 'running'), container('database', 'running')]),
    );
    fireEvent.click((await list()).getByRole('button', { name: /vaultwarden-database/ }));
    expect(onOpenLogs).toHaveBeenCalledWith('database');
  });

  it('from App settings it goes to Logs with that container chosen', async () => {
    const { router, calls } = renderScreen(
      () => <AppSettings appId="vaultwarden" />,
      {
        'apps.get': () => app,
        ...handlers(() => [container('server', 'running'), container('database', 'running')]),
        'apps.logs': () => ({ lines: [] }),
        'apps.watchLogs': never,
        'auth.me': fakeMe({ role: 'admin' }),
      },
      {
        path: '/apps/vaultwarden/settings',
        routes: { '/apps/vaultwarden/logs': () => <AppLogs appId="vaultwarden" service="database" /> },
      },
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Usage' }));
    fireEvent.click((await list()).getByRole('button', { name: /vaultwarden-database/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/vaultwarden/logs'));
    expect(router.state.location.search).toEqual({ service: 'database' });
    await waitFor(() =>
      expect(calls).toContainEqual({
        path: 'apps.logs',
        input: { appId: 'vaultwarden', tail: 500, service: 'database' },
      }),
    );
  });
});
