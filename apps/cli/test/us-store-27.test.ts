// US-STORE-27, 28 · `hlabs library`: init (README, apps/, example app, workflow) with how to add it in hlabs; add; check
// with file and line; index; keygen and sign through hlabs (the key stays in its keychain).
import { generateLibraryKey, signIndex, verifyIndex } from '@hlabs/app-manifest/node';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PretendHlabs } from './helpers';

const open: PretendHlabs[] = [];
afterEach(async () => {
  for (const h of open.splice(0)) await h.close();
});

async function hlabs(answers: Record<string, (input: unknown) => unknown> = {}) {
  const h = await new PretendHlabs().start(answers);
  open.push(h);
  return h;
}

const folder = () => join(mkdtempSync(join(tmpdir(), 'lib-')), 'my-apps');

describe('US-STORE-27 · hlabs library', () => {
  it('init starts a library and says how to add it in the App Store', async () => {
    const h = await hlabs();
    const dir = folder();
    const r = await h.cli(['library', 'init', dir]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Started My apps in ${dir}:`);
    expect(r.out).toContain('App Store › App sources › Add a source › Folder on this computer');
    for (const f of [
      'README.md',
      'apps/example-app/hlabs-app.yml',
      'apps/example-app/docker-compose.yml',
      '.github/workflows/hlabs-library.yml',
    ])
      expect(existsSync(join(dir, f))).toBe(true);
    expect((await h.cli(['library', 'check', dir])).out).toBe("✓ 1 app pass the App Store's checks.");
  });

  it('add, then check lists each problem with file and line and fails', async () => {
    const h = await hlabs();
    const dir = folder();
    await h.cli(['library', 'init', dir]);
    expect((await h.cli(['library', 'add', 'wiki', dir])).out).toMatch(/^Added apps\/wiki\/\./);
    writeFileSync(
      join(dir, 'apps/wiki/hlabs-app.yml'),
      readFileSync(join(dir, 'apps/example-app/hlabs-app.yml'), 'utf8').replace(/example-app/g, 'wiki'),
    );
    writeFileSync(
      join(dir, 'apps/wiki/docker-compose.yml'),
      'services:\n  web:\n    image: nginx:1.27\n    network_mode: host\n',
    );
    const r = await h.cli(['library', 'check', dir]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^apps\/wiki\/docker-compose\.yml:4 .*host network/im);
    expect(r.err).toContain('1 of 2 apps have problems.');
  });

  it('index writes index.json for the apps that pass and names the others', async () => {
    const h = await hlabs();
    const dir = folder();
    await h.cli(['library', 'init', dir]);
    await h.cli(['library', 'add', 'wiki', dir]);
    const r = await h.cli(['library', 'index', dir]);
    expect(r.out).toBe('Wrote index.json with 1 app.');
    expect(r.err).toBe('Left out until they pass hlabs library check: wiki.');
    expect(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).source).toEqual({
      id: 'my-apps',
      name: 'My apps',
    });
  });

  it("a folder that isn't empty isn't made a library", async () => {
    const h = await hlabs();
    const dir = folder();
    await h.cli(['library', 'init', dir]);
    const r = await h.cli(['library', 'init', dir]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("isn't empty");
  });
});

describe('US-STORE-28 · hlabs library keygen and sign', () => {
  it('keygen asks hlabs to make the key and prints its fingerprint', async () => {
    const h = await hlabs({
      'tray.libraryKeygen': () => ({ publicKey: 'x', fingerprint: 'B70D 7998 32CB 6AD2', existed: false }),
    });
    const r = await h.cli(['library', 'keygen']);
    expect(r.out).toContain('Made a signing key: B70D 7998 32CB 6AD2');
    expect(h.calls).toEqual([{ path: 'tray.libraryKeygen', input: { replace: false } }]);
    await h.cli(['library', 'keygen', '--replace']);
    expect(h.calls.at(-1)!.input).toEqual({ replace: true });
  });

  it('sign writes index.json.sig and the public key from what hlabs signed', async () => {
    const key = generateLibraryKey();
    const h = await hlabs({
      'tray.librarySign': (input) => ({
        signature: signIndex(Buffer.from((input as { data: string }).data, 'base64'), key),
        publicKey: key.publicKey,
        fingerprint: key.fingerprint,
      }),
    });
    const dir = folder();
    await h.cli(['library', 'init', dir]);
    expect((await h.cli(['library', 'sign', dir])).err).toContain('run hlabs library index first');
    await h.cli(['library', 'index', dir]);
    const r = await h.cli(['library', 'sign', dir]);
    expect(r.out).toContain(`Signed index.json with ${key.fingerprint}`);
    expect(
      verifyIndex(
        readFileSync(join(dir, 'index.json')),
        readFileSync(join(dir, 'index.json.sig'), 'utf8'),
        readFileSync(join(dir, 'hlabs-library.pub'), 'utf8'),
      ),
    ).toBe(true);
  });

  it('without a key, sign says how to make one', async () => {
    const h = await hlabs({
      'tray.librarySign': () => {
        throw { hlabsCode: 'LIBRARY_KEY_MISSING' };
      },
    });
    const dir = folder();
    await h.cli(['library', 'init', dir]);
    await h.cli(['library', 'index', dir]);
    const r = await h.cli(['library', 'sign', dir]);
    expect(r.code).toBe(1);
    expect(r.err).toBe('There is no signing key on this computer: make one with hlabs library keygen');
  });
});
