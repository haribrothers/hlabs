// US-ACCT-13 · See everyone who uses hlabs (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-ACCT-13 Users lists people with my own row first and no actions on it', async ({ page }, info) => {
  await page.goto('/settings/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite someone' })).toBeVisible();
  const people = page.getByRole('group', { name: /^People · \d+$/ });
  const mine = people.locator('.hl-list-row').first();
  await expect(mine).toContainText('(you)');
  await expect(mine).toContainText('Admin');
  await expect(mine.getByRole('button')).toHaveCount(0);
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/users-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

const DAY = 86_400_000;
const FAKE: Record<string, (now: number) => unknown> = {
  'users.list': (now) => ({
    users: [
      {
        id: 'a',
        username: 'anu',
        displayName: 'Anu',
        role: 'member',
        avatarColor: 'mint',
        totpEnabled: true,
        lastActiveAt: now - DAY - 60_000,
        disabled: false,
        appCount: 4,
      },
      {
        id: 'r',
        username: 'ravi',
        displayName: 'Ravi',
        role: 'member',
        avatarColor: 'amber',
        totpEnabled: false,
        lastActiveAt: null,
        disabled: true,
        appCount: 1,
      },
    ],
  }),
  'invites.list': (now) => ({
    invites: [
      {
        id: 'i',
        role: 'member',
        displayName: null,
        createdAt: now - 60_000,
        expiresAt: now + 7 * DAY,
        url: 'https://hlabs.local/invite/x',
      },
    ],
  }),
};

test('US-ACCT-13 member, disabled and invite rows (lists answered with fixed people)', async ({ page }, info) => {
  // Keep the real admin row; add members and an invite to the same batched answer.
  await page.route('**/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    const paths = url.pathname.replace(/^\/trpc\//, '').split(',');
    if (!paths.some((p) => p in FAKE)) return route.continue();
    const res = await route.fetch();
    const body = (await res.json()) as Array<{ result: { data: Record<string, unknown[]> } }>;
    paths.forEach((p, i) => {
      if (p === 'users.list') body[i]!.result.data.users!.push(...(FAKE[p]!(Date.now()) as { users: unknown[] }).users);
      else if (p in FAKE) body[i] = { result: { data: FAKE[p]!(Date.now()) as Record<string, unknown[]> } };
    });
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/settings/users');
  const people = page.getByRole('group', { name: /^People · \d+$/ });
  await expect(people.getByText('@anu · 2FA on · last active yesterday · 4 apps')).toBeVisible();
  await expect(people.getByText('Disabled')).toBeVisible();
  await expect(people.getByText('Link created today · expires in 7 days · Member')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apps access' })).toHaveCount(2);
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/users-rows-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
