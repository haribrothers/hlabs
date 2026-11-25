// Settings › Network & remote access › Public access (US-SYS-43, US-SYS-44; D-171): Cloudflare Tunnel's row (set up,
// waiting, connected, not working, Remove…), every public app with its address, who can get in, since when and by
// whom, Visits and Make private, and "Turn off all public access…". Admins only (the section is).
import type { CloudflareStatus, PublicAppRow } from '@hlabs/api';
import { AppLogo, appTileLook, Ban, Cloud, iconDefaults } from '@hlabs/icons';
import { Button, List, ListRow, ModalDialog, StatusDot, tokens } from '@hlabs/ui';
import { useState, type ReactNode } from 'react';
import { useAppOverlay } from '../apps/app-overlay';
import { publicCopy as copy } from '../copy/public';
import { codeLine, codeText, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { followJob, usePublicRefresh } from '../public/jobs';
import { useMakePrivate } from '../public/make-private';
import { usePublicStatus } from '../public/status';
import { PublicBadge } from '../public/public-badge';
import { PublicSetupDialog } from './public-setup';

const LOGO = tokens.SPACE_7;

/** Set up (or being removed): a domain and when; an `error` with neither is a setup that didn't finish. */
const isSetUp = (cf: CloudflareStatus) => cf.setUpAt !== null;

function CloudIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-control text-ink">
      <Cloud aria-hidden {...iconDefaults} size={18} />
    </span>
  );
}

export function AppTile({ name, icon }: { name: string; icon: PublicAppRow['icon'] }) {
  const look = appTileLook(name, icon, LOGO);
  return (
    <AppLogo
      decorative
      name={name}
      src={icon.logoUrl}
      colors={look.colors}
      fallbackIcon={look.fallbackIcon}
      size={LOGO}
      radius={tokens.SPACE_2}
    />
  );
}

function CloudflareRow({ cf, apps, onSetUp }: { cf: CloudflareStatus; apps: PublicAppRow[]; onSetUp: () => void }) {
  const [removing, setRemoving] = useState(false);
  const setUpButton = (
    <Button variant="secondary" size="sm" onClick={onSetUp}>
      {copy.setUp}
    </Button>
  );
  let subtitle: ReactNode = copy.notSetUpHint;
  let trailing: ReactNode = setUpButton;
  if (cf.state === 'signingIn') {
    trailing = (
      <span className="flex items-center gap-3">
        <StatusDot status="working">{copy.waitingForSignIn}</StatusDot>
        {setUpButton}
      </span>
    );
  } else if (cf.state === 'settingUp') {
    trailing = <StatusDot status="working">{copy.settingUp}</StatusDot>;
  } else if (isSetUp(cf)) {
    subtitle = (
      <>
        <span className="font-mono">{cf.domain}</span> · {copy.seesTraffic}
      </>
    );
    if (cf.state === 'error' && cf.reason)
      subtitle = copy.reasons[cf.reason] ?? codeLine('CLOUDFLARE_FAILED', { step: cf.reason });
    trailing = (
      <span className="flex items-center gap-3">
        {cf.state === 'error' ? (
          <StatusDot status="failed">{copy.notWorking}</StatusDot>
        ) : (
          <StatusDot status="running">{copy.connected}</StatusDot>
        )}
        <Button variant="secondary" size="sm" onClick={() => setRemoving(true)}>
          {copy.remove}
        </Button>
      </span>
    );
  } else if (cf.state === 'error' && cf.reason) {
    // A setup that didn't finish: why, and set up again.
    subtitle = `${copy.setupFailed}: ${codeText('CLOUDFLARE_FAILED', { step: cf.reason }).title}.`;
  }
  return (
    <>
      <ListRow leading={<CloudIcon />} title={copy.cloudflareTunnel} subtitle={subtitle} trailing={trailing} />
      {removing ? <RemoveDialog apps={apps} onClose={() => setRemoving(false)} /> : null}
    </>
  );
}

/** The apps a confirmation is about, each with its address. */
export function AppsToChange({ apps }: { apps: PublicAppRow[] }) {
  return (
    <List>
      {apps.map((a) => (
        <ListRow
          key={a.appId}
          leading={<AppTile name={a.name} icon={a.icon} />}
          title={a.name}
          subtitle={<span className="font-mono">{a.address}</span>}
        />
      ))}
    </List>
  );
}

