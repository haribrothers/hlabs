// Downloads the binaries hlabs bundles and checks each against a pinned checksum (03 §scripts, D-072): Caddy and
// the docker-compose CLI plugin. Development and CI use the same files as a release.
//
//   pnpm fetch-binaries                      # this computer's platform, into .bin/
//   pnpm fetch-binaries --target linux-x64 --out dist/bin
//
// restic and node join with their phases (backups, packaging). Bump a version by changing it and its checksums here.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type Target = 'mac-arm64' | 'mac-x64' | 'linux-arm64' | 'linux-x64';

interface Binary {
  name: string;
  version: string;
  url: (target: Target) => string;
  /** Pinned per target: `sha256:` or `sha512:` of the downloaded file. */
  checksums: Record<Target, string>;
  /** Tarballs: the file to take out. Plain downloads are the binary itself. */
  extract?: string;
}

const CADDY_VERSION = '2.11.4';
const COMPOSE_VERSION = '5.5.1';

const BINARIES: Binary[] = [
  {
    name: 'caddy',
    version: CADDY_VERSION,
    url: (t) => {
      const [os, arch] = t.split('-') as [string, string];
      return `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_${os}_${arch === 'x64' ? 'amd64' : 'arm64'}.tar.gz`;
    },
    extract: 'caddy',
    checksums: {
      'mac-arm64':
        'sha512:3190ae0df98b59ab4b6021556fa35adc3c526a4f3e138776b0eaec8a037cc26121cbbb1ad53453f565551b47d37d5ba4755e2c2c3652256737fe2ce9e53c8ec0',
      'mac-x64':
        'sha512:e04eb10f9ce7e2e079bc9bff1bd5d3a3164888d1edbb1a49e5d15be4eab691b57e89ed36bb29c65ba43f1ba8d9279e0967b1003991c13fe4cb78384c3caf25de',
      'linux-arm64':
        'sha512:d5a7c423853c24a799765e0e8210d5c7c22a8f56ed37a3cae2fb9f58be138853c02b4efd6b59d576e6d8c7c0d30b9c1592deeaa6a536ff69bcca23b8c1ea709c',
      'linux-x64':
        'sha512:8220d1f013b6f27510247b2360c9e0ca9f018feebd82515f07635318b34ff9777ccc8fd0b6e6f2486ce3a33fe389fbb7db12d05baa474f4587509fb4f5ebf1c9',
    },
  },
  {
    name: 'docker-compose',
    version: COMPOSE_VERSION,
    url: (t) => {
      const [os, arch] = t.split('-') as [string, string];
      return `https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-${os === 'mac' ? 'darwin' : 'linux'}-${arch === 'x64' ? 'x86_64' : 'aarch64'}`;
    },
    checksums: {
      'mac-arm64': 'sha256:998735c9b6fe68a4f05895e6ea73d71ad06f9fc7046383ad89e47346781b6af5',
      'mac-x64': 'sha256:a264d61e824bf08a78867e59cdf32eb09f0aee9ecdf9f6ebfa43f76dc52880f1',
      'linux-arm64': 'sha256:732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7',
      'linux-x64': 'sha256:db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576',
    },
  },
];

function currentTarget(): Target {
  const os = process.platform === 'darwin' ? 'mac' : process.platform === 'linux' ? 'linux' : null;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
  if (!os || !arch)
    throw new Error(`hlabs runs on macOS and Linux (arm64, x64), not ${process.platform}-${process.arch}`);
  return `${os}-${arch}`;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function verify(data: Buffer, expected: string, what: string) {
  const [algorithm, hex] = expected.split(':') as ['sha256' | 'sha512', string];
  const actual = createHash(algorithm).update(data).digest('hex');
  if (actual !== hex) throw new Error(`${what}: ${algorithm} mismatch (got ${actual}); refusing to use it`);
}

const say = (line: string) => void process.stdout.write(`${line}\n`);

const { values } = parseArgs({ options: { target: { type: 'string' }, out: { type: 'string' } } });
const target = (values.target ?? currentTarget()) as Target;
const out = resolve(values.out ?? '.bin');
mkdirSync(out, { recursive: true });

const manifestPath = join(out, 'versions.json');
const installed: Record<string, string> = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>)
  : {};

for (const binary of BINARIES) {
  const key = `${binary.name}@${target}`;
  const dest = join(out, binary.name);
  if (installed[key] === binary.version && existsSync(dest)) {
    say(`${binary.name} ${binary.version} (${target}) is up to date`);
    continue;
  }
  const url = binary.url(target);
  say(`Downloading ${binary.name} ${binary.version} (${target})…`);
  const data = await download(url);
  verify(data, binary.checksums[target], url);
  if (binary.extract) {
    const tmp = join(tmpdir(), `hlabs-${binary.name}-${process.pid}.tar.gz`);
    writeFileSync(tmp, data);
    try {
      execFileSync('tar', ['-xzf', tmp, '-C', out, binary.extract]);
    } finally {
      rmSync(tmp, { force: true });
    }
  } else {
    writeFileSync(dest, data);
  }
  chmodSync(dest, 0o755);
  installed[key] = binary.version;
  writeFileSync(manifestPath, JSON.stringify(installed, null, 2) + '\n');
}
say(`Binaries are in ${out}`);
