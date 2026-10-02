// US-AUTH-24 · Create my account from an invite (first-run instance: its admin invites, a new browser joins).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createInvite } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-24 join from the link: signed in as the new member on Home; the link then stops working', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  const path = await createInvite(page, { name: 'Anu' });
  const guest = await (await browser.newContext({ ...info.project.use, baseURL: FIRST_RUN_URL })).newPage();
  await guest.goto(path);
  await expect(guest.getByLabel('Your name')).toHaveValue('Anu');
  await guest.getByLabel('Username').fill('hari');
  await guest.getByLabel('Password').fill('correct horse battery staple');
  await guest.getByRole('button', { name: 'Join hlabs' }).click();
  await expect(guest.getByText('That username is taken.')).toBeVisible();

  await guest.getByLabel('Username').fill('Anu');
  await expect(guest.getByLabel('Username')).toHaveValue('anu');
  await guest.getByRole('button', { name: 'Join hlabs' }).click();
  await expect(guest).toHaveURL(`${FIRST_RUN_URL}/`);
  const me = await guest.evaluate(
    async () =>
      ((await (await fetch('/trpc/auth.me')).json()) as { result: { data: { username: string; role: string } } }).result
        .data,
  );
  expect(me).toMatchObject({ username: 'anu', role: 'member' });
  expect(await guest.evaluate(() => JSON.parse(localStorage.getItem('hlabs.lastUser') ?? 'null'))).toMatchObject({
    username: 'anu',
  });

  // Used: the link now says so.
  await guest.goto(path);
  await expect(guest.getByRole('heading', { name: "This invite doesn't work anymore" })).toBeVisible();
});
