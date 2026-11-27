// LoginUsers (US-AUTH-01): "Who's using hlabs?", one tile per enabled account and "Other user".
import type { AppRouter } from '@hlabs/api';
import { Check, ChevronRight, UserRound, iconDefaults } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { Avatar, avatarColorFor, useIsPhone } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { loginCopy } from '../copy/login';
import { isStandalone } from '../lib/install-app';
import { useTRPC } from '../lib/trpc';
import { PasswordReveal } from '../shell/password-reveal';
import { LoginLayout } from './login-layout';
import { PhoneLogInButton, PhoneLoginError, PhoneLoginField, PhoneLoginTitle, PhoneRememberRow } from './phone-login';
import { withNext } from './search';
import { lockedSearch, loginFailure, useLogin } from './use-login';

type LoginUser = inferRouterOutputs<AppRouter>['auth']['listLoginUsers']['users'][number];

const copy = loginCopy;

export function UsersView({ next }: { next?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  const tiles = useRef<Array<HTMLElement | null>>([]);
  const phone = useIsPhone();

  // Can't load the list: the username form still works (US-AUTH-01). An empty list means it's hidden (US-AUTH-02).
  if (list.isError || (list.data && list.data.users.length === 0)) {
    return <Navigate to="/login/username" search={withNext(next)} replace />;
  }

  const users = list.data?.users;
  const count = (users?.length ?? 0) + 1;
  if (phone && users) return <PhoneUsersView users={users} next={next} />;
  // Arrow keys move between the tiles (US-AUTH-01).
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const i = tiles.current.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    tiles.current[(i + step + count) % count]?.focus();
  };

  return (
    <LoginLayout>
      <h1 className="m-0 text-display">{copy.usersTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{copy.usersLead}</p>
      <ul
        aria-label={copy.usersLabel}
        aria-busy={!users}
        className="m-0 mt-8 flex list-none flex-wrap justify-center gap-6 p-0"
        onKeyDown={onKeyDown}
      >
        {users
          ? users.map((u, i) => {
              const role = copy.roles[u.role];
              return (
                <li key={u.id}>
                  <button
                    ref={(el) => {
                      tiles.current[i] = el;
                    }}
                    type="button"
                    aria-label={copy.userName(u.displayName, role)}
                    className="hl-focus flex w-32 flex-col items-center gap-2 rounded-md bg-transparent p-2 text-ink"
                    onClick={() =>
                      void navigate({ to: '/login/password', search: { user: u.username, ...withNext(next) } })
                    }
                  >
                    <Avatar name={u.displayName} color={avatarColorFor(u.username, u.avatarColor)} />
                    <span className="text-headline break-words">{u.displayName}</span>
                    <span className="text-caption text-ink-muted">{role}</span>
                  </button>
                </li>
              );
            })
          : [0, 1, 2].map((i) => (
              <li key={i} data-testid="user-skeleton" className="flex w-32 flex-col items-center gap-2 p-2">
                <span className="size-22 animate-pulse rounded-pill bg-surface-row" />
                <span className="h-4 w-20 animate-pulse rounded-xs bg-surface-row" />
              </li>
            ))}
        <li>
          <button
            ref={(el) => {
              tiles.current[count - 1] = el;
            }}
            type="button"
            aria-label={`${copy.otherUser}, ${copy.otherUserDetail}`}
            className="hl-focus flex w-32 flex-col items-center gap-2 rounded-md bg-transparent p-2 text-ink"
            onClick={() => void navigate({ to: '/login/username', search: withNext(next) })}
          >
            <span className="grid size-22 place-items-center rounded-pill border-2 border-dashed border-border-glass bg-surface-row">
              <UserRound aria-hidden {...iconDefaults} />
            </span>
            <span className="text-headline">{copy.otherUser}</span>
            <span className="text-caption text-ink-muted">{copy.otherUserDetail}</span>
          </button>
        </li>
      </ul>
      <p className="m-0 mt-10 text-caption text-ink-muted">{copy.usersFooter}</p>
    </LoginLayout>
  );
}

/**
 * PhoneLogin with the list shown (US-PHONE-05, PhoneRedesignA_Login): "Who's using hlabs?" as a list, one full-width
 * row per account (the chosen one ticked) and "Other user"; under it the password, "Remember this phone", "Log in"
 * and "Forgot password?".
 */
function PhoneUsersView({ users, next }: { users: LoginUser[]; next?: string }) {
  const navigate = useNavigate();
  const [chosen, setChosen] = useState(users[0]?.username ?? '');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  // Off by default; on in the home-screen app, which keeps its own cookies (US-PHONE-24).
  const [remember, setRemember] = useState(isStandalone);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const errorId = useId();
  const labelId = useId();
  const login = useLogin(next, chosen);
  const user = users.find((u) => u.username === chosen);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !password || login.isPending) return;
    setError(null);
    login.mutate(
      { username: user.username, password, remember },
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
  // Up and Down move between the accounts and choose one (the chosen one is pressed and ticked).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = Math.max(
      0,
      users.findIndex((u) => u.username === chosen),
    );
    const next = (i + step + users.length) % users.length;
    setChosen(users[next]!.username);
    rows.current[next]?.focus();
  };

  return (
    <LoginLayout>
      <PhoneLoginTitle>{copy.usernameTitle}</PhoneLoginTitle>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="flex flex-col">
          <p id={labelId} className="hl-p-label mx-0">
            {copy.usersTitle}
          </p>
          <div role="group" aria-labelledby={labelId} className="hl-p-group" onKeyDown={onKeyDown}>
            {users.map((u, i) => {
              const role = copy.roles[u.role];
              const on = u.username === chosen;
              return (
                <button
                  key={u.id}
                  ref={(el) => {
                    rows.current[i] = el;
                  }}
                  type="button"
                  aria-pressed={on}
                  aria-label={copy.userName(u.displayName, role)}
                  tabIndex={on ? 0 : -1}
                  className="hl-p-row hl-focus min-h-15"
                  onClick={() => {
                    setChosen(u.username);
                    setError(null);
                    field.current?.focus();
                  }}
                >
                  <Avatar name={u.displayName} color={avatarColorFor(u.username, u.avatarColor)} size="md" />
                  <span className="hl-p-row-main">
                    <span className="hl-p-row-text">
                      <span className="hl-p-row-title">{u.displayName}</span>
                      <span className="hl-p-row-sub">{role}</span>
                    </span>
                    {on ? <Check aria-hidden {...iconDefaults} className="text-accent-link" /> : null}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-label={`${copy.otherUser}, ${copy.otherUserDetail}`}
              className="hl-p-row hl-focus min-h-15"
              onClick={() => void navigate({ to: '/login/username', search: withNext(next) })}
            >
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-pill border-2 border-dashed border-border-glass"
              >
                <UserRound {...iconDefaults} />
              </span>
              <span className="hl-p-row-main">
                <span className="hl-p-row-text">
                  <span className="hl-p-row-title">{copy.otherUser}</span>
                  <span className="hl-p-row-sub">{copy.otherUserDetailPhone}</span>
                </span>
                <ChevronRight aria-hidden {...iconDefaults} className="text-ink-faint" />
              </span>
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <input type="hidden" name="username" autoComplete="username" value={chosen} />
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
        <PhoneLogInButton disabled={!user || !password} busy={login.isPending} />
        {isFeatureEnabled('forgotPassword') ? (
          <Link
            to="/login/forgot"
            search={{ from: 'password', user: chosen, ...withNext(next) }}
            className="hl-p-link hl-focus self-center"
          >
            {copy.forgot}
          </Link>
        ) : null}
      </form>
    </LoginLayout>
  );
}
