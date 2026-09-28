// Settings › Engine & startup (10-system-settings.md). Sentence case, plain words.
export const engineCopy = {
  status: {
    running: 'Engine running',
    stopped: 'Engine stopped',
    starting: 'Starting…',
    missing: 'No engine',
  },
  containerEngine: 'Container engine',
  names: {
    orbstack: 'OrbStack',
    'docker-desktop': 'Docker Desktop',
    colima: 'Colima',
    'docker-engine': 'Docker Engine',
  },
  installedByHlabs: 'Installed by hlabs · open source',
  inUse: 'In use',
  inUseVersion: (version: string) => `In use · Docker ${version}`,
  stopped: 'Stopped',
  foundMac: 'Found on this Mac',
  foundComputer: 'Found on this computer',
  notInstalled: 'Not installed',
  switch: 'Switch…',
  restart: 'Restart engine',
} as const;
