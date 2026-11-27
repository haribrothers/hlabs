// US-PHONE-03 · Bottom sheets with soft spring and drag to dismiss: a ModalDialog on a phone is a sheet with a grab
// handle, a backdrop and "✕"; dragged down it closes; with unsaved input only its buttons close it; Reduce motion
// fades it in 150 ms. The drag itself, the backdrop and the 92% height are checked in the browser
// (e2e/us-phone-03.spec.ts).
import { Button, ModalDialog, motion, SHEET_FADE_MS, sheetDismisses, UiStringsProvider } from '@hlabs/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uiStrings } from '../copy/shell';
import { phoneViewport } from '../test/phone';

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  document.documentElement.removeAttribute('data-motion');
});

function Sheet({ guarded = false, dismissible = true }: { guarded?: boolean; dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <UiStringsProvider strings={uiStrings}>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <ModalDialog
        open={open}
        onOpenChange={setOpen}
        title="Uninstall Jellyfin?"
        guarded={guarded}
        dismissible={dismissible}
        actions={<Button onClick={() => setOpen(false)}>Cancel</Button>}
      >
        <input aria-label="Name" />
        <p>What happens to your data.</p>
      </ModalDialog>
    </UiStringsProvider>
  );
}

const sheet = () => screen.getByRole('dialog');
const state = () => screen.getByTestId('state').textContent;

describe('US-PHONE-03', () => {
  it('a dialog opens as a bottom sheet with a grab handle, a backdrop and a Close button, focus inside', async () => {
    render(<Sheet />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Uninstall Jellyfin?' });
    expect(dialog).toHaveClass('hl-sheet', 'hl-dialog-sheet');
    expect(dialog.querySelector('.hl-sheet-handle')).not.toBeNull();
    expect(document.querySelector('.hl-scrim')).not.toBeNull();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(state()).toBe('closed');
    // Focus goes back to what opened it.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('Escape closes it', async () => {
    render(<Sheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(sheet(), { key: 'Escape' });
    await waitFor(() => expect(state()).toBe('closed'));
  });

  it('dragged down far enough it closes; a drag that starts on a field does nothing', async () => {
    render(<Sheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await screen.findByRole('dialog');
    const field = screen.getByLabelText('Name');
    fireEvent.pointerDown(field, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(sheet(), { pointerId: 1, clientY: 600 });
    fireEvent.pointerUp(sheet(), { pointerId: 1, clientY: 600 });
    expect(state()).toBe('open');
    const title = screen.getByText('Uninstall Jellyfin?');
    fireEvent.pointerDown(title, { pointerId: 2, button: 0, clientY: 100 });
    fireEvent.pointerMove(sheet(), { pointerId: 2, clientY: 400 });
    fireEvent.pointerUp(sheet(), { pointerId: 2, clientY: 400 });
    await waitFor(() => expect(state()).toBe('closed'));
  });

  it('past 30% of its height or faster than 500 px/s down it closes; otherwise it springs back', () => {
    expect(sheetDismisses(301, 0, 1000)).toBe(true);
    expect(sheetDismisses(299, 0, 1000)).toBe(false);
    expect(sheetDismisses(50, 501, 1000)).toBe(true);
    expect(sheetDismisses(50, 499, 1000)).toBe(false);
    // The soft spring.
    expect(motion.springSoft).toEqual({ type: 'spring', stiffness: 300, damping: 30 });
  });

  it('with unsaved input neither drag nor the backdrop closes it; its own buttons do', async () => {
    render(<Sheet guarded />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await screen.findByRole('dialog');
    await act(() => new Promise((r) => setTimeout(r, 10)));
    fireEvent.pointerDown(document.body);
    const title = screen.getByText('Uninstall Jellyfin?');
    fireEvent.pointerDown(title, { pointerId: 3, button: 0, clientY: 100 });
    fireEvent.pointerMove(sheet(), { pointerId: 3, clientY: 700 });
    fireEvent.pointerUp(sheet(), { pointerId: 3, clientY: 700 });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(state()).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(state()).toBe('closed'));
  });

  it('a running destructive step (not dismissible) has no Close button and ignores Escape', async () => {
    render(<Sheet dismissible={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.keyDown(sheet(), { key: 'Escape' });
    expect(state()).toBe('open');
  });

  it('with Reduce motion it fades in 150 ms instead of sliding', async () => {
    document.documentElement.setAttribute('data-motion', 'reduced');
    render(<Sheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = await screen.findByRole('dialog');
    expect(SHEET_FADE_MS).toBe(150);
    // A fade starts from transparent and never moves the sheet.
    expect(dialog.style.transform === '' || dialog.style.transform === 'none').toBe(true);
  });
});
