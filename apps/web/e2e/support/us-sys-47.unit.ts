// US-SYS-47: the e2e spec calls every home-only procedure from the public dashboard; this keeps its list of calls the
// same as the daemon's (HOME_ONLY_PROCEDURES), with the right kind of call for each.
import { appRouter, listProcedures } from '@hlabs/api';
import { HOME_ONLY_PROCEDURES, homeOnlyRule } from '@hlabs/shared';
import { describe, expect, it } from 'vitest';
import { HOME_ONLY_CALLS } from './home-only-inputs';

describe('US-SYS-47', () => {
  it('the e2e spec calls every home-only procedure, as a query or a mutation as it is', () => {
    expect(Object.keys(HOME_ONLY_CALLS).sort()).toEqual(Object.keys(HOME_ONLY_PROCEDURES).sort());
    const types = new Map(listProcedures().map((p) => [p.path, p.type]));
    for (const [path, call] of Object.entries(HOME_ONLY_CALLS)) expect(call.type, path).toBe(types.get(path));
  });

  it('each call (but those never served there, refused before their input is read) is one tRPC accepts', () => {
    const procs = (appRouter as unknown as { _def: { procedures: Record<string, { _def: { inputs: unknown[] } }> } })
      ._def.procedures;
    for (const [path, call] of Object.entries(HOME_ONLY_CALLS)) {
      if (homeOnlyRule(path) === 'neverServed') continue;
      const schema = procs[path]!._def.inputs[0] as { safeParse: (v: unknown) => { success: boolean } } | undefined;
      if (schema) expect(schema.safeParse(call.input).success, path).toBe(true);
    }
  });
});
