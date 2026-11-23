// US-FILE-09 · Pause, resume and cancel uploads (main instance, admin). Phase 5 "Done when": an upload resumes after a
// dropped connection: its first chunks fail with no answer and it carries on from the server's offset.
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { folderAction, homeFolder } from './files';

test('US-FILE-09 an upload whose connection drops carries on and finishes with every byte', async ({ page }, info) => {
  const f = await homeFolder(page, `Resume ${info.project.name}`);
  // 20 MB: three chunks. The first two attempts at the second chunk get no answer.
  const content = Buffer.alloc(20 * 1024 * 1024, 7);
  content.write('start', 0);
  content.write('end', content.length - 3);
  let patches = 0;
  await page.route('**/api/files/upload/*', async (route) => {
    if (route.request().method() === 'PATCH' && ++patches >= 2 && patches <= 3) return route.abort('connectionreset');
    return route.continue();
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const chooser = page.waitForEvent('filechooser');
    await (await folderAction(page, info.project.name === 'phone', 'Upload')).click();
    await (await chooser).setFiles([{ name: 'Home video.mov', mimeType: 'video/quicktime', buffer: content }]);
    await expect(
      page.getByRole('region', { name: 'Uploads' }).getByRole('heading', { name: '1 file uploaded' }),
    ).toBeVisible({
      timeout: 30_000,
    });
    expect(patches).toBe(5);
    expect(readFileSync(join(f.dir, 'Home video.mov')).equals(content)).toBe(true);
  } finally {
    f.remove();
  }
});

test('US-FILE-09 Pause stops sending, Resume carries on, Cancel all removes what is unfinished', async ({
  page,
}, info) => {
  const f = await homeFolder(page, `Pause ${info.project.name}`);
  const big = Buffer.alloc(24 * 1024 * 1024, 1);
  // Each chunk takes a moment, so there's time to pause.
  await page.route('**/api/files/upload/*', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 400));
    return route.continue();
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const chooser = page.waitForEvent('filechooser');
    await (await folderAction(page, info.project.name === 'phone', 'Upload')).click();
    await (
      await chooser
    ).setFiles([
      { name: 'big.bin', mimeType: 'application/octet-stream', buffer: big },
      { name: 'later.bin', mimeType: 'application/octet-stream', buffer: big },
    ]);
    const panel = page.getByRole('region', { name: 'Uploads' });
    await panel.getByRole('button', { name: 'Pause' }).click();
    await expect(panel.getByRole('button', { name: 'Resume' })).toBeVisible();
    await panel.getByRole('button', { name: 'Resume' }).click();
    await expect(panel.getByText('Done')).toBeVisible({ timeout: 30_000 });
    await panel.getByRole('button', { name: 'Cancel all' }).click();
    await expect(panel).toBeHidden();
    // The finished file stays; the other's partial file is gone.
    expect(readFileSync(join(f.dir, 'big.bin')).length).toBe(big.length);
    await expect.poll(() => readdirSync(f.dir)).toEqual(['big.bin']);
  } finally {
    f.remove();
  }
});
