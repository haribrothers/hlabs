// An app's "Public on the internet" (US-APP-27, US-APP-28; AppSettingsPrivate, AppSettingsPublic, AppPublic,
// AppPublicOwnLogin, PhoneAppPublic): "Make public…" once Cloudflare Tunnel is set up, the line saying to set it up
// first, or why the app can't be public; while public, its address, who can get in, since when and by whom, with
// Visits, Change… and Make private. The dialog picks the name under the domain and who can get in.
import type { AppDetail, PublicAccess, PublicOptions } from '@hlabs/api';
import { AppLogo, appTileLook, Check, Globe, Lock, TriangleAlert, iconDefaults } from '@hlabs/icons';
import { Avatar, avatarColorFor, Button, ChoiceList, ListRow, ModalDialog, useIsPhone } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { publicCopy as copy } from '../copy/public';
import { codeLine, errorCode, errorData, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { Callout } from '../public/callout';
import { followJob, usePublicRefresh } from '../public/jobs';
import { useMakePrivate } from '../public/make-private';
import { PublicBadge } from '../public/public-badge';
import { HomeOnly } from '../public/home-only';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DIALOG_LOGO = 48;

export function usePublicOptions(appId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.apps.publicOptions.queryOptions({ appId }), retry: false });
}

/** The row in App settings › Access. */
export function PublicRow({
  app,
  onOpenVisits,
  onOpenPermissions,
}: {
  app: AppDetail;
  onOpenVisits: () => void;
  /** "Who has access": the app's Permissions tab. */
  onOpenPermissions?: () => void;
}) {
  const options = usePublicOptions(app.id);
  const makePrivate = useMakePrivate();
  const [dialog, setDialog] = useState<'make' | 'change' | null>(null);
  usePublicRefresh();
  const pub = app.public ?? null;
  if (!options.data && !pub) return null;
  const o = options.data;
  let row;
  if (pub) {
    row = (
      <ListRow
        title={
          <span className="flex flex-wrap items-center gap-2">
            {copy.publicOnInternet}
            <PublicBadge />
          </span>
        }
        subtitle={
          <span className="flex flex-col gap-1">
            <a
              href={pub.address}
              target="_blank"
              rel="noopener noreferrer"
              className="hl-focus rounded-xs font-mono text-body-sm text-ink underline-offset-2 hover:underline"
            >
              {pub.address}
            </a>
            <span>{copy.publicLine(pub.access, app.name, pub.since, pub.by)}</span>
          </span>
        }
        below={
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenVisits}>
              {copy.visits}
            </Button>
            {o ? (
              <HomeOnly procedure="apps.setPublic" input={{ public: true }} label={copy.change}>
                <Button variant="secondary" size="sm" onClick={() => setDialog('change')}>
                  {copy.change}
                </Button>
              </HomeOnly>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void makePrivate({ appId: app.id, name: app.name, address: pub.address })}
            >
              {copy.makePrivate}
            </Button>
          </span>
        }
      />
    );
  } else if (o && !o.allowed) {
    row = (
      <ListRow
        title={copy.publicOnInternet}
        subtitle={copy.notAllowed(app.name, o.reason)}
        trailing={<span className="shrink-0 text-body-sm text-ink-muted">{copy.neverPublic}</span>}
      />
    );
  } else if (o && !o.domain) {
    row = (
      <ListRow
        title={copy.publicOnInternet}
        subtitle={copy.setUpFirst}
        trailing={
          <Link
            to="/settings/$section"
            params={{ section: 'network' }}
            className="hl-btn hl-btn-secondary hl-btn-sm hl-focus no-underline"
          >
            {copy.openNetworkSettings}
          </Link>
        }
      />
    );
  } else {
    row = (
      <ListRow
        title={copy.publicOnInternet}
        subtitle={copy.notPublic(app.name)}
        trailing={
          <HomeOnly procedure="apps.setPublic" input={{ public: true }} label={copy.makePublicEllipsis}>
            <Button variant="secondary" size="sm" onClick={() => setDialog('make')}>
              {copy.makePublicEllipsis}
            </Button>
          </HomeOnly>
        }
      />
    );
  }
  return (
    <>
      {row}
      {dialog && o ? (
        <AppPublicDialog
          app={app}
          options={o}
          onClose={() => setDialog(null)}
          onOpenPermissions={
            onOpenPermissions
              ? () => {
                  setDialog(null);
                  onOpenPermissions();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

/** Who's allowed in with the hlabs login, and whether each has two-factor on (US-APP-28). */
function People({ options, onOpenPermissions }: { options: PublicOptions; onOpenPermissions?: () => void }) {
  const without = options.people.filter((p) => !p.totpEnabled).map((p) => p.displayName);
  const nobody = options.people.length > 0 && without.length === options.people.length;
  return (
    <>
      <ul aria-label={copy.whoCanGetIn} className="m-0 flex list-none flex-col gap-1.5 p-0">
        {options.people.map((p) => (
          <li key={p.id} className="flex min-h-8 items-center gap-2.5 text-body-sm">
            <Avatar
              name={p.displayName}
              color={avatarColorFor(p.displayName, p.avatarColor)}
              size="md"
              className="size-6 text-caption"
            />
            <span className="min-w-0 flex-1 truncate">{p.displayName}</span>
            {p.totpEnabled ? (
              <span className="flex shrink-0 items-center gap-1.5 font-semibold text-success">
                <Check aria-hidden {...iconDefaults} size={14} />
                {copy.twoFactorOn}
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5 font-semibold text-warning">
                <TriangleAlert aria-hidden {...iconDefaults} size={14} />
                {copy.cantGetInYet}
              </span>
            )}
          </li>
        ))}
      </ul>
      {without.length ? (
        <p className="m-0 text-caption text-ink-muted">
          {nobody ? copy.nobodyHasTwoFactor : copy.noTwoFactor(without)}
          {onOpenPermissions ? (
            <>
              {' '}
              <button
                type="button"
                onClick={onOpenPermissions}
                className="hl-focus cursor-pointer rounded-xs border-0 bg-transparent p-0 font-semibold text-accent-link"
              >
                {copy.whoHasAccess}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

/** AppPublic: the name under the domain, who can get in, and "Make public" (or Save, when changing). */
export function AppPublicDialog({
  app,
  options,
  onClose,
  onOpenPermissions,
}: {
  app: AppDetail;
  options: PublicOptions;
  onClose: () => void;
  onOpenPermissions?: () => void;
}) {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  const phone = useIsPhone();
  const current = options.current;
  const domain = options.domain ?? '';
  const [label, setLabel] = useState(
    current ? current.hostname.slice(0, -(domain.length + 1)) : options.suggestedLabel,
  );
  const [access, setAccess] = useState<PublicAccess>(current?.access ?? 'hlabs');
  const [understood, setUnderstood] = useState(current?.access === 'ownLogin');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const own = access === 'ownLogin';
  const name = label.trim().toLowerCase();
  const changed = !current || name !== current.hostname.split('.')[0] || access !== current.access;
  const nobody = access === 'hlabs' && options.people.length > 0 && options.people.every((p) => !p.totpEnabled);
  const canSubmit = changed && (!own || understood) && !nobody;
  const look = appTileLook(app.name, app.icon, DIALOG_LOGO);

  const submit = async () => {
    setError(null);
    if (!LABEL.test(name)) return setLabelError(copy.labelInvalid);
    if (options.taken.includes(name) && name !== current?.hostname.split('.')[0])
      return setLabelError(copy.labelTaken(`${name}.${domain}`));
    setLabelError(null);
    setBusy(true);
    try {
      const { jobId } = await client.apps.setPublic.mutate({
        appId: app.id,
        public: true,
        hostname: name,
        access,
        ...(own ? { understood } : {}),
      });
      const job = await followJob(client, jobId);
      refresh();
      if (job?.state === 'failed') {
        if (job.hlabsCode === 'PUBLIC_HOSTNAME_TAKEN') setLabelError(copy.hostnameTaken(`${name}.${domain}`));
        else setError(job.hlabsCode ? codeLine(job.hlabsCode) : copy.makePublicFailed(app.name));
        setBusy(false);
        return;
      }
      showToast({ tone: 'success', title: current ? copy.publicChanged(app.name) : copy.madePublic(app.name) });
      onClose();
    } catch (err) {
      setBusy(false);
      const detail = errorData(err)?.detail;
      if (errorCode(err) === 'PUBLIC_HOSTNAME_TAKEN')
        setLabelError(copy.hostnameTaken(typeof detail?.hostname === 'string' ? detail.hostname : `${name}.${domain}`));
      else setError(errorLine(err));
    }
  };

  const hlabsOption = {
    value: 'hlabs' as const,
    title: copy.hlabsLogin(app.name),
    subtitle: copy.hlabsLoginHint,
    below:
      access === 'hlabs' && options.people.length ? (
        <People options={options} onOpenPermissions={onOpenPermissions} />
      ) : undefined,
  };
  const ownOption = {
    value: 'ownLogin' as const,
    title: copy.ownLogin(app.name),
    subtitle: copy.ownLoginHint,
    below: own ? (
      <Callout
        tone="danger"
        role="alert"
        icon={<TriangleAlert aria-hidden {...iconDefaults} size={16} className="text-danger" />}
      >
        <p className="m-0">{copy.ownLoginWarning(app.name)}</p>
        <label className="flex min-h-11 items-center gap-3 text-body-sm font-semibold">
          <input
            type="checkbox"
            className="hl-focus size-5 accent-[var(--danger)]"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          {copy.understand}
        </label>
      </Callout>
    ) : undefined,
  };

  const cancel = (
    <Button variant="secondary" disabled={busy} onClick={onClose}>
      {copy.cancel}
    </Button>
  );
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || busy ? null : onClose())}
      dismissible={!busy}
      guarded
      width={640}
      title={
        <span className="flex items-center gap-3">
          <AppLogo
            decorative
            name={app.name}
            src={app.icon.logoUrl}
            colors={look.colors}
            fallbackIcon={look.fallbackIcon}
            size={DIALOG_LOGO}
          />
          {current ? copy.changeTitle(app.name) : copy.makePublicTitle(app.name)}
        </span>
      }
      actions={
        // PhoneAppPublic: Cancel and Make public side by side at the sheet's foot.
        <div className={phone ? 'hl-sheet-actions-row' : 'contents'}>
          {cancel}
          <Button busy={busy} disabled={!canSubmit} onClick={() => void submit()}>
            {current ? copy.save : copy.makePublic}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5 text-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="public-label" className="text-body-sm font-semibold">
            {copy.address}
          </label>
          <div
            className={`flex h-11 items-stretch overflow-hidden rounded-sm border bg-surface-input ${labelError ? 'border-danger' : 'border-border-input'}`}
          >
            <input
              id="public-label"
              className="hl-focus min-w-0 flex-1 bg-transparent px-3.5 font-mono text-body outline-none"
              aria-label={copy.addressLabel(domain)}
              aria-invalid={labelError ? true : undefined}
              aria-describedby="public-label-msg"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={label}
              disabled={busy}
              onChange={(e) => {
                setLabel(e.target.value);
                setLabelError(null);
              }}
            />
            <span
              aria-hidden
              className="flex items-center border-l border-border-input px-3.5 font-mono text-body-sm text-ink-muted"
            >
              .{domain}
            </span>
          </div>
          <span
            id="public-label-msg"
            role={labelError ? 'alert' : undefined}
            className={`text-caption ${labelError ? 'text-danger' : 'text-ink-muted'}`}
          >
            {labelError ?? copy.addressHint(domain, app.name)}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold">{copy.whoCanGetIn}</span>
          <ChoiceList
            label={copy.whoCanGetIn}
            value={access}
            onChange={(v) => setAccess(v)}
            options={options.ownLoginSafe || own ? [hlabsOption, ownOption] : [hlabsOption]}
          />
        </div>
        {own ? null : (
          <Callout icon={<Globe aria-hidden {...iconDefaults} size={16} className="text-accent-link" />}>
            <p className="m-0">{copy.reachNote}</p>
          </Callout>
        )}
        {options.media ? (
          <Callout
            tone="warning"
            icon={<TriangleAlert aria-hidden {...iconDefaults} size={16} className="text-warning" />}
          >
            <p className="m-0">{copy.mediaNote}</p>
          </Callout>
        ) : null}
        <p className="m-0 flex items-center gap-2 text-caption text-ink-muted">
          <Lock aria-hidden {...iconDefaults} size={14} />
          {copy.updatesStayOn(app.name)}
        </p>
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
