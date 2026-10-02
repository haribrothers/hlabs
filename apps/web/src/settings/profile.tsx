// Account › profile (US-ACCT-03): avatar, name and "<username> · <role>", and the Edit profile dialog (display name,
// avatar colour, language; the username is shown read-only).
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import {
  Avatar,
  avatarColorFor,
  AVATAR_COLORS,
  Button,
  ListRow,
  ModalDialog,
  TextField,
  type AvatarColor,
} from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { useId, useState, type FormEvent } from 'react';
import { accountCopy } from '../copy/account';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

const copy = accountCopy;

type Account = {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarColor: string | null;
  locale: string;
};

function EditProfile({ account, onClose }: { account: Account; onClose: () => void }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const formId = useId();
  const [name, setName] = useState(account.displayName);
  const [color, setColor] = useState<AvatarColor>(avatarColorFor(account.username, account.avatarColor));
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const save = useMutation({
    mutationFn: () => client.account.update.mutate({ displayName: trimmed, avatarColor: color, locale: 'en' }),
    onSuccess: async () => {
      // The name shows in Account, the Home greeting and the Users list: refresh them all.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.account.get.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() }),
      ]);
      onClose();
      showToast({ tone: 'success', title: copy.profileUpdated });
    },
    onError: (err) => setError(err instanceof TRPCClientError && err.data ? copy.saveFailed : copy.unreachable),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || save.isPending) return;
    setError(null);
    save.mutate();
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={copy.profileTitle}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form={formId} disabled={!trimmed} busy={save.isPending}>
            {copy.save}
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit}>
        <TextField
          label={copy.displayName}
          value={name}
          maxLength={40}
          autoComplete="name"
          error={trimmed ? undefined : copy.enterName}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField label={copy.username} value={account.username} readOnly hint={copy.usernameHint} />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="hl-field-label mb-2 p-0">{copy.avatarColor}</legend>
          <div className="flex gap-3">
            {AVATAR_COLORS.map((c) => (
              <label key={c} className="flex cursor-pointer flex-col items-center gap-1 text-caption">
                <input
                  type="radio"
                  name={`${formId}-color`}
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  className="sr-only peer"
                />
                <span className="rounded-pill p-0.5 ring-2 ring-transparent peer-checked:ring-fill-primary peer-focus-visible:ring-accent">
                  <Avatar name={trimmed || account.username} color={c} size="md" />
                </span>
                {copy.colors[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="hl-field">
          <span className="hl-field-label">{copy.language}</span>
          <select className="hl-input" value="en" onChange={() => {}}>
            <option value="en">{copy.languages.en}</option>
          </select>
        </label>
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}

/** How often to ask again while the Home folder is first being counted. */
const RECOUNT_MS = 2_000;

/**
 * "<username> · <role>", then "· 4.2 GB in Home folder" once Files ships (D-036, US-ACCT-28), "Calculating…" while the
 * folder is first counted.
 */
export function profileLine(
  a: { username: string; role: 'admin' | 'member'; homeFolderBytes: number | null },
  filesShipped = isFeatureEnabled('files'),
): string {
  const who = copy.who(a.username, copy.roles[a.role]);
  if (!filesShipped) return who;
  return `${who} · ${a.homeFolderBytes === null ? copy.calculating : copy.inHomeFolder(formatBytes(a.homeFolderBytes))}`;
}

export function Profile() {
  const trpc = useTRPC();
  const account = useQuery({
    ...trpc.account.get.queryOptions(),
    retry: false,
    refetchInterval: (q) => (isFeatureEnabled('files') && q.state.data?.homeFolderBytes === null ? RECOUNT_MS : false),
  });
  const [editing, setEditing] = useState(false);
  if (!account.data) return null;
  const a = account.data;
  // One row on the list surface, as in the design: avatar, name over "<username> · <role> · <size>", Edit profile.
  return (
    <div className="hl-list-box">
      <ListRow
        leading={<Avatar name={a.displayName} color={avatarColorFor(a.username, a.avatarColor)} size="xl" />}
        title={<span className="text-headline font-bold">{a.displayName}</span>}
        subtitle={profileLine(a)}
        trailing={
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {copy.editProfile}
          </Button>
        }
      />
      {editing ? <EditProfile account={a} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
