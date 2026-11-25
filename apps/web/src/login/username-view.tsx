// LoginUsername (US-AUTH-02, US-AUTH-03): type a username when your name isn't listed, or the list is hidden.
import { isStandalone } from '../lib/install-app';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, Switch, TextField, useIsPhone } from '@hlabs/ui';
import { PasswordReveal } from '../shell/password-reveal';
import { PhoneLogInButton, PhoneLoginError, PhoneLoginField, PhoneLoginTitle, PhoneRememberRow } from './phone-login';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPC } from '../lib/trpc';
import { OnboardingLogo } from '../onboarding/onboarding-layout';
import { LoginLayout } from './login-layout';
import { withNext } from './search';
import { lockedSearch, loginFailure, useLogin } from './use-login';
import { PublicLoginView } from './public-login';

const copy = loginCopy;

export function UsernameView({ next, reason }: { next?: string; reason?: 'timeout' }) {
  const trpc = useTRPC();
  // "All users" only when the list is shown (US-AUTH-02).
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  // On the dashboard's public address: LoginPublic (US-SYS-46). Nothing until it's known, so "Remember me" never shows
  // there for a moment.
  if (list.isPending) return <LoginLayout>{null}</LoginLayout>;
  if (list.data?.via === 'public') return <PublicLoginView next={next} />;
  return <HomeUsernameView next={next} reason={reason} listShown={(list.data?.users.length ?? 0) > 0} />;
}

function HomeUsernameView({ next, reason, listShown }: { next?: string; reason?: 'timeout'; listShown: boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // On by default in the installed app only: it has its own cookies and is this person's own (US-INST-29).
  const [remember, setRemember] = useState(isStandalone);
  // Back here after the code step timed out (US-AUTH-08).
  const [error, setError] = useState<string | null>(reason === 'timeout' ? copy.timedOut : null);
  const field = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  const phone = useIsPhone();
  const errorId = useId();
  const navigate = useNavigate();
  useEffect(() => field.current?.focus(), []);

  const login = useLogin(next);
  const busy = login.isPending;
  const ready = username.trim() !== '' && password !== '';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setError(null);
    login.mutate(
      { username, password, remember },
      {
        // The same words whether the account doesn't exist, is disabled or the password is wrong (US-AUTH-04).
        onError: (err) => {
          const failure = loginFailure(err);
          if (failure === 'locked') {
            void navigate({ to: '/login/locked', search: lockedSearch(err, username, next) });
          } else if (failure === 'credentials') {
            setPassword('');
            setError(copy.wrongDetails);
            passwordField.current?.focus();
          } else {
            setError(failure === 'unreachable' ? copy.unreachable : copy.failed);
          }
        },
      },
    );
  };

  const back = listShown ? { label: copy.allUsers, to: '/login/users', search: withNext(next) } : undefined;
  const forgot = isFeatureEnabled('forgotPassword') ? (
    <Link
      to="/login/forgot"
      search={{ from: 'username', ...(username.trim() ? { user: username.trim() } : {}), ...withNext(next) }}
      className={phone ? 'hl-p-link hl-focus self-center' : 'hl-focus rounded-xs text-body-sm text-ink no-underline'}
    >
      {copy.forgot}
    </Link>
  ) : null;
  if (phone)
    // PhoneLogin's username form (US-PHONE-05): the lockup, "Log in to hlabs", Username and Password as rows with
    // "Remember this phone", then "Log in" and "Forgot password?".
    return (
      <LoginLayout back={back}>
        <PhoneLoginTitle>{copy.usernameTitle}</PhoneLoginTitle>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <div className="hl-p-group">
              <PhoneLoginField
                ref={field}
                label={copy.username}
                placeholder={copy.username}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="next"
                spellCheck={false}
                readOnly={busy}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <PhoneLoginField
                ref={passwordField}
                label={copy.password}
                placeholder={copy.password}
                type={shown ? 'text' : 'password'}
                autoComplete="current-password"
                enterKeyHint="go"
                readOnly={busy}
                value={password}
                errorId={error ? errorId : undefined}
                onChange={(e) => setPassword(e.target.value)}
                trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
              />
              <PhoneRememberRow checked={remember} onChange={setRemember} />
            </div>
            <PhoneLoginError id={errorId}>{error}</PhoneLoginError>
          </div>
          <PhoneLogInButton disabled={!ready} busy={busy} />
          {forgot}
        </form>
      </LoginLayout>
    );
  return (
    <LoginLayout back={back}>
      <OnboardingLogo />
      <h1 className="m-0 text-display">{copy.usernameTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{copy.usernameLead}</p>
      <form className="mt-4 flex w-full max-w-sm flex-col gap-4 text-left" onSubmit={submit}>
        <TextField
          ref={field}
          label={copy.username}
          placeholder={copy.usernamePlaceholder}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          spellCheck={false}
          readOnly={busy}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          ref={passwordField}
          label={copy.password}
          error={error ?? undefined}
          announce="polite"
          type={shown ? 'text' : 'password'}
          autoComplete="current-password"
          enterKeyHint="go"
          trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
          readOnly={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Switch label={phone ? copy.rememberPhone : copy.remember} checked={remember} onChange={setRemember} />
        <Button type="submit" size="lg" disabled={!ready} busy={busy}>
          {copy.logIn}
        </Button>
      </form>
      {forgot}
    </LoginLayout>
  );
}
