// An install's page (US-STORE-12…14): the app, "Installing… 42%" with the time left, and the steps as they happen.
// A failed install says which step failed, why in plain words and what to do (US-STORE-13): a different port, try
// again, back to the store, the engine settings; "Remove partial install" always. It reloads its state from
// apps.get and jobs.get, follows events live, and polls every 2 s as well in case the event stream drops.
import type { AppDetail, InstallStep, InstallStepDetail } from '@hlabs/api';

import { CheckCircle2, ChevronLeft, Circle, Loader2, XCircle, iconDefaults } from '@hlabs/icons';
import { Badge, Button, GlassCard, ModalDialog, Progress, ScrollPane, TextField, tokens } from '@hlabs/ui';
import { INSTALL_STEPS } from '@hlabs/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useRef, useState } from 'react';
import { installCopy } from '../copy/install';
import { categoryLabels, storeCopy } from '../copy/store';
import { browser } from '../lib/browser';
import { confirm } from '../lib/confirm';
import { errorCode, pageQuery } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { gb } from './app-access';
import { useAppDetails } from './app-details';
import { StoreLogo } from './cards';
import { storeTags } from './store-app';
import { storeReturnHref } from './store-return';
import { useInstalls } from './use-installs';

const copy = installCopy;
const LOGO = tokens.SIZE_APP_ICON + tokens.SPACE_7;

interface Live {
  progress: number;
  step: InstallStep | null;
  detail: InstallStepDetail;
  eta: number | null;
}

/** The job's message is `{ step, detail }` as JSON (05 · US-STORE-12). */
export function readJobMessage(message: string | null): { step: InstallStep | null; detail: InstallStepDetail } {
  try {
    const parsed = JSON.parse(message ?? '') as { step?: InstallStep; detail?: InstallStepDetail };
    return { step: parsed.step ?? null, detail: parsed.detail ?? {} };
  } catch {
    return { step: null, detail: {} };
  }
}

/** "About 2 minutes left", "Less than a minute left", or nothing yet. */
export function etaLine(eta: number | null): string | null {
  if (eta === null) return null;
  return eta < 60 ? copy.underAMinute : copy.minutesLeft(Math.ceil(eta / 60));
}

export type StepState = 'done' | 'active' | 'todo' | 'failed';

/** Each step's state: before the current one done, the current one active (or failed), the rest to do. */
export function stepStates(
  app: Pick<AppDetail, 'state' | 'stateDetail'>,
  current: InstallStep | null,
): Record<InstallStep, StepState> {
  const failedAt =
    app.state === 'install_failed' ? ((app.stateDetail?.step as InstallStep | undefined) ?? current) : null;
  const at = INSTALL_STEPS.indexOf(failedAt ?? current ?? 'check');
  const running = app.state === 'running' || app.state === 'starting';
  return Object.fromEntries(
    INSTALL_STEPS.map((s, i) => {
      if (running) return [s, 'done'];
      if (failedAt && i === at) return [s, 'failed'];
      if (i < at) return [s, 'done'];
      if (i === at && !failedAt) return [s, 'active'];
      return [s, 'todo'];
    }),
  ) as Record<InstallStep, StepState>;
}

/** What went wrong, in plain words (US-STORE-13); never the raw message. */
export function failureReason(detail: Record<string, unknown> | null, appName: string, os: 'macos' | 'linux'): string {
  const code = detail?.code;
  const r = copy.reason;
  switch (code) {
    case 'APP_PORT_IN_USE':
      return r.APP_PORT_IN_USE(String(detail?.port ?? ''));
    case 'APP_NO_PLATFORM':
      return r.APP_NO_PLATFORM[os];
    case 'APP_DISK_FULL':
      return r.APP_DISK_FULL(gb(Number(detail?.neededBytes ?? 0)));
    case 'APP_NETWORK_UNREACHABLE':
      return r.APP_NETWORK_UNREACHABLE;
    case 'APP_HEALTH_TIMEOUT':
      return detail?.exitCode !== undefined && detail?.seconds === undefined
        ? r.crashed(appName)
        : r.APP_HEALTH_TIMEOUT(appName, String(detail?.seconds ?? 120));
    case 'ENGINE_UNAVAILABLE':
      return r.ENGINE_UNAVAILABLE;
    default:
      return detail?.reason === 'restarted' ? r.restarted : r.other;
  }
}

