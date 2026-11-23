// US-ACCT-34 · Home screen options (first-run instance: a fresh admin, so the main instance keeps its Home).
import { expect, test, type Locator } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-34 turning off the widgets and the greeting takes them off Home', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await expect(page.getByRole('region', { name: 'Widgets' })).toBeVisible();
  // With no apps yet the greeting is the welcome; it's the same line.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveClass(/sr-only/);

  await page.goto('/settings/appearance');
  /** Switches it and waits until hlabs has saved it. */
  const flip = async (control: Locator) => {
    const saved = page.waitForResponse((r) => r.url().includes('settings.appearance.update'));
    await control.click();
    await saved;
  };
  const widgets = page.getByRole('switch', { name: 'Show widgets' });
  const greeting = page.getByRole('switch', { name: 'Show greeting' });
  await expect(widgets).toBeChecked();
  await expect(greeting).toBeChecked();
  await expect(page.getByText(`“Good evening, ${ADMIN.name}”`)).toBeVisible();

  await flip(widgets);
  await expect(widgets).not.toBeChecked();
  await flip(greeting);
  await expect(greeting).not.toBeChecked();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveClass(/sr-only/);
  await expect(page.getByRole('region', { name: 'Widgets' })).toHaveCount(0);
  // Still there after a reload: it's saved.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveClass(/sr-only/);
  await expect(page.getByRole('region', { name: 'Widgets' })).toHaveCount(0);

  // On again.
  await page.goto('/settings/appearance');
  await flip(page.getByRole('switch', { name: 'Show widgets' }));
  await flip(page.getByRole('switch', { name: 'Show greeting' }));
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Widgets' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveClass(/sr-only/);
});
