// US-PHONE-28 · Settings pages on the phone in the new design (main instance, admin, phone project): each page is
// one you go into with "‹ Settings" over its large title, inset lists with values and chevrons, and its dialogs as
// sheets — Edit in Account's bar, Users' ••• sheet and Invite as a sheet with a segmented role, Engine's card,
// Advanced's rows you tap. Nothing is changed for good: every sheet is closed or cancelled.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectTouchTarget, phoneOnly } from './phone';

/** The page you went into: "‹ Settings" and its large title. */
async function expectPage(page: Page, title: string) {
  await expect(page.getByRole('heading', { level: 1, name: title })).toHaveClass(/hl-p-large/);
  await expect(page.locator('.hl-p-nav').getByRole('button', { name: 'Settings' })).toBeVisible();
}

test('US-PHONE-28 Account: Edit in the bar opens the profile sheet; Security rows open their sheets', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/settings/account');
  await expectPage(page, 'Account');
  const edit = page.getByRole('button', { name: 'Edit profile' });
  await expect(edit).toHaveText('Edit');
  await expectTouchTarget(edit);
  await edit.click();
  const sheet = page.getByRole('dialog', { name: 'Edit profile' });
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
  const security = page.getByRole('group', { name: 'Security' });
  const password = security.getByRole('button', { name: 'Change password' });
  await expect(password.locator('.hl-p-chev')).toBeVisible();
  await expectTouchTarget(password);
  await password.click();
  await expect(page.getByRole('dialog', { name: 'Change password' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('US-PHONE-28 Users: a person’s ••• sheet lists their actions; Invite someone is a sheet with a segmented role', async ({
  page,
}, info) => {
  phoneOnly(info);
  // A member of our own in the list (the answer is changed in the browser; nobody is added).
  await page.route('**/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    const paths = url.pathname.replace(/^\/trpc\//, '').split(',');
    if (!paths.includes('users.list')) return route.continue();
    const res = await route.fetch();
    const body = (await res.json()) as Array<{ result: { data: { users: unknown[] } } }>;
    body[paths.indexOf('users.list')]!.result.data.users.push({
      id: 'phone-28',
      username: 'meera',
      displayName: 'Meera',
      role: 'member',
      avatarColor: 'rose',
      totpEnabled: true,
      lastActiveAt: Date.now() - 86_400_000,
      disabled: false,
      appCount: 2,
    });
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/settings/users');
  await expectPage(page, 'Users');
  const more = page.getByRole('button', { name: 'More options for Meera' });
  await expectTouchTarget(more);
  await more.click();
  const sheet = page.getByRole('dialog', { name: 'Meera' });
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  await expect(sheet.getByText('@meera · Member · 2 apps')).toBeVisible();
  for (const action of ['Apps access', 'Reset password…', 'Make admin', 'Disable', 'Delete…'])
    await expect(sheet.getByRole('button', { name: action })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // The person-plus in the bar; closing without copying the link takes the invite back (US-ACCT-21).
  await page.locator('.hl-p-nav').getByRole('button', { name: 'Invite someone' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite someone' });
  await expect(invite.getByRole('textbox', { name: 'Invite link' })).toHaveValue(/\/invite\//);
  const bar = invite.locator('.hl-sheet-bar');
  await expect(bar.getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Done' })).toBeEnabled();
  await expect(invite.getByRole('button', { name: 'Copy link' })).toBeVisible();
  const role = invite.getByRole('radiogroup', { name: 'Role' });
  await expect(role.getByRole('radio', { name: 'Member' })).toHaveAttribute('aria-checked', 'true');
  await role.getByRole('radio', { name: 'Admin' }).click();
  await expect(invite.getByText('Can change everything')).toBeVisible();
  await bar.getByRole('button', { name: 'Close' }).click();
  await expect(invite).toBeHidden();
});

test('US-PHONE-28 Engine, Network and Advanced: the state card, rows with values, rows you tap', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/settings/engine');
  await expectPage(page, 'Engine & startup');
  await expect(page.locator('.hl-p-card').getByRole('status')).toBeVisible();

  await page.goto('/settings/network');
  await expectPage(page, 'Network & remote access');
  const home = page.getByRole('group', { name: 'Home network' });
  await home.getByRole('button', { name: 'Change web ports' }).click();
  const ports = page.getByRole('dialog');
  await expect(ports.locator('.hl-sheet-handle')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ports).toBeHidden();

  await page.goto('/settings/advanced');
  await expectPage(page, 'Advanced');
  const troubleshooting = page.getByRole('group', { name: 'Troubleshooting' });
  await expect(troubleshooting.locator('.hl-p-sq')).toHaveCount(3);
  await troubleshooting.getByRole('button', { name: 'View hlabs logs' }).click();
  await expect(page.getByRole('dialog', { name: 'hlabs logs' })).toBeVisible();
});

test('US-PHONE-28 Appearance: tall wallpaper tiles in a box, the colours named under their swatches', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/settings/appearance');
  await expectPage(page, 'Appearance');
  const picks = page.locator('.hl-wallpicks');
  const thumb = await picks.locator('.hl-wallpick-thumb').first().boundingBox();
  expect(thumb!.height).toBeGreaterThan(thumb!.width);
  const chosen = page.getByRole('radio', { checked: true });
  await expect(chosen.locator('.hl-swatch-name')).toBeVisible();
  await expectTouchTarget(chosen);
});