function StepIcon({ state }: { state: StepState }) {
  const cls = 'size-5 shrink-0';
  if (state === 'done') return <CheckCircle2 aria-hidden {...iconDefaults} className={`${cls} text-success`} />;
  if (state === 'failed') return <XCircle aria-hidden {...iconDefaults} className={`${cls} text-danger`} />;
  if (state === 'active')
    return (
      <Loader2
        aria-hidden
        {...iconDefaults}
        className={`${cls} animate-spin text-warning motion-reduce:animate-none`}
      />
    );
  return <Circle aria-hidden {...iconDefaults} className={`${cls} text-ink-muted`} />;
}

function PortDialog({
  app,
  open,
  onOpenChange,
}: {
  app: AppDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [port, setPort] = useState(String(app.nextFreePort ?? ''));
  const [error, setError] = useState<string | null>(null);
  const retry = useRetry(
    app.id,
    () => onOpenChange(false),
    (err) => setError(errorCode(err) === 'APP_PORT_IN_USE' ? copy.portTaken : copy.couldNotStart),
  );
  const n = Number(port);
  const inRange = Number.isInteger(n) && n >= 12000 && n <= 12999;
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.portTitle}
      description={copy.portBody}
      actions={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {copy.cancel}
          </Button>
          <Button disabled={!inRange} busy={retry.isPending} onClick={() => retry.mutate({ web: n })}>
            {copy.retry}
          </Button>
        </>
      }
    >
      <TextField
        label={copy.portLabel}
        inputMode="numeric"
        value={port}
        onChange={(e) => {
          setPort(e.target.value.replace(/\D/g, ''));
          setError(null);
        }}
        error={!inRange && port ? copy.portRange : (error ?? undefined)}
      />
    </ModalDialog>
  );
}

function useRetry(appId: string, onDone: () => void, onError?: (err: unknown) => void) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (portOverrides?: { web: number }) => client.apps.retryInstall.mutate({ appId, portOverrides }),
    meta: onError ? { inlineErrors: true } : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId }) });
      onDone();
    },
    onError,
  });
}

