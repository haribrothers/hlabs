// LoginUsers (US-AUTH-01): "Who's using hlabs?", one tile per enabled account and "Other user".
import { UserRound, iconDefaults } from '@hlabs/icons';
import { Avatar, avatarColorFor } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useRef, type KeyboardEvent } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPC } from '../lib/trpc';
import { LoginLayout } from './login-layout';
import { withNext } from './search';

const copy = loginCopy;

export function UsersView({ next }: { next?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
  const tiles = useRef<Array<HTMLElement | null>>([]);

  // Can't load the list: the username form still works (US-AUTH-01). An empty list means it's hidden (US-AUTH-02).
  if (list.isError || (list.data && list.data.users.length === 0)) {
    return <Navigate to="/login/username" search={withNext(next)} replace />;
  }

  const users = list.data?.users;
  const count = (users?.length ?? 0) + 1;
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
