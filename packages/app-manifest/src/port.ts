// The porting helper (US-STORE-25, D-148): a first draft of an app's hlabs files from the project's own compose file
// or from Runtipi's (GPL-3.0) or CasaOS's (Apache-2.0) definition. What it can't decide (which folder is the
// person's library, whether the app has its own login, how to describe it) it leaves as a value starting `TODO`,
// which `pnpm store:lint` refuses until someone resolves it. Umbrel's catalogue has no licence and is never read.
// No network here: the CLI fetches the files and asks the registry, then passes them in.
import { parseShortVolume } from './compose';
import { APP_CATEGORIES, folderVariable } from './manifest';
import { parseImageRef, pinned, type ImageManifest } from './registry';

export const TODO = 'TODO';

export type PortFrom =
  { kind: 'runtipi'; id: string } | { kind: 'casaos'; id: string } | { kind: 'compose'; url: string };

/** `runtipi:<id>`, `casaos:<Name>` or an https URL of a compose file. Refuses Umbrel's catalogue (D-148). */
export function parseFrom(from: string): PortFrom {
  if (/^umbrel:/i.test(from) || /getumbrel\/umbrel-apps|umbrel-apps/i.test(from)) {
    throw new Error(
      "Umbrel's app definitions have no licence, so hlabs doesn't copy them (D-148). Port from the project's own compose file, or Runtipi's or CasaOS's definition.",
    );
  }
  const m = /^(runtipi|casaos):([A-Za-z0-9._-]+)$/.exec(from);
  if (m) return m[1] === 'runtipi' ? { kind: 'runtipi', id: m[2]! } : { kind: 'casaos', id: m[2]! };
  if (/^https:\/\//.test(from)) {
    // A GitHub page for a file → its raw file.
    const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(from);
    return { kind: 'compose', url: gh ? `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}` : from };
  }
  throw new Error('Use --from runtipi:<id>, casaos:<Name> or the https URL of the project’s compose file');
}

/** Where the other stores keep their definitions, and their licences (06 · NOTICE). */
export const STORES = {
  runtipi: {
    name: 'the Runtipi app store',
    repo: 'runtipi/runtipi-appstore',
    branch: 'master',
    license: 'GPL-3.0',
    licenseName: 'GNU General Public License v3.0',
  },
  casaos: {
    name: 'the CasaOS app store',
    repo: 'IceWhaleTech/CasaOS-AppStore',
    branch: 'main',
    license: 'Apache-2.0',
    licenseName: 'Apache License 2.0',
  },
} as const;

/** What the CLI fetched, for one port. */
export interface PortInput {
  id: string;
  from: PortFrom;
  /** Runtipi: config.json; plus docker-compose.json (preferred) or docker-compose.yml. */
  runtipi?: { config: RuntipiConfig; dynamic?: RuntipiDynamic; compose?: Compose };
  /** CasaOS: its docker-compose.yml with x-casaos. */
  casaos?: Compose;
  /** The project's own compose file. */
  compose?: Compose;
  /** `service:port` for the web page, when the compose file can't say (upstream compose files). */
  web?: { service: string; port: number };
  /** The store's commit the definition was read at. */
  commit?: string;
  /** The project's licence (SPDX id), from its repository, when known. */
  license?: string | null;
  /** The logo's file name once downloaded (`logo.svg`, `logo.png`), or null. */
  logoFile?: string | null;
  /** Each image's pin and platforms, by the image as written in the source. */
  images: Record<string, ImageManifest | Error>;
}

export interface RuntipiConfig {
  name: string;
  id: string;
  port?: number;
  version?: string;
  categories?: string[];
  description?: string;
  short_desc?: string;
  author?: string;
  source?: string;
  website?: string;
  supported_architectures?: string[];
  form_fields?: Array<{
    type: string;
    label: string;
    hint?: string;
    required?: boolean;
    default?: string | number | boolean;
    options?: Array<{ label: string; value: string }>;
    env_variable: string;
  }>;
}