export function InstallProgressPage({ appId }: { appId: string }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const details = useAppDetails(appId);
  const app = useQuery({ ...trpc.apps.get.queryOptions({ appId }), retry: false, ...pageQuery, refetchInterval: 2000 });
  const jobId = app.data?.installJobId ?? null;
  const job = useQuery({
    ...trpc.jobs.get.queryOptions({ jobId: jobId ?? '' }),
    enabled: jobId !== null,
    retry: false,
    refetchInterval: (q) =>
      q.state.data && ['succeeded', 'failed', 'cancelled'].includes(q.state.data.state) ? false : 2000,
  });
  const installs = useInstalls();
  const [live, setLive] = useState<Live | null>(null);
  const [seen, setSeen] = useState<Partial<Record<InstallStep, InstallStepDetail>>>({});
  const [portOpen, setPortOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const lastDone = useRef<InstallStep | null>(null);

  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['app.installProgress', 'app.stateChanged', 'job.finished'] },
      {
        onData: ({ data: event }) => {
          if (event.type === 'app.installProgress' && event.data.appId === appId) {
            const { step: at, stepDetail } = event.data;
            if (at && stepDetail) setSeen((m) => ({ ...m, [at]: { ...m[at], ...stepDetail } }));
            setLive((l) => ({
              progress: Math.max(l?.progress ?? 0, event.data.progress),
              step: event.data.step ?? l?.step ?? null,
              detail: event.data.stepDetail ?? {},
              eta: event.data.etaSeconds ?? null,
            }));
          } else if (event.type !== 'app.installProgress') {
            void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId }) });
            if (jobId) void queryClient.invalidateQueries({ queryKey: trpc.jobs.get.queryKey({ jobId }) });
          }
        },
      },
    ),
  );

  const fromJob = readJobMessage(job.data?.message ?? null);
  const progress = Math.max(live?.progress ?? 0, job.data?.progress ?? 0);
  const step = live?.step ?? fromJob.step;
  const stepDetail = live?.step === step ? live.detail : fromJob.detail;
  const a = app.data;
  const states = a ? stepStates(a, step) : null;

  // A polite announcement when a step completes (not every percent).
  useEffect(() => {
    if (!states) return;
    const done = [...INSTALL_STEPS].reverse().find((s) => states[s] === 'done') ?? null;
    if (done && done !== lastDone.current) {
      lastDone.current = done;
      const label = copy.step[done].done;
      setAnnounce(copy.stepDone(typeof label === 'function' ? label(a!.address) : label));
    }
  }, [states, a]);

  useEffect(() => {
    if (details.data) document.title = copy.docTitle(details.data.app.name);
  }, [details.data]);

  if (!details.data || !a || !states) return null;
  const d = details.data;
  const name = d.app.name;
  const failed = a.state === 'install_failed';
  const ready = a.state === 'running';
  const queued = job.data?.state === 'queued';
  const detail = a.stateDetail;
  const code = typeof detail?.code === 'string' ? detail.code : null;

  const remove = () =>
    void confirm({
      title: copy.removeTitle(name),
      body: copy.removeBody,
      confirmLabel: copy.remove,
      tone: 'danger',
      onConfirm: async () => {
        const { jobId: removal } = await client.apps.uninstall.mutate({ appId, keepData: false });
        // Wait for the removal, which may queue behind another app's job (D-082), then back to the app's page in the
        // store (it reads "Install" again).
        for (;;) {
          const j = await client.jobs.get.query({ jobId: removal });
          if (j.state === 'succeeded') break;
          if (j.state === 'failed' || j.state === 'cancelled') throw new Error('removal failed');
          await new Promise((r) => setTimeout(r, 500));
        }
        await queryClient.invalidateQueries();
        showToast({ tone: 'success', title: copy.removed(name) });
        void navigate({ to: '/store/app/$appId', params: { appId } });
      },
    });

  return (
    <RetryHost appId={appId}>
      {(retry) => {
        const fixes = failed ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {code === 'APP_PORT_IN_USE' ? (
              <Button size="sm" onClick={() => setPortOpen(true)}>
                {copy.useDifferentPort}
              </Button>
            ) : null}
            {code === 'APP_NO_PLATFORM' ? (
              <Link to="/store" className="hl-btn hl-btn-primary hl-btn-sm hl-focus no-underline">
                {copy.backToStore}
              </Link>
            ) : null}
            {code === 'ENGINE_UNAVAILABLE' ? (
              <Link
                to="/settings/$section"
                params={{ section: 'engine' }}
                className="hl-btn hl-btn-primary hl-btn-sm hl-focus no-underline"
              >
                {copy.openEngine}
              </Link>
            ) : null}
            {code !== 'APP_PORT_IN_USE' && code !== 'APP_NO_PLATFORM' && code !== 'ENGINE_UNAVAILABLE' ? (
              <Button size="sm" busy={retry.isPending} onClick={() => retry.mutate(undefined)}>
                {copy.tryAgain}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" className="text-danger" onClick={remove}>
              {copy.removePartial}
            </Button>
          </div>
        ) : null;

        const back = (
          <Link
            to={storeReturnHref()}
            className="hl-focus inline-flex items-center gap-2.5 self-start rounded-xs text-body-sm text-ink-muted no-underline hover:text-ink"
          >
            <ChevronLeft aria-hidden {...iconDefaults} className="size-4" />
            {storeCopy.title}
          </Link>
        );
        const appHeader = (
          <header className="flex flex-col gap-5 md:flex-row md:items-center">
            <StoreLogo app={d.app} size={LOGO} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="m-0 text-display font-bold">{name}</h1>
              <p className="m-0 text-body text-ink">{d.app.tagline}</p>
              <div className="flex flex-wrap gap-1.5">
                {[categoryLabels[d.app.group], ...storeTags(d.app, d.host)].map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </div>
            <div className="flex w-full flex-col items-start gap-1.5 md:w-56 md:items-center">
              {ready ? (
                <>
                  <Button
                    size="lg"
                    onClick={() => {
                      const inst = installs.byId.get(appId);
                      if (inst) browser.open(inst.urls.local);
                    }}
                  >
                    {copy.open}
                  </Button>
                  <span className="text-body-sm text-ink-muted">{copy.ready(name)}</span>
                </>
              ) : failed ? (
                <>
                  <span className="flex min-h-12 w-full items-center justify-center gap-2 rounded-pill border border-danger bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] px-5 text-body font-bold text-danger">
                    <XCircle aria-hidden {...iconDefaults} className="size-4" />
                    {copy.failed}
                  </span>
                  <span className="text-body-sm text-ink-muted">{copy.nothingChanged}</span>
                </>
              ) : (
                <>
                  <div className="relative flex min-h-12 w-full items-center justify-center overflow-hidden rounded-pill bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-body font-bold text-ink">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-accent transition-[width] motion-reduce:transition-none"
                      style={{ width: `${queued ? 0 : progress}%` }}
                    />
                    <span className="relative">{queued ? copy.waiting : copy.installing(progress)}</span>
                  </div>
                  <span className="text-body-sm text-ink-muted">{queued ? '' : etaLine(live?.eta ?? null)}</span>
                </>
              )}
            </div>
          </header>
        );

        const steps = (
          <div className="flex flex-col gap-5">
            {desktop ? null : appHeader}
            <ol
              aria-label={copy.steps}
              className="m-0 max-w-3xl list-none overflow-hidden rounded-xl bg-surface-row p-0"
            >
              {INSTALL_STEPS.map((s) => {
                const st = states[s];
                const labels = copy.step[s];
                const label = st === 'done' ? labels.done : labels.todo;
                const text = typeof label === 'function' ? label(a.address) : label;
                const sd = { ...seen[s], ...(s === step ? stepDetail : {}) };
                const side =
                  st === 'failed'
                    ? copy.stepFailed
                    : s === 'check' &&
                        (st === 'done' || st === 'active') &&
                        (sd.arch ?? (st === 'done' ? (d.host.arm64 ? 'arm64' : 'amd64') : null))
                      ? copy.imagesFound(sd.arch ?? (d.host.arm64 ? 'arm64' : 'amd64'))
                      : s === 'pull' && sd.of
                        ? copy.nOfM(st === 'done' ? sd.of : (sd.done ?? 0), sd.of)
                        : '';
                return (
                  <li
                    key={s}
                    aria-current={st === 'active' ? 'step' : undefined}
                    className={`border-b border-hairline px-5 py-4 last:border-b-0 ${st === 'failed' ? 'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <StepIcon state={st} />
                      <span className={`flex-1 text-body ${st === 'todo' ? 'text-ink-muted' : 'text-ink'}`}>
                        {text}
                      </span>
                      <span className={`text-body-sm ${st === 'failed' ? 'text-danger' : 'text-ink-muted'}`}>
                        {side}
                      </span>
                    </div>
                    {s === 'pull' && st === 'active' ? (
                      <Progress
                        className="mt-3 min-w-0 pl-8"
                        value={Math.min(100, ((progress - 2) / 78) * 100)}
                        aria-label={text}
                      />
                    ) : null}
                    {st === 'failed' ? (
                      <div className="pl-8">
                        <p className="m-0 mt-2 text-body">{failureReason(detail, name, d.host.os)}</p>
                        {fixes}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {!failed && !ready ? <p className="m-0 text-body-sm text-ink-muted">{copy.canLeave(name)}</p> : null}
            <p className="sr-only" aria-live="polite">
              {announce}
            </p>
            <PortDialog app={a} open={portOpen} onOpenChange={setPortOpen} />
          </div>
        );

        return (
          <GlassCard level={2} className="mx-auto flex min-h-0 w-full max-w-window flex-1 flex-col overflow-hidden p-0">
            <ScrollPane
              className="flex-1"
              headerClassName="px-6 pt-6 pb-5 md:px-10 md:pt-8"
              scrollClassName="mr-2 mb-5"
              bodyClassName="pl-6 pr-2 pb-4 md:pl-10 md:pr-6"
              // As on AppDetails: the app stays put on desktop; on a phone it scrolls with the steps.
              header={
                desktop ? (
                  <div className="flex flex-col gap-6">
                    {back}
                    {appHeader}
                  </div>
                ) : (
                  back
                )
              }
            >
              {steps}
            </ScrollPane>
          </GlassCard>
        );
      }}
    </RetryHost>
  );
}

/** Gives the page one retry mutation (Try again) that refreshes it when accepted. */
function RetryHost({
  appId,
  children,
}: {
  appId: string;
  children: (retry: ReturnType<typeof useRetry>) => React.ReactNode;
}) {
  const retry = useRetry(appId, () => undefined);
  return <>{children(retry)}</>;
}
