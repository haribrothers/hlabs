// US-SYS-17 · See the container engine (main instance, signed in as an admin). The engine is whatever this machine
// has, so the checks don't assume which one.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-17 Engine & startup shows the engine state and the engines on this computer', async ({ page }) => {
  await page.goto('/settings/engine');
  await expect(page.getByRole('heading', { level: 1, name: 'Engine & startup' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: /^(Engine running|Engine stopped|Starting…|No engine)$/ }),
  ).toBeVisible();
  const engines = page.getByRole('group', { name: 'Container engine' }).locator('.hl-list-row');
  await expect(engines.first()).toBeVisible();
  const names = await engines.allInnerTexts();
  expect(names.join(' ')).toMatch(/OrbStack|Docker Desktop|Colima|Docker Engine/);
  await expect(page.getByRole('button', { name: 'Switch…' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
