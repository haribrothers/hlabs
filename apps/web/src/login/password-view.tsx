// Login (US-AUTH-01, US-AUTH-06): the chosen account greeted by name, asking only for the password.
import { isFeatureEnabled } from '@hlabs/shared';
import { Avatar, avatarColorFor, Button, TextField } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPC } from '../lib/trpc';
import { LoginLayout } from './login-layout';
import { withNext } from './search';
import { useLogin } from './use-login';

const copy = loginCopy;

export function PasswordView({ username, next }: { username: string; next?: string }) {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  const user = list.data?.users.find((u) => u.username === username);
  const [password, setPassword] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const login = useLogin(next);
  useEffect(() => field.current?.focus(), [user]);

  if (list.isError || (list.data && !user)) return <Navigate to="/login/username" search={withNext(next)} replace />;
  if (!user) return <LoginLayout>{null}</LoginLayout>;

  const role = copy.roles[user.role];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password && !login.isPending) login.mutate({ username: user.username, password, remember: false });
  };

  return (
    <LoginLayout back={{ label: copy.allUsers, to: '/login/users', search: withNext(next) }}>
      <Avatar name={user.displayName} color={avatarColorFor(user.username, user.avatarColor)} />
      <h1 className="m-0 mt-2 text-display">{copy.welcomeBack(user.displayName)}</h1>
      <p className="m-0 text-body text-ink-muted">{copy.who(user.username, role)}</p>
      <form className="mt-4 flex w-full max-w-sm flex-col gap-3" onSubmit={submit}>
        <input type="hidden" name="username" autoComplete="username" value={user.username} />
        <TextField
          ref={field}
          label={<span className="sr-only">{copy.password}</span>}
          placeholder={copy.password}
          type="password"
          autoComplete="current-password"
          readOnly={login.isPending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" disabled={!password} busy={login.isPending}>
          {copy.logIn}
        </Button>
      </form>
      {isFeatureEnabled('forgotPassword') ? <p className="m-0 text-body-sm">{copy.forgot}</p> : null}
    </LoginLayout>
  );
}
