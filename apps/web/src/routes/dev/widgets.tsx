// Development-only gallery of Home's widgets in each state, from made-up data (no daemon), on the Home wallpaper: for
// comparing them with the designs (HomeStates, HomeEdit, WidgetPicker) and reworking their looks. Not reachable in
// production builds.
import type { AppRouter } from '@hlabs/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createTRPCClient, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { useState, type ReactNode } from 'react';
import { wallpaperClass } from '../../lib/appearance';
import { TRPCProvider } from '../../lib/trpc';
import { MyFilesWidget, SharedAppsWidget } from '../../home/member-widgets';
import { AppWidget, AppStatusWidget, BackupsWidget, RemoteAccessWidget, UpdatesWidget } from '../../home/more-widgets';
import { LiveUsageWidget } from '../../home/live-usage-widget';
import { StorageWidget } from '../../home/storage-widget';

export const Route = createFileRoute('/dev/widgets')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DevWidgets,
});

type Answers = Record<string, unknown>;

const GB = 1024 ** 3;
const NOW = Date.now();
const icon = (gradient: [string, string]) => ({ logoUrl: null, gradient, fallback: null });

const BASE: Answers = {
  'auth.me': { id: 'u', username: 'hari', displayName: 'Hari', role: 'admin', appearance: null },
  'usage.current': {
    ts: NOW,
    host: { cpu: 18, memBytes: 9.4 * GB, memTotalBytes: 16 * GB, netRxBps: 0, netTxBps: 0 },
    apps: [],
  },
  'storage.summary': { totalBytes: 256e9, freeBytes: 142e9, appsBytes: 77e9, systemBytes: 37e9 },
  'network.status': {
    remote: { state: 'connected', url: 'https://hlabs.tail1234.ts.net', tailnet: 'hlabs.tailnet', devicesOnline: 5 },
    dns: { kind: 'pihole' },
  },
  'backups.overview': {
    destinations: [{ id: 'nas', name: 'NAS' }],
    lastRun: { status: 'succeeded' },
    lastSuccessAt: NOW - 2 * 3600_000,
    included: { apps: 11, folders: 2 },
    running: null,
    chart: [60, 75, 55, 90, 65, 80, 100].map((b, i) => ({
      id: `r${i}`,
      startedAt: NOW - (7 - i) * 86_400_000,
      status: 'succeeded',
      bytesAdded: b,
    })),
  },
  'apps.list': {
    apps: [
      {
        id: 'immich',
        name: 'Immich',
        state: 'running',
        icon: icon(['#fb923c', '#ea580c']),
        embed: false,
        urls: { local: '', tailnet: null },
      },
      {
        id: 'jellyfin',
        name: 'Jellyfin',
        state: 'running',
        icon: icon(['#a855f7', '#6d28d9']),
        embed: false,
        urls: { local: '', tailnet: null },
      },
      {
        id: 'paperless-ngx',
        name: 'Paperless-ngx',
        state: 'running',
        icon: icon(['#22c55e', '#15803d']),
        embed: false,
        urls: { local: '', tailnet: null },
      },
    ],
  },
  'home.listWidgets': {
    system: [],
    apps: [
      {
        id: 'app:immich:library',
        appId: 'immich',
        appName: 'Immich',
        name: 'Photo library',
        template: 'twoStat',
        needsKey: true,
        hasKey: true,
      },
      {
        id: 'app:jellyfin:library',
        appId: 'jellyfin',
        appName: 'Jellyfin',
        name: 'Library',
        template: 'twoStat',
        needsKey: true,
        hasKey: true,
      },
      {
        id: 'app:paperless-ngx:inbox',
        appId: 'paperless-ngx',
        appName: 'Paperless-ngx',
        name: 'Documents',
        template: 'stat',
        needsKey: true,
        hasKey: true,
      },
    ],
  },
};

