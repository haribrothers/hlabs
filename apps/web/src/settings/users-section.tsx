// Settings › Users (US-ACCT-13): everyone who uses hlabs and the invites still waiting, with what an admin can do to
// each. The dialogs behind the row actions arrive with their stories (US-ACCT-14…17, US-ACCT-21, US-ACCT-24).
import { Mail, MoreHorizontal, Plus, RotateCw, iconDefaults } from '@hlabs/icons';
import type { PendingInvite, UserSummary } from '@hlabs/api';
import {
  Avatar,
  avatarColorFor,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  List,
  ListRow,
} from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { daysAgo, timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { InviteDialog } from './invite-dialog';

const DAY = 86_400_000;

/** "@anu · 2FA on · last active yesterday · 4 apps": no last active on my own row, app count for members only. */
export function userLine(u: UserSummary, isMe: boolean, now: number): string {
  const parts = [`@${u.username}`, u.totpEnabled ? copy.totpOn : copy.totpOff];
  if (!isMe) parts.push(copy.lastActive(lastActive(u.lastActiveAt, now)));
  if (u.role === 'member') parts.push(copy.apps(u.appCount));
  return parts.join(' · ');
}

function lastActive(at: number | null, now: number): string {
  if (at === null) return copy.neverActive;
  if (now - at < 5 * 60_000) return copy.activeNow;
  return now - at < DAY ? timeAgo(at, now) : daysAgo(at, now);
}

/** Whole days left, rounded up; a minute of clock difference doesn't turn a new invite's 7 days into 8. */
export const daysLeft = (expiresAt: number, now: number) => Math.max(1, Math.ceil((expiresAt - now - 60_000) / DAY));

export function inviteLine(i: PendingInvite, now: number): string {
  return copy.inviteLine(daysAgo(i.createdAt, now), daysLeft(i.expiresAt, now), copy.roles[i.role]);
}

function MoreOptions({ user, size }: { user: UserSummary; size: 'sm' | 'md' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size={size} aria-label={copy.moreOptions(user.displayName)}>
          <MoreHorizontal aria-hidden {...iconDefaults} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem>{user.role === 'admin' ? copy.makeMember : copy.makeAdmin}</DropdownMenuItem>
        <DropdownMenuItem>{user.disabled ? copy.enable : copy.disable}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger>{copy.delete}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Desktop: badges and buttons on the right, as drawn. Phone: badges on the right, buttons in a row underneath. */
function RowActions({ children }: { children: ReactNode }) {
  return <span className="flex flex-wrap items-center gap-2">{children}</span>;
}

function UserRow({ user, isMe, now, desktop }: { user: UserSummary; isMe: boolean; now: number; desktop: boolean }) {
  const size = desktop ? 'sm' : 'md';
  const disabled = user.disabled ? <Badge tone="warning">{copy.disabled}</Badge> : null;
  const role = <Badge>{copy.roles[user.role]}</Badge>;
  const buttons = isMe ? null : (
    <>
      {user.role === 'member' ? (
        <>
          <Button variant="secondary" size={size}>
            {copy.appsAccess}
          </Button>
          <Button variant="secondary" size={size}>
            {copy.resetPassword}
          </Button>
        </>
      ) : null}
      <MoreOptions user={user} size={size} />
    </>
  );
  return (
    <ListRow
      dimmed={user.disabled}
      leading={<Avatar name={user.displayName} color={avatarColorFor(user.username, user.avatarColor)} size="md" />}
      title={
        <>
          <span className="font-semibold">{user.displayName}</span>
          {isMe ? <span className="text-ink-muted"> {copy.you}</span> : null}
        </>
      }
      subtitle={userLine(user, isMe, now)}
      trailing={
        <span className="flex flex-wrap items-center justify-end gap-2">
          {desktop ? disabled : null}
          {role}
          {desktop ? buttons : null}
        </span>
      }
      // On a phone the name keeps its width: "Disabled" and the buttons go in a row underneath.
      below={
        desktop || (!buttons && !disabled) ? undefined : (
          <RowActions>
            {disabled}
            {buttons}
          </RowActions>
        )
      }
    />
  );
}

function InviteRow({ invite, now, desktop }: { invite: PendingInvite; now: number; desktop: boolean }) {
  const size = desktop ? 'sm' : 'md';
  const actions = (
    <RowActions>
      <Button variant="secondary" size={size}>
        {copy.copyLink}
      </Button>
      <Button variant="secondary" size={size} className="text-danger">
        {copy.revoke}
      </Button>
    </RowActions>
  );
  return (
    <ListRow
      leading={
        <span className="grid size-10 shrink-0 place-items-center rounded-pill border border-dashed border-border-glass text-ink-muted">
          <Mail aria-hidden {...iconDefaults} size={16} />
        </span>
      }
      title={<span className="font-semibold">{copy.invitePending}</span>}
      subtitle={inviteLine(invite, now)}
      trailing={desktop ? actions : undefined}
      below={desktop ? undefined : actions}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="hl-list-row" data-testid="user-skeleton" aria-hidden>
      <span className="size-10 shrink-0 animate-pulse rounded-pill bg-surface-row" />
      <span className="flex flex-col gap-1.5">
        <span className="h-4 w-28 animate-pulse rounded-xs bg-surface-row" />
        <span className="h-3 w-48 animate-pulse rounded-xs bg-surface-row" />
      </span>
    </div>
  );
}

/** The "Invite someone" button beside the section title. */
export function InviteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden {...iconDefaults} size={16} />
        {copy.invite}
      </Button>
      {open ? <InviteDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function UsersSection() {
  const trpc = useTRPC();
  const me = useMe().data;
  const now = useNow().getTime();
  const desktop = useIsDesktop();
  const people = useQuery({ ...trpc.users.list.queryOptions(), retry: false });
  const invites = useQuery({ ...trpc.invites.list.queryOptions(), retry: false });

  if (people.isError || invites.isError) {
    return (
      <div role="alert" className="flex items-center gap-3 text-body">
        <span>{copy.loadFailed}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void people.refetch();
            void invites.refetch();
          }}
        >
          <RotateCw aria-hidden {...iconDefaults} size={16} />
          {copy.tryAgain}
        </Button>
      </div>
    );
  }
  if (!people.data || !invites.data) {
    return (
      <div aria-busy="true">
        <List>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </List>
      </div>
    );
  }
  const users = people.data.users;
  const pending = invites.data.invites;
  return (
    <div className="flex flex-col gap-6">
      <List label={copy.people(users.length + pending.length)}>
        {users.map((u) => (
          <UserRow key={u.id} user={u} isMe={u.id === me?.id} now={now} desktop={desktop} />
        ))}
        {pending.map((i) => (
          <InviteRow key={i.id} invite={i} now={now} desktop={desktop} />
        ))}
      </List>
    </div>
  );
}
