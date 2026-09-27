// Compose rules enforced for every app from a source (docs/prd/06-app-manifest.md §Compose rules).
import { z } from 'zod';
import { folderVariable, type AppManifest } from './manifest';

export interface ComposeIssue {
  /** Where the problem is, e.g. `services.web.volumes[0]`. */
  path: string;
  code:
    | 'COMPOSE_INVALID'
    | 'SERVICE_BUILD'
    | 'IMAGE_NOT_PINNED'
    | 'PRIVILEGED'
    | 'HOST_NETWORK'
    | 'HOST_PID'
    | 'HOST_IPC'
    | 'CONTAINER_NAME'
    | 'ENV_FILE'
    | 'PORT_NOT_DECLARED'
    | 'BIND_MOUNT_NOT_ALLOWED'
    | 'DOCKER_SOCKET'
    | 'NAMED_VOLUME'
    | 'UNKNOWN_FOLDER'
    | 'MANIFEST_SERVICE_MISSING';
  message: string;
}

const volumeLong = z.object({ type: z.string(), source: z.string().optional(), target: z.string() }).loose();

const composeService = z
  .object({
    image: z.string().optional(),
    build: z.unknown().optional(),
    privileged: z.boolean().optional(),
    network_mode: z.string().optional(),
    pid: z.string().optional(),
    ipc: z.string().optional(),
    container_name: z.string().optional(),
    env_file: z.unknown().optional(),
    ports: z.array(z.union([z.string(), z.number(), z.object({}).loose()])).optional(),
    volumes: z.array(z.union([z.string(), volumeLong])).optional(),
  })
  .loose();

export const ComposeFile = z
  .object({
    services: z.record(z.string(), composeService).refine((s) => Object.keys(s).length > 0, 'At least one service'),
  })
  .loose();
export type ComposeFile = z.output<typeof ComposeFile>;

/** `image: repo:tag@sha256:<64 hex>` */
export const PINNED_IMAGE = /^[^\s@]+:[^\s@/:]+@sha256:[a-f0-9]{64}$/;

export interface ValidateComposeOptions {
  /** Built-in store apps must pin every image by tag and digest; custom apps needn't (06 §Custom apps). */
  requireDigest: boolean;
}

/** Splits a short volume spec (`SRC:DST[:MODE]`) while keeping `${VAR:-x}` intact. */
export function parseShortVolume(spec: string): { source: string | null; target: string } {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i]!;
    if (ch === '$' && spec[i + 1] === '{') depth++;
    if (ch === '}' && depth > 0) depth--;
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  if (parts.length === 1) return { source: null, target: parts[0]! };
  return { source: parts[0]!, target: parts[1]! };
}

const APP_DATA_SOURCE = /^\$\{HLABS_APP_DATA\}(\/[^]*)?$/;
const FOLDER_SOURCE = /^\$\{(HLABS_FOLDER_[A-Z0-9_]+)\}(\/[^]*)?$/;
const DOCKER_SOCKETS = new Set(['/var/run/docker.sock', '/run/docker.sock']);

function portMatches(entry: unknown, manifest: AppManifest, service: string): boolean {
  let container: number | undefined;
  let protocol = 'tcp';
  if (typeof entry === 'number') container = entry;
  else if (typeof entry === 'string') {
    const [ports, proto] = entry.split('/');
    container = Number(ports!.split(':').at(-1));
    protocol = proto ?? 'tcp';
  } else if (entry && typeof entry === 'object') {
    const e = entry as { target?: number; protocol?: string };
    container = e.target;
    protocol = e.protocol ?? 'tcp';
  }
  return manifest.ports.some((p) => p.service === service && p.container === container && p.protocol === protocol);
}

