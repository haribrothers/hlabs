// Helper processes a killed daemon left running (Caddy, mDNS publishers) are ended at the next start, and only those.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChildRegistry } from '../src/platform/children';
import { tempDir } from './helpers';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('helper processes', () => {
  it('records running helpers and forgets the ones that exit', () => {
    const file = join(tempDir('children-'), 'run', 'children.json');
    const registry = new ChildRegistry(file);
    registry.reapStale();
    registry.add(101, 'caddy.json');
    registry.add(102, 'dns-sd -P immich.hlabs');
    registry.remove(101);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([{ pid: 102, marker: 'dns-sd -P immich.hlabs' }]);
  });

  it('at start, ends what a killed daemon left running, and leaves a reused process id alone', async () => {
    const file = join(tempDir('children-'), 'run', 'children.json');
    const left = new ChildRegistry(file);
    left.reapStale();
    // A helper the previous daemon started and never stopped.
    const helper = spawn('sleep', ['30'], { stdio: 'ignore' });
    left.add(helper.pid, 'sleep 30');
    // A process id now used by something else: its command doesn't carry the marker.
    const other = spawn('sleep', ['31'], { stdio: 'ignore' });
    left.add(other.pid, 'caddy.json');

    const next = new ChildRegistry(file);
    expect(next.reapStale()).toBe(1);
    await new Promise((r) => helper.once('exit', r));
    expect(alive(helper.pid!)).toBe(false);
    expect(alive(other.pid!)).toBe(true);
    other.kill();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
