// The compose CLI adapter (D-003), image pull progress and app port allocation (D-049).
import { hlabsCodeOf } from '@hlabs/api';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliComposeRunner, ComposeError, portInUseFrom, type Exec } from '../src/apps/compose';
import { allocatePort, APP_PORT_MAX, loopbackPortFree } from '../src/apps/ports';
import { PullLayers } from '../src/engine/dockerode-engine';
import { tempDir } from './helpers';
import { createServer } from 'node:net';

const project = { name: 'hlabs-immich', dir: '/data/apps/immich' };

function recorder(result: Error | null = null) {
  const calls: Array<{ file: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
  const exec: Exec = async (file, args, options) => {
    calls.push({ file, args, env: options.env });
    if (result) throw result;
    return { stdout: '', stderr: '' };
  };
  return { calls, exec };
}

describe('CliComposeRunner', () => {
  it('runs compose for the project against the engine socket', async () => {
    const { calls, exec } = recorder();
    const runner = new CliComposeRunner({ binDir: '/nonexistent', socketPath: () => '/sock/docker.sock', exec });
    await runner.up(project);
    await runner.down(project);
    expect(calls[0]!.file).toBe('docker');
    expect(calls[0]!.args).toEqual([
      'compose',
      '--project-name',
      'hlabs-immich',
      '--project-directory',
      '/data/apps/immich',
      '--file',
      '/data/apps/immich/docker-compose.yml',
      '--env-file',
      '/data/apps/immich/.env',
      'up',
      '--detach',
      '--pull',
      'never',
      '--remove-orphans',
    ]);
    expect(calls[0]!.env.DOCKER_HOST).toBe('unix:///sock/docker.sock');
    expect(calls[1]!.args.slice(-2)).toEqual(['down', '--remove-orphans']);
  });

  it('uses the bundled docker-compose binary when there is one', async () => {
    const binDir = tempDir();
    writeFileSync(join(binDir, 'docker-compose'), '');
    const { calls, exec } = recorder();
    await new CliComposeRunner({ binDir, socketPath: () => '/s', exec }).stop(project);
    expect(calls[0]!.file).toBe(join(binDir, 'docker-compose'));
    expect(calls[0]!.args[0]).toBe('--project-name');
  });

  it('refuses with ENGINE_UNAVAILABLE when no engine runs', async () => {
    const { calls, exec } = recorder();
    const runner = new CliComposeRunner({ binDir: '/x', socketPath: () => null, exec });
    await expect(runner.up(project)).rejects.toSatisfy((e) => hlabsCodeOf(e) === 'ENGINE_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('turns a failure into a ComposeError with the output and any taken port', async () => {
    const failure = Object.assign(new Error('exit 1'), {
      stderr:
        'Error response from daemon: driver failed programming external connectivity: Bind for 127.0.0.1:12003 failed: port is already allocated',
    });
    const { exec } = recorder(failure);
    const error = await new CliComposeRunner({ binDir: '/x', socketPath: () => '/s', exec })
      .up(project)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ComposeError);
    expect(error).toMatchObject({ portInUse: 12003 });
    expect((error as ComposeError).output).toMatch(/already allocated/);
  });
});

describe('portInUseFrom', () => {
  it('reads the port from the engines’ messages', () => {
    expect(portInUseFrom('listen tcp4 0.0.0.0:53: bind: address already in use')).toBe(53);
    expect(portInUseFrom('Ports are not available: exposing port TCP 127.0.0.1:12000 -> 0.0.0.0:0')).toBe(12000);
    expect(portInUseFrom('no such image')).toBeNull();
  });
});

describe('PullLayers', () => {
  it('sums layer bytes and counts finished or existing layers as done', () => {
    const layers = new PullLayers();
    layers.update({ id: 'a', status: 'Pulling fs layer' });
    layers.update({ id: 'b', status: 'Pulling fs layer' });
    layers.update({ id: 'a', status: 'Downloading', progressDetail: { current: 50, total: 200 } });
    layers.update({ id: 'b', status: 'Downloading', progressDetail: { current: 10, total: 100 } });
    expect(layers.progress()).toEqual({ current: 60, total: 300 });
    layers.update({ id: 'a', status: 'Download complete' });
    expect(layers.progress()).toEqual({ current: 210, total: 300 });
    // Progress never goes backwards within a layer.
    layers.update({ id: 'b', status: 'Downloading', progressDetail: { current: 5, total: 100 } });
    expect(layers.progress().current).toBe(210);
    expect(layers.update({ id: 'sha', status: 'Digest: sha256:abc' })).toBe(false);
  });
});

describe('allocatePort', () => {
  it('picks the lowest port no app holds and nothing listens on', async () => {
    const busy = new Set([12001]);
    expect(await allocatePort([12000], async (p) => !busy.has(p))).toBe(12002);
    expect(await allocatePort([], async () => true, 12500)).toBe(12500);
  });

  it('fails with APP_PORT_IN_USE when the range is full', async () => {
    await expect(allocatePort([], async (p) => p > APP_PORT_MAX)).rejects.toSatisfy(
      (e) => hlabsCodeOf(e) === 'APP_PORT_IN_USE',
    );
  });

  it('sees a port another program listens on', async () => {
    const server = createServer();
    await new Promise<void>((r) => server.listen({ host: '127.0.0.1', port: 0 }, r));
    const port = (server.address() as { port: number }).port;
    expect(await loopbackPortFree(port)).toBe(false);
    await new Promise((r) => server.close(r));
    expect(await loopbackPortFree(port)).toBe(true);
  });
});
