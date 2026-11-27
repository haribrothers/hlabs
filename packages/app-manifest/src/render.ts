// Renders an app's compose project: the source compose plus what hlabs injects (06 §Compose rules):
// the loopback web port (D-049), the external `hlabs` network, labels, restart policy, log limits
// and TZ. Variables stay as ${VAR}; they go into the project's .env, which compose reads.
// App settings add to it (US-APP-13…18): variables people added (on the web service), folders they gave it at
// /mnt/hlabs/<name>, folders made read only, and network access. With "Reach the internet" off the project's networks
// are internal and a small forwarding sidecar on a normal bridge publishes the web port, so Caddy still reaches it
// (D-049, D-165). Rendering is idempotent: what hlabs added is taken out first, so a project's own compose file can be
// rendered again when its store has moved on.
import { stringify } from 'yaml';
import { parseShortVolume, type ComposeFile } from './compose';
import { folderVariable, type AppManifest } from './manifest';

export const HLABS_NETWORK = 'hlabs';
export const APP_LABEL = 'dev.hlabs.app';
export const SERVICE_LABEL = 'dev.hlabs.service';
/** Where folders people give an app in App settings › Permissions appear inside its web container (US-APP-17). */
export const EXTRA_MOUNT_ROOT = '/mnt/hlabs';
/** The forwarding sidecar's service name; raw ports get `hlabs-forward-<protocol>-<port>` (D-165). */
export const FORWARD_SERVICE = 'hlabs-forward';
/** socat, pinned by tag and multi-arch digest (amd64 and arm64), D-165. */
export const FORWARD_IMAGE =
  'alpine/socat:1.8.1.3@sha256:5aa280c6fc5bee94dbd2bbdf2a58d30f50396eaa110be84b03636945b157ae68';
/** The normal bridge the sidecars publish through while the app's own networks are internal. */
export const EDGE_NETWORK = 'hlabs-edge';

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
  /** The manifest's devices that exist on this computer; the others are left out (D-163). */
  presentDevices?: string[];
  /** Variables people added in App settings (US-APP-13): set on the web service, their values in the .env. */
  extraEnv?: string[];
  /** Folders people gave the app (US-APP-17), mounted on the web service at `/mnt/hlabs/<name>`. */
  extraMounts?: Array<{ target: string; hostPath: string; mode: 'ro' | 'rw' }>;
  /** Manifest folders made read only in App settings (US-APP-17); never made writable here. */
  folderModes?: Record<string, 'ro' | 'rw'>;
  /** Network access (US-APP-18, D-049); both on by default. */
  network?: { internet: boolean; apps: boolean };
  /** The compose project it runs as (the daemon's `<prefix>-<appId>`, D-090); `hlabs-<appId>` by default. */
  projectName?: string;
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

/** A volume's target inside the container, short or long syntax. */
function volumeTarget(v: unknown): string | null {
  if (typeof v === 'string') return parseShortVolume(v).target;
  return (v as { target?: string } | null)?.target ?? null;
}

function volumeSource(v: unknown): string | null {
  if (typeof v === 'string') return parseShortVolume(v).source;
  return (v as { source?: string } | null)?.source ?? null;
}

/** The same volume, read only. */
function readOnly(v: unknown): unknown {
  if (typeof v !== 'string') return { ...(v as object), read_only: true };
  const { source, target } = parseShortVolume(v);
  return source === null ? v : `${source}:${target}:ro`;
}

/** Literal `$` in a host path, so compose doesn't read it as a variable. */
const literal = (path: string) => path.replace(/\$/g, '$$$$');

/** A service's networks without `drop`, as a list or map like it came. */
function withoutNetwork(value: unknown, drop: string): unknown {
  if (Array.isArray(value)) return value.filter((n) => n !== drop);
  if (value && typeof value === 'object') {
    const { [drop]: _gone, ...rest } = value as Record<string, unknown>;
    return rest;
  }
  return value;
}

const isForwarder = (name: string) => name === FORWARD_SERVICE || name.startsWith(`${FORWARD_SERVICE}-`);

/**
 * The name a forwarding sidecar reaches a service by: its container's name (`<project>-<service>-1`; compose files
 * can't set container_name). Not the service's name: the web sidecar carries that on the shared network so other apps
 * reach the app as before, and a sidecar looking it up would find itself.
 */
export const forwardTarget = (projectName: string, service: string) => `${projectName}-${service}-1`;

