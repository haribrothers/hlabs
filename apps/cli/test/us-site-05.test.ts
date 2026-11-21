// US-SITE-05 · Install on Linux with the command from the site. Here: the site only publishes the stable release's
// install.sh when it matches that release's SHA256SUMS, and `install.sh --channel beta` installs the beta channel's
// version. What the site serves is tested in apps/site/e2e/us-site-05.spec.ts.
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const SCRIPT = join(ROOT, 'scripts/install.sh');
const FIXTURE = join(ROOT, 'apps/site/e2e/fixtures/releases');

let dir: string;
let bin: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'us-site-05-'));
  bin = join(dir, 'bin');
  mkdirSync(bin);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fake(name: string, body: string) {
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}

/** Runs `code` after sourcing install.sh, with the pretend commands first on PATH. */
function sh(code: string) {
  const r = spawnSync('/bin/sh', ['-c', `. "${SCRIPT}"; LOG="${dir}/install.log"; ${code}`], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HLABS_INSTALL_LIB: '1' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

/** scripts/site-releases.ts with a release fixture, writing into this test's folder. */
function siteReleases(fixture: string) {
  const out = join(dir, 'out');
  const r = spawnSync('node', [join(ROOT, 'scripts/site-releases.ts')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '',
      HLABS_SITE_RELEASES_FIXTURE: fixture,
      HLABS_SITE_PUBLIC_DIR: join(out, 'public'),
      HLABS_SITE_RELEASES_JSON: join(out, 'releases.json'),
    },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, dir: out };
}

describe('US-SITE-05', () => {
  it("publishes the stable release's install.sh, its signature and its checksum", () => {
    const r = siteReleases(FIXTURE);
    expect(r.status).toBe(0);
    const script = readFileSync(join(FIXTURE, 'assets/v0.6.0/install.sh'), 'utf8');
    expect(readFileSync(join(r.dir, 'public/install.sh'), 'utf8')).toBe(script);
    expect(readFileSync(join(r.dir, 'public/install.sh.sig'), 'utf8')).toBe(
      readFileSync(join(FIXTURE, 'assets/v0.6.0/install.sh.sig'), 'utf8'),
    );
    expect(readFileSync(join(r.dir, 'public/install.sh.sha256'), 'utf8')).toMatch(/^[0-9a-f]{64} {2}install\.sh\n$/);
    expect(JSON.parse(readFileSync(join(r.dir, 'releases.json'), 'utf8')).installScript.version).toBe('0.6.0');
  });

  it("refuses an install.sh that doesn't match the release's SHA256SUMS", () => {
    const changed = join(dir, 'fixture');
    cpSync(FIXTURE, changed, { recursive: true });
    writeFileSync(join(changed, 'assets/v0.6.0/install.sh'), '#!/bin/sh\necho changed\n');
    const r = siteReleases(changed);
    expect(r.status).toBe(1);
    expect(r.err).toContain("install.sh in v0.6.0 doesn't match its SHA256SUMS");
    expect(existsSync(join(r.dir, 'public/install.sh'))).toBe(false);
  });

  it('reads --channel, stable unless asked', () => {
    expect(sh('read_channel; echo "$CHANNEL"').out.trim()).toBe('stable');
    expect(sh('read_channel --channel beta; echo "$CHANNEL"').out.trim()).toBe('beta');
    expect(sh('read_channel --channel=beta; echo "$CHANNEL"').out.trim()).toBe('beta');
    const wrong = sh('read_channel --channel nightly');
    expect(wrong.status).toBe(1);
    expect(wrong.err).toContain("✗ There's no nightly channel");
    expect(wrong.err).toContain('Use --channel stable or --channel beta');
  });

  it("--channel beta downloads the beta channel's version, named by its update manifest", () => {
    fake(
      'curl',
      [
        'url=""; for a in "$@"; do url="$a"; done',
        'echo "$url" >>"' + join(dir, 'urls') + '"',
        'case "$url" in',
        '  */download/beta/latest.json) printf \'{\\n  "version": "0.7.0-beta.1",\\n  "notes": "x"\\n}\\n\' ;;',
        '  *) exit 22 ;;',
        'esac',
      ].join('\n'),
    );
    const version = sh('beta_version');
    expect(version.out).toBe('0.7.0-beta.1');

    // fetch_release then asks that release for its SHA256SUMS (which this pretend GitHub doesn't have).
    const r = sh(`WORK="${dir}"; CHANNEL=beta; fetch_release`);
    expect(r.status).toBe(1);
    const urls = readFileSync(join(dir, 'urls'), 'utf8');
    expect(urls).toContain('https://github.com/haribrothers/hlabs/releases/download/beta/latest.json');
    expect(urls).toContain('https://github.com/haribrothers/hlabs/releases/download/v0.7.0-beta.1/SHA256SUMS');
    expect(urls).not.toContain('/latest/download/');
  });

  it("stops when the beta channel's version can't be read", () => {
    fake('curl', 'echo "<html>not json</html>"');
    const r = sh('beta_version');
    expect(r.status).toBe(1);
    expect(r.err).toContain("✗ The beta channel's version isn't one hlabs knows");
  });
});
