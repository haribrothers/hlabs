// US-SYS-05 · See and change web ports (first-run instance: changing ports doesn't disturb other specs).
import { expect, test } from '@playwright/test';
import { createServer } from 'node:net';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-05 a port another program holds is refused; free ports are saved', async ({ page, request }, info) => {
  await finishOnboarding(page, request);
  // Another program on a port (one per project: they run at the same time).
  const held = 19443 + (info.project.name === 'first-run' ? 0 : 1);
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(held, resolve));
  try {
    await page.goto('/settings/network');
    const home = page.getByRole('group', { name: 'Home network' });
    await home.getByRole('button', { name: 'Change', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Change web ports' });
    await dialog.getByLabel('HTTPS port').fill(String(held));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(`Port ${held} is already in use by another program.`)).toBeVisible();

    const free = held + 100;
    await dialog.getByLabel('HTTPS port').fill(String(free));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(home.getByText(new RegExp(`HTTPS ${free}`))).toBeVisible();
  } finally {
    server.close();
  }
});