export function renderApp(input: RenderInput): RenderedApp {
  const { manifest } = input;
  const projectName = input.projectName ?? `hlabs-${manifest.id}`;
  const services: Record<string, Service> = {};
  const network = input.network ?? { internet: true, apps: true };
  const folderVars = new Map(manifest.folders.map((f) => [folderVariable(f.key), f]));
  const forwards: Array<{ name: string; publish: string; listen: string; to: string; aliases?: string[] }> = [];

  for (const [name, source] of Object.entries(input.compose.services)) {
    // What an earlier render added goes first (idempotent).
    if (isForwarder(name)) continue;
    const svc: Service = structuredClone(source) as Service;
    if (Array.isArray(svc.volumes)) {
      svc.volumes = svc.volumes.filter((v) => !volumeTarget(v)?.startsWith(`${EXTRA_MOUNT_ROOT}/`));
    }
    if (svc.networks !== undefined) svc.networks = withoutNetwork(svc.networks, EDGE_NETWORK);
    svc.labels = { ...toRecord(svc.labels), [APP_LABEL]: manifest.id, [SERVICE_LABEL]: name };
    svc.restart = 'unless-stopped';
    svc.logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } };
    const environment = toRecord(svc.environment);
    environment.TZ ??= '${TZ}';
    svc.environment = environment;

    if (Array.isArray(svc.devices)) {
      const present = new Set(input.presentDevices ?? []);
      const devices = svc.devices.filter((d) => {
        const source = typeof d === 'string' ? d.split(':')[0] : (d as { source?: string }).source;
        return !!source && present.has(source);
      });
      if (devices.length) svc.devices = devices;
      else delete svc.devices;
    }

    // Folders: one the app wasn't given is left out (an optional one); one made read only is mounted read only.
    if (Array.isArray(svc.volumes)) {
      const volumes = svc.volumes.flatMap((v: unknown) => {
        const variable = /^\$\{(HLABS_FOLDER_[A-Z0-9_]+)\}/.exec(volumeSource(v) ?? '')?.[1];
        const folder = variable ? folderVars.get(variable) : undefined;
        if (!folder) return [v];
        if (!input.folders[folder.key] && !folder.required) return [];
        return input.folderModes?.[folder.key] === 'ro' ? [readOnly(v)] : [v];
      });
      if (volumes.length) svc.volumes = volumes;
      else delete svc.volumes;
    }

    const web = name === manifest.web.service;
    if (web) {
      for (const key of input.extraEnv ?? []) environment[key] = `\${${key}}`;
      const extra = (input.extraMounts ?? []).map((m) => ({
        type: 'bind',
        source: literal(m.hostPath),
        target: m.target,
        ...(m.mode === 'ro' ? { read_only: true } : {}),
      }));
      if (extra.length) svc.volumes = [...((svc.volumes as unknown[]) ?? []), ...extra];
    }

    // Published ports: only what hlabs adds. Without the internet, the forwarding sidecars publish them (D-049).
    const ports: string[] = [];
    const raw = manifest.ports.filter((p) => p.service === name);
    if (network.internet) {
      if (web) ports.push(`127.0.0.1:${input.webPort}:${manifest.web.port}`);
      for (const p of raw) ports.push(`${p.host}:${p.container}/${p.protocol}`);
    } else {
      if (web) {
        forwards.push({
          name: FORWARD_SERVICE,
          publish: `127.0.0.1:${input.webPort}:${manifest.web.port}`,
          listen: `TCP-LISTEN:${manifest.web.port},fork,reuseaddr`,
          to: `TCP:${forwardTarget(projectName, name)}:${manifest.web.port}`,
          // Other apps reach it by the web service's name, as they would the app itself.
          aliases: network.apps ? [name] : undefined,
        });
      }
      for (const p of raw) {
        const proto = p.protocol.toUpperCase();
        forwards.push({
          name: `${FORWARD_SERVICE}-${p.protocol}-${p.container}`,
          publish: `${p.host}:${p.container}/${p.protocol}`,
          listen: `${proto}-LISTEN:${p.container},fork,reuseaddr`,
          to: `${proto}:${forwardTarget(projectName, name)}:${p.container}`,
        });
      }
    }
    // The shared network: the web service joins it while the app may talk to other apps and reach the internet (the
    // shared network is a normal bridge, so on it the app could reach the internet too).
    if (!svc.network_mode) {
      if (web && network.apps && network.internet) svc.networks = withNetwork(svc.networks, HLABS_NETWORK);
      else if (svc.networks !== undefined) svc.networks = withoutNetwork(svc.networks, HLABS_NETWORK);
    }

    if (ports.length) svc.ports = ports;
    else delete svc.ports;

    services[name] = svc;
  }

  // The sidecars sit on every network of the app's own, so they reach a service whichever networks it's on.
  const ownNetworks = Object.entries(toRecordOfObjects((input.compose as { networks?: unknown }).networks))
    .filter(([key, value]) => key !== HLABS_NETWORK && key !== EDGE_NETWORK && !toRecordOfObjects(value).external)
    .map(([key]) => key)
    .filter((key) => key !== 'default');
  for (const f of forwards) {
    services[f.name] = {
      image: FORWARD_IMAGE,
      command: [f.listen, f.to],
      labels: { [APP_LABEL]: manifest.id, [SERVICE_LABEL]: f.name },
      restart: 'unless-stopped',
      logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } },
      read_only: true,
      cap_drop: ['ALL'],
      cap_add: ['NET_BIND_SERVICE'],
      security_opt: ['no-new-privileges:true'],
      ports: [f.publish],
      networks: {
        default: {},
        ...Object.fromEntries(ownNetworks.map((n) => [n, {}])),
        [EDGE_NETWORK]: {},
        ...(f.aliases ? { [HLABS_NETWORK]: { aliases: f.aliases } } : {}),
      },
    };
  }

  // The app's own networks; without the internet they're internal, so nothing in them can reach out.
  const networks: Record<string, unknown> = {
    ...toRecordOfObjects((input.compose as { networks?: unknown }).networks),
    default: {},
    [HLABS_NETWORK]: { external: true, name: HLABS_NETWORK },
  };
  delete networks[EDGE_NETWORK];
  if (!network.internet) {
    for (const [key, value] of Object.entries(networks)) {
      const net = toRecordOfObjects(value);
      if (key !== HLABS_NETWORK && !net.external) networks[key] = { ...net, internal: true };
    }
  }
  if (forwards.length) networks[EDGE_NETWORK] = {};
  const compose: Record<string, unknown> = {
    ...structuredClone(input.compose),
    name: projectName,
    services,
    networks,
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
