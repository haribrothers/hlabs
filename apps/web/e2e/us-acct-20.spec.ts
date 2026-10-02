// US-ACCT-20 · Decide what members can do (first-run instance: an admin and a member, each in a browser).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-20 allowing installs gives members the App Store and an Install app tile', async ({
  page,
  request,
  browser,
  isMobile,
}, info) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });

  await page.goto('/settings/users');
  const group = page.getByRole('group', { name: 'What members can do' });
  const install = group.getByRole('switch', { name: 'Install apps from the App Store' });
  await expect(install).toHaveAttribute('aria-checked', 'false');
  await expect(group.getByRole('switch', { name: 'See live usage' })).toHaveAttribute('aria-checked', 'false');
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/users-policy-${info.project.name}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const anu = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);
  await expect(anu.getByRole('list', { name: 'Apps' }).getByText('Install app')).toHaveCount(0);

  await Promise.all([page.waitForResponse((r) => r.url().includes('users.updatePolicy')), install.click()]);
  await expect(install).toHaveAttribute('aria-checked', 'true');
  // Their open Home follows (access.changed): the tile, and the App Store in the Dock.
  await expect(anu.getByRole('list', { name: 'Apps' }).getByText('Install app')).toBeVisible();
  if (!isMobile) await expect(anu.getByRole('link', { name: 'App Store' })).toBeVisible();
});
