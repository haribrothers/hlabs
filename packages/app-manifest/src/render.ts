// Renders an app's compose project: the source compose plus what hlabs injects (06 §Compose rules):
// the loopback web port (D-049), the external `hlabs` network, labels, restart policy, log limits
// and TZ. Variables stay as ${VAR}; they go into the project's .env, which compose reads.
import { stringify } from 'yaml';
import type { ComposeFile } from './compose';
import { folderVariable, type AppManifest } from './manifest';

export const HLABS_NETWORK = 'hlabs';
export const APP_LABEL = 'dev.hlabs.app';
export const SERVICE_LABEL = 'dev.hlabs.service';

export interface RenderInput {
  manifest: AppManifest;
  compose: ComposeFile;
  /** Host loopback port for the web service, 12000–12999 (D-049). */
  webPort: number;
  /** Absolute host paths. */
  appDataDir: string;
  folders: Record<string, string>;
  /** e.g. `immich.hlabs.local` */
  hostname: string;
  /** e.g. `https://immich.hlabs.local` */
  url: string;
  tailnetUrl?: string;
  tz: string;
  puid: number;
  pgid: number;
  /** Values for the manifest's env prompts (generated secrets included). */
  env: Record<string, string>;
}

export interface RenderedApp {
  projectName: string;
  compose: Record<string, unknown>;
  env: Record<string, string>;
  composeYaml: string;
  envFile: string;
}

type Service = Record<string, unknown>;

function toRecord(value: unknown, sep: '=' | ':' = '='): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => {
        const s = String(entry);
        const i = s.indexOf(sep);
        return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
      }),
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === null ? '' : String(v)]));
  }
  return {};
}

function withNetwork(value: unknown, network: string): unknown {
  if (Array.isArray(value)) return value.includes(network) ? value : [...value, network];
  if (value && typeof value === 'object') return { ...value, [network]: {} };
  return ['default', network];
}

/** Quote .env values so compose reads them literally. */
export function serializeEnvFile(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}='${v.replace(/'/g, `'\\''`)}'`)
      .join('\n') + '\n'
  );
}

export function renderApp(input: RenderInput): RenderedApp {
  const { manifest } = input;
  const projectName = `hlabs-${manifest.id}`;
  const services: Record<string, Service> = {};

  for (const [name, source] of Object.entries(input.compose.services)) {
    const svc: Service = structuredClone(source) as Service;
    svc.labels = { ...toRecord(svc.labels), [APP_LABEL]: manifest.id, [SERVICE_LABEL]: name };
    svc.restart = 'unless-stopped';
    svc.logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } };
    const environment = toRecord(svc.environment);
    environment.TZ ??= '${TZ}';
    svc.environment = environment;

    // Published ports: only what hlabs adds.
    const ports: string[] = [];
    if (name === manifest.web.service) {
      ports.push(`127.0.0.1:${input.webPort}:${manifest.web.port}`);
      if (!svc.network_mode) svc.networks = withNetwork(svc.networks, HLABS_NETWORK);
    }
    for (const p of manifest.ports.filter((p) => p.service === name))
      ports.push(`${p.host}:${p.container}/${p.protocol}`);
    if (ports.length) svc.ports = ports;
    else delete svc.ports;

    services[name] = svc;
  }

  const compose: Record<string, unknown> = {
    ...structuredClone(input.compose),
    name: projectName,
    services,
    networks: {
      ...toRecordOfObjects((input.compose as { networks?: unknown }).networks),
      default: {},
      [HLABS_NETWORK]: { external: true, name: HLABS_NETWORK },
    },
  };

  const env: Record<string, string> = {
    ...input.env,
    HLABS_APP_ID: manifest.id,
    HLABS_APP_DATA: input.appDataDir,
    HLABS_HOSTNAME: input.hostname,
    HLABS_URL: input.url,
    ...(input.tailnetUrl ? { HLABS_TAILNET_URL: input.tailnetUrl } : {}),
    TZ: input.tz,
    PUID: String(input.puid),
    PGID: String(input.pgid),
  };
  for (const folder of manifest.folders) {
    const path = input.folders[folder.key];
    if (path) env[folderVariable(folder.key)] = path;
    else if (folder.required) throw new Error(`Folder "${folder.key}" is required`);
  }

  return { projectName, compose, env, composeYaml: stringify(compose), envFile: serializeEnvFile(env) };
}

function toRecordOfObjects(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