export interface RuntipiDynamic {
  services: Array<{
    name: string;
    image: string;
    isMain?: boolean;
    internalPort?: number | string;
    command?: string | string[];
    entrypoint?: string | string[];
    environment?: Array<{ key: string; value: string | number | boolean }> | Record<string, string>;
    volumes?: Array<{ hostPath: string; containerPath: string; readOnly?: boolean }>;
    addPorts?: Array<{ containerPort: number; hostPort: number; tcp?: boolean; udp?: boolean }>;
    dependsOn?: string[] | Record<string, unknown>;
    healthCheck?: {
      test: string | string[];
      interval?: string;
      timeout?: string;
      retries?: number;
      startPeriod?: string;
    };
    user?: string;
    devices?: string[];
    capAdd?: string[];
    shmSize?: string;
    hostname?: string;
    workingDir?: string;
    privileged?: boolean;
    networkMode?: string;
    stopGracePeriod?: string;
    ulimits?: Record<string, unknown>;
    sysctls?: Record<string, unknown>;
    extraHosts?: string[];
    readOnly?: boolean;
    securityOpt?: string[];
    tty?: boolean;
    stdinOpen?: boolean;
  }>;
}

type Service = Record<string, unknown> & { image?: string; ports?: unknown[]; volumes?: unknown[] };
export interface Compose {
  services: Record<string, Service>;
  volumes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PortDraft {
  /** The manifest, keys in hlabs's usual order. */
  manifest: Record<string, unknown>;
  compose: { services: Record<string, Service> };
  /** `NOTICE` for a Runtipi or CasaOS port. */
  notice: string | null;
  /** `| id | from | licence |` for store/ATTRIBUTION.md. */
  attribution: { id: string; from: string; license: string } | null;
  /** Every TODO left, as `path: text`, for the summary. */
  todos: string[];
}

const RUNTIPI_CATEGORIES: Record<string, (typeof APP_CATEGORIES)[number]> = {
  network: 'network',
  media: 'media',
  music: 'media',
  development: 'developer',
  automation: 'home',
  photography: 'photos',
  security: 'security',
  books: 'books',
  data: 'files',
  finance: 'finance',
  ai: 'ai',
};

/** Runtipi's categories, most specific first. */
const RUNTIPI_ORDER = [
  'photography',
  'books',
  'music',
  'media',
  'finance',
  'ai',
  'security',
  'network',
  'automation',
  'development',
  'data',
];
const rank = (c: string) => {
  const i = RUNTIPI_ORDER.indexOf(c.toLowerCase());
  return i < 0 ? RUNTIPI_ORDER.length : i;
};

/** CasaOS's free-text categories, by keyword. */
const CASAOS_CATEGORIES: Array<[RegExp, (typeof APP_CATEGORIES)[number]]> = [
  [/photo|gallery|image/i, 'photos'],
  [/media|video|music|download/i, 'media'],
  [/file|cloud|backup|sync|storage|document/i, 'files'],
  [/develop|code/i, 'developer'],
  [/home automation|smart home|iot/i, 'home'],
  [/network|dns|vpn|proxy/i, 'network'],
  [/security|password/i, 'security'],
  [/^ai$|llm|machine learning|artificial/i, 'ai'],
  [/finance|money|budget/i, 'finance'],
  [/book|read/i, 'books'],
  [/monitor|analytic/i, 'monitoring'],
  [/productiv|note|office/i, 'productivity'],
];

/** The variables Runtipi and CasaOS give their compose files, as hlabs names them (06 · Variables). */
const VARIABLES: Array<[RegExp, string]> = [
  [/\$\{APP_PROTOCOL(:-[a-z]+)?\}:\/\/\$\{APP_DOMAIN\}/g, '${HLABS_URL}'],
  [/\$\{APP_DOMAIN\}|\$\{APP_HOST\}/g, '${HLABS_HOSTNAME}'],
  [/\$\{APP_DATA_DIR\}\/data(?=\/|$)/g, '${HLABS_APP_DATA}'],
  [/\$\{APP_DATA_DIR\}/g, '${HLABS_APP_DATA}'],
  [/\/DATA\/AppData\/\$\{?AppID\}?(?=\/|$)/g, '${HLABS_APP_DATA}'],
  [/\$\{?AppID\}?/g, '${HLABS_APP_ID}'],
  [/\$(TZ|PUID|PGID)\b/g, '${$1}'],
];

/** Runtipi and CasaOS variables hlabs has no equivalent for: whoever ports the app decides. */
const UNKNOWN_VARIABLE =
  /\$\{(APP_PORT|APP_EXPOSED|LOCAL_DOMAIN|INTERNAL_IP|DNS_IP|NETWORK_INTERFACE|APP_PROTOCOL|ROOT_FOLDER_HOST)[^}]*\}/;

