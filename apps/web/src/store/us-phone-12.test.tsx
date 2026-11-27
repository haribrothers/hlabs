// US-PHONE-12 · Install an app from the phone: the install sheet as a bottom sheet with the desktop's steps; once a
// field changes it can't be swiped or tapped away; Install closes it and the page stays, its button showing the
// progress; a failed install comes back as a sheet with the same words and Try again.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { appDetail, details, folder } from '../test/store';
import { AppDetails } from './app-details';
import { InstallSheet } from './install-sheet';
import { watchInstall } from './install-watch';
import { PhoneInstallFailed } from './phone-install-failed';

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => restore());

/** Events the test sends, to everything listening. */
function events() {
  const waiting: Array<(v: unknown) => void> = [];
  return {
    stream: () => new Promise((r) => waiting.push(r)),
    send: (data: unknown) => {
      for (const r of waiting.splice(0)) r({ id: String(Math.random()), data });
    },
  };
}

describe('US-PHONE-12', () => {
  it('Install opens the install sheet as a bottom sheet with the same folders and steps', async () => {
    renderScreen(
      () => <AppDetails appId="immich" />,
      {
        'auth.me': fakeMe(),
        'store.getApp': () => details({ folders: [folder()] }),
        'apps.list': () => ({ apps: [] }),
        'events.stream': () => new Promise(() => {}),
      },
      { path: '/store/app/immich' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    const sheet = await screen.findByRole('dialog', { name: /Install Immich/ });
    expect(sheet).toHaveClass('hl-sheet');
    expect(sheet).toHaveTextContent('Home › Photos');
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
  });

  it('once a field changes, dragging it down does nothing; Cancel closes it', async () => {
    const onOpenChange = vi.fn();
    const optional = folder({ key: 'import', label: 'Import', required: false });
    renderScreen(
      () => <InstallSheet details={details({ folders: [folder(), optional] })} open onOpenChange={onOpenChange} />,
      {
        'apps.install': () => ({ jobId: 'j1' }),
        'apps.list': () => ({ apps: [] }),
      },
    );
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('switch', { name: 'Give access to Import' }));
    const title = screen.getByText('Install Immich');
    fireEvent.pointerDown(title, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientY: 700 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientY: 700 });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Install starts the job, closes the sheet and stays on the page', async () => {
    const onOpenChange = vi.fn();
    const { router, calls } = renderScreen(
      () => <InstallSheet details={details({ folders: [folder()] })} open onOpenChange={onOpenChange} />,
      { 'apps.install': () => ({ jobId: 'j1' }), 'apps.list': () => ({ apps: [] }) },
      { path: '/store/app/immich' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls.some((c) => c.path === 'apps.install')).toBe(true);
    expect(router.state.location.pathname).toBe('/store/app/immich');
  });

  it('a failed install comes back as a sheet saying why, with Try again', async () => {
    const ev = events();
    const retry = vi.fn(() => ({ jobId: 'j2' }));
    renderScreen(PhoneInstallFailed, {
      'apps.get': () => appDetail({ state: 'install_failed', stateDetail: { code: 'APP_PULL_FAILED' } }),
      'store.getApp': () => details(),
      'apps.list': () => ({ apps: [] }),
      'apps.retryInstall': retry,
      'events.stream': ev.stream,
    });
    act(() => watchInstall('immich'));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    act(() => ev.send({ type: 'app.stateChanged', data: { appId: 'immich', state: 'install_failed', detail: null } }));
    const sheet = await screen.findByRole('alertdialog', { name: "Immich didn't install" });
    expect(sheet).toHaveClass('hl-sheet');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith({ appId: 'immich' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
