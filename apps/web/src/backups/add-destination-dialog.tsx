// Add a backup destination (BackupAddDest, US-BKP-08…10): cloud storage, a network drive (one connected in Files, or
// a share address) or an external drive; "Another hlabs" waits for the Backup receiver app (D-132). A six-word
// encryption password is made when the dialog opens, shown with Copy and the warning, and forgotten on Cancel.
// "Test connection" checks within 20 s; backups already there ask for their own password instead.
import { AlertTriangle, Check, Copy, Info, iconDefaults } from '@hlabs/icons';
import { dicewarePassword, formatBytes } from '@hlabs/shared';
import { Button, InsetRowButton, ModalDialog, TextField, cn, useIsPhone } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { backupsCopy as copy } from '../copy/backups';
import { parseAddress } from '../files/connect-drive-dialog';
import { errorCode, errorData, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

type Kind = 'cloud' | 'network' | 'external';

const PROVIDERS: Array<[RegExp, string]> = [
  [/backblazeb2\.com$/i, 'Backblaze B2'],
  [/amazonaws\.com$/i, 'Amazon S3'],
  [/wasabisys\.com$/i, 'Wasabi'],
  [/r2\.cloudflarestorage\.com$/i, 'Cloudflare R2'],
  [/digitaloceanspaces\.com$/i, 'DigitalOcean Spaces'],
];

/** A name for a cloud destination from its endpoint: "Backblaze B2", or the host. */
export function cloudName(endpoint: string): string {
  try {
    const host = new URL(endpoint).host;
    return PROVIDERS.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return 'Cloud storage';
  }
}

/** A typed share's destination is named after its server, as on the BackupsOverview screen: "NAS". */
export function serverName(host: string): string {
  const short = host.replace(/\.(local|home\.arpa|lan)$/i, '');
  return short.length <= 4 ? short.toUpperCase() : short.charAt(0).toUpperCase() + short.slice(1);
}

/** What went wrong, said in the dialog (US-BKP-09). */
export function destinationError(err: unknown): string {
  const code = errorCode(err);
  const detail = (errorData(err)?.detail ?? null) as { reason?: string } | null;
  if (code === 'VALIDATION_FAILED' && detail?.reason === 'sameDisk') return copy.sameDisk;
  if (code === 'FILES_READ_ONLY') return copy.readOnlyDest;
  if (code === 'BACKUP_REPO_PASSWORD_WRONG') return copy.wrongRepoPassword;
  if (code === 'BACKUP_DEST_AUTH_FAILED') return copy.badKeys;
  return errorLine(err);
}

function Radio({
  checked,
  onSelect,
  title,
  line,
}: {
  checked: boolean;
  onSelect: () => void;
  title: ReactNode;
  line?: ReactNode;
}) {
  // On a phone (PhoneRedesignA_BackupAdd): an inset row with a checkmark at the right when chosen.
  if (useIsPhone())
    return (
      <InsetRowButton
        role="radio"
        aria-checked={checked}
        onClick={onSelect}
        title={title}
        subtitle={line}
        trailing={checked ? <Check aria-hidden {...iconDefaults} className="hl-p-check" /> : undefined}
      />
    );
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'hl-focus flex min-h-11 w-full cursor-pointer items-center gap-3 border-0 px-4 py-3 text-left font-sans text-body text-ink',
        checked ? 'bg-accent-wash' : 'bg-transparent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-4.5 shrink-0 rounded-pill',
          checked ? 'border-[6px] border-solid border-accent' : 'border-2 border-solid border-ink-muted',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {line ? <span className="shrink-0 text-body-sm text-ink-muted">{line}</span> : null}
    </button>
  );
}