/** PublicRemove: every public app private first, then the tunnel, its DNS records and the credential. */
function RemoveDialog({ apps, onClose }: { apps: PublicAppRow[]; onClose: () => void }) {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await client.public.remove.mutate();
      onClose();
      void followJob(client, jobId).then((job) => {
        refresh();
        if (job?.state === 'succeeded') showToast({ tone: 'success', title: copy.removed });
        else if (job?.state === 'failed')
          showToast({
            tone: 'danger',
            title: copy.removeFailed,
            body: job.hlabsCode ? codeLine(job.hlabsCode) : undefined,
          });
      });
    } catch (err) {
      setError(errorLine(err));
      setBusy(false);
    }
  };
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || busy ? null : onClose())}
      role="alertdialog"
      title={copy.removeTitle}
      description={apps.length ? copy.removeBody : copy.removeBodyNone}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button busy={busy} onClick={() => void remove()}>
            {apps.length ? copy.removeConfirm : copy.removeConfirmNone}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {apps.length ? <AppsToChange apps={apps} /> : null}
        <p className="m-0 text-body-sm text-ink-muted">{copy.removeKeeps}</p>
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}

/** PublicTurnOffAll: every public app private in one job; the tunnel stays set up. */
function TurnOffAllDialog({ apps, onClose }: { apps: PublicAppRow[]; onClose: () => void }) {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await client.public.turnOffAll.mutate();
      onClose();
      void followJob(client, jobId).then((job) => {
        refresh();
        if (job?.state === 'succeeded')
          showToast({ tone: 'success', title: copy.turnedOffAll, body: copy.turnedOffAllBody });
        else if (job?.state === 'failed')
          showToast({
            tone: 'danger',
            title: copy.turnOffAllFailed,
            body: job.hlabsCode ? codeLine(job.hlabsCode) : undefined,
          });
      });
    } catch (err) {
      setError(errorLine(err));
      setBusy(false);
    }
  };
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || busy ? null : onClose())}
      role="alertdialog"
      title={copy.turnOffAllTitle}
      description={copy.turnOffAllBody}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button busy={busy} onClick={() => void turnOff()}>
            {copy.turnOffAllConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <AppsToChange apps={apps} />
        <p className="m-0 text-body-sm text-ink-muted">{copy.turnOffAllNotice}</p>
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}

function PublicApps({ apps }: { apps: PublicAppRow[] }) {
  const desktop = useIsDesktop();
  const { openSettings } = useAppOverlay();
  const makePrivate = useMakePrivate();
  const [turningOff, setTurningOff] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <List label={copy.publicApps}>
        {apps.length === 0 ? (
          <ListRow title={copy.noPublicApps} />
        ) : (
          apps.map((a) => {
            const buttons = (
              <span className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`${copy.visits}: ${a.name}`}
                  onClick={() => openSettings(a.appId, { view: 'visits' })}
                >
                  {copy.visits}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`${copy.makePrivate}: ${a.name}`}
                  onClick={() => void makePrivate({ appId: a.appId, name: a.name, address: a.address })}
                >
                  {copy.makePrivate}
                </Button>
              </span>
            );
            return (
              <ListRow
                key={a.appId}
                leading={<AppTile name={a.name} icon={a.icon} />}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {a.name}
                    <PublicBadge />
                  </span>
                }
                subtitle={
                  <span className="flex flex-col gap-0.5">
                    <span className="font-mono text-ink">{a.address}</span>
                    <span>
                      {copy.accessLine(a.access, a.name)} · {copy.sinceBy(a.since, a.by)}
                    </span>
                  </span>
                }
                trailing={desktop ? buttons : undefined}
                below={desktop ? undefined : buttons}
              />
            );
          })
        )}
      </List>
      {apps.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" className="text-danger" onClick={() => setTurningOff(true)}>
            <Ban aria-hidden {...iconDefaults} className="size-4" />
            {copy.turnOffAll}
          </Button>
          <span className="text-body-sm text-ink-muted">{copy.turnOffAllHint}</span>
        </div>
      ) : null}
      {turningOff ? <TurnOffAllDialog apps={apps} onClose={() => setTurningOff(false)} /> : null}
    </div>
  );
}

/** The whole group, under Remote access. */
export function PublicAccess() {
  const status = usePublicStatus();
  usePublicRefresh();
  const [settingUp, setSettingUp] = useState(false);
  if (status.isError) {
    return (
      <List label={copy.publicAccess} hint={copy.publicAccessHint}>
        <ListRow
          title={copy.loadFailed}
          trailing={
            <Button variant="secondary" size="sm" onClick={() => void status.refetch()}>
              {copy.tryAgain}
            </Button>
          }
        />
      </List>
    );
  }
  if (!status.data) return null;
  const { cloudflare, apps } = status.data;
  return (
    <>
      <List label={copy.publicAccess} hint={copy.publicAccessHint}>
        <CloudflareRow cf={cloudflare} apps={apps} onSetUp={() => setSettingUp(true)} />
      </List>
      <PublicApps apps={apps} />
      {settingUp ? <PublicSetupDialog status={cloudflare} onClose={() => setSettingUp(false)} /> : null}
    </>
  );
}
