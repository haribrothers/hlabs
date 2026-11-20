// Connect a network drive (US-FILE-11, NetworkDrives): servers found on the network (choose one, then a share), or an
// address typed as smb://host/share, \\host\share or nfs://host/path; username and password for SMB; "Let apps use
// this drive" and "Reconnect automatically after restart", both on. Connect tests and mounts it; what went wrong is said
// in the dialog.
import { iconDefaults, Server } from '@hlabs/icons';
import { Button, ModalDialog, TextField, cn } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorData, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';

export interface DriveAddress {
  protocol: 'smb' | 'nfs';
  host: string;
  share: string;
}

/** `smb://nas.local/Media`, `\\nas.local\Media` or `nfs://nas.local/volume1/media`; null for anything else. */
export function parseAddress(raw: string): DriveAddress | null {
  const text = raw.trim();
  const unc = /^\\\\([^\\/]+)[\\/](.+)$/.exec(text);
  if (unc) return { protocol: 'smb', host: unc[1]!, share: unc[2]!.replace(/\\/g, '/').replace(/\/+$/, '') };
  const url = /^(smb|nfs):\/\/([^/\s]+)(\/.+)$/i.exec(text);
  if (!url) return null;
  const protocol = url[1]!.toLowerCase() as 'smb' | 'nfs';
  const path = decodeURIComponent(url[3]!).replace(/\/+$/, '');
  if (!path || path === '/') return null;
  return { protocol, host: url[2]!, share: protocol === 'smb' ? path.replace(/^\/+/, '') : path };
}

/** The address for a share on a found server: `smb://host/Media` or `nfs://host/volume1/media`. */
export function addressOf(s: { host: string; protocol: 'smb' | 'nfs' }, share: string): string {
  return s.protocol === 'smb'
    ? `smb://${s.host}/${share.replace(/^\/+/, '')}`
    : `nfs://${s.host}${share.startsWith('/') ? '' : '/'}${share}`;
}

