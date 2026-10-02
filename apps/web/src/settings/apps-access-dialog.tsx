// AppsAccess (US-ACCT-24, US-ACCT-25): what a member can open, saved together with Save; Cancel or Escape keeps
// what they had.
import { Avatar, avatarColorFor, Button, List, ListRow, ModalDialog, Switch } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { AppSwitchList } from './app-switch-list';

export function AppsAccessDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const person = useQuery({ ...trpc.users.get.queryOptions({ userId }), retry: false, staleTime: 0 });
  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  // Their own usage switch only matters while "See live usage" is on for members (US-ACCT-20).
  const policy = useQuery({ ...trpc.users.getPolicy.queryOptions(), retry: false });
  const usageOffForAll = policy.data ? !policy.data.membersCanSeeUsage : false;
  // What they can open now, until a switch is changed here.
  const [edited, setAppIds] = useState<ReadonlySet<string> | null>(null);
  const appIds = edited ?? (person.data ? new Set(person.data.appIds) : null);
  const [shared, setShared] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<boolean | null>(null);
  const canSeeShared = shared ?? person.data?.canSeeShared ?? false;
  const canSeeUsage = usage ?? person.data?.canSeeUsage ?? false;

  const save = useMutation({
    mutationFn: () =>
      client.users.setAppAccess.mutate({ userId, appIds: [...(appIds ?? [])], canSeeShared, canSeeUsage }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
      showToast({ tone: 'success', title: copy.saved });
      onClose();
    },
    onError: () => showToast({ tone: 'danger', title: copy.saveFailed }),
  });

  const toggle = (appId: string, on: boolean) => {
    const next = new Set(appIds);
    if (on) next.add(appId);
    else next.delete(appId);
    setAppIds(next);
  };

  const name = person.data?.displayName ?? '';
  const installed = apps.data?.apps;
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      width="min(540px, 100%)"
      sheetOnPhone
      title={
        <span className="flex items-center gap-3">
          {person.data ? (
            <Avatar name={name} color={avatarColorFor(person.data.username, person.data.avatarColor)} size="md" />
          ) : null}
          <span className="flex flex-col">
            <span>{copy.accessTitle(name)}</span>
            <span className="text-body-sm font-normal text-ink-muted">{copy.accessLead}</span>
          </span>
        </span>
      }
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button onClick={() => save.mutate()} disabled={appIds === null} busy={save.isPending}>
            {copy.save}
          </Button>
        </>
      }
    >
      {!installed || appIds === null ? null : (
        <div className="flex flex-col gap-4">
          {installed.length === 0 ? (
            <p className="m-0 text-body">
              {copy.noAppsYet}.{' '}
              <Link to="/store" className="hl-focus rounded-xs font-semibold text-accent-link no-underline">
                {copy.openAppStore}
              </Link>
            </p>
          ) : (
            <AppSwitchList
              label={<span className="sr-only">{copy.accessApps(name)}</span>}
              apps={installed}
              checked={appIds}
              onToggle={toggle}
              hint={(app) => (app.ownLogin ? copy.ownLoginToo : undefined)}
            />
          )}
          {/* US-ACCT-25: saved with the apps, in the same request. */}
          <List label={<span className="sr-only">{copy.memberOptions(name)}</span>}>
            <ListRow
              title={copy.seeShared}
              subtitle={copy.seeSharedHint}
              trailing={<Switch aria-label={copy.seeShared} checked={canSeeShared} onChange={setShared} />}
            />
            <ListRow
              title={copy.seeUsage}
              subtitle={usageOffForAll ? copy.usageOffForAll : undefined}
              trailing={
                <Switch
                  aria-label={copy.seeUsage}
                  checked={canSeeUsage}
                  disabled={usageOffForAll}
                  onChange={setUsage}
                />
              }
            />
          </List>
        </div>
      )}
    </ModalDialog>
  );
}
