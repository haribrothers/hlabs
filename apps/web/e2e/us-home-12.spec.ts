// US-HOME-12 · See my files and shared-apps summary (first-run instance: a member with two shared apps).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs, removeFakeApps } from './invites';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

// Other specs on this instance count its apps (the finish screen's starter apps).
test.afterEach(({ request }) => removeFakeApps(request, FIRST_RUN_URL, ['jelly-demo', 'photo-demo']));

test('US-HOME-12 a member sees My files and who shared their apps', async ({ page, request, browser }, info) => {
  await finishOnboarding(page, request);
  for (const [id, name] of [
    ['jelly-demo', 'Jelly demo'],
    ['photo-demo', 'Photo demo'],
  ])
    await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id, name } });
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu', apps: ['Jelly demo', 'Photo demo'] });
  const home = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);

  const widgets = home.getByRole('region', { name: 'Widgets' });
  await expect(widgets.getByRole('heading', { name: 'My files' })).toBeVisible();
  // A new Home folder is empty: 0 B once it has been counted.
  await expect(widgets.getByText('in your Home folder')).toBeVisible({ timeout: 10_000 });
  await expect(widgets.getByRole('heading', { name: `Shared with you by ${ADMIN.name}` })).toBeVisible();
  await expect(widgets.getByText('2 apps · all running')).toBeVisible();
  await expect(widgets.getByText(`Ask ${ADMIN.name} if you need another app`)).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await home.screenshot({ path: `${process.env.HLABS_SHOTS}/member-widgets-${info.project.name}.png` });
  expect((await new AxeBuilder({ page: home }).analyze()).violations).toEqual([]);
});
