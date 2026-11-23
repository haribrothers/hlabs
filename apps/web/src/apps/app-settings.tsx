// App settings (US-APP-04…07): the app with its status and uptime, its sections, and Open, Restart, Stop or Start and
// Logs; Close goes back to where it was opened from. A window over the wallpaper, as the AppSettings screen draws it.
// Admins only: members get "You don't have access to this" (US-STATE-20).
import type { AppDetail, AppState } from '@hlabs/api';
import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import {
  AppLogo,
  appTileLook,
  CircleStop,
  ExternalLink,
  ScrollText,
  Wrench,
  iconDefaults,
  Play,
  RotateCw,
  Square,
  TextAlignStart,
  X,
} from '@hlabs/icons';
import {
  BottomSheet,
  Button,
  GlassCard,
  IconButton,
  InsetRowButton,
  ModalPanel,
  SectionTabs,
  SheetTitle,
  StatusDot,
  tokens,
  useIsPhone,
} from '@hlabs/ui';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { appsCopy } from '../copy/apps';
import { browser } from '../lib/browser';
import { useNow } from '../lib/use-now';
import { AdminOnly } from './admin-only';
import { AppAccess } from './app-access';
import { AppBehaviour } from './app-behaviour';
import { AppConfigPanel } from './app-config';
import { AppPermissionsPanel } from './app-permissions';
import { useDiscardGuard } from './discard-changes';
import { AppWidgetKey } from './app-widget-key';
import { AppStorage, AppVersion } from './app-storage';
import { AppUsage } from './app-usage';
import { UpdateButton, useAppUpdate } from './app-update';
import { statusDot } from './status-dot';
import { appBaseUrl, useApp } from './use-app';
import { UninstallDialog } from './uninstall-dialog';
import { ReinstallButton, ReinstallDialog, ReinstallProgress } from './reinstall';
import { failureReason } from '../store/install-progress';
import { useAppCommands } from './use-app-commands';

const copy = appsCopy;
/** The settings header's logo (64px, as AppSettings draws it); 48px in the phone's sheet. */
const SETTINGS_LOGO = 64;
const PHONE_LOGO = tokens.SIZE_CONTROL + tokens.SPACE_1;
/** States a command ends in: Start, Stop and Restart wait for one (US-APP-04). */
const SETTLED = new Set<AppState>(['running', 'stopped', 'error']);
/** What hlabs says when it noticed a running app stop working (US-APP-26). */
const CRASHED: ReadonlySet<string> = new Set(['APP_CRASHED', 'APP_UNHEALTHY']);

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

interface SettingsProps {
  appId: string;
  /** Opened over the app window: a dialog, and Close and Logs stay in the window (phase 2 feedback, D-096). */
  onClose?: () => void;
  onOpenLogs?: () => void;
  /** Logs filtered to one container, from the Usage tab (US-APP-21); over the app window, they stay in it. */
  onOpenContainerLogs?: (service: string) => void;
}

export function AppSettings(props: SettingsProps) {
  return (
    <AdminOnly>
      <AppSettingsView {...props} />
    </AdminOnly>
  );
}

