// US-SYS-27 · View hlabs logs (main instance, admin): "hlabs logs" › View shows the background service's lines with
// secrets masked, a source to choose (Proxy has no lines in e2e: no Caddy), search that marks matches and Pause.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test('US-SYS-27 the log window shows hlabs lines with secrets masked, by source, with search', async ({
  page,
  request,
}) => {
  const tag = `us-sys-27-${Date.now()}`;
  const res = await request.post(`${MAIN_URL}/dev/log-line`, { data: { message: `${tag} DB_PASSWORD=hunter2e2e` } });
  expect(res.ok()).toBe(true);
  await page.goto('/settings/advanced');
  const troubleshooting = page.getByRole('group', { name: 'Troubleshooting' });
  await expect(troubleshooting).toContainText('Background service, proxy and app installs');
  await troubleshooting.getByRole('button', { name: /^View( hlabs logs)?$/ }).click();
  const log = page.getByRole('log', { name: 'Background service' });
  await expect(log).toContainText(`${tag} DB_PASSWORD=••••`, { timeout: 10_000 });
  await expect(log).not.toContainText('hunter2e2e');

  await page.getByRole('searchbox', { name: 'Search' }).fill(tag);
  await expect(log.locator('mark', { hasText: tag })).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');
  expect((await new AxeBuilder({ page }).include('[role="log"]').analyze()).violations).toEqual([]);

  await page.getByRole('radiogroup', { name: 'Which log' }).getByRole('radio', { name: 'Proxy' }).click();
  await expect(page.getByRole('log', { name: 'Proxy' })).toContainText('No log lines yet');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('log')).toHaveCount(0);
});
