// A flat view of the router: every procedure path with its type, access and whether it only works at home (for tests,
// docs and the daemon).
import { homeOnlyRule, type HomeOnlyRule } from '@hlabs/shared';
import type { Access, ProcedureMeta } from './trpc';
import { appRouter } from './router';

export interface ProcedureInfo {
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  access: readonly Access[];
  /** Refused from the public dashboard with HOME_ONLY (US-SYS-47, `HOME_ONLY_PROCEDURES`); null: works anywhere. */
  homeOnly: HomeOnlyRule | null;
}

export function listProcedures(): ProcedureInfo[] {
  const procs = appRouter._def.procedures as unknown as Record<
    string,
    { _def: { type: ProcedureInfo['type']; meta?: ProcedureMeta } }
  >;
  return Object.entries(procs)
    .map(([path, proc]) => ({
      path,
      type: proc._def.type,
      access: proc._def.meta?.access ?? [],
      homeOnly: homeOnlyRule(path),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
