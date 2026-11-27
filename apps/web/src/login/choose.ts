// Which log-in screen `/login` opens (US-AUTH-05): signed in → where you were going; a remembered account → its
// password screen; the list shown → the list; otherwise the username form. `next` goes along everywhere.
import { safeNext } from '@hlabs/shared';
import type { RememberedUser } from './remembered';
import { withNext } from './search';

export type LoginDestination =
  | { href: string }
  | { to: '/login/password'; search: { user: string; next?: string } }
  | { to: '/login/users' | '/login/username'; search: { next?: string } };

export function chooseLoginView(opts: {
  signedIn: boolean;
  remembered: RememberedUser | null;
  listedUsers: number;
  next?: string;
  /** On the dashboard's public address only the typed sign-in (LoginPublic, US-SYS-46), whoever was remembered. */
  publicAddress?: boolean;
}): LoginDestination {
  if (opts.signedIn) return { href: safeNext(opts.next) };
  if (opts.publicAddress) return { to: '/login/username', search: withNext(opts.next) };
  if (opts.remembered)
    return { to: '/login/password', search: { user: opts.remembered.username, ...withNext(opts.next) } };
  return { to: opts.listedUsers > 0 ? '/login/users' : '/login/username', search: withNext(opts.next) };
}
