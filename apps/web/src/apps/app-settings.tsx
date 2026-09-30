// App settings (US-APP-04…07): the app with its status, and Close back to where it was opened from. A window over the
// wallpaper, as the AppSettings screen draws it.
import { AppLogo, appTileLook, iconDefaults, X } from '@hlabs/icons';
import { GlassCard, IconButton, StatusDot } from '@hlabs/ui';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { appsCopy } from '../copy/apps';
import { statusDot } from './app-window';
import { useApp } from './use-app';

const copy = appsCopy;
/** The settings header's logo (64px, as AppSettings draws it). */
const SETTINGS_LOGO = 64;

/** Back to where it was opened from (the app window or Home), or Home when opened directly. */
export function useGoBack() {
  const router = useRouter();
  const navigate = useNavigate();
  return () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: '/' }));
}

export function AppSettings({ appId }: { appId: string }) {
  const { data: app } = useApp(appId);
  const back = useGoBack();
  useEffect(() => {
    if (app) document.title = copy.docTitle(copy.settingsTitle(app.name));
  }, [app]);
  if (!app) return null;
  const look = appTileLook(app.name, app.icon, SETTINGS_LOGO);
  return (
    <section
      aria-label={copy.appSettings}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-12"
    >
      <GlassCard level={2} className="flex w-full max-w-[600px] flex-col gap-6 p-7">
        <header className="flex items-center gap-4">
          <AppLogo
            name={app.name}
            src={app.icon.logoUrl}
            colors={look.colors}
            fallbackIcon={look.fallbackIcon}
            size={SETTINGS_LOGO}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="m-0 truncate text-title-2 font-bold">{app.name}</h1>
            <span className="text-body-sm">
              <StatusDot status={statusDot(app.state)}>{copy.status[app.state]}</StatusDot>
            </span>
          </div>
          <IconButton label={copy.close} onClick={back} className="rounded-pill">
            <X aria-hidden {...iconDefaults} className="size-4" />
          </IconButton>
        </header>
      </GlassCard>
    </section>
  );
}