export function AddDestinationDialog({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const generated = useMemo(() => dicewarePassword(), []);
  const [kind, setKind] = useState<Kind>('cloud');
  const [endpoint, setEndpoint] = useState('');
  const [bucket, setBucket] = useState('hlabs-backups');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [drivePath, setDrivePath] = useState<string | null>(null);
  const [folder, setFolder] = useState('hlabs-backups');
  // Backups already at the destination: their own password instead of the generated one (US-BKP-09).
  const [existing, setExisting] = useState(false);
  const [theirPassword, setTheirPassword] = useState('');
  const [result, setResult] = useState<{ ok: true } | { error: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const locations = useQuery({
    ...trpc.storage.locations.list.queryOptions(),
    enabled: kind === 'network',
    retry: false,
  });
  const drives = useQuery({ ...trpc.storage.listDrives.queryOptions(), enabled: kind === 'external', retry: false });
  const network = (locations.data?.locations ?? []).filter(
    (l) => !l.isRoot && (l.kind === 'smb' || l.kind === 'nfs') && l.status === 'ok',
  );
  const parsed = parseAddress(address);
  const endpointOk = /^https:\/\/\S+$/.test(endpoint.trim());

  const target = (() => {
    if (kind === 'cloud') {
      if (!endpointOk || !bucket.trim() || !accessKey.trim() || !secretKey) return null;
      return {
        type: 'cloud' as const,
        endpoint: endpoint.trim(),
        bucket: bucket.trim(),
        accessKey: accessKey.trim(),
        secretKey,
      };
    }
    if (kind === 'network') {
      if (locationId) return { type: 'network' as const, locationId };
      if (!parsed) return null;
      return {
        type: 'network' as const,
        address: parsed,
        ...(parsed.protocol === 'smb' && username ? { username, password: sharePassword } : {}),
      };
    }
    if (!drivePath || !folder.trim()) return null;
    return { type: 'external' as const, drivePath, folder: folder.trim() };
  })();
  const name = (() => {
    if (kind === 'cloud') return cloudName(endpoint);
    if (kind === 'external')
      return drives.data?.drives.find((d) => d.path === drivePath)?.name ?? copy.types.external.name;
    if (locationId) return network.find((l) => l.id === locationId)?.name ?? copy.types.network.name;
    return parsed ? serverName(parsed.host) : copy.types.network.name;
  })();
  const repoPassword = existing ? theirPassword : generated;
  const input = target && repoPassword.length >= 8 ? { name, target, repoPassword } : null;

  const onError = (err: unknown) => {
    const detail = (errorData(err)?.detail ?? null) as { existing?: boolean } | null;
    if (errorCode(err) === 'BACKUP_REPO_PASSWORD_WRONG' && detail?.existing && !existing) {
      setExisting(true);
      setResult(null);
      return;
    }
    setResult({ error: destinationError(err) });
  };
  const test = useMutation({
    mutationFn: () => client.backups.destinations.test.mutate(input!),
    meta: { inlineErrors: true },
    onSuccess: () => setResult({ ok: true }),
    onError,
  });
  const add = useMutation({
    mutationFn: () => client.backups.destinations.add.mutate(input!),
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.backups.overview.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.storage.locations.list.queryKey() }),
      ]);
      showToast({ tone: 'success', title: copy.added });
      onClose();
    },
    onError,
  });
  const busy = test.isPending || add.isPending;
  const changed = () => {
    setResult(null);
    test.reset();
  };
  const pick = (k: Kind) => {
    setKind(k);
    setExisting(false);
    setTheirPassword('');
    changed();
  };
  const types: Kind[] = ['cloud', 'network', 'external'];
  const phone = useIsPhone();
  /** A labelled list of choices: an inset group on a phone, a box on desktop. */
  const choices = (label: string, id: string, rows: ReactNode) =>
    phone ? (
      <div className="hl-p-group-wrap">
        <span id={id} className="hl-p-label">
          {label}
        </span>
        <div role="radiogroup" aria-labelledby={id} className="hl-p-group">
          {rows}
        </div>
      </div>
    ) : null;

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || busy ? null : onClose())}
      dismissible={!busy}
      sheetOnPhone
      width="min(640px, 100%)"
      title={copy.addTitle}
      // A phone: Cancel in the sheet's bar, Test connection and Add destination stacked at the bottom (US-PHONE-26).
      sheetBar={phone ? { cancelLabel: copy.cancel } : undefined}
      actions={
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end">
          {result && 'ok' in result ? (
            <p
              role="status"
              className="m-0 flex items-center gap-1.5 text-body-sm font-semibold text-success md:mr-auto"
            >
              {copy.connected}
            </p>
          ) : null}
          {phone ? null : (
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {copy.cancel}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => test.mutate()}
            disabled={!input || add.isPending}
            busy={test.isPending}
          >
            {copy.test}
          </Button>
          <Button onClick={() => add.mutate()} disabled={!input || test.isPending} busy={add.isPending}>
            {copy.add}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-ink">
        {phone ? (
          choices(
            copy.type,
            'dest-type',
            types.map((k) => (
              <Radio
                key={k}
                checked={kind === k}
                onSelect={() => pick(k)}
                title={copy.types[k].name}
                line={copy.types[k].line}
              />
            )),
          )
        ) : (
          <div role="radiogroup" aria-label={copy.type} className="grid gap-2.5 md:grid-cols-3">
            {types.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => pick(k)}
                className={cn(
                  'hl-focus flex min-h-13 cursor-pointer flex-col items-start gap-1 rounded-lg border-2 border-solid bg-surface-input px-3.5 py-3 text-left font-sans',
                  kind === k ? 'border-accent' : 'border-transparent',
                )}
              >
                <span className="text-body font-semibold text-ink">{copy.types[k].name}</span>
                <span className="text-body-sm text-ink-muted">{copy.types[k].line}</span>
              </button>
            ))}
          </div>
        )}

        {kind === 'cloud' ? (
          <>
            <TextField
              label={copy.endpoint}
              value={endpoint}
              placeholder="https://s3.eu-central-003.backblazeb2.com"
              className="font-mono"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              error={endpoint && !endpointOk ? copy.endpointHttps : undefined}
              onChange={(e) => {
                setEndpoint(e.target.value);
                changed();
              }}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label={copy.bucket}
                value={bucket}
                autoComplete="off"
                onChange={(e) => (setBucket(e.target.value), changed())}
              />
              <TextField
                label={copy.accessKey}
                value={accessKey}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => (setAccessKey(e.target.value), changed())}
              />
            </div>
            <TextField
              label={copy.secretKey}
              type="password"
              value={secretKey}
              autoComplete="new-password"
              error={result && 'error' in result && errorKind(result.error) === 'keys' ? result.error : undefined}
              onChange={(e) => (setSecretKey(e.target.value), changed())}
            />
          </>
        ) : null}

        {kind === 'network' ? (
          <>
            <div className={phone ? 'contents' : 'flex flex-col gap-2'}>
              {phone ? null : <span className="text-label">{copy.chooseDrive}</span>}
              {network.length && phone ? (
                choices(
                  copy.chooseDrive,
                  'dest-network',
                  network.map((l) => (
                    <Radio
                      key={l.id}
                      checked={locationId === l.id}
                      onSelect={() => {
                        setLocationId(l.id);
                        setAddress('');
                        setExisting(false);
                        changed();
                      }}
                      title={l.name}
                      line={l.kind.toUpperCase()}
                    />
                  )),
                )
              ) : network.length ? (
                <div
                  role="radiogroup"
                  aria-label={copy.chooseDrive}
                  className="overflow-hidden rounded-lg bg-surface-input"
                >
                  {network.map((l) => (
                    <Radio
                      key={l.id}
                      checked={locationId === l.id}
                      onSelect={() => {
                        setLocationId(l.id);
                        setAddress('');
                        setExisting(false);
                        changed();
                      }}
                      title={l.name}
                      line={l.kind.toUpperCase()}
                    />
                  ))}
                </div>
              ) : (
                <p className="m-0 text-body-sm text-ink-muted">{copy.noNetwork}</p>
              )}
            </div>
            <TextField
              label={copy.orShare}
              value={address}
              placeholder="smb://nas.local/Backups"
              className="font-mono"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              hint={address && !parsed ? undefined : copy.shareHint}
              error={address && !parsed ? copy.badShare : undefined}
              onChange={(e) => {
                setAddress(e.target.value);
                setLocationId(null);
                setExisting(false);
                changed();
              }}
            />
            {parsed?.protocol === 'smb' && !locationId ? (
              <div className="grid gap-3 md:grid-cols-2">
                <TextField
                  label={copy.username}
                  value={username}
                  autoComplete="off"
                  onChange={(e) => (setUsername(e.target.value), changed())}
                />
                <TextField
                  label={copy.password}
                  type="password"
                  value={sharePassword}
                  autoComplete="new-password"
                  onChange={(e) => (setSharePassword(e.target.value), changed())}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {kind === 'external' ? (
          <>
            <div className={phone ? 'contents' : 'flex flex-col gap-2'}>
              {phone ? null : <span className="text-label">{copy.chooseExternal}</span>}
              {drives.data?.drives.length && phone ? (
                choices(
                  copy.chooseExternal,
                  'dest-external',
                  drives.data.drives.map((d) => (
                    <Radio
                      key={d.path}
                      checked={drivePath === d.path}
                      onSelect={() => {
                        setDrivePath(d.path);
                        setExisting(false);
                        changed();
                      }}
                      title={d.name}
                      line={copy.free(formatBytes(d.freeBytes))}
                    />
                  )),
                )
              ) : drives.data?.drives.length ? (
                <div
                  role="radiogroup"
                  aria-label={copy.chooseExternal}
                  className="overflow-hidden rounded-lg bg-surface-input"
                >
                  {drives.data.drives.map((d) => (
                    <Radio
                      key={d.path}
                      checked={drivePath === d.path}
                      onSelect={() => {
                        setDrivePath(d.path);
                        setExisting(false);
                        changed();
                      }}
                      title={d.name}
                      line={copy.free(formatBytes(d.freeBytes))}
                    />
                  ))}
                </div>
              ) : (
                <p className="m-0 text-body-sm text-ink-muted">{copy.noExternal}</p>
              )}
            </div>
            <TextField
              label={copy.folderName}
              value={folder}
              hint={copy.folderHint}
              autoComplete="off"
              onChange={(e) => (setFolder(e.target.value), changed())}
            />
          </>
        ) : null}

        {existing ? (
          <>
            <p className="m-0 flex gap-2.5 rounded-md bg-accent-wash px-3.5 py-3 text-body-sm text-ink">
              <Info aria-hidden {...iconDefaults} className="mt-0.5 size-4.5 shrink-0 text-accent" />
              {copy.existing}
            </p>
            <TextField
              label={copy.encryptionPassword}
              type="password"
              value={theirPassword}
              autoFocus
              autoComplete="off"
              error={result && 'error' in result && result.error === copy.wrongRepoPassword ? result.error : undefined}
              onChange={(e) => (setTheirPassword(e.target.value), changed())}
            />
          </>
        ) : phone ? (
          // PhoneRedesignA_BackupAdd: the password in an inset box with Copy at its right, the warning under it.
          <>
            <div className="hl-p-group-wrap">
              <span id="enc-label" className="hl-p-label">
                {copy.encryptionPassword}
              </span>
              <div className="hl-p-group">
                <div className="hl-p-row">
                  <textarea
                    aria-labelledby="enc-label"
                    readOnly
                    rows={2}
                    value={generated}
                    className="hl-p-input hl-p-secret font-mono"
                  />
                  <button
                    type="button"
                    className="hl-p-tbtn hl-focus -mr-2"
                    onClick={() => {
                      void navigator.clipboard?.writeText(generated).then(() => setCopied(true));
                    }}
                  >
                    {copied ? copy.copied : copy.copy}
                  </button>
                </div>
              </div>
            </div>
            <p className="m-0 flex gap-2.5 text-footnote text-ink-muted">
              <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4.5 shrink-0 text-warning" />
              {copy.saveWarning}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span id="enc-label" className="text-label">
                {copy.encryptionPassword}
              </span>
              <div className="flex gap-2">
                <input
                  aria-labelledby="enc-label"
                  readOnly
                  value={generated}
                  className="hl-input hl-focus min-w-0 flex-1 font-mono text-body-sm"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(generated).then(() => setCopied(true));
                  }}
                >
                  <Copy aria-hidden {...iconDefaults} className="size-4" />
                  {copied ? copy.copied : copy.copy}
                </Button>
              </div>
            </div>
            <p className="m-0 flex gap-2.5 rounded-md bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3.5 py-3 text-body-sm text-ink">
              <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4.5 shrink-0 text-warning" />
              {copy.saveWarning}
            </p>
          </>
        )}

        {result && 'error' in result && errorKind(result.error) === 'other' ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {result.error}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}

/** Where an error goes: under the secret key, under the password, or below the form. */
function errorKind(message: string): 'keys' | 'password' | 'other' {
  if (message === copy.badKeys) return 'keys';
  if (message === copy.wrongRepoPassword) return 'password';
  return 'other';
}
