// InviteDialog (US-ACCT-21…23): opening it makes a pending invite straight away (Member, no apps) and shows its link.
// Changes save as they're made, so the same link always reflects them. Done keeps the invite; Close (or Escape)
// revokes it unless the link was copied, because then it may already have been sent.
import { Button, ChoiceList, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { AppSwitchList } from './app-switch-list';

type Role = 'member' | 'admin';

/** How long typing in "Their name" waits before it's saved. */
const NAME_SAVE_DELAY_MS = 500;
/** How long the Copy button says "Copied". */
const COPIED_MS = 2_000;

/** The invite page in preview, on this dashboard's own address (the link itself names the home network one). */
export const previewHref = (url: string) => `${new URL(url).pathname}?preview=1`;

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState<{ inviteId: string; url: string } | null>(null);
  const [name, setName] = useState('');
  const savedName = useRef('');
  const [copied, setCopied] = useState(false);
  const everCopied = useRef(false);
  const closing = useRef<'keep' | 'revoke' | null>(null);
  const started = useRef(false);
  const [role, setRole] = useState<Role>('member');
  const [appIds, setAppIds] = useState<ReadonlySet<string>>(new Set());
  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  // Role and app changes save one after another, so the last choice is the one kept.
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const saveChoice = (change: { role?: Role; appIds?: string[] }) => {
    if (!invite) return;
    const { inviteId } = invite;
    saves.current = saves.current.then(() =>
      client.invites.update
        .mutate({ inviteId, ...change })
        .catch(() => showToast({ tone: 'danger', title: copy.saveFailed })),
    );
  };
  const chooseRole = (next: Role) => {
    setRole(next);
    saveChoice({ role: next });
  };
  const toggleApp = (appId: string, on: boolean) => {
    const next = new Set(appIds);
    if (on) next.add(appId);
    else next.delete(appId);
    setAppIds(next);
    saveChoice({ appIds: [...next] });
  };

  const refreshList = () => void queryClient.invalidateQueries({ queryKey: trpc.invites.list.queryKey() });
  const revoke = (inviteId: string) =>
    client.invites.revoke
      .mutate({ inviteId })
      .catch(() => undefined)
      .finally(refreshList);

  const create = useMutation({
    mutationFn: () => client.invites.create.mutate({ role: 'member', appIds: [] }),
    onSuccess: (made) => {
      // Closed while the link was being made: keep or revoke it as if it had been there.
      if (closing.current === 'revoke') return void revoke(made.inviteId);
      if (closing.current === 'keep') return refreshList();
      setInvite({ inviteId: made.inviteId, url: made.url });
    },
  });
  useEffect(() => {
    // Once per dialog, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    create.mutate();
  }, [create]);

  const saveName = useMutation({
    mutationFn: (displayName: string) =>
      client.invites.update.mutate({ inviteId: invite!.inviteId, displayName }).then(() => {
        savedName.current = displayName;
      }),
    onError: () => showToast({ tone: 'danger', title: copy.saveFailed }),
  });
  useEffect(() => {
    if (!invite || name === savedName.current) return;
    const timer = setTimeout(() => saveName.mutate(name), NAME_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveName is stable enough; only typing restarts the wait
  }, [invite, name]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLink = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.url).then(
      () => {
        everCopied.current = true;
        setCopied(true);
      },
      () => showToast({ tone: 'danger', title: copy.copyFailed }),
    );
  };

  const done = async () => {
    closing.current = 'keep';
    await saves.current;
    if (invite && name !== savedName.current)
      await client.invites.update.mutate({ inviteId: invite.inviteId, displayName: name }).catch(() => undefined);
    refreshList();
    onClose();
  };
  const close = () => {
    closing.current = everCopied.current ? 'keep' : 'revoke';
    if (invite) {
      if (closing.current === 'revoke') void revoke(invite.inviteId);
      else refreshList();
    }
    onClose();
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : close())}
      title={copy.inviteTitle}
      width="min(580px, 100%)"
      sheetOnPhone
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            {copy.close}
          </Button>
          <Button onClick={() => void done()} disabled={!invite}>
            {copy.done}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={copy.theirName}
          placeholder={copy.theirNamePlaceholder}
          autoComplete="off"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="hl-list">
          <span className="hl-list-label" aria-hidden>
            {copy.role}
          </span>
          <ChoiceList<Role>
            label={copy.role}
            className="grid grid-cols-2"
            value={role}
            onChange={chooseRole}
            options={[
              { value: 'member', title: copy.roles.member, subtitle: copy.roleMember },
              { value: 'admin', title: copy.roles.admin, subtitle: copy.roleAdmin },
            ]}
          />
        </div>
        {role === 'admin' ? (
          <p className="m-0 text-body text-ink-muted">{copy.adminsOpenEverything}</p>
        ) : apps.data && apps.data.apps.length === 0 ? (
          <p className="m-0 text-body text-ink-muted">{copy.noAppsYet}</p>
        ) : apps.data ? (
          <AppSwitchList label={copy.appsTheyCanOpen} apps={apps.data.apps} checked={appIds} onToggle={toggleApp} />
        ) : null}
        <section aria-labelledby="invite-link-label" className="flex flex-col gap-2 rounded-md bg-surface-row p-4">
          <span id="invite-link-label" className="text-body-sm font-semibold text-ink">
            {copy.inviteLink}
          </span>
          {create.isError ? (
            <div role="alert" className="flex items-center gap-3 text-body">
              <span>{copy.createFailed}</span>
              <Button variant="secondary" size="sm" onClick={() => create.mutate()}>
                {copy.tryAgain}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  aria-labelledby="invite-link-label"
                  value={invite?.url ?? copy.creatingLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="hl-focus min-w-0 flex-1 rounded-sm bg-surface-input px-3 py-2.5 font-mono text-mono text-ink"
                />
                <Button variant="secondary" size="md" onClick={copyLink} disabled={!invite}>
                  {copied ? copy.copied : copy.copy}
                </Button>
              </div>
              <p className="m-0 text-body-sm text-ink-muted">
                {copy.worksOnce}{' '}
                {invite ? (
                  <a
                    href={previewHref(invite.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={copy.previewNewTab}
                    className="hl-focus rounded-xs font-semibold text-accent-link no-underline"
                  >
                    {copy.preview}
                  </a>
                ) : null}
              </p>
            </>
          )}
        </section>
      </div>
    </ModalDialog>
  );
}
