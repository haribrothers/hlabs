import { readFileSync } from 'node:fs';

/** The product version (one version for everything, 11-testing-release §Versioning). */
export const VERSION: string =
  process.env.HLABS_VERSION ??
  (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
