// App sources (StoreSources, StoreSourcesLibrary; US-STORE-18, 19, 27, 28), admins only. Each source with where it
// is, how many apps and when it was last checked; the built-in one "Can't be removed"; Check now (a git source) or
// Open folder (a folder library); Remove with a confirmation; a library's broken apps with file and line. "Add a
// source" inspects the address first and asks "Trust this source?" with the signing key's fingerprint (or that it
// isn't signed) before anything is saved.
import type { AppSource } from '@hlabs/api';
import { AlertTriangle, FolderClosed, GitBranch, iconDefaults, LogoMark, ShieldCheck } from '@hlabs/icons';
import { helpUrl } from '@hlabs/shared';
import { Badge, Button, cn, ModalDialog, Segmented, TextField, tokens } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { sourcesCopy as copy } from '../copy/store-sources';
import { confirm } from '../lib/confirm';
import { codeText, errorText, handledGlobally, pageQuery, showErrorToast } from '../lib/error-copy';
import { timeAgo } from '../lib/relative-time';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { StoreView } from './store-layout';

const TILE = tokens.SIZE_DOCK_TILE - tokens.SPACE_1;

function SourceTile({ kind }: { kind: AppSource['kind'] }) {
  if (kind === 'builtin') {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center overflow-hidden rounded-md"
        style={{ width: TILE, height: TILE }}
      >
        <LogoMark size={TILE} />
      </span>
    );
  }
  const Icon = kind === 'local' ? FolderClosed : GitBranch;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md text-ink shadow-icon"
      style={{ width: TILE, height: TILE, background: kind === 'local' ? 'var(--dock-backups)' : 'var(--dock-store)' }}
    >
      <Icon {...iconDefaults} className="size-6" />
    </span>
  );
}

