// hlabs's own logs (US-SYS-27): a window over Settings with the last 500 lines of the background service, the proxy
// or app installs (Segmented), new lines every 2 seconds while it's open, search that highlights matches, and Pause,
// which stops the view following the newest line. Secrets in the lines are already masked by hlabs (••••).
import type { SystemLogLine, SystemLogSource } from '@hlabs/api';
import { iconDefaults, Search, X } from '@hlabs/icons';
import { Badge, Button, GlassCard, IconButton, ModalPanel, Segmented } from '@hlabs/ui';
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Highlighted, logTime } from '../apps/app-logs';
import { advancedCopy as copy } from '../copy/advanced';
import { useTRPCClient } from '../lib/trpc';

/** How often new lines are asked for while the window is open. */
export const LOGS_POLL_MS = 2_000;
export const INITIAL_LINES = 500;
/** At most this many lines are kept; the oldest go first. */
export const MAX_LINES = 5_000;

const SOURCES: SystemLogSource[] = ['daemon', 'proxy', 'installs'];
const LEVEL_TONE: Record<SystemLogLine['level'], 'danger' | 'warning' | 'accent' | 'neutral'> = {
  error: 'danger',
  warn: 'warning',
  info: 'accent',
  debug: 'neutral',
};

function useSystemLogs(source: SystemLogSource) {
  const client = useTRPCClient();
  const [state, setState] = useState<{ source: SystemLogSource; lines: SystemLogLine[] | null; failed: boolean }>({
    source,
    lines: null,
    failed: false,
  });
  useEffect(() => {
    let stopped = false;
    let last: number | undefined;
    let lines: SystemLogLine[] = [];
    const load = async () => {
      try {
        const res = await client.system.logs.query(
          last === undefined ? { source, limit: INITIAL_LINES } : { source, since: last, limit: MAX_LINES },
        );
        if (stopped) return;
        if (res.lines.length) {
          lines = [...lines, ...res.lines].slice(-MAX_LINES);
          last = lines.at(-1)!.at;
        }
        setState({ source, lines, failed: false });
      } catch {
        if (!stopped && last === undefined) setState({ source, lines: null, failed: true });
      }
    };
    void load();
    const timer = setInterval(() => void load(), LOGS_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [client, source]);
  return state.source === source ? state : { lines: null, failed: false };
}

export function HlabsLogs({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<SystemLogSource>('daemon');
  const [text, setText] = useState('');
  const query = useDeferredValue(text.trim().toLowerCase());
  const [paused, setPaused] = useState(false);
  const { lines, failed } = useSystemLogs(source);
  const list = useRef<HTMLDivElement>(null);

  // Not paused: the newest line stays in view as lines arrive.
  useLayoutEffect(() => {
    const el = list.current;
    if (!paused && el) el.scrollTop = el.scrollHeight;
  }, [paused, lines?.length, source]);

  const matches = query && lines ? lines.filter((l) => l.text.toLowerCase().includes(query)).length : 0;

  return (
    <ModalPanel label={copy.logsTitle} onClose={onClose}>
      <section aria-label={copy.logsTitle} className="flex h-full w-full p-3 md:p-10">
        <GlassCard level={2} className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-5 md:p-7">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 min-w-0 flex-1 truncate text-title-2 font-bold">{copy.logsTitle}</h1>
            <IconButton label={copy.close} className="rounded-pill" onClick={onClose}>
              <X aria-hidden {...iconDefaults} className="size-4" />
            </IconButton>
          </header>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              aria-label={copy.sourceLabel}
              options={SOURCES.map((s) => ({ value: s, label: copy.sources[s] }))}
              value={source}
              onChange={(v) => setSource(v as SystemLogSource)}
            />
            <div role="search" className="relative min-w-40 flex-1 md:max-w-72">
              <Search
                aria-hidden
                {...iconDefaults}
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="search"
                className="hl-input w-full rounded-pill pl-10"
                aria-label={copy.search}
                placeholder={copy.searchPlaceholder}
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            {query ? (
              <span role="status" className="text-body-sm text-ink-muted">
                {copy.matches(matches)}
              </span>
            ) : null}
            <Button size="sm" variant="secondary" aria-pressed={paused} onClick={() => setPaused(!paused)}>
              {paused ? copy.resume : copy.pause}
            </Button>
          </div>
          <div
            ref={list}
            role="log"
            aria-label={copy.sources[source]}
            // While following, new lines would flood a screen reader; paused, it reads them.
            aria-live={paused ? 'polite' : 'off'}
            tabIndex={0}
            className="hl-focus min-h-0 flex-1 overflow-y-auto rounded-xl bg-[color-mix(in_srgb,var(--wall-base)_94%,black)] px-5 py-4 font-mono text-body-sm"
          >
            {failed ? (
              <p className="m-0 font-sans text-ink-muted">{copy.loadFailed}</p>
            ) : lines === null ? null : lines.length === 0 ? (
              <p className="m-0 font-sans text-ink-muted">{copy.noLines}</p>
            ) : (
              lines.map((line, i) => (
                <div
                  key={`${line.at}-${i}`}
                  className="flex gap-4 py-0.5 [contain-intrinsic-size:auto_1.75rem] [content-visibility:auto]"
                >
                  <span className="shrink-0 text-ink-muted">{logTime(line.at)}</span>
                  <span className="w-20 shrink-0">
                    <Badge tone={LEVEL_TONE[line.level]}>{copy.level[line.level]}</Badge>
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words text-ink">
                    <Highlighted text={line.text} query={query} />
                  </span>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </section>
    </ModalPanel>
  );
}
