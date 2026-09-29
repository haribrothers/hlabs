import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError } from '../test/render';
import { confirm, ConfirmHost } from './confirm';

const reset = {
  title: 'Reset hlabs to factory settings?',
  body: 'All apps, users and settings are deleted.',
  confirmLabel: 'Reset hlabs',
  tone: 'danger' as const,
};

async function open(options: Parameters<typeof confirm>[0]) {
  render(<ConfirmHost />);
  let answer = Promise.resolve(false);
  act(() => {
    answer = confirm(options);
  });
  const dialog = await screen.findByRole('alertdialog');
  return { dialog, answer: () => answer };
}

describe('US-STATE-13', () => {
  it('asks for "Your password" (fillable by password managers) and waits until there is one', async () => {
    const onConfirm = vi.fn();
    const { dialog, answer } = await open({ ...reset, requirePassword: true, onConfirm });
    const field = within(dialog).getByLabelText('Your password');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'current-password');
    await waitFor(() => expect(field).toHaveFocus());
    const go = within(dialog).getByRole('button', { name: 'Reset hlabs' });
    expect(go).toBeDisabled();
    fireEvent.change(field, { target: { value: 'correct horse battery' } });
    expect(go).toBeEnabled();
    // Enter in the field confirms; the caller's mutation carries the password.
    fireEvent.submit(field.closest('form')!);
    await expect(answer()).resolves.toBe(true);
    expect(onConfirm).toHaveBeenCalledWith({ password: 'correct horse battery' });
  });

  it('a typed name must match exactly: case-sensitive, spaces around it ignored', async () => {
    const { dialog } = await open({ ...reset, typeToConfirm: 'hlabs' });
    const field = within(dialog).getByLabelText('Type hlabs to confirm');
    const go = within(dialog).getByRole('button', { name: 'Reset hlabs' });
    for (const [text, ok] of [
      ['', false],
      ['hlab', false],
      ['HLABS', false],
      ['hlabs!', false],
      ['  hlabs ', true],
      ['hlabs', true],
    ] as const) {
      fireEvent.change(field, { target: { value: text } });
      expect(go.hasAttribute('disabled')).toBe(!ok);
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('both together: the button waits for the password and the name', async () => {
    const { dialog } = await open({ ...reset, requirePassword: true, typeToConfirm: 'hlabs' });
    const go = within(dialog).getByRole('button', { name: 'Reset hlabs' });
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'pw' } });
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Type hlabs to confirm'), { target: { value: 'hlabs' } });
    expect(go).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('a wrong password says so on the field, clears it and puts focus back there', async () => {
    const onConfirm = vi.fn(async ({ password }: { password?: string }) => {
      if (password !== 'right') throw daemonError('AUTH_INVALID_PASSWORD');
    });
    const { dialog, answer } = await open({ ...reset, requirePassword: true, onConfirm });
    const field = within(dialog).getByLabelText('Your password');
    const go = within(dialog).getByRole('button', { name: 'Reset hlabs' });
    fireEvent.change(field, { target: { value: 'wrong' } });
    go.focus();
    fireEvent.click(go);
    await waitFor(() => expect(field).toHaveValue(''));
    expect(field).toHaveAccessibleDescription("That password isn't right.");
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    // Typing again clears the message.
    fireEvent.change(field, { target: { value: 'right' } });
    expect(field).not.toHaveAttribute('aria-invalid');
    fireEvent.click(go);
    await expect(answer()).resolves.toBe(true);
  });
});
