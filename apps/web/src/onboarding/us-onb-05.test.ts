import { describe, expect, it } from 'vitest';
import { isInstalling, shouldInstallEngine, systemRows, type SystemCheck } from './system-rows';

type Install = NonNullable<SystemCheck['engine']['install']>;

const check = (engine: Partial<SystemCheck['engine']>, platform: 'darwin' | 'linux' = 'darwin'): SystemCheck => ({
  cpu: { model: 'Apple M2', arch: 'arm64' },
  os: { platform, name: platform === 'darwin' ? 'macOS' : 'Ubuntu', version: '15', headless: false },
  engine: { kind: null, version: null, state: 'missing', level: 'error', install: null, ...engine },
  disk: { freeBytes: 142e9, path: '/Users/h/hlabs', level: 'ok' },
  ports: {
    http: { port: 80, inUse: false, use: 80 },
    https: { port: 443, inUse: false, use: 443 },
    level: 'ok',
  },
  canContinue: engine.state === 'running',
  hostname: 'hlabs',
});

const install = (over: Partial<Install>): Install => ({
  jobId: 'job1',
  state: 'running',
  progress: 64,
  lastLogLine: null,
  hlabsCode: null,
  ...over,
});

const runtime = (c: SystemCheck) => systemRows(c).find((r) => r.id === 'runtime')!;

describe('US-ONB-05', () => {
  it('installs without asking on a Mac with no engine, once', () => {
    expect(shouldInstallEngine(check({}))).toBe(true);
    expect(shouldInstallEngine(check({ install: install({}) }))).toBe(false);
    expect(shouldInstallEngine(check({}, 'linux'))).toBe(false);
    expect(shouldInstallEngine(check({ kind: 'orbstack', state: 'running', level: 'ok' }))).toBe(false);
  });

  it('shows "Installing Colima… N%" with a progress bar and the note while it runs', () => {
    const row = runtime(check({ install: install({ progress: 64 }) }));
    expect(row).toMatchObject({
      title: 'Container runtime',
      value: 'Installing Colima… 64%',
      status: 'working',
      progress: 64,
      note: 'No Docker found. OrbStack or Docker Desktop are used automatically when present.',
    });
  });

  it('re-checks while the install is queued or running, and stops after', () => {
    expect(isInstalling(check({ install: install({ state: 'queued', progress: 0 }) }))).toBe(true);
    expect(isInstalling(check({ install: install({}) }))).toBe(true);
    expect(isInstalling(check({ install: install({ state: 'succeeded', progress: 100 }) }))).toBe(false);
    expect(isInstalling(undefined)).toBe(false);
  });

  it('shows Colima with its version once it runs', () => {
    const row = runtime(
      check({
        kind: 'colima',
        version: '28.1.1',
        state: 'running',
        level: 'ok',
        install: install({ state: 'succeeded', progress: 100 }),
      }),
    );
    expect(row).toMatchObject({ value: 'Colima 28.1.1', status: 'running' });
    expect(row.progress).toBeUndefined();
  });
});
