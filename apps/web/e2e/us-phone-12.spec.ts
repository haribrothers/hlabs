// US-PHONE-12 · Install an app from the phone (main instance, admin). No container is started: the install request is
// answered here with a job, and a dev stand-in moves the app through installing and a failed install, as a real job
// leaves it (the real installs are the serial project's, US-STORE-11…14). Install opens the bottom sheet; once a field
// changes a drag doesn't close it; Install closes it and the page stays, its button and the Home tile showing the
// progress; a failure comes back as a sheet with Try again.
import { expect, test, type Page } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, phoneOnly } from './phone';

// The tests share the app they install: one at a time.
test.describe.configure({ mode: 'serial' });

const APP = 'memos';

async function answerInstall(page: Page) {
  await page.route('**/trpc/apps.install**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ result: { data: { jobId: 'dev' } } }]) }),
  );
}

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: APP, remove: true } });
});

test('US-PHONE-12 the install sheet; changed, it stays put when dragged and Cancel closes it', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto(`/store/app/${APP}`);
  await page.getByRole('main').getByRole('button', { name: 'Install', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /^Install Memos/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  await expect(sheet).toContainText('Review what it can access');
  // Change a field, then drag it down hard.
  const address = sheet.getByRole('textbox').first();
  if (await address.count()) await address.fill('memos-phone');
  else await sheet.getByRole('switch').first().click();
  const b = await box(sheet);
  const handle = await box(sheet.locator('.hl-sheet-handle'));
  await page.mouse.move(handle.x + 10, handle.y + 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 10, handle.y + b.height * 0.7, { steps: 6 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
});

test('US-PHONE-12 Install closes the sheet, the page stays and shows progress; a failure comes back as a sheet', async ({
  page,
  request,
}, info) => {
  phoneOnly(info);
  await answerInstall(page);
  await page.goto(`/store/app/${APP}`);
  await page.getByRole('main').getByRole('button', { name: 'Install', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /^Install Memos/ });
  await sheet.getByRole('button', { name: 'Install', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(`${MAIN_URL}/store/app/${APP}`);

  // The job's progress, as app.installProgress brings it.
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: APP, name: 'Memos', state: 'installing', progress: 42 },
  });
  await expect(page.getByRole('main').getByRole('link', { name: /^Installing… \d+%$/ })).toBeVisible();

  // It fails.
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: APP, name: 'Memos', state: 'install_failed', stateDetail: { code: 'APP_PULL_FAILED', step: 'pull' } },
  });
  const failed = page.getByRole('alertdialog', { name: "Memos didn't install" });
  await expect(failed).toBeVisible();
  await expect(failed.locator('.hl-sheet-handle')).toBeVisible();
  await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
  await failed.getByRole('button', { name: 'See what went wrong' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/store/install/${APP}`);
});

test('US-PHONE-12 the Home tile shows the install progress', async ({ page, request }, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: APP, name: 'Memos', state: 'installing', progress: 30 },
  });
  await page.goto('/');
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: APP, name: 'Memos', state: 'installing', progress: 64 },
  });
  await expect(page.getByRole('button', { name: /^Memos, installing, \d+%$/ })).toBeVisible();
});
