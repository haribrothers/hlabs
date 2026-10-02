// US-SYS-01 · See how hlabs is reached on the home network (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const idFor = (project: string) => `net-demo-${project}`;

test.beforeAll(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: idFor(info.project.name), name: `Net demo ${info.project.name}` },
  });
});
test.afterAll(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: idFor(info.project.name), remove: true } });
});

test('US-SYS-01 the home network addresses and every app address', async ({ page }, info) => {
  await page.goto('/settings/network');
  await expect(page.getByRole('heading', { level: 1, name: 'Network & remote access' })).toBeVisible();
  const home = page.getByRole('group', { name: 'Home network' });
  await expect(home.getByText(/^hlabs\.local/)).toBeVisible();
  await expect(home.getByText(/hlabs\.home\.arpa · for devices that use your DNS server/)).toBeVisible();
  await expect(home.getByText(/^HTTP \d+ · HTTPS \d+/)).toBeVisible();
  const apps = page.getByRole('group', { name: 'App addresses' });
  await expect(apps.getByText(`Net demo ${info.project.name}`)).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/network-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
