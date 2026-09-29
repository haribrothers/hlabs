// US-SYS-19 · Set resources given to apps (first-run instance). The engine is whatever this machine has: OrbStack or
// Docker Desktop shows read-only values, hlabs's Colima sliders, Linux no section.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-19 resources for apps match the engine in use', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/engine');
  await expect(page.getByRole('group', { name: 'Container engine' })).toBeVisible();
  const resources = page.getByRole('group', { name: /^Resources for apps/ });
  const names = (await page.getByRole('group', { name: 'Container engine' }).innerText()).toLowerCase();
  if (process.platform === 'linux') {
    await expect(resources).toHaveCount(0);
  } else if (/colima, in use/.test(names)) {
    await expect(resources.getByRole('slider', { name: 'CPU cores' })).toBeVisible();
  } else if (/in use/.test(names)) {
    await expect(resources.getByText(/^Change this in .+'s settings$/)).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