function translate(value: string): string {
  let v = value;
  for (const [re, to] of VARIABLES) v = v.replace(re, to);
  return v;
}

function todo(text: string): string {
  return `${TODO}: ${text}`;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z]+/, '') || 'data'
  );
}

/** Runtipi's dynamic compose → a compose file. */
function fromDynamic(d: RuntipiDynamic): { compose: Compose; main: string | null; webPort: number | null } {
  const services: Record<string, Service> = {};
  let main: string | null = null;
  let webPort: number | null = null;
  for (const s of d.services) {
    const svc: Service = { image: s.image };
    if (s.command !== undefined) svc.command = s.command;
    if (s.entrypoint !== undefined) svc.entrypoint = s.entrypoint;
    if (s.user) svc.user = s.user;
    if (s.hostname) svc.hostname = s.hostname;
    if (s.workingDir) svc.working_dir = s.workingDir;
    const env = Array.isArray(s.environment)
      ? Object.fromEntries(s.environment.map((e) => [e.key, String(e.value)]))
      : s.environment;
    if (env && Object.keys(env).length) svc.environment = env;
    if (s.volumes?.length) {
      svc.volumes = s.volumes.map((v) => `${v.hostPath}:${v.containerPath}${v.readOnly ? ':ro' : ''}`);
    }
    if (s.addPorts?.length) {
      svc.ports = s.addPorts.flatMap((p) => {
        const protos = [p.tcp !== false ? 'tcp' : null, p.udp ? 'udp' : null].filter(Boolean);
        return protos.map((proto) => `${p.hostPort}:${p.containerPort}/${proto}`);
      });
    }
    if (s.dependsOn) svc.depends_on = s.dependsOn;
    if (s.healthCheck) {
      const h = s.healthCheck;
      svc.healthcheck = {
        test: h.test,
        ...(h.interval ? { interval: h.interval } : {}),
        ...(h.timeout ? { timeout: h.timeout } : {}),
        ...(h.retries ? { retries: h.retries } : {}),
        ...(h.startPeriod ? { start_period: h.startPeriod } : {}),
      };
    }
    if (s.devices?.length) svc.devices = s.devices;
    if (s.capAdd?.length) svc.cap_add = s.capAdd;
    if (s.shmSize) svc.shm_size = s.shmSize;
    if (s.privileged) svc.privileged = true;
    if (s.networkMode) svc.network_mode = s.networkMode;
    if (s.stopGracePeriod) svc.stop_grace_period = s.stopGracePeriod;
    if (s.ulimits) svc.ulimits = s.ulimits;
    if (s.sysctls) svc.sysctls = s.sysctls;
    if (s.extraHosts?.length) svc.extra_hosts = s.extraHosts;
    if (s.readOnly) svc.read_only = true;
    if (s.securityOpt?.length) svc.security_opt = s.securityOpt;
    if (s.tty) svc.tty = true;
    if (s.stdinOpen) svc.stdin_open = true;
    services[s.name] = svc;
    if (s.isMain) {
      main = s.name;
      if (s.internalPort !== undefined) webPort = Number(s.internalPort);
    }
  }
  return { compose: { services }, main, webPort };
}

/** A compose port entry: its host and container port and protocol. */
function portOf(entry: unknown): { host: number | null; container: number; protocol: 'tcp' | 'udp' } | null {
  if (typeof entry === 'number') return { host: null, container: entry, protocol: 'tcp' };
  if (typeof entry === 'string') {
    const [ports, proto] = entry.split('/');
    const parts = ports!.split(':');
    const container = Number(parts.at(-1));
    const host = parts.length > 1 ? Number(parts.at(-2)) : null;
    if (!Number.isFinite(container)) return null;
    return { host: Number.isFinite(host) ? host : null, container, protocol: proto === 'udp' ? 'udp' : 'tcp' };
  }
  if (entry && typeof entry === 'object') {
    const e = entry as { target?: number | string; published?: number | string; protocol?: string };
    if (e.target === undefined) return null;
    return {
      host: e.published !== undefined ? Number(e.published) : null,
      container: Number(e.target),
      protocol: e.protocol === 'udp' ? 'udp' : 'tcp',
    };
  }
  return null;
}

