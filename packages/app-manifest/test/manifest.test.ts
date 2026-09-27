import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { AppManifest, folderVariable, hasRiskyPermissions } from '../src/manifest';

/** The example from docs/prd/06-app-manifest.md, including the optional schema-1 fields. */
const example = parse(`
schema: 1
id: immich
name: Immich
version: "1.135.3"
revision: 2
tagline: Back up every photo from your phone
description: |
  Self-hosted photo and video backup with albums, faces and search.
category: photos
developer: { name: Immich, url: https://immich.app }
source: https://github.com/immich-app/immich
license: AGPL-3.0
icon:
  logo: logo.svg
  gradient: ["#fb923c", "#c2410c"]
  fallback: images
platforms: [linux/arm64, linux/amd64]
tags: [apple-silicon, local-ai]
requirements:
  memory: 2048
  disk: 10240
web:
  service: immich-server
  port: 2283
  path: /
  auth: hlabs
health:
  service: immich-server
  http: /api/server/ping
  timeout: 180
env:
  - key: IMMICH_LOG_LEVEL
    label: Log level
    type: select
    options: [log, warn, error]
    default: log
  - key: DB_PASSWORD
    type: secret
    generate: true
    hidden: true
folders:
  - key: library
    label: Photo library
    description: Where your library is stored
    target: /usr/src/app/upload
    default: home:Photos
    mode: rw
    required: true
  - key: import
    label: Existing photos to import
    target: /mnt/import
    mode: ro
    required: false
ports:
  - { service: pihole, container: 53, protocol: udp, host: 53, label: DNS }
backup:
  pause: [immich-server, immich-machine-learning]
  preHook: { service: database, command: "pg_dumpall -U postgres > /backup/dump.sql" }
  exclude: [thumbs/, encoded-video/]
  beforeUpdate: true
dependsOn: []
permissions:
  network: lan
  gpu: false
  dockerSocket: false
releaseNotes: |
  - Faster face detection
ownLogin: true
widgets:
  - id: library
    name: Photo library
    template: stat
    endpoint: { service: immich-server, path: /api/server/statistics }
    refresh: 60
`);

describe('AppManifest (06)', () => {
  it('accepts the documented example and fills defaults', () => {
    const m = AppManifest.parse(example);
    expect(m.web).toEqual({ service: 'immich-server', port: 2283, path: '/', auth: 'hlabs', embed: false });
    expect(m.folders[1]).toMatchObject({ key: 'import', mode: 'ro', required: false });
    expect(m.env[0]).toMatchObject({ type: 'select', options: ['log', 'warn', 'error'] });
    expect(hasRiskyPermissions(m)).toBe(true);
  });

  it('defaults web.embed to false (D-038) and permissions.network to internet', () => {
    const { permissions: _p, ...rest } = example;
    const m = AppManifest.parse({ ...rest, ports: [] });
    expect(m.web.embed).toBe(false);
    expect(m.permissions).toEqual({ network: 'internet', gpu: false, dockerSocket: false });
    expect(hasRiskyPermissions(m)).toBe(false);
  });

  it.each([
    ['a bad id', { id: 'Immich!' }],
    ['an unknown category', { category: 'games' }],
    ['an unknown field', { colour: 'red' }],
    ['a select without options', { env: [{ key: 'X', label: 'X', type: 'select' }] }],
    ['a visible prompt without a label', { env: [{ key: 'X' }] }],
    ['two health checks', { health: { service: 'immich-server', http: '/', tcp: 80 } }],
    ['duplicate folder keys', { folders: [example.folders[0], example.folders[0]] }],
    ['a bad folder default', { folders: [{ ...example.folders[0], default: '/Users/me' }] }],
    ['a self dependency', { dependsOn: ['immich'] }],
    ['schema 2', { schema: 2 }],
  ])('rejects %s', (_name, patch) => {
    expect(AppManifest.safeParse({ ...example, ...patch }).success).toBe(false);
  });

  it('names folder variables', () => {
    expect(folderVariable('library')).toBe('HLABS_FOLDER_LIBRARY');
    expect(folderVariable('media-root')).toBe('HLABS_FOLDER_MEDIA_ROOT');
  });
});
