import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirm, ConfirmHost } from './confirm';

const restartAll = {
  title: 'Restart all apps?',
  body: 'Apps will be unavailable for about a minute. Anyone watching or syncing will be disconnected.',
  confirmLabel: 'Restart',
};

function setup() {
  render(
    <>
      <button type="button">Open</button>
      <ConfirmHost />
    </>,
  );
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  return opener;
}

function setPhone(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: !phone,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia; tests put one in.
  delete window.matchMedia;
});

describe('US-STATE-11', () => {
  it('asks with a question, says what happens, and labels the buttons Cancel and the verb', async () => {
    setup();
    void act(() => void confirm(restartAll));
    const dialog = await screen.findByRole('alertdialog', { name: 'Restart all apps?' });
    expect(dialog).toHaveAccessibleDescription(restartAll.body);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(OK|Yes)$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('focus starts on the verb (Cancel when destructive), Tab stays inside, and the page behind is hidden', async () => {
    const opener = setup();
    void act(() => void confirm(restartAll));
    await screen.findByRole('alertdialog');
    const restart = screen.getByRole('button', { name: 'Restart' });
    await waitFor(() => expect(restart).toHaveFocus());
    expect(opener.closest('[aria-hidden="true"]')).not.toBeNull();
    // Tab from the last button wraps to the first, and Shift+Tab back (focus is trapped).
    fireEvent.keyDown(restart, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Tab', shiftKey: true });
    expect(restart).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    void act(
      () => void confirm({ ...restartAll, title: 'Uninstall Immich?', confirmLabel: 'Uninstall', tone: 'danger' }),
    );
    await screen.findByRole('alertdialog', { name: 'Uninstall Immich?' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    [
      'the backdrop',
      () => {
        const outside = document.body;
        fireEvent.pointerDown(outside);
        fireEvent.pointerUp(outside);
        fireEvent.click(outside);
      },
    ],
  ])('%s closes it, does nothing, and gives focus back', async (_how, dismiss) => {
    const opener = setup();
    const onConfirm = vi.fn();
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = confirm({ ...restartAll, onConfirm });
    });
    await screen.findByRole('alertdialog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restart' })).toHaveFocus());
    act(dismiss);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await expect(answer).resolves.toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('confirming runs the action and resolves true', async () => {
    setup();
    const onConfirm = vi.fn(async () => {});
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = confirm({ ...restartAll, onConfirm });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Restart' }));
    await expect(answer).resolves.toBe(true);
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a second confirm waits until the first closes', async () => {
    setup();
    act(() => {
      void confirm(restartAll);
      void confirm({ ...restartAll, title: 'Restart Immich?' });
    });
    await screen.findByRole('alertdialog', { name: 'Restart all apps?' });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alertdialog', { name: 'Restart Immich?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('on a phone it is a bottom sheet with the verb above Cancel', async () => {
    setPhone(true);
    setup();
    void act(() => void confirm(restartAll));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveClass('hl-dialog-sheet');
    const buttons = screen.getAllByRole('button').filter((b) => dialog.contains(b));
    expect(buttons.map((b) => b.textContent)).toEqual(['Restart', 'Cancel']);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });
});