function strings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => strings(v, fn)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strings(v, fn)])) as T;
  }
  return value;
}

/** Turns the source's definition into hlabs's files. */
export function portApp(input: PortInput): PortDraft {
  const todos: string[] = [];
  const mark = (path: string, text: string) => {
    todos.push(`${path}: ${text}`);
    return todo(text);
  };

  // 1 · The source's compose file and what it says about itself.
  let compose: Compose;
  let main: string | null = null;
  let webPort: number | null = null;
  let name: string;
  let tagline: string | null = null;
  let description: string | null = null;
  let categories: string[] = [];
  let developer: { name: string; url?: string } | null = null;
  let source: string | null = null;
  let version: string | null = null;
  let envPrompts: Record<string, unknown>[] = [];
  let hostPortOfWeb: number | null = null;

  if (input.from.kind === 'runtipi') {
    const rt = input.runtipi!;
    const c = rt.config;
    if (rt.dynamic) ({ compose, main, webPort } = fromDynamic(rt.dynamic));
    else {
      compose = structuredClone(rt.compose!);
      main = c.id in compose.services ? c.id : Object.keys(compose.services)[0]!;
      const portEntries = compose.services[main]!.ports ?? [];
      const appPort = portEntries.find((p) => typeof p === 'string' && p.includes('${APP_PORT}'));
      if (typeof appPort === 'string') webPort = Number(appPort.split(':').at(-1)!.split('/')[0]);
      compose.services[main]!.ports = portEntries.filter((p) => p !== appPort);
    }
    name = c.name;
    tagline = c.short_desc ?? null;
    description = c.description ?? null;
    categories = (c.categories ?? []).filter((x) => x !== 'featured');
    developer = c.author ? { name: c.author, ...(c.source ? { url: c.source } : {}) } : null;
    source = c.source ?? c.website ?? null;
    version = c.version ?? null;
    envPrompts = (c.form_fields ?? []).map((f) => {
      const random = f.type === 'random';
      const type =
        random || f.type === 'password'
          ? 'secret'
          : f.type === 'number'
            ? 'number'
            : f.type === 'boolean'
              ? 'boolean'
              : f.options?.length
                ? 'select'
                : 'string';
      return {
        key: f.env_variable,
        ...(random ? {} : { label: f.label }),
        ...(f.hint ? { description: f.hint } : {}),
        type,
        ...(f.options?.length ? { options: f.options.map((o) => o.value) } : {}),
        ...(f.default !== undefined ? { default: f.default } : {}),
        ...(random ? { generate: true, hidden: true } : {}),
        ...(f.required ? { required: true } : {}),
      };
    });
  } else if (input.from.kind === 'casaos') {
    compose = structuredClone(input.casaos!);
    const x = (compose['x-casaos'] ?? {}) as Record<string, unknown>;
    const en = (v: unknown) =>
      v && typeof v === 'object' && 'en_US' in (v as object)
        ? String((v as { en_US: unknown }).en_US).trim()
        : typeof v === 'string'
          ? v
          : null;
    main = typeof x.main === 'string' ? x.main : Object.keys(compose.services)[0]!;
    hostPortOfWeb = x.port_map !== undefined ? Number(x.port_map) : null;
    name = en(x.title) ?? input.id;
    tagline = en(x.tagline);
    description = en(x.description);
    categories = typeof x.category === 'string' ? [x.category] : [];
    developer =
      typeof x.developer === 'string'
        ? { name: x.developer, ...(typeof x.repo === 'string' ? { url: x.repo } : {}) }
        : null;
    source = typeof x.repo === 'string' ? x.repo : typeof x.website === 'string' ? x.website : null;
    version = typeof x.version === 'string' ? x.version : null;
    delete compose['x-casaos'];
    delete compose.name;
  } else {
    compose = structuredClone(input.compose!);
    if (input.web) {
      main = input.web.service;
      webPort = input.web.port;
    } else {
      const withPorts = Object.entries(compose.services).filter(([, s]) => s.ports?.length);
      if (withPorts.length === 1) {
        main = withPorts[0]![0];
        webPort = portOf(withPorts[0]![1].ports![0])?.container ?? null;
      }
    }
    const gh = /github\.com\/([^/]+)\/([^/]+)|githubusercontent\.com\/([^/]+)\/([^/]+)/.exec(input.from.url);
    if (gh) source = `https://github.com/${gh[1] ?? gh[3]}/${gh[2] ?? gh[4]}`;
    name = input.id.replace(/(^|-)([a-z])/g, (_, d: string, c: string) => `${d ? ' ' : ''}${c.toUpperCase()}`);
  }

  // 2 · The compose file under hlabs's rules (06 · Compose rules).
  const folders: Array<Record<string, unknown>> = [];
  const folderBySource = new Map<string, string>();
  const rawPorts: Array<Record<string, unknown>> = [];
  /** Each service's image platforms, or null when its image couldn't be looked up. */
  const servicePlatforms: Array<string[] | null> = [];
  let dockerSocket = false;
  let devices = false;
  const namedVolumes = new Set(Object.keys(compose.volumes ?? {}));

  for (const [svcName, original] of Object.entries(compose.services)) {
    const svc: Service = strings(original, translate);
    for (const k of ['container_name', 'restart', 'networks', 'labels', 'logging', 'deploy', 'x-casaos', 'env_file']) {
      delete svc[k];
    }
    if (svc.network_mode === 'bridge') delete svc.network_mode;
    if (Array.isArray(svc.devices) && svc.devices.length) {
      devices = true;
      todos.push(`services.${svcName}.devices: ${(svc.devices as unknown[]).join(', ')}; keep only what the app needs`);
    }

    // Volumes: app data stays, the person's folders become folder requests, named volumes move to app data.
    svc.volumes = (svc.volumes ?? []).map((entry) => {
      const long =
        entry && typeof entry === 'object'
          ? (entry as { type?: string; source?: string; target: string; read_only?: boolean })
          : null;
      let src: string | null;
      let target: string;
      let ro: boolean;
      if (long) {
        src = long.source ?? null;
        target = long.target;
        ro = !!long.read_only;
      } else {
        ({ source: src, target } = parseShortVolume(String(entry)));
        ro = /:ro$/.test(String(entry));
      }
      const suffix = ro ? ':ro' : '';
      if (src === null) return `\${HLABS_APP_DATA}/${slug(target)}:${target}${suffix}`;
      if (src.startsWith('${HLABS_APP_DATA}')) return `${src}:${target}${suffix}`;
      if (src === '/var/run/docker.sock' || src === '/run/docker.sock') {
        dockerSocket = true;
        return `${src}:${target}${suffix}`;
      }
      if (namedVolumes.has(src) || !/^[.~/$]/.test(src)) return `\${HLABS_APP_DATA}/${slug(src)}:${target}${suffix}`;
      if (/^\$\{ROOT_FOLDER_HOST\}|^\/DATA\//.test(src)) {
        // The person's own files (media, photos, downloads): which folder is theirs to choose.
        let key = folderBySource.get(src);
        if (!key) {
          key = slug(target.split('/').filter(Boolean).at(-1) ?? 'data');
          while (folders.some((f) => f.key === key)) key = `${key}-2`;
          folderBySource.set(src, key);
          folders.push({
            key,
            label: mark(
              `folders.${key}.label`,
              `what people call this folder, e.g. "Photos" (${svcName} mounts it at ${target}; the source used ${src})`,
            ),
            target,
            default: mark(`folders.${key}.default`, 'home:<dir>, shared:<dir> or appdata:<dir>'),
            mode: ro ? 'ro' : 'rw',
            required: true,
          });
        }
        return `\${${folderVariable(key)}}:${target}${suffix}`;
      }
      // Other host paths (devices' libraries, system folders): store:lint refuses them until someone decides.
      todos.push(
        `services.${svcName}.volumes: ${src} is a host path hlabs doesn't allow; remove it or make it a folder request`,
      );
      return `${src}:${target}${suffix}`;
    });
    if (!svc.volumes.length) delete svc.volumes;

    // Ports: hlabs publishes the web port itself; anything else is a raw port the manifest declares.
    const kept: string[] = [];
    for (const entry of svc.ports ?? []) {
      const p = portOf(entry);
      if (!p) continue;
      const isWeb =
        svcName === main &&
        ((webPort !== null && p.container === webPort) || (hostPortOfWeb !== null && p.host === hostPortOfWeb));
      if (isWeb) {
        if (webPort === null) webPort = p.container;
        continue;
      }
      const host = p.host ?? p.container;
      kept.push(`${host}:${p.container}/${p.protocol}`);
      rawPorts.push({
        service: svcName,
        container: p.container,
        protocol: p.protocol,
        host,
        label: mark(
          `ports.${svcName}.${p.container}`,
          `what port ${p.container}/${p.protocol} is for; remove it here and in the compose file if the app works without it`,
        ),
      });
    }
    if (kept.length) svc.ports = kept;
    else delete svc.ports;

    // Images: pinned by tag and multi-arch digest.
    const image = String(original.image ?? '');
    const pin = input.images[image];
    const ref = parseImageRef(image);
    if (!ref.tag || ref.tag === 'latest') {
      svc.image = mark(
        `services.${svcName}.image`,
        `pin ${ref.name} to a version tag (the source uses ${ref.tag ?? 'no tag'})`,
      );
    } else if (!pin || pin instanceof Error) {
      svc.image = mark(
        `services.${svcName}.image`,
        `pin ${image} by digest (${pin instanceof Error ? pin.message : 'not looked up'})`,
      );
    } else svc.image = ref.digest ? image : pinned(ref, pin.digest);
    servicePlatforms.push(pin && !(pin instanceof Error) ? pin.platforms : null);

    // Variables hlabs doesn't have.
    const left = JSON.stringify(svc).match(UNKNOWN_VARIABLE);
    if (left) {
      const marked = strings(svc, (s) =>
        UNKNOWN_VARIABLE.test(s)
          ? mark(`services.${svcName}`, `replace ${s.match(UNKNOWN_VARIABLE)![0]} (no hlabs equivalent) in "${s}"`)
          : s,
      );
      Object.assign(svc, marked);
    }
    compose.services[svcName] = svc;
  }
  delete compose.volumes;
  delete compose.networks;

  // 3 · The manifest.
  // Where every image runs (an image we couldn't look up leaves it to the person).
  const platforms = servicePlatforms.every((p) => p)
    ? ['linux/amd64', 'linux/arm64'].filter((p) => servicePlatforms.every((s) => s!.includes(p)))
    : null;

  const category = (() => {
    // Runtipi lists several; the most specific wins ("data, photography" is a photos app).
    const ordered = input.from.kind === 'casaos' ? categories : [...categories].sort((a, b) => rank(a) - rank(b));
    for (const c of ordered) {
      const hit =
        input.from.kind === 'casaos'
          ? CASAOS_CATEGORIES.find(([re]) => re.test(c))?.[1]
          : RUNTIPI_CATEGORIES[c.toLowerCase()];
      if (hit) return hit;
    }
    return mark(
      'category',
      `one of ${APP_CATEGORIES.join(', ')} (the source says ${categories.join(', ') || 'nothing'})`,
    );
  })();

  const cleanVersion = (v: string | null) => (v ? v.replace(/^v(?=\d)/, '') : null);
  const mainImage = main
    ? parseImageRef(String(input.casaos?.services[main]?.image ?? input.compose?.services[main]?.image ?? ''))
    : null;
  const theVersion =
    cleanVersion(version) ??
    (mainImage?.tag && mainImage.tag !== 'latest' ? cleanVersion(mainImage.tag) : null) ??
    mark('version', "the app's version, as its release tag says");

  const manifest: Record<string, unknown> = {
    schema: 1,
    id: input.id,
    name,
    version: theVersion,
    revision: 1,
    tagline:
      tagline && tagline.length <= 80
        ? tagline.replace(/\.$/, '')
        : mark(
            'tagline',
            `what it does for people, in at most 80 characters${tagline ? ` (the source says "${tagline}")` : ''}`,
          ),
    description: mark(
      'description',
      `describe it in hlabs's words: what it does, and whether it asks for an admin on the first visit${description ? `. The source says: ${description.replace(/\s+/g, ' ').slice(0, 600)}` : ''}`,
    ),
    category,
    developer: developer ?? { name: mark('developer.name', "the project's developer or organisation") },
    ...(source ? { source } : {}),
    license: input.license ?? mark('license', "the project's licence as an SPDX id, e.g. AGPL-3.0"),
    icon: {
      ...(input.logoFile
        ? { logo: input.logoFile }
        : { logo: mark('icon.logo', "the project's logo as a square SVG or PNG (≥ 256px) in this folder") }),
      gradient: ['#64748b', '#1e293b'],
      fallback: 'app-window',
    },
    platforms: platforms?.length ? platforms : mark('platforms', 'linux/amd64 and/or linux/arm64, from its images'),
    web: main
      ? {
          service: main,
          port: webPort ?? mark('web.port', `the container port ${main}'s web page listens on`),
          embed: true,
        }
      : {
          service: mark('web.service', 'the service with the web page'),
          port: mark('web.port', 'its container port'),
          embed: true,
        },
    ownLogin: mark(
      'ownLogin',
      'true if the app asks people to sign in itself (behind the hlabs login too), false if not',
    ),
    ...(envPrompts.length ? { env: envPrompts } : {}),
    ...(folders.length ? { folders } : {}),
    ...(rawPorts.length ? { ports: rawPorts } : {}),
    permissions: {
      network: 'internet',
      ...(devices
        ? {
            gpu: mark(
              'permissions.gpu',
              'the source passes devices (e.g. /dev/dri) to it: true if it needs the GPU; remove devices it doesn’t need',
            ),
          }
        : {}),
      ...(dockerSocket ? { dockerSocket: true } : {}),
    },
  };
  if (platforms && platforms.length === 1 && platforms[0] === 'linux/amd64') {
    todos.push('platforms: x86 only — its images have no linux/arm64 build (allowed, D-148)');
  }

  // 4 · Credit for a definition from another store (06, D-148).
  let notice: string | null = null;
  let attribution: PortDraft['attribution'] = null;
  if (input.from.kind !== 'compose') {
    const store = STORES[input.from.kind];
    const path = input.from.kind === 'runtipi' ? `apps/${input.from.id}` : `Apps/${input.from.id}`;
    notice = [
      `hlabs's files for ${name} were drafted from ${store.name}'s definition and changed to follow hlabs's app format`,
      `and compose rules (images pinned by digest, data under \${HLABS_APP_DATA}, folders the person chooses).`,
      '',
      `Source: https://github.com/${store.repo}/tree/${input.commit ?? store.branch}/${path}`,
      `Licence: ${store.licenseName} (${store.license}).`,
      '',
    ].join('\n');
    attribution = { id: input.id, from: store.name.replace(/^the /, ''), license: store.license };
  }

  return { manifest, compose: { services: compose.services }, notice, attribution, todos };
}

