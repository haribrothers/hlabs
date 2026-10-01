// An app on Home, as apps.list gives it (US-HOME-03).
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';

export type HomeApp = inferRouterOutputs<AppRouter>['apps']['list']['apps'][number];
