// US-APP-10 · Download logs.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { currentToasts, dismissToast, showToast } from '../lib/toasts';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { renderScreen, renderWithDaemon } from '../test/render';
import { appDetail } from '../test/store';
import { AppLogs } from './app-logs';

const never = () => new Promise(() => {});

function open() {
  return renderScreen(
    () => <AppLogs appId="immich" />,
    {
      'apps.get': () => appDetail({ id: 'immich', name: 'Immich', state: 'running', services: ['server', 'database'] }),
      'apps.logs': () => ({ lines: [] }),
      'apps.watchLogs': never,
      'events.stream': never,
      'auth.me': fakeMe({ role: 'admin' }),
    },
    { path: '/apps/immich/logs' },
  );
}

const file = (name: string) =>
  new Response('server 2026-01-02T17:02:11.000Z hello\n', {
    status: 200,
    headers: { 'content-disposition': `attachment; filename="${name}"` },
  });

afterEach(() => {
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-APP-10', () => {
  it('Download saves every line of all containers under the name the daemon gives', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(file('immich-logs-20261001-1702.log'));
    const save = vi.spyOn(browser, 'save').mockImplementation(() => {});
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    // The file's content, not its class: Node 22 hands back its own Blob, not the test environment's.
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.anything(), 'immich-logs-20261001-1702.log'));
    const saved = save.mock.calls[0]![0] as Blob;
    expect(await saved.text()).toBe('server 2026-01-02T17:02:11.000Z hello\n');
    expect(fetch).toHaveBeenCalledWith('/api/apps/immich/logs/download', { credentials: 'same-origin' });
  });

  it('with a container picked, only its lines', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(file('immich-logs.log'));
    vi.spyOn(browser, 'save').mockImplementation(() => {});
    open();
    fireEvent.click(await screen.findByRole('radio', { name: 'server' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/apps/immich/logs/download?service=server', expect.anything()),
    );
  });

  it('while a filter is on, a tooltip says the download still has every line', async () => {
    open();
    const download = await screen.findByRole('button', { name: 'Download' });
    expect(download).not.toHaveAttribute('title');
    fireEvent.click(screen.getByRole('button', { name: 'Errors only' }));
    expect(download).toHaveAttribute('title', 'Downloads every line, not only the ones the filters show');
  });

  it('a failed download says "Couldn\'t download logs." with "Try again", which tries again', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(
        expect.objectContaining({ tone: 'danger', title: "Couldn't download logs." }),
      ),
    );
    const toast = currentToasts().find((t) => t.title === "Couldn't download logs.")!;
    const retry = toast.actions![0]!;
    expect(retry).toMatchObject({ kind: 'retry', label: 'Try again' });
    if (retry.kind === 'retry') retry.run();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it('the toast\'s "Try again" button closes it and runs the retry', async () => {
    const run = vi.fn();
    renderWithDaemon(<Toaster />, { 'auth.me': fakeMe({ role: 'admin' }) });
    showToast({
      tone: 'danger',
      title: "Couldn't download logs.",
      actions: [{ kind: 'retry', label: 'Try again', run }],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(currentToasts().filter((t) => !t.leaving)).toEqual([]));
  });
});
