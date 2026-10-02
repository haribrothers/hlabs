// US-HOME-11 · See only my shared apps on a member Home (first-run instance: an admin shares two of three apps).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-HOME-11 a member sees a greeting and only the apps shared with them, nothing about the server', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  for (const [id, name] of [
    ['jelly-demo', 'Jelly demo'],
    ['photo-demo', 'Photo demo'],
    ['vault-demo', 'Vault demo'],
  ])
    await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id, name } });
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu', apps: ['Jelly demo', 'Photo demo'] });

  const home = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);
  await expect(home.getByRole('heading', { level: 1, name: /, Anu$/ })).toBeVisible();
  const grid = home.getByRole('list', { name: 'Apps' });
  await expect(grid.getByRole('listitem')).toHaveCount(2);
  await expect(grid.getByRole('button', { name: 'Open Jelly demo' })).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Open Photo demo' })).toBeVisible();
  await expect(grid.getByText('Install app')).toHaveCount(0);
  await expect(home.getByRole('region', { name: 'Storage' })).toHaveCount(0);
  if (process.env.HLABS_SHOTS)
    await home.screenshot({ path: `${process.env.HLABS_SHOTS}/member-home-${info.project.name}.png` });
  expect((await new AxeBuilder({ page: home }).analyze()).violations).toEqual([]);

  // An app that isn't shared isn't in their apps.list either.
  const ids = await home.evaluate(async () =>
    (
      (await (await fetch('/trpc/apps.list')).json()) as { result: { data: { apps: Array<{ id: string }> } } }
    ).result.data.apps.map((a) => a.id),
  );
  expect(ids.sort()).toEqual(['jelly-demo', 'photo-demo']);
});
