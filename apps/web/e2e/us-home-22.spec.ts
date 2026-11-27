// US-HOME-22 · Pinning apps to the Dock in a real browser (first-run instance): drag a tile from Home onto the Dock, add
// one from "+", and remove one from its menu.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { removeFakeApps } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });
const IDS = ['dock-jelly', 'dock-photos'];
test.afterEach(async ({ request, page }) => {
  // Skipped on phones: nothing was pinned, and the page never loaded.
  if (!page.url().startsWith('http')) return;
  await page.evaluate(async () => {
    const me = (await (await fetch('/trpc/auth.me')).json()) as { result: { data: { csrfToken: string } } };
    await fetch('/trpc/home.saveDock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hlabs-csrf': me.result.data.csrfToken },
      body: JSON.stringify({ appIds: [] }),
    });
  });
  await removeFakeApps(request, FIRST_RUN_URL, IDS);
});

test('US-HOME-22 drag an app onto the Dock, add one from +, remove one from its menu', async ({
  page,
  request,
  isMobile,
}, info) => {
  test.skip(isMobile, 'The Dock is for desktop; phones have the tab bar (D-054)');
  await finishOnboarding(page, request);
  await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id: 'dock-jelly', name: 'Jelly demo' } });
  await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id: 'dock-photos', name: 'Photo demo' } });
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Dock' });
  await expect(dock.getByRole('button', { name: 'Add to Dock' })).toBeVisible();

  // Drag from Home: the app stays on Home and is pinned.
  await page.locator('li[data-app="dock-jelly"]').dragTo(dock.getByRole('button', { name: 'Add to Dock' }));
  await expect(dock.getByRole('button', { name: 'Jelly demo' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Apps' }).getByRole('button', { name: 'Open Jelly demo' })).toBeVisible();

  // "+" lists what isn't pinned yet.
  await dock.getByRole('button', { name: 'Add to Dock' }).click();
  const pop = page.getByRole('dialog', { name: 'Add to Dock' });
  await expect(pop.getByText('Or drag an app from Home onto the Dock. Up to 8 apps.')).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/dock-add-${info.project.name}.png` });
  await pop.getByRole('button', { name: 'Add Photo demo to the Dock' }).click();
  await page.keyboard.press('Escape');
  await expect(dock.getByRole('button', { name: 'Photo demo' })).toBeVisible();

  // Its menu removes it; Home is unchanged.
  await dock.getByRole('button', { name: 'Jelly demo' }).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Jelly demo' });
  await expect(menu.getByRole('menuitem', { name: 'App settings' })).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/dock-menu-${info.project.name}.png` });
  await menu.getByRole('menuitem', { name: 'Remove from Dock' }).click();
  await expect(dock.getByRole('button', { name: 'Jelly demo' })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('navigation', { name: 'Dock' }).getByRole('button', { name: 'Photo demo' }),
  ).toBeVisible();
});
