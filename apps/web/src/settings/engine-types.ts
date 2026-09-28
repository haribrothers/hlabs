// The engine overview as settings.engine.get returns it (US-SYS-17, US-SYS-19).
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';

export type EngineOverview = inferRouterOutputs<AppRouter>['settings']['engine']['get'];
