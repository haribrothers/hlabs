// AcceptInvite (US-AUTH-23): who invited me and what I'll get, before I make an account. A link that no longer works
// says so and points to log in. Signed in already: say who as, with a way to log out first.
import { Avatar, avatarColorFor, Button, GlassCard } from '@hlabs/ui';
import type { InviteInspect } from '@hlabs/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { inviteCopy as copy } from '../copy/invite';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { LoginLayout } from './login-layout';

/** "You'll get your own Home screen and a private Files folder." plus what was shared, as the invite says. */
export function inviteLead(invite: Pick<InviteInspect, 'role' | 'appCount' | 'inviterName'>): string {
  const inviter = invite.inviterName ?? 'Your admin';
  if (invite.role === 'admin') return `${copy.youGet} ${copy.youreAdmin}`;
  return invite.appCount > 0 ? `${copy.youGet} ${copy.shared(inviter, invite.appCount)}` : copy.youGet;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <GlassCard level={2} className="flex w-full max-w-[520px] flex-col gap-5 p-10 text-left">
      {children}
    </GlassCard>
  );
}

function SignedInNote({ username }: { username: string }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const logOut = async () => {
    setBusy(true);
    await client.auth.logout.mutate().catch(() => undefined);
    // Stay here: the form is for the new account.
    await queryClient.resetQueries({ queryKey: trpc.auth.me.queryKey() });
    setBusy(false);
  };
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-row px-4 py-3"
    >
      <span className="text-body">{copy.loggedInAs(username)}</span>
      <Button variant="secondary" size="sm" busy={busy} onClick={() => void logOut()}>
        {copy.logOutAndContinue}
      </Button>
    </div>
  );
}

export function AcceptInvite({ token, children }: { token: string; children?: (invite: InviteInspect) => ReactNode }) {
  const trpc = useTRPC();
  const invite = useQuery({ ...trpc.invites.inspect.queryOptions({ token }), retry: false });
  const me = useMe();
  useEffect(() => {
    document.title = `${copy.docTitle} · hlabs`;
  }, []);

  if (invite.isPending) return <LoginLayout>{null}</LoginLayout>;
  if (invite.isError) {
    return (
      <LoginLayout>
        <Card>
          <p role="alert" className="m-0 text-body">
            {copy.loadFailed}
          </p>
          <div>
            <Button variant="secondary" onClick={() => void invite.refetch()}>
              {copy.tryAgain}
            </Button>
          </div>
        </Card>
      </LoginLayout>
    );
  }
  const data = invite.data;
  if (data.status !== 'valid') {
    return (
      <LoginLayout>
        <Card>
          <h1 className="m-0 text-title-1">{copy.invalidTitle}</h1>
          <p className="m-0 text-body text-ink-muted">{copy.askFor(data.inviterName)}</p>
          <div>
            <Link to="/login" className="hl-btn hl-btn-secondary hl-btn-md hl-focus no-underline">
              {copy.goToLogIn}
            </Link>
          </div>
        </Card>
      </LoginLayout>
    );
  }
  const inviter = data.inviterName;
  return (
    <LoginLayout>
      <Card>
        <div className="flex items-center gap-3">
          {inviter ? (
            <Avatar name={inviter} color={avatarColorFor(inviter, data.inviterAvatarColor)} size="md" />
          ) : null}
          <div className="flex flex-col">
            <span className="text-footnote text-ink-muted">
              {inviter ? copy.invitedYou(inviter) : copy.someoneInvitedYou}
            </span>
            <span className="text-headline font-bold">{copy.product}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-title-1">{copy.title}</h1>
          <p className="m-0 text-body text-ink-muted">{inviteLead(data)}</p>
        </div>
        {me.isSuccess ? <SignedInNote username={me.data.username} /> : null}
        {children?.(data)}
      </Card>
    </LoginLayout>
  );
}
