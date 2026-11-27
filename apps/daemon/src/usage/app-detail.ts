// An app's Usage tab (US-APP-20, US-APP-21): its values in the latest sample, its average CPU today and memory peak
// over 24 hours (from the history), its disk (data folder and images, counted every 10 minutes) and each container from
// the engine with what the sampler last read for it. A compose service without a container (the app was taken down)
// is listed as stopped; with the engine stopped every container is.
import { hlabsError, type AppUsageDetail, type ContainerStatus } from '@hlabs/api';
import type { AppState } from '@hlabs/db';
import type { AppService } from '../apps/service';
import type { AppDiskUsage } from '../apps/disk';
import type { EngineService } from '../engine/service';
import type { ContainerState } from '../engine/types';
import type { UsageHistory } from './history';
import type { UsageSampler } from './sampler';

export interface AppUsageDetailDeps {
  apps: Pick<AppService, 'get' | 'services' | 'project'>;
  engine: Pick<EngineService, 'client'>;
  usage: Pick<UsageSampler, 'latest' | 'containerUsage'>;
  usageHistory: Pick<UsageHistory, 'appSummary'>;
  appDisk: Pick<AppDiskUsage, 'get'>;
}

/**
 * Docker's state in words people use (D-164): running, restarting and paused as they are; an ended container is
 * "Stopped" when the app is stopped (hlabs or someone stopped it) and "Exited" when the app should be running.
 */
export function containerStatus(state: string | undefined, appState: AppState): ContainerStatus {
  if (state === 'running' || state === 'restarting' || state === 'paused') return state;
  if (state === 'exited' || state === 'dead') return appState === 'stopped' ? 'stopped' : 'exited';
  return 'stopped';
}

export async function appUsageDetail(deps: AppUsageDetailDeps, appId: string): Promise<AppUsageDetail> {
  const app = deps.apps.get(appId);
  if (!app) throw hlabsError('NOT_FOUND');
  const client = deps.engine.client;
  const [containers, disk] = await Promise.all([
    client
      ? client.projectContainers(deps.apps.project(appId).name).catch((): ContainerState[] => [])
      : Promise.resolve<ContainerState[]>([]),
    deps.appDisk.get(appId).catch(() => null),
  ]);
  const services = deps.apps.services(appId);
  for (const c of containers) if (c.service && !services.includes(c.service)) services.push(c.service);

  const { cpuAvgToday, memPeak24h } = deps.usageHistory.appSummary(appId);
  const current = deps.usage.latest()?.apps.find((a) => a.appId === appId) ?? null;
  return {
    appId,
    installedAt: app.installedAt,
    current,
    cpuAvgToday,
    memPeak24h,
    disk: disk && { dataBytes: disk.dataBytes, imageBytes: disk.imageBytes },
    containers: services.map((service) => {
      // A scaled service has several; the running one speaks for it.
      const mine = containers.filter((c) => c.service === service);
      const container = mine.find((c) => c.state === 'running') ?? mine[0];
      const status = containerStatus(container?.state, app.state);
      const reading = container && status === 'running' ? deps.usage.containerUsage(container.id) : null;
      return {
        name: `${appId}-${service}`,
        service,
        status,
        cpu: reading?.cpu ?? null,
        memBytes: reading?.memBytes ?? null,
        netRx: reading?.netRx ?? null,
      };
    }),
  };
}