/** An address that fits: a long folder path keeps its first and last two folders (`/Volumes/…/hlabs/my-apps`). */
export function shortAddress(s: Pick<AppSource, 'kind' | 'url'>): string {
  if (s.kind !== 'local') return s.url.replace(/^https:\/\//, '');
  const parts = s.url.split('/');
  return parts.length > 5 ? [...parts.slice(0, 2), '…', ...parts.slice(-2)].join('/') : s.url;
}

/** "Built in · 100 apps · checked 2 hours ago", "~/…/my-apps · folder · 3 apps · read 5 minutes ago": the address
 *  in mono, the rest in the body face. */
function Subtitle({ source: s }: { source: AppSource }) {
  const when = s.lastSyncedAt
    ? (s.kind === 'local' ? copy.read : copy.checked)(timeAgo(s.lastSyncedAt))
    : copy.neverChecked;
  const rest = [
    ...(s.kind === 'builtin' ? [copy.builtIn] : s.kind === 'local' ? [copy.folder] : []),
    copy.appCount(s.appCount),
    when,
  ].join(' · ');
  if (s.kind === 'builtin') return <span className="truncate text-body-sm text-ink-muted">{rest}</span>;
  return (
    <span className="flex min-w-0 flex-wrap text-body-sm text-ink-muted">
      <span className="max-w-full truncate font-mono" title={s.url}>
        {shortAddress(s)}
      </span>
      <span className="shrink-0 whitespace-pre"> · {rest}</span>
    </span>
  );
}

function SourceRow({ source: s, onChanged }: { source: AppSource; onChanged: () => void }) {
  const client = useTRPCClient();
  const navigate = useNavigate();
  const onError = (err: unknown) => {
    if (!handledGlobally(err)) showErrorToast(err);
  };
  const check = useMutation({
    mutationFn: () => client.store.sources.sync.mutate({ sourceId: s.id }),
    onSettled: onChanged,
    onError,
  });
  const askRemove = async () => {
    const ok = await confirm({
      title: copy.removeTitle(s.name),
      body: copy.removeBody,
      confirmLabel: copy.remove,
      tone: 'danger',
      onConfirm: () => client.store.sources.remove.mutate({ sourceId: s.id }),
    });
    if (!ok) return;
    showToast({ tone: 'success', title: copy.removed(s.name) });
    onChanged();
  };
  const leftOut = [...new Set(s.problems.map((p) => p.appId))];
  // One line per problem: a service named twice in the manifest is one problem, not two.
  const problems = [...new Map(s.problems.map((p) => [`${p.file}:${p.line ?? ''} ${p.message}`, p])).values()];
  return (
    <li className="flex flex-col gap-3 border-b border-hairline px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SourceTile kind={s.kind} />
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
          <span className="text-headline font-bold">{s.name}</span>
          <Subtitle source={s} />
          {s.keyFingerprint ? (
            <span className="font-mono text-body-sm text-ink-muted">{copy.key(s.keyFingerprint)}</span>
          ) : null}
          {s.lastError ? (
            <span role="alert" className="flex items-start gap-1.5 text-body-sm font-semibold text-warning">
              <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0" />
              {s.enabled ? codeText(s.lastError).title : copy.stopped}
            </span>
          ) : null}
          {leftOut.length ? (
            <span className="flex items-center gap-1.5 text-body-sm font-semibold text-warning">
              <AlertTriangle aria-hidden {...iconDefaults} className="size-4 shrink-0" />
              {copy.problems(leftOut.length)}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {s.signed ? (
            <Badge>
              <ShieldCheck aria-hidden {...iconDefaults} className="size-3.5" />
              {copy.signed}
            </Badge>
          ) : (
            <Badge tone="warning">
              <AlertTriangle aria-hidden {...iconDefaults} className="size-3.5" />
              {copy.notSigned}
            </Badge>
          )}
          {s.removable ? null : <Badge>{copy.cantBeRemoved}</Badge>}
          {s.kind === 'local' ? (
            s.filesPath ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void navigate({ to: '/files', search: { path: s.filesPath! } })}
              >
                {copy.openFolder}
              </Button>
            ) : null
          ) : s.kind !== 'builtin' ? (
            <Button
              variant="secondary"
              size="sm"
              busy={check.isPending}
              aria-label={copy.checkNowFor(s.name)}
              onClick={() => check.mutate()}
            >
              {check.isPending ? copy.checking : copy.checkNow}
            </Button>
          ) : null}
          {s.removable ? (
            <Button
              variant="secondary"
              size="sm"
              className="text-danger"
              aria-label={copy.removeFor(s.name)}
              onClick={() => void askRemove()}
            >
              {copy.remove}
            </Button>
          ) : null}
        </div>
      </div>
      {problems.length ? (
        <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-scrim px-4 py-3 text-body-sm md:ml-[calc(var(--size-dock-tile)-var(--space-1)+var(--space-4))] md:max-w-xl">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {problems.map((p) => (
              <li key={`${p.file}:${p.line ?? ''} ${p.message}`} className="break-words">
                {p.file}
                {p.line ? `:${p.line}` : ''} {p.message}
              </li>
            ))}
          </ul>
          <p className="m-0 text-ink-muted">
            {leftOut.length === 1 ? copy.leftOut(leftOut[0]!) : copy.leftOutMany(leftOut.join(', '))}
          </p>
        </div>
      ) : null}
    </li>
  );
}

type Seen = {
  kind: 'git' | 'index' | 'local';
  url: string;
  name: string;
  appCount: number;
  signed: boolean;
  keyFingerprint: string | null;
};

