// An app's logs (US-APP-08…10): "<App> logs" with a way back to its settings, the last 500 lines across its
// containers and new ones as they come. While "Following" is on the view stays at the newest line; scrolling up turns
// it off, and pressing it jumps back down. A window over the wallpaper, as the AppLogs screen draws it.
import type { LogLine } from '@hlabs/api';
import { ChevronLeft, iconDefaults } from '@hlabs/icons';
import { Badge, GlassCard, IconButton } from '@hlabs/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { appsCopy } from '../copy/apps';
import { useNow } from '../lib/use-now';
import { AdminOnly } from './admin-only';
import { logLevel, type LogLevel } from './log-level';
import { useApp } from './use-app';
import { useAppLogs } from './use-app-logs';

const copy = appsCopy;
const LEVEL_TONE: Record<LogLevel, 'danger' | 'warning' | 'accent' | 'neutral'> = {
  ERROR: 'danger',
  WARN: 'warning',
  INFO: 'accent',
  DEBUG: 'neutral',
};
/** Scrolled this close to the end still counts as at the newest line. */
const AT_END_PX = 8;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
/** Local time, `HH:mm:ss`. */
export const logTime = (ts: number) => timeFormat.format(ts);

export function AppLogs({ appId }: { appId: string }) {
  return (
    <AdminOnly>
      <AppLogsView appId={appId} />
    </AdminOnly>
  );
}

function AppLogsView({ appId }: { appId: string }) {
  const { data: app } = useApp(appId);
  const navigate = useNavigate();
  const { lines, loading, error } = useAppLogs(appId);
  const [following, setFollowing] = useState(true);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (app) document.title = copy.docTitle(copy.logsTitle(app.name));
  }, [app]);
  // Following: keep the newest line in view as lines arrive.
  useLayoutEffect(() => {
    const el = list.current;
    if (following && el) el.scrollTop = el.scrollHeight;
  }, [following, lines.length]);

  if (!app) return null;
  const onScroll = () => {
    const el = list.current;
    if (!el || !following) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > AT_END_PX) setFollowing(false);
  };
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
          <h1 className="m-0 min-w-0 flex-1 truncate text-title-2 font-bold">{copy.logsTitle(app.name)}</h1>
          <button
            type="button"
            aria-pressed={following}
            onClick={() => setFollowing(!following)}
            className={`hl-btn hl-btn-sm hl-focus ${following ? 'hl-btn-secondary text-success' : 'hl-btn-secondary'}`}
          >
            <span aria-hidden className={`size-2 rounded-pill ${following ? 'bg-success' : 'bg-ink-muted'}`} />
            {copy.following}
          </button>
        </header>
        <div
          ref={list}
          role="log"
          aria-label={copy.logsTitle(app.name)}
          // While following, new lines would flood a screen reader; it reads them once following is off.
          aria-live={following ? 'off' : 'polite'}
          tabIndex={0}
          onScroll={onScroll}
          className="hl-focus min-h-0 flex-1 overflow-y-auto rounded-xl bg-[color-mix(in_srgb,var(--wall-base)_94%,black)] px-5 py-4 font-mono text-body-sm"
        >
          {loading ? null : error ? (
            <p className="m-0 text-ink-muted">{copy.logsFailed}</p>
          ) : lines.length === 0 ? (
            <p className="m-0 text-ink-muted">{copy.noLogs}</p>
          ) : (
            lines.map((line, i) => <Row key={`${line.ts}-${i}`} line={line} />)
          )}
          {following && !loading && !error ? <Cursor /> : null}
        </div>
      </GlassCard>
    </section>
  );
}

function Row({ line }: { line: LogLine }) {
  if (line.restarted) {
    return (
      <div className="my-2 flex items-center gap-3 text-ink-muted [contain-intrinsic-size:auto_1.75rem] [content-visibility:auto]">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        {copy.containerRestarted}
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </div>
    );
  }
  const level = logLevel(line.line);
  return (
    <div className="flex gap-4 py-0.5 [contain-intrinsic-size:auto_1.75rem] [content-visibility:auto]">
      <span className="shrink-0 text-ink-muted">{logTime(line.ts)}</span>
      <span className="w-16 shrink-0">{level ? <Badge tone={LEVEL_TONE[level]}>{level}</Badge> : null}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-ink">{line.line}</span>
    </div>
  );
}

/** The newest-line marker while following: the time now and a blinking cursor. */
function Cursor() {
  const now = useNow(1_000);
  return (
    <div aria-hidden className="flex gap-4 py-0.5">
      <span className="shrink-0 text-ink-muted">{logTime(now.getTime())}</span>
      <span className="h-4 w-1.5 animate-pulse bg-ink-muted motion-reduce:animate-none" />
    </div>
  );
}
