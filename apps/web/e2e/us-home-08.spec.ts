// US-HOME-08 · Recover a stopped or broken app from its tile (main instance, admin, desktop and phone). Dev-only
// stand-ins, one set per project since both run side by side; starting a real app is covered by other tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ids = (project: string) => ({ stopped: `recover-stopped-${project}`, broken: `recover-broken-${project}` });

test.afterEach(async ({ request }, info) => {
  for (const id of Object.values(ids(info.project.name))) {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
  }
});

test('US-HOME-08 a stopped tile offers Start; a broken one opens its logs with the reason', async ({
  page,
  request,
}, info) => {
  const project = info.project.name;
  const { stopped, broken } = ids(project);
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: stopped, name: `Sleepy ${project}`, state: 'stopped' },
  });
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: {
      id: broken,
      name: `Broken ${project}`,
      state: 'error',
      stateDetail: { code: 'APP_PORT_IN_USE', port: 3001, step: 'start' },
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: `Sleepy ${project}, stopped`, exact: true }).click();
  await expect(page.getByText(`Sleepy ${project} is stopped`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${MAIN_URL}/`);

  await page.getByRole('button', { name: `Broken ${project}, error`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${broken}/logs$`));
  await expect(page.getByRole('status').filter({ hasText: "isn't responding" })).toContainText('3001');
});
