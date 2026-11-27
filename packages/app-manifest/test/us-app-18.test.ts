// US-APP-18 · Network access, in the renderer (D-049, D-165): "Reach the internet" off puts the app's containers on
// internal networks and publishes its web port (and raw ports) through pinned socat sidecars on a normal bridge, so
// Caddy still reaches it; "Talk to other apps" off keeps the web service off the shared `hlabs` network. Rendering
// again gives the same project, and the store's compose files still pass the validator.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { PINNED_IMAGE, validateCompose } from '../src/compose';
import { AppManifest } from '../src/manifest';
import { loadAppDir } from '../src/node';
import {
  EDGE_NETWORK,
  FORWARD_IMAGE,
  FORWARD_SERVICE,
  HLABS_NETWORK,
  renderApp,
  type RenderInput,
} from '../src/render';

const STORE = fileURLToPath(new URL('../../../store', import.meta.url));
const immich = loadAppDir(join(STORE, 'apps', 'immich'), { requireDigest: true });

type Svc = {
  ports?: string[];
  networks?: unknown;
  image?: string;
  command?: string[];
  read_only?: boolean;
  cap_drop?: string[];
};
type Rendered = { services: Record<string, Svc>; networks: Record<string, Record<string, unknown>> };

function render(network?: RenderInput['network'], over: Partial<RenderInput> = {}) {
  const input: RenderInput = {
    manifest: immich.manifest!,
    compose: immich.compose!,
    webPort: 13001,
    appDataDir: '/data/app-data/immich',
    folders: { library: '/data/users/hari/Photos' },
    hostname: 'immich.hlabs.local',
    url: 'https://immich.hlabs.local',
    tz: 'Europe/London',
    puid: 1000,
    pgid: 1000,
    env: { DB_PASSWORD: 'x' },
    network,
    ...over,
  };
  const out = renderApp(input);
  return { out, compose: parse(out.composeYaml) as Rendered, input };
}

const networksOf = (svc: Svc) =>
  Array.isArray(svc.networks) ? (svc.networks as string[]) : Object.keys((svc.networks as object) ?? {});

describe('US-APP-18', () => {
  it('both on (the default): the web service publishes its port and joins the shared network; no sidecar', () => {
    const { compose } = render({ internet: true, apps: true });
    const web = compose.services['immich-server']!;
    expect(web.ports).toEqual(['127.0.0.1:13001:2283']);
    expect(networksOf(web)).toContain(HLABS_NETWORK);
    expect(compose.services[FORWARD_SERVICE]).toBeUndefined();
    expect(compose.networks.default).toEqual({});
    expect(compose.networks[EDGE_NETWORK]).toBeUndefined();
    // The same as rendering without saying.
    expect(render(undefined).out.composeYaml).toBe(render({ internet: true, apps: true }).out.composeYaml);
  });

  it('"Reach the internet" off: internal networks, and a pinned sidecar publishes the web port on loopback', () => {
    const { compose } = render({ internet: false, apps: true });
    expect(compose.networks.default).toEqual({ internal: true });
    expect(compose.networks[HLABS_NETWORK]).toEqual({ external: true, name: HLABS_NETWORK });
    expect(compose.networks[EDGE_NETWORK]).toEqual({});
    for (const [name, svc] of Object.entries(compose.services)) {
      if (name === FORWARD_SERVICE) continue;
      // No container of the app publishes a port or sits on a network with a way out.
      expect(svc.ports, name).toBeUndefined();
      expect(networksOf(svc), name).not.toContain(HLABS_NETWORK);
      expect(networksOf(svc), name).not.toContain(EDGE_NETWORK);
    }
    const sidecar = compose.services[FORWARD_SERVICE]!;
    expect(sidecar.image).toBe(FORWARD_IMAGE);
    expect(sidecar.ports).toEqual(['127.0.0.1:13001:2283']);
    // To the container by its name, never the service name the sidecar itself carries on the shared network.
    expect(sidecar.command).toEqual(['TCP-LISTEN:2283,fork,reuseaddr', 'TCP:hlabs-immich-immich-server-1:2283']);
    expect(sidecar.read_only).toBe(true);
    expect(sidecar.cap_drop).toEqual(['ALL']);
    // Other apps reach it by the web service's name, through the sidecar.
    expect(sidecar.networks).toEqual({
      default: {},
      [EDGE_NETWORK]: {},
      [HLABS_NETWORK]: { aliases: ['immich-server'] },
    });
  });

  it('the sidecar image is pinned by tag and digest', () => {
    expect(FORWARD_IMAGE).toMatch(PINNED_IMAGE);
  });

  it('"Talk to other apps" off: the web service leaves the shared network; its port stays published', () => {
    const { compose } = render({ internet: true, apps: false });
    for (const svc of Object.values(compose.services)) expect(networksOf(svc)).not.toContain(HLABS_NETWORK);
    expect(compose.services['immich-server']!.ports).toEqual(['127.0.0.1:13001:2283']);
    expect(compose.services[FORWARD_SERVICE]).toBeUndefined();
  });

  it('both off: internal networks and a sidecar that other apps cannot reach', () => {
    const { compose } = render({ internet: false, apps: false });
    expect(compose.services[FORWARD_SERVICE]!.networks).toEqual({ default: {}, [EDGE_NETWORK]: {} });
    for (const svc of Object.values(compose.services)) expect(networksOf(svc)).not.toContain(HLABS_NETWORK);
  });

  it("the app's own networks go internal too", () => {
    const compose = {
      ...immich.compose!,
      networks: { backend: {} },
      services: {
        ...immich.compose!.services,
        database: { ...immich.compose!.services.database!, networks: ['backend'] },
      },
    };
    const { compose: out } = render({ internet: false, apps: true }, { compose });
    expect(out.networks.backend).toEqual({ internal: true });
    // The sidecar joins them, so it reaches a service on any of them.
    expect(networksOf(out.services[FORWARD_SERVICE]!)).toContain('backend');
  });

  it('raw ports are forwarded too, each by its own sidecar', () => {
    const manifest = AppManifest.parse({
      ...immich.manifest!,
      ports: [{ service: 'immich-server', container: 53, protocol: 'udp', host: 53, label: 'DNS' }],
    });
    const { compose } = render({ internet: false, apps: true }, { manifest });
    expect(compose.services['immich-server']!.ports).toBeUndefined();
    const dns = compose.services[`${FORWARD_SERVICE}-udp-53`]!;
    expect(dns.ports).toEqual(['53:53/udp']);
    expect(dns.command).toEqual(['UDP-LISTEN:53,fork,reuseaddr', 'UDP:hlabs-immich-immich-server-1:53']);
  });

  it('rendering a rendered project again gives the same project, whichever way the switches go', () => {
    for (const network of [
      { internet: false, apps: true },
      { internet: true, apps: false },
      { internet: false, apps: false },
      { internet: true, apps: true },
    ]) {
      const once = render(network);
      const again = render(network, { compose: parse(once.out.composeYaml) });
      expect(again.out.composeYaml).toBe(once.out.composeYaml);
    }
    // Back on: what an earlier render added for "off" goes.
    const off = render({ internet: false, apps: false });
    const on = render({ internet: true, apps: true }, { compose: parse(off.out.composeYaml) });
    expect(on.out.composeYaml).toBe(render({ internet: true, apps: true }).out.composeYaml);
  });

  it('the source compose still passes the validator (the sidecar is added by hlabs, after it)', () => {
    expect(validateCompose(immich.compose!, immich.manifest!, { requireDigest: true })).toEqual([]);
  });
});
