// US-HOME-15 · A member with nothing shared yet sees "No apps yet" and whom to ask (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-HOME-15 a member with no apps shared sees "No apps yet" and whom to ask, with no button', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Ravi', apps: [] });
  const home = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);
  await expect(home.getByRole('heading', { level: 1, name: 'Welcome to hlabs, Ravi' })).toBeVisible();
  const empty = home.getByRole('region', { name: 'No apps yet' });
  await expect(empty).toContainText(/Ask .+ to share an app with you\./);
  await expect(empty.getByRole('link')).toHaveCount(0);
  if (process.env.HLABS_SHOTS)
    await home.screenshot({ path: `${process.env.HLABS_SHOTS}/home-empty-member-${info.project.name}.png` });
  expect((await new AxeBuilder({ page: home }).analyze()).violations).toEqual([]);
});
