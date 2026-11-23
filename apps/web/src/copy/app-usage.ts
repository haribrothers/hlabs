// App settings › Usage (US-APP-20, US-APP-21; AppUsageDetail). Sentence case, plain words.
import type { ContainerStatus } from '@hlabs/api';

export const appUsageCopy = {
  tiles: 'Resource use',
  cpu: 'CPU',
  memory: 'Memory',
  disk: 'Disk',
  network: 'Network',
  /** Under the CPU tile: its average since midnight. */
  avgToday: (value: string) => `avg ${value} today`,
  /** Under the Memory tile: its highest in the last 24 hours. */
  peak: (value: string) => `peak ${value}`,
  dataAndImage: 'data + image',
  counting: 'Counting…',
  noValue: '—',
  /** The chart's heading, "Memory · last 24 hours". */
  chartTitle: (metric: string) => `${metric} · last 24 hours`,
  chartMetric: 'Chart',
  units: { cpu: '%', memory: 'MB', network: 'KB/s' },
  netIn: 'In',
  netOut: 'Out',
  now: 'now',
  collecting: 'Collecting data — check back in a few minutes.',
  noData: 'No usage recorded in the last 24 hours.',
  /** What a screen reader hears about the chart. */
  summary: (metric: string, average: string, highest: string, at: string) =>
    `${metric} over the last 24 hours: average ${average}, highest ${highest} at ${at}.`,
  networkSummary: (inAvg: string, outAvg: string) =>
    `Network over the last 24 hours: average ${inAvg} in and ${outAvg} out.`,
  stoppedGaps: 'Gaps are times the app wasn’t running.',
  containers: 'Containers',
  /** A running container's row: "64 MB · 1% CPU · ↓ 1 KB/s". */
  containerLine: (memory: string, cpu: string, download: string) => `${memory} · ${cpu} CPU · ↓ ${download}`,
  containerStatus: {
    running: 'Running',
    restarting: 'Restarting',
    paused: 'Paused',
    stopped: 'Stopped',
    exited: 'Exited',
  } satisfies Record<ContainerStatus, string>,
  /** The row opens the logs of that container. */
  showLogs: (name: string) => `Show logs for ${name}`,
  couldntLoad: "Usage couldn't be loaded. Check that hlabs is running, then try again.",
  retry: 'Try again',
};
