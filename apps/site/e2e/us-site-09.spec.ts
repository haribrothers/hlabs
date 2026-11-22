// US-SITE-09 · Fix a problem from an error message.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const ISSUE = 'https://github.com/haribrothers/hlabs/issues/new?template=bug_report.yml';

// A page for each system state in 11-system-states.
const STATES = [
  { state: 'the container engine stopped', path: '/help/troubleshooting/engine-stopped/' },
  { state: "hlabs isn't running", path: '/help/get-started/cant-reach/' },
  { state: 'an update rolled back', path: '/help/troubleshooting/update-rolled-back/' },
  { state: "the certificate isn't trusted", path: '/help/troubleshooting/certificate/' },
  { state: 'a port is in use', path: '/help/troubleshooting/port-in-use/' },
  { state: 'the disk is full', path: '/help/troubleshooting/disk-full/' },
  { state: "the NAS can't be reached", path: '/help/troubleshooting/nas-unreachable/' },
];

const errors = JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/data/errors.json'), 'utf8')) as Array<{
  code: string;
  slug: string;
  title: string;
}>;

test.describe('US-SITE-09', () => {
  test('Troubleshooting lists a page for each system state, and the error messages', async ({ page }) => {
    await page.goto('/help/');
    const group = page.getByRole('navigation', { name: 'Main' }).locator('details', { hasText: 'Troubleshooting' });
    const hrefs = await group.getByRole('link').evaluateAll((links) => links.map((l) => l.getAttribute('href')));
    for (const { path } of STATES) expect(hrefs).toContain(path);
    expect(hrefs).toContain('/help/errors/');
  });

  for (const { state, path } of STATES) {
    test(`when ${state}: what it means, what to try in order, diagnostics, and "Still stuck?" last`, async ({
      page,
    }) => {
      await page.goto(path);
      const content = page.locator('.sl-markdown-content');
      // What it means: the page starts by saying it, after who it's for.
      expect((await content.locator(':scope > p').nth(1).textContent())?.length).toBeGreaterThan(40);
      const headings = (await content.locator('h2').allTextContents()).map((h) => h.trim());
      expect(headings).toContain('What to try, in order');
      // Each heading sits in a wrapper of its own (Starlight's anchor links): the list follows that.
      const after = (heading: string, list: string) =>
        content.locator(`xpath=.//h2[normalize-space()="${heading}"]/parent::*/following::${list}[1]`);
      await expect(after('What to try, in order', 'ol')).toBeVisible();
      expect(headings.slice(-2)).toEqual(['Collect diagnostics', 'Still stuck?']);
      const diagnostics = after('Collect diagnostics', 'ul');
      await expect(diagnostics).toContainText('Copy diagnostics');
      await expect(diagnostics).toContainText('hlabs logs');
      await expect(content.getByRole('link', { name: 'open an issue on GitHub' })).toHaveAttribute('href', ISSUE);
    });
  }

  test('every error code the dashboard can show has its page, with the dashboard’s words', async ({ page }) => {
    await page.goto('/help/errors/');
    const listed = await page
      .locator('.sl-markdown-content li a')
      .evaluateAll((links) => links.map((l) => l.getAttribute('href')));
    expect([...listed].sort()).toEqual(errors.map((e) => `/help/errors/${e.slug}/`).sort());

    const port = errors.find((e) => e.code === 'APP_PORT_IN_USE')!;
    await page.goto(`/help/errors/${port.slug}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(port.title);
    await expect(page.getByText(port.code, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Still stuck?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open an issue on GitHub' })).toHaveAttribute('href', ISSUE);
  });
});
