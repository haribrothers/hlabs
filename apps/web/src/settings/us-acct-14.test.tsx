import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { renderScreen } from '../test/render';
import { ResetLinkDialog } from './reset-link-dialog';

const URL = 'https://hlabs.local/reset/tok';
const writeText = vi.fn(async () => undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('US-ACCT-14', () => {
  it('shows a one-time link with Copy and "Works once · expires in 15 minutes"', async () => {
    const { calls } = renderScreen(
      () => (
        <>
          <ResetLinkDialog userId="u2" name="Anu" onClose={vi.fn()} />
          <Toaster />
        </>
      ),
      { 'users.resetPasswordLink': () => ({ url: URL, expiresAt: Date.now() + 15 * 60_000 }) },
    );
    expect(await screen.findByDisplayValue(URL)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: "Reset Anu's password" })).toBeInTheDocument();
    expect(screen.getByText('Works once · expires in 15 minutes')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === 'users.resetPasswordLink')).toEqual([
      { path: 'users.resetPasswordLink', input: { userId: 'u2' } },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });
});
