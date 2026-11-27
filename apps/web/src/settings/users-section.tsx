// Settings › Users (US-ACCT-13): everyone who uses hlabs and the invites still waiting, with what an admin can do to
// each. The dialogs behind the row actions arrive with their stories (US-ACCT-14…17, US-ACCT-21, US-ACCT-24).
import {
  CirclePause,
  CirclePlay,
  KeyRound,
  LayoutGrid,
  Link2,
  Mail,
  MoreHorizontal,
  Plus,
  RotateCw,
  Shield,
  Trash2,
  UserPlus,
  iconDefaults,
} from '@hlabs/icons';
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
  BottomSheet,
  InsetRow,
  InsetRowButton,
  List,
  ListRow,
  MoreButton,
  SheetHeader,
} from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { daysAgo, timeAgo } from '../lib/relative-time';
import { confirm } from '../lib/confirm';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { AppsAccessDialog } from './apps-access-dialog';
import { DeleteUserDialog } from './delete-user-dialog';
import { InviteDialog } from './invite-dialog';
import { LoginScreenPolicy, MembersPolicy } from './people-policy';
import { ResetLinkDialog } from './reset-link-dialog';
import { explainHomeOnly, HomeOnly, HomeOnlyPill, useHomeOnly, useOnPublic } from '../public/home-only';
import { publicDashboardCopy as dashCopy } from '../copy/public-dashboard';
import type { HomeOnlyProcedure } from '@hlabs/shared';

const DAY = 86_400_000;

/** "@anu · 2FA on · last active yesterday · 4 apps": no last active on my own row, app count for members only. */
export function userLine(u: UserSummary, isMe: boolean, now: number): string {
  const parts = [`@${u.username}`, u.totpEnabled ? copy.totpOn : copy.totpOff];
  if (!isMe) parts.push(lastActive(u.lastActiveAt, now));
  if (u.role === 'member') parts.push(copy.apps(u.appCount));
  return parts.join(' · ');
}

/** "last active yesterday", "active now" within 5 minutes, or "not logged in yet". */
function lastActive(at: number | null, now: number): string {
  if (at === null) return copy.neverActive;
  if (now - at < 5 * 60_000) return copy.activeNow;
  return copy.lastActive(now - at < DAY ? timeAgo(at, now) : daysAgo(at, now));
}

/** Whole days left, rounded up; a minute of clock difference doesn't turn a new invite's 7 days into 8. */
export const daysLeft = (expiresAt: number, now: number) => Math.max(1, Math.ceil((expiresAt - now - 60_000) / DAY));

export function inviteLine(i: PendingInvite, now: number): string {
  return copy.inviteLine(daysAgo(i.createdAt, now), daysLeft(i.expiresAt, now), copy.roles[i.role]);
}

/** Make admin or member, Disable and Enable for a person: each asks first (or says what happened). */
function useUserActions(user: UserSummary) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const name = user.displayName;
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
  const changeRole = () => {
    const role = user.role === 'admin' ? 'member' : 'admin';
    void confirm({
      title: role === 'admin' ? copy.makeAdminTitle(name) : copy.makeMemberTitle(name),
      body: role === 'admin' ? copy.makeAdminBody(name) : copy.makeMemberBody(name),
      confirmLabel: role === 'admin' ? copy.makeAdmin : copy.makeMember,
      onConfirm: async () => {
        await client.users.updateRole.mutate({ userId: user.id, role });
        await refresh();
        showToast({ tone: 'success', title: copy.roleChanged(name, copy.roles[role]) });
      },
    });
  };
  const disable = () =>
    void confirm({
      title: copy.disableTitle(name),
      body: copy.disableBody,
      confirmLabel: copy.disable,
      tone: 'danger',
      onConfirm: async () => {
        await client.users.disable.mutate({ userId: user.id });
        await refresh();
        showToast({ tone: 'success', title: copy.disabledToast(name) });
      },
    });
  const enable = () =>
    void client.users.enable.mutate({ userId: user.id }).then(
      async () => {
        await refresh();
        showToast({ tone: 'success', title: copy.enabledToast(name) });
      },
      () => showToast({ tone: 'danger', title: copy.actionFailed }),
    );
  return { changeRole, disable, enable };
}

