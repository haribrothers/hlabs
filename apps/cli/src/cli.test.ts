import { describe, expect, it } from 'vitest';
import { COMMANDS, run } from './cli';

function capture(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('hlabs CLI (D-018)', () => {
  it('lists the five commands in help', () => {
    const { code, out } = capture(['--help']);
    expect(code).toBe(0);
    for (const c of Object.keys(COMMANDS)) expect(out).toContain(c);
    expect(Object.keys(COMMANDS)).toEqual(['status', 'logs', 'reset-password', 'uninstall', 'setup-url']);
  });

  it('says what to do for an unknown command', () => {
    const { code, err } = capture(['restart']);
    expect(code).toBe(2);
    expect(err).toContain('hlabs --help');
  });

  it('reports that a command is not available yet', () => {
    expect(capture(['status']).code).toBe(69);
  });
});
