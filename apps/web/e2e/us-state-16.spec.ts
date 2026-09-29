// US-STATE-16 · Notifications toast in every open session, repeats update one toast, and dismissing in one session
// marks it read and clears it from the others. Two sessions of the main instance's admin; /dev/notify raises it.
import { expect, test, type Page } from '@playwright/test';

const streamWithNotifications = (page: Page) =>
  page.waitForResponse(
    (r) => r.url().includes('events.stream') && decodeURIComponent(r.url()).includes('notification.created'),
  );

test('US-STATE-16 a notification reaches both sessions; dismissing in one marks it read and clears the other', async ({
  page,
  browser,
  request,
}) => {
  const other = await (await browser.newContext()).newPage();
  await other.goto('/dev/sign-in');

  const connected = [streamWithNotifications(page), streamWithNotifications(other)];
  await page.goto('/');
  await other.goto('/');
  await Promise.all(connected);

  // Unique per run: the desktop and phone runs share this admin, so each sees the other's notifications.
  const target = `kuma-${test.info().project.name}-${Date.now()}`;
  const notify = (title: string) =>
    request.post('/dev/notify', {
      data: {
        kind: 'app.startFailed',
        target,
        severity: 'critical',
        title,
        body: 'Port 3001 is already in use by another program.',
      },
    });
  const toastIn = (p: Page) => p.getByRole('alert').filter({ hasText: target });
  // The stream's headers arrive a moment before the daemon starts listening, so the first one can land in that gap;
  // sending it again is safe, since a repeat updates the same toast.
  await expect(async () => {
    await notify(`Uptime Kuma couldn't start (${target})`);
    await expect(toastIn(page)).toHaveCount(1, { timeout: 1_000 });
    await expect(toastIn(other)).toHaveCount(1, { timeout: 1_000 });
  }).toPass();

  // The same kind and target again: the toast updates instead of stacking.
  const { notificationId } = (await (await notify(`Uptime Kuma couldn't start again (${target})`)).json()) as {
    notificationId: string;
  };
  await expect(toastIn(page)).toHaveText(/Uptime Kuma couldn't start again/);
  await expect(toastIn(page)).toHaveCount(1);
  await expect(toastIn(other)).toHaveText(/Uptime Kuma couldn't start again/);

  await toastIn(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(toastIn(page)).toHaveCount(0);
  await expect(toastIn(other)).toHaveCount(0, { timeout: 2_000 });

  // Still in the list, as read.
  const list = await request.get(`/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`);
  const items = ((await list.json()) as { result: { data: { items: Array<{ id: string; readAt: number | null }> } } })
    .result.data.items;
  expect(items.find((n) => n.id === notificationId)?.readAt).not.toBeNull();
  await other.context().close();
});