/** Adds an app's row to store/ATTRIBUTION.md's table (kept in id order), or makes the file. */
export function withAttribution(existing: string | null, row: { id: string; from: string; license: string }): string {
  const head = [
    '# Attribution',
    '',
    "Apps in this store whose hlabs files were drafted from another app store's definitions (D-148). Each also has a",
    '`NOTICE` file in its folder. Logos and images belong to their projects.',
    '',
    '| App | Drafted from | Licence |',
    '| --- | --- | --- |',
  ];
  const rows = new Map<string, string>();
  for (const line of (existing ?? '').split('\n')) {
    const m = /^\| ([a-z][a-z0-9-]*) \| (.+) \| (.+) \|$/.exec(line);
    if (m && m[1] !== 'App') rows.set(m[1]!, line);
  }
  rows.set(row.id, `| ${row.id} | ${row.from} | ${row.license} |`);
  return [...head, ...[...rows.keys()].sort().map((k) => rows.get(k)!), ''].join('\n');
}

/** The app ids listed in store/ATTRIBUTION.md. */
export function attributedApps(text: string): string[] {
  return [...text.matchAll(/^\| ([a-z][a-z0-9-]*) \| .+ \| .+ \|$/gm)].map((m) => m[1]!).filter((id) => id !== 'App');
}
