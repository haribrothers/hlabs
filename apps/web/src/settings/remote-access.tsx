// Remote access with Tailscale (US-SYS-02, used by US-ONB-17): the connect flow and the Tailscale row. The log-in
// page opens in a new tab and the status is asked every 2 s until Tailscale runs (hlabs then publishes); a tailnet
// it didn't log in to is confirmed first (D-102); a port 443 that's served already can move to 8443 (D-103).
import type { RemoteStatus } from '@hlabs/api';
import { Globe, iconDefaults } from '@hlabs/icons';
import { helpUrl } from '@hlabs/shared';
import { Button, ListRow, ModalDialog, StatusDot } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { networkCopy as copy } from '../copy/network';
import { errorCode, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useNow } from '../lib/use-now';

/** How often to ask while waiting for the person to log in to Tailscale. */
export const LOGIN_POLL_MS = 2_000;
/** Warn when this computer's Tailscale key expires within this long. */
const KEY_WARNING_MS = 14 * 86_400_000;
const ADMIN_CONSOLE = 'https://login.tailscale.com/admin/dns';

/** The official installer for this computer's system (Tailscale isn't bundled, 02 §2.2). */
export function tailscaleDownload(platform = navigator.platform): string {
  return /mac/i.test(platform) ? 'https://tailscale.com/download/mac' : 'https://tailscale.com/download/linux';
}

export function useRemoteStatus() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.network.status.queryOptions(),
    retry: false,
    refetchInterval: (q) => (q.state.data?.remote.state === 'waiting' ? LOGIN_POLL_MS : false),
  });
}

type Problem = 'permission' | 'https' | 'conflict' | null;

/** Connect, with the dialogs and problems it can lead to. */
export function useRemoteConnect() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<{ tailnet: string; nodeName: string } | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.network.status.queryKey() });

  const connect = useMutation({
    mutationFn: async (input: { confirmTailnet?: boolean; dashboardPort?: 443 | 8443 }) => {
      // A tab opened now, while the click still counts, so a popup blocker lets the log-in page through.
      const tab = input.confirmTailnet ? null : window.open('', '_blank');
      try {
        const result = await client.network.remote.connect.mutate(input);
        if (result.state === 'needs_login' && result.loginUrl && tab) tab.location.href = result.loginUrl;
        else tab?.close();
        return result;
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
    meta: { inlineErrors: true },
    onSuccess: async (result) => {
      setProblem(null);
      if (result.state === 'confirm') setConfirm({ tailnet: result.tailnet, nodeName: result.nodeName });
      if (result.state === 'connected') {
        setConfirm(null);
        showToast({ tone: 'success', title: copy.remoteOn });
      }
      await refresh();
    },
    onError: (err) => {
      const code = errorCode(err);
      if (code === 'TAILSCALE_PERMISSION_DENIED') setProblem('permission');
      else if (code === 'TAILSCALE_HTTPS_DISABLED') setProblem('https');
      else if (code === 'TAILSCALE_SERVE_CONFLICT') setProblem('conflict');
      else showToast({ tone: 'danger', title: copy.connectFailed, body: errorLine(err) });
    },
  });

  const dialogs = (
    <>
      <ModalDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirm ? copy.confirmTitle(confirm.tailnet) : ''}
        description={confirm ? copy.confirmBody(`https://${confirm.nodeName}.${confirm.tailnet}`) : ''}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {copy.cancel}
            </Button>
            <Button busy={connect.isPending} onClick={() => connect.mutate({ confirmTailnet: true })}>
              {copy.connect}
            </Button>
          </>
        }
      />
      <ModalDialog
        open={problem === 'conflict'}
        onOpenChange={(open) => (open ? null : setProblem(null))}
        title={copy.conflictTitle}
        description={copy.conflictBody}
        actions={
          <>
            <Button variant="secondary" onClick={() => setProblem(null)}>
              {copy.cancel}
            </Button>
            <Button
              busy={connect.isPending}
              onClick={() => connect.mutate({ confirmTailnet: true, dashboardPort: 8443 })}
            >
              {copy.use8443}
            </Button>
          </>
        }
      />
    </>
  );
  return { connect, problem, dialogs };
}

function TailscaleIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-control text-ink">
      <Globe aria-hidden {...iconDefaults} size={18} />
    </span>
  );
}

