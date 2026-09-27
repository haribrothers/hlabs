import { describe, expect, it } from 'vitest';
import { cpuLabel, systemRows, type SystemCheck } from './system-rows';

const check = (over: Partial<SystemCheck> = {}): SystemCheck => ({
  cpu: { model: 'Apple M2', arch: 'arm64' },
  os: { platform: 'darwin', name: 'macOS', version: '15', headless: false },
  engine: { kind: 'orbstack', version: '27.0.1', state: 'running', level: 'ok', install: null },
  disk: { freeBytes: 142e9, path: '/Users/h/hlabs', level: 'ok' },
  ports: {
    http: { port: 80, inUse: false, use: 80 },
    https: { port: 443, inUse: false, use: 443 },
    level: 'ok',
  },
  canContinue: true,
  ...over,
});

const byId = (rows: ReturnType<typeof systemRows>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe('US-ONB-04', () => {
  it('shows one row each for CPU, OS, container runtime, free disk space and ports', () => {
    const rows = systemRows(check());
    expect(rows.map((r) => [r.title, r.value, r.status])).toEqual([
      ['Processor', 'Apple Silicon (arm64)', 'running'],
      ['Operating system', 'macOS 15', 'running'],
      ['Container runtime', 'OrbStack 27.0.1', 'running'],
      ['Free disk space', '142 GB', 'running'],
      ['Ports 80 and 443', 'Available', 'running'],
    ]);
  });

  it('shows every row as checking until the check returns', () => {
    for (const row of systemRows(undefined)) expect(row).toMatchObject({ value: 'Checking…', status: 'working' });
  });

  it('marks low disk space as an error below 10 GB and a warning below 30 GB, with what to do', () => {
    const error = byId(systemRows(check({ disk: { freeBytes: 6e9, path: '/', level: 'error' } }))).disk!;
    expect(error).toMatchObject({ value: '6 GB', status: 'failed' });
    expect(error.hint).toMatch(/at least 10 GB/);
    const warning = byId(systemRows(check({ disk: { freeBytes: 20e9, path: '/', level: 'warning' } }))).disk!;
    expect(warning).toMatchObject({ value: '20 GB', status: 'working' });
  });

  it('reads "Port 443 · In use · will use 8443" when 443 is taken', () => {
    const ports = byId(
      systemRows(
        check({
          ports: {
            http: { port: 80, inUse: false, use: 80 },
            https: { port: 443, inUse: true, use: 8443 },
            level: 'warning',
          },
        }),
      ),
    ).ports!;
    expect(`${ports.title} · ${ports.value}`).toBe('Port 443 · In use · will use 8443');
    expect(ports.status).toBe('working');
  });

  it('names both fallbacks when 80 and 443 are taken', () => {
    const ports = byId(
      systemRows(
        check({
          ports: {
            http: { port: 80, inUse: true, use: 8080 },
            https: { port: 443, inUse: true, use: 8443 },
            level: 'warning',
          },
        }),
      ),
    ).ports!;
    expect(`${ports.title} · ${ports.value}`).toBe('Ports 80 and 443 · In use · will use 8080 and 8443');
  });

  it('marks a missing or stopped runtime as an error', () => {
    const missing = byId(
      systemRows(check({ engine: { kind: null, version: null, state: 'missing', level: 'error', install: null } })),
    ).runtime!;
    expect(missing).toMatchObject({ value: 'Not found', status: 'failed' });
    const stopped = byId(
      systemRows(
        check({ engine: { kind: 'docker-desktop', version: null, state: 'stopped', level: 'error', install: null } }),
      ),
    ).runtime!;
    expect(stopped).toMatchObject({ value: 'Docker Desktop is not running', status: 'failed' });
  });

  it('names Linux distros and CPUs plainly', () => {
    expect(cpuLabel({ model: 'Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz', arch: 'x64' }, 'linux')).toBe(
      'Intel Core i7-8700 (x64)',
    );
    expect(cpuLabel({ model: 'AMD Ryzen 7 5800X 8-Core Processor', arch: 'x64' }, 'linux')).toBe(
      'AMD Ryzen 7 5800X (x64)',
    );
    const os = byId(
      systemRows(check({ os: { platform: 'linux', name: 'Ubuntu', version: '24.04', headless: true } })),
    ).os!;
    expect(os.value).toBe('Ubuntu 24.04');
  });
});
