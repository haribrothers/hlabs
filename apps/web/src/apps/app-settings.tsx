// App settings (US-APP-04…07): the app with its status and uptime, its sections, and Open, Restart, Stop or Start and
// Logs; Close goes back to where it was opened from. A window over the wallpaper, as the AppSettings screen draws it.
// Admins only: members get "You don't have access to this" (US-STATE-20).
import type { AppDetail, AppState } from '@hlabs/api';
import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import {
  AppLogo,
  appTileLook,
  ExternalLink,
  iconDefaults,
  Play,
  RotateCw,
  Square,
  TextAlignStart,
  X,
} from '@hlabs/icons';
import { Button, GlassCard, IconButton, SectionTabs, StatusDot } from '@hlabs/ui';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { appsCopy } from '../copy/apps';
import { browser } from '../lib/browser';
import { useNow } from '../lib/use-now';
import { AdminOnly } from './admin-only';
import { AppAccess } from './app-access';
import { AppBehaviour } from './app-behaviour';
import { AppStorage, AppVersion } from './app-storage';
import { statusDot } from './app-window';
import { appBaseUrl, useApp } from './use-app';
import { UninstallDialog } from './uninstall-dialog';
import { useAppCommands } from './use-app-commands';

const copy = appsCopy;
/** The settings header's logo (64px, as AppSettings draws it). */
const SETTINGS_LOGO = 64;
/** States a command ends in: Start, Stop and Restart wait for one (US-APP-04). */
const SETTLED = new Set<AppState>(['running', 'stopped', 'error']);

type Tab = keyof typeof copy.tabs;
/** The sections and the feature each needs; those not built yet are hidden (D-036). */
const TABS: Array<{ id: Tab; feature?: Feature }> = [
  { id: 'overview' },
  { id: 'configuration', feature: 'appConfig' },
  { id: 'permissions', feature: 'appPermissions' },
  { id: 'usage', feature: 'appUsage' },
];

/**
 * Back to where it was opened from (the app window or Home): a step back in history, or, when there's none to take,
 * the place recorded when it was opened (`state.from`), else Home.
 */
export function useGoBack() {
  const router = useRouter();
  const navigate = useNavigate();
  const from = useLocation({ select: (l) => l.state.from });
  return () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: from ?? '/' }));
}

export function AppSettings({ appId }: { appId: string }) {
  return (
    <AdminOnly>
      <AppSettingsView appId={appId} />
    </AdminOnly>
  );
}

function AppSettingsView({ appId }: { appId: string }) {
  const { data: app } = useApp(appId);
  const back = useGoBack();
  const [tab, setTab] = useState<Tab>('overview');
  const [uninstalling, setUninstalling] = useState(false);
  useEffect(() => {
    if (app) document.title = copy.docTitle(copy.settingsTitle(app.name));
  }, [app]);
  if (!app) return null;
  const look = appTileLook(app.name, app.icon, SETTINGS_LOGO);
  const tabs = TABS.filter((t) => !t.feature || isFeatureEnabled(t.feature)).map((t) => ({
    id: t.id,
    label: copy.tabs[t.id],
  }));
  return (
    <section
      aria-label={copy.appSettings}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-12"
    >
      <GlassCard level={2} className="flex w-full max-w-[600px] flex-col gap-6 p-7">
        <header className="flex items-center gap-4">
          <AppLogo
            decorative
            name={app.name}
            src={app.icon.logoUrl}
            colors={look.colors}
            fallbackIcon={look.fallbackIcon}
            size={SETTINGS_LOGO}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="m-0 truncate text-title-2 font-bold">{app.name}</h1>
            <span className="text-body-sm">
              <StatusDot status={statusDot(app.state)}>
                <StatusLine app={app} />
              </StatusDot>
            </span>
          </div>
          <IconButton label={copy.close} onClick={back} className="rounded-pill">
            <X aria-hidden {...iconDefaults} className="size-4" />
          </IconButton>
        </header>
        <SectionTabs aria-label={copy.sections} tabs={tabs} active={tab} onSelect={(id) => setTab(id as Tab)} />
        <div role="tabpanel" aria-label={copy.tabs[tab]} className="flex flex-col gap-6">
          <Actions app={app} />
          <AppAccess app={app} />
          <AppBehaviour app={app} />
          <AppStorage app={app} />
          <footer className="flex items-center justify-between gap-4">
            <AppVersion app={app} />
            <Button variant="link" className="text-danger" onClick={() => setUninstalling(true)}>
              {copy.uninstallEllipsis}
            </Button>
          </footer>
          <UninstallDialog app={app} open={uninstalling} onOpenChange={setUninstalling} />
        </div>
      </GlassCard>
    </section>
  );
}

/** "Running · up 6 days", from when its web container started; the state alone otherwise. */
function StatusLine({ app }: { app: AppDetail }) {
  const now = useNow();
  const label = copy.status[app.state];
  if (app.state !== 'running' || app.startedAt === null) return label;
  return `${label} · ${copy.upFor(now.getTime() - app.startedAt)}`;
}

/** Open, Restart, Stop (Start when stopped) and Logs (US-APP-04). */
function Actions({ app }: { app: AppDetail }) {
  const navigate = useNavigate();
  const { start, stop, restart, pending } = useAppCommands(app, app.id);
  // Until the command settles (app.stateChanged), all three wait; without the engine none can run (US-STATE-08).
  const waiting = pending || !SETTLED.has(app.state) || !app.engineRunning;
  const hint = app.engineRunning ? undefined : copy.engineFirst;
  const icon = 'size-4';
  return (
    <div className="flex flex-wrap gap-2.5">
      <Button onClick={() => browser.open(appBaseUrl(app))}>
        <ExternalLink aria-hidden {...iconDefaults} className={icon} />
        {copy.open}
      </Button>
      <Button variant="secondary" disabled={waiting} title={hint} onClick={() => restart.mutate()}>
        <RotateCw aria-hidden {...iconDefaults} className={icon} />
        {copy.restart}
      </Button>
      {app.state === 'stopped' ? (
        <Button variant="secondary" disabled={waiting} title={hint} onClick={() => start.mutate()}>
          <Play aria-hidden {...iconDefaults} className={icon} />
          {copy.start}
        </Button>
      ) : (
        <Button variant="secondary" disabled={waiting} title={hint} onClick={() => stop.mutate()}>
          <Square aria-hidden {...iconDefaults} className={icon} />
          {copy.stop}
        </Button>
      )}
      <Button variant="secondary" onClick={() => void navigate({ to: '/apps/$appId/logs', params: { appId: app.id } })}>
        <TextAlignStart aria-hidden {...iconDefaults} className={icon} />
        {copy.logs}
      </Button>
    </div>
  );
}
