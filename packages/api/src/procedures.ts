// A flat view of the router: every procedure path with its type and access (for tests, docs and the daemon).
import type { Access, ProcedureMeta } from './trpc';
import { appRouter } from './router';

export interface ProcedureInfo {
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  access: readonly Access[];
}

export function listProcedures(): ProcedureInfo[] {
  const procs = appRouter._def.procedures as unknown as Record<
    string,
    { _def: { type: ProcedureInfo['type']; meta?: ProcedureMeta } }
  >;
  return Object.entries(procs)
    .map(([path, proc]) => ({ path, type: proc._def.type, access: proc._def.meta?.access ?? [] }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
