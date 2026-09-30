// US-APP-01 · Open an app in a window (main instance, admin, desktop layout). A dev-only stand-in app that declares
// web.embed is running; its tile opens the window, which survives a reload and closes back to Home.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'window-demo';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-01 an embeddable app opens in the app window, which survives a reload and closes to Home', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'The app window is the desktop layout; phones are 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Window demo', embed: true } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Window demo' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}$`));
  const win = page.getByRole('region', { name: 'App window' });
  await expect(win.getByRole('heading', { level: 1, name: 'Window demo' })).toBeVisible();
  await expect(win.getByText('Running')).toBeVisible();
  await expect(win.getByText(`${ID}.hlabs.local`)).toBeVisible();
  await expect(win.locator('iframe')).toHaveAttribute('src', `https://${ID}.hlabs.local`);

  await page.reload();
  await expect(win.getByRole('heading', { level: 1, name: 'Window demo' })).toBeVisible();

  await win.getByRole('button', { name: 'Close app' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/`);
  await expect(page.getByRole('region', { name: 'App window' })).toHaveCount(0);
});
