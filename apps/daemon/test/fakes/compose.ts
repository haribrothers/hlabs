import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { COMPOSE_FILE, ComposeError, type ComposeProject, type ComposeRunner } from '../../src/apps/compose';
import type { ContainerState } from '../../src/engine/types';
import type { FakeEngine } from './engine';

type Op = 'up' | 'stop' | 'restart' | 'down';

/** Compose on top of a FakeEngine: `up` creates one running container per service of the rendered file. */
export class FakeCompose implements ComposeRunner {
  readonly calls: Array<{ op: Op; project: string }> = [];
  private readonly failures = new Map<string, ComposeError>();
  /** Services that come up unhealthy or exit straight away (set before `up`). */
  readonly serviceState = new Map<string, Partial<ContainerState>>();
  private startedAt = 1_000;

  constructor(private readonly engine: FakeEngine) {}

  /** The next `op` on `project` fails. */
  fail(op: Op, project: string, error = new ComposeError(`compose ${op} failed`, 'boom', null)) {
    this.failures.set(`${op}:${project}`, error);
  }

  async up(project: ComposeProject) {
    this.record('up', project);
    const compose = parse(readFileSync(join(project.dir, COMPOSE_FILE), 'utf8')) as {
      services: Record<string, { image: string }>;
    };
    const containers = Object.entries(compose.services).map(([service, svc]) => {
      if (!this.engine.images.has(svc.image))
        throw new ComposeError('image missing', `No such image: ${svc.image}`, null);
      return {
        id: `${project.name}-${service}`,
        service,
        state: 'running',
        health: null,
        image: svc.image,
        imageId: `sha256:${svc.image.split('@sha256:')[1] ?? 'local'}`,
        startedAt: this.startedAt++,
        exitCode: null,
        ...this.serviceState.get(service),
      } satisfies ContainerState;
    });
    this.engine.containers.set(project.name, containers);
  }

  async stop(project: ComposeProject) {
    this.record('stop', project);
    for (const c of this.engine.containers.get(project.name) ?? []) {
      Object.assign(c, { state: 'exited', startedAt: null, exitCode: 0, health: null });
    }
  }

  async restart(project: ComposeProject) {
    this.record('restart', project);
    for (const c of this.engine.containers.get(project.name) ?? []) {
      Object.assign(c, { state: 'running', startedAt: this.startedAt++, exitCode: null });
    }
  }

  async down(project: ComposeProject) {
    this.record('down', project);
    this.engine.containers.delete(project.name);
  }

  private record(op: Op, project: ComposeProject) {
    this.calls.push({ op, project: project.name });
    const failure = this.failures.get(`${op}:${project.name}`);
    if (failure) {
      this.failures.delete(`${op}:${project.name}`);
      throw failure;
    }
  }
}
