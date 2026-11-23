// US-STORE-18 · See and manage app sources, US-STORE-19 · Add a source (an unsigned folder library), US-STORE-27 · a
// library's broken app with file and line, and US-STORE-29 · Copy a built-in app into my library, on the main instance
// (admin) and its real disk. Each project uses a library folder of its own in the admin's Home.
import { expect, test } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homeFolder } from './files';

const STORE = resolve(import.meta.dirname, '../../../store/apps');

test('US-STORE-18 the sources, adding a folder library, its problems, Copy to my library, and Remove', async ({
  page,
}, info) => {
  const lib = await homeFolder(page, `e2e-lib-${info.project.name}`);
  const name = `E2e lib ${info.project.name}`;
  const copyId = `uptime-kuma-${info.project.name}`;
  const libApp = `kuma-lib-${info.project.name}`;
  cpSync(join(STORE, 'uptime-kuma'), join(lib.dir, 'apps', libApp), { recursive: true });
  const manifest = join(lib.dir, 'apps', libApp, 'hlabs-app.yml');
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/^id: .*$/m, `id: ${libApp}`));
  // A broken app: host networking.
  mkdirSync(join(lib.dir, 'apps', 'broken'), { recursive: true });
  writeFileSync(
    join(lib.dir, 'apps', 'broken', 'hlabs-app.yml'),
    readFileSync(join(STORE, 'uptime-kuma', 'hlabs-app.yml'), 'utf8').replace(/^id: .*$/m, 'id: broken'),
  );
  writeFileSync(
    join(lib.dir, 'apps', 'broken', 'docker-compose.yml'),
    'services:\n  app:\n    image: busybox:1.36\n    network_mode: host\n',
  );

  try {
    await page.goto('/store/sources');
    // The window's heading (a phone's large title, D-172).
    await expect(page.getByRole('heading', { name: 'App sources' }).first()).toBeVisible();
    const builtin = page.getByRole('listitem').filter({ hasText: 'hlabs official' });
    await expect(builtin).toContainText(/Built in · \d+ apps · checked/);
    await expect(builtin.getByText("Can't be removed")).toBeVisible();

    // Add the folder library: unsigned, so the trust dialog warns and still allows it.
    await page.getByRole('radio', { name: 'Folder on this computer' }).click();
    await page.getByPlaceholder('~/hlabs/users/you/my-apps').fill(lib.dir);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const trust = page.getByRole('dialog', { name: 'Trust this source?' });
    await expect(trust).toContainText(name);
    await expect(trust).toContainText("This source isn't signed. Updates can't be verified.");
    await trust.getByRole('button', { name: 'Add source' }).click();
    await expect(trust).toBeHidden();

    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row.getByText('Not signed')).toBeVisible();
    await expect(row).toContainText('1 app has a problem');
    await expect(row).toContainText('apps/broken/docker-compose.yml');
    await expect(row.getByRole('button', { name: 'Open folder' })).toBeVisible();
    if (process.env.HLABS_SHOTS)
      await page.screenshot({
        path: `${process.env.HLABS_SHOTS}/store-sources-${info.project.name}.png`,
        fullPage: true,
      });

    // Its good app is in the App Store, from this library.
    await page.goto(`/store/app/${libApp}`);
    await expect(page.getByText(`From ${name}`)).toBeVisible();
    await expect(page.getByText('Not signed', { exact: true })).toBeVisible();

    // Copy a built-in app into the library: it lands in the folder and its page opens.
    await page.goto('/store/app/uptime-kuma');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Copy to my library…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copy Uptime Kuma to your library' });
    await dialog.getByRole('radio', { name: new RegExp(name) }).check();
    await dialog.getByRole('textbox', { name: 'Name' }).fill(copyId);
    if (process.env.HLABS_SHOTS)
      await page.screenshot({ path: `${process.env.HLABS_SHOTS}/copy-to-library-${info.project.name}.png` });
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/store/app/${copyId}$`));
    await expect(page.getByText(`From ${name}`)).toBeVisible();
    expect(existsSync(join(lib.dir, 'apps', copyId, 'hlabs-app.yml'))).toBe(true);
    expect(existsSync(join(lib.dir, 'apps', copyId, 'docker-compose.yml'))).toBe(true);

    // Remove asks first.
    await page.goto('/store/sources');
    await row.getByRole('button', { name: `Remove ${name}` }).click();
    const confirm = page.getByRole('alertdialog', { name: `Remove ${name}?` });
    await expect(confirm).toContainText('Apps you installed from it stay installed and keep working');
    await confirm.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toHaveCount(0);
    await page.goto(`/store/app/${copyId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Uptime Kuma' })).toHaveCount(0);
  } finally {
    // A failed run leaves the source behind: remove it through the API so the next run starts clean.
    await page.evaluate(async (n) => {
      const list = (await (await fetch('/trpc/store.sources.list')).json()) as {
        result?: { data: { sources: Array<{ id: string; name: string }> } };
      };
      const s = list.result?.data.sources.find((x) => x.name === n);
      if (!s) return;
      const me = (await (await fetch('/trpc/auth.me')).json()) as { result?: { data: { csrfToken: string } } };
      const csrf = me.result?.data.csrfToken ?? '';
      await fetch('/trpc/store.sources.remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hlabs-csrf': csrf },
        body: JSON.stringify({ sourceId: s.id }),
      });
    }, name);
    lib.remove();
  }
});
