// App widgets on Home (US-HOME-20, D-157): the daemon reads the endpoint an app's manifest declares on its web service
// (127.0.0.1:<port + 1000>, D-086), with the admin's API key when it needs one, and fills the widget's template from the
// fields the manifest names. The browser never calls the app; values come back as text or numbers, never markup.
import type { AppWidgetData } from '@hlabs/api';
import type { AppWidget } from '@hlabs/app-manifest';
import { apps, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { loopbackPort } from '../apps/ports';
import type { SecretStore } from '../platform/secrets';
import { appWidgetsOf, parseAppWidgetId } from './layout';

export type WidgetResult = {
  status: 'ok' | 'app_not_running' | 'error' | 'needs_key';
  data?: unknown;
  updatedAt: number;
};

/** How long an app may take to answer. */
export const WIDGET_TIMEOUT_MS = 5_000;
/** Longer strings are cut, so an app can't fill Home with text. */
export const MAX_TEXT = 60;
/** The keychain entry for an app's widget key. */
export const widgetKeyRef = (appId: string) => `widget-key:${appId}`;

/** `data.total`, `items[0].name` in a JSON value. */
export function pick(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const part of path.match(/[^.[\]]+/g) ?? []) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[/^\d+$/.test(part) ? Number(part) : part];
  }
  return cur;
}

/** A value as the widget shows it: numbers stay numbers, anything else becomes short text. */
export function asValue(v: unknown): string | number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return '—';
  const text = typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : JSON.stringify(v);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

const asText = (v: unknown) => String(asValue(v));

/** The template filled from the app's answer. */
export function fillTemplate(widget: AppWidget, body: unknown): AppWidgetData {
  const f = widget.fields;
  if ('value' in f)
    return { template: 'stat', value: { value: asValue(pick(body, f.value.value)), label: f.value.label } };
  if ('first' in f) {
    return {
      template: 'twoStat',
      first: { value: asValue(pick(body, f.first.value)), label: f.first.label },
      second: { value: asValue(pick(body, f.second.value)), label: f.second.label },
    };
  }
  const items = pick(body, f.items);
  const rows = (Array.isArray(items) ? items : []).slice(0, 3).map((row) => ({
    title: asText(pick(row, f.title)),
    detail: f.detail ? asText(pick(row, f.detail)) : null,
  }));
  return { template: 'list', rows };
}

export class AppWidgets {
  /** The last answer per widget, for its refresh time; and the last good one, shown greyed when it fails. */
  private readonly fresh = new Map<string, { at: number; result: WidgetResult }>();
  private readonly lastGood = new Map<string, { at: number; data: AppWidgetData }>();

  constructor(
    private readonly deps: {
      db: HlabsDb;
      secrets: SecretStore;
      fetch?: (url: string, init: RequestInit) => Promise<Response>;
      now?: () => number;
      /** How long an app may take; WIDGET_TIMEOUT_MS unless a test says otherwise. */
      timeoutMs?: number;
    },
  ) {}

  /** Forget cached answers for an app (its key changed). */
  forget(appId: string): void {
    for (const key of [...this.fresh.keys()]) if (parseAppWidgetId(key)?.appId === appId) this.fresh.delete(key);
  }

  async data(id: string): Promise<WidgetResult | null> {
    const now = this.deps.now?.() ?? Date.now();
    const ref = parseAppWidgetId(id);
    if (!ref) return null;
    const app = this.deps.db.select().from(apps).where(eq(apps.id, ref.appId)).get();
    const widget = appWidgetsOf(this.deps.db, ref.appId)?.widgets.find((w) => w.id === ref.widgetId);
    if (!app || !widget) return null;
    if (app.state !== 'running') return { status: 'app_not_running', updatedAt: now };

    const cached = this.fresh.get(id);
    if (cached && now - cached.at < widget.refresh * 1000) return cached.result;

    let key: string | null = null;
    if (widget.auth) {
      key = await this.deps.secrets.get(widgetKeyRef(ref.appId));
      if (!key) return { status: 'needs_key', updatedAt: now };
    }
    const result = await this.read(id, app.portFallback, widget, key, now);
    this.fresh.set(id, { at: now, result });
    return result;
  }

  private async read(
    id: string,
    port: number | null,
    widget: AppWidget,
    key: string | null,
    now: number,
  ): Promise<WidgetResult> {
    const failed = (): WidgetResult => {
      const good = this.lastGood.get(id);
      return good ? { status: 'error', data: good.data, updatedAt: good.at } : { status: 'error', updatedAt: now };
    };
    if (port === null) return failed();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (widget.auth && key) headers[widget.auth.header.toLowerCase()] = `${widget.auth.prefix ?? ''}${key}`;
    try {
      const res = await (this.deps.fetch ?? fetch)(`http://127.0.0.1:${loopbackPort(port)}${widget.endpoint.path}`, {
        headers,
        signal: AbortSignal.timeout(this.deps.timeoutMs ?? WIDGET_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!res.ok) return failed();
      const data = fillTemplate(widget, await res.json());
      this.lastGood.set(id, { at: now, data });
      return { status: 'ok', data, updatedAt: now };
    } catch {
      return failed();
    }
  }
}
