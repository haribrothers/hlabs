// ResetLink (US-AUTH-22): a family member opens the one-time link their admin made (US-ACCT-14) and chooses a new
// password. It's saved, their other devices are signed out and they're signed in here and taken Home; with two-factor
// on they log in with the new password and their code instead (D-114). A used or expired link says to ask for a new one.
import { LogoMark } from '@hlabs/icons';
import { PASSWORD_MIN_LENGTH, passwordIssue } from '@hlabs/shared';
import { Button, TextField } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { loginCopy as copy } from '../copy/login';
import { errorCode } from '../lib/error-copy';
import { useTRPCClient } from '../lib/trpc';
import { PasswordReveal } from '../shell/password-reveal';
import { LoginLayout } from './login-layout';
import { useFinishLogin } from './use-login';

const LOGO = 36;

export function ResetView({ token }: { token: string }) {
  const client = useTRPCClient();
  const finish = useFinishLogin();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => client.auth.resetPassword.mutate({ token, newPassword: password }),
    meta: { inlineErrors: true },
    onSuccess: ({ loggedIn, username }) =>
      loggedIn ? finish('/') : navigate({ to: '/login/password', search: { user: username } }),
    onError: (err) => {
      const code = errorCode(err);
      if (code === 'AUTH_RESET_EXPIRED') return setExpired(true);
      if (code === 'PASSWORD_TOO_SHORT') return setFieldError(copy.resetTooShort);
      if (code === 'PASSWORD_TOO_COMMON') return setFieldError(copy.resetTooCommon);
      setFailure(copy.resetFailed);
    },
  });

  const issue = password === '' ? null : passwordIssue(password);
  const error = fieldError ?? (issue === 'tooCommon' ? copy.resetTooCommon : undefined);
  const hint =
    password === '' ? undefined : [...password].length >= PASSWORD_MIN_LENGTH ? copy.resetStrong : copy.resetTooShort;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    if (issue === 'tooShort' || password === '') return setFieldError(copy.resetTooShort);
    if (issue === 'tooCommon') return setFieldError(copy.resetTooCommon);
    reset.mutate();
  };

  if (expired) {
    return (
      <LoginLayout back={{ label: copy.backToLogIn, to: '/login' }}>
        <h1 className="m-0 text-title-lg text-ink">{copy.resetExpiredTitle}</h1>
        <p className="m-0 text-body text-ink-muted" role="alert">
          {copy.resetExpired}
        </p>
        <Link to="/login" className="hl-focus mt-2 rounded-xs text-body-sm text-ink">
          {copy.backToLogIn}
        </Link>
      </LoginLayout>
    );
  }

  return (
    <LoginLayout back={{ label: copy.backToLogIn, to: '/login' }} note={copy.resetNote}>
      <span className="grid size-16 place-items-center rounded-md bg-surface-control" aria-hidden>
        <LogoMark size={LOGO} title="" simplified={false} />
      </span>
      <h1 className="m-0 text-title-lg text-ink">{copy.resetTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{copy.resetLead}</p>
      <form className="mt-3 flex w-full max-w-sm flex-col gap-4 text-left" onSubmit={submit} noValidate>
        <TextField
          label={copy.newPassword}
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldError(null);
          }}
          hint={hint}
          error={error}
          trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
        />
        {failure ? (
          <p className="m-0 text-body-sm text-danger" role="alert">
            {failure}
          </p>
        ) : null}
        <Button type="submit" size="lg" busy={reset.isPending}>
          {copy.setPassword}
        </Button>
      </form>
    </LoginLayout>
  );
}