/** "NAS · Media": the server's own name when it was found, else its host without the domain. */
export function driveName(address: DriveAddress, serverName?: string): string {
  const host = serverName ?? address.host.replace(/\.(local|home\.arpa|lan)$/i, '');
  const last = address.share.split('/').filter(Boolean).at(-1) ?? address.share;
  return `${host} · ${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

/** What went wrong, in the dialog (US-FILE-11). */
export function connectError(err: unknown, address: DriveAddress): string {
  const code = errorCode(err);
  if (code === 'NAS_AUTH_FAILED') return copy.wrongPassword;
  if (code === 'NAS_UNREACHABLE') {
    const reason = (errorData(err)?.detail as { reason?: string } | null)?.reason;
    return reason === 'noShare' ? copy.noShare(address.share, address.host) : copy.cantReachHost(address.host);
  }
  return errorLine(err);
}

export function ConnectDriveDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (id: string) => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const found = useQuery({ ...trpc.storage.locations.discover.queryOptions(), staleTime: 30_000, retry: false });
  const [server, setServer] = useState<{ name: string; host: string } | null>(null);
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // The share typed for a server that doesn't list its shares.
  const [typedShare, setTypedShare] = useState('');
  const [appsAllowed, setAppsAllowed] = useState(true);
  const [autoMount, setAutoMount] = useState(true);
  const parsed = parseAddress(address);
  const chosen = found.data?.servers.find((s) => s.host === server?.host && s.name === server?.name);

  const connect = useMutation({
    mutationFn: (a: DriveAddress) =>
      client.storage.locations.addNetwork.mutate({
        ...a,
        name: driveName(a, chosen && chosen.host === a.host ? chosen.name : undefined),
        ...(a.protocol === 'smb' && username ? { username, password } : {}),
        appsAllowed,
        autoMount,
      }),
    meta: { inlineErrors: true },
    onSuccess: async ({ locationId }) => {
      await queryClient.invalidateQueries({ queryKey: trpc.storage.locations.list.queryKey() });
      onClose();
      onConnected(locationId);
    },
  });

  const pick = (s: { name: string; host: string; protocol: 'smb' | 'nfs' }, share: string) => {
    setServer({ name: s.name, host: s.host });
    setAddress(addressOf(s, share));
  };

  const error = connect.isError && parsed ? connectError(connect.error, parsed) : null;
  const smb = (parsed?.protocol ?? chosen?.protocol ?? 'smb') === 'smb';

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || connect.isPending ? null : onClose())}
      dismissible={!connect.isPending}
      sheetOnPhone
      title={copy.connectTitle}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={connect.isPending}>
            {copy.cancel}
          </Button>
          <Button onClick={() => parsed && connect.mutate(parsed)} busy={connect.isPending} disabled={!parsed}>
            {copy.connect}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed && !connect.isPending) connect.mutate(parsed);
        }}
      >
        <section aria-labelledby="found-drives" className="flex flex-col gap-2">
          <h3 id="found-drives" className="m-0 text-label text-ink">
            {copy.found}
          </h3>
          {!found.data ? (
            <p role="status" className="m-0 text-body-sm text-ink-muted">
              {found.isError ? copy.noneFound : copy.looking}
            </p>
          ) : found.data.servers.length === 0 ? (
            <p className="m-0 text-body-sm text-ink-muted">{copy.noneFound}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {found.data.servers.map((s) => {
                const selected = server?.host === s.host && server.name === s.name;
                return (
                  <li key={`${s.protocol}:${s.host}:${s.name}`}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setServer({ name: s.name, host: s.host });
                        setTypedShare('');
                        if (s.shares?.length === 1) pick(s, s.shares[0]!);
                      }}
                      className={cn(
                        'hl-focus flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md border-0 bg-surface-input px-4 text-left font-sans text-body text-ink',
                        selected && 'ring-2 ring-accent',
                      )}
                    >
                      <Server aria-hidden {...iconDefaults} className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{s.host}</span>
                      <span className="text-caption text-ink-muted">
                        {copy.serverMeta(s.protocol, s.shares?.length ?? null)}
                      </span>
                    </button>
                    {selected && !s.shares?.length ? (
                      // A server that won't list its shares to a guest: type the one you want.
                      <div className="mt-2 pl-2">
                        <TextField
                          label={copy.shareName}
                          hint={copy.shareNameHint(s.host)}
                          value={typedShare}
                          onChange={(e) => {
                            connect.reset();
                            setTypedShare(e.target.value);
                            setAddress(e.target.value.trim() ? addressOf(s, e.target.value.trim()) : '');
                          }}
                          placeholder={s.protocol === 'smb' ? 'Media' : '/volume1/media'}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    ) : null}
                    {selected && s.shares?.length ? (
                      <div
                        role="radiogroup"
                        aria-label={copy.sharesOn(s.host)}
                        className="mt-2 flex flex-wrap gap-2 pl-2"
                      >
                        {s.shares.map((share) => {
                          const on =
                            parsed?.host === s.host && parsed.share.replace(/^\/+/, '') === share.replace(/^\/+/, '');
                          return (
                            <button
                              key={share}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => pick(s, share)}
                              className={cn(
                                'hl-focus min-h-11 cursor-pointer rounded-pill border-0 px-4 font-sans text-label',
                                on ? 'bg-fill-primary text-ink-on-light' : 'bg-surface-control text-ink',
                              )}
                            >
                              {share}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <TextField
          label={copy.orAddress}
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            connect.reset();
          }}
          placeholder="smb://nas.local/Media"
          hint={address && !parsed ? undefined : copy.addressHint}
          error={address && !parsed ? copy.badAddress : (error ?? undefined)}
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
        />
        {smb ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={copy.username}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <TextField
              label={copy.password}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="m-0 text-body-sm text-ink-muted sm:col-span-2">{copy.guestHint}</p>
          </div>
        ) : null}
        {[
          [copy.letAppsUse, appsAllowed, setAppsAllowed] as const,
          [copy.reconnect, autoMount, setAutoMount] as const,
        ].map(([label, checked, set]) => (
          <label key={label} className="flex min-h-11 items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="hl-focus size-4 accent-[var(--color-accent)]"
              checked={checked}
              onChange={(e) => set(e.target.checked)}
            />
            {label}
          </label>
        ))}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ModalDialog>
  );
}
