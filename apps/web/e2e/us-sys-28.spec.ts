// US-SYS-28 · Download a diagnostics bundle (main instance, admin): "Download" builds it and the browser saves
// hlabs-diagnostics-<hostname>-<date>.zip, a zip.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('US-SYS-28 Download saves the diagnostics bundle under its name', async ({ page }) => {
  await page.goto('/settings/advanced');
  const troubleshooting = page.getByRole('group', { name: 'Troubleshooting' });
  await expect(troubleshooting).toContainText('Logs and system info, with passwords removed');
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await troubleshooting.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^hlabs-diagnostics-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.zip$/);
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  await expect(page.getByText('Diagnostics bundle downloaded')).toBeVisible();
});
