// Login (US-AUTH-01, US-AUTH-06): the chosen account greeted by name, asking only for the password.
import { isFeatureEnabled } from '@hlabs/shared';
import { Avatar, avatarColorFor, Button, Switch, TextField, useIsPhone } from '@hlabs/ui';
import { isStandalone } from '../lib/install-app';
import { PasswordReveal } from '../shell/password-reveal';
import { PhoneLogInButton, PhoneLoginError, PhoneLoginField, PhoneRememberRow } from './phone-login';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPC } from '../lib/trpc';
import { LoginLayout } from './login-layout';
import { forgetRememberedUser, readRememberedUser } from './remembered';
import { withNext } from './search';
import { lockedSearch, loginFailure, useLogin } from './use-login';

const copy = loginCopy;

export function PasswordView({ username, next, reason }: { username: string; next?: string; reason?: 'timeout' }) {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  // The account remembered on this device, as saved at its last log-in (US-AUTH-06), or the one chosen from the
  // list. A remembered account that no longer exists is still shown: logging in just fails like a wrong password.
  const remembered = readRememberedUser();
  const user =
    (remembered?.username === username ? remembered : undefined) ??
    list.data?.users.find((u) => u.username === username);
  const listShown = (list.data?.users.length ?? 0) > 0;
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  // On a phone the switch shows here too (PhoneLogin, US-PHONE-05), set as this account last chose on this device.
  const phone = useIsPhone();
  const [remember, setRemember] = useState(() =>
    remembered?.username === username ? remembered.remember : isStandalone(),
  );
  const field = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const login = useLogin(next, username);
  const navigate = useNavigate();
  // Back here after the code step timed out (US-AUTH-08).
  const [error, setError] = useState<string | null>(reason === 'timeout' ? copy.timedOut : null);
  useEffect(() => field.current?.focus(), [user]);

  if (!user && (list.isError || list.data)) return <Navigate to="/login/username" search={withNext(next)} replace />;
  if (!user) return <LoginLayout>{null}</LoginLayout>;

  const role = copy.roles[user.role];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!password || login.isPending) return;
    setError(null);
    login.mutate(
      // No switch here: the choice from this account's last log-in on this device (US-AUTH-14).
      {
        username: user.username,
        password,
        remember: phone ? remember : remembered?.username === user.username && remembered.remember,
      },
      {
        onError: (err) => {
          const failure = loginFailure(err);
          if (failure === 'locked') {
            void navigate({ to: '/login/locked', search: lockedSearch(err, user.username, next) });
          } else if (failure === 'credentials') {
            setPassword('');
            setError(copy.wrongPassword);
            field.current?.focus();
          } else {
            setError(failure === 'unreachable' ? copy.unreachable : copy.failed);
          }
        },
      },
    );
  };

  const back = listShown ? { label: copy.allUsers, to: '/login/users', search: withNext(next) } : undefined;
  if (phone)
    // PhoneLogin for the account remembered on this phone (US-PHONE-05): the person, then only "Password" with
    // "Remember this phone", "Log in" and "Forgot password?".
    return (
      <LoginLayout back={back}>
        <div className="flex flex-col items-center gap-2 pt-6 text-center">
          <Avatar name={user.displayName} color={avatarColorFor(user.username, user.avatarColor)} size="xl" />
          <h1 className="m-0 text-title-1 font-bold">{copy.welcomeBack(user.displayName)}</h1>
          <p className="m-0 text-subhead text-ink-muted">{copy.who(user.username, role)}</p>
        </div>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <input type="hidden" name="username" autoComplete="username" value={user.username} />
          <div className="flex flex-col gap-1.5">
            <div className="hl-p-group">
              <PhoneLoginField
                ref={field}
                label={copy.password}
                placeholder={copy.password}
                type={shown ? 'text' : 'password'}
                autoComplete="current-password"
                enterKeyHint="go"
                readOnly={login.isPending}
                value={password}
                errorId={error ? errorId : undefined}
                onChange={(e) => setPassword(e.target.value)}
                trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
              />
              <PhoneRememberRow checked={remember} onChange={setRemember} />
            </div>
            <PhoneLoginError id={errorId}>{error}</PhoneLoginError>
          </div>
          <PhoneLogInButton disabled={!password} busy={login.isPending} />
          <div className="flex flex-col items-center">
            {isFeatureEnabled('forgotPassword') ? (
              <Link
                to="/login/forgot"
                search={{ from: 'password', user: user.username, ...withNext(next) }}
                className="hl-p-link hl-focus"
              >
                {copy.forgot}
              </Link>
            ) : null}
            <Link
              to={listShown ? '/login/users' : '/login/username'}
              search={withNext(next)}
              onClick={() => forgetRememberedUser()}
              className="hl-p-link hl-focus"
            >
              {copy.notYou(user.displayName)}
            </Link>
          </div>
        </form>
      </LoginLayout>
    );
  return (
    <LoginLayout back={back}>
      <Avatar name={user.displayName} color={avatarColorFor(user.username, user.avatarColor)} />
      <h1 className="m-0 mt-2 text-display">{copy.welcomeBack(user.displayName)}</h1>
      <p className="m-0 text-body text-ink-muted">{copy.who(user.username, role)}</p>
      <form className="mt-4 flex w-full max-w-sm flex-col gap-3" onSubmit={submit}>
        <input type="hidden" name="username" autoComplete="username" value={user.username} />
        <TextField
          ref={field}
          label={<span className="sr-only">{copy.password}</span>}
          placeholder={copy.password}
          error={error ?? undefined}
          announce="polite"
          type={shown ? 'text' : 'password'}
          autoComplete="current-password"
          enterKeyHint="go"
          trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
          readOnly={login.isPending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {phone ? <Switch label={copy.rememberPhone} checked={remember} onChange={setRemember} /> : null}
        <Button type="submit" size="lg" disabled={!password} busy={login.isPending}>
          {copy.logIn}
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-body-sm">
        <Link
          to={listShown ? '/login/users' : '/login/username'}
          search={withNext(next)}
          // Someone else on this device: forget the remembered account first (US-AUTH-07).
          onClick={() => forgetRememberedUser()}
          className="hl-focus rounded-xs text-ink no-underline"
        >
          {copy.notYou(user.displayName)}
        </Link>
        {isFeatureEnabled('forgotPassword') ? (
          <Link
            to="/login/forgot"
            search={{ from: 'password', user: user.username, ...withNext(next) }}
            className="hl-focus rounded-xs text-ink no-underline"
          >
            {copy.forgot}
          </Link>
        ) : null}
      </div>
    </LoginLayout>
  );
}
