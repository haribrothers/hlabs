import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { listUsers } from '../users/users';

export const users: AppHandlers<DaemonContext>['users'] = {
  list: (_input, ctx) => ({ users: listUsers(ctx.services.db) }),
};
