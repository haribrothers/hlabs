import { describe, expect, it } from 'vitest';
import { COMMANDS, run } from './cli';

async function capture(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('hlabs CLI (D-018)', () => {
  it('lists the five commands in help', async () => {
    const { code, out } = await capture(['--help']);
    expect(code).toBe(0);
    for (const c of Object.keys(COMMANDS)) expect(out).toContain(c);
    expect(Object.keys(COMMANDS)).toEqual(['status', 'logs', 'reset-password', 'uninstall', 'setup-url']);
  });

  it('says what to do for an unknown command', async () => {
    const { code, err } = await capture(['restart']);
    expect(code).toBe(2);
    expect(err).toContain('hlabs --help');
  });
});
