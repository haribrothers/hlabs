// Image tags, digests and platforms from a container registry through the OCI distribution API, for the store's
// tools (the porting helper, US-STORE-25; the update bot, US-STORE-24). Anonymous pulls only: Docker Hub, GHCR,
// lscr.io, Quay and others that answer 401 with a Bearer challenge. The fetch is passed in, so tests never reach
// the network.

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface ImageRef {
  /** Registry host, e.g. `registry-1.docker.io` or `ghcr.io`. */
  registry: string;
  /** Repository path, e.g. `library/redis` or `immich-app/immich-server`. */
  repository: string;
  tag: string | null;
  digest: string | null;
  /** The name as written, without tag or digest (`redis`, `ghcr.io/immich-app/immich-server`). */
  name: string;
}

/** `redis:7`, `ghcr.io/o/r:v1@sha256:…`, `lscr.io/linuxserver/jellyfin`. */
export function parseImageRef(image: string): ImageRef {
  let rest = image.trim();
  let digest: string | null = null;
  const at = rest.indexOf('@');
  if (at >= 0) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  let tag: string | null = null;
  const colon = rest.lastIndexOf(':');
  if (colon > rest.lastIndexOf('/')) {
    tag = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
  }
  const name = rest;
  const parts = rest.split('/');
  let registry = 'registry-1.docker.io';
  if (parts.length > 1 && (parts[0]!.includes('.') || parts[0]!.includes(':') || parts[0] === 'localhost')) {
    registry = parts.shift()!;
  }
  if (registry === 'docker.io' || registry === 'index.docker.io') registry = 'registry-1.docker.io';
  if (registry === 'registry-1.docker.io' && parts.length === 1) parts.unshift('library');
  return { registry, repository: parts.join('/'), tag, digest, name };
}

export interface ImageManifest {
  /** The digest to pin: the multi-arch index's when there is one. */
  digest: string;
  /** `linux/amd64`, `linux/arm64`, … (attestations left out). */
  platforms: string[];
}

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

export class RegistryError extends Error {}

export class Registry {
  private readonly tokens = new Map<string, string>();

  constructor(private readonly fetch: Fetch) {}

  /** GET with the registry's anonymous token, asking for one when the registry challenges. */
  private async get(ref: ImageRef, path: string, accept?: string): Promise<Response> {
    const url = `https://${ref.registry}/v2/${ref.repository}/${path}`;
    const key = `${ref.registry}/${ref.repository}`;
    const headers = (): Record<string, string> => {
      const h: Record<string, string> = {};
      if (accept) h.accept = accept;
      const token = this.tokens.get(key);
      if (token) h.authorization = `Bearer ${token}`;
      return h;
    };
    let res = await this.fetch(url, { headers: headers() });
    if (res.status === 401) {
      const challenge = res.headers.get('www-authenticate') ?? '';
      const m = /^Bearer\s+(.*)$/i.exec(challenge);
      if (!m) throw new RegistryError(`${ref.name}: the registry wants a login`);
      const params = Object.fromEntries([...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1]!, x[2]!]));
      if (!params.realm) throw new RegistryError(`${ref.name}: no token realm in the challenge`);
      const q = new URLSearchParams();
      if (params.service) q.set('service', params.service);
      q.set('scope', params.scope ?? `repository:${ref.repository}:pull`);
      const t = await this.fetch(`${params.realm}?${q}`);
      if (!t.ok) throw new RegistryError(`${ref.name}: no anonymous token (${t.status})`);
      const body = (await t.json()) as { token?: string; access_token?: string };
      const token = body.token ?? body.access_token;
      if (!token) throw new RegistryError(`${ref.name}: the token answer had no token`);
      this.tokens.set(key, token);
      res = await this.fetch(url, { headers: headers() });
    }
    return res;
  }

  /** The digest to pin for `ref`'s tag (or digest), and the platforms it runs on. */
  async manifest(image: string | ImageRef): Promise<ImageManifest> {
    const ref = typeof image === 'string' ? parseImageRef(image) : image;
    const reference = ref.digest ?? ref.tag ?? 'latest';
    const res = await this.get(ref, `manifests/${reference}`, ACCEPT);
    if (res.status === 404) throw new RegistryError(`${ref.name}:${reference} doesn't exist`);
    if (!res.ok) throw new RegistryError(`${ref.name}:${reference}: the registry answered ${res.status}`);
    const text = await res.text();
    const digest = res.headers.get('docker-content-digest') ?? `sha256:${await sha256(text)}`;
    const body = JSON.parse(text) as {
      manifests?: Array<{ platform?: { os?: string; architecture?: string } }>;
      config?: { digest?: string };
    };
    let platforms: string[];
    if (body.manifests) {
      platforms = body.manifests.flatMap((m) =>
        m.platform?.os &&
        m.platform.os !== 'unknown' &&
        m.platform.architecture &&
        m.platform.architecture !== 'unknown'
          ? [`${m.platform.os}/${m.platform.architecture}`]
          : [],
      );
    } else if (body.config?.digest) {
      // One platform: it's in the image's config.
      const cfg = await this.get(ref, `blobs/${body.config.digest}`);
      const c = (await cfg.json()) as { os?: string; architecture?: string };
      platforms = c.os && c.architecture ? [`${c.os}/${c.architecture}`] : [];
    } else platforms = [];
    return { digest, platforms: [...new Set(platforms)].sort() };
  }

  /**
   * The repository's tags in the registry's order, following its pages up to `maxPages`. With `after` (a tag that
   * exists), the listing starts after that tag. Registries order tags differently: Docker Hub alphabetically, GHCR
   * in the order they were pushed, so on GHCR the tags after today's are the newer builds, which a repository with
   * thousands of `commit-…` tags would otherwise push past the page limit.
   */
  async tags(image: string | ImageRef, options: { after?: string; maxPages?: number } = {}): Promise<string[]> {
    const ref = typeof image === 'string' ? parseImageRef(image) : image;
    const tags: string[] = [];
    let path = `tags/list?n=1000${options.after ? `&last=${encodeURIComponent(options.after)}` : ''}`;
    for (let page = 0; page < (options.maxPages ?? 30) && path; page++) {
      const res = await this.get(ref, path);
      if (!res.ok) throw new RegistryError(`${ref.name}: couldn't list tags (${res.status})`);
      tags.push(...(((await res.json()) as { tags?: string[] | null }).tags ?? []));
      const link = res.headers.get('link');
      const next = link && /<([^>]+)>;\s*rel="next"/.exec(link)?.[1];
      path = next ? next.replace(/^\/v2\/[^?]*\/(tags\/list)/, '$1') : '';
    }
    return tags;
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `repo:tag@sha256:…` for a compose file, from a parsed ref and its digest. */
export function pinned(ref: ImageRef, digest: string): string {
  return `${ref.name}:${ref.tag ?? 'latest'}@${digest}`;
}
