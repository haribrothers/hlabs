import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { daemonError, renderWithDaemon } from '../test/render';
import { confirm, CONFIRM_PENDING_MS, ConfirmHost } from './confirm';
import { currentToasts, dismissToast } from './toasts';

const restartAll = {
  title: 'Restart all apps?',
  body: 'Apps will be unavailable for about a minute. Anyone watching or syncing will be disconnected.',
  confirmLabel: 'Restart',
};

function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  render(
    <>
      <button type="button">Open</button>
      <ConfirmHost />
    </>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-STATE-12', () => {
  it('while the action runs: a spinner, both buttons disabled, Escape and the backdrop ignored', async () => {
    setup();
    const action = deferred();
    let answer = Promise.resolve(false);
    act(() => {
      answer = confirm({ ...restartAll, onConfirm: () => action.promise });
    });
    const dialog = await screen.findByRole('alertdialog');
    const go = within(dialog).getByRole('button', { name: 'Restart' });
    fireEvent.click(go);
    expect(go).toBeDisabled();
    expect(go).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(go, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // A { jobId } closes it: long work reports through jobs and toasts, not the dialog.
    await act(async () => action.resolve({ jobId: 'j1' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await expect(answer).resolves.toBe(true);
  });

  it('a failure keeps it open with the mapped error inline and the buttons back', async () => {
    setup();
    let calls = 0;
    act(() => {
      void confirm({
        ...restartAll,
        onConfirm: async () => {
          calls++;
          if (calls === 1) throw daemonError('JOB_EXCLUSIVE_RUNNING');
          if (calls === 2) throw daemonError('SOMETHING_NEW');
        },
      });
    });
    const dialog = await screen.findByRole('alertdialog');
    const go = within(dialog).getByRole('button', { name: 'Restart' });
    fireEvent.click(go);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'hlabs is busy. Wait for what it’s doing to finish, then try again.',
    );
    expect(go).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();

    // Unknown codes get the generic line, never the raw message.
    fireEvent.click(go);
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Something went wrong. Try again. If it keeps happening, check the logs in Settings › Advanced.',
      ),
    );
    expect(dialog).not.toHaveTextContent('SOMETHING_NEW');
    fireEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a network error shows the offline line', async () => {
    setup();
    act(() => {
      void confirm({
        ...restartAll,
        onConfirm: async () => {
          throw TRPCClientError.from(new TypeError('Failed to fetch'));
        },
      });
    });
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach hlabs. Check your connection and try again.",
    );
    expect(dialog).not.toHaveTextContent('Failed to fetch');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('danger uses the destructive button', async () => {
    setup();
    act(() => {
      void confirm({ ...restartAll, title: 'Uninstall Immich?', confirmLabel: 'Uninstall', tone: 'danger' });
    });
    const dialog = await screen.findByRole('alertdialog', { name: 'Uninstall Immich?' });
    expect(within(dialog).getByRole('button', { name: 'Uninstall' })).toHaveClass('hl-btn-destructive');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it.each([
    ['succeeds', true, 'Restart finished'],
    ['fails', false, 'hlabs is busy. Wait for what it’s doing to finish, then try again.'],
  ])('after 30 s it closes, and when the action %s the result is a toast', async (_how, ok, toast) => {
    vi.useFakeTimers();
    renderWithDaemon(
      <>
        <ConfirmHost />
        <Toaster />
      </>,
    );
    const action = deferred();
    let answer = Promise.resolve(!ok);
    act(() => {
      answer = confirm({ ...restartAll, onConfirm: () => action.promise });
    });
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restart' }));
    await act(async () => vi.advanceTimersByTime(CONFIRM_PENDING_MS - 1));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => (ok ? action.resolve(undefined) : action.reject(daemonError('JOB_EXCLUSIVE_RUNNING'))));
    expect(screen.getByText(toast)).toBeInTheDocument();
    await expect(answer).resolves.toBe(ok);
  });
});
