import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { SystemStep } from './system-step';
import { systemRows, type SystemCheck } from './system-rows';

type Install = NonNullable<SystemCheck['engine']['install']>;

const failedInstall = (over: Partial<Install> = {}): Install => ({
  jobId: 'job1',
  state: 'failed',
  progress: 12,
  lastLogLine: 'colima start: download timed out after 120s',
  hlabsCode: 'ENGINE_DOWNLOAD_TIMEOUT',
  ...over,
});

const check = (engine: Partial<SystemCheck['engine']> = {}): SystemCheck => ({
  cpu: { model: 'Apple M2', arch: 'arm64' },
  os: { platform: 'darwin', name: 'macOS', version: '15', headless: false },
  engine: { kind: null, version: null, state: 'missing', level: 'error', install: failedInstall(), ...engine },
  disk: { freeBytes: 142e9, path: '/Users/h/hlabs', level: 'ok' },
  ports: {
    http: { port: 80, inUse: false, use: 80 },
    https: { port: 443, inUse: true, use: 8443 },
    level: 'warning',
  },
  canContinue: engine.state === 'running',
  hostname: 'hlabs',
});

describe('US-ONB-06', () => {
  it('maps the failure code to what to do next', () => {
    const runtime = (c: SystemCheck) => systemRows(c).find((r) => r.id === 'runtime')!;
    expect(runtime(check())).toMatchObject({
      value: 'Install failed',
      status: 'failed',
      failure: {
        line: 'colima start: download timed out after 120s',
        hint: 'Check your internet connection and try again.',
      },
    });
    expect(runtime(check({ install: failedInstall({ hlabsCode: 'INTERNAL' }) })).failure!.hint).toBe(
      'Try again. If it keeps failing, open the full log.',
    );
  });

  it('shows "Something needs attention" with the log line, hint, tip and port warning; Continue is disabled', async () => {
    renderScreen(SystemStep, { 'onboarding.checkSystem': () => check() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Something needs attention' })).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't set up the container runtime. Nothing has been changed on this computer."),
    ).toBeInTheDocument();
    expect(screen.getByText('Install failed')).toBeInTheDocument();
    expect(screen.getByText(/colima start: download timed out after 120s/)).toHaveClass('font-mono');
    expect(screen.getByText(/Check your internet connection and try again\./)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Already use Docker? Install OrbStack or Docker Desktop and press Retry, and hlabs will use it instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('In use · will use 8443')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('Retry looks for an engine first and uses one that appeared instead of reinstalling', async () => {
    let result = check();
    const installEngine = vi.fn(() => ({ jobId: 'job2' }));
    renderScreen(SystemStep, { 'onboarding.checkSystem': () => result, 'onboarding.installEngine': installEngine });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    result = check({ kind: 'orbstack', version: '29.4.0', state: 'running', level: 'ok' });
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { level: 1, name: 'Checking this computer' })).toBeInTheDocument();
    expect(screen.getByText('OrbStack 29.4.0')).toBeInTheDocument();
    expect(installEngine).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('Retry reinstalls Colima when still nothing is found', async () => {
    const installEngine = vi.fn(() => ({ jobId: 'job2' }));
    renderScreen(SystemStep, { 'onboarding.checkSystem': () => check(), 'onboarding.installEngine': installEngine });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(installEngine).toHaveBeenCalledOnce());
  });

  it('View full log opens the whole log, scrollable, with Copy', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const log = 'Downloading colima 0.10.3\nDownloading lima 2.2.0\nlima download: download timed out after 120s\n';
    renderScreen(SystemStep, {
      'onboarding.checkSystem': (input) =>
        check({ install: failedInstall((input as { includeLog?: boolean } | undefined)?.includeLog ? { log } : {}) }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'View full log' }));
    const dialog = await screen.findByRole('dialog', { name: 'Container runtime install log' });
    const pre = await within(dialog).findByText(/Downloading lima 2\.2\.0/);
    expect(pre).toHaveClass('overflow-auto');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' })));
    expect(writeText).toHaveBeenCalledWith(log);
    expect(within(dialog).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
