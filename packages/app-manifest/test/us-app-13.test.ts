// US-APP-13 · Environment variables, in the renderer: a variable added in App settings is set on the app's web service
// from the project's .env, once however often it is rendered.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadAppDir } from '../src/node';
import { renderApp, type RenderInput } from '../src/render';

const STORE = fileURLToPath(new URL('../../../store', import.meta.url));
const vw = loadAppDir(join(STORE, 'apps', 'vaultwarden'), { requireDigest: true });

function render(over: Partial<RenderInput> = {}) {
  return renderApp({
    manifest: vw.manifest!,
    compose: vw.compose!,
    webPort: 13003,
    appDataDir: '/data/app-data/vaultwarden',
    folders: {},
    hostname: 'vaultwarden.hlabs.local',
    url: 'https://vaultwarden.hlabs.local',
    tz: 'Europe/London',
    puid: 1000,
    pgid: 1000,
    env: { SIGNUPS_ALLOWED: 'false', ADMIN_TOKEN: 's3cret' },
    extraEnv: ['ADMIN_TOKEN'],
    ...over,
  });
}

describe('US-APP-13', () => {
  it('an added variable is set on the web service from the .env', () => {
    const out = render();
    const env = (parse(out.composeYaml) as { services: Record<string, { environment: Record<string, string> }> })
      .services.vaultwarden!.environment;
    expect(env.ADMIN_TOKEN).toBe('${ADMIN_TOKEN}');
    expect(env.SIGNUPS_ALLOWED).toBe('${SIGNUPS_ALLOWED}');
    expect(out.envFile).toContain("ADMIN_TOKEN='s3cret'");
    // Its value is never in the compose file.
    expect(out.composeYaml).not.toContain('s3cret');
  });

  it('rendering again gives the same file', () => {
    const once = render();
    expect(render({ compose: parse(once.composeYaml) }).composeYaml).toBe(once.composeYaml);
  });
});
