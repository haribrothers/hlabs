// Files (07-files). Thin: who's calling, then FilesService, which resolves every path for that person.
import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import type { DaemonContext } from '../context';
import type { Caller } from '../files/places';

export function callerOf(ctx: DaemonContext): Caller {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return ctx.services.files.caller(id.userId, id.role);
}

export const files: AppHandlers<DaemonContext>['files'] = {
  list: (input, ctx) => ctx.services.files.list(callerOf(ctx), input),
  stat: ({ path }, ctx) => ctx.services.files.stat(callerOf(ctx), path),
  recent: (_input, ctx) => ctx.services.files.recent(callerOf(ctx)),
  uploads: (_input, ctx) => ({ uploads: ctx.services.uploads.list(callerOf(ctx)) }),
  search: (input, ctx) => ctx.services.files.search(callerOf(ctx), input),
  mkdir: (input, ctx) => ctx.services.files.mkdir(callerOf(ctx), input),
  rename: (input, ctx) => ctx.services.files.rename(callerOf(ctx), input),
  move: (input, ctx) => ctx.services.fileMover.move(callerOf(ctx), input),
  openWith: ({ path }, ctx) =>
    ctx.services.files.openWith(callerOf(ctx), path, (name) => ctx.services.routing.isPublished(name)),
  preview: (input, ctx) => ctx.services.files.preview(callerOf(ctx), input),
};
