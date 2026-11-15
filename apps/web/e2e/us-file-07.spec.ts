// US-FILE-07 · Open a file with an app (main instance, admin): a running app that uses the file's folder shows under
// "Open with" in the preview and opens in a new tab. A dev-only stand-in app mounts the folder.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { homeFolder, username } from './files';
import { MAIN_URL } from './instances';

test('US-FILE-07 Open with lists the app that uses the folder and opens it in a new tab', async ({
  page,
  request,
}, info) => {
  const id = `photos-${info.project.name}`;
  const name = `Open with ${info.project.name}`;
  const f = await homeFolder(page, name, { 'beach.jpg': readFileSync('e2e/fixtures/photo.jpg') });
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id, name: 'Photo demo', mounts: [`users/${await username(page)}/${name}`] },
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const item = page.getByRole('button', { name: /^beach\.jpg, / });
    if (info.project.name === 'phone') await item.click();
    else await item.dblclick();
    const app = page.getByRole('dialog').getByRole('link', { name: 'Open in Photo demo' });
    await expect(app).toBeVisible();
    await expect(app).toHaveAttribute('target', '_blank');
    await expect(app).toHaveAttribute('href', new RegExp(`^https://${id}\\.`));
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
    f.remove();
  }
});
