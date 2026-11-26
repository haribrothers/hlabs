// US-PHONE-11 · App details on phone (main instance): "‹ App Store", the app beside its logo with Install under it,
// the chips, screenshots sideways at 85% with "Screenshot N" opening full-screen, and Version, Runs as and Needs
// access to; Open once installed.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, phoneOnly } from './phone';

test('US-PHONE-11 the details as PhoneAppDetails draws them', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/store/app/immich');
  await expect(page.getByRole('main').getByRole('button', { name: 'App Store' })).toBeVisible();
  const name = page.getByRole('heading', { level: 1, name: 'Immich' });
  await expect(name).toBeVisible();
  // The primary Install under the name and tagline, beside the logo (PhoneRedesignA_Details).
  const install = page.getByRole('main').getByRole('button', { name: 'Install', exact: true });
  await expect(install).toHaveClass(/hl-btn-primary/);
  expect((await box(install)).y).toBeGreaterThan((await box(name)).y);
  // The strip under the app: Version, Memory, Disk and Category (PhoneRedesignA_Details).
  const strip = page.getByLabel('At a glance');
  await expect(strip.locator('dt')).toHaveText(['Version', 'Memory', 'Disk', 'Category']);
  await expect(strip).toContainText(/Version\s*\d[\w.-]*\s*(Latest|Installed )/);
  await expect(strip).toContainText(/Memory\s*(\d+(\.\d)? GB\s*at least|—)/);
  await expect(strip).toContainText(/Disk\s*(\d+(\.\d)? GB\s*to start|—)/);
  await expect(strip).toContainText('Photos');
  // The platform chip shows on an ARM computer only, named for it: "Apple Silicon" on a Mac, "ARM64" on Linux.
  const platform = process.arch === 'arm64' ? [process.platform === 'darwin' ? 'Apple Silicon' : 'ARM64'] : [];
  for (const chip of ['Files & photos', ...platform, 'hlabs official'])
    await expect(page.getByText(chip, { exact: true })).toBeVisible();
  const facts = page.getByLabel('About this app');
  await expect(facts).toContainText('Version');
  await expect(facts).toContainText(/Runs as\s*\d+ containers?/);
  await expect(facts).toContainText('Needs access to');

  const shots = page.getByRole('region', { name: 'Screenshots' });
  if (await shots.count()) {
    const first = shots.getByAltText('Screenshot 1');
    await expect(first).toBeVisible();
    const viewport = page.viewportSize()!;
    const w = (await box(shots.getByRole('listitem').first())).width;
    expect(Math.abs(w - viewport.width * 0.85)).toBeLessThan(viewport.width * 0.1);
    await shots.getByRole('button', { name: 'Screenshot 1' }).click();
    await expect(page.getByRole('dialog', { name: /^Screenshot 1 of \d+$/ })).toBeVisible();
  }
});

test('US-PHONE-11 installed, the button is Open', async ({ page, request }, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'mealie', behind: '99.0.0', state: 'running' } });
  try {
    await page.goto('/store/app/mealie');
    await expect(page.getByRole('main').getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'mealie', remove: true } });
  }
});
