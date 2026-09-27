// What hlabs downloads to run Colima on a Mac with no container engine (D-057). Versions and SHA-256
// checksums are pinned here; a download that doesn't match is refused. Colima and Lima checksums are the
// ones their releases publish; docker's static builds publish none, so theirs were taken from the official
// download.docker.com files when they were pinned.
export type MacArch = 'arm64' | 'x64';

export interface Artifact {
  name: 'colima' | 'lima' | 'docker';
  version: string;
  url: string;
  sha256: string;
  /** A single binary, or a .tar.gz to unpack. */
  format: 'binary' | 'tar.gz';
}

export const COLIMA_VERSION = '0.10.3';
export const LIMA_VERSION = '2.2.0';
export const DOCKER_CLI_VERSION = '29.8.1';

export const ENGINE_DOWNLOADS: Record<MacArch, Artifact[]> = {
  arm64: [
    {
      name: 'colima',
      version: COLIMA_VERSION,
      url: `https://github.com/abiosoft/colima/releases/download/v${COLIMA_VERSION}/colima-Darwin-arm64`,
      sha256: '980ad8bf61a4ca370243f4cb41401a61276dcd2c2502bee7b9b86f9250169f34',
      format: 'binary',
    },
    {
      name: 'lima',
      version: LIMA_VERSION,
      url: `https://github.com/lima-vm/lima/releases/download/v${LIMA_VERSION}/lima-${LIMA_VERSION}-Darwin-arm64.tar.gz`,
      sha256: 'bbdef91774885a0d05f7b048c4eb89ae2bcf3a0c252ae7ca7934e63df76d93c3',
      format: 'tar.gz',
    },
    {
      name: 'docker',
      version: DOCKER_CLI_VERSION,
      url: `https://download.docker.com/mac/static/stable/aarch64/docker-${DOCKER_CLI_VERSION}.tgz`,
      sha256: '5a8f5604d7673202b2af925229d15eb4bbb86f7f542e4ac8cd7aa3f14cfa0f8b',
      format: 'tar.gz',
    },
  ],
  x64: [
    {
      name: 'colima',
      version: COLIMA_VERSION,
      url: `https://github.com/abiosoft/colima/releases/download/v${COLIMA_VERSION}/colima-Darwin-x86_64`,
      sha256: '3082737fe8a98afda11cba7d9a20b6e56fe80c6153464beda04bec630758770b',
      format: 'binary',
    },
    {
      name: 'lima',
      version: LIMA_VERSION,
      url: `https://github.com/lima-vm/lima/releases/download/v${LIMA_VERSION}/lima-${LIMA_VERSION}-Darwin-x86_64.tar.gz`,
      sha256: '0d6f99c19f6e4bc3c92730c4c29d929e6927f0cb0a0ba1a84383367135a8ff31',
      format: 'tar.gz',
    },
    {
      name: 'docker',
      version: DOCKER_CLI_VERSION,
      url: `https://download.docker.com/mac/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz`,
      sha256: 'de42b6bb38d0ea08333cdddc18b054d61d4c9f003b3616ae55d85ccea72c47c9',
      format: 'tar.gz',
    },
  ],
};
