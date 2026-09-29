import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { setLoggingOut, useSignedOutHere } from './session-watch';

function Probe() {
  const signedOut = useSignedOutHere();
  return (
    <button type="button" onClick={() => void signedOut()}>
      revoked
    </button>
  );
}

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
  setLoggingOut(false);
});

describe('US-AUTH-15', () => {
  it('a revoked session goes to /login and says it was logged out on this device', async () => {
    const { router } = renderScreen(Probe, {}, { path: '/files' });
    fireEvent.click(await screen.findByRole('button', { name: 'revoked' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(currentToasts().map((t) => t.title)).toEqual(['You were logged out on this device.']);
  });

  it('logging out in this tab says nothing extra', async () => {
    setLoggingOut(true);
    const { router } = renderScreen(Probe, {}, { path: '/files' });
    fireEvent.click(await screen.findByRole('button', { name: 'revoked' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(currentToasts()).toEqual([]);
  });
});
