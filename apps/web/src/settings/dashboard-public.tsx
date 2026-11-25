// The dashboard on the internet (US-SYS-45, US-SYS-48; D-182): its row in Settings › Network's Public access
// (SettingsNetworkPublicDashboard), "Make public…" (DashboardPublic: the address, what changes, what only works at home,
// the admins' two-factor, Cloudflare's sign-in in front and the password), "Make private", and Cloudflare's sign-in in
// front on its own (CloudflareAccessSetup: the email addresses, and an API token when the Cloudflare sign-in can't
// manage Access). Making it public and changing Cloudflare's sign-in are home-only (US-SYS-47); making it private isn't.
import type { CloudflareStatus, DashboardPublic, PublicAppRow } from '@hlabs/api';
import { Check, Globe, House, Info, Monitor, ShieldCheck, TriangleAlert, X, iconDefaults } from '@hlabs/icons';
import { Avatar, avatarColorFor, Button, ListRow, ModalDialog, Switch, TextField, useIsPhone } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { publicCopy } from '../copy/public';
import { publicDashboardCopy as copy } from '../copy/public-dashboard';
import { confirm } from '../lib/confirm';
import { codeLine, errorCode, errorData, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { Callout } from '../public/callout';
import { HomeOnly, useOnPublic } from '../public/home-only';
import { followJob, usePublicRefresh } from '../public/jobs';
import { PublicBadge } from '../public/public-badge';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Cloudflare Access is free for up to 50 people (US-SYS-48). */
export const MAX_EMAILS = 50;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A whole Cloudflare API token is 40 characters; the daemon accepts 20 to 400. */
const TOKEN_MIN = 20;

function DashboardIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-control text-ink">
      <Monitor aria-hidden {...iconDefaults} size={18} />
    </span>
  );
}

/** The dashboard as a line in the Remove and Turn off all confirmations: first, before the apps. */
export function DashboardToChange({ dashboard }: { dashboard: DashboardPublic }) {
  return (
    <ListRow
      leading={<DashboardIcon />}
      title={copy.dashboardRow}
      subtitle={<span className="font-mono">{dashboard.address}</span>}
    />
  );
}

/** "Make private" for the dashboard: asked first; works from the public address too (and ends that session). */
export function useMakeDashboardPrivate() {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  const onPublic = useOnPublic();
  return (dashboard: DashboardPublic) =>
    confirm({
      title: copy.makePrivateTitle,
      body: onPublic ? copy.makePrivateBodyHere(dashboard.address) : copy.makePrivateBody(dashboard.address),
      confirmLabel: copy.makePrivate,
      onConfirm: async () => {
        const { jobId } = await client.public.setDashboard.mutate({ public: false });
        void followJob(client, jobId).then((job) => {
          refresh();
          if (job?.state === 'succeeded') showToast({ tone: 'success', title: copy.madePrivate });
          else if (job?.state === 'failed')
            showToast({
              tone: 'danger',
              title: copy.makePrivateFailed,
              body: job.hlabsCode ? codeLine(job.hlabsCode) : undefined,
            });
        });
        return { jobId };
      },
    });
}

