import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { renderScreen } from '../test/render';
import { chooseLoginView } from './choose';
import { CodeView } from './code-view';
import { LockedView } from './locked-view';
import { PasswordView } from './password-view';
import { LAST_USER_KEY } from './remembered';

const me = () => ({
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  csrfToken: 't',
  remember: false,
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('US-AUTH-18', () => {
  it("after the last step, an app's address the server allowed loads that app", async () => {
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {});
    renderScreen(() => <CodeView challenge="c1" next="https://immich.hlabs.local/photos" />, {
      'auth.verifyTotp': () => ({ redirectTo: 'https://immich.hlabs.local/photos' }),
      'auth.me': me,
    });
    for (let i = 0; i < 6; i++)
      fireEvent.change(await screen.findByLabelText(`Digit ${i + 1}`), { target: { value: '1' } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://immich.hlabs.local/photos'));
  });

  it('a path stays in the dashboard', async () => {
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {});
    const { router } = renderScreen(() => <CodeView challenge="c1" next="/files" />, {
      'auth.verifyTotp': () => ({ redirectTo: '/files' }),
      'auth.me': me,
    });
    for (let i = 0; i < 6; i++)
      fireEvent.change(await screen.findByLabelText(`Digit ${i + 1}`), { target: { value: '1' } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('next is kept by every log-in screen and link', async () => {
    const next = 'https://immich.hlabs.local/photos';
    expect(chooseLoginView({ signedIn: false, remembered: null, listedUsers: 2, next })).toEqual({
      to: '/login/users',
      search: { next },
    });
    localStorage.setItem(
      LAST_USER_KEY,
      JSON.stringify({ username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null, remember: false }),
    );
    const { unmount } = renderScreen(() => <PasswordView username="hari" next={next} />, {
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    const another = await screen.findByRole('link', { name: 'Not Hari? Use another account' });
    expect(another.getAttribute('href')).toContain(`next=${encodeURIComponent(next)}`);
    unmount();
    renderScreen(() => <LockedView user="hari" until={Date.now() + 60_000} next={next} />, {
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    expect((await screen.findByRole('link', { name: 'Use another account' })).getAttribute('href')).toContain(
      `next=${encodeURIComponent(next)}`,
    );
  });
});