function AppSettingsView({ appId, onClose, onOpenLogs, onOpenContainerLogs }: SettingsProps) {
  const { data: app } = useApp(appId);
  const navigate = useNavigate();
  const openContainerLogs =
    onOpenContainerLogs ??
    ((service: string) =>
      void navigate({
        to: '/apps/$appId/logs',
        params: { appId },
        search: { service },
        state: { fromSettings: true },
      }));
  const goBack = useGoBack();
  // Unsaved changes in Configuration or Permissions ask before the tab changes or the window closes (US-APP-16).
  const discard = useDiscardGuard();
  const back = () => discard.guard(onClose ?? goBack);
  // On a phone: a full-height sheet over the page it was opened from (US-PHONE-08, D-166, D-172).
  const phone = useIsPhone() && Boolean(onClose);
  const [tab, setTab] = useState<Tab>('overview');
  const [uninstalling, setUninstalling] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);
  useEffect(() => {
    if (app) document.title = copy.docTitle(copy.settingsTitle(app.name));
  }, [app]);
  if (!app) return null;
  const look = appTileLook(app.name, app.icon, SETTINGS_LOGO);
  const tabs = TABS.filter((t) => !t.feature || isFeatureEnabled(t.feature)).map((t) => ({
    id: t.id,
    label: copy.tabs[t.id],
  }));
  const logoSize = phone ? PHONE_LOGO : SETTINGS_LOGO;
  const Title = phone ? SheetTitle : 'h1';
  const header = (
    <header className="flex shrink-0 items-center gap-4 max-md:gap-3">
      <AppLogo
        decorative
        name={app.name}
        src={app.icon.logoUrl}
        colors={phone ? appTileLook(app.name, app.icon, PHONE_LOGO).colors : look.colors}
        fallbackIcon={look.fallbackIcon}
        size={logoSize}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 max-md:gap-0">
        <Title className="m-0 truncate text-title-2 font-bold">{app.name}</Title>
        <span className="text-body-sm max-md:text-subhead">
          <StatusDot status={statusDot(app.state)}>
            <StatusLine app={app} />
          </StatusDot>
        </span>
      </div>
      {phone ? (
        <button
          type="button"
          aria-label={copy.close}
          onClick={back}
          className="hl-sheet-close hl-sheet-close-inline hl-focus"
        >
          <X aria-hidden {...iconDefaults} />
        </button>
      ) : (
        <IconButton label={copy.close} onClick={back} className="rounded-pill">
          <X aria-hidden {...iconDefaults} className="size-4" />
        </IconButton>
      )}
    </header>
  );
  const tabsBar = (
    <SectionTabs
      aria-label={copy.sections}
      tabs={tabs}
      active={tab}
      onSelect={(id) => id !== tab && discard.guard(() => setTab(id as Tab))}
    />
  );
  const panel = (
    <div
      role="tabpanel"
      aria-label={copy.tabs[tab]}
      className={
        phone
          ? 'hl-sheet-scroll flex flex-col gap-6 pt-1 pb-6'
          : 'hl-scroll -mx-2 -mb-2 flex min-h-0 flex-col gap-6 px-2 pb-2'
      }
    >
      {/* One panel per tab, each in its own file; Overview is the rest of this window. */}
      {tab === 'configuration' ? (
        <AppConfigPanel app={app} onDirtyChange={discard.setDirty} />
      ) : tab === 'permissions' ? (
        <AppPermissionsPanel app={app} onDirtyChange={discard.setDirty} />
      ) : tab === 'usage' ? (
        <AppUsage app={app} onOpenLogs={openContainerLogs} />
      ) : (
        <>
          <Actions app={app} onOpenLogs={onOpenLogs} onReinstall={() => setReinstalling(true)} phone={phone} />
          <AppAccess app={app} />
          <AppBehaviour app={app} />
          <AppWidgetKey app={app} />
          <AppStorage app={app} />
          {phone ? (
            <PhoneFooter
              app={app}
              onReinstall={() => setReinstalling(true)}
              onUninstall={() => setUninstalling(true)}
            />
          ) : (
            <footer className="flex items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <AppVersion app={app} />
                <UpdateButton app={app} />
              </div>
              <div className="flex items-center gap-5">
                {/* A broken app has it among its actions (US-APP-24). */}
                {app.state === 'error' ? null : (
                  <ReinstallButton app={app} variant="link" icon={false} onOpen={() => setReinstalling(true)} />
                )}
                <Button
                  variant="link"
                  className="text-danger"
                  disabled={app.state === 'reinstalling'}
                  onClick={() => setUninstalling(true)}
                >
                  {copy.uninstallEllipsis}
                </Button>
              </div>
            </footer>
          )}
          <UninstallDialog app={app} open={uninstalling} onOpenChange={setUninstalling} />
          <ReinstallDialog app={app} open={reinstalling} onOpenChange={setReinstalling} />
        </>
      )}
    </div>
  );
  if (phone) {
    return (
      <BottomSheet
        open
        onOpenChange={(open) => (open ? undefined : back())}
        titled
        full
        closeButton={false}
        guarded={discard.dirty}
        className="gap-4"
        // Focus starts on the sheet itself (it's named by the app), not on its close button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        {header}
        {app.state === 'reinstalling' ? <ReinstallProgress app={app} /> : null}
        {tabsBar}
        {panel}
        {discard.dialog}
      </BottomSheet>
    );
  }
  const card = (
    // At most the window's height: the header and tabs stay, the tab's content scrolls inside the card.
    <GlassCard level={2} className="flex max-h-full min-h-0 w-full max-w-[600px] flex-col gap-6 overflow-hidden p-7">
      {header}
      {app.state === 'reinstalling' ? <ReinstallProgress app={app} /> : null}
      {tabsBar}
      {/* Padded inside its scrolling box so focus rings at the edges aren't cut off. */}
      {panel}
      {discard.dialog}
    </GlassCard>
  );
  if (onClose) {
    return (
      <ModalPanel label={copy.appSettings} onClose={back}>
        <section aria-label={copy.appSettings} className="flex h-full w-full items-start justify-center p-3 md:p-12">
          {card}
        </section>
      </ModalPanel>
    );
  }
  return (
    <section
      aria-label={copy.appSettings}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-12"
    >
      {card}
    </section>
  );
}