const ok = (data: unknown) => ({ status: 'ok', data, updatedAt: NOW });
const named = (id: string, name: string, gradient: [string, string]) => ({ id, name, icon: icon(gradient) });
const WIDGET_DATA: Answers = {
  'app-status': ok({
    running: 11,
    stopped: 1,
    attention: 0,
    notRunning: [{ ...named('nextcloud', 'Nextcloud', ['#38bdf8', '#0369a1']), state: 'stopped' }],
  }),
  updates: ok({
    count: 2,
    apps: [
      named('home-assistant', 'Home Assistant', ['#2dd4bf', '#0f766e']),
      named('immich', 'Immich', ['#fb923c', '#c2410c']),
    ],
  }),
  'my-files': ok({ bytes: 48.2e9, lastPhotoBackupAt: NOW - 3600_000 }),
  'shared-apps': ok({
    total: 4,
    running: 4,
    adminName: 'Hari',
    canInstall: false,
    apps: [
      named('jellyfin', 'Jellyfin', ['#a855f7', '#6d28d9']),
      named('immich', 'Immich', ['#fb923c', '#c2410c']),
      named('paperless', 'Paperless', ['#22c55e', '#15803d']),
      named('nextcloud', 'Nextcloud', ['#38bdf8', '#0369a1']),
    ],
  }),
  'app:immich:library': ok({
    template: 'twoStat',
    first: { value: 12804, label: 'photos' },
    second: { value: 873, label: 'videos' },
  }),
  'app:jellyfin:library': ok({
    template: 'twoStat',
    first: { value: 312, label: 'movies' },
    second: { value: 48, label: 'shows' },
  }),
  'app:paperless-ngx:inbox': ok({ template: 'stat', value: { value: 1240, label: 'documents' } }),
};

/** A tRPC client answered from `answers`; the event stream stays open and quiet. */
function fakeClient(answers: Answers) {
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        if (op.path === 'events.stream') return () => {};
        if (op.path === 'home.getWidgetData') {
          const ids = (op.input as { widgetIds: string[] }).widgetIds;
          const all = { ...WIDGET_DATA, ...(answers['home.getWidgetData'] as Answers | undefined) };
          observer.next({ result: { type: 'data', data: Object.fromEntries(ids.map((id) => [id, all[id]])) } });
          observer.complete();
          return () => {};
        }
        const answer = op.path in answers ? answers[op.path] : BASE[op.path];
        if (answer instanceof Error) observer.error(answer as never);
        else if (answer === PENDING) return () => {};
        else {
          observer.next({ result: { type: 'data', data: answer } });
          observer.complete();
        }
        return () => {};
      });
  return createTRPCClient<AppRouter>({ links: [link] });
}

const PENDING = Symbol('pending');

/** One widget with its own made-up daemon. */
function Fake({ answers = {}, children }: { answers?: Answers; children: ReactNode }) {
  const [client] = useState(() => fakeClient(answers));
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-body-sm font-semibold uppercase tracking-widest text-ink-muted">{title}</h2>
      <div className="grid w-full grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">{children}</div>
    </section>
  );
}

const widget = (data: unknown) => ({ 'home.getWidgetData': data });

