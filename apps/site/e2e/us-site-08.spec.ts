// US-SITE-08 · Search the help (Starlight's Pagefind: it runs in the browser).
import { expect, test, type Page } from '@playwright/test';

/** The help page, once its search shortcuts are listening. */
async function help(page: Page) {
  await page.goto('/help/');
  await page.locator('html[data-search-keys]').waitFor({ state: 'attached' });
}

test.describe('US-SITE-08', () => {
  for (const [name, open] of [
    ['"/"', async (page: Page) => page.keyboard.press('/')],
    ['⌘K', async (page: Page) => page.keyboard.press('ControlOrMeta+k')],
    ['Search', async (page: Page) => page.getByRole('button', { name: 'Search' }).click()],
  ] as const) {
    test(`${name} opens search with the cursor in the field`, async ({ page }) => {
      await help(page);
      await open(page);
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused({ timeout: 10_000 });
    });
  }

  test('finds pages with the matched heading and a snippet, and nothing leaves the device', async ({ page }) => {
    const elsewhere: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:')) elsewhere.push(r.url());
    });
    await help(page);
    await page.keyboard.press('/');
    const field = page.getByRole('dialog').getByRole('textbox');
    await expect(field).toBeFocused({ timeout: 10_000 });
    await field.fill('backup nas');
    const results = page.locator('.pagefind-ui__result');
    await expect(results.first()).toBeVisible();
    await expect(page.locator('.pagefind-ui__result-title').first()).toContainText(/back/i);
    await expect(page.locator('.pagefind-ui__result-excerpt').first()).not.toBeEmpty();
    expect(elsewhere).toEqual([]);
  });

  test('when nothing matches, it says so and points to Troubleshooting and GitHub', async ({ page }) => {
    await help(page);
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused({ timeout: 10_000 });
    // Pagefind finds something for almost anything, so this is Pagefind's own "No results" message, as it writes it.
    await page.evaluate(() => {
      const message = document.createElement('p');
      message.className = 'pagefind-ui__message';
      message.textContent = 'No results for "qqq"';
      document.getElementById('starlight__search')!.append(message);
    });
    const hint = page.locator('[data-search-nothing]');
    await expect(hint).toContainText('Try Troubleshooting, or ask on GitHub.');
    await expect(hint.getByRole('link', { name: 'Troubleshooting' })).toHaveAttribute(
      'href',
      '/help/get-started/cant-reach/',
    );
    await expect(hint.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/haribrothers/hlabs/issues',
    );
    // That message is the help's own words.
    const translations = await page.locator('site-search').getAttribute('data-translations');
    expect(JSON.parse(translations!).zero_results).toBe('No results for "[SEARCH_TERM]"');
  });
});