/** "Running · up 6 days", from when its web container started; the state alone otherwise. */
function StatusLine({ app }: { app: AppDetail }) {
  const now = useNow();
  const { progress } = useAppUpdate(app.id, app.state === 'updating');
  // An update says how far it has got (US-APP-07).
  if (app.state === 'updating' && progress !== null) return copy.updating(progress);
  // An app hlabs noticed stop working says why (US-APP-24, US-APP-26).
  if (app.state === 'error' && CRASHED.has(String(app.stateDetail?.code))) {
    return copy.stoppedWorkingStatus(failureReason(app.stateDetail, app.name, 'macos'));
  }
  const label = copy.status[app.state];
  if (app.state !== 'running' || app.startedAt === null) return label;
  return `${label} · ${copy.upFor(now.getTime() - app.startedAt)}`;
}

/**
 * Open, Restart, Stop (Start when stopped) and Logs (US-APP-04); a broken app: Restart, Reinstall… and Logs
 * (US-APP-24).
 */
function Actions({
  app,
  onOpenLogs,
  onReinstall,
  phone = false,
}: {
  app: AppDetail;
  onOpenLogs?: () => void;
  onReinstall: () => void;
  /** Square tiles with the glyph over the word, as the phone's sheet draws them. */
  phone?: boolean;
}) {
  const navigate = useNavigate();
  const { start, stop, restart, pending } = useAppCommands(app, app.id);
  // Until the command settles (app.stateChanged), all three wait; without the engine none can run (US-STATE-08).
  const waiting = pending || !SETTLED.has(app.state) || !app.engineRunning;
  const hint = app.engineRunning ? undefined : copy.engineFirst;
  const icon = 'size-4';
  const broken = app.state === 'error';
  const logs =
    onOpenLogs ??
    (() => void navigate({ to: '/apps/$appId/logs', params: { appId: app.id }, state: { fromSettings: true } }));
  if (phone) {
    const tile = (label: string, Glyph: typeof ExternalLink, onClick: () => void, disabled = false) => (
      <button
        type="button"
        className="hl-p-action"
        disabled={disabled}
        title={disabled ? hint : undefined}
        onClick={onClick}
      >
        <Glyph aria-hidden {...iconDefaults} />
        {label}
      </button>
    );
    return (
      <div className="hl-p-actions">
        {broken
          ? null
          : tile(copy.open, ExternalLink, () => browser.open(appBaseUrl(app)), app.state === 'reinstalling')}
        {tile(copy.restart, RotateCw, () => restart.mutate(), waiting)}
        {broken
          ? tile(copy.reinstallShort, Wrench, onReinstall)
          : app.state === 'stopped'
            ? tile(copy.start, Play, () => start.mutate(), waiting)
            : tile(copy.stop, CircleStop, () => stop.mutate(), waiting)}
        {tile(copy.logs, ScrollText, logs)}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2.5">
      {broken ? null : (
        <Button disabled={app.state === 'reinstalling'} onClick={() => browser.open(appBaseUrl(app))}>
          <ExternalLink aria-hidden {...iconDefaults} className={icon} />
          {copy.open}
        </Button>
      )}
      <Button
        variant={broken ? 'primary' : 'secondary'}
        disabled={waiting}
        title={hint}
        onClick={() => restart.mutate()}
      >
        <RotateCw aria-hidden {...iconDefaults} className={icon} />
        {copy.restart}
      </Button>
      {broken ? (
        <ReinstallButton app={app} variant="secondary" onOpen={onReinstall} />
      ) : app.state === 'stopped' ? (
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
      <Button
        variant="secondary"
        onClick={
          onOpenLogs ??
          (() => void navigate({ to: '/apps/$appId/logs', params: { appId: app.id }, state: { fromSettings: true } }))
        }
      >
        <TextAlignStart aria-hidden {...iconDefaults} className={icon} />
        {copy.logs}
      </Button>
    </div>
  );
}

/** The end of Overview in the phone's sheet: the version and update, then Reinstall… and Uninstall… as rows. */
function PhoneFooter({
  app,
  onReinstall,
  onUninstall,
}: {
  app: AppDetail;
  onReinstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4">
        <AppVersion app={app} />
        <UpdateButton app={app} />
      </div>
      <div className="hl-p-group">
        {app.state === 'error' ? null : (
          <InsetRowButton
            title={copy.reinstallEllipsis}
            disabled={app.state === 'reinstalling'}
            onClick={onReinstall}
          />
        )}
        <InsetRowButton
          title={copy.uninstallEllipsis}
          danger
          disabled={app.state === 'reinstalling'}
          onClick={onUninstall}
        />
      </div>
    </>
  );
}