function MoreOptions({ user, size, onDelete }: { user: UserSummary; size: 'sm' | 'md'; onDelete: () => void }) {
  const name = user.displayName;
  const { changeRole, disable, enable } = useUserActions(user);
  // From the internet (US-SYS-47): roles, turning an account back on and deleting are at home only; turning one off
  // isn't (it only takes access away).
  const away = useOnPublic();
  const pill = away ? <HomeOnlyPill label={dashCopy.atHomeOnly} className="ml-auto" /> : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size={size} aria-label={copy.moreOptions(name)}>
          <MoreHorizontal aria-hidden {...iconDefaults} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={away ? () => explainHomeOnly('users.updateRole') : changeRole}>
          {user.role === 'admin' ? copy.makeMember : copy.makeAdmin}
          {pill}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={user.disabled ? (away ? () => explainHomeOnly('users.enable') : enable) : disable}>
          {user.disabled ? copy.enable : copy.disable}
          {user.disabled ? pill : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={away ? () => explainHomeOnly('users.delete') : onDelete}>
          {copy.delete}
          {pill}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Desktop: badges and buttons on the right, as drawn. Phone: badges on the right, buttons in a row underneath. */
function RowActions({ children }: { children: ReactNode }) {
  return <span className="flex flex-wrap items-center gap-2">{children}</span>;
}

function UserRow({
  user,
  isMe,
  now,
  desktop,
  onAppsAccess,
  onResetPassword,
  onDelete,
}: {
  user: UserSummary;
  isMe: boolean;
  now: number;
  desktop: boolean;
  onAppsAccess: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const size = desktop ? 'sm' : 'md';
  const disabled = user.disabled ? <Badge tone="warning">{copy.disabled}</Badge> : null;
  const role = <Badge>{copy.roles[user.role]}</Badge>;
  const buttons = isMe ? null : (
    <>
      {user.role === 'member' ? (
        <>
          <HomeOnly procedure="users.setAppAccess" label={copy.appsAccess} size={size}>
            <Button variant="secondary" size={size} onClick={onAppsAccess}>
              {copy.appsAccess}
            </Button>
          </HomeOnly>
          <HomeOnly procedure="users.resetPasswordLink" label={copy.resetPassword} size={size}>
            <Button variant="secondary" size={size} onClick={onResetPassword}>
              {copy.resetPassword}
            </Button>
          </HomeOnly>
        </>
      ) : null}
      <MoreOptions user={user} size={size} onDelete={onDelete} />
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

/** Copy a pending invite's link, or revoke it after asking. */
function useInviteActions(invite: PendingInvite) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copyLink = () => {
    if (!invite.url) return;
    navigator.clipboard.writeText(invite.url).then(
      () => showToast({ tone: 'success', title: copy.linkCopied }),
      () => showToast({ tone: 'danger', title: copy.copyFailed }),
    );
  };
  const revoke = () =>
    void confirm({
      title: copy.revokeTitle,
      body: copy.revokeBody,
      confirmLabel: copy.revoke,
      tone: 'danger',
      onConfirm: async () => {
        await client.invites.revoke.mutate({ inviteId: invite.id });
        await queryClient.invalidateQueries({ queryKey: trpc.invites.list.queryKey() });
        showToast({ tone: 'success', title: copy.revoked });
      },
    });
  return { copyLink, revoke };
}

function InviteRow({ invite, now, desktop }: { invite: PendingInvite; now: number; desktop: boolean }) {
  const size = desktop ? 'sm' : 'md';
  const { copyLink, revoke } = useInviteActions(invite);
  const actions = (
    <RowActions>
      <Button variant="secondary" size={size} disabled={!invite.url} onClick={copyLink}>
        {copy.copyLink}
      </Button>
      <Button variant="secondary" size={size} className="text-danger" onClick={revoke}>
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

/** A pending invite's mark: a dashed ring with a link in it. */
function InviteMark({ size }: { size: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-pill border border-dashed border-ink-faint text-ink-muted ${size === 'md' ? 'size-10' : 'size-11'}`}
    >
      <Link2 {...iconDefaults} size={18} />
    </span>
  );
}

/**
 * A person's ••• sheet on a phone (PhoneRedesignA_UserActions): who they are, Apps access and Reset password… for a
 * member, Make admin (or member) and Disable (or Enable), and Delete… apart in red. Each closes the sheet first.
 */
function PhoneUserSheet({
  user,
  onClose,
  onAppsAccess,
  onResetPassword,
  onDelete,
}: {
  user: UserSummary;
  onClose: () => void;
  onAppsAccess: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const { changeRole, disable, enable } = useUserActions(user);
  const then = (run: () => void) => () => {
    onClose();
    run();
  };
  // From the internet (US-SYS-47): each home-only row says so and explains instead.
  const away = useOnPublic();
  const pill = away ? <HomeOnlyPill label={dashCopy.atHomeOnly} /> : null;
  const homeOnly = (procedure: HomeOnlyProcedure, run: () => void) =>
    away ? then(() => explainHomeOnly(procedure)) : then(run);
  const member = user.role === 'member';
  return (
    <BottomSheet open onOpenChange={(open) => (open ? undefined : onClose())} titled closeButton={false}>
      <SheetHeader
        leading={<Avatar name={user.displayName} color={avatarColorFor(user.username, user.avatarColor)} size="md" />}
        title={user.displayName}
        subtitle={copy.sheetLine(user.username, copy.roles[user.role], member ? copy.apps(user.appCount) : null)}
        onClose={onClose}
      />
      <div className="hl-sheet-scroll flex flex-col gap-4 pt-2 pb-6">
        {member ? (
          <div className="hl-p-group">
            <InsetRowButton
              icon={<LayoutGrid aria-hidden {...iconDefaults} />}
              title={copy.appsAccess}
              value={away ? undefined : copy.apps(user.appCount)}
              trailing={pill ?? undefined}
              chevron={!away}
              aria-haspopup="dialog"
              onClick={homeOnly('users.setAppAccess', onAppsAccess)}
            />
            <InsetRowButton
              icon={<KeyRound aria-hidden {...iconDefaults} />}
              title={`${copy.resetPassword}…`}
              subtitle={copy.resetLinkNote}
              trailing={pill ?? undefined}
              chevron={!away}
              aria-haspopup="dialog"
              onClick={homeOnly('users.resetPasswordLink', onResetPassword)}
            />
          </div>
        ) : null}
        <div className="hl-p-group">
          <InsetRowButton
            title={user.role === 'admin' ? copy.makeMember : copy.makeAdmin}
            trailing={
              pill ?? (
                <span aria-hidden className="hl-p-row-glyph">
                  <Shield {...iconDefaults} />
                </span>
              )
            }
            onClick={homeOnly('users.updateRole', changeRole)}
          />
          <InsetRowButton
            title={user.disabled ? copy.enable : copy.disable}
            trailing={
              (user.disabled ? pill : null) ?? (
                <span aria-hidden className="hl-p-row-glyph">
                  {user.disabled ? <CirclePlay {...iconDefaults} /> : <CirclePause {...iconDefaults} />}
                </span>
              )
            }
            onClick={user.disabled ? homeOnly('users.enable', enable) : then(disable)}
          />
        </div>
        <div className="hl-p-group">
          <InsetRowButton
            danger
            title={copy.delete}
            trailing={
              pill ?? (
                <span aria-hidden className="hl-p-row-glyph">
                  <Trash2 {...iconDefaults} />
                </span>
              )
            }
            onClick={homeOnly('users.delete', onDelete)}
          />
        </div>
      </div>
    </BottomSheet>
  );
}

/** A pending invite's ••• sheet on a phone: Copy link, and Revoke apart in red. */
function PhoneInviteSheet({ invite, now, onClose }: { invite: PendingInvite; now: number; onClose: () => void }) {
  const { copyLink, revoke } = useInviteActions(invite);
  return (
    <BottomSheet open onOpenChange={(open) => (open ? undefined : onClose())} titled closeButton={false}>
      <SheetHeader
        leading={<InviteMark size="sm" />}
        title={copy.invitePending}
        subtitle={inviteLine(invite, now)}
        onClose={onClose}
      />
      <div className="hl-sheet-scroll flex flex-col gap-4 pt-2 pb-6">
        <div className="hl-p-group">
          <InsetRowButton
            title={copy.copyLink}
            disabled={!invite.url}
            trailing={
              <span aria-hidden className="hl-p-row-glyph">
                <Link2 {...iconDefaults} />
              </span>
            }
            onClick={() => {
              onClose();
              copyLink();
            }}
          />
        </div>
        <div className="hl-p-group">
          <InsetRowButton
            danger
            title={copy.revoke}
            trailing={
              <span aria-hidden className="hl-p-row-glyph">
                <Trash2 {...iconDefaults} />
              </span>
            }
            onClick={() => {
              onClose();
              revoke();
            }}
          />
        </div>
      </div>
    </BottomSheet>
  );
}

/**
 * People on a phone (PhoneRedesignA_Users): one inset list of everyone, each with their role at the right and a •••
 * that opens their sheet, the invites still waiting, and "Invite someone" at the end.
 */
function PhonePeople({
  users,
  pending,
  meId,
  now,
  onAppsAccess,
  onResetPassword,
  onDelete,
}: {
  users: UserSummary[];
  pending: PendingInvite[];
  meId: string | undefined;
  now: number;
  onAppsAccess: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
  onDelete: (user: UserSummary) => void;
}) {
  const labelId = useId();
  const [open, setOpen] = useState<{ kind: 'user'; id: string } | { kind: 'invite'; id: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const inviteAway = useHomeOnly('invites.create');
  const openUser = open?.kind === 'user' ? users.find((u) => u.id === open.id) : undefined;
  const openInvite = open?.kind === 'invite' ? pending.find((i) => i.id === open.id) : undefined;
  return (
    <div role="group" aria-labelledby={labelId} className="hl-p-group-wrap">
      <h2 id={labelId} className="hl-p-label">
        {copy.people(users.length + pending.length)}
      </h2>
      <div className="hl-p-group">
        {users.map((u) => {
          const isMe = u.id === meId;
          return (
            <InsetRow
              key={u.id}
              // Disabled: the avatar fades and the name turns muted (the text keeps its contrast).
              leading={
                <span className={u.disabled ? 'flex opacity-50' : 'flex'}>
                  <Avatar name={u.displayName} color={avatarColorFor(u.username, u.avatarColor)} size="md" />
                </span>
              }
              title={
                <>
                  <span className={u.disabled ? 'text-ink-muted' : undefined}>{u.displayName}</span>
                  {isMe ? <span className="text-ink-muted"> {copy.you}</span> : null}
                </>
              }
              subtitle={userLine(u, isMe, now)}
              trailing={
                <span className="flex shrink-0 items-center gap-1">
                  {u.disabled ? <Badge tone="warning">{copy.disabled}</Badge> : null}
                  <Badge>{copy.roles[u.role]}</Badge>
                  {isMe ? null : (
                    <MoreButton
                      name={u.displayName}
                      label={copy.moreOptions(u.displayName)}
                      onClick={() => setOpen({ kind: 'user', id: u.id })}
                    />
                  )}
                </span>
              }
            />
          );
        })}
        {pending.map((i) => (
          <InsetRow
            key={i.id}
            leading={<InviteMark size="md" />}
            title={copy.invitePending}
            subtitle={inviteLine(i, now)}
            trailing={
              <MoreButton
                name={copy.invitePending}
                label={copy.inviteOptions}
                onClick={() => setOpen({ kind: 'invite', id: i.id })}
              />
            }
          />
        ))}
        <InsetRowButton
          accent
          icon={<UserPlus aria-hidden {...iconDefaults} />}
          title={copy.invite}
          trailing={inviteAway ? <HomeOnlyPill label={dashCopy.atHomeOnly} /> : undefined}
          aria-haspopup="dialog"
          onClick={inviteAway ? () => explainHomeOnly('invites.create') : () => setInviting(true)}
        />
      </div>
      {openUser ? (
        <PhoneUserSheet
          user={openUser}
          onClose={() => setOpen(null)}
          onAppsAccess={() => onAppsAccess(openUser)}
          onResetPassword={() => onResetPassword(openUser)}
          onDelete={() => onDelete(openUser)}
        />
      ) : null}
      {openInvite ? <PhoneInviteSheet invite={openInvite} now={now} onClose={() => setOpen(null)} /> : null}
      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
    </div>
  );
}

/** The "Invite someone" button beside the section title; on a phone the person-plus at the right of the bar. */
export function InviteButton() {
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  // From the internet inviting is at home only (US-SYS-47): the control stays, saying so.
  const away = useHomeOnly('invites.create');
  if (away && !desktop)
    return (
      <button
        type="button"
        className="hl-p-tbtn hl-focus"
        aria-label={dashCopy.atHomeOnlyLabel(copy.invite)}
        aria-haspopup="dialog"
        onClick={() => explainHomeOnly('invites.create')}
      >
        <UserPlus aria-hidden {...iconDefaults} size={24} />
      </button>
    );
  if (away)
    return (
      <HomeOnly procedure="invites.create" label={copy.invite}>
        {null}
      </HomeOnly>
    );
  if (!desktop)
    return (
      <>
        <button
          type="button"
          className="hl-p-tbtn hl-focus"
          aria-label={copy.invite}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <UserPlus aria-hidden {...iconDefaults} size={24} />
        </button>
        {open ? <InviteDialog onClose={() => setOpen(false)} /> : null}
      </>
    );
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
  const [accessFor, setAccessFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UserSummary | null>(null);
  const [resetting, setResetting] = useState<UserSummary | null>(null);
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
  const dialogs = (
    <>
      {accessFor ? <AppsAccessDialog userId={accessFor} onClose={() => setAccessFor(null)} /> : null}
      {deleting ? <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} /> : null}
      {resetting ? (
        <ResetLinkDialog userId={resetting.id} name={resetting.displayName} onClose={() => setResetting(null)} />
      ) : null}
    </>
  );
  if (!desktop)
    return (
      <div className="flex flex-col gap-6">
        <PhonePeople
          users={users}
          pending={pending}
          meId={me?.id}
          now={now}
          onAppsAccess={(u) => setAccessFor(u.id)}
          onResetPassword={setResetting}
          onDelete={setDeleting}
        />
        <LoginScreenPolicy />
        <MembersPolicy />
        {dialogs}
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <List label={copy.people(users.length + pending.length)}>
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isMe={u.id === me?.id}
            now={now}
            desktop={desktop}
            onAppsAccess={() => setAccessFor(u.id)}
            onResetPassword={() => setResetting(u)}
            onDelete={() => setDeleting(u)}
          />
        ))}
        {pending.map((i) => (
          <InviteRow key={i.id} invite={i} now={now} desktop={desktop} />
        ))}
      </List>
      <LoginScreenPolicy />
      <MembersPolicy />
      {dialogs}
    </div>
  );
}
