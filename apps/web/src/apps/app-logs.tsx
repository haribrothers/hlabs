// An app's logs (US-APP-08…10): "<App> logs" with a way back to its settings, the last 500 lines across its
// containers and new ones as they come. While "Following" is on the view stays at the newest line; scrolling up turns
// it off, and pressing it jumps back down. Filters narrow it to some text, one container or errors (US-APP-09). A window over the wallpaper, as the AppLogs screen draws it.
import type { LogLine } from '@hlabs/api';
import { ChevronLeft, iconDefaults, Search } from '@hlabs/icons';
import { Badge, Button, GlassCard, IconButton, Segmented } from '@hlabs/ui';
import { useNavigate } from '@tanstack/react-router';
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  // Filters (US-APP-09): text and level on the loaded lines, the container on the server.
  const [text, setText] = useState('');
  const query = useDeferredValue(text.trim().toLowerCase());
  const [service, setService] = useState<string | undefined>(undefined);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const { lines, loading, error } = useAppLogs(appId, service);
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
  const several = app.services.length > 1;
  const shown = lines.filter(
    (l) =>
      l.restarted ||
      ((!query || l.line.toLowerCase().includes(query)) && (!errorsOnly || logLevel(l.line) === 'ERROR')),
  );
  const filtering = query !== '' || errorsOnly || service !== undefined;
  const clearFilters = () => {
    setText('');
    setService(undefined);
    setErrorsOnly(false);
  };
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
          <div role="search" className="relative w-40 md:w-64">
            <Search
              aria-hidden
              {...iconDefaults}
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              className="hl-input w-full rounded-pill pl-10"
              aria-label={copy.filterLogs}
              placeholder={copy.filter}
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
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
        <div className="flex flex-wrap items-center gap-2">
          {several ? (
            <Segmented
              aria-label={copy.container}
              options={[{ value: '', label: copy.allContainers }, ...app.services.map((s) => ({ value: s, label: s }))]}
              value={service ?? ''}
              onChange={(v) => setService(v || undefined)}
            />
          ) : null}
          <button
            type="button"
            aria-pressed={errorsOnly}
            onClick={() => setErrorsOnly(!errorsOnly)}
            className={`hl-btn hl-btn-sm hl-focus ${errorsOnly ? 'bg-fill-primary text-ink-on-light' : 'hl-btn-secondary'}`}
          >
            {copy.errorsOnly}
          </button>
        </div>
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
          ) : lines.length === 0 && !filtering ? (
            <p className="m-0 text-ink-muted">{copy.noLogs}</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 font-sans">
              <p className="m-0 text-ink-muted">{copy.noMatches}</p>
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                {copy.clearFilters}
              </Button>
            </div>
          ) : (
            shown.map((line, i) => (
              <Row key={`${line.ts}-${i}`} line={line} query={query} withService={several && !service} />
            ))
          )}
          {following && !loading && !error ? <Cursor /> : null}
        </div>
      </GlassCard>
    </section>
  );
}

function Row({ line, query, withService }: { line: LogLine; query: string; withService: boolean }) {
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
      <span className="min-w-0 whitespace-pre-wrap break-words text-ink">
        {/* "All" interleaves the containers, so each line says whose it is. */}
        {withService ? <span className="mr-2 text-ink-muted">{line.service}</span> : null}
        <Highlighted text={line.line} query={query} />
      </span>
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

/** The line with each match of the filter marked (case-insensitive). */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-accent-wash text-ink">
        {text.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
  }
  parts.push(text.slice(from));
  return parts;
}
