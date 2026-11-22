// Shared by the website's specs: axe on a page in both themes, and the store's apps as the build saw them.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** No axe violations (contrast included) in the dark theme and the light one (US-SITE-01, US-SITE-12). */
export async function accessibleInBothThemes(page: Page) {
  // No motion: contrast is measured on what people see, not halfway through a fade.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  for (const theme of ['dark', 'light']) {
    // Cards ease into the new theme's colours: measure once they're there.
    await page.evaluate(async (t) => {
      document.documentElement.dataset.theme = t;
      await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    }, theme);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations, `${theme} theme`).toEqual([]);
  }
}

/** The ids of the apps in the store the site's tests were built from (e2e/build.ts). */
export function storeAppIds(): string[] {
  const apps = resolve(import.meta.dirname, '../.e2e/store/apps');
  return readdirSync(apps, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export const FIXTURE = {
  stable: '0.6.0',
  beta: '0.7.0-beta.1',
  releases: 'https://github.com/haribrothers/hlabs/releases/download',
};

/** The site built with only the fixture's beta, before any stable release (e2e/build.ts, playwright.config.ts). */
export const BETA_ONLY_URL = 'http://127.0.0.1:4522';
