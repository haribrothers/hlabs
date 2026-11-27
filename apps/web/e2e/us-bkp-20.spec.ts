// Phase 5 "Done when" (US-BKP-05, US-BKP-19…21) with the real engine and restic: Vaultwarden and Paperless-ngx
// install, a backup copies them to the pretend NAS, their data is wiped, and a restore brings it back with both
// apps running again. Serial: it installs real apps and changes the pretend NAS.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addNasDestination, ADMIN_PASSWORD, cleanBackups, DATA_DIR } from './backups';
import { MAIN_URL } from './instances';

const APPS = [
  { id: 'vaultwarden', name: 'Vaultwarden' },
  { id: 'paperless-ngx', name: 'Paperless-ngx' },
];
const marker = (id: string) => join(DATA_DIR, 'app-data', id, 'hlabs-e2e-marker.txt');
/**
 * SQL in Paperless's database, whose folder is Postgres's own user's (0700), which hlabs's user can't read on Linux:
 * what's in it shows the backup read it and the restore gave it back to Postgres (D-190).
 */
function psql(sql: string): string {
  const id = execFileSync('docker', [
    'ps',
    '-q',
    '--filter',
    'label=com.docker.compose.project=hlabs-e2e-paperless-ngx',
    '--filter',
    'label=com.docker.compose.service=db',
  ])
    .toString()
    .trim();
  return execFileSync('docker', ['exec', id, 'psql', '-U', 'paperless', '-d', 'paperless', '-tAc', sql])
    .toString()
    .trim();
}

async function removeApps(request: APIRequestContext) {
  for (const app of APPS) await request.post(`${MAIN_URL}/dev/remove-app`, { data: { id: app.id } });
}

async function install(page: Page, id: string) {
  await page.goto(`/store/app/${id}?install=true`);
  await page.getByRole('dialog').getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible({ timeout: 10 * 60_000 });
}

test('Phase 5: back up Vaultwarden and Paperless, wipe their data, restore it, both run again', async ({
  page,
  request,
}) => {
  test.setTimeout(30 * 60_000);
  await removeApps(request);
  await cleanBackups(page, request);
  await request.post(`${MAIN_URL}/dev/admin-password`, { data: { password: ADMIN_PASSWORD } });
  try {
    for (const app of APPS) await install(page, app.id);
    for (const app of APPS) writeFileSync(marker(app.id), `${app.id} before`);
    psql("CREATE TABLE hlabs_e2e_marker (note text); INSERT INTO hlabs_e2e_marker VALUES ('before backup')");

    await page.goto('/settings/backups');
    const dialog = await addNasDestination(page);
    await dialog.getByRole('button', { name: 'Add destination' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Back up now' }).click();
    await expect(page.getByRole('button', { name: /^Backing up… \d+%$/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Back up now' })).toBeEnabled({ timeout: 10 * 60_000 });
    await expect(page.getByRole('region', { name: 'Last backup just now' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Recent runs' })).toContainText('Succeeded');

    // Wiped: what the apps keep is gone.
    for (const app of APPS) writeFileSync(marker(app.id), 'wiped');

    await page.getByRole('button', { name: 'Restore…' }).click();
    const step2 = page.getByRole('dialog', { name: /Choose what to restore/ });
    for (const app of APPS) await step2.getByRole('checkbox', { name: app.name }).check({ timeout: 60_000 });
    await step2.getByRole('button', { name: 'Restore', exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: /^Replace 2 items with/ });
    await confirm.getByLabel('Your password').fill(ADMIN_PASSWORD);
    await confirm.getByRole('button', { name: 'Replace data' }).click();
    const progress = page.getByRole('dialog', { name: /Restoring 2 items|2 items restored/ });
    await expect(progress).toContainText('Step 3 of 3');
    await expect(page.getByRole('dialog', { name: /2 items restored/ })).toBeVisible({ timeout: 10 * 60_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    for (const app of APPS) expect(readFileSync(marker(app.id), 'utf8')).toBe(`${app.id} before`);
    for (const app of APPS) {
      await page.goto(`/store/app/${app.id}`);
      await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible({ timeout: 3 * 60_000 });
    }
    // The database is the one backed up, not a new empty one Postgres made when its folder came back empty.
    await expect
      .poll(
        () => {
          try {
            return psql('SELECT note FROM hlabs_e2e_marker');
          } catch (error) {
            // Starting, or the table isn't there (a new, empty database): psql's own words.
            return String((error as { stderr?: Buffer }).stderr ?? error).trim();
          }
        },
        { timeout: 60_000 },
      )
      .toBe('before backup');
  } finally {
    await cleanBackups(page, request).catch(() => {});
    await removeApps(request);
  }
});
