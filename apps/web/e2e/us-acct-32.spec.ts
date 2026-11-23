// US-ACCT-32 · Choose a wallpaper (first-run instance: a fresh admin, so the main instance keeps its look).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

/** A real 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('US-ACCT-32 pick Ocean, upload my own photo, and a file that is not a photo says so', async ({
  page,
  request,
}, info) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/appearance');
  await expect(page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible();
  const wallpapers = page.getByRole('group', { name: 'Wallpaper' });
  const wallpaper = page.getByTestId('wallpaper');
  await expect(wallpapers.getByRole('button', { name: 'Dusk' })).toHaveAttribute('aria-pressed', 'true');
  // On a phone the tile shows a photo glyph instead of the words (US-PHONE-28).
  if (!info.project.name.includes('phone'))
    await expect(wallpapers.getByRole('button', { name: 'Upload photo' })).toContainText('+ Upload photo');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A thumbnail changes the wallpaper behind the window at once, and it's kept for the account.
  await wallpapers.getByRole('button', { name: 'Ocean' }).click();
  await expect(wallpaper).toHaveClass(/hl-wall-ocean/);
  await expect(wallpapers.getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByTestId('wallpaper')).toHaveClass(/hl-wall-ocean/);

  // A file that only says it's a PNG: refused by its bytes, the wallpaper stays.
  await page
    .getByTestId('wallpaper-file')
    .setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not a photo') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPEG, PNG or WebP under 10 MB' })).toBeVisible();
  await expect(page.getByTestId('wallpaper')).toHaveClass(/hl-wall-ocean/);

  // A real photo: "Your own" appears, selected, and is drawn behind everything.
  await page.getByTestId('wallpaper-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  const own = wallpapers.getByRole('button', { name: 'Your own' });
  await expect(own).toHaveAttribute('aria-pressed', 'true');
  await expect(wallpapers.getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('wallpaper')).toHaveClass(/hl-wall-custom/);
  const url = await page
    .getByTestId('wallpaper')
    .evaluate((el) => /url\("([^"]+)"\)/.exec(el.style.getPropertyValue('--hl-wall-image'))?.[1] ?? '');
  expect(url).toMatch(/^\/api\/appearance\/wallpaper\?v=\d+$/);
  // The browser fetches it with the session (only the owner gets it: unit-tested in the daemon).
  const image = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, type: r.headers.get('content-type') };
  }, url);
  expect(image).toEqual({ status: 200, type: 'image/png' });
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/settings-appearance-${info.project.name}.png` });

  // Home shows it too.
  await page.goto('/');
  await expect(page.getByTestId('wallpaper')).toHaveClass(/hl-wall-custom/);
});
