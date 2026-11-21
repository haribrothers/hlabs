// US-INST-23 · the ports the Linux installer found free are saved before the first start (`hlabsd --set-ports`, D-140).
import { getSetting, openDb } from '@hlabs/db';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setPorts } from '../src/install/set-ports';

const dirs: string[] = [];
const dataDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'us-inst-23-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('US-INST-23', () => {
  it('saves the web ports in a new database, and changes them in an existing one', () => {
    const dir = dataDir();
    expect(setPorts(dir, ['8443', '80'])).toEqual({ https: 8443, http: 80 });
    let db = openDb({ dataDir: dir });
    expect(getSetting(db, 'network').ports).toEqual({ https: 8443, http: 80 });
    db.$client.close();

    setPorts(dir, ['443', '8080']);
    db = openDb({ dataDir: dir });
    expect(getSetting(db, 'network')).toMatchObject({ ports: { https: 443, http: 8080 }, returnTo: null });
    db.$client.close();
  });

  it('refuses something that is not a port', () => {
    expect(() => setPorts(dataDir(), ['443'])).toThrow('"" is not a port');
    expect(() => setPorts(dataDir(), ['70000', '80'])).toThrow('"70000" is not a port');
  });
});
