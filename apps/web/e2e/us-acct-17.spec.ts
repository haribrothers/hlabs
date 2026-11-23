// US-ACCT-17 · Manage pending invites (first-run instance: a fresh admin with one invite).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createInvite } from './invites';
import { finishOnboarding } from './onboarding';
import { peopleAction, peopleRow } from './people';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-17 copy the same link again, then revoke it: it leaves Users and stops working', async ({
  page,
  request,
  context,
  browserName,
}, info) => {
  await finishOnboarding(page, request);
  const path = await createInvite(page);
  const row = peopleRow(page.getByRole('group', { name: /^People/ }), 'Invite pending');
  await expect(row).toContainText('Link created today · expires in 7 days · Member');

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await peopleAction(page, info, row, 'Copy link');
    await expect(page.getByText('Link copied')).toBeVisible();
    expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname).toBe(path);
  }

  await peopleAction(page, info, row, 'Revoke');
  await page.getByRole('alertdialog', { name: 'Revoke this invite?' }).getByRole('button', { name: 'Revoke' }).click();
  // The revoke has finished (navigating away earlier would cancel it).
  await expect(page.getByText('Invite revoked')).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: "This invite doesn't work anymore" })).toBeVisible();
});
