// US-HOME-10 · Find apps, actions, store apps and settings in one list (main instance, admin, desktop; the dev server
// previews phase 2, D-092). A dev-only stand-in app and the real built-in store.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'search-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-HOME-10 one search finds the app, its actions, store apps and settings, and opens them', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'Search from the keyboard is the desktop layout');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Searchable demo' } });
  await page.goto('/');
  await page.getByRole('button', { name: /Search apps, files, settings/ }).click();
  const panel = page.getByRole('dialog', { name: 'Search' });
  const field = panel.getByRole('combobox', { name: 'Search' });

  await field.fill('searchable');
  await expect(panel.getByRole('group', { name: 'Installed' }).getByRole('option')).toHaveText([/Searchable demo/]);
  await expect(panel.getByRole('group', { name: 'Actions' }).getByRole('option')).toHaveText([
    'Searchable demo settings',
    'Restart Searchable demo',
    'View Searchable demo logs',
  ]);
  await field.press('ArrowDown');
  await field.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/settings$`));

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await field.fill('vaultwarden');
  await expect(panel.getByRole('group', { name: 'App Store' }).getByRole('option').first()).toContainText(
    'Vaultwarden',
  );
  await panel.getByRole('option', { name: 'See all App Store results' }).click();
  await expect(page).toHaveURL(/\/store\/search\?q=vaultwarden$/);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await field.fill('password');
  await panel.getByRole('option', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
});
