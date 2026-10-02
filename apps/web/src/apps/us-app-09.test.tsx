// US-APP-09 · Filter logs.
import type { LogLine } from '@hlabs/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppLogs } from './app-logs';

const never = () => new Promise(() => {});
const line = (n: number, service: string, text: string): LogLine => ({
  service,
  stream: 'stdout',
  ts: 1_700_000_000_000 + n * 1000,
  line: text,
});
const ALL = [
  line(0, 'server', 'INFO Starting server'),
  line(1, 'database', 'INFO database system is ready'),
  line(2, 'server', 'ERROR Failed to fetch icon for example.org'),
  line(3, 'server', 'INFO GET /api/sync 200'),
];

function open(services: string[] = ['server', 'database']) {
  return renderScreen(
    () => <AppLogs appId="immich" />,
    {
      'apps.get': () => appDetail({ id: 'immich', name: 'Immich', state: 'running', services }),
      'apps.logs': (input) => {
        const { service } = input as { service?: string };
        return { lines: service ? ALL.filter((l) => l.service === service) : ALL };
      },
      'apps.watchLogs': never,
      'events.stream': never,
      'auth.me': fakeMe({ role: 'admin' }),
    },
    { path: '/apps/immich/logs' },
  );
}

const rows = (log: HTMLElement) =>
  within(log)
    .queryAllByText(/./, { selector: 'span.text-ink' })
    .map((r) => r.textContent);

describe('US-APP-09', () => {
  it('the toolbar has "Filter logs", a Container choice with All and each service, and "Errors only"', async () => {
    open();
    expect(await screen.findByRole('searchbox', { name: 'Filter logs' })).toBeInTheDocument();
    const container = await screen.findByRole('radiogroup', { name: 'Container' });
    expect(
      within(container)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['All', 'server', 'database']);
    expect(screen.getByRole('button', { name: 'Errors only' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('"All" interleaves the services by time and says whose each line is', async () => {
    open();
    const log = await screen.findByRole('log');
    await within(log).findByText('INFO Starting server');
    expect(rows(log)).toEqual([
      'serverINFO Starting server',
      'databaseINFO database system is ready',
      'serverERROR Failed to fetch icon for example.org',
      'serverINFO GET /api/sync 200',
    ]);
  });

  it('typing filters to lines containing the text, case-insensitive, with the matches marked; clearing restores', async () => {
    open();
    const log = await screen.findByRole('log');
    await within(log).findByText('INFO Starting server');
    const field = screen.getByRole('searchbox', { name: 'Filter logs' });
    fireEvent.change(field, { target: { value: 'SERVER' } });
    await waitFor(() => expect(rows(log)).toEqual(['serverINFO Starting server']));
    expect(within(log).getByText('server', { selector: 'mark' })).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '' } });
    await waitFor(() => expect(rows(log)).toHaveLength(4));
  });

  it('picking a container reloads its last 500 lines from the daemon, without the service prefix', async () => {
    const { calls } = open();
    const log = await screen.findByRole('log');
    await within(log).findByText('INFO Starting server');
    fireEvent.click(screen.getByRole('radio', { name: 'database' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ path: 'apps.logs', input: { appId: 'immich', tail: 500, service: 'database' } }),
    );
    await waitFor(() => expect(rows(log)).toEqual(['INFO database system is ready']));
  });

  it('"Errors only" shows only ERROR lines', async () => {
    open();
    const log = await screen.findByRole('log');
    await within(log).findByText('INFO Starting server');
    fireEvent.click(screen.getByRole('button', { name: 'Errors only' }));
    expect(rows(log)).toEqual(['serverERROR Failed to fetch icon for example.org']);
  });

  it('when nothing matches it says so, and "Clear filters" brings every line back', async () => {
    open();
    const log = await screen.findByRole('log');
    await within(log).findByText('INFO Starting server');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter logs' }), { target: { value: 'nothing like it' } });
    expect(await within(log).findByText('No lines match these filters.')).toBeInTheDocument();
    await act(async () => fireEvent.click(within(log).getByRole('button', { name: 'Clear filters' })));
    await waitFor(() => expect(rows(log)).toHaveLength(4));
    expect(screen.getByRole('searchbox', { name: 'Filter logs' })).toHaveValue('');
  });

  it('an app with one service has no Container choice', async () => {
    open(['vaultwarden']);
    await screen.findByRole('log');
    expect(screen.queryByRole('radiogroup', { name: 'Container' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Errors only' })).toBeInTheDocument();
  });
});
