// US-APP-28 · Choose who gets into a public app: hlabs's sign-in on the public address itself (D-178, PublicSignIn),
// its two steps as plain forms posting back to /.hlabs/sign-in, "Turn on two-factor login first", too many tries,
// signing out, "<App> isn't running", and "no access" with Sign out instead of Home.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppPage, readAppPageData, type NoAccessData } from './app-pages';
import type { PublicSignInData } from './public-pages';

const icon = { gradient: null, fallback: 'image' } as const;

const signIn = (over: Partial<PublicSignInData> = {}): PublicSignInData => ({
  kind: 'publicSignIn',
  step: 'password',
  appName: 'Immich',
  icon: { ...icon },
  host: 'photos.example.com',
  next: '/share/abc',
  username: null,
  challenge: null,
  error: null,
  retryAfterSeconds: null,
  ...over,
});

const formOf = (el: HTMLElement) => el.closest('form') as HTMLFormElement;
const fields = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());

describe('US-APP-28', () => {
  it('the password step asks for the hlabs account and posts username, password and next', () => {
    render(<AppPage data={signIn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to open Immich' })).toBeInTheDocument();
    expect(
      screen.getByText('photos.example.com is shared from an hlabs home server. Sign in with your hlabs account.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your hlabs account, not your Immich one.')).toBeInTheDocument();
    expect(screen.getByText('Forgot your password? Ask the person who runs this hlabs.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'asha' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    const form = formOf(screen.getByRole('button', { name: 'Continue' }));
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/.hlabs/sign-in');
    expect(fields(form)).toEqual({ next: '/share/abc', username: 'asha', password: 'secret' });
    expect(document.title).toBe('Sign in · Immich');
  });

  it('a wrong password says so and keeps the username', () => {
    render(<AppPage data={signIn({ error: 'invalid', username: 'asha' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That username or password is wrong. Check them and try again.',
    );
    expect(screen.getByLabelText('Username')).toHaveValue('asha');
  });

  it('a locked username says how long to wait', () => {
    render(<AppPage data={signIn({ error: 'locked', retryAfterSeconds: 600 })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Too many tries. Try again in 10 minutes.');
  });

  it('the code step posts the challenge and the 6-digit code, or a recovery code', () => {
    render(<AppPage data={signIn({ step: 'code', username: 'asha', challenge: 'ch-1' })} />);
    expect(
      screen.getByText('One more step. hlabs asks everyone for a code before opening a public app.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Type the 6-digit code from your authenticator app.')).toBeInTheDocument();
    const verify = screen.getByRole('button', { name: 'Verify' });
    expect(verify).toBeDisabled();
    const group = screen.getByRole('group', { name: '6-digit code' });
    fireEvent.paste(within(group).getAllByRole('textbox')[0]!, { clipboardData: { getData: () => '123456' } });
    expect(fields(formOf(verify))).toEqual({ next: '/share/abc', challenge: 'ch-1', code: '123456' });

    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'abcd-efgh' } });
    expect(fields(formOf(screen.getByRole('button', { name: 'Verify' })))).toEqual({
      next: '/share/abc',
      challenge: 'ch-1',
      recoveryCode: 'abcd-efgh',
    });
    expect(screen.getByRole('button', { name: 'Use the 6-digit code instead' })).toBeInTheDocument();
  });

  it('a wrong code says to try the newest one', () => {
    render(<AppPage data={signIn({ step: 'code', challenge: 'ch-1', error: 'invalid' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent("That code didn't work. Try the newest one.");
  });

  it('someone without two-factor is told to turn it on first, with Back to the sign-in', () => {
    render(<AppPage data={signIn({ step: 'no2fa' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Turn on two-factor login first. Opening Immich from the internet needs it. Turn it on in hlabs at home, under Settings › Account, then come back here.',
    );
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/.hlabs/sign-in?next=%2Fshare%2Fabc');
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('too many tries from this address says how long it is refused', () => {
    render(<AppPage data={signIn({ step: 'tooManyTries', retryAfterSeconds: 3600 })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Too many tries from your address. Try again in 60 minutes.');
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('every public page names its address in "Protected by hlabs"', () => {
    render(<AppPage data={signIn()} />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Protected by hlabs · photos.example.com');
  });

  it('signing out posts to /.hlabs/sign-out', () => {
    render(
      <AppPage data={{ kind: 'publicSignOut', appName: 'Immich', icon: { ...icon }, host: 'photos.example.com' }} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Sign out of Immich?' })).toBeInTheDocument();
    const form = formOf(screen.getByRole('button', { name: 'Sign out' }));
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/.hlabs/sign-out');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Protected by hlabs · photos.example.com');
  });

  it('a stopped app says it isn’t running, and nothing more', () => {
    render(
      <AppPage data={{ kind: 'appNotRunning', appName: 'Immich', icon: { ...icon }, host: 'photos.example.com' }} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: "Immich isn't running" })).toBeInTheDocument();
    expect(screen.getByText('Try again later.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.title).toBe("Immich isn't running");
  });

  it('"no access" on a public address offers Sign out instead of Home', () => {
    const data: NoAccessData = {
      kind: 'noAccess',
      homeUrl: 'https://photos.example.com/.hlabs/sign-out',
      publicHost: 'photos.example.com',
      appName: 'Immich',
      adminName: 'Hari',
      username: 'ravi',
      displayName: 'Ravi',
      avatarColor: null,
      accent: 'violet',
    };
    render(<AppPage data={data} />);
    expect(screen.getByRole('heading', { level: 1, name: "You don't have access to this" })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to Home' })).toBeNull();
    const form = formOf(screen.getByRole('button', { name: 'Sign out' }));
    expect(form.getAttribute('action')).toBe('/.hlabs/sign-out');
    expect(form.getAttribute('method')).toBe('post');
  });

  it('reads the page the daemon sends', () => {
    const doc = document.implementation.createHTMLDocument();
    const script = doc.createElement('script');
    script.id = 'hlabs-page';
    script.textContent = JSON.stringify(signIn({ step: 'no2fa' }));
    doc.head.append(script);
    expect(readAppPageData(doc)).toMatchObject({ kind: 'publicSignIn', step: 'no2fa' });
  });
});