/** The Dashboard row of Public access (SettingsNetworkPublicDashboard). */
export function DashboardRow({
  cf,
  dashboard,
  blockedBy,
  apps,
}: {
  cf: CloudflareStatus;
  dashboard: DashboardPublic | null;
  blockedBy: readonly string[];
  apps: readonly PublicAppRow[];
}) {
  const desktop = useIsDesktop();
  const makePrivate = useMakeDashboardPrivate();
  const [dialog, setDialog] = useState<'public' | 'access' | null>(null);
  const tunnel = cf.setUpAt !== null && cf.domain !== null;
  if (!dashboard) {
    const button = (
      <HomeOnly procedure="public.setDashboard" input={{ public: true }} label={copy.makePublic}>
        <Button variant="secondary" size="sm" onClick={() => setDialog('public')}>
          {copy.makePublic}
        </Button>
      </HomeOnly>
    );
    return (
      <>
        <ListRow
          leading={<DashboardIcon />}
          title={copy.dashboard}
          subtitle={tunnel ? copy.notPublic : copy.needsTunnel}
          trailing={tunnel && desktop ? button : undefined}
          below={tunnel && !desktop ? button : undefined}
        />
        {dialog === 'public' && cf.domain ? (
          <DashboardPublicDialog
            domain={cf.domain}
            blockedBy={blockedBy}
            taken={apps.map((a) => a.address.replace(/^https:\/\//, '').split('.')[0]!)}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </>
    );
  }
  const access = dashboard.cloudflareAccess;
  const buttons = (
    <span className="flex shrink-0 flex-wrap items-center gap-2">
      <HomeOnly procedure="public.setDashboardAccess" label={access ? copy.change : copy.addAccess}>
        <Button variant="secondary" size="sm" onClick={() => setDialog('access')}>
          {access ? copy.change : copy.addAccess}
        </Button>
      </HomeOnly>
      <Button
        variant="secondary"
        size="sm"
        aria-label={`${copy.makePrivate}: ${copy.dashboard}`}
        onClick={() => void makePrivate(dashboard)}
      >
        {copy.makePrivate}
      </Button>
    </span>
  );
  return (
    <>
      <ListRow
        leading={<DashboardIcon />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {copy.dashboard}
            <PublicBadge />
          </span>
        }
        subtitle={
          <span className="flex flex-col gap-0.5">
            <span>
              {copy.publicAt}{' '}
              <a
                href={dashboard.address}
                target="_blank"
                rel="noopener noreferrer"
                className="hl-focus rounded-xs font-mono text-ink underline-offset-2 hover:underline"
              >
                {dashboard.address}
              </a>{' '}
              · {copy.sinceBy(dashboard.since, dashboard.by)}
            </span>
            {access ? (
              <span className="flex items-center gap-1.5">
                <ShieldCheck aria-hidden {...iconDefaults} size={13} />
                {copy.accessLine(access.emails.length)}
              </span>
            ) : null}
          </span>
        }
        trailing={desktop ? buttons : undefined}
        below={desktop ? undefined : buttons}
      />
      {dialog === 'access' ? <CloudflareAccessDialog dashboard={dashboard} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

/** The email addresses allowed past Cloudflare's sign-in: chips, and a field that adds one on Return or a comma. */
export function EmailsField({
  emails,
  onChange,
  disabled,
  error,
}: {
  emails: readonly string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = () => {
    const email = draft.trim().toLowerCase().replace(/,$/, '');
    if (!email) return true;
    if (!EMAIL.test(email)) {
      setInvalid(copy.emailInvalid);
      return false;
    }
    if (!emails.includes(email)) {
      if (emails.length >= MAX_EMAILS) {
        setInvalid(copy.emailsTooMany);
        return false;
      }
      onChange([...emails, email]);
    }
    setDraft('');
    setInvalid(null);
    return true;
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && draft === '' && emails.length) {
      onChange(emails.slice(0, -1));
    }
  };
  const message = invalid ?? error ?? copy.emailsHint;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body-sm font-semibold">
        {copy.emailsAllowed}
      </label>
      <div
        className={`flex min-h-11 flex-wrap items-center gap-2 rounded-sm border bg-surface-input p-2 ${invalid || error ? 'border-danger' : 'border-border-input'}`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        <ul aria-label={copy.emailsAllowed} className="contents">
          {emails.map((email) => (
            <li
              key={email}
              className="flex h-8 items-center gap-1 rounded-pill bg-surface-control pr-1 pl-3 text-body-sm"
            >
              {email}
              <button
                type="button"
                disabled={disabled}
                aria-label={copy.removeEmail(email)}
                onClick={() => onChange(emails.filter((e) => e !== email))}
                className="hl-focus grid size-6 cursor-pointer place-items-center rounded-pill border-0 bg-surface-control text-ink"
              >
                <X aria-hidden {...iconDefaults} size={12} />
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={input}
          id={id}
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="enter"
          disabled={disabled}
          placeholder={copy.addEmail}
          aria-invalid={invalid || error ? true : undefined}
          aria-describedby={`${id}-msg`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(null);
          }}
          onKeyDown={onKey}
          onBlur={() => void add()}
          className="hl-focus h-8 min-w-40 flex-1 bg-transparent px-1.5 text-body text-ink outline-none"
        />
      </div>
      <span
        id={`${id}-msg`}
        role={invalid || error ? 'alert' : undefined}
        className={`text-caption ${invalid || error ? 'text-danger' : 'text-ink-muted'}`}
      >
        {message}
      </span>
    </div>
  );
}

/** "hlabs makes this in Cloudflare Zero Trust for hlabs.example.com and removes it when the dashboard is private." */
function AccessMadeNote({ hostname }: { hostname: string }) {
  const made = copy.accessMade(hostname);
  return (
    <Callout icon={<Info aria-hidden {...iconDefaults} size={16} className="text-accent-link" />}>
      <p className="m-0">
        {made.before} <span className="font-mono font-semibold">{made.hostname}</span> {made.after}
      </p>
    </Callout>
  );
}

/** Cloudflare can't manage Access with hlabs's sign-in: the token it needs, with what it must allow. */
function AccessToken({
  token,
  onChange,
  disabled,
  error,
}: {
  token: string;
  onChange: (token: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  return (
    <>
      <Callout
        tone="warning"
        role="alert"
        icon={<TriangleAlert aria-hidden {...iconDefaults} size={16} className="text-warning" />}
      >
        <p className="m-0">{copy.needsToken}</p>
      </Callout>
      <TextField
        label={copy.apiToken}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        disabled={disabled}
        value={token}
        error={error ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        hint={
          <span className="flex flex-col items-start gap-1.5">
            <span>{copy.tokenHint}</span>
            <code className="rounded-xs bg-surface-control px-2 py-0.5 font-mono text-caption text-ink">
              {copy.tokenPermission}
            </code>
            <span>{copy.tokenKept}</span>
          </span>
        }
      />
    </>
  );
}

/** Sends the change and follows the job; a refusal that needs a token says so. */
async function setAccess(
  client: ReturnType<typeof useTRPCClient>,
  input: { emails: string[]; token?: string } | { off: true },
): Promise<{ ok: true } | { ok: false; needsToken: boolean; message: string }> {
  try {
    const { jobId } = await client.public.setDashboardAccess.mutate(input);
    const job = await followJob(client, jobId);
    // Access was checked before the job started, so a failure in it is Cloudflare not answering, not a permission.
    if (job?.state === 'failed')
      return { ok: false, needsToken: false, message: job.hlabsCode ? codeLine(job.hlabsCode) : '' };
    return { ok: true };
  } catch (err) {
    const detail = errorData(err)?.detail;
    const needsToken = errorCode(err) === 'CLOUDFLARE_FAILED' && detail?.needsToken === true;
    return { ok: false, needsToken, message: errorLine(err) };
  }
}

/** CloudflareAccessSetup: add it, change its list, or remove it (from Change…). */
export function CloudflareAccessDialog({
  dashboard,
  startEmails,
  startNeedsToken = false,
  onClose,
}: {
  dashboard: DashboardPublic;
  /** Carried over from DashboardPublic when the token was asked for after making it public. */
  startEmails?: readonly string[];
  startNeedsToken?: boolean;
  onClose: () => void;
}) {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  const phone = useIsPhone();
  const current = dashboard.cloudflareAccess;
  const [emails, setEmails] = useState<string[]>([...(startEmails ?? current?.emails ?? [])]);
  const [needsToken, setNeedsToken] = useState(startNeedsToken);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const same =
    current !== null && emails.length === current.emails.length && emails.every((e) => current.emails.includes(e));

  const submit = async () => {
    setError(null);
    if (emails.length === 0) return setEmailsError(copy.emailsNeeded);
    if (needsToken && token.trim().length < TOKEN_MIN) return setTokenError(copy.tokenTooShort);
    setBusy(true);
    const result = await setAccess(client, { emails, ...(needsToken ? { token: token.trim() } : {}) });
    refresh();
    setBusy(false);
    if (result.ok) {
      showToast({ tone: 'success', title: current ? copy.accessChanged : copy.accessAdded });
      onClose();
    } else if (result.needsToken) {
      if (needsToken) setTokenError(result.message);
      setNeedsToken(true);
    } else {
      setError(result.message);
    }
  };

  const remove = () => {
    onClose();
    void confirm({
      title: copy.removeAccessTitle,
      body: copy.removeAccessBody,
      confirmLabel: copy.removeAccess,
      onConfirm: async () => {
        const result = await setAccess(client, { off: true });
        refresh();
        if (!result.ok) throw new Error(result.message);
        showToast({ tone: 'success', title: copy.accessRemoved });
      },
    });
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
      width={580}
      icon={
        <span className="grid size-12 place-items-center rounded-md bg-surface-control text-ink">
          <ShieldCheck aria-hidden {...iconDefaults} />
        </span>
      }
      title={current ? copy.accessChangeTitle : copy.accessTitle}
      description={copy.accessExplain}
      actions={
        <div className={phone ? 'hl-sheet-actions-row' : 'contents'}>
          {current ? (
            <Button variant="secondary" className="text-danger md:mr-auto" disabled={busy} onClick={remove}>
              {copy.removeAccess}
            </Button>
          ) : null}
          {cancel}
          <Button busy={busy} disabled={emails.length === 0 || (same && !needsToken)} onClick={() => void submit()}>
            {current ? copy.save : copy.addAccessConfirm}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4 text-ink"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <EmailsField
          emails={emails}
          disabled={busy}
          error={emailsError}
          onChange={(next) => {
            setEmails(next);
            setEmailsError(null);
          }}
        />
        <AccessMadeNote hostname={dashboard.hostname} />
        {needsToken ? (
          <AccessToken
            token={token}
            disabled={busy}
            error={tokenError}
            onChange={(t) => {
              setToken(t);
              setTokenError(null);
            }}
          />
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}

/** Who the admins are and whether each has two-factor on (DashboardPublic's right column). */
function Admins({ blockedBy }: { blockedBy: readonly string[] }) {
  const trpc = useTRPC();
  const users = useQuery({ ...trpc.users.list.queryOptions(), retry: false });
  const admins = (users.data?.users ?? []).filter((u) => u.role === 'admin' && !u.disabled);
  // The daemon's word decides (`dashboardBlockedBy`); the list only shows who's who.
  const rows = admins.length
    ? admins.map((a) => ({
        id: a.id,
        name: a.displayName,
        color: a.avatarColor,
        on: !blockedBy.includes(a.displayName),
      }))
    : blockedBy.map((name) => ({ id: name, name, color: null, on: false }));
  if (!rows.length) return null;
  return (
    <ul
      aria-label={copy.adminsWithTwoFactor}
      className="m-0 flex list-none flex-col overflow-hidden rounded-md bg-surface-row p-0"
    >
      {rows.map((a) => (
        <li key={a.id} className="flex min-h-11 items-center gap-2.5 border-hairline px-4 text-body-sm [&+&]:border-t">
          <Avatar name={a.name} color={avatarColorFor(a.name, a.color)} size="md" className="size-6 text-caption" />
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          {a.on ? (
            <span className="flex shrink-0 items-center gap-1.5 font-semibold text-success">
              <Check aria-hidden {...iconDefaults} size={14} />
              {copy.twoFactorOn}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 font-semibold text-warning">
              <TriangleAlert aria-hidden {...iconDefaults} size={14} />
              {copy.noTwoFactorYet}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** DashboardPublic: the name under the domain, what changes, what only works at home, and "Make the dashboard public". */
export function DashboardPublicDialog({
  domain,
  blockedBy,
  taken,
  onClose,
}: {
  domain: string;
  blockedBy: readonly string[];
  /** Names public apps already use under the domain. */
  taken: readonly string[];
  onClose: () => void;
}) {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  const phone = useIsPhone();
  const [label, setLabel] = useState('hlabs');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [withAccess, setWithAccess] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<readonly string[]>(blockedBy);
  const [askToken, setAskToken] = useState<{ dashboard: DashboardPublic; emails: string[] } | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const name = label.trim().toLowerCase();
  const canSubmit = blocked.length === 0 && password.length > 0 && name !== '';

  const submit = async () => {
    setError(null);
    if (!LABEL.test(name)) return setLabelError(publicCopy.labelInvalid);
    if (taken.includes(name)) return setLabelError(publicCopy.labelTaken(`${name}.${domain}`));
    if (withAccess && emails.length === 0) return setEmailsError(copy.emailsNeeded);
    setBusy(true);
    try {
      const { jobId } = await client.public.setDashboard.mutate({ public: true, hostname: name, password });
      const job = await followJob(client, jobId);
      refresh();
      if (job?.state === 'failed') {
        setBusy(false);
        if (job.hlabsCode === 'PUBLIC_HOSTNAME_TAKEN')
          return setLabelError(publicCopy.hostnameTaken(`${name}.${domain}`));
        if (job.hlabsCode === 'TWO_FACTOR_REQUIRED_FOR_DASHBOARD') {
          // An admin turned two-factor off meanwhile: who, from the status.
          const status = await client.public.status.query().catch(() => null);
          if (status?.dashboardBlockedBy.length) return setBlocked(status.dashboardBlockedBy);
        }
        return setError(job.hlabsCode ? codeLine(job.hlabsCode) : copy.makePublicFailed);
      }
      const address = `https://${name}.${domain}`;
      showToast({ tone: 'success', title: copy.madePublic, body: copy.madePublicBody(address) });
      if (withAccess) {
        const result = await setAccess(client, { emails });
        refresh();
        if (!result.ok && result.needsToken) {
          // The dashboard is public; Cloudflare's sign-in needs a token first (CloudflareAccessSetup).
          const status = await client.public.status.query().catch(() => null);
          if (status?.dashboard) {
            setBusy(false);
            setAskToken({ dashboard: status.dashboard, emails });
            return;
          }
        }
        if (!result.ok)
          showToast({ tone: 'danger', title: copy.accessFailed, body: result.message || copy.accessFailedBody });
      }
      onClose();
    } catch (err) {
      setBusy(false);
      const code = errorCode(err);
      const detail = errorData(err)?.detail;
      if (code === 'AUTH_INVALID_PASSWORD') {
        setPassword('');
        setPasswordError(copy.wrongPassword);
        passwordRef.current?.focus();
      } else if (code === 'PUBLIC_HOSTNAME_TAKEN') {
        setLabelError(
          publicCopy.hostnameTaken(typeof detail?.hostname === 'string' ? detail.hostname : `${name}.${domain}`),
        );
      } else if (code === 'TWO_FACTOR_REQUIRED_FOR_DASHBOARD') {
        setBlocked(Array.isArray(detail?.admins) ? (detail.admins as string[]) : blocked);
      } else {
        setError(errorLine(err));
      }
    }
  };

  if (askToken)
    return (
      <CloudflareAccessDialog
        dashboard={askToken.dashboard}
        startEmails={askToken.emails}
        startNeedsToken
        onClose={onClose}
      />
    );

  const left = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="dashboard-label" className="text-body-sm font-semibold">
          {copy.address}
        </label>
        <div
          className={`flex h-11 items-stretch overflow-hidden rounded-sm border bg-surface-input ${labelError ? 'border-danger' : 'border-border-input'}`}
        >
          <input
            id="dashboard-label"
            className="hl-focus min-w-0 flex-1 bg-transparent px-3.5 font-mono text-body outline-none"
            aria-label={copy.addressLabel(domain)}
            aria-invalid={labelError ? true : undefined}
            aria-describedby="dashboard-label-msg"
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
          id="dashboard-label-msg"
          role={labelError ? 'alert' : undefined}
          className={`text-caption ${labelError ? 'text-danger' : 'text-ink-muted'}`}
        >
          {labelError ?? copy.addressHint(domain)}
        </span>
      </div>
      <Callout tone="warning" icon={<Globe aria-hidden {...iconDefaults} size={16} className="text-warning" />}>
        <p className="m-0">{copy.whatChanges}</p>
      </Callout>
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-body-sm font-semibold">{copy.onlyAtHome}</h3>
        <p className="m-0 text-caption text-ink-muted">{copy.onlyAtHomeHint}</p>
        <ul
          aria-label={copy.onlyAtHome}
          className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-2 rounded-md bg-surface-row px-4 py-3 text-body-sm sm:grid-cols-2"
        >
          {copy.homeOnlyList.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <House aria-hidden {...iconDefaults} size={14} className="shrink-0 text-ink-muted" />
              {item}
            </li>
          ))}
        </ul>
        <p className="m-0 text-caption text-ink-muted">{copy.alwaysWork}</p>
      </div>
    </div>
  );

  const right = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-body-sm font-semibold">{copy.adminsWithTwoFactor}</h3>
        <Admins blockedBy={blocked} />
        {blocked.length ? (
          <Callout
            tone="warning"
            role="alert"
            icon={<TriangleAlert aria-hidden {...iconDefaults} size={16} className="text-warning" />}
          >
            <p className="m-0">{copy.blocked(blocked)}</p>
          </Callout>
        ) : (
          <p className="m-0 text-caption text-ink-muted">{copy.membersNote}</p>
        )}
      </div>
      <div
        className={`flex flex-col gap-3 rounded-md border p-4 ${withAccess ? 'border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-accent-wash' : 'border-border-glass bg-surface-row'}`}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden {...iconDefaults} size={18} className="mt-0.5 shrink-0 text-accent-link" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span id="dashboard-access-title" className="text-body-sm font-semibold">
              {copy.accessToggle}
            </span>
            <span className="text-caption text-ink-muted">{copy.accessExplain}</span>
          </div>
          <Switch aria-label={copy.accessToggle} checked={withAccess} disabled={busy} onChange={setWithAccess} />
        </div>
        {withAccess ? (
          <EmailsField
            emails={emails}
            disabled={busy}
            error={emailsError}
            onChange={(next) => {
              setEmails(next);
              setEmailsError(null);
            }}
          />
        ) : null}
      </div>
      <TextField
        ref={passwordRef}
        label={copy.password}
        type="password"
        autoComplete="current-password"
        disabled={busy}
        value={password}
        error={passwordError ?? undefined}
        hint={copy.passwordHint}
        onChange={(e) => {
          setPassword(e.target.value);
          setPasswordError(null);
        }}
      />
    </div>
  );

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || busy ? null : onClose())}
      dismissible={!busy}
      guarded
      width={1040}
      icon={
        <span className="grid size-12 place-items-center rounded-md bg-surface-control text-ink">
          <Monitor aria-hidden {...iconDefaults} />
        </span>
      }
      title={copy.makePublicTitle}
      actions={
        <div className={phone ? 'flex w-full flex-col gap-3' : 'flex w-full items-center gap-3'}>
          <p className="m-0 flex flex-1 items-center gap-2 text-caption text-ink-muted">
            <Info aria-hidden {...iconDefaults} size={14} className="shrink-0" />
            {copy.othersTold}
          </p>
          <div className={phone ? 'hl-sheet-actions-row' : 'contents'}>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {copy.cancel}
            </Button>
            <Button busy={busy} disabled={!canSubmit} onClick={() => void submit()}>
              {copy.confirm}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="grid grid-cols-1 gap-6 text-ink md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        {left}
        {right}
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger md:col-span-2">
            {error}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
