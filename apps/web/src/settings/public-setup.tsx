// PublicSetup (US-SYS-43, D-171): what's needed first, that Cloudflare sees the traffic, then "Sign in to Cloudflare"
// (Cloudflare's page in a new tab; this dialog waits, then shows the setup job's steps) or "Use an API token
// instead" (domain and token, checked at once). What hlabs gets from Cloudflare goes to the keychain (07 §7.7).
import type { CloudflareStatus } from '@hlabs/api';
import { Check, Cloud, ExternalLink, Eye, Globe, LoaderCircle, iconDefaults } from '@hlabs/icons';
import { helpUrl } from '@hlabs/shared';
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { publicCopy as copy } from '../copy/public';
import { codeLine, errorCode, errorData, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { Callout } from '../public/callout';
import { JOB_POLL_MS } from '../public/jobs';
import { usePublicStatus } from '../public/status';

/** The help page's section on adding a domain to Cloudflare. */
export const ADD_DOMAIN_HELP = `${helpUrl('remote-access/make-an-app-public')}#add-your-domain-to-cloudflare`;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const STEPS = ['signedIn', 'tunnel', 'connector'] as const;

function Spinner() {
  return <LoaderCircle aria-hidden {...iconDefaults} size={18} className="text-ink-muted motion-safe:animate-spin" />;
}

function NewTabLink({ href, children, className }: { href: string; children: ReactNode; className: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only">{` ${copy.opensInNewTab}`}</span>
    </a>
  );
}

/** The setup job's steps, from its `job.progress` messages (`signedIn`, `tunnel`, `connector`). */
function SetupSteps({ cf, viaToken }: { cf: CloudflareStatus; viaToken: boolean }) {
  const trpc = useTRPC();
  const job = useQuery({
    ...trpc.jobs.get.queryOptions({ jobId: cf.jobId ?? '' }),
    enabled: Boolean(cf.jobId),
    retry: false,
    refetchInterval: JOB_POLL_MS,
  });
  const reached = STEPS.indexOf((job.data?.message ?? '') as (typeof STEPS)[number]);
  const token = cf.credential === 'token' || viaToken;
  const signedIn = cf.domain
    ? token
      ? copy.steps.tokenChecked(cf.domain)
      : copy.steps.signedIn(cf.domain)
    : copy.steps.signedInNoDomain;
  const rows: Array<{ done: boolean; working: boolean; label: ReactNode }> = [
    { done: reached >= 0, working: reached < 0, label: reached >= 0 ? signedIn : copy.steps.signingIn },
    {
      done: reached >= 1,
      working: reached === 0,
      label: reached >= 1 ? copy.steps.tunnelDone : copy.steps.tunnel,
    },
    { done: false, working: reached >= 1, label: copy.steps.connector },
  ];
  return (
    <ul
      role="status"
      aria-label={copy.settingUp}
      className="m-0 flex list-none flex-col overflow-hidden rounded-md bg-surface-row p-0"
    >
      {rows
        .filter((r) => r.done || r.working)
        .map((r, i) => (
          <li
            key={i}
            className="flex min-h-11 items-center gap-3 border-hairline px-4 py-2 text-body-sm not-first:border-t"
          >
            {r.done ? <Check aria-hidden {...iconDefaults} size={16} className="text-success" /> : <Spinner />}
            <span>{r.label}</span>
          </li>
        ))}
    </ul>
  );
}

export function PublicSetupDialog({ status: initial, onClose }: { status: CloudflareStatus; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const live = usePublicStatus();
  const cf = live.data?.cloudflare ?? initial;
  const [mode, setMode] = useState<'signIn' | 'token'>('signIn');
  const [domain, setDomain] = useState('');
  const [token, setToken] = useState('');
  const [fieldError, setFieldError] = useState<{ domain?: string; token?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const domainRef = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.public.status.queryKey() });

  // Set up: done here.
  const wasWorking = useRef(false);
  useEffect(() => {
    if (cf.state === 'signingIn' || cf.state === 'settingUp') wasWorking.current = true;
    if (cf.state === 'on' && wasWorking.current) {
      showToast({ tone: 'success', title: copy.setUpDone, body: copy.setUpDoneBody });
      onClose();
    }
  }, [cf.state, onClose]);
  useEffect(() => {
    if (mode === 'token') domainRef.current?.focus();
  }, [mode]);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    // A tab opened now, while the click still counts, so a popup blocker lets Cloudflare's page through.
    const tab = window.open('', '_blank');
    try {
      const { url } = await client.public.cloudflareSignIn.mutate();
      // Cloudflare's link; the pretend Cloudflare's under `pnpm dev` is a path on this dashboard's own address.
      if (tab) tab.location.href = new URL(url, window.location.href).toString();
      await refresh();
    } catch (err) {
      tab?.close();
      setError(errorLine(err));
    } finally {
      setBusy(false);
    }
  };

  const checkToken = async () => {
    const d = domain.trim().toLowerCase();
    const t = token.trim();
    const problems = {
      domain: DOMAIN.test(d) ? undefined : copy.domainInvalid,
      token: t.length >= 20 ? undefined : copy.tokenTooShort,
    };
    setFieldError(problems);
    setError(null);
    if (problems.domain || problems.token) return;
    setBusy(true);
    try {
      await client.public.setupCloudflare.mutate({ domain: d, token: t });
      wasWorking.current = true;
      setToken('');
      await refresh();
    } catch (err) {
      const step = errorData(err)?.detail?.step;
      if (errorCode(err) === 'CLOUDFLARE_FAILED' && step === 'token') setFieldError({ token: errorLine(err) });
      else if (errorCode(err) === 'CLOUDFLARE_FAILED' && step === 'zone') setFieldError({ domain: errorLine(err) });
      else setError(errorLine(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (cf.state === 'signingIn') void client.public.cancelSignIn.mutate().then(refresh, () => undefined);
    onClose();
  };

  const waiting = cf.state === 'signingIn';
  const working = cf.state === 'settingUp';
  // The last setup didn't finish: say why, and offer it again.
  const failed =
    cf.state === 'error' && cf.setUpAt === null && cf.reason
      ? codeLine('CLOUDFLARE_FAILED', { step: cf.reason })
      : null;
  const starting = !waiting && !working;
  const link = 'hl-focus rounded-xs font-semibold text-accent-link no-underline';

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : cancel())}
      width={580}
      title={
        <span className="flex items-center gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-md bg-surface-control">
            <Cloud {...iconDefaults} />
          </span>
          {copy.setupTitle}
        </span>
      }
      description={copy.setupIntro}
      actions={
        <>
          {starting ? (
            <Button
              variant="link"
              className="mr-auto"
              onClick={() => {
                setError(null);
                setFieldError({});
                setMode(mode === 'signIn' ? 'token' : 'signIn');
              }}
            >
              {mode === 'signIn' ? copy.useToken : copy.useSignIn}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={cancel}>
            {copy.cancel}
          </Button>
          {starting && mode === 'signIn' ? (
            <Button busy={busy} onClick={() => void signIn()}>
              {copy.signIn}
              <ExternalLink aria-hidden {...iconDefaults} className="size-4" />
            </Button>
          ) : null}
          {starting && mode === 'token' ? (
            <Button busy={busy} onClick={() => void checkToken()}>
              {copy.checkAndSetUp}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section aria-label={copy.needFirst} className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold text-ink-muted">{copy.needFirst}</span>
          <div className="flex items-start gap-3 rounded-md bg-surface-row px-4 py-3">
            <Globe aria-hidden {...iconDefaults} size={18} className="mt-0.5 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-semibold">{copy.needDomain}</span>
              <span className="text-caption text-ink-muted">
                {copy.needDomainHint}{' '}
                <NewTabLink href={ADD_DOMAIN_HELP} className={link}>
                  {copy.howToAddDomain}
                </NewTabLink>
              </span>
            </span>
          </div>
        </section>
        <Callout icon={<Eye aria-hidden {...iconDefaults} size={18} className="text-accent-link" />}>
          <p className="m-0">
            <strong>{copy.seesTrafficTitle}</strong> {copy.seesTrafficBody}
          </p>
        </Callout>
        {starting && mode === 'token' ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void checkToken();
            }}
          >
            <TextField
              ref={domainRef}
              label={copy.domain}
              placeholder={copy.domainPlaceholder}
              className="font-mono"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={domain}
              error={fieldError.domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <TextField
              label={copy.apiToken}
              type="password"
              autoComplete="off"
              value={token}
              error={fieldError.token}
              hint={
                <span className="flex flex-col gap-2">
                  <span>{copy.tokenHint}</span>
                  <span className="flex flex-wrap gap-2">
                    {copy.tokenPermissions.map((p) => (
                      <code key={p} className="rounded-pill bg-surface-control px-2.5 py-1 font-mono text-caption">
                        {p}
                      </code>
                    ))}
                  </span>
                </span>
              }
              onChange={(e) => setToken(e.target.value)}
            />
            {/* Enter submits. */}
            <button type="submit" hidden />
          </form>
        ) : null}
        {waiting ? (
          <div role="status" className="flex items-start gap-3 rounded-md bg-surface-row px-4 py-3">
            <Spinner />
            <span className="flex flex-col gap-2">
              <span className="text-body font-semibold">{copy.waitingTitle}</span>
              <span className="text-caption text-ink-muted">{copy.waitingHint}</span>
              {cf.signInUrl ? (
                <span>
                  <NewTabLink href={cf.signInUrl} className="hl-btn hl-btn-secondary hl-btn-sm hl-focus no-underline">
                    {copy.openAgain}
                    <ExternalLink aria-hidden {...iconDefaults} className="size-4" />
                  </NewTabLink>
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
        {working ? <SetupSteps cf={cf} viaToken={mode === 'token'} /> : null}
        {(error ?? (starting ? failed : null)) ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error ?? failed}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
