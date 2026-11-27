// US-APP-17 · Folder access, in the renderer: folders people give an app are mounted on its web service at
// /mnt/hlabs/<name> (read only when chosen), a manifest folder made read only is mounted read only, and an optional
// folder the app no longer has is left out. Rendering again doesn't add them twice.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadAppDir } from '../src/node';
import { renderApp, type RenderInput } from '../src/render';

const STORE = fileURLToPath(new URL('../../../store', import.meta.url));
const shelf = loadAppDir(join(STORE, 'apps', 'audiobookshelf'), { requireDigest: true });

type Rendered = { services: Record<string, { volumes?: unknown[] }> };

function render(over: Partial<RenderInput> = {}) {
  const out = renderApp({
    manifest: shelf.manifest!,
    compose: shelf.compose!,
    webPort: 13002,
    appDataDir: '/data/app-data/audiobookshelf',
    folders: { audiobooks: '/data/shared/Audiobooks', podcasts: '/data/shared/Podcasts' },
    hostname: 'audiobookshelf.hlabs.local',
    url: 'https://audiobookshelf.hlabs.local',
    tz: 'Europe/London',
    puid: 1000,
    pgid: 1000,
    env: {},
    ...over,
  });
  return { out, volumes: (parse(out.composeYaml) as Rendered).services.audiobookshelf!.volumes! };
}

describe('US-APP-17', () => {
  it('a folder given in App settings is mounted at /mnt/hlabs/<name>, read only when chosen', () => {
    const { volumes } = render({
      extraMounts: [
        { target: '/mnt/hlabs/Documents', hostPath: '/data/users/hari/Documents', mode: 'ro' },
        { target: '/mnt/hlabs/Backups', hostPath: '/Volumes/NAS/Backups', mode: 'rw' },
      ],
    });
    expect(volumes).toContainEqual({
      type: 'bind',
      source: '/data/users/hari/Documents',
      target: '/mnt/hlabs/Documents',
      read_only: true,
    });
    expect(volumes).toContainEqual({ type: 'bind', source: '/Volumes/NAS/Backups', target: '/mnt/hlabs/Backups' });
  });

  it('a "$" in a folder path is kept literally', () => {
    const { volumes } = render({
      extraMounts: [{ target: '/mnt/hlabs/Money', hostPath: '/data/$money', mode: 'rw' }],
    });
    expect(volumes).toContainEqual({ type: 'bind', source: '/data/$$money', target: '/mnt/hlabs/Money' });
  });

  it('a manifest folder made read only is mounted read only', () => {
    const { volumes } = render({ folderModes: { podcasts: 'ro' } });
    expect(volumes).toContain('${HLABS_FOLDER_PODCASTS}:/podcasts:ro');
    expect(volumes).toContain('${HLABS_FOLDER_AUDIOBOOKS}:/audiobooks');
  });

  it('an optional folder the app was not given is left out; a required one must be there', () => {
    const { volumes, out } = render({ folders: { audiobooks: '/data/shared/Audiobooks' } });
    expect(volumes.some((v) => String(v).includes('/podcasts'))).toBe(false);
    expect(out.env.HLABS_FOLDER_PODCASTS).toBeUndefined();
    expect(() => render({ folders: {} })).toThrow(/audiobooks/);
  });

  it('rendering again does not add the folders twice', () => {
    const extraMounts = [
      { target: '/mnt/hlabs/Documents', hostPath: '/data/users/hari/Documents', mode: 'ro' as const },
    ];
    const once = render({ extraMounts });
    const again = render({ extraMounts, compose: parse(once.out.composeYaml) });
    expect(again.out.composeYaml).toBe(once.out.composeYaml);
    // A folder taken away goes.
    const removed = render({ compose: parse(once.out.composeYaml) });
    expect(removed.out.composeYaml).toBe(render().out.composeYaml);
  });
});