function AddSource({ focus, onAdded }: { focus: boolean; onAdded: () => void }) {
  const client = useTRPCClient();
  const [kind, setKind] = useState<'git' | 'folder'>('git');
  const [url, setUrl] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  const inspect = useMutation({
    mutationFn: () => client.store.sources.inspect.query({ url: url.trim() }),
    onSuccess: (s) => {
      setFieldError(null);
      setSeen(s);
    },
    onError: (err) => {
      if (handledGlobally(err)) return;
      setFieldError(errorText(err).title);
    },
  });
  const add = useMutation({
    mutationFn: (s: Seen) => client.store.sources.add.mutate({ url: url.trim(), keyFingerprint: s.keyFingerprint }),
    onSuccess: (_r, s) => {
      showToast({ tone: 'success', title: copy.added(s.name) });
      setSeen(null);
      setUrl('');
      onAdded();
    },
    onError: (err) => {
      setSeen(null);
      if (!handledGlobally(err)) setFieldError(errorText(err).title);
    },
  });

  return (
    <section aria-labelledby="add-source" className="flex flex-col gap-4 rounded-xl bg-surface-row p-5">
      <h2 id="add-source" className="m-0 text-headline font-bold">
        {copy.add}
      </h2>
      <div className="self-start">
        <Segmented
          aria-label={copy.sourceKind}
          value={kind}
          onChange={(v) => {
            setKind(v as 'git' | 'folder');
            setFieldError(null);
          }}
          options={[
            { value: 'git', label: copy.kindGit },
            { value: 'folder', label: copy.kindFolder },
          ]}
        />
      </div>
      <form
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) inspect.mutate();
        }}
      >
        <div className="min-w-0 flex-1 basis-72">
          <TextField
            ref={input}
            label={<span className="sr-only">{kind === 'git' ? copy.addressLabel : copy.folderLabel}</span>}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setFieldError(null);
            }}
            placeholder={kind === 'git' ? copy.placeholderGit : copy.placeholderFolder}
            className="[&_input]:font-mono"
            spellCheck={false}
            autoCapitalize="off"
            error={fieldError ?? undefined}
          />
        </div>
        <Button type="submit" busy={inspect.isPending} disabled={!url.trim()}>
          {copy.addButton}
        </Button>
      </form>
      <p className="m-0 flex items-start gap-2 text-body-sm text-ink-muted">
        <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0 text-warning" />
        {copy.trustNote}
      </p>
      <p className="m-0 text-body-sm text-ink-muted">
        {copy.makeYourOwn} <code className="font-mono">hlabs library init</code>.{' '}
        <a
          href={helpUrl('apps/your-own-library')}
          target="_blank"
          rel="noreferrer"
          className="hl-focus rounded-xs font-semibold text-accent-link no-underline hover:underline"
        >
          {copy.guide}
        </a>
      </p>
      <ModalDialog
        open={seen !== null}
        onOpenChange={(o) => (o ? null : setSeen(null))}
        title={copy.trustTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSeen(null)}>
              {copy.cancel}
            </Button>
            <Button busy={add.isPending} onClick={() => seen && add.mutate(seen)}>
              {copy.addSource}
            </Button>
          </>
        }
      >
        {seen ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <SourceTile kind={seen.kind} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-headline font-bold">{seen.name}</span>
                <span className="truncate font-mono text-body-sm text-ink-muted">
                  {seen.url.replace(/^https:\/\//, '')} · {copy.appCount(seen.appCount)}
                </span>
              </div>
            </div>
            {seen.keyFingerprint ? (
              <dl className="m-0 flex flex-col gap-1 rounded-md bg-surface-row px-4 py-3">
                <dt className="text-body-sm text-ink-muted">{copy.fingerprint}</dt>
                <dd className="m-0 font-mono text-body">{seen.keyFingerprint}</dd>
              </dl>
            ) : (
              <p className="m-0 flex items-start gap-2 rounded-md bg-surface-row px-4 py-3 text-body font-semibold text-warning">
                <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0" />
                {copy.unsigned}
              </p>
            )}
            <p className="m-0 text-body-sm text-ink-muted">{copy.trustNote}</p>
          </div>
        ) : null}
      </ModalDialog>
    </section>
  );
}

export function StoreSourcesView({ focusAdd = false }: { focusAdd?: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery({ ...trpc.store.sources.list.queryOptions(), retry: false, ...pageQuery });
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.store.sources.list.queryKey() });
    // New or removed apps: the store's lists, categories and home.
    void queryClient.invalidateQueries({ queryKey: trpc.store.pathKey() });
  };
  return (
    <StoreView title={copy.title}>
      <div className="flex flex-col gap-6 pb-6">
        <p className="m-0 text-body text-ink-muted">{copy.intro}</p>
        {list.data ? (
          <ul aria-label={copy.title} className={cn('m-0 list-none overflow-hidden rounded-xl bg-surface-row p-0')}>
            {list.data.sources.map((s) => (
              <SourceRow key={s.id} source={s} onChanged={changed} />
            ))}
          </ul>
        ) : null}
        <AddSource focus={focusAdd} onAdded={changed} />
      </div>
    </StoreView>
  );
}

/** Where "Add another app source" goes (US-STORE-19): App sources with the address field focused. */
export const addSourceLink = { to: '/store/sources', search: { add: true } } as const;
