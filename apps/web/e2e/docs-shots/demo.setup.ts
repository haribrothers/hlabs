// The docs screenshots' instance (US-SITE-11, D-177): setup's first two screens while it's fresh (for the install
// guides), then the demo data set (/dev/demo: Hari, Maya and Leo, the design canvas's apps, backups, usage and files)
// and Hari signed in for the specs in this folder.
import { expect, test as setup } from '@playwright/test';
import { DOCS_DAEMON_URL, DOCS_STORAGE_STATE } from '../instances';
import { docsShot } from '../support/docs-shot';
import { freezeClock } from './demo';

setup('US-SITE-11: setup screens, then the demo data set with Hari signed in', async ({ page, request }) => {
  await freezeClock(page, request);
  const { url } = (await (await request.get(`${DOCS_DAEMON_URL}/dev/setup-url`)).json()) as { url: string };
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Welcome to hlabs' })).toBeVisible();
  await docsShot(page, 'setup-welcome');

  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Checking this computer' })).toBeVisible();
  // Every check done: the pretend Mac passes them all.
  await expect(page.getByText('Available')).toBeVisible();
  await expect(page.getByText('612 GB')).toBeVisible();
  await docsShot(page, 'setup-system');

  const res = await request.post(`${DOCS_DAEMON_URL}/dev/demo`);
  expect(res.ok()).toBe(true);
  const seeded = (await res.json()) as { people: string[]; apps: string[] };
  expect(seeded.people).toEqual(['hari', 'maya', 'leo']);

  await page.goto('/dev/sign-in');
  await expect(page.getByRole('navigation', { name: 'Dock' })).toBeVisible();
  await page.context().storageState({ path: DOCS_STORAGE_STATE });
});