export function validateCompose(raw: unknown, manifest: AppManifest, options: ValidateComposeOptions): ComposeIssue[] {
  const parsed = ComposeFile.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      code: 'COMPOSE_INVALID',
      message: i.message,
    }));
  }
  const compose = parsed.data;
  const issues: ComposeIssue[] = [];
  const add = (path: string, code: ComposeIssue['code'], message: string) => issues.push({ path, code, message });
  const folderVars = new Set(manifest.folders.map((f) => folderVariable(f.key)));

  for (const [name, svc] of Object.entries(compose.services)) {
    const at = `services.${name}`;
    if (svc.build !== undefined)
      add(`${at}.build`, 'SERVICE_BUILD', 'Apps use published images; building is not supported');
    if (!svc.image) add(`${at}.image`, 'COMPOSE_INVALID', 'Every service needs an image');
    else if (options.requireDigest && !PINNED_IMAGE.test(svc.image)) {
      add(`${at}.image`, 'IMAGE_NOT_PINNED', 'Pin the image by tag and digest (repo:tag@sha256:…)');
    }
    if (svc.privileged) add(`${at}.privileged`, 'PRIVILEGED', 'Privileged containers are not allowed');
    if (svc.network_mode === 'host') add(`${at}.network_mode`, 'HOST_NETWORK', 'Host networking is not allowed');
    if (svc.pid === 'host') add(`${at}.pid`, 'HOST_PID', 'Sharing the host PID namespace is not allowed');
    if (svc.ipc === 'host') add(`${at}.ipc`, 'HOST_IPC', 'Sharing the host IPC namespace is not allowed');
    if (svc.container_name)
      add(`${at}.container_name`, 'CONTAINER_NAME', 'hlabs names containers; remove container_name');
    if (svc.env_file !== undefined)
      add(`${at}.env_file`, 'ENV_FILE', 'Use environment with ${VARIABLES} instead of env_file');

    svc.ports?.forEach((entry, i) => {
      if (!portMatches(entry, manifest, name)) {
        add(`${at}.ports[${i}]`, 'PORT_NOT_DECLARED', 'Only raw ports declared in the manifest may be published');
      }
    });

    svc.volumes?.forEach((entry, i) => {
      const path = `${at}.volumes[${i}]`;
      let source: string | null;
      let type: string;
      if (typeof entry === 'string') {
        source = parseShortVolume(entry).source;
        type = source === null ? 'volume' : /^[.~/$]/.test(source) ? 'bind' : 'volume';
      } else {
        source = entry.source ?? null;
        type = entry.type;
      }
      if (type === 'tmpfs') return;
      if (type === 'volume') {
        add(
          path,
          'NAMED_VOLUME',
          'Keep data under ${HLABS_APP_DATA} so it is backed up; named and anonymous volumes are not',
        );
        return;
      }
      if (!source) return add(path, 'BIND_MOUNT_NOT_ALLOWED', 'Bind mounts need a source');
      if (source.includes('..')) return add(path, 'BIND_MOUNT_NOT_ALLOWED', 'Paths may not contain ".."');
      if (DOCKER_SOCKETS.has(source)) {
        if (!manifest.permissions.dockerSocket) {
          add(path, 'DOCKER_SOCKET', 'Mounting the Docker socket needs permissions.dockerSocket: true');
        }
        return;
      }
      if (APP_DATA_SOURCE.test(source)) return;
      const folder = FOLDER_SOURCE.exec(source);
      if (folder) {
        if (!folderVars.has(folder[1]!))
          add(path, 'UNKNOWN_FOLDER', `${folder[1]} is not a folder declared in the manifest`);
        return;
      }
      add(path, 'BIND_MOUNT_NOT_ALLOWED', 'Use ${HLABS_APP_DATA}/<dir> or ${HLABS_FOLDER_<KEY>}; no other host paths');
    });
  }

  const services = new Set(Object.keys(compose.services));
  const needService = (service: string, path: string) => {
    if (!services.has(service))
      add(
        path,
        'MANIFEST_SERVICE_MISSING',
        `The manifest names service "${service}", which the compose file doesn't have`,
      );
  };
  needService(manifest.web.service, 'manifest.web.service');
  if (manifest.health) needService(manifest.health.service, 'manifest.health.service');
  manifest.backup.pause.forEach((s, i) => needService(s, `manifest.backup.pause[${i}]`));
  if (manifest.backup.preHook) needService(manifest.backup.preHook.service, 'manifest.backup.preHook.service');
  manifest.ports.forEach((p, i) => needService(p.service, `manifest.ports[${i}].service`));
  manifest.widgets.forEach((w, i) => needService(w.endpoint.service, `manifest.widgets[${i}].endpoint.service`));

  return issues;
}
