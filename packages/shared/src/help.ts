// Help links from the product go through helpUrl so site:check can verify every slug (D-055).
// SITE_URL is the website's address (D-139, Q-07).
export const SITE_URL = 'https://hlabs.h4loom.com';

/**
 * The dashboard's dev server (pnpm dev, e2e) defines this as the local site (`pnpm dev:site`, or HLABS_HELP_URL), so
 * help links work before the site is published (phase 6). Builds, tests and everything else leave it out.
 */
declare const __HLABS_HELP_URL__: string | null | undefined;
const helpBase = (): string =>
  typeof __HLABS_HELP_URL__ === 'string' && __HLABS_HELP_URL__ ? __HLABS_HELP_URL__.replace(/\/+$/, '') : SITE_URL;

/** helpUrl('backups/restore') → "https://hlabs.h4loom.com/help/backups/restore/" (the local site in development). */
export function helpUrl(slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(clean)) throw new TypeError(`Invalid help slug: ${slug}`);
  return `${helpBase()}/help/${clean}/`;
}

/** An error code's help page (US-SITE-10): APP_PORT_IN_USE → "errors/app-port-in-use", for helpUrl. */
export function errorHelpSlug(code: string): string {
  return `errors/${code.toLowerCase().replace(/_/g, '-')}`;
}
