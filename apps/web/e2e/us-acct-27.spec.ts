// US-ACCT-27 · Member sees a limited Settings (first-run instance: a member signed in on their own browser).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-27 a member sees their own sections, who manages the rest, and no admin pages', async ({
  page,
  request,
  browser,
  isMobile,
}, info) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  const anu = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);

  await anu.goto('/settings/account');
  await expect(anu.getByText(`Apps, users and system settings are managed by ${ADMIN.name} (admin).`)).toBeVisible();
  if (!isMobile) {
    const nav = anu.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav.getByRole('link')).toHaveText(['Account']);
  }
  if (process.env.HLABS_SHOTS)
    await anu.screenshot({ path: `${process.env.HLABS_SHOTS}/member-settings-${info.project.name}.png` });
  expect((await new AxeBuilder({ page: anu }).analyze()).violations).toEqual([]);

  await anu.goto('/settings/users');
  await expect(anu.getByRole('heading', { name: "You don't have access to this" })).toBeVisible();
  await expect(anu).toHaveURL(`${FIRST_RUN_URL}/settings/users`);
});
