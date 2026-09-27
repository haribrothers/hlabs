// Help links from the product go through helpUrl so site:check can verify every slug (D-055).
// SITE_URL is still to be confirmed (docs/prd/13-risks-open-questions.md Q-07).
export const SITE_URL = 'https://hlabs.dev';

/** helpUrl('backups/restore') → "https://hlabs.dev/help/backups/restore/". */
export function helpUrl(slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(clean)) throw new TypeError(`Invalid help slug: ${slug}`);
  return `${SITE_URL}/help/${clean}/`;
}