function Problems({ problem, onRetry }: { problem: Problem; onRetry: () => void }) {
  if (problem === 'permission') {
    const copyCommand = () =>
      navigator.clipboard.writeText(copy.operatorCommand).then(
        () => showToast({ tone: 'success', title: copy.commandCopied }),
        () => undefined,
      );
    return (
      <div role="alert" className="flex flex-col gap-2 text-body-sm">
        <span className="font-semibold text-ink">{copy.needsPermission}</span>
        <span className="text-ink-muted">{copy.runOnce}</span>
        <span className="flex flex-wrap items-center gap-2">
          <code className="rounded-sm bg-surface-input px-2 py-1 font-mono text-mono">{copy.operatorCommand}</code>
          <Button variant="secondary" size="sm" onClick={() => void copyCommand()}>
            {copy.copyCommand}
          </Button>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {copy.tryAgain}
          </Button>
        </span>
      </div>
    );
  }
  if (problem === 'https') {
    return (
      <p role="alert" className="m-0 flex flex-wrap items-center gap-2 text-body-sm">
        <span>{copy.httpsOff}</span>
        <a
          href={ADMIN_CONSOLE}
          target="_blank"
          rel="noopener noreferrer"
          className="hl-focus rounded-xs font-semibold text-accent-link no-underline"
        >
          {copy.openAdminConsole}
        </a>
      </p>
    );
  }
  return null;
}

const dateOf = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

/** The Tailscale row, whatever state remote access is in. */
export function TailscaleRow({ remote }: { remote: RemoteStatus }) {
  const now = useNow().getTime();
  const { connect, problem, dialogs } = useRemoteConnect();
  const connectButton = (
    <Button variant="secondary" size="sm" busy={connect.isPending} onClick={() => connect.mutate({})}>
      {copy.connect}
    </Button>
  );
  let subtitle: ReactNode = copy.notConnectedHint;
  let trailing: ReactNode = connectButton;
  switch (remote.state) {
    case 'not_installed':
      subtitle = copy.notInstalled;
      trailing = (
        <a
          href={tailscaleDownload()}
          target="_blank"
          rel="noopener noreferrer"
          className="hl-btn hl-btn-secondary hl-btn-sm hl-focus no-underline"
        >
          {copy.getTailscale}
        </a>
      );
      break;
    case 'stopped':
      subtitle = `${copy.notRunning}. ${copy.notRunningHint}`;
      trailing = connectButton;
      break;
    case 'waiting':
      subtitle = remote.loginUrl ? (
        <a
          href={remote.loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hl-focus rounded-xs text-accent-link no-underline"
        >
          {copy.openLogin}
        </a>
      ) : (
        copy.notConnectedHint
      );
      trailing = <StatusDot status="working">{copy.waiting}</StatusDot>;
      break;
    case 'timed_out':
      subtitle = copy.timedOut;
      break;
    case 'logged_out':
      subtitle = copy.loggedOut;
      break;
    case 'https_disabled':
      subtitle = copy.httpsOff;
      break;
    case 'connected':
      subtitle = <span className="font-mono">{remote.url?.replace(/^https:\/\//, '')}</span>;
      trailing = <StatusDot status="running">{copy.connected}</StatusDot>;
      break;
  }
  const expiring = remote.state === 'connected' && remote.keyExpiry !== null && remote.keyExpiry - now < KEY_WARNING_MS;
  return (
    <>
      <ListRow
        leading={<TailscaleIcon />}
        title={<span className="font-semibold">{copy.tailscale}</span>}
        subtitle={subtitle}
        trailing={trailing}
        below={
          problem && problem !== 'conflict' ? (
            <Problems problem={problem} onRetry={() => connect.mutate({})} />
          ) : expiring ? (
            <p role="status" className="m-0 text-body-sm text-warning">
              {copy.keyExpires(dateOf(remote.keyExpiry!))}
            </p>
          ) : undefined
        }
      />
      {remote.state === 'connected' ? (
        <ListRow
          title={copy.family}
          trailing={
            <a
              href={helpUrl('remote-access/family')}
              target="_blank"
              rel="noopener noreferrer"
              className="hl-focus rounded-xs text-body-sm font-semibold text-accent-link no-underline"
            >
              {copy.openHelp}
            </a>
          }
        />
      ) : null}
      {dialogs}
    </>
  );
}
