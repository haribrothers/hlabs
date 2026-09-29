// Pages the daemon answers with outside the dashboard (US-AUTH-17, US-AUTH-19): "Page not found" and "You don't have
// access to this" for app hostnames. They come from the fallback bundle (`pages.html`, built by apps/web with the
// dashboard's copy and styles, everything inlined), and the daemon adds the page's data as JSON. Without the bundle
// (tests, `pnpm dev` before a build) a plain page says the same.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NoAccessPage {
  kind: 'noAccess';
  homeUrl: string;
  appName: string;
  /** The oldest enabled admin, to ask; null if there's none. */
  adminName: string | null;
  username: string;
  displayName: string;
  avatarColor: string | null;
  /** The member's accent (Settings › Appearance). */
  accent: string;
}

export type StaticPageData = { kind: 'notFound'; homeUrl: string } | NoAccessPage;

export const PAGES_FILE = 'pages.html';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** JSON that is safe inside a <script> element. */
const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

export class StaticPages {
  private template: string | null | undefined;

  constructor(private readonly webFallbackDir: string) {}

  render(data: StaticPageData): string {
    const template = this.load();
    const json = `<script id="hlabs-page" type="application/json">${scriptJson(data)}</script>`;
    if (template) return template.replace('</head>', () => `${json}\n</head>`);
    // Plain version: the bundle isn't built here.
    const title = data.kind === 'notFound' ? 'Page not found' : "You don't have access to this";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${json}</head><body><h1>${title}</h1><p><a href="${escapeHtml(data.homeUrl)}">Go to Home</a></p></body></html>`;
  }

  private load(): string | null {
    if (this.template === undefined) {
      try {
        this.template = readFileSync(join(this.webFallbackDir, PAGES_FILE), 'utf8');
      } catch {
        this.template = null;
      }
    }
    return this.template;
  }
}