function DevWidgets() {
  return (
    <div className={`${wallpaperClass(undefined)} min-h-dvh`}>
      <div className="mx-auto flex max-w-window flex-col gap-10 py-10 md:px-6">
        <Row title="Home (the design's row)">
          <Fake>
            <LiveUsageWidget />
          </Fake>
          <Fake>
            <StorageWidget />
          </Fake>
          <Fake>
            <RemoteAccessWidget />
          </Fake>
          <Fake>
            <BackupsWidget />
          </Fake>
        </Row>
        <Row title="From the picker">
          <Fake>
            <AppStatusWidget />
          </Fake>
          <Fake>
            <UpdatesWidget />
          </Fake>
          <Fake>
            <MyFilesWidget shippedPhase={7} />
          </Fake>
          <Fake>
            <SharedAppsWidget />
          </Fake>
        </Row>
        <Row title="App widgets">
          <Fake>
            <AppWidget id="app:immich:library" />
          </Fake>
          <Fake>
            <AppWidget id="app:jellyfin:library" />
          </Fake>
          <Fake>
            <AppWidget id="app:paperless-ngx:inbox" />
          </Fake>
          <Fake
            answers={widget({
              'app:paperless-ngx:inbox': ok({
                template: 'list',
                rows: [
                  { title: 'Electricity bill', detail: '2 days ago' },
                  { title: 'Car insurance renewal', detail: 'last week' },
                  { title: 'Tax return 2025', detail: 'Nov 3' },
                ],
              }),
            })}
          >
            <AppWidget id="app:paperless-ngx:inbox" />
          </Fake>
        </Row>
        <Row title="Needs you">
          <Fake
            answers={{
              'network.status': {
                remote: { state: 'off', url: null, tailnet: null, devicesOnline: null },
                dns: { kind: 'none' },
              },
            }}
          >
            <RemoteAccessWidget />
          </Fake>
          <Fake
            answers={{
              'backups.overview': {
                destinations: [],
                lastRun: null,
                lastSuccessAt: null,
                included: { apps: 0 },
                running: null,
                chart: [],
              },
            }}
          >
            <BackupsWidget />
          </Fake>
          <Fake
            answers={{
              'backups.overview': {
                destinations: [{ id: 'nas', name: 'NAS' }],
                lastRun: { status: 'failed', error: 'BACKUP_DEST_UNREACHABLE', destinationName: 'NAS' },
                lastSuccessAt: NOW - 3 * 86_400_000,
                included: { apps: 11 },
                running: null,
                chart: [60, 75, 55, 90, 0, 0, 0].map((b, i) => ({
                  id: `r${i}`,
                  startedAt: NOW,
                  status: i > 3 ? 'failed' : 'succeeded',
                  bytesAdded: b,
                })),
              },
            }}
          >
            <BackupsWidget />
          </Fake>
          <Fake
            answers={widget({
              'app-status': ok({
                running: 10,
                stopped: 1,
                attention: 1,
                notRunning: [{ ...named('kuma', 'Uptime Kuma', ['#a3e635', '#4d7c0f']), state: 'error' }],
              }),
            })}
          >
            <AppStatusWidget />
          </Fake>
        </Row>
        <Row title="Other states">
          <Fake
            answers={{
              'backups.overview': {
                destinations: [{ id: 'nas', name: 'NAS' }],
                lastRun: { status: 'succeeded' },
                lastSuccessAt: NOW - 3600_000,
                included: { apps: 11 },
                running: { jobId: 'j', progress: 42, message: 'Immich → NAS' },
                chart: [],
              },
            }}
          >
            <BackupsWidget />
          </Fake>
          <Fake
            answers={{ 'storage.summary': { totalBytes: 256e9, freeBytes: 9e9, appsBytes: 190e9, systemBytes: 57e9 } }}
          >
            <StorageWidget />
          </Fake>
          <Fake answers={widget({ updates: ok({ count: 0, apps: [] }) })}>
            <UpdatesWidget />
          </Fake>
          <Fake answers={{ 'storage.summary': new Error('down') }}>
            <StorageWidget />
          </Fake>
        </Row>
        <Row title="App widget states">
          <Fake answers={widget({ 'app:immich:library': { status: 'app_not_running', updatedAt: NOW } })}>
            <AppWidget id="app:immich:library" />
          </Fake>
          <Fake
            answers={widget({
              'app:immich:library': {
                status: 'error',
                data: {
                  template: 'twoStat',
                  first: { value: 12804, label: 'photos' },
                  second: { value: 873, label: 'videos' },
                },
                updatedAt: NOW,
              },
            })}
          >
            <AppWidget id="app:immich:library" />
          </Fake>
          <Fake answers={widget({ 'app:immich:library': { status: 'needs_key', updatedAt: NOW } })}>
            <AppWidget id="app:immich:library" />
          </Fake>
          <Fake answers={{ 'storage.summary': PENDING }}>
            <StorageWidget />
          </Fake>
        </Row>
      </div>
    </div>
  );
}
