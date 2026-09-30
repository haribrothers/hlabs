// An app's logs (US-APP-08…10): "<App> logs" with a way back to its settings. A window over the wallpaper, as the
// AppLogs screen draws it.
import { ChevronLeft, iconDefaults } from '@hlabs/icons';
import { GlassCard, IconButton } from '@hlabs/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { appsCopy } from '../copy/apps';
import { useApp } from './use-app';

const copy = appsCopy;

export function AppLogs({ appId }: { appId: string }) {
  const { data: app } = useApp(appId);
  const navigate = useNavigate();
  useEffect(() => {
    if (app) document.title = copy.docTitle(copy.logsTitle(app.name));
  }, [app]);
  if (!app) return null;
  return (
    <section aria-label={copy.logs} className="fixed inset-0 z-50 flex p-3 md:p-10">
      <GlassCard level={2} className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-7">
        <header className="flex items-center gap-4">
          <IconButton
            label={copy.backToSettings}
            className="rounded-pill"
            onClick={() => void navigate({ to: '/apps/$appId/settings', params: { appId } })}
          >
            <ChevronLeft aria-hidden {...iconDefaults} className="size-4" />
          </IconButton>
          <h1 className="m-0 truncate text-title-2 font-bold">{copy.logsTitle(app.name)}</h1>
        </header>
      </GlassCard>
    </section>
  );
}
