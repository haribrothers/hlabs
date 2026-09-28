// LoginUsername (US-AUTH-02, US-AUTH-03): type a username when your name isn't listed, or the list is hidden.
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, Switch, TextField } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPC } from '../lib/trpc';
import { OnboardingLogo } from '../onboarding/onboarding-layout';
import { LoginLayout } from './login-layout';
import { withNext } from './search';
import { loginFailure, useLogin } from './use-login';

const copy = loginCopy;

export function UsernameView({ next, reason }: { next?: string; reason?: 'timeout' }) {
  const trpc = useTRPC();
  // "All users" only when the list is shown (US-AUTH-02).
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  const listShown = (list.data?.users.length ?? 0) > 0;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  // Back here after the code step timed out (US-AUTH-08).
  const [error, setError] = useState<string | null>(reason === 'timeout' ? copy.timedOut : null);
  const field = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
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
            void navigate({ to: '/login/locked', search: withNext(next) });
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

  return (
    <LoginLayout back={listShown ? { label: copy.allUsers, to: '/login/users', search: withNext(next) } : undefined}>
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
          type="password"
          autoComplete="current-password"
          readOnly={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Switch label={copy.remember} checked={remember} onChange={setRemember} />
        <Button type="submit" size="lg" disabled={!ready} busy={busy}>
          {copy.logIn}
        </Button>
      </form>
      {isFeatureEnabled('forgotPassword') ? <p className="m-0 text-body-sm">{copy.forgot}</p> : null}
    </LoginLayout>
  );
}
