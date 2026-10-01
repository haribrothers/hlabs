// The store matrix on Linux (D-100) found n8n couldn't start: the folders its compose file mounts were created by
// Docker as root. hlabs makes them itself, as its own user, before the app starts.
import { describe, expect, it } from 'vitest';
import { appDataBindDirs } from '../src/apps/folders';

describe('app data folders the compose file mounts', () => {
  it('lists the folders under ${HLABS_APP_DATA}, short and long syntax, once each', () => {
    const compose = {
      services: {
        n8n: {
          image: 'n8n',
          volumes: ['${HLABS_APP_DATA}/data:/home/node/.n8n', '${HLABS_APP_DATA}/cache:/home/node/.cache:rw'],
        },
        db: {
          image: 'postgres',
          volumes: [
            { type: 'bind', source: '${HLABS_APP_DATA}/db', target: '/var/lib/postgresql/data' },
            '${HLABS_APP_DATA}/data:/also',
            '${HLABS_FOLDER_LIBRARY}:/photos',
            'named-volume:/x',
          ],
        },
        whole: { image: 'x', volumes: ['${HLABS_APP_DATA}:/data'] },
      },
    } as never;
    expect(appDataBindDirs(compose, '/app-data/n8n').sort()).toEqual([
      '/app-data/n8n',
      '/app-data/n8n/cache',
      '/app-data/n8n/data',
      '/app-data/n8n/db',
    ]);
  });

  it("never leaves the app's data folder", () => {
    const compose = { services: { x: { image: 'x', volumes: ['${HLABS_APP_DATA}/../escape:/x'] } } } as never;
    let dirs: string[] = [];
    try {
      dirs = appDataBindDirs(compose, '/app-data/x');
    } catch {
      // Refused outright is fine too.
    }
    for (const dir of dirs) expect(dir.startsWith('/app-data/x')).toBe(true);
  });
});
