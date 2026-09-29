import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { CodeView } from './code-view';

describe('US-AUTH-11', () => {
  it("when the secret can't be read: says to use a recovery code or ask the admin, and offers the recovery field", async () => {
    renderScreen(() => <CodeView challenge="c1" />, {
      'auth.verifyTotp': () => Promise.reject(daemonError('AUTH_SECRET_UNAVAILABLE')),
    });
    for (let i = 0; i < 6; i++)
      fireEvent.change(await screen.findByLabelText(`Digit ${i + 1}`), { target: { value: '1' } });
    expect(
      await screen.findByText("hlabs can't check codes right now. Use a recovery code or ask your admin."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use a recovery code' })).toBeInTheDocument();
  });
});
