// US-APP-08 · Follow an app's logs live.
import type { LogLine } from '@hlabs/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppLogs, logTime } from './app-logs';
import { logLevel } from './log-level';

const never = () => new Promise(() => {});
const T0 = new Date(2026, 9, 1, 17, 2, 11).getTime();
const line = (n: number, text: string, over: Partial<LogLine> = {}): LogLine => ({
  service: 'server',
  stream: 'stdout',
  ts: T0 + n * 1000,
  line: text,
  ...over,
});

function open(lines: LogLine[], handlers: Handlers = {}, role: 'admin' | 'member' = 'admin') {
  return renderScreen(
    () => <AppLogs appId="vaultwarden" />,
    {
      'apps.get': () => appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running' }),
      'apps.logs': () => ({ lines }),
      'apps.watchLogs': never,
      'events.stream': never,
      'auth.me': fakeMe({ role }),
      ...handlers,
    },
    { path: '/apps/vaultwarden/logs' },
  );
}

describe('US-APP-08', () => {
  it('shows "<App> logs" with Back to app settings, and the lines oldest first with time and level', async () => {
    const { calls } = open([
      line(0, '[INFO] Starting server on 0.0.0.0:80'),
      line(1, 'level=warn msg="SMTP is not configured"'),
      line(2, 'Websocket client connected'),
    ]);
    expect(await screen.findByRole('heading', { name: 'Vaultwarden logs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to app settings' })).toBeInTheDocument();
    const log = await screen.findByRole('log', { name: 'Vaultwarden logs' });
    await within(log).findByText('[INFO] Starting server on 0.0.0.0:80');
    const rows = [...log.children].slice(0, 3).map((r) => r.textContent);
    expect(rows).toEqual([
      '17:02:11INFO[INFO] Starting server on 0.0.0.0:80',
      '17:02:12WARNlevel=warn msg="SMTP is not configured"',
      '17:02:13Websocket client connected',
    ]);
    expect(calls).toContainEqual({ path: 'apps.logs', input: { appId: 'vaultwarden', tail: 500 } });
  });

  it('new lines arrive from the watch, after the last loaded line', async () => {
    let publish!: (l: LogLine) => void;
    const next = new Promise<LogLine>((r) => (publish = r));
    const { calls } = open([line(0, 'loaded')], { 'apps.watchLogs': () => next });
    await screen.findByText('loaded');
    await waitFor(() =>
      expect(calls).toContainEqual({ path: 'apps.watchLogs', input: { appId: 'vaultwarden', since: T0 } }),
    );
    await act(async () => publish(line(1, 'arrived live')));
    expect(await screen.findByText('arrived live')).toBeInTheDocument();
  });

  it("the last loaded line coming again from the watch isn't shown twice", async () => {
    let publish!: (l: LogLine) => void;
    const next = new Promise<LogLine>((r) => (publish = r));
    open([line(0, 'boundary')], { 'apps.watchLogs': () => next });
    await screen.findByText('boundary');
    await act(async () => publish(line(0, 'boundary')));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getAllByText('boundary')).toHaveLength(1);
  });

  it('"Following" is on and keeps the newest line in view; scrolling up turns it off; pressing it jumps back', async () => {
    open([line(0, 'a'), line(1, 'b')]);
    const log = await screen.findByRole('log');
    await within(log).findByText('b');
    const following = screen.getByRole('button', { name: 'Following' });
    expect(following).toHaveAttribute('aria-pressed', 'true');
    expect(log).toHaveAttribute('aria-live', 'off');
    Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(log, 'clientHeight', { value: 100, configurable: true });
    log.scrollTop = 200;
    fireEvent.scroll(log);
    expect(following).toHaveAttribute('aria-pressed', 'false');
    expect(log).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(following);
    expect(following).toHaveAttribute('aria-pressed', 'true');
    expect(log.scrollTop).toBe(1000);
  });

  it('keeps at most 5,000 lines, dropping the oldest', async () => {
    open(Array.from({ length: 5_200 }, (_, i) => line(i, `line ${i}`)));
    const log = await screen.findByRole('log', {}, { timeout: 10_000 });
    await within(log).findByText('line 5199', {}, { timeout: 10_000 });
    expect(within(log).queryByText('line 199')).toBeNull();
    expect(within(log).getByText('line 200')).toBeInTheDocument();
    // 5,200 rows take a while to render on a slow CI runner.
  }, 20_000);

  it('with no output yet it says "No logs yet."', async () => {
    open([]);
    expect(await screen.findByText('No logs yet.')).toBeInTheDocument();
  });

  it('a container restarting while followed shows "Container restarted"', async () => {
    open([line(0, 'before'), line(1, '', { restarted: true }), line(2, 'after')]);
    expect(await screen.findByText('Container restarted')).toBeInTheDocument();
  });

  it("members can't reach Logs and never ask for them", async () => {
    const { calls } = open([line(0, 'secret')], {}, 'member');
    expect(await screen.findByRole('heading', { name: "You don't have access to this" })).toBeInTheDocument();
    expect(calls.some((c) => c.path === 'apps.logs')).toBe(false);
  });

  it('times are local HH:mm:ss', () => {
    expect(logTime(new Date(2026, 0, 2, 7, 5, 9).getTime())).toBe('07:05:09');
  });

  it.each([
    ['[2024-05-01][request][INFO] GET /api/sync', 'INFO'],
    ['{"level":"error","msg":"boom"}', 'ERROR'],
    ['time=x level=warning msg=slow', 'WARN'],
    ['[warn] SMTP is not configured', 'WARN'],
    ['FATAL could not open database', 'ERROR'],
    ['panic: runtime error', null],
    ['PANIC: runtime error', 'ERROR'],
    ['CRITICAL disk failing', 'ERROR'],
    ['DEBUG cache hit', 'DEBUG'],
    ['GET /api/sync 200 · 18 ms', null],
    ['no error here', null],
  ])('"%s" is %s', (text, level) => {
    expect(logLevel(text)).toBe(level);
  });
});
